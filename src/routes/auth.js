const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son requeridos' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const token = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar }
  });
});

// Get invitation info
router.get('/invitation/:token', (req, res) => {
  const invite = db.prepare(`
    SELECT i.*, c.name as company_name, u.name as inviter_name
    FROM invitations i
    JOIN companies c ON c.id = i.company_id
    JOIN users u ON u.id = i.invited_by
    WHERE i.token = ? AND i.used_at IS NULL AND i.expires_at > datetime('now')
  `).get(req.params.token);

  if (!invite) {
    return res.status(404).json({ error: 'Invitación inválida o expirada' });
  }

  res.json({
    email: invite.email,
    company_name: invite.company_name,
    inviter_name: invite.inviter_name,
    role: invite.role
  });
});

// Accept invitation & register
router.post('/accept-invitation', (req, res) => {
  const { token, name, password } = req.body;
  if (!token || !name || !password) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  }

  const invite = db.prepare(`
    SELECT * FROM invitations
    WHERE token = ? AND used_at IS NULL AND expires_at > datetime('now')
  `).get(token);

  if (!invite) {
    return res.status(400).json({ error: 'Invitación inválida o expirada' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(invite.email);
  let userId;

  const acceptTx = db.transaction(() => {
    if (existing) {
      userId = existing.id;
    } else {
      const hash = bcrypt.hashSync(password, 10);
      const result = db.prepare(`
        INSERT INTO users (name, email, password_hash, role)
        VALUES (?, ?, ?, 'user')
      `).run(name, invite.email, hash);
      userId = result.lastInsertRowid;
    }

    // Add to company
    db.prepare(`
      INSERT OR IGNORE INTO company_users (company_id, user_id, role)
      VALUES (?, ?, ?)
    `).run(invite.company_id, userId, invite.role);

    // Mark invitation as used
    db.prepare('UPDATE invitations SET used_at = CURRENT_TIMESTAMP WHERE id = ?').run(invite.id);
  });

  acceptTx();

  const user = db.prepare('SELECT id, name, email, role, avatar FROM users WHERE id = ?').get(userId);
  const jwtToken = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  res.json({ token: jwtToken, user });
});

// Get current user
router.get('/me', authMiddleware, (req, res) => {
  res.json(req.user);
});

// Update profile
router.put('/profile', authMiddleware, (req, res) => {
  const { name, current_password, new_password } = req.body;

  if (new_password) {
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
    }
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!bcrypt.compareSync(current_password, user.password_hash)) {
      return res.status(400).json({ error: 'Contraseña actual incorrecta' });
    }
    const hash = bcrypt.hashSync(new_password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
  }

  if (name) {
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.user.id);
  }

  const updated = db.prepare('SELECT id, name, email, role, avatar FROM users WHERE id = ?').get(req.user.id);
  res.json(updated);
});

module.exports = router;
