const jwt = require('jsonwebtoken');
const db = require('../database');

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT id, name, email, role, avatar FROM users WHERE id = ? AND is_active = 1').get(payload.id);
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Se requiere rol de administrador' });
  }
  next();
}

function companyAccessMiddleware(req, res, next) {
  if (req.user.role === 'admin') return next();

  const companyId = req.params.companyId || req.params.id || req.body.company_id;
  if (!companyId) return next();

  const access = db.prepare(`
    SELECT role FROM company_users
    WHERE company_id = ? AND user_id = ?
  `).get(companyId, req.user.id);

  if (!access) {
    return res.status(403).json({ error: 'Sin acceso a esta empresa' });
  }

  req.companyRole = access.role;
  next();
}

module.exports = { authMiddleware, adminMiddleware, companyAccessMiddleware };
