# Plan F — Dashboard Financiero + Flujo de Aprobación de Proyectos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dashboard financiero con métricas por empresa/proyecto y período, gráfica mensual de facturado vs cobrado, y flujo de aprobación para proyectos solicitados por clientes.

**Architecture:** 3 nuevas rutas backend de finanzas (`/api/finance/*`) con queries agregadas. Nueva vista `public/js/views/finance.js`. Tab "Solicitudes" en la vista de empresa para aprobar/rechazar proyectos con `status='pendiente_aprobacion'`. Depende de Plan E (tablas `invoices`, `invoice_payments` deben existir).

**Tech Stack:** Express, better-sqlite3, Chart.js (ya instalado), Vanilla JS.

---

## Archivos

- Create: `src/routes/finance.js`
- Modify: `server.js`
- Modify: `src/routes/projects.js` — endpoints approve/reject
- Modify: `public/js/api.js`
- Create: `public/js/views/finance.js`
- Modify: `public/js/views/company.js` — tab Solicitudes
- Modify: `public/js/app.js` — ruta #/finanzas
- Modify: `public/index.html` — agregar finance.js
- Modify: `public/css/style.css`

---

### Task 1: Rutas backend de finanzas

**Files:** Create `src/routes/finance.js`, Modify `server.js`

- [ ] **Step 1: Crear src/routes/finance.js**

