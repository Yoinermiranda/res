import express from 'express';
import prisma from '../prismaClient.js';
import { verifyToken, requireRole } from '../authMiddleware.js';
import { getOrCreateActiveShift } from '../utils/shiftHelper.js';

const router = express.Router();

router.get('/sales', verifyToken, requireRole(['ADMIN', 'CAJERO']), async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const payments = await prisma.payment.findMany({
      where: { fecha_pago: { gte: startOfToday } },
      include: {
        cajero: { select: { nombre: true } },
        orden: { select: { id: true, tipo_pedido: true } },
      },
      orderBy: { fecha_pago: 'desc' },
    });

    const totalVentas = payments.reduce((acc, current) => acc + current.monto_pagado, 0);

    const tickets = await prisma.order.findMany({
      where: { estado: 'CERRADO' },
      orderBy: { fecha_creacion: 'desc' },
      take: 200,
      include: {
        mesero: { select: { nombre: true } },
        mesa: { select: { numero_mesa: true } },
        pagos: true,
        items: { include: { producto: { select: { nombre: true, imagen: true } } } },
      },
    });

    const ticketsHoy = await prisma.order.findMany({
      where: {
        estado: 'CERRADO',
        pagos: { some: { fecha_pago: { gte: startOfToday } } },
      },
      orderBy: { fecha_creacion: 'desc' },
      include: {
        items: { include: { producto: { select: { nombre: true, imagen: true } } } },
      },
    });

    const ticketPromedio = ticketsHoy.length > 0 ? totalVentas / ticketsHoy.length : 0;

    const productCounts = {};
    for (const ticket of ticketsHoy) {
      for (const item of ticket.items) {
        if (!productCounts[item.id_producto]) {
          productCounts[item.id_producto] = {
            id: item.id_producto,
            nombre: item.producto?.nombre || 'Desconocido',
            imagen: item.producto?.imagen || null,
            cantidad: 0,
          };
        }

        productCounts[item.id_producto].cantidad += item.cantidad;
      }
    }

    const topProducts = Object.values(productCounts)
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5);

    const voidRecords = await prisma.voidRecord.findMany({
      orderBy: { fecha: 'desc' },
      take: 50,
      include: { cajero: { select: { nombre: true } } },
    });

    return res.json({
      resumenDiario: {
        operaciones: ticketsHoy.length,
        totalFacturado: totalVentas,
        ticketPromedio,
      },
      topProducts,
      tickets,
      pagos: payments,
      voidRecords,
    });
  } catch (err) {
    console.error('Sales report error:', err);
    return res.status(500).json({ error: 'Error al obtener reportes' });
  }
});

// Arqueo del turno actual para el cajero
router.get('/current-shift', verifyToken, requireRole(['ADMIN', 'CAJERO']), async (req, res) => {
  try {
    const shift = await getOrCreateActiveShift(req.user.id);
    
    // Obtener pagos de este turno
    const payments = await prisma.payment.findMany({
      where: { id_turno: shift.id },
      include: {
        cajero: { select: { nombre: true } },
        orden: { select: { id: true, tipo_pedido: true } },
      },
      orderBy: { fecha_pago: 'desc' },
    });

    const totalVentas = payments.reduce((acc, current) => acc + current.monto_pagado, 0);

    // Obtener anulaciones de este turno
    const voidRecords = await prisma.voidRecord.findMany({
      where: { id_turno: shift.id },
      orderBy: { fecha: 'desc' },
      include: { cajero: { select: { nombre: true } } },
    });

    // Obtener movimientos de caja manuales
    const cashMovements = await prisma.cashMovement.findMany({
      where: { id_turno: shift.id },
      orderBy: { fecha: 'desc' },
    });

    return res.json({
      resumenDiario: {
        operaciones: payments.length,
        totalFacturado: totalVentas,
        ticketPromedio: payments.length > 0 ? totalVentas / payments.length : 0,
      },
      pagos: payments,
      voidRecords,
      cashMovements,
      shiftId: shift.id,
      fondoInicial: shift.fondo_inicial,
      fechaApertura: shift.fecha_apertura
    });
  } catch (err) {
    console.error('Current shift error:', err);
    return res.status(500).json({ error: 'Error al obtener turno actual' });
  }
});

// Verificar si tiene turno abierto (Cajero/Admin)
router.get('/check-open-shift', verifyToken, requireRole(['ADMIN', 'CAJERO']), async (req, res) => {
  try {
    const shift = await prisma.shift.findFirst({
      where: { id_usuario: req.user.id, fecha_cierre: null }
    });
    return res.json({ hasOpenShift: !!shift, shiftId: shift?.id, fondo_inicial: shift?.fondo_inicial });
  } catch (error) {
    return res.status(500).json({ error: 'Error al verificar turno.' });
  }
});

