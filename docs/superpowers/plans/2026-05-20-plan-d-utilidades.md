# Plan D — Utilidades: Búsqueda Global, Exportar, Modo Oscuro

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar búsqueda global con modal Ctrl+K, exportar proyectos a Excel/CSV y PDF (print), y modo oscuro con toggle en sidebar.

**Architecture:** Búsqueda: backend `GET /api/search?q=` + modal overlay en frontend controlado desde `app.js`. Exportar: SheetJS CDN para Excel, Blob para CSV, `window.print()` para PDF — todo client-side sin nuevas dependencias de servidor. Modo oscuro: atributo `data-theme="dark"` en `<html>` + variables CSS, persistido en `localStorage`.

**Tech Stack:** Vanilla JS, SheetJS (CDN), CSS custom properties, `window.print()`.

---

## Archivos modificados/creados

- Create: `src/routes/search.js`
- Modify: `server.js`
- Modify: `public/js/api.js` — método `search(q)`
- Modify: `public/js/app.js` — modal de búsqueda, toggle dark mode, Ctrl+K listener, botón en sidebar
- Modify: `public/js/views/project.js` — botones de export en header del proyecto
- Modify: `public/index.html` — SheetJS CDN
- Modify: `public/css/style.css` — estilos búsqueda, print, dark mode

---

### Task 1: Búsqueda global (backend + modal frontend)

**Files:**
- Create: `src/routes/search.js`
- Modify: `server.js`
- Modify: `public/js/api.js`
- Modify: `public/js/app.js`
- Modify: `public/css/style.css`

- [ ] **Step 1: Crear `src/routes/search.js`**

```javascript
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
```

- [ ] **Step 2: Registrar la ruta en `server.js`**

Después de `app.use('/api/attachments', ...)`, agregar:

```javascript
app.use('/api/search', require('./src/routes/search'));
```

- [ ] **Step 3: Agregar método `search` en `public/js/api.js`**

En el objeto `api`, después de los métodos de `// Task dependencies`, agregar:

```javascript
  // Search
  search: (q) => api.get(`/search?q=${encodeURIComponent(q)}`),
```

- [ ] **Step 4: Agregar estilos del modal de búsqueda en `public/css/style.css`**

Agregar al final:

```css
/* ── Búsqueda global ─────────────────────────────────────────── */
.search-overlay { position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:500; display:flex; align-items:flex-start; justify-content:center; padding-top:80px; }
.search-modal { background:var(--white,white); border-radius:12px; width:100%; max-width:560px; box-shadow:var(--shadow-lg); overflow:hidden; }
.search-input-wrap { display:flex; align-items:center; gap:10px; padding:14px 16px; border-bottom:1px solid var(--gray-100); }
.search-input-wrap input { flex:1; border:none; outline:none; font-size:16px; background:transparent; color:var(--gray-900); }
.search-results { max-height:420px; overflow-y:auto; }
.search-section-title { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.5px; color:var(--gray-400); padding:10px 16px 4px; }
.search-result-item { display:flex; align-items:center; gap:10px; padding:10px 16px; cursor:pointer; transition:background .1s; }
.search-result-item:hover { background:var(--gray-50); }
.search-result-item .result-icon { font-size:16px; width:24px; text-align:center; flex-shrink:0; }
.search-result-item .result-body { flex:1; min-width:0; }
.search-result-item .result-title { font-size:14px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.search-result-item .result-meta { font-size:12px; color:var(--gray-500); }
.search-empty { padding:32px; text-align:center; color:var(--gray-400); font-size:14px; }
.search-hint { padding:10px 16px; font-size:11px; color:var(--gray-400); border-top:1px solid var(--gray-100); text-align:center; }
```

- [ ] **Step 5: Agregar modal de búsqueda y Ctrl+K en `public/js/app.js`**

En `App` object, dentro de `setupRouter()`, agregar el listener de Ctrl+K:

```javascript
  setupRouter() {
    window.addEventListener('hashchange', () => this.route());
    window.addEventListener('resize', () => this.initMobileBar());
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        App.openSearch();
      }
      if (e.key === 'Escape') App.closeSearch();
    });
  },
```

Agregar después de `navigate(path)`:

