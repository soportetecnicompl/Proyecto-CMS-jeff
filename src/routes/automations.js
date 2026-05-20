const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// Get all automations
router.get('/', (req, res) => {
  let automations;
  if (req.user.role === 'admin') {
    automations = db.prepare(`
      SELECT a.*, c.name as company_name, p.name as project_name, u.name as creator_name
      FROM automations a
      LEFT JOIN companies c ON c.id = a.company_id
      LEFT JOIN projects p ON p.id = a.project_id
      LEFT JOIN users u ON u.id = a.created_by
      ORDER BY a.created_at DESC
    `).all();
  } else {
    automations = db.prepare(`
      SELECT a.*, c.name as company_name, p.name as project_name, u.name as creator_name
      FROM automations a
      LEFT JOIN companies c ON c.id = a.company_id
      LEFT JOIN projects p ON p.id = a.project_id
      LEFT JOIN users u ON u.id = a.created_by
      WHERE a.company_id IN (
        SELECT company_id FROM company_users WHERE user_id = ?
      )
      ORDER BY a.created_at DESC
    `).all(req.user.id);
  }

  automations.forEach(a => {
    a.trigger_config = JSON.parse(a.trigger_config || '{}');
    a.action_config = JSON.parse(a.action_config || '{}');
  });

  res.json(automations);
});

// Get single automation
router.get('/:id', (req, res) => {
  const automation = db.prepare(`
    SELECT a.*, c.name as company_name, p.name as project_name
    FROM automations a
    LEFT JOIN companies c ON c.id = a.company_id
    LEFT JOIN projects p ON p.id = a.project_id
    WHERE a.id = ?
  `).get(req.params.id);

  if (!automation) return res.status(404).json({ error: 'Automatización no encontrada' });

  automation.trigger_config = JSON.parse(automation.trigger_config || '{}');
  automation.action_config = JSON.parse(automation.action_config || '{}');

  automation.logs = db.prepare(`
    SELECT * FROM automation_logs WHERE automation_id = ? ORDER BY created_at DESC LIMIT 20
  `).all(req.params.id);

  res.json(automation);
});

