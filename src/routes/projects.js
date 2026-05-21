const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

function canAccessCompany(userId, companyId, userRole) {
  if (userRole === 'admin') return true;
  const access = db.prepare('SELECT id FROM company_users WHERE company_id = ? AND user_id = ?')
    .get(companyId, userId);
  return !!access;
}

// Get projects for a company
router.get('/company/:companyId', (req, res) => {
  if (!canAccessCompany(req.user.id, req.params.companyId, req.user.role)) {
    return res.status(403).json({ error: 'Sin acceso' });
  }

  const projects = db.prepare(`
    SELECT p.*,
      u.name as creator_name,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) as task_count,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'completada') as completed_tasks
    FROM projects p
    LEFT JOIN users u ON u.id = p.created_by
    WHERE p.company_id = ?
    ORDER BY p.created_at DESC
  `).all(req.params.companyId);

  res.json(projects);
});

// Get single project
router.get('/:id', (req, res) => {
  const project = db.prepare(`
    SELECT p.*, c.name as company_name, u.name as creator_name
    FROM projects p
    JOIN companies c ON c.id = p.company_id
    LEFT JOIN users u ON u.id = p.created_by
    WHERE p.id = ?
  `).get(req.params.id);

  if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' });

  if (!canAccessCompany(req.user.id, project.company_id, req.user.role)) {
    return res.status(403).json({ error: 'Sin acceso' });
  }

  // Incluir el rol del usuario en esta empresa para que el frontend controle permisos
  if (req.user.role === 'admin') {
    project.my_company_role = 'admin';
  } else {
    const access = db.prepare('SELECT role FROM company_users WHERE company_id = ? AND user_id = ?')
      .get(project.company_id, req.user.id);
    project.my_company_role = access ? access.role : 'viewer';
  }

  project.task_count = db.prepare('SELECT COUNT(*) as n FROM tasks WHERE project_id = ?').get(req.params.id).n;
  project.completed_tasks = db.prepare("SELECT COUNT(*) as n FROM tasks WHERE project_id = ? AND status = 'completada'").get(req.params.id).n;

  res.json(project);
});

// Create project
router.post('/', (req, res) => {
  const { company_id, name, description, status, priority, start_date, end_date } = req.body;
  if (!company_id || !name) return res.status(400).json({ error: 'Empresa y nombre son requeridos' });

  if (!canAccessCompany(req.user.id, company_id, req.user.role)) {
    return res.status(403).json({ error: 'Sin acceso' });
  }

  const result = db.prepare(`
    INSERT INTO projects (company_id, name, description, status, priority, start_date, end_date, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    company_id, name,
    description || null,
    status || 'activo',
    priority || 'media',
    start_date || null,
    end_date || null,
    req.user.id
  );

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(project);
});

// Update project
router.put('/:id', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' });

  if (!canAccessCompany(req.user.id, project.company_id, req.user.role)) {
    return res.status(403).json({ error: 'Sin acceso' });
  }

  const { name, description, status, priority, start_date, end_date, progress, contract_value, billing_frequency } = req.body;

  db.prepare(`
    UPDATE projects SET
      name = ?, description = ?, status = ?, priority = ?,
      start_date = ?, end_date = ?, progress = ?,
      contract_value = ?, billing_frequency = ?
    WHERE id = ?
  `).run(
    name !== undefined ? name : project.name,
    description !== undefined ? description : project.description,
    status !== undefined ? status : project.status,
    priority !== undefined ? priority : project.priority,
    start_date !== undefined ? start_date : project.start_date,
    end_date !== undefined ? end_date : project.end_date,
    progress !== undefined ? progress : project.progress,
    contract_value !== undefined ? contract_value : project.contract_value,
    billing_frequency !== undefined ? billing_frequency : project.billing_frequency,
    req.params.id
  );

  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id));
});

// Delete project
router.delete('/:id', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' });

  if (req.user.role !== 'admin') {
    const access = db.prepare('SELECT role FROM company_users WHERE company_id = ? AND user_id = ?')
      .get(project.company_id, req.user.id);
    if (!access || access.role === 'viewer') {
      return res.status(403).json({ error: 'Sin permisos' });
    }
  }

  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Get project observations
router.get('/:id/observations', (req, res) => {
  const obs = db.prepare(`
    SELECT o.*, u.name as user_name, u.avatar as user_avatar
    FROM observations o
    JOIN users u ON u.id = o.user_id
    WHERE o.project_id = ?
    ORDER BY o.created_at DESC
  `).all(req.params.id);
  res.json(obs);
});

// Add observation
router.post('/:id/observations', (req, res) => {
  const { content, type } = req.body;
  if (!content) return res.status(400).json({ error: 'El contenido es requerido' });

  const result = db.prepare(`
    INSERT INTO observations (project_id, user_id, content, type)
    VALUES (?, ?, ?, ?)
  `).run(req.params.id, req.user.id, content, type || 'general');

  const obs = db.prepare(`
    SELECT o.*, u.name as user_name, u.avatar as user_avatar
    FROM observations o
    JOIN users u ON u.id = o.user_id
    WHERE o.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(obs);
});

// Delete observation
router.delete('/:id/observations/:obsId', (req, res) => {
  const obs = db.prepare('SELECT * FROM observations WHERE id = ?').get(req.params.obsId);
  if (!obs) return res.status(404).json({ error: 'Observación no encontrada' });
  if (obs.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Sin permisos' });
  }
  db.prepare('DELETE FROM observations WHERE id = ?').run(req.params.obsId);
  res.json({ success: true });
});

// Get project stats
router.get('/:id/stats', (req, res) => {
  const tasksByStatus = db.prepare(`
    SELECT status, COUNT(*) as count FROM tasks WHERE project_id = ? GROUP BY status
  `).all(req.params.id);

  const totalHours = db.prepare(`
    SELECT SUM(estimated_hours) as estimated, SUM(actual_hours) as actual
    FROM tasks WHERE project_id = ?
  `).get(req.params.id);

  const tasksByPriority = db.prepare(`
    SELECT priority, COUNT(*) as count FROM tasks WHERE project_id = ? GROUP BY priority
  `).all(req.params.id);

  const recentActivity = db.prepare(`
    SELECT 'comment' as type, c.created_at, u.name as user_name, 'Nuevo comentario' as description
    FROM comments c
    JOIN users u ON u.id = c.user_id
    JOIN tasks t ON t.id = c.entity_id AND c.entity_type = 'task'
    WHERE t.project_id = ?
    UNION ALL
    SELECT 'observation' as type, o.created_at, u.name as user_name, 'Nueva observación' as description
    FROM observations o
    JOIN users u ON u.id = o.user_id
    WHERE o.project_id = ?
    ORDER BY created_at DESC
    LIMIT 10
  `).all(req.params.id, req.params.id);

  res.json({ tasksByStatus, totalHours, tasksByPriority, recentActivity });
});

module.exports = router;
