# Plan E — Backend Financiero + Facturación Admin

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar schema de DB, rutas backend y UI admin para facturación SAR Honduras: configuración fiscal, facturas con ISV, pagos parciales, datos fiscales por empresa y valor de contrato por proyecto.

**Architecture:** 3 nuevas tablas SQLite + ALTER TABLE en 3 existentes. 2 nuevas rutas Express (`/api/fiscal-config`, `/api/invoices`). 2 nuevas vistas frontend (`billing.js`, `fiscal-config.js`) + modificaciones a `company.js` y `project.js`. Multer reutilizado para PDFs de facturas.

**Tech Stack:** Express, better-sqlite3, multer (ya instalado), Vanilla JS, CSS existente.

---

## Archivos

**Backend:**
- Modify: `src/database.js` — nuevas tablas + ALTER TABLE
- Create: `src/routes/fiscal-config.js`
- Create: `src/routes/invoices.js`
- Modify: `server.js`

**Frontend:**
- Modify: `public/js/api.js` — nuevos métodos
- Modify: `public/js/app.js` — sidebar + rutas
- Create: `public/js/views/fiscal-config.js`
- Create: `public/js/views/billing.js`
- Modify: `public/js/views/company.js` — tab Datos Fiscales
- Modify: `public/js/views/project.js` — campos contrato en modal
- Modify: `public/css/style.css` — estilos factura SAR

---

### Task 1: DB schema — nuevas tablas y migraciones

**Files:** Modify `src/database.js`

- [ ] **Step 1: Agregar helper `addColumnSafe` y migraciones en database.js**

Lee `src/database.js`. Después de `initDatabase()` (antes de `module.exports = db`), agregar:

```javascript
function addColumnSafe(table, column, def) {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`); } catch {}
}