```javascript
const express = require('express');
const db = require('../database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, adminMiddleware);

// GET /api/finance/summary?desde=&hasta=
router.get('/summary', (req, res) => {
  const { desde, hasta } = req.query;
  const dateFilter = buildDateFilter(desde, hasta);

  const facturado = db.prepare(`SELECT COALESCE(SUM(total),0) as v FROM invoices WHERE estado != 'anulada' ${dateFilter.sql}`)
    .get(...dateFilter.params).v;
  const cobrado = db.prepare(`
    SELECT COALESCE(SUM(ip.monto),0) as v FROM invoice_payments ip
    JOIN invoices i ON i.id = ip.invoice_id
    WHERE i.estado != 'anulada' ${dateFilter.sql ? dateFilter.sql.replace(/fecha_emision/g,'ip.fecha_pago') : ''}
  `).get(...dateFilter.params).v;
  const pendiente = db.prepare(`SELECT COALESCE(SUM(total),0) as v FROM invoices WHERE estado='enviada' ${dateFilter.sql}`).get(...dateFilter.params).v;
  const vencido = db.prepare(`
    SELECT COALESCE(SUM(total),0) as v FROM invoices
    WHERE estado='enviada' AND fecha_vencimiento < date('now') ${dateFilter.sql}
  `).get(...dateFilter.params).v;
  const totalContratos = db.prepare(`SELECT COALESCE(SUM(contract_value),0) as v FROM projects WHERE status='activo'`).get().v;
  const porEstado = db.prepare(`SELECT estado, COUNT(*) as n FROM invoices WHERE estado != 'anulada' GROUP BY estado`).all();

  res.json({ facturado, cobrado, pendiente, vencido, totalContratos, porEstado });
});

// GET /api/finance/by-company?desde=&hasta=
router.get('/by-company', (req, res) => {
  const { desde, hasta } = req.query;
  const dateFilter = buildDateFilter(desde, hasta);

  const companies = db.prepare(`
    SELECT c.id, c.name, c.color,
      COALESCE((SELECT SUM(contract_value) FROM projects WHERE company_id=c.id AND status='activo'),0) as contratos_activos,
      COALESCE((SELECT SUM(total) FROM invoices WHERE company_id=c.id AND estado!='anulada' ${dateFilter.sql}),0) as facturado,
      COALESCE((SELECT SUM(ip.monto) FROM invoice_payments ip JOIN invoices i ON i.id=ip.invoice_id WHERE i.company_id=c.id AND i.estado!='anulada' ${dateFilter.sql ? dateFilter.sql.replace(/fecha_emision/g,'ip.fecha_pago') : ''}),0) as cobrado
    FROM companies c
    ORDER BY facturado DESC
  `).all(...dateFilter.params, ...dateFilter.params);

  // Projects per company
  companies.forEach(c => {
    c.pendiente = c.facturado - c.cobrado;
    c.projects = db.prepare(`
      SELECT p.id, p.name, p.billing_frequency, p.contract_value, p.status,
        COALESCE((SELECT SUM(total) FROM invoices WHERE project_id=p.id AND estado!='anulada'),0) as facturado_proyecto
      FROM projects p WHERE p.company_id=? ORDER BY p.created_at DESC
    `).all(c.id);
    c.projects.forEach(p => {
      p.pct_cobrado = p.contract_value > 0 ? Math.round((p.facturado_proyecto/p.contract_value)*100) : 0;
    });
  });

  res.json(companies);
});

// GET /api/finance/chart — últimos 12 meses
router.get('/chart', (req, res) => {
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    months.push({ label: `${d.toLocaleString('es', {month:'short'})} ${y}`, desde: `${y}-${m}-01`, hasta: `${y}-${m}-31` });
  }

  const data = months.map(mo => {
    const facturado = db.prepare(`SELECT COALESCE(SUM(total),0) as v FROM invoices WHERE estado!='anulada' AND fecha_emision >= ? AND fecha_emision <= ?`).get(mo.desde, mo.hasta).v;
    const cobrado = db.prepare(`SELECT COALESCE(SUM(ip.monto),0) as v FROM invoice_payments ip JOIN invoices i ON i.id=ip.invoice_id WHERE i.estado!='anulada' AND ip.fecha_pago >= ? AND ip.fecha_pago <= ?`).get(mo.desde, mo.hasta).v;
    return { label: mo.label, facturado, cobrado };
  });

  res.json(data);
});

// GET /api/finance/upcoming — facturas próximas a vencer o vencidas
router.get('/upcoming', (req, res) => {
  const invoices = db.prepare(`
    SELECT i.*, c.name as company_name
    FROM invoices i JOIN companies c ON c.id=i.company_id
    WHERE i.estado='enviada' AND i.fecha_vencimiento IS NOT NULL
      AND i.fecha_vencimiento <= date('now', '+30 days')
    ORDER BY i.fecha_vencimiento ASC
    LIMIT 20
  `).all();
  res.json(invoices);
});

function buildDateFilter(desde, hasta) {
  const params = [];
  let sql = '';
  if (desde) { sql += ' AND fecha_emision >= ?'; params.push(desde); }
  if (hasta) { sql += ' AND fecha_emision <= ?'; params.push(hasta); }
  return { sql, params };
}

module.exports = router;
```

- [ ] **Step 2: Registrar en server.js**

```javascript
app.use('/api/finance', require('./src/routes/finance'));
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/finance.js server.js
git commit -m "feat: rutas /api/finance — summary, by-company, chart, upcoming"
```

---

### Task 2: Endpoints de aprobación en projects.js

**Files:** Modify `src/routes/projects.js`

- [ ] **Step 1: Agregar endpoints approve/reject en projects.js**

Lee `src/routes/projects.js`. Al final, antes de `module.exports = router`, agregar:

