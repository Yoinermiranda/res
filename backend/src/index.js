import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import prisma from './prismaClient.js';
import { generateToken } from './authMiddleware.js';
import { findUserByPin, migrateLegacyPins, normalizePin } from './pinSecurity.js';

import userRoutes from './routes/userRoutes.js';
import menuRoutes from './routes/menuRoutes.js';
import tableRoutes from './routes/tableRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import reportRoutes from './routes/reportRoutes.js';

dotenv.config();

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET no esta configurado. Agregalo al archivo .env antes de iniciar el servidor.');
}

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/users', userRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reports', reportRoutes);

app.get('/', (req, res) => {
  res.send('API POS Restaurante OK');
});

app.post('/api/auth/login', async (req, res) => {
  const pin = normalizePin(req.body?.pin);
  if (!pin) {
    return res.status(400).json({ error: 'PIN requerido de 4 digitos.' });
  }

  try {
    const user = await findUserByPin(prisma, pin);
    if (!user) {
      return res.status(401).json({ error: 'PIN incorrecto o usuario no existe' });
    }

    const token = generateToken(user);
    return res.json({
      message: 'Login exitoso',
      token,
      user: { id: user.id, nombre: user.nombre, rol: user.rol },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Error del servidor' });
  }
});

const PORT = process.env.PORT || 5000;

async function startServer() {
  const migratedPins = await migrateLegacyPins(prisma);
  if (migratedPins > 0) {
    console.log(`Se migraron ${migratedPins} PIN(es) legacy a formato seguro.`);
  }

  app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('No se pudo iniciar el servidor:', error);
  process.exit(1);
});
