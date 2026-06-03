import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import prisma from './prismaClient.js';
import { generateToken } from './authMiddleware.js';
import { findUserByPin, migrateLegacyPins, normalizePin } from './pinSecurity.js';
import { hashPin } from './pinSecurity.js';

// TODAS LAS RUTAS PRIMERO
app.use('/api/users', userRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reports', reportRoutes);

// LOGIN
app.post('/api/auth/login', async (req, res) => {
  try {
    const { pin } = req.body;
    const user = await findUserByPin(pin);
    if (!user) {
      return res.status(401).json({ error: 'Invalid PIN' });
    }
    const token = generateToken(user);
    res.json({ ok: true, token, user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// 👇 AQUÍ EL SEED (ANTES DE START)
app.get('/dev/seed', async (req, res) => {
  try {
    const admin = await prisma.user.upsert({
      where: { id: 1 },
      update: {},
      create: {
        nombre: "Admin Principal",
        rol: "ADMIN",
        pin_acceso: hashPin("1234"),
      },
    });

    const cajero = await prisma.user.upsert({
      where: { id: 2 },
      update: {},
      create: {
        nombre: "Caja 1",
        rol: "CAJERO",
        pin_acceso: hashPin("5678"),
      },
    });

    const mesero = await prisma.user.upsert({
      where: { id: 3 },
      update: {},
      create: {
        nombre: "Mesero 1",
        rol: "MESERO",
        pin_acceso: hashPin("0000"),
      },
    });

    res.json({ ok: true, admin, cajero, mesero });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// 👇 SOLO AL FINAL
startServer();