```javascript
// GET /api/projects/pending — proyectos pendientes de aprobación (admin only)
router.get('/pending', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Sin acceso' });
  const projects = db.prepare(`
    SELECT p.*, c.name as company_name, u.name as creator_name
    FROM projects p
    JOIN companies c ON c.id = p.company_id
    LEFT JOIN users u ON u.id = p.created_by
    WHERE p.status = 'pendiente_aprobacion'
    ORDER BY p.created_at DESC
  `).all();
  res.json(projects);
});

// PUT /api/projects/:id/approve
router.put('/:id/approve', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Sin acceso' });
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' });
  db.prepare("UPDATE projects SET status = 'activo' WHERE id = ?").run(req.params.id);

  // Notify the creator (client)
  try {
    const { createNotification } = require('./notifications');
    createNotification(project.created_by, 'project_approved', 'Proyecto aprobado',
      `Tu proyecto "${project.name}" fue aprobado`, 'project', project.id);
  } catch {}

  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id));
});

// PUT /api/projects/:id/reject
router.put('/:id/reject', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Sin acceso' });
  const { reason } = req.body;
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' });
  db.prepare("UPDATE projects SET status = 'cancelado' WHERE id = ?").run(req.params.id);

  try {
    const { createNotification } = require('./notifications');
    createNotification(project.created_by, 'project_rejected', 'Proyecto rechazado',
      `Tu proyecto "${project.name}" fue rechazado${reason ? ': ' + reason : ''}`, 'project', project.id);
  } catch {}

  res.json({ success: true });
});
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/projects.js
git commit -m "feat: endpoints approve/reject para proyectos pendientes de clientes"
```

---

### Task 3: Métodos API frontend + configuración

**Files:** Modify `public/js/api.js`, Modify `public/js/app.js`, Modify `public/index.html`

- [ ] **Step 1: Agregar métodos en api.js**

Al final del objeto `api`:

```javascript
  // Finance
  getFinanceSummary: (params = {}) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v])=>v))).toString();
    return api.get(`/finance/summary${q?'?'+q:''}`);
  },
  getFinanceByCompany: (params = {}) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v])=>v))).toString();
    return api.get(`/finance/by-company${q?'?'+q:''}`);
  },
  getFinanceChart: () => api.get('/finance/chart'),
  getUpcomingInvoices: () => api.get('/finance/upcoming'),

  // Project approvals
  getPendingProjects: () => api.get('/projects/pending'),
  approveProject: (id) => api.put(`/projects/${id}/approve`, {}),
  rejectProject: (id, reason) => api.put(`/projects/${id}/reject`, { reason }),
```

- [ ] **Step 2: Agregar ruta #/finanzas en app.js**

En `App.route()`, después del bloque de `config-fiscal`:

```javascript
    } else if (hash === 'finanzas') {
      if (this.user.role !== 'admin') { this.navigate(''); return; }
      renderFinance();
    }
```

- [ ] **Step 3: Agregar finance.js en index.html**

Antes de `<script src="/js/app.js">`:
```html
<script src="/js/views/finance.js"></script>
```

- [ ] **Step 4: Agregar "📊 Finanzas" al sidebar en app.js**

En `navItems` dentro de `renderAppShell()`, agrega antes de `facturacion`:

```javascript
    ...(u.role === 'admin' ? [
      { id: 'finanzas', icon: '📊', label: 'Finanzas', path: 'finanzas' },
      { id: 'facturacion', icon: '💰', label: 'Facturación', path: 'facturacion' },
      { id: 'config-fiscal', icon: '🧾', label: 'Config. Fiscal', path: 'config-fiscal' },
    ] : []),
```

- [ ] **Step 5: Commit**

```bash
git add public/js/api.js public/js/app.js public/index.html
git commit -m "feat: métodos API finanzas + ruta #/finanzas en sidebar"
```

---

### Task 4: Vista Dashboard Financiero

**Files:** Create `public/js/views/finance.js`, Modify `public/css/style.css`

- [ ] **Step 1: Agregar estilos financieros en style.css**

