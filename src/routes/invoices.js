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
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Campos requeridos: empresa, número, fecha, descripción, total' });
    }
    const cfg = db.prepare('SELECT * FROM fiscal_config WHERE id = 1').get();
    if (cfg && cfg.rango_inicio && cfg.rango_fin) {
      const n = parseInt(numero_factura);
      if (n < parseInt(cfg.rango_inicio) || n > parseInt(cfg.rango_fin)) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: `Número fuera del rango CAI (${cfg.rango_inicio}–${cfg.rango_fin})` });
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
  db.prepare('INSERT INTO invoice_payments (invoice_id, monto, fecha_pago, metodo_pago, notas) VALUES (?,?,?,?,?)')
    .run(req.params.id, parseFloat(monto), fecha_pago, metodo_pago||null, notas||null);
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