```javascript
  openSearch() {
    const existing = document.getElementById('searchOverlay');
    if (existing) { existing.querySelector('#globalSearchInput')?.focus(); return; }

    const overlay = document.createElement('div');
    overlay.id = 'searchOverlay';
    overlay.className = 'search-overlay';
    overlay.innerHTML = `
      <div class="search-modal">
        <div class="search-input-wrap">
          <span style="font-size:18px">🔍</span>
          <input id="globalSearchInput" placeholder="Buscar proyectos, tareas..." autocomplete="off">
          <button class="btn btn-ghost btn-sm" onclick="App.closeSearch()">✕</button>
        </div>
        <div class="search-results" id="searchResults">
          <div class="search-empty">Escribe al menos 2 caracteres para buscar...</div>
        </div>
        <div class="search-hint">Ctrl+K para abrir · Esc para cerrar</div>
      </div>
    `;
    overlay.addEventListener('click', e => { if (e.target === overlay) App.closeSearch(); });
    document.body.appendChild(overlay);

    const input = document.getElementById('globalSearchInput');
    input.focus();

    let _debounceTimer;
    input.addEventListener('input', () => {
      clearTimeout(_debounceTimer);
      const q = input.value.trim();
      if (q.length < 2) {
        document.getElementById('searchResults').innerHTML = '<div class="search-empty">Escribe al menos 2 caracteres para buscar...</div>';
        return;
      }
      document.getElementById('searchResults').innerHTML = '<div class="search-empty">Buscando...</div>';
      _debounceTimer = setTimeout(() => App._doSearch(q), 300);
    });
  },

  closeSearch() {
    document.getElementById('searchOverlay')?.remove();
  },

  async _doSearch(q) {
    try {
      const { tasks, projects } = await api.search(q);
      const container = document.getElementById('searchResults');
      if (!container) return;

      if (!tasks.length && !projects.length) {
        container.innerHTML = `<div class="search-empty">Sin resultados para "${escHtml(q)}"</div>`;
        return;
      }

      let html = '';

      if (projects.length) {
        html += `<div class="search-section-title">📁 Proyectos</div>`;
        html += projects.map(p => `
          <div class="search-result-item" onclick="App.closeSearch(); App.navigate('proyecto/${p.id}')">
            <span class="result-icon">📁</span>
            <div class="result-body">
              <div class="result-title">${escHtml(p.name)}</div>
              <div class="result-meta">${escHtml(p.company_name)} · <span class="status-badge status-${p.status}" style="font-size:10px">${statusLabel(p.status)}</span></div>
            </div>
          </div>
        `).join('');
      }

      if (tasks.length) {
        html += `<div class="search-section-title">✅ Tareas</div>`;
        html += tasks.map(t => `
          <div class="search-result-item" onclick="App.closeSearch(); App.navigate('tarea/${t.id}')">
            <span class="result-icon">${priorityIcon(t.priority)}</span>
            <div class="result-body">
              <div class="result-title">${escHtml(t.title)}</div>
              <div class="result-meta">${escHtml(t.project_name)} · ${escHtml(t.company_name)}</div>
            </div>
          </div>
        `).join('');
      }

      container.innerHTML = html;
    } catch (err) {
      const container = document.getElementById('searchResults');
      if (container) container.innerHTML = `<div class="search-empty text-danger">Error: ${escHtml(err.message)}</div>`;
    }
  },
```

- [ ] **Step 6: Agregar botón de búsqueda en `renderAppShell()` en app.js**

En `renderAppShell()`, en el bloque `<nav class="sidebar-nav">`, después del `<div class="nav-section-title">Navegación</div>` y antes del `${navItems.map(...)}`, agregar:

