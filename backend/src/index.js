import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import prisma from './prismaClient.js';

import { generateToken } from './authMiddleware.js';
import { findUserByPin, migrateLegacyPins, normalizePin } from './pinSecurity.js';
import { hashPin } from './pinSecurity.js';

// RUTAS
import userRoutes from './routes/userRoutes.js';
import menuRoutes from './routes/menuRoutes.js';
import tableRoutes from './routes/tableRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import reportRoutes from './routes/reportRoutes.js';

dotenv.config();

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET no esta configurado en .env');
}

const app = express();
app.use(cors());
app.use(express.json());

/* =========================
   ROUTES API
========================= */
app.use('/api/users', userRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reports', reportRoutes);

/* =========================
   HEALTH CHECK
========================= */
app.get('/ping', (req, res) => {
  res.send('OK PING');
});

/* =========================
   LOGIN
========================= */
app.post('/api/auth/login', async (req, res) => {
  try {
    const pin = normalizePin(req.body?.pin);

    if (!pin) {
      return res.status(400).json({ error: 'PIN requerido de 4 digitos' });
    }

    const user = await findUserByPin(prisma, pin);

    if (!user) {
      return res.status(401).json({ error: 'PIN incorrecto o usuario no existe' });
    }

    const token = generateToken(user);

    return res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        rol: user.rol
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Error del servidor' });
  }
});

/* =========================
   SEED (CREAR USUARIOS)
========================= */
app.get('/dev/seed', async (req, res) => {
  try {
    await prisma.user.createMany({
      data: [
        {
          nombre: "Admin Principal",
          rol: "ADMIN",
          pin_acceso: hashPin("1234"),
        },
        {
          nombre: "Caja 1",
          rol: "CAJERO",
          pin_acceso: hashPin("5678"),
        },
        {
          nombre: "Mesero 1",
          rol: "MESERO",
          pin_acceso: hashPin("0000"),
        }
      ],
      skipDuplicates: true
    });

    res.json({ ok: true, message: "Usuarios creados" });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/* =========================
   DEBUG USERS
========================= */
app.get('/dev/debug-users', async (req, res) => {
  try {
    const users = await prisma.user.findMany();
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await migrateLegacyPins(prisma);

    app.listen(PORT, () => {
      console.log(`Servidor corriendo en puerto ${PORT}`);
    });

  } catch (err) {
    console.error('Error iniciando servidor:', err);
    process.exit(1);
  }
}

startServer();