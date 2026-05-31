import express from 'express';
import prisma from '../prismaClient.js';
import { verifyToken, requireRole } from '../authMiddleware.js';
import { getOrCreateActiveShift } from '../utils/shiftHelper.js';

const router = express.Router();

// 1. Tomar o Añadir Productos a una Orden (Comandas)
router.post('/', verifyToken, async (req, res) => {
  const { tipo_pedido, id_mesa, datos_cliente, items } = req.body;
  // items array of object: { id_producto, cantidad, notas_preparacion }
  
  if (!items || items.length === 0) return res.status(400).json({ error: 'La orden no tiene productos' });

  try {
    let aditionalTotal = 0;
    const orderItemsData = [];
    
    for (const item of items) {
      const product = await prisma.product.findUnique({ where: { id: parseInt(item.id_producto) } });
      if (!product) continue;
      
      const itemTotal = product.precio * item.cantidad;
      aditionalTotal += itemTotal;
      
      orderItemsData.push({
        id_producto: product.id,
        cantidad: item.cantidad,
        precio_unitario: product.precio,
        notas_preparacion: item.notas_preparacion || ''
      });
    }

    // Si la mesa es local, checar si ya tiene cuenta abierta
    if ((tipo_pedido === 'LOCAL' || !tipo_pedido) && id_mesa) {
      const existingOrder = await prisma.order.findFirst({
        where: { id_mesa: parseInt(id_mesa), estado: { notIn: ['CERRADO', 'CANCELADO'] } }
      });

      if (existingOrder) {
        // AÑADIR A LA ORDEN EXISTENTE
        const updatedOrder = await prisma.order.update({
          where: { id: existingOrder.id },
          data: {
            total: existingOrder.total + aditionalTotal,
            items: { create: orderItemsData }
          },
          include: { items: true }
        });
        
        // Retornar al mesero su ticket fusionado
        return res.json({ message: 'Añadido a orden existente', order: updatedOrder });
      }
    }

    // SI NO EXISTE CUENTA, SE CREA UNA NUEVA
    const order = await prisma.order.create({
      data: {
        tipo_pedido: tipo_pedido || 'LOCAL',
        id_mesa: id_mesa ? parseInt(id_mesa) : null,
        id_mesero: req.user.id,
        datos_cliente: datos_cliente ? JSON.stringify(datos_cliente) : null,
        estado: 'ABIERTO',
        total: aditionalTotal,
        items: {
          create: orderItemsData
        }
      },
      include: { items: true }
    });

    // Actualizar colorcito de mesa en frontend
    if (order.id_mesa && order.tipo_pedido === 'LOCAL') {
      await prisma.table.update({
        where: { id: order.id_mesa },
        data: { estado: 'OCUPADA' }
      });
    }

    res.json({ message: 'Nueva orden creada', order });
  } catch (error) {
    console.error("Order API Error:", error);
    res.status(500).json({ error: 'Error al procesar la comanda' });
  }
});
// r listado de pedidos por estado
router.get('/', verifyToken, async (req, res) => {
  try {
    const estado = typeof req.query.estado === 'string' ? req.query.estado.trim().toUpperCase() : undefined;
    const where = {
      estado: { notIn: ['CERRADO', 'CANCELADO'] }
    };

    if (estado) {
      where.estado = estado;
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: { fecha_creacion: 'asc' },
      include: { items: { include: { producto: true } } }
    });
    res.json(orders);
  } catch (e) {
    console.error('Order list error:', e);
    res.status(500).json({ error: 'Error al buscar pedidos' });
  }
});

// 3. Consultar cuenta de mesa abierta (Cajero)
router.get('/mesa/:id', verifyToken, async (req, res) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id_mesa: parseInt(req.params.id), estado: { notIn: ['CERRADO', 'CANCELADO'] } },
      include: { items: { include: { producto: true } }, mesero: { select: { nombre: true } } }
    });
    if (!order) return res.status(404).json({ error: 'No hay cuenta abierta para esta mesa' });
    
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Error al buscar la cuenta' });
  }
});


// 4. Obtener listado de pedidos a Domicilio (Delivery)

// 3. Obtener listado de pedidos a Domicilio (Delivery)
router.get('/delivery', verifyToken, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { tipo_pedido: 'DOMICILIO', estado: { notIn: ['CERRADO', 'CANCELADO'] } },
      orderBy: { fecha_creacion: 'asc' },
      include: { items: { include: { producto: true } } }
    });
    res.json(orders);
  } catch (e) {
    res.status(500).json({ error: 'Error al buscar deliveries' });
  }
});

// 4. Cambiar estado del pedido
router.patch('/:id/status', verifyToken, async (req, res) => {
  try {
    const order = await prisma.order.update({
      where: { id: parseInt(req.params.id) },
      data: { estado: req.body.estado }
    });
    res.json(order);
  } catch(e) {
    res.status(500).json({ error: 'Error actualizando estado' });
  }
});