```css
/* ── Dashboard Financiero ────────────────────────────────────── */
.finance-period-bar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.finance-period-btn { padding:5px 14px; border-radius:20px; border:1px solid var(--gray-200); background:white; cursor:pointer; font-size:13px; transition:all .15s; }
.finance-period-btn.active { background:var(--primary); color:white; border-color:var(--primary); }
.finance-table { width:100%; font-size:13px; border-collapse:collapse; }
.finance-table th { padding:10px 14px; background:var(--gray-50); border-bottom:2px solid var(--gray-200); text-align:left; font-size:11px; text-transform:uppercase; color:var(--gray-500); }
.finance-table td { padding:10px 14px; border-bottom:1px solid var(--gray-100); }
.finance-table tr.company-row { cursor:pointer; }
.finance-table tr.company-row:hover td { background:var(--gray-50); }
.finance-table tr.project-row td { background:var(--gray-50); font-size:12px; padding:6px 14px 6px 32px; }
.finance-bar { height:6px; border-radius:3px; background:var(--gray-200); margin-top:4px; }
.finance-bar-fill { height:6px; border-radius:3px; background:var(--primary); }
.upcoming-item { display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--gray-100); font-size:13px; }
.upcoming-item:last-child { border-bottom:none; }
.overdue { color:var(--danger); font-weight:600; }
```

- [ ] **Step 2: Crear public/js/views/finance.js**

