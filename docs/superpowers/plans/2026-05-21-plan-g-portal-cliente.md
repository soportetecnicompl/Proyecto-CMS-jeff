# Plan G — Portal del Cliente

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portal separado en `/portal` donde clientes con rol `cliente` pueden ver sus proyectos e invoices, aprobar entregables, solicitar proyectos nuevos y agregar tareas — con UI limpia y profesional diferente al CMS interno.

**Architecture:** Archivo `public/portal.html` servido en `/portal` por Express. `public/js/portal-app.js` con su propio router SPA hash-based. `public/css/portal.css` con diseño limpio. Backend: `/api/portal/*` con middleware que verifica rol `cliente`. Login detecta rol y redirige automáticamente. Depende de Plan E (invoices) y Plan F (approve endpoints).

**Tech Stack:** Vanilla JS, Express, CSS custom properties, mismo JWT auth.

---

## Archivos

- Create: `public/portal.html`
- Create: `public/css/portal.css`
- Create: `public/js/portal-app.js`
- Create: `src/routes/portal.js`
- Modify: `server.js` — ruta `/portal` + `/api/portal`
- Modify: `src/routes/auth.js` — indicar rol en login para redirect
- Modify: `public/js/app.js` — detectar rol cliente al login

---

### Task 1: Rutas backend del portal

**Files:** Create `src/routes/portal.js`, Modify `server.js`

- [ ] **Step 1: Crear src/routes/portal.js**

```javascript
const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Middleware: verificar que el usuario tiene rol 'cliente' en alguna empresa
function clienteMiddleware(req, res, next) {
  const access = db.prepare(`SELECT company_id FROM company_users WHERE user_id = ? AND role = 'cliente'`).get(req.user.id);
  if (!access) return res.status(403).json({ error: 'Acceso solo para clientes' });
  req.clienteCompanyId = access.company_id;
  next();
}

router.use(authMiddleware, clienteMiddleware);

// GET /api/portal/me
router.get('/me', (req, res) => {
  const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(req.user.id);
  const company = db.prepare('SELECT c.*, cu.role as my_role FROM companies c JOIN company_users cu ON cu.company_id = c.id WHERE cu.user_id = ? AND cu.role = ?').get(req.user.id, 'cliente');
  res.json({ user, company });
});

// GET /api/portal/dashboard
router.get('/dashboard', (req, res) => {
  const cid = req.clienteCompanyId;
  const proyectos_activos = db.prepare(`SELECT COUNT(*) as n FROM projects WHERE company_id=? AND status='activo'`).get(cid).n;
  const facturas_pendientes = db.prepare(`SELECT COUNT(*) as n FROM invoices WHERE company_id=? AND estado='enviada'`).get(cid).n;
  const total_adeudado = db.prepare(`
    SELECT COALESCE(SUM(i.total - COALESCE((SELECT SUM(monto) FROM invoice_payments WHERE invoice_id=i.id),0)),0) as v
    FROM invoices i WHERE i.company_id=? AND i.estado='enviada'
  `).get(cid).v;
  const proximo_vencimiento = db.prepare(`
    SELECT fecha_vencimiento FROM invoices WHERE company_id=? AND estado='enviada' AND fecha_vencimiento IS NOT NULL
    ORDER BY fecha_vencimiento ASC LIMIT 1
  `).get(cid);
  const ultimasFacturas = db.prepare(`SELECT * FROM invoices WHERE company_id=? ORDER BY created_at DESC LIMIT 3`).all(cid);
  const proyectosActivos = db.prepare(`SELECT * FROM projects WHERE company_id=? AND status='activo' ORDER BY created_at DESC LIMIT 5`).all(cid);
  res.json({ proyectos_activos, facturas_pendientes, total_adeudado, proximo_vencimiento: proximo_vencimiento?.fecha_vencimiento, ultimasFacturas, proyectosActivos });
});

// GET /api/portal/projects
router.get('/projects', (req, res) => {
  const cid = req.clienteCompanyId;
  const projects = db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM tasks WHERE project_id=p.id AND parent_task_id IS NULL) as total_tareas,
      (SELECT COUNT(*) FROM tasks WHERE project_id=p.id AND status='completada' AND parent_task_id IS NULL) as completadas
    FROM projects p
    WHERE p.company_id=? AND (p.status != 'pendiente_aprobacion' OR p.created_by=?)
    ORDER BY p.created_at DESC
  `).all(cid, req.user.id);
  res.json(projects);
});

// POST /api/portal/projects — solicitar nuevo proyecto
router.post('/projects', (req, res) => {
  const { name, description, end_date } = req.body;
  if (!name || !description) return res.status(400).json({ error: 'Nombre y descripción requeridos' });
  const result = db.prepare(`
    INSERT INTO projects (company_id, name, description, status, end_date, created_by)
    VALUES (?, ?, ?, 'pendiente_aprobacion', ?, ?)
  `).run(req.clienteCompanyId, name.trim(), description.trim(), end_date||null, req.user.id);

  // Notify admin(s)
  try {
    const { createNotification } = require('./notifications');
    const admins = db.prepare(`SELECT id FROM users WHERE role='admin' AND is_active=1`).all();
    const company = db.prepare('SELECT name FROM companies WHERE id=?').get(req.clienteCompanyId);
    admins.forEach(a => createNotification(a.id, 'project_request', 'Nueva solicitud de proyecto',
      `${req.user.name} (${company?.name}) solicitó: "${name}"`, 'project', result.lastInsertRowid));
  } catch {}

  res.status(201).json(db.prepare('SELECT * FROM projects WHERE id=?').get(result.lastInsertRowid));
});

// GET /api/portal/projects/:id
router.get('/projects/:id', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id=? AND company_id=?').get(req.params.id, req.clienteCompanyId);
  if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' });
  if (project.status === 'pendiente_aprobacion' && project.created_by !== req.user.id) {
    return res.status(403).json({ error: 'Sin acceso' });
  }
  project.tasks = db.prepare(`SELECT id, title, status FROM tasks WHERE project_id=? AND parent_task_id IS NULL ORDER BY order_index ASC`).all(req.params.id);
  project.comments = db.prepare(`
    SELECT c.*, u.name as user_name FROM comments c JOIN users u ON u.id=c.user_id
    WHERE c.entity_type='project' AND c.entity_id=? ORDER BY c.created_at ASC
  `).all(req.params.id);
  project.decisions = db.prepare(`
    SELECT o.*, u.name as user_name FROM observations o JOIN users u ON u.id=o.user_id
    WHERE o.project_id=? AND o.type='decision' ORDER BY o.created_at DESC
  `).all(req.params.id);
  res.json(project);
});

