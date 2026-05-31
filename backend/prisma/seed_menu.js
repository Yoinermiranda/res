import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Creando Menú y Mesas de prueba...');

  // Limpiar antes si se desea re-ejecutar
  await prisma.product.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.table.deleteMany({});

  const catBebidas = await prisma.category.create({ data: { nombre: 'Bebidas Refrescantes' } });
  const catPlatos = await prisma.category.create({ data: { nombre: 'Platos Principales' } });
  const catPostres = await prisma.category.create({ data: { nombre: 'Postres' } });

  await prisma.product.createMany({
    data: [
      { nombre: 'Limonada Frappé', precio: 5.50, id_categoria: catBebidas.id, imagen: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800' },
      { nombre: 'Cerveza Fría', precio: 4.00, id_categoria: catBebidas.id, imagen: 'https://images.unsplash.com/photo-1542316496-039cfffa6da9?w=800' },
      
      { nombre: 'Cheeseburger Doble', precio: 12.99, id_categoria: catPlatos.id, imagen: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800' },
      { nombre: 'Pizza a la Leña', precio: 16.50, id_categoria: catPlatos.id, imagen: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800' },
      { nombre: 'Sushi Roll Atún', precio: 14.50, id_categoria: catPlatos.id, imagen: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=800' },
      { nombre: 'Alitas BBQ x10', precio: 10.99, id_categoria: catPlatos.id, imagen: 'https://images.unsplash.com/photo-1569691899455-8e46a2edfc62?w=800' },
      
      { nombre: 'Volcán de Chocolate', precio: 6.50, id_categoria: catPostres.id, imagen: 'https://images.unsplash.com/photo-1624353365286-3f8d62daad51?w=800' },
      { nombre: 'Cheesecake Fresa', precio: 5.50, id_categoria: catPostres.id, imagen: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=800' },
    ]
  });

  await prisma.table.createMany({
    data: [
      { numero_mesa: 1, capacidad: 2, estado: 'LIBRE' },
      { numero_mesa: 2, capacidad: 4, estado: 'LIBRE' },
      { numero_mesa: 3, capacidad: 4, estado: 'LIBRE' },
      { numero_mesa: 4, capacidad: 6, estado: 'LIBRE' },
      { numero_mesa: 5, capacidad: 2, estado: 'LIBRE' },
      { numero_mesa: 6, capacidad: 8, estado: 'LIBRE' },
      { numero_mesa: 7, capacidad: 4, estado: 'LIBRE' },
      { numero_mesa: 8, capacidad: 10, estado: 'LIBRE' },
    ]
  });

  console.log('¡Menú y Mesas creadas correctamente!');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