```javascript
let _financePeriod = 'mes';
let _financeDesde = '';
let _financeHasta = '';
let _expandedCompanies = new Set();

async function renderFinance() {
  const app = document.getElementById('app');
  app.innerHTML = renderAppShell('finanzas', `
    <div class="page-header">
      <div class="page-header-left"><h1>📊 Dashboard Financiero</h1></div>
    </div>
    <div class="page-body">
      <!-- Period selector -->
      <div class="card mb-6">
        <div class="card-body">
          <div class="finance-period-bar">
            <button class="finance-period-btn active" id="fpMes" onclick="setFinancePeriod('mes')">Este mes</button>
            <button class="finance-period-btn" id="fpTrim" onclick="setFinancePeriod('trimestre')">Trimestre</button>
            <button class="finance-period-btn" id="fpAnio" onclick="setFinancePeriod('anio')">Este año</button>
            <button class="finance-period-btn" id="fpCustom" onclick="setFinancePeriod('custom')">Personalizado</button>
            <div id="customRange" style="display:none;gap:8px" class="flex">
              <input type="date" class="form-control" id="fpDesde" style="width:140px" onchange="applyCustomPeriod()">
              <input type="date" class="form-control" id="fpHasta" style="width:140px" onchange="applyCustomPeriod()">
            </div>
          </div>
        </div>
      </div>
      <div id="financeContent"><div class="loading-overlay" style="position:relative;height:200px"><div class="spinner"></div></div></div>
    </div>
  `);
  loadFinanceData();
}

window.setFinancePeriod = function(period) {
  _financePeriod = period;
  document.querySelectorAll('.finance-period-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('fp' + period.charAt(0).toUpperCase() + period.slice(1))?.classList.add('active');
  document.getElementById('customRange').style.display = period === 'custom' ? 'flex' : 'none';
  if (period !== 'custom') loadFinanceData();
};

window.applyCustomPeriod = function() {
  _financeDesde = document.getElementById('fpDesde').value;
  _financeHasta = document.getElementById('fpHasta').value;
  if (_financeDesde || _financeHasta) loadFinanceData();
};

function getPeriodParams() {
  const now = new Date();
  if (_financePeriod === 'mes') {
    return { desde: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`, hasta: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-31` };
  } else if (_financePeriod === 'trimestre') {
    const q = Math.floor(now.getMonth()/3);
    return { desde: `${now.getFullYear()}-${String(q*3+1).padStart(2,'0')}-01`, hasta: `${now.getFullYear()}-${String(q*3+3).padStart(2,'0')}-31` };
  } else if (_financePeriod === 'anio') {
    return { desde: `${now.getFullYear()}-01-01`, hasta: `${now.getFullYear()}-12-31` };
  } else {
    return { desde: _financeDesde, hasta: _financeHasta };
  }
}

async function loadFinanceData() {
  const container = document.getElementById('financeContent');
  if (!container) return;
  container.innerHTML = '<div class="loading-overlay" style="position:relative;height:200px"><div class="spinner"></div></div>';
  try {
    const params = getPeriodParams();
    const [summary, byCompany, chartData, upcoming] = await Promise.all([
      api.getFinanceSummary(params),
      api.getFinanceByCompany(params),
      api.getFinanceChart(),
      api.getUpcomingInvoices()
    ]);
    renderFinanceContent(summary, byCompany, chartData, upcoming);
  } catch (err) {
    container.innerHTML = `<p class="text-danger">${escHtml(err.message)}</p>`;
  }
}

function renderFinanceContent(summary, byCompany, chartData, upcoming) {
  const container = document.getElementById('financeContent');
  const fmtL = n => `L ${parseFloat(n||0).toLocaleString('es-HN', {minimumFractionDigits:2, maximumFractionDigits:2})}`;

  container.innerHTML = `
    <!-- Stat cards -->
    <div class="grid-4 mb-6">
      <div class="stat-card">
        <div class="stat-icon stat-icon-blue">💵</div>
        <div class="stat-info"><div class="value" style="font-size:16px">${fmtL(summary.facturado)}</div><div class="label">Facturado</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon stat-icon-green">✅</div>
        <div class="stat-info"><div class="value" style="font-size:16px">${fmtL(summary.cobrado)}</div><div class="label">Cobrado</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon stat-icon-yellow">⏳</div>
        <div class="stat-info"><div class="value" style="font-size:16px">${fmtL(summary.pendiente)}</div><div class="label">Pendiente</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon stat-icon-red" style="background:#fee2e2">⚠️</div>
        <div class="stat-info"><div class="value" style="font-size:16px;color:var(--danger)">${fmtL(summary.vencido)}</div><div class="label">Vencido</div></div>
      </div>
    </div>

    <div class="grid-2 mb-6">
      <!-- Chart -->
      <div class="card">
        <div class="card-body">
          <h4 class="card-title mb-3">Facturado vs Cobrado (12 meses)</h4>
          <div class="chart-canvas-wrap"><canvas id="chartFinance"></canvas></div>
        </div>
      </div>
      <!-- Upcoming -->
      <div class="card">
        <div class="card-body">
          <h4 class="card-title mb-3">⚠️ Próximas a vencer / Vencidas</h4>
          ${upcoming.length ? upcoming.map(inv => {
            const isOverdue = inv.fecha_vencimiento < new Date().toISOString().split('T')[0];
            return `<div class="upcoming-item">
              <div>
                <div class="text-sm font-semibold">${escHtml(inv.company_name)} — #${escHtml(inv.numero_factura)}</div>
                <div class="text-xs text-gray ${isOverdue?'overdue':''}">
                  ${isOverdue ? '🔴 Vencida: ' : '📅 Vence: '}${formatDate(inv.fecha_vencimiento)}
                </div>
              </div>
              <div class="text-sm font-semibold">${fmtL(inv.total)}</div>
            </div>`;
          }).join('') : '<p class="text-sm text-gray">Sin facturas próximas a vencer.</p>'}
        </div>
      </div>
    </div>

    <!-- By company table -->
    <div class="card">
      <div class="card-header"><h4 class="card-title">Desglose por Empresa y Proyecto</h4></div>
      <table class="finance-table w-full">
        <thead>
          <tr>
            <th>Empresa / Proyecto</th>
            <th style="text-align:right">Contratos Activos</th>
            <th style="text-align:right">Facturado</th>
            <th style="text-align:right">Cobrado</th>
            <th style="text-align:right">Pendiente</th>
          </tr>
        </thead>
        <tbody id="financeTableBody">
          ${byCompany.map(c => `
            <tr class="company-row" onclick="toggleCompanyRow(${c.id})">
              <td>
                <div class="flex items-center gap-2">
                  <span style="width:10px;height:10px;border-radius:50%;background:${c.color};display:inline-block"></span>
                  <strong>${escHtml(c.name)}</strong>
                  <span class="text-xs text-gray">(${c.projects.length} proyectos)</span>
                  <span id="arrow-${c.id}" style="font-size:10px">▶</span>
                </div>
              </td>
              <td style="text-align:right">${fmtL(c.contratos_activos)}</td>
              <td style="text-align:right">${fmtL(c.facturado)}</td>
              <td style="text-align:right;color:var(--success)">${fmtL(c.cobrado)}</td>
              <td style="text-align:right;color:${c.pendiente>0?'var(--danger)':'inherit'}">${fmtL(c.pendiente)}</td>
            </tr>
            <tr id="projects-${c.id}" style="display:none">
              <td colspan="5" style="padding:0">
                <table style="width:100%;border-collapse:collapse">
                  ${c.projects.map(p => `
                    <tr class="project-row" onclick="App.navigate('proyecto/${p.id}')">
                      <td style="padding:8px 14px 8px 32px">
                        📁 ${escHtml(p.name)}
                        <span class="badge badge-gray" style="font-size:10px;margin-left:6px">${p.billing_frequency||'proyecto'}</span>
                        ${p.contract_value ? `
                          <div class="finance-bar" style="max-width:200px;margin-top:4px">
                            <div class="finance-bar-fill" style="width:${Math.min(100,p.pct_cobrado)}%"></div>
                          </div>
                          <span class="text-xs text-gray">${p.pct_cobrado}% cobrado</span>
                        ` : ''}
                      </td>
                      <td style="text-align:right;padding:8px 14px">${p.contract_value ? fmtL(p.contract_value) : '—'}</td>
                      <td style="text-align:right;padding:8px 14px">${fmtL(p.facturado_proyecto)}</td>
                      <td style="text-align:right;padding:8px 14px">—</td>
                      <td style="text-align:right;padding:8px 14px">—</td>
                    </tr>
                  `).join('')}
                </table>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  // Chart
  ['chartFinance'].forEach(id => { const e = Chart.getChart(id); if (e) e.destroy(); });
  new Chart(document.getElementById('chartFinance'), {
    type: 'bar',
    data: {
      labels: chartData.map(d => d.label),
      datasets: [
        { label: 'Facturado', data: chartData.map(d => d.facturado), backgroundColor: '#6366f1', borderRadius: 3 },
        { label: 'Cobrado', data: chartData.map(d => d.cobrado), backgroundColor: '#10b981', borderRadius: 3 },
      ]
    },
    options: {
      plugins: { legend: { labels: { boxWidth: 12, font: { size: 11 } } } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => 'L '+v.toLocaleString() } } },
      maintainAspectRatio: false
    }
  });
}

window.toggleCompanyRow = function(companyId) {
  const row = document.getElementById(`projects-${companyId}`);
  const arrow = document.getElementById(`arrow-${companyId}`);
  if (!row) return;
  const isVisible = row.style.display !== 'none';
  row.style.display = isVisible ? 'none' : 'table-row';
  if (arrow) arrow.textContent = isVisible ? '▶' : '▼';
};
```

- [ ] **Step 3: Commit**

```bash
git add public/js/views/finance.js public/css/style.css
git commit -m "feat: dashboard financiero — métricas, gráfica 12 meses, desglose por empresa/proyecto"
```

---

### Task 5: Tab Solicitudes en empresa + aprobación

**Files:** Modify `public/js/views/company.js`

- [ ] **Step 1: Agregar tab "📋 Solicitudes" en company.js**

En `renderCompanyContent()`, en el bloque de `<div class="tabs">`, agregar:

```html
${App.user.role === 'admin' ? `<button class="tab-btn" onclick="switchTab('tabRequests', this); loadProjectRequests(${company.id})">📋 Solicitudes</button>` : ''}
```

En el HTML del body, después del div `tabFiscal`, agregar:

```html
    <!-- Requests tab -->
    <div class="tab-pane" id="tabRequests">
      <div id="projectRequestsList"><div class="loading-overlay" style="position:relative;height:100px"><div class="spinner"></div></div></div>
    </div>
```

Al final de company.js, agregar:

```javascript
window.loadProjectRequests = async function(companyId) {
  const container = document.getElementById('projectRequestsList');
  if (!container) return;
  try {
    const allPending = await api.getPendingProjects();
    const pending = allPending.filter(p => p.company_id === companyId);
    if (!pending.length) {
      container.innerHTML = '<div class="empty-state"><div class="icon">📋</div><h3>Sin solicitudes pendientes</h3></div>';
      return;
    }
    container.innerHTML = pending.map(p => `
      <div class="card mb-3">
        <div class="card-body">
          <div class="flex justify-between items-start">
            <div>
              <h4 class="font-semibold">${escHtml(p.name)}</h4>
              <p class="text-sm text-gray mt-1">${escHtml(p.description||'Sin descripción')}</p>
              <div class="text-xs text-gray mt-2">
                Solicitado por ${escHtml(p.creator_name||'—')} · ${timeAgo(p.created_at)}
                ${p.end_date ? ` · Entrega deseada: ${formatDate(p.end_date)}` : ''}
              </div>
            </div>
            <div class="flex gap-2">
              <button class="btn btn-primary btn-sm" onclick="approveProject(${p.id})">✅ Aprobar</button>
              <button class="btn btn-danger btn-sm" onclick="rejectProjectModal(${p.id}, '${escHtml(p.name)}')">❌ Rechazar</button>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) { toast(err.message, 'error'); }
};

