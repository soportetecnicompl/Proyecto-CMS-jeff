const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json({ tasks: [], projects: [] });

  const term = `%${q}%`;
  const userId = req.user.id;
  const isAdmin = req.user.role === 'admin';

  const projects = isAdmin
    ? db.prepare(`
        SELECT p.id, p.name, p.status, p.priority, c.name as company_name
        FROM projects p JOIN companies c ON c.id = p.company_id
        WHERE p.name LIKE ? OR p.description LIKE ?
        LIMIT 8
      `).all(term, term)
    : db.prepare(`
        SELECT p.id, p.name, p.status, p.priority, c.name as company_name
        FROM projects p
        JOIN companies c ON c.id = p.company_id
        JOIN company_users cu ON cu.company_id = p.company_id AND cu.user_id = ?
        WHERE p.name LIKE ? OR p.description LIKE ?
        LIMIT 8
      `).all(userId, term, term);

  const tasks = isAdmin
    ? db.prepare(`
        SELECT t.id, t.title, t.status, t.priority,
          p.name as project_name, p.id as project_id, c.name as company_name
        FROM tasks t
        JOIN projects p ON p.id = t.project_id
        JOIN companies c ON c.id = p.company_id
        WHERE (t.title LIKE ? OR t.description LIKE ?) AND t.parent_task_id IS NULL
        LIMIT 15
      `).all(term, term)
    : db.prepare(`
        SELECT t.id, t.title, t.status, t.priority,
          p.name as project_name, p.id as project_id, c.name as company_name
        FROM tasks t
        JOIN projects p ON p.id = t.project_id
        JOIN companies c ON c.id = p.company_id
        JOIN company_users cu ON cu.company_id = p.company_id AND cu.user_id = ?
        WHERE (t.title LIKE ? OR t.description LIKE ?) AND t.parent_task_id IS NULL
        LIMIT 15
      `).all(userId, term, term);

  res.json({ tasks, projects });
});

module.exports = router;