// POST /api/portal/projects/:id/tasks — solicitar tarea
router.post('/projects/:id/tasks', (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ error: 'Título requerido' });
  const project = db.prepare('SELECT * FROM projects WHERE id=? AND company_id=? AND status=?').get(req.params.id, req.clienteCompanyId, 'activo');
  if (!project) return res.status(404).json({ error: 'Proyecto no encontrado o no activo' });
  const result = db.prepare(`INSERT INTO tasks (project_id, title, description, status, priority, created_by) VALUES (?,?,?,'pendiente','media',?)`).run(project.id, title.trim(), description?.trim()||null, req.user.id);
  res.status(201).json(db.prepare('SELECT * FROM tasks WHERE id=?').get(result.lastInsertRowid));
});

// POST /api/portal/projects/:id/comments
router.post('/projects/:id/comments', (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Contenido requerido' });
  const project = db.prepare('SELECT id FROM projects WHERE id=? AND company_id=?').get(req.params.id, req.clienteCompanyId);
  if (!project) return res.status(404).json({ error: 'Sin acceso' });
  const result = db.prepare(`INSERT INTO comments (entity_type, entity_id, user_id, content) VALUES ('project',?,?,?)`).run(req.params.id, req.user.id, content.trim());
  res.status(201).json(db.prepare(`SELECT c.*, u.name as user_name FROM comments c JOIN users u ON u.id=c.user_id WHERE c.id=?`).get(result.lastInsertRowid));
});

// GET /api/portal/invoices
router.get('/invoices', (req, res) => {
  const { estado } = req.query;
  let sql = `SELECT i.*, p.name as project_name FROM invoices i LEFT JOIN projects p ON p.id=i.project_id WHERE i.company_id=? AND i.estado != 'borrador' AND i.estado != 'anulada'`;
  const params = [req.clienteCompanyId];
  if (estado) { sql += ' AND i.estado=?'; params.push(estado); }
  sql += ' ORDER BY i.fecha_emision DESC';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/portal/invoices/:id
router.get('/invoices/:id', (req, res) => {
  const inv = db.prepare(`
    SELECT i.*, c.fiscal_name, c.rtn as company_rtn, c.fiscal_address, p.name as project_name
    FROM invoices i
    JOIN companies c ON c.id=i.company_id
    LEFT JOIN projects p ON p.id=i.project_id
    WHERE i.id=? AND i.company_id=? AND i.estado NOT IN ('borrador','anulada')
  `).get(req.params.id, req.clienteCompanyId);
  if (!inv) return res.status(404).json({ error: 'Factura no encontrada' });
  inv.payments = db.prepare('SELECT * FROM invoice_payments WHERE invoice_id=? ORDER BY fecha_pago DESC').all(req.params.id);
  inv.fiscal_config = db.prepare('SELECT * FROM fiscal_config WHERE id=1').get() || {};
  res.json(inv);
});

module.exports = router;
```

- [ ] **Step 2: Registrar en server.js**

Antes del SPA fallback (`app.get('*', ...)`), agregar:

```javascript
// Portal route
app.get('/portal', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'portal.html'));
});
app.use('/api/portal', require('./src/routes/portal'));
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/portal.js server.js
git commit -m "feat: rutas /api/portal/* — dashboard, proyectos, tareas, facturas para clientes"
```

---

### Task 2: Redirección automática por rol en login

**Files:** Modify `public/js/app.js`

- [ ] **Step 1: Detectar rol cliente en doLogin() y route()**

En `App.doLogin()`, después de `this.user = data.user`, agregar:

```javascript
      // Detectar rol cliente → portal
      const clienteAccess = await api.get('/portal/me').catch(() => null);
      if (clienteAccess) {
        window.location.href = '/portal';
        return;
      }
```

En `App.init()`, después de `this.user = await api.getMe()`, agregar:

```javascript
      // Si el usuario es cliente, redirigir al portal
      if (this.user) {
        const clienteCheck = await api.get('/portal/me').catch(() => null);
        if (clienteCheck) { window.location.href = '/portal'; return; }
      }
