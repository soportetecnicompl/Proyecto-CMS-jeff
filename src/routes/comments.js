const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { createNotification } = require('./notifications');

const router = express.Router();
router.use(authMiddleware);

// Get comments for an entity (task or project)
router.get('/:type/:id', (req, res) => {
  const { type, id } = req.params;
  if (!['task', 'project'].includes(type)) {
    return res.status(400).json({ error: 'Tipo inválido' });
  }

  const comments = db.prepare(`
    SELECT c.*, u.name as user_name, u.avatar as user_avatar
    FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.entity_type = ? AND c.entity_id = ?
    ORDER BY c.created_at ASC
  `).all(type, id);

  res.json(comments);
});

// Add comment
router.post('/:type/:id', (req, res) => {
  const { type, id } = req.params;
  if (!['task', 'project'].includes(type)) {
    return res.status(400).json({ error: 'Tipo inválido' });
  }

  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'El contenido es requerido' });
  }

  const result = db.prepare(`
    INSERT INTO comments (entity_type, entity_id, user_id, content)
    VALUES (?, ?, ?, ?)
  `).run(type, id, req.user.id, content.trim());

  const comment = db.prepare(`
    SELECT c.*, u.name as user_name, u.avatar as user_avatar
    FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.id = ?
  `).get(result.lastInsertRowid);

  // Notificar al asignado si es comentario en tarea
  if (type === 'task') {
    const task = db.prepare('SELECT assigned_to, title FROM tasks WHERE id = ?').get(id);
    if (task && task.assigned_to && task.assigned_to !== req.user.id) {
      createNotification(
        task.assigned_to,
        'comment',
        'Nuevo comentario',
        `${req.user.name} comentó en "${task.title}"`,
        'task', id
      );
    }
  }

  res.status(201).json(comment);
});

// Update comment
router.put('/:id', (req, res) => {
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id);
  if (!comment) return res.status(404).json({ error: 'Comentario no encontrado' });
  if (comment.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Sin permisos' });
  }

  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'El contenido es requerido' });

  db.prepare('UPDATE comments SET content = ? WHERE id = ?').run(content.trim(), req.params.id);

  const updated = db.prepare(`
    SELECT c.*, u.name as user_name, u.avatar as user_avatar
    FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.id = ?
  `).get(req.params.id);

  res.json(updated);
});

// Delete comment
router.delete('/:id', (req, res) => {
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id);
  if (!comment) return res.status(404).json({ error: 'Comentario no encontrado' });
  if (comment.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Sin permisos' });
  }
  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