// Migraciones para CRM/Facturación
addColumnSafe('projects', 'contract_value', 'REAL');
addColumnSafe('projects', 'billing_frequency', "TEXT DEFAULT 'proyecto'");
addColumnSafe('companies', 'rtn', 'TEXT');
addColumnSafe('companies', 'fiscal_name', 'TEXT');
addColumnSafe('companies', 'fiscal_address', 'TEXT');
addColumnSafe('users', 'rtn', 'TEXT');
```

- [ ] **Step 2: Agregar nuevas tablas en db.exec() en database.js**

Dentro de `db.exec(...)`, después de la tabla `notifications` (última tabla del Plan C), agregar:

```sql
    CREATE TABLE IF NOT EXISTS fiscal_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      rtn_emisor TEXT,
      nombre_emisor TEXT,
      direccion_emisor TEXT,
      telefono_emisor TEXT,
      cai TEXT,
      rango_inicio TEXT,
      rango_fin TEXT,
      fecha_limite_emision DATE,
      tipo_documento TEXT DEFAULT 'factura_venta',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      numero_factura TEXT NOT NULL,
      fecha_emision DATE NOT NULL,
      fecha_vencimiento DATE,
      descripcion TEXT NOT NULL,
      monto_gravado REAL DEFAULT 0,
      monto_exento REAL DEFAULT 0,
      monto_exonerado REAL DEFAULT 0,
      isv_porcentaje REAL DEFAULT 15,
      isv_monto REAL DEFAULT 0,
      total REAL NOT NULL,
      estado TEXT DEFAULT 'borrador',
      pdf_filename TEXT,
      notas TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoice_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
      monto REAL NOT NULL,
      fecha_pago DATE NOT NULL,
      metodo_pago TEXT,
      notas TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_invoices_company ON invoices(company_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_estado ON invoices(estado);
    CREATE INDEX IF NOT EXISTS idx_payments_invoice ON invoice_payments(invoice_id);
```

- [ ] **Step 3: Verificar que el servidor arranca**

```bash
cd "C:/Users/jeffr/OneDrive/Aplicaciones/Proyecto-CMS-jeff"
node -e "require('./src/database'); console.log('DB OK')"
```
Expected: `DB OK`

- [ ] **Step 4: Commit**

```bash
git add src/database.js
git commit -m "feat: schema DB para facturación — fiscal_config, invoices, invoice_payments + ALTER TABLE"
```

---

### Task 2: Ruta backend fiscal-config

**Files:** Create `src/routes/fiscal-config.js`, Modify `server.js`

- [ ] **Step 1: Crear src/routes/fiscal-config.js**

```javascript
const express = require('express');
const db = require('../database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, adminMiddleware);

router.get('/', (req, res) => {
  const config = db.prepare('SELECT * FROM fiscal_config WHERE id = 1').get();
  res.json(config || {});
});

router.put('/', (req, res) => {
  const { rtn_emisor, nombre_emisor, direccion_emisor, telefono_emisor,
          cai, rango_inicio, rango_fin, fecha_limite_emision, tipo_documento } = req.body;

  const existing = db.prepare('SELECT id FROM fiscal_config WHERE id = 1').get();
  if (existing) {
    db.prepare(`UPDATE fiscal_config SET
      rtn_emisor=?, nombre_emisor=?, direccion_emisor=?, telefono_emisor=?,
      cai=?, rango_inicio=?, rango_fin=?, fecha_limite_emision=?,
      tipo_documento=?, updated_at=CURRENT_TIMESTAMP WHERE id=1`
    ).run(rtn_emisor||null, nombre_emisor||null, direccion_emisor||null, telefono_emisor||null,
          cai||null, rango_inicio||null, rango_fin||null, fecha_limite_emision||null,
          tipo_documento||'factura_venta');
  } else {
    db.prepare(`INSERT INTO fiscal_config
      (id, rtn_emisor, nombre_emisor, direccion_emisor, telefono_emisor,
       cai, rango_inicio, rango_fin, fecha_limite_emision, tipo_documento)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(rtn_emisor||null, nombre_emisor||null, direccion_emisor||null, telefono_emisor||null,
          cai||null, rango_inicio||null, rango_fin||null, fecha_limite_emision||null,
          tipo_documento||'factura_venta');
  }
  res.json(db.prepare('SELECT * FROM fiscal_config WHERE id = 1').get());
});

module.exports = router;
```

- [ ] **Step 2: Registrar en server.js**

Después de `app.use('/api/notifications', ...)`:
```javascript
app.use('/api/fiscal-config', require('./src/routes/fiscal-config'));
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/fiscal-config.js server.js
git commit -m "feat: ruta /api/fiscal-config — GET/PUT configuración SAR"
```

---

### Task 3: Ruta backend invoices

**Files:** Create `src/routes/invoices.js`, Modify `server.js`

- [ ] **Step 1: Crear src/routes/invoices.js**

```javascript
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, adminMiddleware);

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'data', 'uploads');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, `inv-${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => /\.pdf$/i.test(file.originalname) ? cb(null, true) : cb(new Error('Solo PDF')) });

function getInvoiceWithPayments(id) {
  const inv = db.prepare(`
    SELECT i.*, c.name as company_name, c.rtn as company_rtn,
      c.fiscal_name, c.fiscal_address,
      p.name as project_name, u.name as creator_name
    FROM invoices i
    JOIN companies c ON c.id = i.company_id
    LEFT JOIN projects p ON p.id = i.project_id
    LEFT JOIN users u ON u.id = i.created_by
    WHERE i.id = ?
  `).get(id);
  if (!inv) return null;
  inv.payments = db.prepare('SELECT * FROM invoice_payments WHERE invoice_id = ? ORDER BY fecha_pago DESC').all(id);
  inv.total_pagado = inv.payments.reduce((s, p) => s + p.monto, 0);
  inv.saldo = inv.total - inv.total_pagado;
  inv.fiscal_config = db.prepare('SELECT * FROM fiscal_config WHERE id = 1').get() || {};
  return inv;
}

// GET /api/invoices
router.get('/', (req, res) => {
  const { company_id, estado, desde, hasta, q } = req.query;
  let sql = `SELECT i.*, c.name as company_name, p.name as project_name,
    (SELECT COALESCE(SUM(monto),0) FROM invoice_payments WHERE invoice_id = i.id) as total_pagado
    FROM invoices i
    JOIN companies c ON c.id = i.company_id
    LEFT JOIN projects p ON p.id = i.project_id
    WHERE 1=1`;
  const params = [];
  if (company_id) { sql += ' AND i.company_id = ?'; params.push(company_id); }
  if (estado) { sql += ' AND i.estado = ?'; params.push(estado); }
  if (desde) { sql += ' AND i.fecha_emision >= ?'; params.push(desde); }
  if (hasta) { sql += ' AND i.fecha_emision <= ?'; params.push(hasta); }
  if (q) { sql += ' AND (i.numero_factura LIKE ? OR i.descripcion LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY i.fecha_emision DESC, i.id DESC';
  res.json(db.prepare(sql).all(...params));
});

// POST /api/invoices
router.post('/', (req, res) => {
  upload.single('pdf')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    const { company_id, project_id, numero_factura, fecha_emision, fecha_vencimiento,
            descripcion, monto_gravado, monto_exento, monto_exonerado,
            isv_porcentaje, isv_monto, total, estado, notas } = req.body;
    if (!company_id || !numero_factura || !fecha_emision || !descripcion || !total) {
      return res.status(400).json({ error: 'Campos requeridos: empresa, número, fecha, descripción, total' });
    }
    // Validate numero within CAI range
    const cfg = db.prepare('SELECT * FROM fiscal_config WHERE id = 1').get();
    if (cfg && cfg.rango_inicio && cfg.rango_fin) {
      const n = parseInt(numero_factura);
      if (n < parseInt(cfg.rango_inicio) || n > parseInt(cfg.rango_fin)) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: `Número de factura fuera del rango CAI (${cfg.rango_inicio}–${cfg.rango_fin})` });
      }
    }
    const result = db.prepare(`INSERT INTO invoices
      (company_id, project_id, numero_factura, fecha_emision, fecha_vencimiento,
       descripcion, monto_gravado, monto_exento, monto_exonerado,
       isv_porcentaje, isv_monto, total, estado, pdf_filename, notas, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(company_id, project_id||null, numero_factura, fecha_emision, fecha_vencimiento||null,
          descripcion, parseFloat(monto_gravado)||0, parseFloat(monto_exento)||0, parseFloat(monto_exonerado)||0,
          parseFloat(isv_porcentaje)||15, parseFloat(isv_monto)||0, parseFloat(total),
          estado||'borrador', req.file?.filename||null, notas||null, req.user.id);
    res.status(201).json(getInvoiceWithPayments(result.lastInsertRowid));
  });
});

// GET /api/invoices/:id
router.get('/:id', (req, res) => {
  const inv = getInvoiceWithPayments(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Factura no encontrada' });
  res.json(inv);
});

// PUT /api/invoices/:id
router.put('/:id', (req, res) => {
  upload.single('pdf')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!inv) return res.status(404).json({ error: 'Factura no encontrada' });
    if (inv.estado === 'pagada') return res.status(400).json({ error: 'No se puede editar una factura pagada' });
    const { numero_factura, fecha_emision, fecha_vencimiento, descripcion,
            monto_gravado, monto_exento, monto_exonerado,
            isv_porcentaje, isv_monto, total, estado, notas } = req.body;
    const newPdf = req.file?.filename || inv.pdf_filename;
    if (req.file && inv.pdf_filename) {
      const old = path.join(UPLOADS_DIR, inv.pdf_filename);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }
    db.prepare(`UPDATE invoices SET
      numero_factura=?, fecha_emision=?, fecha_vencimiento=?, descripcion=?,
      monto_gravado=?, monto_exento=?, monto_exonerado=?,
      isv_porcentaje=?, isv_monto=?, total=?, estado=?, pdf_filename=?, notas=?
      WHERE id=?`
    ).run(numero_factura||inv.numero_factura, fecha_emision||inv.fecha_emision,
          fecha_vencimiento||null, descripcion||inv.descripcion,
          parseFloat(monto_gravado)||0, parseFloat(monto_exento)||0, parseFloat(monto_exonerado)||0,
          parseFloat(isv_porcentaje)||15, parseFloat(isv_monto)||0, parseFloat(total)||inv.total,
          estado||inv.estado, newPdf, notas||null, req.params.id);
    res.json(getInvoiceWithPayments(req.params.id));
  });
});

// DELETE /api/invoices/:id — solo borradores
router.delete('/:id', (req, res) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Factura no encontrada' });
  if (inv.estado !== 'borrador') return res.status(400).json({ error: 'Solo se pueden eliminar facturas en borrador' });
  if (inv.pdf_filename) {
    const p = path.join(UPLOADS_DIR, inv.pdf_filename);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  db.prepare('DELETE FROM invoices WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST /api/invoices/:id/payments
router.post('/:id/payments', (req, res) => {
  const { monto, fecha_pago, metodo_pago, notas } = req.body;
  if (!monto || !fecha_pago) return res.status(400).json({ error: 'monto y fecha_pago requeridos' });
  const result = db.prepare('INSERT INTO invoice_payments (invoice_id, monto, fecha_pago, metodo_pago, notas) VALUES (?,?,?,?,?)')
    .run(req.params.id, parseFloat(monto), fecha_pago, metodo_pago||null, notas||null);
  // Auto-update estado to pagada if fully paid
  const inv = getInvoiceWithPayments(req.params.id);
  if (inv && inv.saldo <= 0 && inv.estado === 'enviada') {
    db.prepare("UPDATE invoices SET estado='pagada' WHERE id=?").run(req.params.id);
  }
  res.status(201).json(getInvoiceWithPayments(req.params.id));
});

// DELETE /api/invoices/:id/payments/:pid
router.delete('/:id/payments/:pid', (req, res) => {
  db.prepare('DELETE FROM invoice_payments WHERE id = ? AND invoice_id = ?').run(req.params.pid, req.params.id);
  res.json(getInvoiceWithPayments(req.params.id));
});

// GET /api/invoices/:id/download
router.get('/:id/download', (req, res) => {
  const inv = db.prepare('SELECT pdf_filename, numero_factura FROM invoices WHERE id = ?').get(req.params.id);
  if (!inv || !inv.pdf_filename) return res.status(404).json({ error: 'PDF no disponible' });
  const filePath = path.join(UPLOADS_DIR, inv.pdf_filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado' });
  res.download(filePath, `factura-${inv.numero_factura}.pdf`);
});

module.exports = router;
```

- [ ] **Step 2: Registrar en server.js**

```javascript
app.use('/api/invoices', require('./src/routes/invoices'));
```

- [ ] **Step 3: Verificar arranque**

```bash
node -e "require('./src/routes/invoices'); console.log('invoices OK')"
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/invoices.js server.js
git commit -m "feat: ruta /api/invoices — CRUD completo, pagos parciales, descarga PDF, validación CAI"
```

---

### Task 4: Métodos API frontend + sidebar

**Files:** Modify `public/js/api.js`, Modify `public/js/app.js`

- [ ] **Step 1: Agregar métodos en public/js/api.js**

Al final del objeto `api` (antes del `};`):

```javascript
  // Fiscal config
  getFiscalConfig: () => api.get('/fiscal-config'),
  saveFiscalConfig: (data) => api.put('/fiscal-config', data),

  // Invoices
  getInvoices: (params = {}) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v))).toString();
    return api.get(`/invoices${q ? '?' + q : ''}`);
  },
  getInvoice: (id) => api.get(`/invoices/${id}`),
  createInvoice: (formData) => {
    const headers = {};
    if (api._token) headers['Authorization'] = `Bearer ${api._token}`;
    return fetch('/api/invoices', { method: 'POST', headers, body: formData })
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || `Error ${r.status}`); return d; });
  },
  updateInvoice: (id, formData) => {
    const headers = {};
    if (api._token) headers['Authorization'] = `Bearer ${api._token}`;
    return fetch(`/api/invoices/${id}`, { method: 'PUT', headers, body: formData })
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || `Error ${r.status}`); return d; });
  },
  deleteInvoice: (id) => api.delete(`/invoices/${id}`),
  addPayment: (invoiceId, data) => api.post(`/invoices/${invoiceId}/payments`, data),
  deletePayment: (invoiceId, paymentId) => api.delete(`/invoices/${invoiceId}/payments/${paymentId}`),

  // Companies fiscal data
  updateCompanyFiscal: (id, data) => api.put(`/companies/${id}`, data),
```

- [ ] **Step 2: Agregar rutas y sidebar en public/js/app.js**

En `App.route()`, después del bloque `else if (hash === 'perfil')`, agregar:

```javascript
    } else if (hash === 'facturacion') {
      if (this.user.role !== 'admin') { this.navigate(''); return; }
      renderBilling();
    } else if (hash === 'config-fiscal') {
      if (this.user.role !== 'admin') { this.navigate(''); return; }
      renderFiscalConfig();
    }
```

En `renderAppShell()`, en el array `navItems`, agregar antes del item de `perfil`:

```javascript
    ...(u.role === 'admin' ? [
      { id: 'facturacion', icon: '💰', label: 'Facturación', path: 'facturacion' },
      { id: 'config-fiscal', icon: '🧾', label: 'Config. Fiscal', path: 'config-fiscal' },
    ] : []),
```

En `public/index.html`, agregar antes de `<script src="/js/app.js">`:

```html
<script src="/js/views/billing.js"></script>
<script src="/js/views/fiscal-config.js"></script>
```

- [ ] **Step 3: Commit**

```bash
git add public/js/api.js public/js/app.js public/index.html
git commit -m "feat: métodos API facturación + rutas sidebar config-fiscal y facturación"
```

---

### Task 5: Vista Configuración Fiscal

**Files:** Create `public/js/views/fiscal-config.js`

- [ ] **Step 1: Crear public/js/views/fiscal-config.js**

```javascript
async function renderFiscalConfig() {
  const app = document.getElementById('app');
  app.innerHTML = renderAppShell('config-fiscal', `
    <div class="page-header">
      <div class="page-header-left"><h1>🧾 Configuración Fiscal SAR</h1></div>
    </div>
    <div class="page-body" style="max-width:700px">
      <div class="loading-overlay"><div class="spinner"></div></div>
    </div>
  `);

  try {
    const cfg = await api.getFiscalConfig();
    document.querySelector('.page-body').innerHTML = `
      <div class="card mb-4">
        <div class="card-header"><span class="card-title">Datos del Emisor</span></div>
        <div class="card-body">
          <div id="fcError" class="form-error hidden"></div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">RTN Emisor *</label>
              <input class="form-control" id="fcRtn" placeholder="0000-0000-000000" value="${escHtml(cfg.rtn_emisor||'')}">
            </div>
            <div class="form-group">
              <label class="form-label">Nombre Fiscal *</label>
              <input class="form-control" id="fcNombre" placeholder="Razón social" value="${escHtml(cfg.nombre_emisor||'')}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Dirección</label>
            <input class="form-control" id="fcDir" placeholder="Dirección fiscal" value="${escHtml(cfg.direccion_emisor||'')}">
          </div>
          <div class="form-group">
            <label class="form-label">Teléfono</label>
            <input class="form-control" id="fcTel" placeholder="+504..." value="${escHtml(cfg.telefono_emisor||'')}">
          </div>
        </div>
      </div>

      <div class="card mb-4">
        <div class="card-header"><span class="card-title">Autorización SAR (CAI)</span></div>
        <div class="card-body">
          <div class="form-group">
            <label class="form-label">Tipo de Documento</label>
            <select class="form-control" id="fcTipo">
              <option value="factura_venta" ${cfg.tipo_documento==='factura_venta'?'selected':''}>Factura de Venta</option>
              <option value="recibo_honorarios" ${cfg.tipo_documento==='recibo_honorarios'?'selected':''}>Recibo por Honorarios</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">CAI (Código de Autorización de Impresión)</label>
            <input class="form-control" id="fcCai" placeholder="XXXXXX-XXXXXX-XXXX-XXXXXXXXXXXXXXXX" value="${escHtml(cfg.cai||'')}">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Rango Autorizado — Desde</label>
              <input class="form-control" id="fcRangoInicio" placeholder="000001" value="${escHtml(cfg.rango_inicio||'')}">
            </div>
            <div class="form-group">
              <label class="form-label">Rango Autorizado — Hasta</label>
              <input class="form-control" id="fcRangoFin" placeholder="100000" value="${escHtml(cfg.rango_fin||'')}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Fecha Límite de Emisión</label>
            <input class="form-control" type="date" id="fcFechaLimite" value="${cfg.fecha_limite_emision||''}">
          </div>
        </div>
      </div>

      <button class="btn btn-primary" onclick="saveFiscalConfig()">💾 Guardar Configuración</button>
      ${cfg.cai ? `<div class="badge badge-green mt-4" style="display:inline-block;margin-left:12px">✅ CAI configurado</div>` : `<div class="badge badge-yellow mt-4" style="display:inline-block;margin-left:12px">⚠️ Sin CAI — no se pueden emitir facturas</div>`}
    `;
  } catch (err) { toast(err.message, 'error'); }
}

window.saveFiscalConfig = async function() {
  const errEl = document.getElementById('fcError');
  const rtn = document.getElementById('fcRtn').value.trim();
  const nombre = document.getElementById('fcNombre').value.trim();
  if (!rtn || !nombre) {
    errEl.textContent = 'RTN y Nombre fiscal son requeridos';
    errEl.classList.remove('hidden');
    return;
  }
  try {
    await api.saveFiscalConfig({
      rtn_emisor: rtn,
      nombre_emisor: nombre,
      direccion_emisor: document.getElementById('fcDir').value.trim() || null,
      telefono_emisor: document.getElementById('fcTel').value.trim() || null,
      tipo_documento: document.getElementById('fcTipo').value,
      cai: document.getElementById('fcCai').value.trim() || null,
      rango_inicio: document.getElementById('fcRangoInicio').value.trim() || null,
      rango_fin: document.getElementById('fcRangoFin').value.trim() || null,
      fecha_limite_emision: document.getElementById('fcFechaLimite').value || null,
    });
    toast('Configuración fiscal guardada', 'success');
    renderFiscalConfig();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add public/js/views/fiscal-config.js
git commit -m "feat: vista configuración fiscal SAR con CAI, rango y datos emisor"
```

---

### Task 6: Tab Datos Fiscales en empresa + contrato en proyecto

**Files:** Modify `public/js/views/company.js`, Modify `public/js/views/project.js`

- [ ] **Step 1: Agregar tab "🏛️ Datos Fiscales" en company.js**

En `renderCompanyContent()`, en el bloque `<div class="tabs">` (donde están los tabs de Proyectos, Miembros, Invitaciones), agregar al final:

```html
${canEdit ? `<button class="tab-btn" onclick="switchTab('tabFiscal', this)">🏛️ Datos Fiscales</button>` : ''}
```

En el HTML del body, después del tab-pane de invitaciones (busca `id="tabInvitations"`), agregar:

```html
    <!-- Fiscal data tab -->
    <div class="tab-pane" id="tabFiscal">
      <div class="card" style="max-width:600px">
        <div class="card-header"><span class="card-title">Datos Fiscales del Cliente</span></div>
        <div class="card-body">
          <div id="fiscalSaveMsg" class="form-error hidden"></div>
          <div class="form-group">
            <label class="form-label">RTN del Cliente</label>
            <input class="form-control" id="companyRtn" placeholder="0000-0000-000000" value="${escHtml(company.rtn||'')}">
          </div>
          <div class="form-group">
            <label class="form-label">Razón Social Fiscal</label>
            <input class="form-control" id="companyFiscalName" placeholder="Nombre legal" value="${escHtml(company.fiscal_name||'')}">
          </div>
          <div class="form-group">
            <label class="form-label">Dirección Fiscal</label>
            <input class="form-control" id="companyFiscalAddr" placeholder="Dirección fiscal" value="${escHtml(company.fiscal_address||'')}">
          </div>
          <button class="btn btn-primary" onclick="saveFiscalData(${company.id})">Guardar</button>
        </div>
      </div>
    </div>
```

Al final de company.js, agregar:

```javascript
window.saveFiscalData = async function(companyId) {
  try {
    await api.updateCompanyFiscal(companyId, {
      rtn: document.getElementById('companyRtn').value.trim() || null,
      fiscal_name: document.getElementById('companyFiscalName').value.trim() || null,
      fiscal_address: document.getElementById('companyFiscalAddr').value.trim() || null,
    });
    toast('Datos fiscales guardados', 'success');
  } catch (err) { toast(err.message, 'error'); }
};
```

También asegurarse que `companies PUT` route incluye los nuevos campos. Lee `src/routes/companies.js` y en el `router.put('/:id')` agrega `rtn`, `fiscal_name`, `fiscal_address` al UPDATE. Si el UPDATE ya tiene un SET dinámico, agrégalos. Si es explícito, agrégalos al SET:

```javascript
// En la query UPDATE de companies, agregar:
// rtn = ?, fiscal_name = ?, fiscal_address = ?
// Y los valores correspondientes en el .run(...)
```

- [ ] **Step 2: Agregar campos de contrato en modales de proyecto en project.js**

En `openCreateTask` no, en `openEditProject()` — busca el modal de editar proyecto (función `openEditProject`). Antes del footer, agregar en el body del modal:

```javascript
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Valor del Contrato (L)</label>
          <input class="form-control" type="number" step="0.01" id="epContractValue" value="${p.contract_value || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Frecuencia de Facturación</label>
          <select class="form-control" id="epBillingFreq">
            <option value="proyecto" ${(p.billing_frequency||'proyecto')==='proyecto'?'selected':''}>Por proyecto</option>
            <option value="mensual" ${p.billing_frequency==='mensual'?'selected':''}>Mensual</option>
            <option value="trimestral" ${p.billing_frequency==='trimestral'?'selected':''}>Trimestral</option>
            <option value="anual" ${p.billing_frequency==='anual'?'selected':''}>Anual</option>
          </select>
        </div>
      </div>
```

En `submitEditProject()`, agregar al objeto enviado al API:

```javascript
      contract_value: document.getElementById('epContractValue').value || null,
      billing_frequency: document.getElementById('epBillingFreq').value,
```

También en `src/routes/projects.js`, en el `PUT /:id`, agregar `contract_value` y `billing_frequency` al UPDATE query y `.run()`.

En `openCreateProject()` (en company.js), igual — agregar los mismos campos al modal y al submit.

- [ ] **Step 3: Commit**

```bash
git add public/js/views/company.js public/js/views/project.js src/routes/companies.js src/routes/projects.js
git commit -m "feat: datos fiscales por empresa, valor de contrato y frecuencia en proyectos"
```

---

### Task 7: Estilos CSS para facturación

**Files:** Modify `public/css/style.css`

- [ ] **Step 1: Agregar estilos al final de style.css**

```css
/* ── Facturación ─────────────────────────────────────────────── */
.invoice-sar { border:2px solid var(--gray-200); border-radius:8px; padding:24px; background:white; }
.invoice-sar-header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid var(--gray-900); padding-bottom:12px; margin-bottom:16px; }
.invoice-sar-emisor { font-size:12px; line-height:1.6; }
.invoice-sar-title { text-align:right; }
.invoice-sar-title h2 { font-size:18px; font-weight:700; text-transform:uppercase; }
.invoice-sar-title .num { font-size:22px; font-weight:800; color:var(--primary); }
.invoice-sar-cai { background:var(--gray-50); border:1px solid var(--gray-200); border-radius:6px; padding:8px 12px; font-size:11px; font-family:monospace; margin-bottom:16px; }
.invoice-sar-parties { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px; }
.invoice-sar-party { font-size:12px; line-height:1.7; }
.invoice-sar-party strong { display:block; font-size:11px; text-transform:uppercase; color:var(--gray-500); margin-bottom:2px; }
.invoice-table { width:100%; border-collapse:collapse; margin:16px 0; font-size:13px; }
.invoice-table th { background:var(--gray-900); color:white; padding:8px 12px; text-align:left; font-size:11px; text-transform:uppercase; }
.invoice-table td { padding:8px 12px; border-bottom:1px solid var(--gray-100); }
.invoice-totals { display:flex; justify-content:flex-end; }
.invoice-totals-grid { width:260px; font-size:13px; }
.invoice-totals-row { display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid var(--gray-100); }
.invoice-totals-row.total { font-size:16px; font-weight:700; border-top:2px solid var(--gray-900); border-bottom:none; padding-top:8px; }
.estado-borrador { background:#f3f4f6; color:#374151; }
.estado-enviada  { background:#dbeafe; color:#1d4ed8; }
.estado-pagada   { background:#dcfce7; color:#15803d; }
.estado-vencida  { background:#fee2e2; color:#b91c1c; }
.estado-anulada  { background:#f3f4f6; color:#9ca3af; text-decoration:line-through; }
.payment-item { display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--gray-100); font-size:13px; }
.payment-item:last-child { border-bottom:none; }
```

- [ ] **Step 2: Commit**

```bash
git add public/css/style.css
git commit -m "feat: estilos CSS para facturas SAR y estados"
```

---

### Task 8: Vista Facturación — lista + modal crear

**Files:** Create `public/js/views/billing.js`

- [ ] **Step 1: Crear public/js/views/billing.js (parte 1 — lista)**

```javascript
let _billingPage = 1;
const _billingPerPage = 20;
let _allInvoices = [];
let _billingFilters = {};

window._goPage = window._goPage || function(p) {};

async function renderBilling() {
  const app = document.getElementById('app');
  app.innerHTML = renderAppShell('facturacion', `
    <div class="page-header">
      <div class="page-header-left"><h1>💰 Facturación</h1></div>
      <div class="flex gap-2">
        <button class="btn btn-primary" onclick="openNewInvoice()">+ Nueva Factura</button>
      </div>
    </div>
    <div class="page-body">
      <div class="card mb-4">
        <div class="card-body">
          <div class="flex gap-2 flex-wrap">
            <select class="form-control" id="filterInvEmpresa" style="width:180px" onchange="applyBillingFilters()">
              <option value="">Todas las empresas</option>
            </select>
            <select class="form-control" id="filterInvEstado" style="width:150px" onchange="applyBillingFilters()">
              <option value="">Todos los estados</option>
              <option value="borrador">Borrador</option>
              <option value="enviada">Enviada</option>
              <option value="pagada">Pagada</option>
              <option value="vencida">Vencida</option>
              <option value="anulada">Anulada</option>
            </select>
            <input type="date" class="form-control" id="filterInvDesde" style="width:140px" onchange="applyBillingFilters()" placeholder="Desde">
            <input type="date" class="form-control" id="filterInvHasta" style="width:140px" onchange="applyBillingFilters()" placeholder="Hasta">
            <input class="form-control" id="filterInvQ" style="width:180px" placeholder="Buscar número o descripción..." oninput="applyBillingFilters()">
          </div>
        </div>
      </div>
      <div id="invoicesList"><div class="loading-overlay"><div class="spinner"></div></div></div>
    </div>
  `);

  try {
    const [invoices, companies] = await Promise.all([
      api.getInvoices(),
      api.getCompanies()
    ]);
    _allInvoices = invoices;

    const empSel = document.getElementById('filterInvEmpresa');
    companies.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id; opt.textContent = c.name;
      empSel.appendChild(opt);
    });

    window._goPage = function(p) { _billingPage = p; renderInvoiceList(); };
    renderInvoiceList();
  } catch (err) { toast(err.message, 'error'); }
}

function applyBillingFilters() {
  _billingPage = 1;
  _billingFilters = {
    company_id: document.getElementById('filterInvEmpresa')?.value || '',
    estado: document.getElementById('filterInvEstado')?.value || '',
    desde: document.getElementById('filterInvDesde')?.value || '',
    hasta: document.getElementById('filterInvHasta')?.value || '',
    q: document.getElementById('filterInvQ')?.value || '',
  };
  const filtered = _allInvoices.filter(inv => {
    if (_billingFilters.company_id && String(inv.company_id) !== _billingFilters.company_id) return false;
    if (_billingFilters.estado && inv.estado !== _billingFilters.estado) return false;
    if (_billingFilters.desde && inv.fecha_emision < _billingFilters.desde) return false;
    if (_billingFilters.hasta && inv.fecha_emision > _billingFilters.hasta) return false;
    if (_billingFilters.q) {
      const q = _billingFilters.q.toLowerCase();
      if (!inv.numero_factura.toLowerCase().includes(q) && !inv.descripcion.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  renderInvoiceList(filtered);
}

function renderInvoiceList(invoices = _allInvoices) {
  const { items, html } = paginate(invoices, _billingPage, _billingPerPage);
  const container = document.getElementById('invoicesList');
  if (!container) return;

  if (!invoices.length) {
    container.innerHTML = `<div class="empty-state"><div class="icon">📄</div><h3>Sin facturas</h3><p>Crea tu primera factura.</p></div>`;
    return;
  }

  container.innerHTML = `
    <div class="card">
      <table class="w-full" style="border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:var(--gray-50);border-bottom:2px solid var(--gray-200)">
            <th style="padding:10px 16px;text-align:left">Número</th>
            <th style="padding:10px 16px;text-align:left">Empresa</th>
            <th style="padding:10px 16px;text-align:left">Proyecto</th>
            <th style="padding:10px 16px;text-align:left">Fecha</th>
            <th style="padding:10px 16px;text-align:right">Total</th>
            <th style="padding:10px 16px;text-align:center">Estado</th>
            <th style="padding:10px 16px;text-align:center">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(inv => `
            <tr style="border-bottom:1px solid var(--gray-100)" onclick="App.navigate('factura/${inv.id}')" class="hoverable" style="cursor:pointer">
              <td style="padding:10px 16px;font-weight:600;color:var(--primary)">${escHtml(inv.numero_factura)}</td>
              <td style="padding:10px 16px">${escHtml(inv.company_name)}</td>
              <td style="padding:10px 16px;color:var(--gray-500)">${escHtml(inv.project_name||'—')}</td>
              <td style="padding:10px 16px">${formatDate(inv.fecha_emision)}</td>
              <td style="padding:10px 16px;text-align:right;font-weight:600">L ${parseFloat(inv.total).toFixed(2)}</td>
              <td style="padding:10px 16px;text-align:center">
                <span class="badge estado-${inv.estado}">${inv.estado.charAt(0).toUpperCase()+inv.estado.slice(1)}</span>
              </td>
              <td style="padding:10px 16px;text-align:center" onclick="event.stopPropagation()">
                <button class="btn btn-ghost btn-sm" onclick="App.navigate('factura/${inv.id}')">👁️</button>
                ${inv.pdf_filename ? `<a href="/api/invoices/${inv.id}/download" class="btn btn-ghost btn-sm" download>📥</a>` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ${html ? `<div style="padding:16px 0">${html}</div>` : ''}
  `;
}
```

- [ ] **Step 2: Agregar función openNewInvoice + ruta #/factura/:id en billing.js**

```javascript
async function openNewInvoice() {
  const cfg = await api.getFiscalConfig();
  if (!cfg || !cfg.cai) {
    toast('Configura el CAI antes de emitir facturas (Config. Fiscal)', 'warning');
    return;
  }
  const companies = await api.getCompanies();
  // Next invoice number
  const lastInv = await api.getInvoices().then(list =>
    list.filter(i => i.estado !== 'anulada').sort((a,b) => parseInt(b.numero_factura)-parseInt(a.numero_factura))[0]
  ).catch(() => null);
  const nextNum = lastInv ? String(parseInt(lastInv.numero_factura) + 1).padStart(cfg.rango_inicio?.length||6, '0') : cfg.rango_inicio || '000001';

  createModal({
    id: 'modalNewInvoice',
    title: 'Nueva Factura',
    size: 'modal-lg',
    body: `
      <div id="niError" class="form-error hidden"></div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Empresa *</label>
          <select class="form-control" id="niEmpresa" onchange="loadInvoiceProjects(this.value)">
            <option value="">Seleccionar empresa...</option>
            ${companies.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Proyecto (opcional)</label>
          <select class="form-control" id="niProyecto"><option value="">— Sin proyecto —</option></select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Número de Factura *</label>
          <input class="form-control" id="niNumero" value="${escHtml(nextNum)}">
          <div class="text-xs text-gray mt-1">Rango: ${cfg.rango_inicio} – ${cfg.rango_fin}</div>
        </div>
        <div class="form-group">
          <label class="form-label">Tipo de Documento</label>
          <input class="form-control" value="${cfg.tipo_documento==='recibo_honorarios'?'Recibo por Honorarios':'Factura de Venta'}" disabled>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Fecha de Emisión *</label>
          <input class="form-control" type="date" id="niFechaEmision" value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label class="form-label">Fecha de Vencimiento</label>
          <input class="form-control" type="date" id="niFechaVence">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Descripción del servicio *</label>
        <textarea class="form-control" id="niDesc" rows="3" placeholder="Descripción detallada del servicio o producto..."></textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Monto Gravado (L)</label>
          <input class="form-control" type="number" step="0.01" id="niGravado" value="0" oninput="calcInvoiceTotals()">
        </div>
        <div class="form-group">
          <label class="form-label">Monto Exento (L)</label>
          <input class="form-control" type="number" step="0.01" id="niExento" value="0" oninput="calcInvoiceTotals()">
        </div>
        <div class="form-group">
          <label class="form-label">Monto Exonerado (L)</label>
          <input class="form-control" type="number" step="0.01" id="niExonerado" value="0" oninput="calcInvoiceTotals()">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">ISV %</label>
          <select class="form-control" id="niIsv" onchange="calcInvoiceTotals()">
            <option value="0">0% — Exento</option>
            <option value="12.5">12.5%</option>
            <option value="15" selected>15%</option>
            <option value="18">18%</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">ISV Calculado (L)</label>
          <input class="form-control" id="niIsvMonto" readonly style="background:var(--gray-50)" value="0.00">
        </div>
        <div class="form-group">
          <label class="form-label">Total (L)</label>
          <input class="form-control" id="niTotal" readonly style="background:var(--gray-50);font-weight:700" value="0.00">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Estado</label>
          <select class="form-control" id="niEstado">
            <option value="borrador">Borrador</option>
            <option value="enviada">Enviada</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Adjuntar PDF (opcional)</label>
          <input type="file" class="form-control" id="niPdf" accept=".pdf">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Notas</label>
        <textarea class="form-control" id="niNotas" rows="2" placeholder="Notas internas..."></textarea>
      </div>
    `,
    footer: `
      <button class="btn btn-secondary" onclick="hideModal('modalNewInvoice')">Cancelar</button>
      <button class="btn btn-primary" onclick="submitNewInvoice()">Crear Factura</button>
    `
  });
  showModal('modalNewInvoice');
}

window.calcInvoiceTotals = function() {
  const gravado = parseFloat(document.getElementById('niGravado')?.value) || 0;
  const exento = parseFloat(document.getElementById('niExento')?.value) || 0;
  const exonerado = parseFloat(document.getElementById('niExonerado')?.value) || 0;
  const isvPct = parseFloat(document.getElementById('niIsv')?.value) || 0;
  const isvMonto = gravado * (isvPct / 100);
  const total = gravado + exento + exonerado + isvMonto;
  if (document.getElementById('niIsvMonto')) document.getElementById('niIsvMonto').value = isvMonto.toFixed(2);
  if (document.getElementById('niTotal')) document.getElementById('niTotal').value = total.toFixed(2);
};

window.loadInvoiceProjects = async function(companyId) {
  if (!companyId) return;
  try {
    const projects = await api.getProjects(companyId);
    const sel = document.getElementById('niProyecto');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Sin proyecto —</option>' +
      projects.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('');
  } catch {}
};

window.submitNewInvoice = async function() {
  const errEl = document.getElementById('niError');
  const empresa = document.getElementById('niEmpresa').value;
  const numero = document.getElementById('niNumero').value.trim();
  const fecha = document.getElementById('niFechaEmision').value;
  const desc = document.getElementById('niDesc').value.trim();
  const total = document.getElementById('niTotal').value;
  if (!empresa || !numero || !fecha || !desc) {
    errEl.textContent = 'Empresa, número, fecha y descripción son requeridos';
    errEl.classList.remove('hidden');
    return;
  }
  try {
    const form = new FormData();
    form.append('company_id', empresa);
    const proj = document.getElementById('niProyecto').value;
    if (proj) form.append('project_id', proj);
    form.append('numero_factura', numero);
    form.append('fecha_emision', fecha);
    const vence = document.getElementById('niFechaVence').value;
    if (vence) form.append('fecha_vencimiento', vence);
    form.append('descripcion', desc);
    form.append('monto_gravado', document.getElementById('niGravado').value || '0');
    form.append('monto_exento', document.getElementById('niExento').value || '0');
    form.append('monto_exonerado', document.getElementById('niExonerado').value || '0');
    form.append('isv_porcentaje', document.getElementById('niIsv').value);
    form.append('isv_monto', document.getElementById('niIsvMonto').value);
    form.append('total', total);
    form.append('estado', document.getElementById('niEstado').value);
    const notas = document.getElementById('niNotas').value.trim();
    if (notas) form.append('notas', notas);
    const pdf = document.getElementById('niPdf').files[0];
    if (pdf) form.append('pdf', pdf);

    const inv = await api.createInvoice(form);
    hideModal('modalNewInvoice');
    toast('Factura creada', 'success');
    App.navigate(`factura/${inv.id}`);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
};
```

- [ ] **Step 3: Agregar ruta #/factura/:id en app.js**

En `App.route()`, agregar:

```javascript
    } else if (parts[0] === 'factura' && parts[1]) {
      if (this.user.role !== 'admin') { this.navigate(''); return; }
      renderInvoiceDetail(parts[1]);
    }
```

- [ ] **Step 4: Agregar renderInvoiceDetail en billing.js**

```javascript
async function renderInvoiceDetail(id) {
  const app = document.getElementById('app');
  app.innerHTML = renderAppShell('facturacion', `
    <div class="page-header">
      <div class="page-header-left">
        <div class="breadcrumb">
          <a href="#" onclick="App.navigate('facturacion')">Facturación</a>
          <span class="sep">›</span>
          <span id="invBreadcrumb">Cargando...</span>
        </div>
      </div>
      <div class="flex gap-2" id="invActions"></div>
    </div>
    <div class="page-body" id="invBody">
      <div class="loading-overlay"><div class="spinner"></div></div>
    </div>
  `);

  try {
    const inv = await api.getInvoice(id);
    document.getElementById('invBreadcrumb').textContent = `Factura ${inv.numero_factura}`;
    document.getElementById('invActions').innerHTML = `
      <select class="form-control" id="invEstadoSel" style="width:160px" onchange="updateInvoiceEstado(${inv.id}, this.value)">
        ${['borrador','enviada','pagada','vencida','anulada'].map(e =>
          `<option value="${e}" ${inv.estado===e?'selected':''}>${e.charAt(0).toUpperCase()+e.slice(1)}</option>`
        ).join('')}
      </select>
      ${inv.pdf_filename ? `<a href="/api/invoices/${inv.id}/download" class="btn btn-secondary btn-sm" download>📥 PDF</a>` : ''}
      ${inv.estado === 'borrador' ? `<button class="btn btn-danger btn-sm" onclick="deleteInvoiceConfirm(${inv.id})">🗑️ Eliminar</button>` : ''}
    `;
    renderInvoiceBody(inv);
  } catch (err) { toast(err.message, 'error'); }
}

function renderInvoiceBody(inv) {
  const cfg = inv.fiscal_config || {};
  const tipDoc = cfg.tipo_documento === 'recibo_honorarios' ? 'RECIBO POR HONORARIOS' : 'FACTURA DE VENTA';
  document.getElementById('invBody').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 340px;gap:20px">
      <!-- Factura SAR -->
      <div>
        <div class="invoice-sar mb-4">
          <div class="invoice-sar-header">
            <div class="invoice-sar-emisor">
              <strong style="font-size:14px">${escHtml(cfg.nombre_emisor||'—')}</strong><br>
              RTN: ${escHtml(cfg.rtn_emisor||'—')}<br>
              ${escHtml(cfg.direccion_emisor||'')}<br>
              ${cfg.telefono_emisor ? `Tel: ${escHtml(cfg.telefono_emisor)}` : ''}
            </div>
            <div class="invoice-sar-title">
              <div style="font-size:11px;color:var(--gray-500)">${tipDoc}</div>
              <div class="num">${escHtml(inv.numero_factura)}</div>
              <div style="font-size:12px">Emisión: ${formatDate(inv.fecha_emision)}</div>
              ${inv.fecha_vencimiento ? `<div style="font-size:12px">Vence: ${formatDate(inv.fecha_vencimiento)}</div>` : ''}
              <div class="mt-2"><span class="badge estado-${inv.estado}">${inv.estado.charAt(0).toUpperCase()+inv.estado.slice(1)}</span></div>
            </div>
          </div>

          <div class="invoice-sar-cai">
            <strong>CAI:</strong> ${escHtml(cfg.cai||'No configurado')}<br>
            <strong>Rango autorizado:</strong> ${escHtml(cfg.rango_inicio||'—')} – ${escHtml(cfg.rango_fin||'—')} &nbsp;|&nbsp;
            <strong>Fecha límite:</strong> ${formatDate(cfg.fecha_limite_emision)}
          </div>

          <div class="invoice-sar-parties">
            <div class="invoice-sar-party">
              <strong>Emisor</strong>
              ${escHtml(cfg.nombre_emisor||'—')}<br>
              RTN: ${escHtml(cfg.rtn_emisor||'—')}<br>
              ${escHtml(cfg.direccion_emisor||'')}
            </div>
            <div class="invoice-sar-party">
              <strong>Cliente</strong>
              ${escHtml(inv.fiscal_name || inv.company_name)}<br>
              RTN: ${escHtml(inv.company_rtn||'—')}<br>
              ${escHtml(inv.fiscal_address||'')}
            </div>
          </div>

          <table class="invoice-table">
            <thead><tr><th>Descripción</th><th style="text-align:right">Monto Gravado</th><th style="text-align:right">Exento</th><th style="text-align:right">Exonerado</th></tr></thead>
            <tbody>
              <tr>
                <td>${escHtml(inv.descripcion)}</td>
                <td style="text-align:right">L ${parseFloat(inv.monto_gravado).toFixed(2)}</td>
                <td style="text-align:right">L ${parseFloat(inv.monto_exento).toFixed(2)}</td>
                <td style="text-align:right">L ${parseFloat(inv.monto_exonerado).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>

          <div class="invoice-totals">
            <div class="invoice-totals-grid">
              <div class="invoice-totals-row"><span>Monto Gravado</span><span>L ${parseFloat(inv.monto_gravado).toFixed(2)}</span></div>
              <div class="invoice-totals-row"><span>Monto Exento</span><span>L ${parseFloat(inv.monto_exento).toFixed(2)}</span></div>
              <div class="invoice-totals-row"><span>Monto Exonerado</span><span>L ${parseFloat(inv.monto_exonerado).toFixed(2)}</span></div>
              <div class="invoice-totals-row"><span>ISV (${inv.isv_porcentaje}%)</span><span>L ${parseFloat(inv.isv_monto).toFixed(2)}</span></div>
              <div class="invoice-totals-row total"><span>TOTAL</span><span>L ${parseFloat(inv.total).toFixed(2)}</span></div>
            </div>
          </div>

          ${inv.notas ? `<div style="margin-top:16px;padding:12px;background:var(--gray-50);border-radius:6px;font-size:12px"><strong>Notas:</strong> ${escHtml(inv.notas)}</div>` : ''}
        </div>
      </div>

      <!-- Sidebar: pagos -->
      <div>
        <div class="card mb-4">
          <div class="card-header">
            <span class="card-title">💳 Pagos</span>
            ${inv.estado !== 'anulada' && inv.saldo > 0 ? `<button class="btn btn-primary btn-sm" onclick="openAddPayment(${inv.id})">+ Pago</button>` : ''}
          </div>
          <div class="card-body">
            <div class="flex justify-between text-sm mb-3">
              <span class="text-gray">Total factura</span><strong>L ${parseFloat(inv.total).toFixed(2)}</strong>
            </div>
            <div class="flex justify-between text-sm mb-3">
              <span class="text-gray">Total cobrado</span><strong class="text-success">L ${parseFloat(inv.total_pagado).toFixed(2)}</strong>
            </div>
            <div class="flex justify-between text-sm mb-4">
              <span class="text-gray">Saldo pendiente</span>
              <strong class="${inv.saldo > 0 ? 'text-danger' : ''}">L ${parseFloat(inv.saldo).toFixed(2)}</strong>
            </div>
            <div id="paymentsList">
              ${renderPaymentsList(inv.payments, inv.id)}
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">📋 Detalles</span></div>
          <div class="card-body" style="font-size:13px">
            <div class="flex justify-between py-1"><span class="text-gray">Empresa</span><span>${escHtml(inv.company_name)}</span></div>
            ${inv.project_name ? `<div class="flex justify-between py-1"><span class="text-gray">Proyecto</span><span>${escHtml(inv.project_name)}</span></div>` : ''}
            <div class="flex justify-between py-1"><span class="text-gray">Creado por</span><span>${escHtml(inv.creator_name||'—')}</span></div>
            <div class="flex justify-between py-1"><span class="text-gray">Creado</span><span>${formatDateTime(inv.created_at)}</span></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderPaymentsList(payments, invoiceId) {
  if (!payments.length) return '<p class="text-sm text-gray">Sin pagos registrados.</p>';
  return payments.map(p => `
    <div class="payment-item">
      <div>
        <div class="text-sm font-semibold">L ${parseFloat(p.monto).toFixed(2)}</div>
        <div class="text-xs text-gray">${formatDate(p.fecha_pago)} ${p.metodo_pago ? '· '+escHtml(p.metodo_pago) : ''}</div>
        ${p.notas ? `<div class="text-xs text-gray">${escHtml(p.notas)}</div>` : ''}
      </div>
      <button class="btn btn-ghost btn-sm" onclick="deletePaymentItem(${invoiceId}, ${p.id})">🗑️</button>
    </div>
  `).join('');
}

window.openAddPayment = function(invoiceId) {
  createModal({
    id: 'modalAddPayment',
    title: 'Registrar Pago',
    body: `
      <div id="apError" class="form-error hidden"></div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Monto (L) *</label>
          <input class="form-control" type="number" step="0.01" id="apMonto" placeholder="0.00">
        </div>
        <div class="form-group">
          <label class="form-label">Fecha de Pago *</label>
          <input class="form-control" type="date" id="apFecha" value="${new Date().toISOString().split('T')[0]}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Método de Pago</label>
        <select class="form-control" id="apMetodo">
          <option value="">— Seleccionar —</option>
          <option value="transferencia">Transferencia bancaria</option>
          <option value="efectivo">Efectivo</option>
          <option value="cheque">Cheque</option>
          <option value="tarjeta">Tarjeta</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Notas</label>
        <input class="form-control" id="apNotas" placeholder="Número de referencia, etc.">
      </div>
    `,
    footer: `
      <button class="btn btn-secondary" onclick="hideModal('modalAddPayment')">Cancelar</button>
      <button class="btn btn-primary" onclick="submitPayment(${invoiceId})">Registrar</button>
    `
  });
  showModal('modalAddPayment');
};

window.submitPayment = async function(invoiceId) {
  const monto = document.getElementById('apMonto').value;
  const fecha = document.getElementById('apFecha').value;
  const errEl = document.getElementById('apError');
  if (!monto || !fecha) { errEl.textContent = 'Monto y fecha son requeridos'; errEl.classList.remove('hidden'); return; }
  try {
    const inv = await api.addPayment(invoiceId, {
      monto: parseFloat(monto),
      fecha_pago: fecha,
      metodo_pago: document.getElementById('apMetodo').value || null,
      notas: document.getElementById('apNotas').value.trim() || null,
    });
    hideModal('modalAddPayment');
    toast('Pago registrado', 'success');
    document.getElementById('paymentsList').innerHTML = renderPaymentsList(inv.payments, invoiceId);
    renderInvoiceBody(inv);
  } catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
};

window.deletePaymentItem = async function(invoiceId, paymentId) {
  confirm('¿Eliminar este pago?', async () => {
    try {
      const inv = await api.deletePayment(invoiceId, paymentId);
      document.getElementById('paymentsList').innerHTML = renderPaymentsList(inv.payments, invoiceId);
      renderInvoiceBody(inv);
      toast('Pago eliminado', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
};

window.updateInvoiceEstado = async function(invoiceId, estado) {
  try {
    const form = new FormData();
    form.append('estado', estado);
    await api.updateInvoice(invoiceId, form);
    toast('Estado actualizado', 'success');
  } catch (err) { toast(err.message, 'error'); }
};

window.deleteInvoiceConfirm = function(invoiceId) {
  confirm('¿Eliminar esta factura? Solo se pueden eliminar borradores.', async () => {
    try {
      await api.deleteInvoice(invoiceId);
      toast('Factura eliminada', 'success');
      App.navigate('facturacion');
    } catch (err) { toast(err.message, 'error'); }
  }, { danger: true, label: 'Eliminar' });
};
```

- [ ] **Step 5: Commit**

```bash
git add public/js/views/billing.js
git commit -m "feat: vista Facturación — lista, modal nueva factura SAR, detalle con pagos"
```

---

### Verificación final Plan E

- [ ] **Reiniciar servidor y probar**

```bash
cd "C:/Users/jeffr/OneDrive/Aplicaciones/Proyecto-CMS-jeff"
node server.js &
sleep 3
# Verificar arranque limpio
curl -s http://localhost:3000/api/health
```

Abrir http://localhost:3000 → login → verificar:
1. Sidebar tiene "💰 Facturación" y "🧾 Config. Fiscal" (solo admin)
2. Config. Fiscal guarda y muestra datos
3. Empresa → tab "🏛️ Datos Fiscales" guarda RTN
4. Proyecto → editar muestra Valor del Contrato y Frecuencia
5. Facturación → "Nueva Factura" abre modal con cálculos automáticos
6. Crear factura redirige al detalle con vista SAR completa
7. Registrar pago actualiza saldo en tiempo real

- [ ] **Commit final y push**

```bash
git add -A
git push origin main
```
