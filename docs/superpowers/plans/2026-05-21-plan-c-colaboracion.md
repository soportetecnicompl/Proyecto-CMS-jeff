# Plan C — Colaboración: Historial de Cambios, Notificaciones SSE, @Menciones

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar historial de actividad por tarea/proyecto, notificaciones en tiempo real via SSE cuando asignan tareas o comentan, y @menciones en comentarios con dropdown y notificación al mencionado.

**Architecture:** Historial: tabla `activity_log` + logs en tasks.js + tab/card en frontend. Notificaciones: tabla `notifications` + endpoint SSE en `/api/notifications/stream` (auth via query param token) + `notifyUser()` exportable para llamar desde otros routes + bell icon en sidebar. @Menciones: detectar `@username` en textarea con dropdown de usuarios de la empresa, persistir en texto del comentario, notificar al mencionado en comments.js.

**Tech Stack:** Express SSE (nativo), better-sqlite3, Vanilla JS EventSource API.

---

## Archivos modificados/creados

**Backend:**
- Modify: `src/database.js` — tablas `activity_log`, `notifications`
- Create: `src/routes/notifications.js` — SSE stream + REST notifs, exporta `notifyUser()`
- Modify: `src/routes/tasks.js` — log actividad + crear notif al asignar
- Modify: `src/routes/comments.js` — crear notif al comentar + detectar menciones
- Modify: `server.js` — registrar `/api/notifications`

**Frontend:**
- Modify: `public/js/api.js` — métodos notifications
- Modify: `public/js/app.js` — SSE init, bell icon en sidebar, dropdown notifs
- Modify: `public/js/views/task.js` — card historial en sidebar
- Modify: `public/js/views/project.js` — tab Historial
- Modify: `public/css/style.css` — estilos bell badge, notif dropdown, mention chip, activity log

---

### Task 1: Historial de cambios (DB + backend + frontend)

**Files:**
- Modify: `src/database.js`
- Modify: `src/routes/tasks.js`
- Modify: `public/js/views/task.js`
- Modify: `public/js/views/project.js`
- Modify: `public/css/style.css`

- [ ] **Step 1: Agregar tabla `activity_log` en `src/database.js`**

Dentro de `db.exec(...)`, después de la tabla `attachments`, agregar:

```sql
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      user_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_type, entity_id);
```

- [ ] **Step 2: Agregar función `logActivity` y llamadas en `src/routes/tasks.js`**

Al inicio de tasks.js (después de los require), agregar:

```javascript
function logActivity(entityType, entityId, userId, action, description) {
  db.prepare(`
    INSERT INTO activity_log (entity_type, entity_id, user_id, action, description)
    VALUES (?, ?, ?, ?, ?)
  `).run(entityType, entityId, userId, action, description);
}
```

En el endpoint `POST /` (crear tarea), después de `updateProjectProgress(project_id)`, agregar:
```javascript
  logActivity('task', result.lastInsertRowid, req.user.id, 'created', `Tarea creada: "${title}"`);
```

En el endpoint `PUT /:id` (actualizar tarea), después de `updateProjectProgress(task.project_id)`, agregar:
```javascript
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
```

En el endpoint `DELETE /:id`, antes del DELETE, agregar:
```javascript
  logActivity('task', req.params.id, req.user.id, 'deleted', `Tarea eliminada: "${task.title}"`);
```

También agregar endpoint para leer el historial al final de tasks.js (antes de `module.exports`):

```javascript
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
```

- [ ] **Step 3: Agregar método API en `public/js/api.js`**

En el objeto `api`, al final de los métodos de Tasks:

```javascript
  getTaskActivity: (taskId) => api.get(`/tasks/${taskId}/activity`),
```

- [ ] **Step 4: Agregar estilos de historial en `public/css/style.css`**

