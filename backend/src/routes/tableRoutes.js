import express from 'express';
import prisma from '../prismaClient.js';
import { verifyToken, requireRole } from '../authMiddleware.js';

const router = express.Router();

const TABLE_STATES = ['LIBRE', 'OCUPADA', 'POR_PAGAR', 'COBRANDO'];
const TABLE_STATE_PERMISSIONS = {
  ADMIN: TABLE_STATES,
  CAJERO: ['LIBRE', 'OCUPADA', 'COBRANDO'],
  MESERO: ['OCUPADA', 'POR_PAGAR'],
};

function canChangeTableToState(role, state) {
  return (TABLE_STATE_PERMISSIONS[role] || []).includes(state);
}

router.get('/', async (req, res) => {
  try {
    const tables = await prisma.table.findMany({
      orderBy: { numero_mesa: 'asc' },
    });
    return res.json(tables);
  } catch (error) {
    console.error('Get tables error:', error);
    return res.status(500).json({ error: 'Error al obtener mesas' });
  }
});

router.post('/', verifyToken, requireRole(['ADMIN']), async (req, res) => {
  const { numero_mesa, capacidad } = req.body;
  try {
    const table = await prisma.table.create({
      data: {
        numero_mesa: parseInt(numero_mesa, 10),
        capacidad: parseInt(capacidad, 10),
      },
    });
    return res.json(table);
  } catch (error) {
    console.error('Create table error:', error);
    return res.status(400).json({ error: 'Error al crear mesa' });
  }
});

router.patch('/:id/status', verifyToken, requireRole(['ADMIN', 'CAJERO', 'MESERO']), async (req, res) => {
  const { estado } = req.body;
  const normalizedState = typeof estado === 'string' ? estado.trim().toUpperCase() : '';

  if (!TABLE_STATES.includes(normalizedState)) {
    return res.status(400).json({ error: 'Estado de mesa invalido.' });
  }

  if (!canChangeTableToState(req.user.rol, normalizedState)) {
    return res.status(403).json({ error: 'No tienes permisos para aplicar ese estado de mesa.' });
  }

  try {
    const table = await prisma.table.update({
      where: { id: parseInt(req.params.id, 10) },
      data: { estado: normalizedState },
    });
    return res.json(table);
  } catch (error) {
    console.error('Update table status error:', error);
    return res.status(500).json({ error: 'Error al actualizar estado de mesa' });
  }
});

router.put('/:id', verifyToken, requireRole(['ADMIN']), async (req, res) => {
  const { numero_mesa, capacidad } = req.body;
  try {
    const table = await prisma.table.update({
      where: { id: parseInt(req.params.id, 10) },
      data: {
        ...(numero_mesa && { numero_mesa: parseInt(numero_mesa, 10) }),
        ...(capacidad && { capacidad: parseInt(capacidad, 10) }),
      },
    });
    return res.json(table);
  } catch (error) {
    console.error('Update table error:', error);
    return res.status(400).json({ error: 'Error al actualizar mesa' });
  }
});

router.delete('/:id', verifyToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const tableId = parseInt(req.params.id, 10);
    const tableInfo = await prisma.table.findUnique({ where: { id: tableId } });
    if (tableInfo && tableInfo.estado !== 'LIBRE') {
      return res.status(400).json({ error: 'No se puede eliminar una mesa ocupada.' });
    }

    await prisma.order.updateMany({
      where: { id_mesa: tableId },
      data: { id_mesa: null },
    });

    await prisma.table.delete({ where: { id: tableId } });
    return res.json({ message: 'Mesa eliminada correctamente' });
  } catch (error) {
    console.error('Delete table error:', error);
    return res.status(500).json({ error: 'Error al eliminar mesa' });
  }
});


export default router;

