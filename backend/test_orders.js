import { PrismaClient } from './node_modules/@prisma/client/index.js';
const prisma = new PrismaClient();
async function run() {
  const orders = await prisma.order.findMany({ where: { estado: 'CERRADO' } });
  console.log("CERRADO:", orders.length);
  orders.forEach(o => console.log(`- ID: ${o.id}, Creada: ${o.fecha_creacion}`));
  await prisma.$disconnect();
}
run();
