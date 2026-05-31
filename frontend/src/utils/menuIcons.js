export function getCategoryIcon(name) {
  const value = String(name ?? '').toLowerCase();

  if (value.includes('bebida') || value.includes('jugo') || value.includes('licor') || value.includes('refresco')) return '🍹';
  if (value.includes('entrada') || value.includes('picad') || value.includes('snack')) return '🍟';
  if (value.includes('fuerte') || value.includes('plato') || value.includes('carne') || value.includes('principal')) return '🥩';
  if (value.includes('postre') || value.includes('dulce') || value.includes('helado')) return '🍰';
  if (value.includes('sopa') || value.includes('caldo')) return '🥣';
  if (value.includes('ensalada') || value.includes('vegan') || value.includes('salud') || value.includes('verde')) return '🥗';
  if (value.includes('pizza') || value.includes('italia')) return '🍕';
  if (value.includes('hamburguesa') || value.includes('fast') || value.includes('rapida')) return '🍔';
  if (value.includes('mar') || value.includes('pescado') || value.includes('camaron')) return '🍤';
  if (value.includes('cafe') || value.includes('bebidas calientes')) return '☕';

  return '🍽️';
}
