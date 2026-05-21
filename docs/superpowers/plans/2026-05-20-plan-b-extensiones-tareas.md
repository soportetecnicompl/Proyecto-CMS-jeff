# Plan B — Extensiones de Tareas: Subtareas, Etiquetas, Dependencias, Archivos Adjuntos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar creación de subtareas desde el detalle de tarea, etiquetas de color asignables a tareas, dependencias entre tareas, y archivos adjuntos con upload a disco.

**Architecture:** 4 nuevas tablas SQLite (`tags`, `task_tags`, `task_dependencies`, `attachments`). 2 nuevas rutas Express (`/api/tags`, `/api/attachments`). Archivos subidos con multer a `data/uploads/`, descargados via ruta autenticada. Frontend: task.js recibe nuevas secciones en el sidebar y cuerpo; project.js muestra tags como chips en las tarjetas de tarea.

**Tech Stack:** Express + better-sqlite3 + multer (ya instalado) + Vanilla JS.

---

## Archivos modificados/creados

**Backend:**
- Modify: `src/database.js` — agregar 4 tablas nuevas
- Create: `src/routes/tags.js` — CRUD tags + asignar/quitar a tarea
- Create: `src/routes/attachments.js` — upload/list/delete adjuntos con multer
- Modify: `src/routes/tasks.js` — incluir tags, dependencies y attachments en GET responses
- Modify: `server.js` — registrar `/api/tags`, `/api/attachments`, servir `/api/attachments/:id/download`

**Frontend:**
- Modify: `public/js/api.js` — agregar métodos para tags, attachments, dependencies
- Modify: `public/js/views/task.js` — secciones de subtareas (+ crear), tags, dependencias, adjuntos
- Modify: `public/js/views/project.js` — mostrar tags como chips en task list items
- Modify: `public/css/style.css` — estilos tag chips, attachment items, dependency badges

---

### Task 1: Schema de DB + rutas de backend

**Files:**
- Modify: `src/database.js`
- Create: `src/routes/tags.js`
- Create: `src/routes/attachments.js`
- Modify: `src/routes/tasks.js`
- Modify: `server.js`

- [ ] **Step 1: Agregar 4 tablas nuevas en `src/database.js`**

En `src/database.js`, dentro de `db.exec(...)`, después del bloque `automation_logs` y antes del cierre del template string, agregar:

```sql
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#6366f1',
      created_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, name)
    );

    CREATE TABLE IF NOT EXISTS task_tags (
      task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
      tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (task_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS task_dependencies (
      task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
      depends_on_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
      PRIMARY KEY (task_id, depends_on_id)
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      size INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_task_tags_task ON task_tags(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_deps_task ON task_dependencies(task_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_task ON attachments(task_id);
```

También crear el directorio de uploads al inicio del archivo, después de la creación de `dataDir`:

```javascript
const uploadsDir = path.join(__dirname, '..', 'data', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
```

- [ ] **Step 2: Crear `src/routes/tags.js`**

Crear el archivo completo:

```javascript
const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/tags/company/:companyId — listar tags de una empresa
router.get('/company/:companyId', (req, res) => {
  const tags = db.prepare(`
    SELECT * FROM tags WHERE company_id = ? ORDER BY name ASC
  `).all(req.params.companyId);
  res.json(tags);
});

// POST /api/tags — crear tag
router.post('/', (req, res) => {
  const { company_id, name, color } = req.body;
  if (!company_id || !name) return res.status(400).json({ error: 'company_id y name son requeridos' });
  try {
    const result = db.prepare(`
      INSERT INTO tags (company_id, name, color, created_by) VALUES (?, ?, ?, ?)
    `).run(company_id, name.trim(), color || '#6366f1', req.user.id);
    const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(tag);
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Ya existe una etiqueta con ese nombre' });
    throw err;
  }
});

// DELETE /api/tags/:id
router.delete('/:id', (req, res) => {
  const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(req.params.id);
  if (!tag) return res.status(404).json({ error: 'Etiqueta no encontrada' });
  db.prepare('DELETE FROM tags WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST /api/tags/task/:taskId — asignar tag a tarea
router.post('/task/:taskId', (req, res) => {
  const { tag_id } = req.body;
  if (!tag_id) return res.status(400).json({ error: 'tag_id requerido' });
  try {
    db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)').run(req.params.taskId, tag_id);
    res.json({ success: true });
  } catch (err) { throw err; }
});

// DELETE /api/tags/task/:taskId/:tagId — quitar tag de tarea
router.delete('/task/:taskId/:tagId', (req, res) => {
  db.prepare('DELETE FROM task_tags WHERE task_id = ? AND tag_id = ?').run(req.params.taskId, req.params.tagId);
  res.json({ success: true });
});

module.exports = router;
```

