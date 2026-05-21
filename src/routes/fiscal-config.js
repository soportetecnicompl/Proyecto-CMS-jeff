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
