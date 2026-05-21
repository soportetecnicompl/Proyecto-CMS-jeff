const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { sendTaskNotification } = require('../services/email');
const { createNotification } = require('./notifications');

const router = express.Router();
router.use(authMiddleware);

function logActivity(entityType, entityId, userId, action, description) {
  db.prepare(`
    INSERT INTO activity_log (entity_type, entity_id, user_id, action, description)
    VALUES (?, ?, ?, ?, ?)
  `).run(entityType, entityId, userId, action, description);
}

// Get tasks for a project
router.get('/project/:projectId', (req, res) => {
  const tasks = db.prepare(`
    SELECT t.*,
      u.name as assigned_name, u.avatar as assigned_avatar,
      c.name as creator_name,
      (SELECT COUNT(*) FROM comments WHERE entity_type = 'task' AND entity_id = t.id) as comment_count,
      (SELECT SUM(hours) FROM time_logs WHERE task_id = t.id) as logged_hours
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assigned_to
    LEFT JOIN users c ON c.id = t.created_by
    WHERE t.project_id = ? AND t.parent_task_id IS NULL
    ORDER BY t.order_index ASC, t.created_at DESC
  `).all(req.params.projectId);

  // Attach subtasks and tags
  tasks.forEach(task => {
    task.subtasks = db.prepare(`
      SELECT t.*, u.name as assigned_name, u.avatar as assigned_avatar
      FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to
      WHERE t.parent_task_id = ? ORDER BY t.order_index ASC
    `).all(task.id);

    task.tags = db.prepare(`
      SELECT tg.* FROM tags tg
      JOIN task_tags tt ON tt.tag_id = tg.id
      WHERE tt.task_id = ?
    `).all(task.id);
  });

  res.json(tasks);
});

// Get single task
router.get('/:id', (req, res) => {
  const task = db.prepare(`
    SELECT t.*,
      u.name as assigned_name, u.avatar as assigned_avatar,
      p.name as project_name, p.company_id,
      c.name as creator_name
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assigned_to
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN users c ON c.id = t.created_by
    WHERE t.id = ?
  `).get(req.params.id);

  if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });

  task.time_logs = db.prepare(`
    SELECT tl.*, u.name as user_name
    FROM time_logs tl
    JOIN users u ON u.id = tl.user_id
    WHERE tl.task_id = ?
    ORDER BY tl.logged_date DESC
  `).all(req.params.id);

  task.subtasks = db.prepare(`
    SELECT t.*, u.name as assigned_name
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assigned_to
    WHERE t.parent_task_id = ?
    ORDER BY t.order_index ASC
  `).all(req.params.id);

  task.tags = db.prepare(`
    SELECT t.* FROM tags t
    JOIN task_tags tt ON tt.tag_id = t.id
    WHERE tt.task_id = ? ORDER BY t.name ASC
  `).all(req.params.id);

  task.dependencies = db.prepare(`
    SELECT t.id, t.title, t.status, t.priority
    FROM tasks t
    JOIN task_dependencies td ON td.depends_on_id = t.id
    WHERE td.task_id = ?
  `).all(req.params.id);

  task.blocked_by_count = task.dependencies.filter(d => d.status !== 'completada').length;

  task.attachments = db.prepare(`
    SELECT a.*, u.name as user_name FROM attachments a
    JOIN users u ON u.id = a.user_id
    WHERE a.task_id = ? ORDER BY a.created_at DESC
  `).all(req.params.id);

  res.json(task);
});