```css
/* ── Historial de actividad ──────────────────────────────────── */
.activity-log-item { display:flex; gap:10px; padding:8px 0; border-bottom:1px solid var(--gray-100); font-size:13px; }
.activity-log-item:last-child { border-bottom:none; }
.activity-log-dot { width:8px; height:8px; border-radius:50%; background:var(--primary); flex-shrink:0; margin-top:5px; }
.activity-log-body { flex:1; min-width:0; }
.activity-log-desc { color:var(--gray-700); line-height:1.4; }
.activity-log-meta { font-size:11px; color:var(--gray-400); margin-top:2px; }
```

- [ ] **Step 5: Agregar card de Historial en el sidebar de `renderTaskContent()` en task.js**

En `renderTaskContent()`, después del card de Adjuntos (al final del sidebar, antes del cierre de la columna derecha `</div>`), agregar:

```html
        <!-- Activity log -->
        <div class="card mt-4">
          <div class="card-header"><span class="card-title">📜 Historial</span></div>
          <div class="card-body" id="taskActivityLog">
            <p class="text-sm text-gray">Cargando...</p>
          </div>
        </div>
```

En `renderTask(id)`, después de `loadTaskAttachments(id)`, agregar:
```javascript
    loadTaskActivity(id);
```

Al final de task.js, agregar:

```javascript
async function loadTaskActivity(taskId) {
  try {
    const logs = await api.getTaskActivity(taskId);
    const container = document.getElementById('taskActivityLog');
    if (!container) return;
    container.innerHTML = logs.length ? logs.map(l => `
      <div class="activity-log-item">
        <div class="activity-log-dot"></div>
        <div class="activity-log-body">
          <div class="activity-log-desc">${escHtml(l.description || l.action)}</div>
          <div class="activity-log-meta">${escHtml(l.user_name || 'Sistema')} · ${timeAgo(l.created_at)}</div>
        </div>
      </div>
    `).join('') : '<p class="text-sm text-gray">Sin actividad registrada.</p>';
  } catch { /* silencioso */ }
}
```

- [ ] **Step 6: Agregar tab Historial en project.js**

En `renderProjectContent()`, en el bloque de tabs, agregar después de Métricas y antes de Comentarios:

```html
<button class="tab-btn" onclick="switchTab('tabHistory', this); loadProjectHistory(${project.id})">📜 Historial</button>
```

Agregar el div del tab después de `tabMetrics`:

```html
<div class="tab-pane" id="tabHistory">
  <div id="projectHistoryContent"><div class="loading-overlay" style="position:relative;height:100px"><div class="spinner"></div></div></div>
</div>
```

Al final de project.js, agregar:

```javascript
async function loadProjectHistory(projectId) {
  const container = document.getElementById('projectHistoryContent');
  if (!container) return;
  try {
    const tasks = window._allTasks || [];
    const taskIds = tasks.map(t => t.id);
    if (!taskIds.length) {
      container.innerHTML = '<div class="empty-state"><div class="icon">📜</div><h3>Sin actividad</h3></div>';
      return;
    }
    // Fetch activity for all tasks in parallel (max 10 at a time)
    const logs = await Promise.all(taskIds.slice(0, 20).map(id => api.getTaskActivity(id)));
    const all = logs.flat().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 50);
    container.innerHTML = all.length ? `
      <div class="card">
        <div class="card-body">
          ${all.map(l => `
            <div class="activity-log-item">
              <div class="activity-log-dot"></div>
              <div class="activity-log-body">
                <div class="activity-log-desc">${escHtml(l.description || l.action)}</div>
                <div class="activity-log-meta">${escHtml(l.user_name || 'Sistema')} · ${timeAgo(l.created_at)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : '<div class="empty-state"><div class="icon">📜</div><h3>Sin actividad registrada</h3></div>';
  } catch (err) { container.innerHTML = `<p class="text-danger text-sm">${escHtml(err.message)}</p>`; }
}

window.loadProjectHistory = loadProjectHistory;
```

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/jeffr/OneDrive/Aplicaciones/Proyecto-CMS-jeff"
git add src/database.js src/routes/tasks.js public/js/api.js public/js/app.js public/js/views/task.js public/js/views/project.js public/css/style.css
git commit -m "feat: historial de actividad en tareas y proyectos"
```

---

### Task 2: Notificaciones en tiempo real (SSE)

**Files:**
- Modify: `src/database.js`
- Create: `src/routes/notifications.js`
- Modify: `src/routes/tasks.js`
- Modify: `src/routes/comments.js`
- Modify: `server.js`
- Modify: `public/js/api.js`
- Modify: `public/js/app.js`
- Modify: `public/css/style.css`

- [ ] **Step 1: Agregar tabla `notifications` en `src/database.js`**

Después de la tabla `activity_log`:

```sql
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      entity_type TEXT,
      entity_id INTEGER,
      read_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);
```

- [ ] **Step 2: Crear `src/routes/notifications.js`**

```javascript
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// In-memory map of userId -> SSE response
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
  notifyUser(userId, { type: 'notification', notification: notif });
  return notif;
}