// 5. Cerrar/Cobrar Orden (Cajero)
router.post('/:id/pay', verifyToken, requireRole(['ADMIN', 'CAJERO']), async (req, res) => {
  const { metodo_pago, monto_pagado, referencia } = req.body;
  
  try {
    const order = await prisma.order.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!order || order.estado === 'CERRADO') return res.status(400).json({ error: 'Orden no válida' });

    const activeShift = await getOrCreateActiveShift(req.user.id);

    await prisma.$transaction([
      prisma.payment.create({
        data: {
          id_orden: order.id,
          id_cajero: req.user.id,
          id_turno: activeShift.id,
          metodo_pago,
          referencia: referencia || null,
          monto_pagado: parseFloat(monto_pagado)
        }
      }),
      prisma.order.update({
        where: { id: order.id },
        data: { estado: 'CERRADO' }
      })
    ]);

    // Libera mesa
    if (order.id_mesa && order.tipo_pedido === 'LOCAL') {
      await prisma.table.update({
        where: { id: order.id_mesa },
        data: { estado: 'LIBRE' }
      });
    }

    res.json({ message: 'Cobro procesado correctamente y mesa liberada' });
  } catch (e) {
    console.error("PAYMENT ERROR:", e);
    res.status(500).json({ error: e.message || 'Error procesando el pago' });
  }
});

// 6. Anular un plato específico (Cajero)
router.post('/:id/void-item/:itemId', verifyToken, requireRole(['ADMIN', 'CAJERO']), async (req, res) => {
  const { motivo, cantidad } = req.body;
  
  if (!motivo) return res.status(400).json({ error: 'El motivo es requerido' });

  try {
    const orderId = parseInt(req.params.id);
    const itemId = parseInt(req.params.itemId);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.estado === 'CERRADO' || order.estado === 'CANCELADO') {
      return res.status(400).json({ error: 'La orden no es válida o está cerrada' });
    }

    const item = await prisma.orderItem.findUnique({ where: { id: itemId }, include: { producto: true } });
    if (!item || item.id_orden !== order.id) {
      return res.status(400).json({ error: 'El plato no pertenece a esta orden' });
    }

    const cantidadAnular = cantidad ? parseInt(cantidad) : item.cantidad;
    if (cantidadAnular > item.cantidad || cantidadAnular <= 0) {
      return res.status(400).json({ error: 'Cantidad a anular inválida' });
    }

    const montoDeducido = item.precio_unitario * cantidadAnular;
    const activeShift = await getOrCreateActiveShift(req.user.id);

    await prisma.$transaction(async (tx) => {
      // Registrar la anulación
      await tx.voidRecord.create({
        data: {
          id_cajero: req.user.id,
          id_turno: activeShift.id,
          tipo: 'PRODUCTO',
          id_referencia: item.id,
          descripcion: `${cantidadAnular} x ${item.producto.nombre}`,
          motivo: motivo.trim()
        }
      });

      // Reducir el total de la orden
      await tx.order.update({
        where: { id: order.id },
        data: { total: Math.max(0, order.total - montoDeducido) }
      });

      // Eliminar o actualizar la cantidad del ítem
      if (cantidadAnular === item.cantidad) {
        await tx.orderItem.delete({ where: { id: item.id } });
      } else {
        await tx.orderItem.update({
          where: { id: item.id },
          data: { cantidad: item.cantidad - cantidadAnular }
        });
      }
    });

    res.json({ message: 'Plato anulado correctamente' });
  } catch (error) {
    console.error("VOID ITEM ERROR:", error);
    res.status(500).json({ error: 'Error interno al anular el plato' });
  }
});

// 7. Anular una orden completa (Cajero)
router.post('/:id/void', verifyToken, requireRole(['ADMIN', 'CAJERO']), async (req, res) => {
  const { motivo } = req.body;
  if (!motivo) return res.status(400).json({ error: 'El motivo es requerido' });

  try {
    const orderId = parseInt(req.params.id);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    
    if (!order || order.estado === 'CERRADO' || order.estado === 'CANCELADO') {
      return res.status(400).json({ error: 'La orden no es válida o ya está cerrada' });
    }

    const activeShift = await getOrCreateActiveShift(req.user.id);

    await prisma.$transaction(async (tx) => {
      // Registrar anulación
      await tx.voidRecord.create({
        data: {
          id_cajero: req.user.id,
          id_turno: activeShift.id,
          tipo: 'ORDEN',
          id_referencia: order.id,
          descripcion: `Orden #${order.id} - Total: $${order.total.toFixed(2)}`,
          motivo: motivo.trim()
        }
      });

      // Cancelar la orden
      await tx.order.update({
        where: { id: order.id },
        data: { estado: 'CANCELADO', total: 0 }
      });

      // Liberar la mesa si es local
      if (order.id_mesa && order.tipo_pedido === 'LOCAL') {
        await tx.table.update({
          where: { id: order.id_mesa },
          data: { estado: 'LIBRE' }
        });
      }
    });

    res.json({ message: 'Orden anulada correctamente' });
  } catch (error) {
    console.error("VOID ORDER ERROR:", error);
    res.status(500).json({ error: 'Error interno al anular la orden' });
  }
});
export default router; 
