const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/company/:companyId', (req, res) => {
  const tags = db.prepare('SELECT * FROM tags WHERE company_id = ? ORDER BY name ASC').all(req.params.companyId);
  res.json(tags);
});

router.post('/', (req, res, next) => {
  const { company_id, name, color } = req.body;
  if (!company_id || !name) return res.status(400).json({ error: 'company_id y name son requeridos' });
  const company = db.prepare('SELECT id FROM companies WHERE id = ?').get(company_id);
  if (!company) return res.status(400).json({ error: 'Empresa no encontrada' });
  try {
    const result = db.prepare('INSERT INTO tags (company_id, name, color, created_by) VALUES (?, ?, ?, ?)').run(company_id, name.trim(), color || '#6366f1', req.user.id);
    const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(tag);
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Ya existe una etiqueta con ese nombre' });
    next(err);
  }
});

router.delete('/:id', (req, res) => {
  const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(req.params.id);
  if (!tag) return res.status(404).json({ error: 'Etiqueta no encontrada' });
  db.prepare('DELETE FROM tags WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.post('/task/:taskId', (req, res) => {
  const { tag_id } = req.body;
  if (!tag_id) return res.status(400).json({ error: 'tag_id requerido' });
  db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)').run(req.params.taskId, tag_id);
  res.json({ success: true });
});

router.delete('/task/:taskId/:tagId', (req, res) => {
  db.prepare('DELETE FROM task_tags WHERE task_id = ? AND tag_id = ?').run(req.params.taskId, req.params.tagId);
  res.json({ success: true });
});

module.exports = router;
