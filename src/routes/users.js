const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// Get all users (admin only)
router.get('/', adminMiddleware, (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.avatar, u.is_active, u.created_at,
      (SELECT COUNT(*) FROM company_users cu WHERE cu.user_id = u.id) as company_count
    FROM users u
    ORDER BY u.name ASC
  `).all();
  res.json(users);
});

// Get user by id
router.get('/:id', (req, res) => {
  const user = db.prepare(`
    SELECT id, name, email, role, avatar, is_active, created_at
    FROM users WHERE id = ?
  `).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(user);
});

// Create user (admin only)
router.post('/', adminMiddleware, (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) return res.status(400).json({ error: 'Ya existe un usuario con ese email' });

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(`
    INSERT INTO users (name, email, password_hash, role)
    VALUES (?, ?, ?, ?)
  `).run(name, email.toLowerCase().trim(), hash, role || 'user');

  const user = db.prepare('SELECT id, name, email, role, avatar, is_active, created_at FROM users WHERE id = ?')
    .get(result.lastInsertRowid);
  res.status(201).json(user);
});

// Update user (admin only)
router.put('/:id', adminMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  const { name, email, role, is_active, password } = req.body;

  if (email && email !== user.email) {
    const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?')
      .get(email.toLowerCase().trim(), req.params.id);
    if (existing) return res.status(400).json({ error: 'Email ya en uso' });
  }

  if (password) {
    if (password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
  }

  db.prepare(`
    UPDATE users SET name = ?, email = ?, role = ?, is_active = ? WHERE id = ?
  `).run(
    name || user.name,
    email ? email.toLowerCase().trim() : user.email,
    role || user.role,
    is_active !== undefined ? (is_active ? 1 : 0) : user.is_active,
    req.params.id
  );

  const updated = db.prepare('SELECT id, name, email, role, avatar, is_active, created_at FROM users WHERE id = ?')
    .get(req.params.id);
  res.json(updated);
});

// Delete user (admin only)
router.delete('/:id', adminMiddleware, (req, res) => {
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Get users for a company (for task assignment)
router.get('/company/:companyId', (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.name, u.email, u.avatar, cu.role
    FROM company_users cu
    JOIN users u ON u.id = cu.user_id
    WHERE cu.company_id = ? AND u.is_active = 1
    ORDER BY u.name ASC
  `).all(req.params.companyId);

  // Also include admin users
  const admins = db.prepare(`
    SELECT u.id, u.name, u.email, u.avatar, 'admin' as role
    FROM users u
    WHERE u.role = 'admin' AND u.is_active = 1
      AND u.id NOT IN (SELECT user_id FROM company_users WHERE company_id = ?)
    ORDER BY u.name ASC
  `).all(req.params.companyId);

  res.json([...users, ...admins]);
});

module.exports = router;
