import express from 'express';
import prisma from '../prismaClient.js';
import { verifyToken, requireRole } from '../authMiddleware.js';
import { findUserByPin, hashPin, normalizePin } from '../pinSecurity.js';

const router = express.Router();

router.get('/', verifyToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, nombre: true, rol: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'asc' },
    });
    return res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    return res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

router.post('/', verifyToken, requireRole(['ADMIN']), async (req, res) => {
  const { nombre, pin_acceso, rol } = req.body;
  const normalizedPin = normalizePin(pin_acceso);

  if (!nombre || !rol || !normalizedPin) {
    return res.status(400).json({ error: 'Nombre, rol y PIN numerico de 4 digitos son obligatorios.' });
  }

  try {
    const duplicatedUser = await findUserByPin(prisma, normalizedPin);
    if (duplicatedUser) {
      return res.status(400).json({ error: 'Ese PIN ya esta asignado a otro usuario.' });
    }

    const newUser = await prisma.user.create({
      data: { nombre: nombre.trim(), pin_acceso: hashPin(normalizedPin), rol },
    });

    return res.json({ message: 'Usuario creado', user: { id: newUser.id, nombre: newUser.nombre, rol: newUser.rol } });
  } catch (error) {
    console.error('Create user error:', error);
    return res.status(400).json({ error: 'Error al crear usuario.' });
  }
});

router.delete('/:id', verifyToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    await prisma.user.delete({ where: { id: parseInt(req.params.id, 10) } });
    return res.json({ message: 'Usuario eliminado' });
  } catch (error) {
    console.error('Delete user error:', error);
    return res.status(500).json({ error: 'Error al eliminar usuario' });
  }
});

router.put('/:id', verifyToken, requireRole(['ADMIN']), async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { nombre, pin_acceso, rol } = req.body;
  const data = {};

  if (typeof nombre === 'string' && nombre.trim()) {
    data.nombre = nombre.trim();
  }

  if (typeof rol === 'string' && rol.trim()) {
    data.rol = rol;
  }

  try {
    if (pin_acceso !== undefined && pin_acceso !== '') {
      const normalizedPin = normalizePin(pin_acceso);
      if (!normalizedPin) {
        return res.status(400).json({ error: 'El nuevo PIN debe tener 4 digitos numericos.' });
      }

      const duplicatedUser = await findUserByPin(prisma, normalizedPin, { excludeUserId: userId });
      if (duplicatedUser) {
        return res.status(400).json({ error: 'Ese PIN ya esta asignado a otro usuario.' });
      }

      data.pin_acceso = hashPin(normalizedPin);
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No se enviaron cambios para actualizar.' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, nombre: true, rol: true, createdAt: true, updatedAt: true },
    });

    return res.json(updatedUser);
  } catch (error) {
    console.error('Update user error:', error);
    return res.status(400).json({ error: 'Error al actualizar usuario' });
  }
});

export default router;