// Create automation
router.post('/', (req, res) => {
  const { company_id, project_id, name, description, trigger_type, trigger_config, action_type, action_config } = req.body;

  if (!name || !trigger_type || !action_type) {
    return res.status(400).json({ error: 'Nombre, tipo de disparador y acción son requeridos' });
  }

  const validTriggers = ['manual', 'task_completed', 'project_status', 'due_date'];
  const validActions = ['create_task', 'send_email', 'update_status', 'add_comment'];

  if (!validTriggers.includes(trigger_type)) {
    return res.status(400).json({ error: 'Tipo de disparador inválido' });
  }
  if (!validActions.includes(action_type)) {
    return res.status(400).json({ error: 'Tipo de acción inválido' });
  }

  const result = db.prepare(`
    INSERT INTO automations (company_id, project_id, name, description, trigger_type, trigger_config, action_type, action_config, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    company_id || null,
    project_id || null,
    name,
    description || null,
    trigger_type,
    JSON.stringify(trigger_config || {}),
    action_type,
    JSON.stringify(action_config || {}),
    req.user.id
  );

  const automation = db.prepare('SELECT * FROM automations WHERE id = ?').get(result.lastInsertRowid);
  automation.trigger_config = JSON.parse(automation.trigger_config);
  automation.action_config = JSON.parse(automation.action_config);

  res.status(201).json(automation);
});

// Update automation
router.put('/:id', (req, res) => {
  const auto = db.prepare('SELECT * FROM automations WHERE id = ?').get(req.params.id);
  if (!auto) return res.status(404).json({ error: 'Automatización no encontrada' });

  const { name, description, trigger_type, trigger_config, action_type, action_config, is_active, project_id } = req.body;

  db.prepare(`
    UPDATE automations SET
      name = ?, description = ?, trigger_type = ?, trigger_config = ?,
      action_type = ?, action_config = ?, is_active = ?, project_id = ?
    WHERE id = ?
  `).run(
    name || auto.name,
    description !== undefined ? description : auto.description,
    trigger_type || auto.trigger_type,
    JSON.stringify(trigger_config || JSON.parse(auto.trigger_config)),
    action_type || auto.action_type,
    JSON.stringify(action_config || JSON.parse(auto.action_config)),
    is_active !== undefined ? (is_active ? 1 : 0) : auto.is_active,
    project_id !== undefined ? project_id : auto.project_id,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM automations WHERE id = ?').get(req.params.id);
  updated.trigger_config = JSON.parse(updated.trigger_config);
  updated.action_config = JSON.parse(updated.action_config);
  res.json(updated);
});

// Delete automation
router.delete('/:id', (req, res) => {
  const auto = db.prepare('SELECT id FROM automations WHERE id = ?').get(req.params.id);
  if (!auto) return res.status(404).json({ error: 'Automatización no encontrada' });
  db.prepare('DELETE FROM automations WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Run automation manually
router.post('/:id/run', async (req, res) => {
  const auto = db.prepare('SELECT * FROM automations WHERE id = ?').get(req.params.id);
  if (!auto) return res.status(404).json({ error: 'Automatización no encontrada' });
  if (!auto.is_active) return res.status(400).json({ error: 'La automatización está desactivada' });

  const actionConfig = JSON.parse(auto.action_config || '{}');
  let result = { success: false, message: '' };

  try {
    if (auto.action_type === 'create_task') {
      const projectId = actionConfig.project_id || auto.project_id;
      if (!projectId) throw new Error('No hay proyecto configurado para crear la tarea');

      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
      if (!project) throw new Error('Proyecto no encontrado');

      const taskResult = db.prepare(`
        INSERT INTO tasks (project_id, title, description, status, priority, assigned_to, estimated_hours, due_date, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        projectId,
        actionConfig.title || `Tarea generada por automatización: ${auto.name}`,
        actionConfig.description || null,
        actionConfig.status || 'pendiente',
        actionConfig.priority || 'media',
        actionConfig.assigned_to || null,
        actionConfig.estimated_hours || null,
        actionConfig.due_date || null,
        req.user.id
      );

      result = { success: true, message: `Tarea creada con ID ${taskResult.lastInsertRowid}`, task_id: taskResult.lastInsertRowid };

    } else if (auto.action_type === 'update_status') {
      const projectId = actionConfig.project_id || auto.project_id;
      if (!projectId) throw new Error('No hay proyecto configurado');
      db.prepare('UPDATE projects SET status = ? WHERE id = ?').run(actionConfig.status || 'activo', projectId);
      result = { success: true, message: `Estado del proyecto actualizado a: ${actionConfig.status}` };

    } else if (auto.action_type === 'add_comment') {
      const entityId = actionConfig.entity_id;
      const entityType = actionConfig.entity_type || 'project';
      if (!entityId) throw new Error('No hay entidad configurada para el comentario');

      db.prepare(`
        INSERT INTO comments (entity_type, entity_id, user_id, content)
        VALUES (?, ?, ?, ?)
      `).run(entityType, entityId, req.user.id, actionConfig.content || `Comentario automático: ${auto.name}`);

      result = { success: true, message: 'Comentario agregado' };

    } else {
      result = { success: true, message: `Acción '${auto.action_type}' ejecutada` };
    }

    db.prepare('UPDATE automations SET last_run_at = CURRENT_TIMESTAMP, run_count = run_count + 1 WHERE id = ?').run(auto.id);
    db.prepare('INSERT INTO automation_logs (automation_id, status, result) VALUES (?, ?, ?)').run(auto.id, 'success', JSON.stringify(result));

    res.json(result);

  } catch (err) {
    db.prepare('INSERT INTO automation_logs (automation_id, status, result) VALUES (?, ?, ?)').run(auto.id, 'failed', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