```

- [ ] **Step 2: Commit**

```bash
git add public/js/app.js
git commit -m "feat: redirección automática al portal para usuarios con rol cliente"
```

---

### Task 3: portal.html + portal.css

**Files:** Create `public/portal.html`, Create `public/css/portal.css`

- [ ] **Step 1: Crear public/portal.html**

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Portal del Cliente</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/portal.css">
</head>
<body>
  <div id="portal-app"></div>
  <div class="toast-container" id="toastContainer"></div>
  <script src="/js/api.js"></script>
  <script src="/js/portal-app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Crear public/css/portal.css**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --primary: #6366f1;
  --primary-dark: #4f46e5;
  --success: #10b981;
  --danger: #ef4444;
  --warning: #f59e0b;
  --gray-50: #f9fafb;
  --gray-100: #f3f4f6;
  --gray-200: #e5e7eb;
  --gray-300: #d1d5db;
  --gray-400: #9ca3af;
  --gray-500: #6b7280;
  --gray-600: #4b5563;
  --gray-700: #374151;
  --gray-800: #1f2937;
  --gray-900: #111827;
  --white: #ffffff;
  --shadow: 0 1px 3px rgba(0,0,0,.1), 0 1px 2px rgba(0,0,0,.06);
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,.1);
  --shadow-lg: 0 10px 15px -3px rgba(0,0,0,.1), 0 4px 6px -2px rgba(0,0,0,.05);
  --radius: 10px;
  --sidebar-w: 240px;
}

html { font-size: 16px; }
body { font-family: 'Inter', -apple-system, sans-serif; background: var(--gray-50); color: var(--gray-800); min-height: 100vh; }

/* Layout */
.portal-layout { display: flex; min-height: 100vh; }
.portal-sidebar { width: var(--sidebar-w); background: white; border-right: 1px solid var(--gray-200); position: fixed; left: 0; top: 0; bottom: 0; display: flex; flex-direction: column; z-index: 10; }
.portal-main { margin-left: var(--sidebar-w); flex: 1; display: flex; flex-direction: column; }

/* Sidebar */
.portal-header { padding: 20px; border-bottom: 1px solid var(--gray-100); }
.portal-header h2 { font-size: 16px; font-weight: 700; color: var(--gray-900); }
.portal-header p { font-size: 12px; color: var(--gray-400); margin-top: 2px; }
.portal-nav { flex: 1; padding: 12px; }
.portal-nav-item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 8px; cursor: pointer; font-size: 14px; color: var(--gray-600); text-decoration: none; transition: all .15s; margin-bottom: 2px; }
.portal-nav-item:hover { background: var(--gray-50); color: var(--gray-900); }
.portal-nav-item.active { background: linear-gradient(135deg, var(--primary), #a855f7); color: white; }
.portal-nav-item .icon { font-size: 17px; width: 20px; text-align: center; }
.portal-user { padding: 12px; border-top: 1px solid var(--gray-100); display: flex; align-items: center; gap: 10px; }
.portal-user-avatar { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, var(--primary), #a855f7); color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
.portal-user-info .name { font-size: 13px; font-weight: 600; }
.portal-user-info .company { font-size: 11px; color: var(--gray-400); }

/* Page */
.portal-page-header { background: white; border-bottom: 1px solid var(--gray-200); padding: 0 28px; height: 60px; display: flex; align-items: center; justify-content: space-between; }
.portal-page-header h1 { font-size: 18px; font-weight: 700; }
.portal-page-body { padding: 24px 28px; }

/* Cards */
.portal-card { background: white; border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden; margin-bottom: 16px; }
.portal-card-header { padding: 16px 20px; border-bottom: 1px solid var(--gray-100); display: flex; align-items: center; justify-content: space-between; }
.portal-card-title { font-size: 15px; font-weight: 600; }
.portal-card-body { padding: 20px; }

/* Stat cards */
.portal-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
.portal-stat { background: white; border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow); }
.portal-stat .icon { font-size: 28px; margin-bottom: 8px; }
.portal-stat .value { font-size: 22px; font-weight: 700; color: var(--gray-900); }
.portal-stat .label { font-size: 13px; color: var(--gray-500); margin-top: 2px; }

/* Buttons */
.portal-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; border: 1px solid transparent; transition: all .15s; }
.portal-btn-primary { background: linear-gradient(135deg, var(--primary), #a855f7); color: white; }
.portal-btn-primary:hover { opacity: .9; transform: translateY(-1px); }
.portal-btn-secondary { background: var(--gray-100); color: var(--gray-700); border-color: var(--gray-200); }
.portal-btn-secondary:hover { background: var(--gray-200); }
.portal-btn-sm { padding: 5px 11px; font-size: 13px; }
.portal-btn-ghost { background: none; color: var(--gray-600); border-color: transparent; }
.portal-btn-ghost:hover { background: var(--gray-100); }

/* Project cards */
.portal-project-card { background: white; border-radius: var(--radius); box-shadow: var(--shadow); padding: 20px; margin-bottom: 12px; cursor: pointer; transition: box-shadow .15s; border-left: 4px solid var(--primary); }
.portal-project-card:hover { box-shadow: var(--shadow-md); }
.portal-project-name { font-size: 15px; font-weight: 600; color: var(--gray-900); }
.portal-project-meta { font-size: 12px; color: var(--gray-500); margin-top: 4px; }
.portal-progress { height: 6px; background: var(--gray-100); border-radius: 3px; margin-top: 10px; }
.portal-progress-fill { height: 6px; background: linear-gradient(90deg, var(--primary), #a855f7); border-radius: 3px; transition: width .3s; }

/* Badges */
.portal-badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; }
.portal-badge-blue { background: #dbeafe; color: #1d4ed8; }
.portal-badge-green { background: #dcfce7; color: #15803d; }
.portal-badge-yellow { background: #fef9c3; color: #854d0e; }
.portal-badge-red { background: #fee2e2; color: #b91c1c; }
.portal-badge-gray { background: var(--gray-100); color: var(--gray-600); }
.portal-badge-pending { background: #fef3c7; color: #92400e; }

/* Invoice table */
.portal-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.portal-table th { padding: 10px 14px; background: var(--gray-50); border-bottom: 2px solid var(--gray-200); text-align: left; font-size: 11px; text-transform: uppercase; color: var(--gray-500); }
.portal-table td { padding: 10px 14px; border-bottom: 1px solid var(--gray-100); }
.portal-table tr:hover td { background: var(--gray-50); }

/* Forms */
.portal-form-group { margin-bottom: 16px; }
.portal-label { display: block; font-size: 13px; font-weight: 500; color: var(--gray-700); margin-bottom: 6px; }
.portal-input { width: 100%; padding: 8px 12px; border: 1px solid var(--gray-200); border-radius: 8px; font-size: 14px; outline: none; transition: border-color .15s; }
.portal-input:focus { border-color: var(--primary); }
.portal-textarea { resize: vertical; min-height: 80px; }

/* Comments */
.portal-comment { display: flex; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--gray-100); }
.portal-comment-avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--primary); color: white; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.portal-comment-body { flex: 1; }
.portal-comment-meta { font-size: 12px; color: var(--gray-500); margin-bottom: 3px; }
.portal-comment-content { font-size: 13px; line-height: 1.6; }

/* Auth */
.portal-auth { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
.portal-auth-card { background: white; border-radius: 16px; padding: 40px; width: 100%; max-width: 400px; box-shadow: var(--shadow-lg); }
.portal-auth-title { font-size: 22px; font-weight: 700; text-align: center; margin-bottom: 8px; }
.portal-auth-subtitle { font-size: 13px; color: var(--gray-500); text-align: center; margin-bottom: 24px; }

/* Utils */
.text-sm { font-size: 13px; }
.text-xs { font-size: 11px; }
.text-gray { color: var(--gray-500); }
.text-danger { color: var(--danger); }
.font-semibold { font-weight: 600; }
.mt-1 { margin-top: 4px; } .mt-2 { margin-top: 8px; } .mt-3 { margin-top: 12px; } .mt-4 { margin-top: 16px; }
.mb-2 { margin-bottom: 8px; } .mb-3 { margin-bottom: 12px; } .mb-4 { margin-bottom: 16px; }
.flex { display: flex; } .items-center { align-items: center; } .justify-between { justify-content: space-between; }
.gap-2 { gap: 8px; } .gap-3 { gap: 12px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.w-full { width: 100%; }
.hidden { display: none !important; }
.form-error { background: #fee2e2; color: #b91c1c; padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 12px; }

/* Loading */
.portal-loading { display: flex; align-items: center; justify-content: center; padding: 60px; }
.portal-spinner { width: 32px; height: 32px; border: 3px solid var(--gray-200); border-top-color: var(--primary); border-radius: 50%; animation: spin .7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Empty state */
.portal-empty { text-align: center; padding: 48px 20px; color: var(--gray-400); }
.portal-empty .icon { font-size: 40px; margin-bottom: 12px; }
.portal-empty h3 { font-size: 16px; font-weight: 600; color: var(--gray-600); margin-bottom: 6px; }

/* Responsive */
@media (max-width: 768px) {
  .portal-sidebar { transform: translateX(-100%); transition: transform .3s; }
  .portal-sidebar.open { transform: translateX(0); }
  .portal-main { margin-left: 0; }
  .portal-stats { grid-template-columns: 1fr 1fr; }
  .grid-2 { grid-template-columns: 1fr; }
}

/* Toast (reutiliza el CSS del sistema principal via api.js) */
.toast-container { position: fixed; top: 20px; right: 20px; z-index: 1000; display: flex; flex-direction: column; gap: 8px; }
.toast { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-radius: 10px; box-shadow: var(--shadow-lg); font-size: 14px; min-width: 260px; animation: toastIn .3s ease; }
.toast.success { background: #dcfce7; color: #15803d; }
.toast.error { background: #fee2e2; color: #b91c1c; }
.toast.warning { background: #fef9c3; color: #854d0e; }
.toast.info { background: #dbeafe; color: #1d4ed8; }
@keyframes toastIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
```

