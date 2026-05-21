const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const clients = new Map();

function notifyUser(userId, data) {
  const res = clients.get(Number(userId));
  if (res) {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch { clients.delete(Number(userId)); }
  }
}

function createNotification(userId, type, title, body, entityType, entityId) {
  const result = db.prepare(`
    INSERT INTO notifications (user_id, type, title, body, entity_type, entity_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, type, title, body || null, entityType || null, entityId || null);
  const notif = db.prepare('SELECT * FROM notifications WHERE id = ?').get(result.lastInsertRowid);
  try { notifyUser(userId, { type: 'notification', notification: notif }); } catch {}
  return notif;
}

// SSE stream — auth via query param (EventSource no soporta headers custom)
router.get('/stream', (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(401).end();

  let user;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cambia_esto_por_una_clave_secreta_muy_larga_y_aleatoria');
    user = db.prepare('SELECT id, role FROM users WHERE id = ? AND is_active = 1').get(decoded.id);
  } catch { return res.status(401).end(); }
  if (!user) return res.status(401).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  clients.set(user.id, res);
  res.write(`data: ${JSON.stringify({ type: 'connected', userId: user.id })}\n\n`);

  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { clearInterval(heartbeat); clients.delete(user.id); }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(user.id);
  });
});

// GET /api/notifications
router.get('/', authMiddleware, (req, res) => {
  const notifications = db.prepare(`
    SELECT * FROM notifications WHERE user_id = ?
    ORDER BY created_at DESC LIMIT 30
  `).all(req.user.id);
  const unread = db.prepare('SELECT COUNT(*) as n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(req.user.id).n;
  res.json({ notifications, unread });
});

// PUT /api/notifications/read-all
router.put('/read-all', authMiddleware, (req, res) => {
  db.prepare('UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL').run(req.user.id);
  res.json({ success: true });
});

// PUT /api/notifications/:id/read
router.put('/:id/read', authMiddleware, (req, res) => {
  db.prepare('UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

module.exports = { router, notifyUser, createNotification };
