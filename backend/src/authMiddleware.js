import jwt from 'jsonwebtoken';

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET no esta configurado.');
  }

  return secret;
}

export const generateToken = (user) => {
  return jwt.sign({ id: user.id, rol: user.rol }, getJwtSecret(), { expiresIn: '12h' });
};

export const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
  }

  try {
    const verified = jwt.verify(token, getJwtSecret());
    req.user = verified;
    return next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Token invalido o expirado.' });
    }

    console.error('JWT configuration error:', err);
    return res.status(500).json({ error: 'Configuracion de autenticacion incompleta.' });
  }
};

export const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No tienes permisos para esta accion.' });
    }

    return next();
  };
};