- [ ] **Step 3: Commit**

```bash
git add public/portal.html public/css/portal.css
git commit -m "feat: portal.html y portal.css — interfaz limpia para clientes"
```

---

### Task 4: portal-app.js — core, auth, layout

**Files:** Create `public/js/portal-app.js`

- [ ] **Step 1: Crear public/js/portal-app.js (parte 1: core)**

```javascript
const Portal = {
  user: null,
  company: null,

  async init() {
    const token = localStorage.getItem('cms_token');
    if (!token) { this.renderLogin(); return; }
    try {
      api.setToken(token);
      const me = await api.get('/portal/me');
      this.user = me.user;
      this.company = me.company;
      this.setupRouter();
      this.route();
    } catch {
      api.clearToken();
      this.renderLogin();
    }
  },

  setupRouter() {
    window.addEventListener('hashchange', () => this.route());
  },

  route() {
    const hash = window.location.hash.replace('#', '').replace(/^\//, '') || 'inicio';
    const parts = hash.split('/');
    const section = parts[0];

    if (section === 'inicio') renderPortalDashboard();
    else if (section === 'proyectos' && parts[1]) renderPortalProject(parts[1]);
    else if (section === 'proyectos') renderPortalProjects();
    else if (section === 'facturas' && parts[1]) renderPortalInvoice(parts[1]);
    else if (section === 'facturas') renderPortalInvoices();
    else if (section === 'solicitar') renderPortalRequestProject();
    else if (section === 'perfil') renderPortalProfile();
    else renderPortalDashboard();
  },

  navigate(path) { window.location.hash = path ? `/${path}` : ''; },

  logout() {
    api.clearToken();
    this.user = null;
    this.company = null;
    this.renderLogin();
  },

  renderLogin() {
    document.getElementById('portal-app').innerHTML = `
      <div class="portal-auth">
        <div class="portal-auth-card">
          <div class="portal-auth-title">Portal del Cliente</div>
          <div class="portal-auth-subtitle">Accede con las credenciales enviadas por email</div>
          <div id="loginError" class="form-error hidden"></div>
          <div class="portal-form-group">
            <label class="portal-label">Email</label>
            <input class="portal-input" id="loginEmail" type="email" placeholder="tu@correo.com"
              onkeydown="if(event.key==='Enter') Portal.doLogin()">
          </div>
          <div class="portal-form-group">
            <label class="portal-label">Contraseña</label>
            <input class="portal-input" id="loginPass" type="password" placeholder="••••••••"
              onkeydown="if(event.key==='Enter') Portal.doLogin()">
          </div>
          <button class="portal-btn portal-btn-primary w-full" onclick="Portal.doLogin()">Iniciar Sesión</button>
        </div>
      </div>
    `;
    setTimeout(() => document.getElementById('loginEmail')?.focus(), 50);
  },

  async doLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPass').value;
    const errEl = document.getElementById('loginError');
    if (!email || !password) { errEl.textContent = 'Ingresa email y contraseña'; errEl.classList.remove('hidden'); return; }
    try {
      const data = await api.login(email, password);
      api.setToken(data.token);
      const me = await api.get('/portal/me').catch(() => null);
      if (!me) {
        api.clearToken();
        errEl.textContent = 'Esta cuenta no tiene acceso al portal de clientes';
        errEl.classList.remove('hidden');
        return;
      }
      this.user = me.user;
      this.company = me.company;
      this.setupRouter();
      window.location.hash = '';
      this.route();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  },

  renderShell(activeSection, content) {
    const u = this.user;
    const c = this.company;
    const navItems = [
      { id: 'inicio', icon: '🏠', label: 'Inicio', path: '' },
      { id: 'proyectos', icon: '📁', label: 'Mis Proyectos', path: 'proyectos' },
      { id: 'facturas', icon: '📄', label: 'Mis Facturas', path: 'facturas' },
      { id: 'solicitar', icon: '📋', label: 'Solicitar Proyecto', path: 'solicitar' },
      { id: 'perfil', icon: '👤', label: 'Mi Perfil', path: 'perfil' },
    ];
    return `
      <div class="portal-layout">
        <aside class="portal-sidebar">
          <div class="portal-header">
            <h2>${escHtml(c?.fiscal_name || c?.name || 'Portal')}</h2>
            <p>Portal del Cliente</p>
          </div>
          <nav class="portal-nav">
            ${navItems.map(item => `
              <a class="portal-nav-item ${activeSection === item.id ? 'active' : ''}"
                href="#${item.path}" >
                <span class="icon">${item.icon}</span>
                <span>${item.label}</span>
              </a>
            `).join('')}
          </nav>
          <div class="portal-user">
            <div class="portal-user-avatar">${avatarInitials(u?.name||'?')}</div>
            <div class="portal-user-info" style="flex:1;min-width:0">
              <div class="name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(u?.name||'')}</div>
              <div class="company">${escHtml(c?.name||'')}</div>
            </div>
            <button onclick="Portal.logout()" style="background:none;border:none;cursor:pointer;color:var(--gray-400);font-size:18px" title="Salir">⏻</button>
          </div>
        </aside>
        <main class="portal-main">${content}</main>
      </div>
    `;
  }
};

window.addEventListener('DOMContentLoaded', () => Portal.init());
```

- [ ] **Step 2: Commit**

```bash
git add public/js/portal-app.js
git commit -m "feat: portal-app.js — core, auth, router, shell layout"
```

---

### Task 5: Portal — Dashboard e Inicio

**Files:** Modify `public/js/portal-app.js` (append)

- [ ] **Step 1: Agregar renderPortalDashboard al final de portal-app.js**

