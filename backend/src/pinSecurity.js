import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const PIN_PATTERN = /^\d{4}$/;
const HASH_PREFIX = 'scrypt';

export function normalizePin(rawPin) {
  const pin = String(rawPin ?? '').trim();
  return PIN_PATTERN.test(pin) ? pin : null;
}

export function isLegacyPlainPin(storedPin) {
  return typeof storedPin === 'string' && PIN_PATTERN.test(storedPin);
}

export function isHashedPin(storedPin) {
  return typeof storedPin === 'string' && storedPin.startsWith(`${HASH_PREFIX}$`);
}

export function hashPin(rawPin) {
  const pin = normalizePin(rawPin);
  if (!pin) {
    throw new Error('El PIN debe tener exactamente 4 digitos numericos.');
  }

  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pin, salt, 64).toString('hex');
  return `${HASH_PREFIX}$${salt}$${hash}`;
}

export function verifyPin(rawPin, storedPin) {
  const pin = normalizePin(rawPin);
  if (!pin || !storedPin) {
    return false;
  }

  if (isLegacyPlainPin(storedPin)) {
    return storedPin === pin;
  }

  if (!isHashedPin(storedPin)) {
    return false;
  }

  const [, salt, hash] = storedPin.split('$');
  if (!salt || !hash) {
    return false;
  }

  const expectedHash = Buffer.from(hash, 'hex');
  const actualHash = scryptSync(pin, salt, expectedHash.length);
  return expectedHash.length === actualHash.length && timingSafeEqual(expectedHash, actualHash);
}

export async function findUserByPin(prisma, rawPin, options = {}) {
  const pin = normalizePin(rawPin);
  if (!pin) {
    return null;
  }

  const where = options.excludeUserId ? { id: { not: options.excludeUserId } } : undefined;
  const users = await prisma.user.findMany({
    where,
    select: { id: true, nombre: true, rol: true, pin_acceso: true },
  });

  return users.find((user) => verifyPin(pin, user.pin_acceso)) ?? null;
}

export async function migrateLegacyPins(prisma) {
  const legacyUsers = await prisma.user.findMany({
    where: {},
    select: { id: true, pin_acceso: true },
  });

  const updates = legacyUsers
    .filter((user) => isLegacyPlainPin(user.pin_acceso))
    .map((user) =>
      prisma.user.update({
        where: { id: user.id },
        data: { pin_acceso: hashPin(user.pin_acceso) },
      })
    );

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }

  return updates.length;
}