- [ ] **Step 3: Crear `src/routes/attachments.js`**

```javascript
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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|pdf|doc|docx|xls|xlsx|txt|zip|csv)$/i;
    if (allowed.test(path.extname(file.originalname))) return cb(null, true);
    cb(new Error('Tipo de archivo no permitido'));
  }
});

// GET /api/attachments/task/:taskId
router.get('/task/:taskId', (req, res) => {
  const files = db.prepare(`
    SELECT a.*, u.name as user_name
    FROM attachments a
    JOIN users u ON u.id = a.user_id
    WHERE a.task_id = ?
    ORDER BY a.created_at DESC
  `).all(req.params.taskId);
  res.json(files);
});

// POST /api/attachments/task/:taskId
router.post('/task/:taskId', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });

  const result = db.prepare(`
    INSERT INTO attachments (task_id, user_id, filename, original_name, size)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.params.taskId, req.user.id, req.file.filename, req.file.originalname, req.file.size);

  const attachment = db.prepare(`
    SELECT a.*, u.name as user_name FROM attachments a
    JOIN users u ON u.id = a.user_id WHERE a.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(attachment);
});

// GET /api/attachments/:id/download
router.get('/:id/download', (req, res) => {
  const file = db.prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Archivo no encontrado' });

  const filePath = path.join(UPLOADS_DIR, file.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado en disco' });

  res.download(filePath, file.original_name);
});

// DELETE /api/attachments/:id
router.delete('/:id', (req, res) => {
  const file = db.prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Archivo no encontrado' });
  if (file.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Sin permisos' });
  }

  const filePath = path.join(UPLOADS_DIR, file.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  db.prepare('DELETE FROM attachments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
```

- [ ] **Step 4: Actualizar `src/routes/tasks.js` — incluir tags y dependencies en GET**

En el endpoint `GET /:id` (tarea individual), después de `task.subtasks = ...`, agregar:

```javascript
  task.tags = db.prepare(`
    SELECT t.* FROM tags t
    JOIN task_tags tt ON tt.tag_id = t.id
    WHERE tt.task_id = ?
    ORDER BY t.name ASC
  `).all(req.params.id);

  task.dependencies = db.prepare(`
    SELECT t.id, t.title, t.status, t.priority
    FROM tasks t
    JOIN task_dependencies td ON td.depends_on_id = t.id
    WHERE td.task_id = ?
  `).all(req.params.id);

  task.blocked_by_count = task.dependencies.filter(d => d.status !== 'completada').length;
```

En el endpoint `GET /project/:projectId`, en la query principal agregar un subquery de tags para poder mostrarlos en las tarjetas. Modificar la query para incluir:

```javascript
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
```

También agregar endpoints de dependencies en tasks.js al final (antes de `module.exports`):

```javascript
// GET /api/tasks/:id/dependencies
router.get('/:id/dependencies', (req, res) => {
  const deps = db.prepare(`
    SELECT t.id, t.title, t.status, t.priority
    FROM tasks t
    JOIN task_dependencies td ON td.depends_on_id = t.id
    WHERE td.task_id = ?
  `).all(req.params.id);
  res.json(deps);
});

// POST /api/tasks/:id/dependencies
router.post('/:id/dependencies', (req, res) => {
  const { depends_on_id } = req.body;
  if (!depends_on_id) return res.status(400).json({ error: 'depends_on_id requerido' });
  if (parseInt(depends_on_id) === parseInt(req.params.id)) {
    return res.status(400).json({ error: 'Una tarea no puede depender de sí misma' });
  }
  try {
    db.prepare('INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)').run(req.params.id, depends_on_id);
    const dep = db.prepare('SELECT id, title, status, priority FROM tasks WHERE id = ?').get(depends_on_id);
    res.status(201).json(dep);
  } catch (err) { throw err; }
});

// DELETE /api/tasks/:id/dependencies/:depId
router.delete('/:id/dependencies/:depId', (req, res) => {
  db.prepare('DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_id = ?').run(req.params.id, req.params.depId);
  res.json({ success: true });
});
```

- [ ] **Step 5: Registrar las nuevas rutas en `server.js`**

En `server.js`, después de `app.use('/api/automations', ...)`, agregar:

```javascript
app.use('/api/tags', require('./src/routes/tags'));
app.use('/api/attachments', require('./src/routes/attachments'));
```

- [ ] **Step 6: Verificar que el servidor arranca sin errores**

```bash
cd "C:/Users/jeffr/OneDrive/Aplicaciones/Proyecto-CMS-jeff"
node server.js &
sleep 2
curl -s http://localhost:3000/api/health
```

Expected: `{"status":"ok","timestamp":"..."}` — si hay error de sintaxis se verá aquí.

Matar el proceso después: `kill %1` o `pkill -f "node server.js"`

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/jeffr/OneDrive/Aplicaciones/Proyecto-CMS-jeff"
git add src/database.js src/routes/tags.js src/routes/attachments.js src/routes/tasks.js server.js
git commit -m "feat: tablas tags/task_tags/task_dependencies/attachments + rutas backend"
```

---

### Task 2: Métodos API en el frontend

**Files:**
- Modify: `public/js/api.js`

- [ ] **Step 1: Agregar métodos en `public/js/api.js`**

En el objeto `api`, después de la sección `// Automations`, agregar:

```javascript
  // Tags
  getTagsByCompany: (companyId) => api.get(`/tags/company/${companyId}`),
  createTag: (data) => api.post('/tags', data),
  deleteTag: (id) => api.delete(`/tags/${id}`),
  assignTag: (taskId, tagId) => api.post(`/tags/task/${taskId}`, { tag_id: tagId }),
  removeTag: (taskId, tagId) => api.delete(`/tags/task/${taskId}/${tagId}`),

  // Attachments
  getAttachments: (taskId) => api.get(`/attachments/task/${taskId}`),
  deleteAttachment: (id) => api.delete(`/attachments/${id}`),
  uploadAttachment: (taskId, file) => {
    const form = new FormData();
    form.append('file', file);
    const headers = {};
    if (api._token) headers['Authorization'] = `Bearer ${api._token}`;
    return fetch(`/api/attachments/task/${taskId}`, { method: 'POST', headers, body: form })
      .then(async r => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
        return d;
      });
  },

  // Task dependencies
  getTaskDependencies: (taskId) => api.get(`/tasks/${taskId}/dependencies`),
  addDependency: (taskId, dependsOnId) => api.post(`/tasks/${taskId}/dependencies`, { depends_on_id: dependsOnId }),
  removeDependency: (taskId, depId) => api.delete(`/tasks/${taskId}/dependencies/${depId}`),
```

- [ ] **Step 2: Commit**

```bash
cd "C:/Users/jeffr/OneDrive/Aplicaciones/Proyecto-CMS-jeff"
git add public/js/api.js
git commit -m "feat: métodos api frontend para tags, adjuntos y dependencias"
```

---

### Task 3: UI Subtareas — crear desde task detail

**Files:**
- Modify: `public/js/views/task.js`
- Modify: `public/css/style.css`

- [ ] **Step 1: Agregar estilos para subtarea-create en style.css**

Agregar al final de `public/css/style.css`:

```css
/* ── Subtareas inline ────────────────────────────────────────── */
.subtask-add-row { display:flex; gap:8px; margin-top:8px; }
.subtask-add-row input { flex:1; }
.subtask-progress { font-size:11px; color:var(--gray-500); margin-left:8px; }
```

- [ ] **Step 2: Actualizar la sección de subtareas en `renderTaskContent()` en task.js**

Localizar el bloque `<!-- Subtasks -->` (alrededor de la línea 73). Reemplazarlo completamente con:

```javascript
            <!-- Subtasks -->
            <div class="mb-4" id="subtasksSection">
              <div class="flex items-center justify-between mb-2">
                <h4 class="text-sm font-semibold">
                  Subtareas
                  ${task.subtasks && task.subtasks.length ? `
                    <span class="subtask-progress">(${task.subtasks.filter(s=>s.status==='completada').length}/${task.subtasks.length} completadas)</span>
                  ` : ''}
                </h4>
                <button class="btn btn-ghost btn-sm" onclick="toggleSubtaskForm()">+ Agregar</button>
              </div>
              <div id="subtaskFormRow" class="subtask-add-row hidden">
                <input class="form-control" id="subtaskTitle" placeholder="Título de la subtarea..." onkeydown="if(event.key==='Enter') submitSubtask(${task.id})">
                <button class="btn btn-primary btn-sm" onclick="submitSubtask(${task.id})">Crear</button>
                <button class="btn btn-ghost btn-sm" onclick="toggleSubtaskForm()">✕</button>
              </div>
              <div id="subtaskList">
                ${task.subtasks && task.subtasks.length ? task.subtasks.map(s => `
                  <div class="task-item" onclick="App.navigate('tarea/${s.id}')">
                    <div class="task-checkbox ${s.status==='completada'?'done':''}">
                      ${s.status==='completada'?'✓':''}
                    </div>
                    <div class="task-item-body">
                      <div class="task-item-title ${s.status==='completada'?'completed':''}">${escHtml(s.title)}</div>
                      <div class="task-item-meta">
                        <span class="status-badge status-${s.status}" style="font-size:11px">${statusLabel(s.status)}</span>
                        ${s.assigned_name ? `<span>👤 ${escHtml(s.assigned_name)}</span>` : ''}
                      </div>
                    </div>
                  </div>
                `).join('') : '<p class="text-sm text-gray" id="noSubtasksMsg">Sin subtareas aún.</p>'}
              </div>
            </div>
```

- [ ] **Step 3: Agregar funciones `toggleSubtaskForm` y `submitSubtask` en task.js**

Agregar antes de `window.openLogTime = openLogTime;` al final de task.js:

```javascript
window.toggleSubtaskForm = function() {
  const row = document.getElementById('subtaskFormRow');
  if (!row) return;
  row.classList.toggle('hidden');
  if (!row.classList.contains('hidden')) {
    document.getElementById('subtaskTitle')?.focus();
  }
};

window.submitSubtask = async function(parentTaskId) {
  const titleEl = document.getElementById('subtaskTitle');
  const title = titleEl?.value.trim();
  if (!title) return;

  try {
    const task = _taskData;
    await api.createTask({
      project_id: task.project_id,
      title,
      parent_task_id: parentTaskId,
      status: 'pendiente',
      priority: 'media',
    });
    titleEl.value = '';
    document.getElementById('subtaskFormRow').classList.add('hidden');
    toast('Subtarea creada', 'success');
    // Reload task to refresh subtask list
    const updated = await api.getTask(parentTaskId);
    _taskData = updated;
    renderTaskContent(updated);
    loadTaskComments(parentTaskId);
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
};
```

- [ ] **Step 4: Actualizar project.js para mostrar progreso de subtareas en task list**

En `renderTaskList()` en `project.js`, localizar la línea:
```javascript
${task.subtasks?.length ? `<span>🔀 ${task.subtasks.length} subtareas</span>` : ''}
```

Reemplazar con:
```javascript
${task.subtasks?.length ? `<span>🔀 ${task.subtasks.filter(s=>s.status==='completada').length}/${task.subtasks.length} subtareas</span>` : ''}
```

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/jeffr/OneDrive/Aplicaciones/Proyecto-CMS-jeff"
git add public/js/views/task.js public/js/views/project.js public/css/style.css
git commit -m "feat: crear subtareas desde detalle de tarea con progreso X/Y"
```

---

### Task 4: UI Etiquetas — asignar/quitar en tarea, chips en tarjetas

**Files:**
- Modify: `public/js/views/task.js` — sección de etiquetas en sidebar
- Modify: `public/js/views/project.js` — mostrar tags en task list
- Modify: `public/css/style.css` — estilos tag chips

- [ ] **Step 1: Agregar estilos de etiquetas en style.css**

Agregar al final de `public/css/style.css`:

```css
/* ── Etiquetas (tags) ────────────────────────────────────────── */
.tag-chip { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:500; cursor:default; }
.tag-chip .tag-remove { cursor:pointer; opacity:0.6; font-size:10px; padding:0 2px; }
.tag-chip .tag-remove:hover { opacity:1; }
.tags-wrap { display:flex; flex-wrap:wrap; gap:4px; margin-top:4px; }
.tag-selector { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
.tag-option { padding:3px 10px; border-radius:999px; font-size:12px; cursor:pointer; border:2px solid transparent; transition:border-color .15s; }
.tag-option:hover { border-color: rgba(0,0,0,.2); }
.tag-option.selected { border-color: rgba(0,0,0,.4); }
```

- [ ] **Step 2: Agregar sección de etiquetas en el sidebar de `renderTaskContent()` en task.js**

En `renderTaskContent()`, localizar el card de detalles (`<!-- Task details -->`). Después del último `<div style="padding:12px 16px">` (el de fecha de creación), agregar antes del cierre del `card-body`:

```html
            <div style="padding:12px 16px">
              <div class="text-xs text-gray mb-1">Etiquetas</div>
              <div class="tags-wrap" id="taskTagsWrap">
                ${(task.tags || []).map(tag => `
                  <span class="tag-chip" style="background:${tag.color}22;color:${tag.color}">
                    ${escHtml(tag.name)}
                    <span class="tag-remove" onclick="removeTagFromTask(${task.id}, ${tag.id})">✕</span>
                  </span>
                `).join('') || '<span class="text-xs text-gray">Sin etiquetas</span>'}
              </div>
              <button class="btn btn-ghost btn-sm mt-2" onclick="openTagManager(${task.id}, ${task.company_id || 0})">
                + Etiqueta
              </button>
            </div>
```

- [ ] **Step 3: Agregar funciones `openTagManager` y `removeTagFromTask` en task.js**

```javascript
window.openTagManager = async function(taskId, companyId) {
  const [allTags, taskTags] = await Promise.all([
    api.getTagsByCompany(companyId),
    Promise.resolve(_taskData.tags || [])
  ]);

  const assignedIds = new Set(taskTags.map(t => t.id));

  createModal({
    id: 'modalTags',
    title: 'Gestionar Etiquetas',
    body: `
      <div class="form-group">
        <label class="form-label">Etiquetas disponibles</label>
        <div class="tag-selector" id="tagSelectorList">
          ${allTags.length ? allTags.map(tag => `
            <span class="tag-option${assignedIds.has(tag.id) ? ' selected' : ''}"
              style="background:${tag.color}22;color:${tag.color};border-color:${assignedIds.has(tag.id) ? tag.color : 'transparent'}"
              onclick="toggleTaskTag(${taskId}, ${tag.id}, '${tag.color}', this)"
              data-assigned="${assignedIds.has(tag.id) ? '1' : '0'}">
              ${escHtml(tag.name)}
            </span>
          `).join('') : '<p class="text-sm text-gray">No hay etiquetas creadas aún.</p>'}
        </div>
      </div>
      <hr style="margin:16px 0">
      <div class="form-group">
        <label class="form-label">Nueva etiqueta</label>
        <div class="flex gap-2">
          <input class="form-control" id="newTagName" placeholder="Nombre de la etiqueta" style="flex:1">
          <input type="color" id="newTagColor" value="#6366f1" style="width:40px;height:38px;border:1px solid var(--gray-200);border-radius:6px;cursor:pointer;padding:2px">
          <button class="btn btn-primary btn-sm" onclick="createTagAndAssign(${taskId}, ${companyId})">Crear</button>
        </div>
      </div>
    `,
    footer: `<button class="btn btn-secondary" onclick="hideModal('modalTags')">Cerrar</button>`
  });
  showModal('modalTags');
};

window.toggleTaskTag = async function(taskId, tagId, color, el) {
  const isAssigned = el.dataset.assigned === '1';
  try {
    if (isAssigned) {
      await api.removeTag(taskId, tagId);
      el.dataset.assigned = '0';
      el.style.borderColor = 'transparent';
      el.classList.remove('selected');
    } else {
      await api.assignTag(taskId, tagId);
      el.dataset.assigned = '1';
      el.style.borderColor = color;
      el.classList.add('selected');
    }
    // Refresh tag display in sidebar
    const updated = await api.getTask(taskId);
    _taskData = updated;
    const wrap = document.getElementById('taskTagsWrap');
    if (wrap) {
      wrap.innerHTML = (updated.tags || []).map(tag => `
        <span class="tag-chip" style="background:${tag.color}22;color:${tag.color}">
          ${escHtml(tag.name)}
          <span class="tag-remove" onclick="removeTagFromTask(${taskId}, ${tag.id})">✕</span>
        </span>
      `).join('') || '<span class="text-xs text-gray">Sin etiquetas</span>';
    }
  } catch (err) { toast(err.message, 'error'); }
};

window.removeTagFromTask = async function(taskId, tagId) {
  try {
    await api.removeTag(taskId, tagId);
    const updated = await api.getTask(taskId);
    _taskData = updated;
    const wrap = document.getElementById('taskTagsWrap');
    if (wrap) {
      wrap.innerHTML = (updated.tags || []).map(tag => `
        <span class="tag-chip" style="background:${tag.color}22;color:${tag.color}">
          ${escHtml(tag.name)}
          <span class="tag-remove" onclick="removeTagFromTask(${taskId}, ${tag.id})">✕</span>
        </span>
      `).join('') || '<span class="text-xs text-gray">Sin etiquetas</span>';
    }
  } catch (err) { toast(err.message, 'error'); }
};

window.createTagAndAssign = async function(taskId, companyId) {
  const name = document.getElementById('newTagName')?.value.trim();
  const color = document.getElementById('newTagColor')?.value || '#6366f1';
  if (!name) return;
  try {
    const tag = await api.createTag({ company_id: companyId, name, color });
    await api.assignTag(taskId, tag.id);
    hideModal('modalTags');
    const updated = await api.getTask(taskId);
    _taskData = updated;
    const wrap = document.getElementById('taskTagsWrap');
    if (wrap) {
      wrap.innerHTML = (updated.tags || []).map(t => `
        <span class="tag-chip" style="background:${t.color}22;color:${t.color}">
          ${escHtml(t.name)}
          <span class="tag-remove" onclick="removeTagFromTask(${taskId}, ${t.id})">✕</span>
        </span>
      `).join('') || '<span class="text-xs text-gray">Sin etiquetas</span>';
    }
    toast('Etiqueta creada y asignada', 'success');
  } catch (err) { toast(err.message, 'error'); }
};
```

- [ ] **Step 4: Mostrar tags en las tarjetas de project.js**

En `renderTaskList()` en `project.js`, en el bloque `.task-item-meta`, agregar después del span de comentarios:

```javascript
${task.tags?.length ? task.tags.map(tag =>
  `<span class="tag-chip" style="background:${tag.color}22;color:${tag.color}">${escHtml(tag.name)}</span>`
).join('') : ''}
```

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/jeffr/OneDrive/Aplicaciones/Proyecto-CMS-jeff"
git add public/js/views/task.js public/js/views/project.js public/css/style.css
git commit -m "feat: etiquetas con color — asignar/quitar en tarea, chips en tarjetas"
```

---

### Task 5: UI Dependencias y Archivos Adjuntos

**Files:**
- Modify: `public/js/views/task.js` — secciones de dependencias y adjuntos en sidebar
- Modify: `public/css/style.css` — estilos de adjuntos y dependencias

- [ ] **Step 1: Agregar estilos en style.css**

Agregar al final de `public/css/style.css`:

```css
/* ── Dependencias ────────────────────────────────────────────── */
.dep-item { display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid var(--gray-100); font-size:13px; }
.dep-item:last-child { border-bottom:none; }
.dep-blocked-badge { background:#fee2e2; color:#b91c1c; font-size:11px; padding:2px 7px; border-radius:4px; font-weight:600; }

/* ── Archivos adjuntos ───────────────────────────────────────── */
.attachment-item { display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid var(--gray-100); font-size:13px; }
.attachment-item:last-child { border-bottom:none; }
.attachment-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:160px; }
.attachment-size { font-size:11px; color:var(--gray-400); }
.upload-zone { border:2px dashed var(--gray-200); border-radius:8px; padding:12px; text-align:center; cursor:pointer; transition:border-color .15s; }
.upload-zone:hover { border-color:var(--primary); }
```

- [ ] **Step 2: Agregar card de Dependencias en el sidebar de `renderTaskContent()` en task.js**

En `renderTaskContent()`, después del card de tiempo (`<!-- Time tracking -->`) y antes del cierre del `<!-- Sidebar -->`, agregar:

```html
        <!-- Dependencies -->
        <div class="card mb-4" id="depsCard">
          <div class="card-header">
            <span class="card-title">🔗 Dependencias</span>
            <button class="btn btn-primary btn-sm" onclick="openAddDependency(${task.id}, ${task.project_id})">+ Agregar</button>
          </div>
          <div class="card-body" id="depsList">
            ${(task.dependencies || []).length ? task.dependencies.map(d => `
              <div class="dep-item">
                <div>
                  <a href="#" onclick="App.navigate('tarea/${d.id}')" class="text-sm font-semibold">${escHtml(d.title)}</a>
                  <span class="status-badge status-${d.status}" style="font-size:10px;margin-left:4px">${statusLabel(d.status)}</span>
                  ${d.status !== 'completada' ? '<span class="dep-blocked-badge ml-2">Bloqueada</span>' : ''}
                </div>
                <button class="btn btn-ghost btn-sm" onclick="removeDep(${task.id}, ${d.id})">✕</button>
              </div>
            `).join('') : '<p class="text-sm text-gray">Sin dependencias.</p>'}
          </div>
        </div>

        <!-- Attachments -->
        <div class="card" id="attachmentsCard">
          <div class="card-header">
            <span class="card-title">📎 Adjuntos</span>
          </div>
          <div class="card-body">
            <div class="upload-zone" onclick="document.getElementById('attachInput').click()">
              <div class="text-sm text-gray">📁 Click para subir archivo</div>
              <div class="text-xs text-gray">Máx. 10 MB — JPG, PNG, PDF, DOC, XLS, ZIP, CSV</div>
            </div>
            <input type="file" id="attachInput" style="display:none"
              accept=".jpg,.jpeg,.png,.gif,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.csv"
              onchange="uploadAttachment(${task.id}, this)">
            <div id="attachmentsList" class="mt-3">
              ${renderAttachmentsList(task.attachments || [], task.id)}
            </div>
          </div>
        </div>
```

IMPORTANTE: En el GET de tarea individual en tasks.js (Task 1, Step 4), también debemos cargar los adjuntos. Agrega esto en `renderTaskContent` para que se carguen de la API si no vienen en el objeto task:

En `renderTask()` en task.js, después de `renderTaskContent(task)`, agregar:

```javascript
    loadTaskAttachments(id);
```

- [ ] **Step 3: Agregar funciones de dependencias y adjuntos en task.js**

```javascript
window.openAddDependency = async function(taskId, projectId) {
  const tasks = await api.getTasks(projectId);
  const current = (_taskData.dependencies || []).map(d => d.id);
  const available = tasks.filter(t => t.id !== taskId && !current.includes(t.id));

  if (!available.length) {
    toast('No hay otras tareas disponibles para agregar como dependencia', 'info');
    return;
  }

  createModal({
    id: 'modalAddDep',
    title: 'Agregar Dependencia',
    body: `
      <p class="text-sm text-gray mb-3">Esta tarea no podrá completarse hasta que la tarea seleccionada esté completada.</p>
      <div class="form-group">
        <label class="form-label">Tarea bloqueante</label>
        <select class="form-control" id="depSelect">
          <option value="">Seleccionar tarea...</option>
          ${available.map(t => `<option value="${t.id}">${escHtml(t.title)} (${statusLabel(t.status)})</option>`).join('')}
        </select>
      </div>
    `,
    footer: `
      <button class="btn btn-secondary" onclick="hideModal('modalAddDep')">Cancelar</button>
      <button class="btn btn-primary" onclick="submitAddDep(${taskId})">Agregar</button>
    `
  });
  showModal('modalAddDep');
};

window.submitAddDep = async function(taskId) {
  const depId = document.getElementById('depSelect')?.value;
  if (!depId) return;
  try {
    await api.addDependency(taskId, depId);
    hideModal('modalAddDep');
    toast('Dependencia agregada', 'success');
    const updated = await api.getTask(taskId);
    _taskData = updated;
    renderTaskContent(updated);
    loadTaskComments(taskId);
  } catch (err) { toast(err.message, 'error'); }
};

window.removeDep = async function(taskId, depId) {
  try {
    await api.removeDependency(taskId, depId);
    const updated = await api.getTask(taskId);
    _taskData = updated;
    renderTaskContent(updated);
    loadTaskComments(taskId);
    toast('Dependencia eliminada', 'success');
  } catch (err) { toast(err.message, 'error'); }
};

async function loadTaskAttachments(taskId) {
  try {
    const attachments = await api.getAttachments(taskId);
    const list = document.getElementById('attachmentsList');
    if (list) list.innerHTML = renderAttachmentsList(attachments, taskId);
  } catch (err) { /* silencioso */ }
}

function renderAttachmentsList(attachments, taskId) {
  if (!attachments.length) return '<p class="text-sm text-gray">Sin archivos adjuntos.</p>';
  return attachments.map(a => `
    <div class="attachment-item">
      <div>
        <div class="attachment-name" title="${escHtml(a.original_name)}">📄 ${escHtml(a.original_name)}</div>
        <div class="attachment-size">${(a.size / 1024).toFixed(1)} KB · ${escHtml(a.user_name)} · ${timeAgo(a.created_at)}</div>
      </div>
      <div class="flex gap-2">
        <a href="/api/attachments/${a.id}/download" class="btn btn-ghost btn-sm" download>⬇</a>
        ${a.user_id === App.user.id || App.user.role === 'admin' ? `
          <button class="btn btn-ghost btn-sm" onclick="deleteAttachmentItem(${a.id}, ${taskId})">🗑️</button>
        ` : ''}
      </div>
    </div>
  `).join('');
}

window.uploadAttachment = async function(taskId, input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  try {
    toast('Subiendo archivo...', 'info');
    await api.uploadAttachment(taskId, file);
    toast('Archivo subido', 'success');
    loadTaskAttachments(taskId);
  } catch (err) { toast(err.message, 'error'); }
};

window.deleteAttachmentItem = async function(attachId, taskId) {
  confirm('¿Eliminar este archivo?', async () => {
    try {
      await api.deleteAttachment(attachId);
      loadTaskAttachments(taskId);
      toast('Archivo eliminado', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
};
```

También actualizar la carga de adjuntos en el endpoint de tarea individual. En `src/routes/tasks.js`, en el `GET /:id`, después de `task.dependencies = ...`, agregar:

```javascript
  task.attachments = db.prepare(`
    SELECT a.*, u.name as user_name
    FROM attachments a JOIN users u ON u.id = a.user_id
    WHERE a.task_id = ? ORDER BY a.created_at DESC
  `).all(req.params.id);
```

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/jeffr/OneDrive/Aplicaciones/Proyecto-CMS-jeff"
git add public/js/views/task.js src/routes/tasks.js public/css/style.css
git commit -m "feat: dependencias entre tareas y archivos adjuntos con upload"
```