```html
          <div class="nav-item" onclick="App.openSearch()" style="cursor:pointer">
            <span class="icon">🔍</span>
            <span>Buscar</span>
            <span style="margin-left:auto;font-size:10px;opacity:.5;background:rgba(255,255,255,.1);padding:1px 5px;border-radius:4px">Ctrl+K</span>
          </div>
```

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/jeffr/OneDrive/Aplicaciones/Proyecto-CMS-jeff"
git add src/routes/search.js server.js public/js/api.js public/js/app.js public/css/style.css
git commit -m "feat: búsqueda global con modal Ctrl+K — proyectos y tareas"
```

---

### Task 2: Exportar proyecto a Excel/CSV y PDF

**Files:**
- Modify: `public/index.html` — SheetJS CDN
- Modify: `public/js/views/project.js` — botones export + funciones
- Modify: `public/css/style.css` — print styles

- [ ] **Step 1: Agregar SheetJS CDN en `public/index.html`**

Después del script de Chart.js, agregar:

```html
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
```

- [ ] **Step 2: Agregar estilos print en `public/css/style.css`**

Agregar al final:

```css
/* ── Print / Export ──────────────────────────────────────────── */
@media print {
  .sidebar, .page-header, .tabs, .tab-pane:not(#tabTasks),
  .task-item-actions, .btn, #mobileTopBar, .sidebar-overlay,
  .toast-container { display:none !important; }
  .main-content { margin-left:0 !important; }
  .task-item { break-inside:avoid; border-bottom:1px solid #ddd; padding:6px 0; }
  body { background:white; font-size:12px; }
  .print-header { display:block !important; margin-bottom:16px; }
}
.print-header { display:none; }
```

- [ ] **Step 3: Agregar botones de export en la cabecera del proyecto en `renderProjectContent()`**

En `renderProjectContent()` en `project.js`, localiza donde se setea `projectHeaderActions`:

```javascript
  document.getElementById('projectHeaderActions').innerHTML = `
    ${canEdit ? `<button class="btn btn-primary btn-sm" onclick="openCreateTask(${project.id})">+ Tarea</button>` : ''}
    ${canEdit ? `<button class="btn btn-secondary btn-sm" onclick="openEditProject(${project.id})">✏️ Editar</button>` : ''}
  `;
```

Reemplazar con:

```javascript
  document.getElementById('projectHeaderActions').innerHTML = `
    <button class="btn btn-ghost btn-sm" onclick="exportProjectCSV()" title="Exportar CSV">📥 CSV</button>
    <button class="btn btn-ghost btn-sm" onclick="exportProjectExcel()" title="Exportar Excel">📊 Excel</button>
    <button class="btn btn-ghost btn-sm" onclick="printProject()" title="Imprimir / PDF">🖨️</button>
    ${canEdit ? `<button class="btn btn-primary btn-sm" onclick="openCreateTask(${project.id})">+ Tarea</button>` : ''}
    ${canEdit ? `<button class="btn btn-secondary btn-sm" onclick="openEditProject(${project.id})">✏️ Editar</button>` : ''}
  `;
```

- [ ] **Step 4: Agregar función de print header al HTML del proyecto**

En `renderProjectContent()`, al inicio del `body.innerHTML = ...`, después de `<!-- Project Info -->`, agregar un elemento para el encabezado de impresión (solo visible al imprimir):

```html
    <!-- Print header (solo visible en print) -->
    <div class="print-header">
      <h1 style="font-size:20px;font-weight:700">${escHtml(project.name)}</h1>
      <p style="color:#666;margin:4px 0">Empresa: ${escHtml(project.company_name || '')} · Estado: ${statusLabel(project.status)} · Progreso: ${pct}%</p>
      <p style="color:#666;font-size:11px">Exportado el ${new Date().toLocaleDateString('es-ES', {day:'2-digit',month:'long',year:'numeric'})}</p>
      <hr style="margin:12px 0">
    </div>
```

- [ ] **Step 5: Agregar funciones de export al final de project.js**

Antes del cierre del archivo (antes de los `window.xxx = xxx`):

```javascript
window.exportProjectCSV = function() {
  const tasks = window._allTasks || [];
  const project = _projectData;
  if (!tasks.length) { toast('No hay tareas para exportar', 'warning'); return; }

  const headers = ['ID','Título','Estado','Prioridad','Asignado','Horas Est.','Horas Reg.','Vencimiento','Creado'];
  const rows = tasks.map(t => [
    t.id,
    t.title,
    statusLabel(t.status),
    priorityLabel(t.priority),
    t.assigned_name || '',
    t.estimated_hours || '',
    t.actual_hours || '',
    t.due_date || '',
    t.created_at ? new Date(t.created_at).toLocaleDateString('es-ES') : ''
  ]);

  const csv = [headers, ...rows].map(r =>
    r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
  ).join('\r\n');

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(project?.name || 'proyecto').replace(/[^a-z0-9]/gi,'_')}_tareas.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('CSV descargado', 'success');
};

window.exportProjectExcel = function() {
  if (typeof XLSX === 'undefined') { toast('SheetJS no disponible', 'error'); return; }
  const tasks = window._allTasks || [];
  const project = _projectData;
  if (!tasks.length) { toast('No hay tareas para exportar', 'warning'); return; }

  const data = [
    ['ID','Título','Estado','Prioridad','Asignado','Horas Est.','Horas Reg.','Vencimiento','Creado'],
    ...tasks.map(t => [
      t.id,
      t.title,
      statusLabel(t.status),
      priorityLabel(t.priority),
      t.assigned_name || '',
      t.estimated_hours || '',
      t.actual_hours || '',
      t.due_date || '',
      t.created_at ? new Date(t.created_at).toLocaleDateString('es-ES') : ''
    ])
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [8,40,14,12,20,10,10,14,12].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tareas');
  XLSX.writeFile(wb, `${(project?.name || 'proyecto').replace(/[^a-z0-9]/gi,'_')}_tareas.xlsx`);
  toast('Excel descargado', 'success');
};

window.printProject = function() {
  window.print();
};
```

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/jeffr/OneDrive/Aplicaciones/Proyecto-CMS-jeff"
git add public/index.html public/js/views/project.js public/css/style.css
git commit -m "feat: exportar proyecto a CSV, Excel y PDF (print)"
```

---

### Task 3: Modo oscuro

**Files:**
- Modify: `public/css/style.css` — variables dark mode bajo `[data-theme="dark"]`
- Modify: `public/js/app.js` — toggle, persist en localStorage, botón en sidebar, init al cargar

- [ ] **Step 1: Agregar variables de modo oscuro en `public/css/style.css`**

Agregar al final:

```css
/* ── Modo oscuro ─────────────────────────────────────────────── */
[data-theme="dark"] {
  --gray-50:  #1a1a2e;
  --gray-100: #16213e;
  --gray-200: #0f3460;
  --gray-300: #1a1a4e;
  --gray-400: #6b7280;
  --gray-500: #9ca3af;
  --gray-600: #d1d5db;
  --gray-700: #e5e7eb;
  --gray-800: #f3f4f6;
  --gray-900: #f9fafb;
  --white: #1e1e3f;
  color-scheme: dark;
}

[data-theme="dark"] body { background: #0d0d1a; color: var(--gray-800); }
[data-theme="dark"] .card { background: #1e1e3f; border: 1px solid #2a2a5a; }
[data-theme="dark"] .page-header { background: #1e1e3f; border-color: #2a2a5a; }
[data-theme="dark"] .sidebar { background: #0d0d1a; }
[data-theme="dark"] .form-control { background: #2a2a4a; border-color: #3a3a6a; color: var(--gray-800); }
[data-theme="dark"] .form-control:focus { background: #2a2a4a; }
[data-theme="dark"] .task-item { border-color: #2a2a5a; }
[data-theme="dark"] .task-item:hover { background: #2a2a4a; }
[data-theme="dark"] .modal { background: #1e1e3f; border: 1px solid #2a2a5a; }
[data-theme="dark"] .modal-overlay { background: rgba(0,0,0,.7); }
[data-theme="dark"] .search-modal { background: #1e1e3f; }
[data-theme="dark"] .search-input-wrap { border-color: #2a2a5a; }
[data-theme="dark"] .search-input-wrap input { color: var(--gray-800); }
[data-theme="dark"] .search-result-item:hover { background: #2a2a4a; }
[data-theme="dark"] select { background: #2a2a4a; color: var(--gray-800); }
[data-theme="dark"] .tabs { border-color: #2a2a5a; }
[data-theme="dark"] .tab-btn { color: var(--gray-500); }
[data-theme="dark"] .tab-btn.active { border-color: var(--primary); color: var(--primary); }
[data-theme="dark"] .kanban-column { background: #1e1e3f; border-color: #2a2a5a; }
[data-theme="dark"] .kanban-task { background: #2a2a4a; border-color: #3a3a6a; }
[data-theme="dark"] .stat-card { background: #1e1e3f; }
[data-theme="dark"] .company-card { background: #1e1e3f; }

.dark-toggle { background:none; border:none; color:var(--gray-400); cursor:pointer; font-size:18px; padding:4px; border-radius:6px; transition:color .15s; }
.dark-toggle:hover { color:white; }
```

- [ ] **Step 2: Agregar toggle de modo oscuro en `App` object en app.js**

En el objeto `App`, después de `initMobileBar()`, agregar:

```javascript
  initTheme() {
    if (localStorage.getItem('theme') === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  },

  toggleDarkMode() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    }
    // Update toggle button icon in sidebar
    document.querySelectorAll('.dark-toggle').forEach(btn => {
      btn.textContent = isDark ? '🌙' : '☀️';
      btn.title = isDark ? 'Activar modo oscuro' : 'Desactivar modo oscuro';
    });
  },
```

- [ ] **Step 3: Llamar `initTheme()` al inicio de `init()` en app.js**

En `App.init()`, como primera línea del método (antes de `const token = ...`):

```javascript
  async init() {
    this.initTheme();
    const token = localStorage.getItem('cms_token');
    // ... resto igual
```

- [ ] **Step 4: Agregar botón dark mode en `renderAppShell()` en app.js**

En el bloque `.sidebar-user`, localiza el botón de logout:
```html
<button class="btn-logout" onclick="App.logout()" title="Cerrar sesión">⏻</button>
```

Agregar ANTES de ese botón:
```html
<button class="dark-toggle" onclick="App.toggleDarkMode()"
  title="${document.documentElement.getAttribute('data-theme')==='dark' ? 'Desactivar modo oscuro' : 'Activar modo oscuro'}">
  ${document.documentElement.getAttribute('data-theme')==='dark' ? '☀️' : '🌙'}
</button>
```

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/jeffr/OneDrive/Aplicaciones/Proyecto-CMS-jeff"
git add public/js/app.js public/css/style.css
git commit -m "feat: modo oscuro con toggle en sidebar y persistencia en localStorage"
```