// Create task
router.post('/', (req, res) => {
  const {
    project_id, title, description, status, priority,
    assigned_to, estimated_hours, due_date, parent_task_id, order_index
  } = req.body;

  if (!project_id || !title) return res.status(400).json({ error: 'Proyecto y título son requeridos' });

  const result = db.prepare(`
    INSERT INTO tasks (project_id, title, description, status, priority, assigned_to, estimated_hours, due_date, parent_task_id, order_index, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    project_id, title,
    description || null,
    status || 'pendiente',
    priority || 'media',
    assigned_to || null,
    estimated_hours || null,
    due_date || null,
    parent_task_id || null,
    order_index || 0,
    req.user.id
  );

  const task = db.prepare(`
    SELECT t.*, u.name as assigned_name, u.avatar as assigned_avatar
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assigned_to
    WHERE t.id = ?
  `).get(result.lastInsertRowid);

  // Send email notification if assigned to someone
  if (assigned_to && assigned_to !== req.user.id) {
    const assignedUser = db.prepare('SELECT email, name FROM users WHERE id = ?').get(assigned_to);
    const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(project_id);
    if (assignedUser && project) {
      sendTaskNotification({
        to: assignedUser.email,
        taskTitle: title,
        projectName: project.name,
        assignerName: req.user.name,
        taskId: task.id
      }).catch(err => console.error('Error enviando notificación:', err.message));
    }
      createNotification(
        assigned_to,
        'task_assigned',
        'Nueva tarea asignada',
        `${req.user.name} te asignó: "${title}"`,
        'task', task.id
      );
  }

  // Auto-update project progress
  updateProjectProgress(project_id);
  logActivity('task', result.lastInsertRowid, req.user.id, 'created', `Tarea creada: "${title}"`);

  res.status(201).json(task);
});

// Update task
router.put('/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });

  const {
    title, description, status, priority,
    assigned_to, estimated_hours, actual_hours, due_date, order_index
  } = req.body;

  db.prepare(`
    UPDATE tasks SET
      title = ?, description = ?, status = ?, priority = ?,
      assigned_to = ?, estimated_hours = ?, actual_hours = ?, due_date = ?, order_index = ?
    WHERE id = ?
  `).run(
    title !== undefined ? title : task.title,
    description !== undefined ? description : task.description,
    status !== undefined ? status : task.status,
    priority !== undefined ? priority : task.priority,
    assigned_to !== undefined ? assigned_to : task.assigned_to,
    estimated_hours !== undefined ? estimated_hours : task.estimated_hours,
    actual_hours !== undefined ? actual_hours : task.actual_hours,
    due_date !== undefined ? due_date : task.due_date,
    order_index !== undefined ? order_index : task.order_index,
    req.params.id
  );

  // Notify new assignee
  if (assigned_to && assigned_to !== task.assigned_to && assigned_to !== req.user.id) {
    const assignedUser = db.prepare('SELECT email FROM users WHERE id = ?').get(assigned_to);
    const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(task.project_id);
    if (assignedUser && project) {
      sendTaskNotification({
        to: assignedUser.email,
        taskTitle: title || task.title,
        projectName: project.name,
        assignerName: req.user.name,
        taskId: task.id
      }).catch(() => {});
    }
      createNotification(
        assigned_to,
        'task_assigned',
        'Tarea asignada',
        `${req.user.name} te asignó: "${title || task.title}"`,
        'task', task.id
      );
  }

  updateProjectProgress(task.project_id);

  const changes = [];
  if (status !== undefined && status !== task.status) changes.push(`Estado: ${task.status} → ${status}`);
  if (assigned_to !== undefined && assigned_to !== task.assigned_to) {
    const newUser = assigned_to ? db.prepare('SELECT name FROM users WHERE id = ?').get(assigned_to) : null;
    changes.push(`Asignado a: ${newUser ? newUser.name : 'nadie'}`);
  }
  if (title !== undefined && title !== task.title) changes.push(`Título actualizado`);
  if (changes.length) {
    logActivity('task', req.params.id, req.user.id, 'updated', changes.join(' · '));
  }

  const updated = db.prepare(`
    SELECT t.*, u.name as assigned_name, u.avatar as assigned_avatar
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assigned_to
    WHERE t.id = ?
  `).get(req.params.id);

  res.json(updated);
});

// Delete task
router.delete('/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });
  logActivity('task', req.params.id, req.user.id, 'deleted', `Tarea eliminada: "${task.title}"`);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  updateProjectProgress(task.project_id);
  res.json({ success: true });
});

// Add time log
router.post('/:id/time-logs', (req, res) => {
  const { hours, description, logged_date } = req.body;
  if (!hours || hours <= 0) return res.status(400).json({ error: 'Las horas deben ser positivas' });

  const result = db.prepare(`
    INSERT INTO time_logs (task_id, user_id, hours, description, logged_date)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.params.id, req.user.id, hours, description || null, logged_date || new Date().toISOString().split('T')[0]);

  // Update actual_hours on task
  const total = db.prepare('SELECT SUM(hours) as total FROM time_logs WHERE task_id = ?').get(req.params.id);
  db.prepare('UPDATE tasks SET actual_hours = ? WHERE id = ?').run(total.total || 0, req.params.id);

  const log = db.prepare(`
    SELECT tl.*, u.name as user_name
    FROM time_logs tl
    JOIN users u ON u.id = tl.user_id
    WHERE tl.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(log);
});

// Delete time log
router.delete('/:id/time-logs/:logId', (req, res) => {
  const log = db.prepare('SELECT * FROM time_logs WHERE id = ?').get(req.params.logId);
  if (!log) return res.status(404).json({ error: 'Registro no encontrado' });
  if (log.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Sin permisos' });
  }
  db.prepare('DELETE FROM time_logs WHERE id = ?').run(req.params.logId);

  const total = db.prepare('SELECT SUM(hours) as total FROM time_logs WHERE task_id = ?').get(req.params.id);
  db.prepare('UPDATE tasks SET actual_hours = ? WHERE id = ?').run(total.total || 0, req.params.id);

  res.json({ success: true });
});

router.get('/:id/dependencies', (req, res) => {
  const deps = db.prepare(`
    SELECT t.id, t.title, t.status, t.priority
    FROM tasks t JOIN task_dependencies td ON td.depends_on_id = t.id
    WHERE td.task_id = ?
  `).all(req.params.id);
  res.json(deps);
});

router.post('/:id/dependencies', (req, res) => {
  const { depends_on_id } = req.body;
  if (!depends_on_id) return res.status(400).json({ error: 'depends_on_id requerido' });
  if (parseInt(depends_on_id) === parseInt(req.params.id)) return res.status(400).json({ error: 'Una tarea no puede depender de sí misma' });
  db.prepare('INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)').run(req.params.id, depends_on_id);
  const dep = db.prepare('SELECT id, title, status, priority FROM tasks WHERE id = ?').get(depends_on_id);
  res.status(201).json(dep);
});

router.delete('/:id/dependencies/:depId', (req, res) => {
  db.prepare('DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_id = ?').run(req.params.id, req.params.depId);
  res.json({ success: true });
});

router.get('/:id/activity', (req, res) => {
  const logs = db.prepare(`
    SELECT al.*, u.name as user_name
    FROM activity_log al
    LEFT JOIN users u ON u.id = al.user_id
    WHERE al.entity_type = 'task' AND al.entity_id = ?
    ORDER BY al.created_at DESC
    LIMIT 50
  `).all(req.params.id);
  res.json(logs);
});

function updateProjectProgress(projectId) {
  const stats = db.prepare(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN status = 'completada' THEN 1 ELSE 0 END) as completed
    FROM tasks WHERE project_id = ?
  `).get(projectId);

  if (stats.total > 0) {
    const progress = Math.round((stats.completed / stats.total) * 100);
    db.prepare('UPDATE projects SET progress = ? WHERE id = ?').run(progress, projectId);
  }
}

module.exports = router;