// Apertura de Turno (Base Fija)
router.post('/open-shift', verifyToken, requireRole(['ADMIN', 'CAJERO']), async (req, res) => {
  try {
    const { fondo_inicial } = req.body;
    const existing = await prisma.shift.findFirst({
      where: { id_usuario: req.user.id, fecha_cierre: null }
    });
    if (existing) return res.status(400).json({ error: 'Ya tienes un turno abierto.' });

    const shift = await prisma.shift.create({
      data: {
        id_usuario: req.user.id,
        fondo_inicial: parseFloat(fondo_inicial || 0)
      }
    });
    return res.json({ message: 'Turno abierto exitosamente.', shift });
  } catch (err) {
    console.error('Open shift error:', err);
    return res.status(500).json({ error: 'Error al abrir turno.' });
  }
});

// Registrar Ingreso o Egreso Manual
router.post('/cash-movement', verifyToken, requireRole(['ADMIN', 'CAJERO']), async (req, res) => {
  try {
    const { tipo, monto, motivo } = req.body;
    if (!['INGRESO', 'EGRESO'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido.' });

    const shift = await prisma.shift.findFirst({
      where: { id_usuario: req.user.id, fecha_cierre: null }
    });

    if (!shift) return res.status(400).json({ error: 'Debes iniciar turno (Abrir Caja) antes de registrar movimientos.' });

    const movement = await prisma.cashMovement.create({
      data: {
        id_turno: shift.id,
        tipo,
        monto: parseFloat(monto),
        motivo
      }
    });

    return res.json({ message: 'Movimiento registrado.', movement });
  } catch (error) {
    console.error('Cash movement error:', error);
    return res.status(500).json({ error: 'Error al registrar movimiento de caja.' });
  }
});

// Cerrar turno (Arqueo Z Ciego)
router.post('/cierre', verifyToken, requireRole(['ADMIN', 'CAJERO']), async (req, res) => {
  try {
    const { efectivo_contado } = req.body; // Lo que el cajero dice tener físicamente

    // 1. Encontrar el turno activo
    const shift = await prisma.shift.findFirst({
      where: { id_usuario: req.user.id, fecha_cierre: null }
    });

    if (!shift) {
      return res.status(400).json({ error: 'No tienes un turno abierto.' });
    }

    // 2. Calcular los totales de tarjetas/transferencia/efectivo
    const payments = await prisma.payment.findMany({ where: { id_turno: shift.id } });
    
    let tEfectivo = 0, tTarjeta = 0, tTransferencia = 0;
    payments.forEach(p => {
      if (p.metodo_pago === 'EFECTIVO') tEfectivo += p.monto_pagado;
      if (p.metodo_pago === 'TARJETA') tTarjeta += p.monto_pagado;
      if (p.metodo_pago === 'TRANSFERENCIA') tTransferencia += p.monto_pagado;
    });

    // 3. Recopilar ingresos y egresos de efectivo
    const movimientos = await prisma.cashMovement.findMany({ where: { id_turno: shift.id } });
    let totalEgresos = 0, totalIngresos = 0;
    movimientos.forEach(m => {
      if (m.tipo === 'EGRESO') totalEgresos += m.monto;
      if (m.tipo === 'INGRESO') totalIngresos += m.monto;
    });

    // 4. Mates para Faltante/Sobrante (Cierre Ciego)
    let descuadre = 0;
    let counted = null;
    if (efectivo_contado !== undefined && efectivo_contado !== null) {
       counted = parseFloat(efectivo_contado);
       const efectivoEsperado = shift.fondo_inicial + tEfectivo + totalIngresos - totalEgresos;
       descuadre = counted - efectivoEsperado;
    }

    // 5. Actualizar la fecha de cierre y totales
    await prisma.shift.update({
      where: { id: shift.id },
      data: {
        fecha_cierre: new Date(),
        total_efectivo: tEfectivo,
        total_tarjeta: tTarjeta,
        total_transferencia: tTransferencia,
        efectivo_contado: counted,
        descuadre: descuadre
      }
    });

    return res.json({ message: 'Arqueo de caja Z generado correctamente. Turno cerrado.', descuadre });
  } catch (error) {
    console.error('Cierre Z error:', error);
    return res.status(500).json({ error: 'Error al cerrar turno.' });
  }
});

// Lista de todos los turnos cerrados (Administrador)
router.get('/shifts', verifyToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const shifts = await prisma.shift.findMany({
      orderBy: { fecha_apertura: 'desc' },
      take: 100,
      include: {
        usuario: { select: { nombre: true, rol: true } },
        pagos: {
          include: { 
             orden: { select: { id: true, tipo_pedido: true, items: { include: { producto: true } } } } 
          }
        },
        voids: true,
        movimientos: true,
      }
    });
    
    res.json(shifts);
  } catch(e) {
    console.error('Shifts history error:', e);
    res.status(500).json({ error: 'Error al obtener el historial de turnos.' });
  }
});

export default router;
