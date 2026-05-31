import prisma from '../prismaClient.js';

export const getOrCreateActiveShift = async (id_cajero) => {
  const shift = await prisma.shift.findFirst({
    where: { id_usuario: id_cajero, fecha_cierre: null }
  });
  
  if (!shift) {
    throw new Error('Debe abrir la caja (iniciar turno) antes de realizar operaciones.');
  }
  
  return shift;
};
