import express from 'express';
import prisma from '../prismaClient.js';
import { verifyToken, requireRole } from '../authMiddleware.js';

const router = express.Router();

// --- CATEGORIAS ---
router.get('/categories', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({ include: { products: true } });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener categorías' });
  }
});

router.post('/categories', verifyToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const newCategory = await prisma.category.create({ data: { nombre: req.body.nombre } });
    res.json(newCategory);
  } catch (error) {
    res.status(400).json({ error: 'Error al crear categoría' });
  }
});

router.put('/categories/:id', verifyToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const updated = await prisma.category.update({
      where: { id: parseInt(req.params.id) },
      data: { nombre: req.body.nombre }
    });
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: 'Error al actualizar categoría' });
  }
});

router.delete('/categories/:id', verifyToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    await prisma.category.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: 'Categoría eliminada.' });
  } catch (error) {
    res.status(400).json({ error: 'No puedes eliminar una categoría con productos asociados.' });
  }
});

// --- PRODUCTOS ---
router.get('/products', async (req, res) => {
  try {
    const products = await prisma.product.findMany({ 
      where: { archivado: false },
      include: { categoria: true } 
    });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

router.post('/products', verifyToken, requireRole(['ADMIN']), async (req, res) => {
  const { nombre, precio, id_categoria, imagen } = req.body;
  try {
    const newProduct = await prisma.product.create({
      data: { nombre, precio: parseFloat(precio), id_categoria: parseInt(id_categoria), imagen }
    });
    res.json(newProduct);
  } catch (error) {
    res.status(400).json({ error: 'Error al crear producto' });
  }
});

router.put('/products/:id', verifyToken, requireRole(['ADMIN']), async (req, res) => {
  const { nombre, precio, id_categoria, imagen, disponible } = req.body;
  try {
    const updated = await prisma.product.update({
      where: { id: parseInt(req.params.id) },
      data: { 
        ...(nombre && { nombre }),
        ...(precio && { precio: parseFloat(precio) }),
        ...(id_categoria && { id_categoria: parseInt(id_categoria) }),
        ...(imagen !== undefined && { imagen }),
        ...(disponible !== undefined && { disponible })
      }
    });
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: 'Error al actualizar producto' });
  }
});

router.delete('/products/:id', verifyToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    await prisma.product.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: 'Producto eliminado de la base de datos.' });
  } catch (error) {
    // Si falla por integridad relacional (ya se vendió antes y está en un OrderItem), lo ocultamos:
    try {
      await prisma.product.update({ 
         where: { id: parseInt(req.params.id) }, 
         data: { archivado: true } 
      });
      res.json({ message: 'Producto archivado/oculto (tiene historial de ventas).' });
    } catch (e) {
      res.status(400).json({ error: 'No se pudo eliminar ni archivar el producto.' });
    }
  }
});

export default router;