window.approveProject = async function(projectId) {
  try {
    await api.approveProject(projectId);
    toast('Proyecto aprobado y notificado al cliente', 'success');
    // Reload the current company requests
    const companyId = document.querySelector('[onclick^="loadProjectRequests"]')
      ?.getAttribute('onclick')?.match(/\d+/)?.[0];
    if (companyId) loadProjectRequests(parseInt(companyId));
  } catch (err) { toast(err.message, 'error'); }
};

window.rejectProjectModal = function(projectId, projectName) {
  createModal({
    id: 'modalReject',
    title: 'Rechazar Proyecto',
    body: `
      <p class="text-sm text-gray mb-3">Proyecto: <strong>${projectName}</strong></p>
      <div class="form-group">
        <label class="form-label">Motivo del rechazo (opcional)</label>
        <textarea class="form-control" id="rejectReason" rows="3" placeholder="Explica al cliente por qué no se puede proceder..."></textarea>
      </div>
    `,
    footer: `
      <button class="btn btn-secondary" onclick="hideModal('modalReject')">Cancelar</button>
      <button class="btn btn-danger" onclick="submitReject(${projectId})">Rechazar</button>
    `
  });
  showModal('modalReject');
};

window.submitReject = async function(projectId) {
  const reason = document.getElementById('rejectReason')?.value.trim();
  try {
    await api.rejectProject(projectId, reason);
    hideModal('modalReject');
    toast('Proyecto rechazado y cliente notificado', 'success');
    const companyId = document.querySelector('[onclick^="loadProjectRequests"]')
      ?.getAttribute('onclick')?.match(/\d+/)?.[0];
    if (companyId) loadProjectRequests(parseInt(companyId));
  } catch (err) { toast(err.message, 'error'); }
};
```

- [ ] **Step 2: Commit**

```bash
git add public/js/views/company.js
git commit -m "feat: tab Solicitudes en empresa — aprobar/rechazar proyectos de clientes con notificación"
```

---

### Verificación final Plan F

- [ ] **Reiniciar servidor y verificar**

```bash
node server.js &
sleep 3
curl -s http://localhost:3000/api/health
```

Abrir http://localhost:3000 → login admin → verificar:
1. Sidebar tiene "📊 Finanzas" (solo admin)
2. Dashboard Finanzas muestra stat-cards con ceros (sin datos aún)
3. Gráfica de 12 meses se renderiza sin errores
4. Empresa → tab "📋 Solicitudes" visible para admin
5. `/api/projects/pending` retorna array vacío (200 OK)

- [ ] **Push**

```bash
git push origin main
```