```javascript
async function renderPortalDashboard() {
  document.getElementById('portal-app').innerHTML = Portal.renderShell('inicio', `
    <div class="portal-page-header"><h1>Bienvenido, ${escHtml(Portal.user?.name||'')}</h1></div>
    <div class="portal-page-body">
      <div id="portalDashContent"><div class="portal-loading"><div class="portal-spinner"></div></div></div>
    </div>
  `);
  try {
    const data = await api.get('/portal/dashboard');
    const fmtL = n => `L ${parseFloat(n||0).toLocaleString('es-HN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
    document.getElementById('portalDashContent').innerHTML = `
      <div class="portal-stats">
        <div class="portal-stat">
          <div class="icon">📁</div>
          <div class="value">${data.proyectos_activos}</div>
          <div class="label">Proyectos activos</div>
        </div>
        <div class="portal-stat">
          <div class="icon">📄</div>
          <div class="value">${data.facturas_pendientes}</div>
          <div class="label">Facturas pendientes</div>
        </div>
        <div class="portal-stat">
          <div class="icon">💵</div>
          <div class="value" style="font-size:16px">${fmtL(data.total_adeudado)}</div>
          <div class="label">Total adeudado</div>
        </div>
        <div class="portal-stat">
          <div class="icon">📅</div>
          <div class="value" style="font-size:15px">${data.proximo_vencimiento ? formatDate(data.proximo_vencimiento) : '—'}</div>
          <div class="label">Próximo vencimiento</div>
        </div>
      </div>

      <div class="grid-2">
        <div class="portal-card">
          <div class="portal-card-header">
            <span class="portal-card-title">📁 Proyectos Activos</span>
            <a href="#proyectos" class="portal-btn portal-btn-ghost portal-btn-sm">Ver todos</a>
          </div>
          <div class="portal-card-body">
            ${data.proyectosActivos.length ? data.proyectosActivos.map(p => `
              <div class="portal-project-card" onclick="Portal.navigate('proyectos/${p.id}')">
                <div class="portal-project-name">${escHtml(p.name)}</div>
                <div class="portal-project-meta">${statusLabel(p.status)} · ${p.progress||0}% completado</div>
                <div class="portal-progress"><div class="portal-progress-fill" style="width:${p.progress||0}%"></div></div>
              </div>
            `).join('') : '<p class="text-sm text-gray">Sin proyectos activos.</p>'}
          </div>
        </div>

        <div class="portal-card">
          <div class="portal-card-header">
            <span class="portal-card-title">📄 Últimas Facturas</span>
            <a href="#facturas" class="portal-btn portal-btn-ghost portal-btn-sm">Ver todas</a>
          </div>
          <div class="portal-card-body">
            ${data.ultimasFacturas.length ? data.ultimasFacturas.map(inv => `
              <div class="flex justify-between items-center py-2" style="border-bottom:1px solid var(--gray-100)" onclick="Portal.navigate('facturas/${inv.id}')" style="cursor:pointer">
                <div>
                  <div class="text-sm font-semibold">#${escHtml(inv.numero_factura)}</div>
                  <div class="text-xs text-gray">${formatDate(inv.fecha_emision)}</div>
                </div>
                <div class="text-right">
                  <div class="text-sm font-semibold">L ${parseFloat(inv.total).toFixed(2)}</div>
                  <span class="portal-badge portal-badge-${inv.estado==='pagada'?'green':inv.estado==='enviada'?'blue':'gray'}">${inv.estado}</span>
                </div>
              </div>
            `).join('') : '<p class="text-sm text-gray">Sin facturas aún.</p>'}
          </div>
        </div>
      </div>
    `;
  } catch (err) { toast(err.message, 'error'); }
}
```

- [ ] **Step 2: Commit**

```bash
git add public/js/portal-app.js
git commit -m "feat: portal dashboard — stat cards, proyectos activos, últimas facturas"
```

---

### Task 6: Portal — Proyectos y detalle

**Files:** Modify `public/js/portal-app.js` (append)

- [ ] **Step 1: Agregar renderPortalProjects y renderPortalProject**

```javascript
async function renderPortalProjects() {
  document.getElementById('portal-app').innerHTML = Portal.renderShell('proyectos', `
    <div class="portal-page-header">
      <h1>📁 Mis Proyectos</h1>
      <button class="portal-btn portal-btn-primary portal-btn-sm" onclick="Portal.navigate('solicitar')">+ Solicitar Proyecto</button>
    </div>
    <div class="portal-page-body">
      <div id="portalProjList"><div class="portal-loading"><div class="portal-spinner"></div></div></div>
    </div>
  `);
  try {
    const projects = await api.get('/portal/projects');
    const container = document.getElementById('portalProjList');
    if (!projects.length) {
      container.innerHTML = '<div class="portal-empty"><div class="icon">📁</div><h3>Sin proyectos</h3><p>Solicita tu primer proyecto.</p></div>';
      return;
    }
    container.innerHTML = projects.map(p => {
      const isPending = p.status === 'pendiente_aprobacion';
      return `
        <div class="portal-project-card" onclick="Portal.navigate('proyectos/${p.id}')">
          <div class="flex justify-between items-center">
            <div class="portal-project-name">${escHtml(p.name)}</div>
            ${isPending ? '<span class="portal-badge portal-badge-pending">⏳ Pendiente aprobación</span>' :
              `<span class="portal-badge portal-badge-${p.status==='activo'?'blue':p.status==='completado'?'green':'gray'}">${statusLabel(p.status)}</span>`}
          </div>
          <div class="portal-project-meta mt-1">
            ${p.description ? escHtml(p.description.slice(0,80))+(p.description.length>80?'…':'') : 'Sin descripción'}
          </div>
          ${!isPending ? `
            <div class="flex items-center gap-3 mt-3">
              <div style="flex:1">
                <div class="portal-progress"><div class="portal-progress-fill" style="width:${p.progress||0}%"></div></div>
              </div>
              <span class="text-xs text-gray">${p.progress||0}%</span>
            </div>
            <div class="flex gap-3 mt-2 text-xs text-gray">
              ${p.start_date ? `<span>Inicio: ${formatDate(p.start_date)}</span>` : ''}
              ${p.end_date ? `<span>Entrega: ${formatDate(p.end_date)}</span>` : ''}
              <span>${p.total_tareas||0} tareas · ${p.completadas||0} completadas</span>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  } catch (err) { toast(err.message, 'error'); }
}

async function renderPortalProject(id) {
  document.getElementById('portal-app').innerHTML = Portal.renderShell('proyectos', `
    <div class="portal-page-header">
      <div class="flex items-center gap-3">
        <button class="portal-btn portal-btn-ghost portal-btn-sm" onclick="Portal.navigate('proyectos')">← Volver</button>
        <h1 id="projTitle">Cargando...</h1>
      </div>
      <div id="projActions"></div>
    </div>
    <div class="portal-page-body" id="projBody">
      <div class="portal-loading"><div class="portal-spinner"></div></div>
    </div>
  `);
  try {
    const p = await api.get(`/portal/projects/${id}`);
    document.getElementById('projTitle').textContent = p.name;
    if (p.status === 'activo') {
      document.getElementById('projActions').innerHTML = `
        <button class="portal-btn portal-btn-secondary portal-btn-sm" onclick="openPortalTaskModal(${p.id})">+ Solicitar Tarea</button>
      `;
    }
    document.getElementById('projBody').innerHTML = `
      <div class="grid-2" style="align-items:start">
        <div>
          <!-- Info -->
          <div class="portal-card">
            <div class="portal-card-body">
              ${p.description ? `<p class="text-sm" style="line-height:1.7;margin-bottom:16px">${escHtml(p.description)}</p>` : ''}
              <div class="flex gap-3 flex-wrap text-sm">
                <span class="portal-badge ${p.status==='activo'?'portal-badge-blue':p.status==='completado'?'portal-badge-green':'portal-badge-gray'}">${statusLabel(p.status)}</span>
                ${p.start_date ? `<span>📅 ${formatDate(p.start_date)}</span>` : ''}
                ${p.end_date ? `<span>🏁 ${formatDate(p.end_date)}</span>` : ''}
              </div>
              ${p.status !== 'pendiente_aprobacion' ? `
                <div class="mt-4">
                  <div class="flex justify-between text-sm mb-1">
                    <span>Progreso</span><span>${p.progress||0}%</span>
                  </div>
                  <div class="portal-progress"><div class="portal-progress-fill" style="width:${p.progress||0}%"></div></div>
                  <div class="text-xs text-gray mt-1">${p.tasks?.filter(t=>t.status==='completada').length||0} de ${p.tasks?.length||0} tareas completadas</div>
                </div>
                <div class="mt-4">
                  <h4 class="text-sm font-semibold mb-2">Tareas</h4>
                  ${p.tasks?.length ? p.tasks.map(t => `
                    <div class="flex items-center gap-2 py-1 text-sm">
                      <span style="width:8px;height:8px;border-radius:50%;background:${t.status==='completada'?'var(--success)':'var(--gray-300)'};flex-shrink:0"></span>
                      <span class="${t.status==='completada'?'text-gray':''}${t.status==='completada'?' line-through':''}">${escHtml(t.title)}</span>
                    </div>
                  `).join('') : '<p class="text-sm text-gray">Sin tareas aún.</p>'}
                </div>
              ` : '<div class="mt-4"><p class="text-sm" style="background:#fef9c3;padding:12px;border-radius:8px">⏳ Tu solicitud está pendiente de aprobación.</p></div>'}
            </div>
          </div>

          <!-- Decisions/Approvals -->
          ${p.decisions?.length ? `
            <div class="portal-card">
              <div class="portal-card-header"><span class="portal-card-title">✅ Aprobaciones requeridas</span></div>
              <div class="portal-card-body">
                ${p.decisions.map(d => `
                  <div style="border:1px solid var(--gray-200);border-radius:8px;padding:14px;margin-bottom:10px">
                    <div class="text-sm font-semibold mb-1">${escHtml(d.content)}</div>
                    <div class="text-xs text-gray mb-3">${escHtml(d.user_name)} · ${timeAgo(d.created_at)}</div>
                    <div class="flex gap-2">
                      <button class="portal-btn portal-btn-primary portal-btn-sm" onclick="portalApproveDecision(${p.id}, ${d.id}, 'approved')">✅ Aprobar</button>
                      <button class="portal-btn portal-btn-secondary portal-btn-sm" onclick="portalApproveDecision(${p.id}, ${d.id}, 'rejected')">❌ Rechazar</button>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Comments -->
        <div class="portal-card">
          <div class="portal-card-header"><span class="portal-card-title">💬 Comentarios</span></div>
          <div class="portal-card-body">
            <div id="portalComments" style="max-height:300px;overflow-y:auto;margin-bottom:16px">
              ${p.comments?.length ? p.comments.map(c => `
                <div class="portal-comment">
                  <div class="portal-comment-avatar">${avatarInitials(c.user_name)}</div>
                  <div class="portal-comment-body">
                    <div class="portal-comment-meta">${escHtml(c.user_name)} · ${timeAgo(c.created_at)}</div>
                    <div class="portal-comment-content">${escHtml(c.content)}</div>
                  </div>
                </div>
              `).join('') : '<p class="text-sm text-gray">Sin comentarios aún.</p>'}
            </div>
            <div class="portal-form-group">
              <textarea class="portal-input portal-textarea" id="portalCommentInput" placeholder="Escribe un comentario..."></textarea>
            </div>
            <button class="portal-btn portal-btn-primary portal-btn-sm" onclick="submitPortalComment(${p.id})">Comentar</button>
          </div>
        </div>
      </div>
    `;
  } catch (err) { toast(err.message, 'error'); }
}

window.openPortalTaskModal = function(projectId) {
  const overlay = document.createElement('div');
  overlay.id = 'portalTaskModal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.innerHTML = `
    <div style="background:white;border-radius:12px;padding:24px;width:100%;max-width:480px">
      <h3 style="font-size:16px;font-weight:700;margin-bottom:16px">Solicitar Nueva Tarea</h3>
      <div id="ptError" class="form-error hidden"></div>
      <div class="portal-form-group">
        <label class="portal-label">Título *</label>
        <input class="portal-input" id="ptTitle" placeholder="Describe brevemente la tarea">
      </div>
      <div class="portal-form-group">
        <label class="portal-label">Descripción</label>
        <textarea class="portal-input portal-textarea" id="ptDesc" placeholder="Detalles adicionales..."></textarea>
      </div>
      <div class="flex gap-2 justify-between mt-4">
        <button class="portal-btn portal-btn-secondary" onclick="document.getElementById('portalTaskModal').remove()">Cancelar</button>
        <button class="portal-btn portal-btn-primary" onclick="submitPortalTask(${projectId})">Enviar Solicitud</button>
      </div>
    </div>
  `;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  document.getElementById('ptTitle').focus();
};

window.submitPortalTask = async function(projectId) {
  const title = document.getElementById('ptTitle').value.trim();
  const errEl = document.getElementById('ptError');
  if (!title) { errEl.textContent = 'El título es requerido'; errEl.classList.remove('hidden'); return; }
  try {
    await api.post(`/portal/projects/${projectId}/tasks`, { title, description: document.getElementById('ptDesc').value.trim()||null });
    document.getElementById('portalTaskModal').remove();
    toast('Tarea solicitada. El equipo la revisará pronto.', 'success');
  } catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
};

window.submitPortalComment = async function(projectId) {
  const input = document.getElementById('portalCommentInput');
  const content = input?.value.trim();
  if (!content) return;
  try {
    const comment = await api.post(`/portal/projects/${projectId}/comments`, { content });
    input.value = '';
    const container = document.getElementById('portalComments');
    if (container) {
      const div = document.createElement('div');
      div.className = 'portal-comment';
      div.innerHTML = `<div class="portal-comment-avatar">${avatarInitials(Portal.user.name)}</div><div class="portal-comment-body"><div class="portal-comment-meta">${escHtml(Portal.user.name)} · ahora</div><div class="portal-comment-content">${escHtml(content)}</div></div>`;
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }
    toast('Comentario enviado', 'success');
  } catch (err) { toast(err.message, 'error'); }
};

window.portalApproveDecision = async function(projectId, obsId, decision) {
  const content = decision === 'approved' ? '✅ Aprobado por el cliente' : '❌ Rechazado por el cliente';
  try {
    await api.post(`/portal/projects/${projectId}/comments`, { content });
    toast(decision === 'approved' ? 'Aprobado' : 'Rechazado', 'success');
    renderPortalProject(projectId);
  } catch (err) { toast(err.message, 'error'); }
};
```

- [ ] **Step 2: Commit**

```bash
git add public/js/portal-app.js
git commit -m "feat: portal proyectos — lista, detalle, solicitar tarea, comentarios, aprobaciones"
```

---

### Task 7: Portal — Facturas, Solicitar Proyecto, Perfil

**Files:** Modify `public/js/portal-app.js` (append)

- [ ] **Step 1: Agregar funciones restantes al final de portal-app.js**

```javascript
async function renderPortalInvoices() {
  document.getElementById('portal-app').innerHTML = Portal.renderShell('facturas', `
    <div class="portal-page-header"><h1>📄 Mis Facturas</h1></div>
    <div class="portal-page-body">
      <div id="portalInvList"><div class="portal-loading"><div class="portal-spinner"></div></div></div>
    </div>
  `);
  try {
    const invoices = await api.get('/portal/invoices');
    const fmtL = n => `L ${parseFloat(n||0).toFixed(2)}`;
    const container = document.getElementById('portalInvList');
    if (!invoices.length) {
      container.innerHTML = '<div class="portal-empty"><div class="icon">📄</div><h3>Sin facturas</h3><p>Aquí aparecerán tus facturas cuando sean emitidas.</p></div>';
      return;
    }
    container.innerHTML = `
      <div class="portal-card">
        <table class="portal-table">
          <thead>
            <tr>
              <th>Número</th>
              <th>Fecha</th>
              <th>Descripción</th>
              <th style="text-align:right">Total</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${invoices.map(inv => `
              <tr onclick="Portal.navigate('facturas/${inv.id}')" style="cursor:pointer">
                <td class="font-semibold" style="color:var(--primary)">#${escHtml(inv.numero_factura)}</td>
                <td>${formatDate(inv.fecha_emision)}</td>
                <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(inv.descripcion)}</td>
                <td style="text-align:right;font-weight:600">${fmtL(inv.total)}</td>
                <td><span class="portal-badge portal-badge-${inv.estado==='pagada'?'green':inv.estado==='enviada'?'blue':inv.estado==='vencida'?'red':'gray'}">${inv.estado}</span></td>
                <td onclick="event.stopPropagation()">
                  ${inv.pdf_filename ? `<a href="/api/invoices/${inv.id}/download" class="portal-btn portal-btn-ghost portal-btn-sm" download>📥</a>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) { toast(err.message, 'error'); }
}

async function renderPortalInvoice(id) {
  document.getElementById('portal-app').innerHTML = Portal.renderShell('facturas', `
    <div class="portal-page-header">
      <div class="flex items-center gap-3">
        <button class="portal-btn portal-btn-ghost portal-btn-sm" onclick="Portal.navigate('facturas')">← Volver</button>
        <h1>Detalle de Factura</h1>
      </div>
    </div>
    <div class="portal-page-body" id="portalInvBody">
      <div class="portal-loading"><div class="portal-spinner"></div></div>
    </div>
  `);
  try {
    const inv = await api.get(`/portal/invoices/${id}`);
    const cfg = inv.fiscal_config || {};
    const tipDoc = cfg.tipo_documento === 'recibo_honorarios' ? 'RECIBO POR HONORARIOS' : 'FACTURA DE VENTA';
    const fmtL = n => `L ${parseFloat(n||0).toFixed(2)}`;
    const totalPagado = inv.payments.reduce((s,p)=>s+p.monto,0);

    document.getElementById('portalInvBody').innerHTML = `
      <div style="max-width:700px">
        <div class="invoice-sar portal-card" style="padding:24px">
          <div class="invoice-sar-header">
            <div class="invoice-sar-emisor">
              <strong style="font-size:14px">${escHtml(cfg.nombre_emisor||'—')}</strong><br>
              RTN: ${escHtml(cfg.rtn_emisor||'—')}<br>
              ${escHtml(cfg.direccion_emisor||'')}
            </div>
            <div class="invoice-sar-title">
              <div style="font-size:11px;color:var(--gray-500)">${tipDoc}</div>
              <div class="num">${escHtml(inv.numero_factura)}</div>
              <div style="font-size:12px">Emisión: ${formatDate(inv.fecha_emision)}</div>
              ${inv.fecha_vencimiento ? `<div style="font-size:12px">Vence: ${formatDate(inv.fecha_vencimiento)}</div>` : ''}
              ${inv.pdf_filename ? `<a href="/api/invoices/${inv.id}/download" class="portal-btn portal-btn-secondary portal-btn-sm mt-2" download>📥 Descargar PDF</a>` : ''}
            </div>
          </div>
          <div class="invoice-sar-cai">
            <strong>CAI:</strong> ${escHtml(cfg.cai||'—')} &nbsp;|&nbsp;
            <strong>Rango:</strong> ${escHtml(cfg.rango_inicio||'—')} – ${escHtml(cfg.rango_fin||'—')} &nbsp;|&nbsp;
            <strong>Fecha límite:</strong> ${formatDate(cfg.fecha_limite_emision)}
          </div>
          <div class="invoice-sar-parties">
            <div class="invoice-sar-party"><strong>Emisor</strong>${escHtml(cfg.nombre_emisor||'—')}<br>RTN: ${escHtml(cfg.rtn_emisor||'—')}</div>
            <div class="invoice-sar-party"><strong>Cliente</strong>${escHtml(inv.fiscal_name||inv.company_name||'—')}<br>RTN: ${escHtml(inv.company_rtn||'—')}<br>${escHtml(inv.fiscal_address||'')}</div>
          </div>
          <table class="invoice-table">
            <thead><tr><th>Descripción</th><th style="text-align:right">Gravado</th><th style="text-align:right">Exento</th><th style="text-align:right">Exonerado</th></tr></thead>
            <tbody><tr>
              <td>${escHtml(inv.descripcion)}</td>
              <td style="text-align:right">${fmtL(inv.monto_gravado)}</td>
              <td style="text-align:right">${fmtL(inv.monto_exento)}</td>
              <td style="text-align:right">${fmtL(inv.monto_exonerado)}</td>
            </tr></tbody>
          </table>
          <div class="invoice-totals">
            <div class="invoice-totals-grid">
              <div class="invoice-totals-row"><span>ISV (${inv.isv_porcentaje}%)</span><span>${fmtL(inv.isv_monto)}</span></div>
              <div class="invoice-totals-row total"><span>TOTAL</span><span>${fmtL(inv.total)}</span></div>
              ${inv.payments.length ? `<div class="invoice-totals-row" style="color:var(--success)"><span>Pagado</span><span>${fmtL(totalPagado)}</span></div>` : ''}
              ${inv.total - totalPagado > 0 ? `<div class="invoice-totals-row" style="color:var(--danger)"><span>Saldo</span><span>${fmtL(inv.total-totalPagado)}</span></div>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  } catch (err) { toast(err.message, 'error'); }
}

function renderPortalRequestProject() {
  document.getElementById('portal-app').innerHTML = Portal.renderShell('solicitar', `
    <div class="portal-page-header"><h1>📋 Solicitar Nuevo Proyecto</h1></div>
    <div class="portal-page-body" style="max-width:600px">
      <div class="portal-card">
        <div class="portal-card-body">
          <p class="text-sm text-gray mb-4">Describe el proyecto que necesitas y nos pondremos en contacto para discutir los detalles y presupuesto.</p>
          <div id="rpError" class="form-error hidden"></div>
          <div class="portal-form-group">
            <label class="portal-label">Nombre del Proyecto *</label>
            <input class="portal-input" id="rpName" placeholder="Ej: Rediseño de sitio web">
          </div>
          <div class="portal-form-group">
            <label class="portal-label">Descripción *</label>
            <textarea class="portal-input portal-textarea" id="rpDesc" rows="5" placeholder="Describe qué necesitas, objetivos, alcance estimado..."></textarea>
          </div>
          <div class="portal-form-group">
            <label class="portal-label">Fecha deseada de entrega</label>
            <input class="portal-input" type="date" id="rpFecha">
          </div>
          <div class="flex gap-2 mt-4">
            <button class="portal-btn portal-btn-secondary" onclick="Portal.navigate('proyectos')">Cancelar</button>
            <button class="portal-btn portal-btn-primary" onclick="submitPortalProject()">Enviar Solicitud</button>
          </div>
        </div>
      </div>
    </div>
  `);
}

window.submitPortalProject = async function() {
  const name = document.getElementById('rpName').value.trim();
  const desc = document.getElementById('rpDesc').value.trim();
  const errEl = document.getElementById('rpError');
  if (!name || !desc) { errEl.textContent = 'Nombre y descripción son requeridos'; errEl.classList.remove('hidden'); return; }
  try {
    await api.post('/portal/projects', { name, description: desc, end_date: document.getElementById('rpFecha').value || null });
    toast('¡Solicitud enviada! Te notificaremos cuando sea revisada.', 'success');
    Portal.navigate('proyectos');
  } catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
};

function renderPortalProfile() {
  const u = Portal.user;
  document.getElementById('portal-app').innerHTML = Portal.renderShell('perfil', `
    <div class="portal-page-header"><h1>👤 Mi Perfil</h1></div>
    <div class="portal-page-body" style="max-width:500px">
      <div class="portal-card">
        <div class="portal-card-body">
          <div style="text-align:center;margin-bottom:20px">
            <div class="portal-user-avatar" style="width:72px;height:72px;font-size:28px;margin:0 auto">${avatarInitials(u?.name||'?')}</div>
            <h3 style="margin-top:10px;font-size:16px;font-weight:600">${escHtml(u?.name||'')}</h3>
            <p class="text-gray text-sm">${escHtml(u?.email||'')}</p>
          </div>
          <div id="ppError" class="form-error hidden"></div>
          <div class="portal-form-group">
            <label class="portal-label">Nombre</label>
            <input class="portal-input" id="ppName" value="${escHtml(u?.name||'')}">
          </div>
          <button class="portal-btn portal-btn-primary" onclick="savePortalProfile()">Guardar</button>
        </div>
      </div>
    </div>
  `);
}

window.savePortalProfile = async function() {
  const name = document.getElementById('ppName').value.trim();
  const errEl = document.getElementById('ppError');
  if (!name) { errEl.textContent = 'Nombre requerido'; errEl.classList.remove('hidden'); return; }
  try {
    await api.updateProfile({ name });
    Portal.user.name = name;
    toast('Perfil actualizado', 'success');
    renderPortalProfile();
  } catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
};
```

- [ ] **Step 2: Commit final**

```bash
git add public/js/portal-app.js
git commit -m "feat: portal facturas, solicitar proyecto, perfil — portal cliente completo"
```

---

### Verificación final Plan G

- [ ] **Reiniciar servidor y probar el portal**

```bash
node server.js &
sleep 3
curl -s http://localhost:3000/portal | grep -o '<title>.*</title>'
```

Expected: `<title>Portal del Cliente</title>`

Pasos para probar:
1. Crear usuario con rol `cliente` en una empresa: invitar desde empresa con rol "cliente"
2. Aceptar invitación → verificar que redirige automáticamente a `/portal`
3. Login directo en `/portal` con credenciales del cliente
4. Verificar dashboard con stats
5. Ver proyectos, solicitar nuevo proyecto
6. Verificar notificación SSE al admin
7. Admin aprueba → cliente recibe notificación
8. Portal muestra factura (si hay alguna en estado `enviada` o `pagada`)

- [ ] **Push final**

```bash
git push origin main
```
