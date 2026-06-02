import { PrismaClient } from '@prisma/client';
import { hashPin } from '../src/pinSecurity.js';

const prisma = new PrismaClient();

async function upsertSeedUser({ nombre, pin, rol }) {
  const existingUser = await prisma.user.findFirst({
    where: { nombre }
  });

  if (existingUser) {
    return prisma.user.update({
      where: { id: existingUser.id },
      data: {
        nombre,
        rol,
        pin_acceso: hashPin(pin),
      },
    });
  }

  return prisma.user.create({
    data: {
      nombre,
      pin_acceso: hashPin(pin),
      rol,
    },
  });
}

async function main() {
  console.log('Sembrando datos base...');

  const admin = await upsertSeedUser({
    nombre: 'Admin Principal',
    pin: '1234',
    rol: 'ADMIN',
  });

  const cajero = await upsertSeedUser({
    nombre: 'Caja 1',
    pin: '5678',
    rol: 'CAJERO',
  });

  const mesero = await upsertSeedUser({
    nombre: 'Mesero 1',
    pin: '0000',
    rol: 'MESERO',
  });

  console.log('Usuarios base creados correctamente');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });