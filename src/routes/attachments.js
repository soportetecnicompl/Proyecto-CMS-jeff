const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'data', 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    cb(null, unique + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /^[^.]+\.(jpg|jpeg|png|gif|pdf|doc|docx|xls|xlsx|txt|zip|csv)$/i;
    if (allowed.test(file.originalname)) return cb(null, true);
    cb(new Error('Tipo de archivo no permitido'));
  }
});

router.get('/task/:taskId', (req, res) => {
  const files = db.prepare(`
    SELECT a.*, u.name as user_name FROM attachments a
    JOIN users u ON u.id = a.user_id
    WHERE a.task_id = ? ORDER BY a.created_at DESC
  `).all(req.params.taskId);
  res.json(files);
});

router.post('/task/:taskId', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
    const result = db.prepare('INSERT INTO attachments (task_id, user_id, filename, original_name, size) VALUES (?, ?, ?, ?, ?)').run(
      req.params.taskId, req.user.id,
      req.file.filename,
      require('path').basename(req.file.originalname),
      req.file.size
    );
    const attachment = db.prepare('SELECT a.*, u.name as user_name FROM attachments a JOIN users u ON u.id = a.user_id WHERE a.id = ?').get(result.lastInsertRowid);
    res.status(201).json(attachment);
  });
});

router.get('/:id/download', (req, res) => {
  const file = db.prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Archivo no encontrado' });
  const filePath = path.join(UPLOADS_DIR, file.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado en disco' });
  res.download(filePath, file.original_name);
});

router.delete('/:id', (req, res) => {
  const file = db.prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Archivo no encontrado' });
  if (file.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Sin permisos' });
  const filePath = path.join(UPLOADS_DIR, file.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare('DELETE FROM attachments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