// SSE stream — auth via query param token (EventSource no soporta headers custom)
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

// GET /api/notifications — últimas 30 notificaciones del usuario
router.get('/', authMiddleware, (req, res) => {
  const notifs = db.prepare(`
    SELECT * FROM notifications WHERE user_id = ?
    ORDER BY created_at DESC LIMIT 30
  `).all(req.user.id);
  const unread = db.prepare('SELECT COUNT(*) as n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(req.user.id).n;
  res.json({ notifications: notifs, unread });
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
```

- [ ] **Step 3: Registrar ruta en `server.js`**

Después de `app.use('/api/search', ...)`:

```javascript
app.use('/api/notifications', require('./src/routes/notifications').router);
```

- [ ] **Step 4: Usar `createNotification` en `src/routes/tasks.js`**

Al inicio de tasks.js, después de los require existentes, agregar:

```javascript
const { createNotification } = require('./notifications');
```

En el endpoint `PUT /:id`, dentro del bloque de `if (assigned_to && assigned_to !== task.assigned_to ...)` que ya existe para enviar email, agregar después del sendTaskNotification:

```javascript
    if (assignedUser) {
      createNotification(
        assigned_to,
        'task_assigned',
        'Tarea asignada',
        `${req.user.name} te asignó: "${title || task.title}"`,
        'task', task.id
      );
    }
```

En el endpoint `POST /` (crear tarea), dentro del bloque `if (assigned_to && assigned_to !== req.user.id)`, agregar después del sendTaskNotification:

```javascript
    if (assignedUser) {
      createNotification(
        assigned_to,
        'task_assigned',
        'Nueva tarea asignada',
        `${req.user.name} te asignó: "${title}"`,
        'task', task.id
      );
    }
```

- [ ] **Step 5: Usar `createNotification` en `src/routes/comments.js`**

Al inicio de comments.js:

```javascript
const { createNotification } = require('./notifications');
```

En `POST /:type/:id` (agregar comentario), después de insertar el comentario y obtener el objeto `comment`, agregar:

```javascript
  // Notificar al asignado si el comentario es en una tarea
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
```

- [ ] **Step 6: Agregar métodos API en `public/js/api.js`**

En el objeto `api`, al final:

```javascript
  // Notifications
  getNotifications: () => api.get('/notifications'),
  markAllRead: () => api.put('/notifications/read-all', {}),
  markRead: (id) => api.put(`/notifications/${id}/read`, {}),
```

- [ ] **Step 7: Agregar estilos en `public/css/style.css`**

```css
/* ── Notificaciones ──────────────────────────────────────────── */
.notif-bell { position:relative; background:none; border:none; color:var(--gray-400); cursor:pointer; font-size:18px; padding:4px; border-radius:6px; transition:color .15s; }
.notif-bell:hover { color:white; }
.notif-badge { position:absolute; top:-2px; right:-2px; background:var(--danger); color:white; font-size:9px; font-weight:700; width:16px; height:16px; border-radius:50%; display:flex; align-items:center; justify-content:center; }
.notif-dropdown { position:fixed; bottom:70px; left:10px; width:320px; background:white; border-radius:12px; box-shadow:var(--shadow-lg); z-index:200; max-height:400px; overflow:hidden; display:flex; flex-direction:column; }
.notif-dropdown-header { padding:12px 16px; border-bottom:1px solid var(--gray-100); display:flex; justify-content:space-between; align-items:center; font-weight:600; font-size:14px; }
.notif-list { overflow-y:auto; flex:1; }
.notif-item { padding:10px 16px; border-bottom:1px solid var(--gray-100); cursor:pointer; transition:background .1s; }
.notif-item:hover { background:var(--gray-50); }
.notif-item.unread { background:var(--primary-light, #eff6ff); }
.notif-item.unread:hover { background:#dbeafe; }
.notif-item-title { font-size:13px; font-weight:600; }
.notif-item-body { font-size:12px; color:var(--gray-500); margin-top:2px; }
.notif-item-time { font-size:11px; color:var(--gray-400); margin-top:2px; }
.notif-empty { padding:24px; text-align:center; color:var(--gray-400); font-size:13px; }
```

- [ ] **Step 8: Agregar SSE init, bell icon y dropdown en `public/js/app.js`**

**8a.** En `App.init()`, después de `this.user = await api.getMe()`, agregar:
```javascript
      this.initSSE();
```

**8b.** Agregar métodos en el objeto App:

```javascript
  initSSE() {
    if (this._sseSource) { this._sseSource.close(); this._sseSource = null; }
    const token = api._token;
    if (!token) return;

    this._sseSource = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(token)}`);
    this._sseSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'notification') {
          this._updateBadge(1, true);
          const n = data.notification;
          toast(n.title + (n.body ? ': ' + n.body : ''), 'info');
        }
      } catch {}
    };
    this._sseSource.onerror = () => {
      if (this._sseSource) { this._sseSource.close(); this._sseSource = null; }
      setTimeout(() => { if (this.user) this.initSSE(); }, 10000);
    };
  },

  _updateBadge(delta, absolute) {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    const cur = parseInt(badge.textContent) || 0;
    const next = absolute ? delta : cur + delta;
    badge.textContent = next;
    badge.style.display = next > 0 ? 'flex' : 'none';
  },

  async openNotifications() {
    const existing = document.getElementById('notifDropdown');
    if (existing) { existing.remove(); return; }

    try {
      const { notifications, unread } = await api.getNotifications();
      const dropdown = document.createElement('div');
      dropdown.id = 'notifDropdown';
      dropdown.className = 'notif-dropdown';
      dropdown.innerHTML = `
        <div class="notif-dropdown-header">
          🔔 Notificaciones
          ${unread > 0 ? `<button class="btn btn-ghost btn-sm" onclick="App.markAllRead()">Marcar todas leídas</button>` : ''}
        </div>
        <div class="notif-list">
          ${notifications.length ? notifications.map(n => `
            <div class="notif-item${!n.read_at ? ' unread' : ''}"
              onclick="App.clickNotif(${n.id}, '${n.entity_type || ''}', ${n.entity_id || 0})">
              <div class="notif-item-title">${escHtml(n.title)}</div>
              ${n.body ? `<div class="notif-item-body">${escHtml(n.body)}</div>` : ''}
              <div class="notif-item-time">${timeAgo(n.created_at)}</div>
            </div>
          `).join('') : '<div class="notif-empty">Sin notificaciones</div>'}
        </div>
      `;

      document.body.appendChild(dropdown);
      setTimeout(() => document.addEventListener('click', function handler(e) {
        if (!dropdown.contains(e.target) && e.target.id !== 'notifBellBtn') {
          dropdown.remove();
          document.removeEventListener('click', handler);
        }
      }), 10);
    } catch (err) { toast(err.message, 'error'); }
  },

  async markAllRead() {
    await api.markAllRead();
    document.getElementById('notifDropdown')?.remove();
    this._updateBadge(0, true);
  },

  async clickNotif(notifId, entityType, entityId) {
    await api.markRead(notifId).catch(() => {});
    document.getElementById('notifDropdown')?.remove();
    if (entityType && entityId) {
      this.navigate(`${entityType}/${entityId}`);
    }
  },
```

**8c.** Cargar unread count al iniciar. En `App.init()`, después de `this.initSSE()`:

```javascript
      api.getNotifications().then(({ unread }) => {
        if (unread > 0) this._updateBadge(unread, true);
      }).catch(() => {});
```

**8d.** En `renderAppShell()`, en `.sidebar-user`, agregar ANTES del botón `.dark-toggle`:

```html
<button class="notif-bell" id="notifBellBtn" onclick="App.openNotifications()" title="Notificaciones">
  🔔
  <span class="notif-badge" id="notifBadge" style="display:none">0</span>
</button>
```

- [ ] **Step 9: Commit**

```bash
cd "C:/Users/jeffr/OneDrive/Aplicaciones/Proyecto-CMS-jeff"
git add src/database.js src/routes/notifications.js src/routes/tasks.js src/routes/comments.js server.js public/js/api.js public/js/app.js public/css/style.css
git commit -m "feat: notificaciones en tiempo real via SSE — asignaciones y comentarios"
```

---

### Task 3: @Menciones en comentarios

**Files:**
- Modify: `src/routes/comments.js` — detectar @menciones, crear notifs
- Modify: `public/js/views/task.js` — textarea con mention dropdown, render menciones
- Modify: `public/js/views/project.js` — idem para comentarios de proyecto
- Modify: `public/css/style.css` — estilos mention chip y dropdown

- [ ] **Step 1: Agregar estilos de menciones en `public/css/style.css`**

```css
/* ── @Menciones ──────────────────────────────────────────────── */
.mention { background:var(--primary-light, #dbeafe); color:var(--primary-dark, #1d4ed8); border-radius:4px; padding:0 3px; font-weight:500; }
.mention-dropdown { position:absolute; background:white; border:1px solid var(--gray-200); border-radius:8px; box-shadow:var(--shadow-md); z-index:300; max-height:180px; overflow-y:auto; min-width:180px; }
.mention-option { padding:8px 12px; cursor:pointer; font-size:13px; display:flex; align-items:center; gap:8px; }
.mention-option:hover { background:var(--gray-50); }
.mention-avatar-sm { width:24px; height:24px; border-radius:50%; background:var(--primary); color:white; font-size:10px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
```

- [ ] **Step 2: Actualizar comments.js para detectar menciones**

En `POST /:type/:id`, después de la notificación al asignado, agregar detección de @menciones:

```javascript
  // Detectar @menciones en el comentario y notificar
  const mentionRegex = /@([a-záéíóúñA-ZÁÉÍÓÚÑ\w]+(?:\s+[a-záéíóúñA-ZÁÉÍÓÚÑ\w]+)?)/g;
  const mentioned = new Set();
  let m;
  while ((m = mentionRegex.exec(content.trim())) !== null) {
    const namePart = m[1].toLowerCase().replace(/_/g, ' ');
    const user = db.prepare(`
      SELECT id FROM users WHERE LOWER(REPLACE(name, ' ', '_')) = ? OR LOWER(name) LIKE ?
    `).get(namePart.replace(/ /g, '_'), `%${namePart}%`);
    if (user && user.id !== req.user.id && !mentioned.has(user.id)) {
      mentioned.add(user.id);
      createNotification(
        user.id,
        'mention',
        'Te mencionaron',
        `${req.user.name} te mencionó en un comentario`,
        type, id
      );
    }
  }
```

- [ ] **Step 3: Agregar función `renderCommentContent()` global en `public/js/api.js`**

Al final de api.js:

```javascript
function renderCommentContent(text) {
  return escHtml(text).replace(/@([\wÀ-ɏ]+(?:\s+[\wÀ-ɏ]+)?)/g,
    '<span class="mention">@$1</span>');
}
```

- [ ] **Step 4: Actualizar renderizado de comentarios en task.js para resaltar @menciones**

En `loadTaskComments()`, en la línea que renderiza el contenido del comentario:
```javascript
<div class="comment-content">${escHtml(c.content)}</div>
```
Reemplazar con:
```javascript
<div class="comment-content">${renderCommentContent(c.content)}</div>
```

- [ ] **Step 5: Actualizar renderizado de comentarios en project.js para resaltar @menciones**

En `renderComments()` en project.js, misma sustitución:
```javascript
<div class="comment-content">${escHtml(c.content)}</div>
```
Por:
```javascript
<div class="comment-content">${renderCommentContent(c.content)}</div>
```

- [ ] **Step 6: Agregar función `initMentionTextarea()` en api.js**

Esta función convierte un textarea en uno con soporte de @menciones. La usarán task.js y project.js.

```javascript
function initMentionTextarea(textareaId, companyId) {
  const ta = document.getElementById(textareaId);
  if (!ta) return;

  let _users = [];
  let _mentionStart = -1;
  let _dropdown = null;

  function closeMentionDropdown() {
    if (_dropdown) { _dropdown.remove(); _dropdown = null; }
  }

  ta.addEventListener('keydown', (e) => {
    if (_dropdown) {
      if (e.key === 'ArrowDown') { e.preventDefault(); _dropdown.querySelector('.mention-option')?.focus(); }
      if (e.key === 'Escape') { closeMentionDropdown(); }
    }
  });

  ta.addEventListener('input', async () => {
    const val = ta.value;
    const pos = ta.selectionStart;
    const textBefore = val.slice(0, pos);
    const atMatch = textBefore.match(/@([\wÀ-ɏ]*)$/);

    if (!atMatch) { closeMentionDropdown(); _mentionStart = -1; return; }

    const query = atMatch[1].toLowerCase();
    _mentionStart = textBefore.lastIndexOf('@');

    if (!_users.length && companyId) {
      try { _users = await api.getCompanyUsers(companyId); } catch { _users = []; }
    }

    const matches = _users.filter(u => u.name.toLowerCase().includes(query)).slice(0, 6);
    if (!matches.length) { closeMentionDropdown(); return; }

    closeMentionDropdown();
    _dropdown = document.createElement('div');
    _dropdown.className = 'mention-dropdown';
    _dropdown.style.cssText = 'position:absolute;margin-top:4px';

    matches.forEach(u => {
      const opt = document.createElement('div');
      opt.className = 'mention-option';
      opt.tabIndex = 0;
      opt.innerHTML = `<div class="mention-avatar-sm">${avatarInitials(u.name)}</div><span>${escHtml(u.name)}</span>`;
      opt.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const before = ta.value.slice(0, _mentionStart);
        const after = ta.value.slice(ta.selectionStart);
        const mention = '@' + u.name.replace(/ /g, '_');
        ta.value = before + mention + ' ' + after;
        ta.selectionStart = ta.selectionEnd = before.length + mention.length + 1;
        closeMentionDropdown();
        ta.focus();
      });
      _dropdown.appendChild(opt);
    });

    const rect = ta.getBoundingClientRect();
    _dropdown.style.left = rect.left + 'px';
    _dropdown.style.top = (rect.top + rect.height + window.scrollY) + 'px';
    _dropdown.style.position = 'fixed';
    document.body.appendChild(_dropdown);
  });

  ta.addEventListener('blur', () => setTimeout(closeMentionDropdown, 200));
}
```

- [ ] **Step 7: Llamar `initMentionTextarea` desde task.js y project.js**

En `loadTaskComments()` en task.js, al final de la función después de renderizar los comentarios, agregar:
```javascript
    initMentionTextarea('taskCommentInput', _taskData?.company_id);
```

En `loadProjectComments()` en project.js, al final:
```javascript
    initMentionTextarea('projectCommentInput', _projectData?.company_id);
```

- [ ] **Step 8: Commit**

```bash
cd "C:/Users/jeffr/OneDrive/Aplicaciones/Proyecto-CMS-jeff"
git add src/routes/comments.js public/js/api.js public/js/views/task.js public/js/views/project.js public/css/style.css
git commit -m "feat: @menciones en comentarios con dropdown y notificación al mencionado"
```
