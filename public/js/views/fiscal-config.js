async function renderFiscalConfig() {
  const app = document.getElementById('app');
  app.innerHTML = renderAppShell('config-fiscal', `
    <div class="page-header">
      <div class="page-header-left"><h1>🧾 Configuración Fiscal SAR</h1></div>
    </div>
    <div class="page-body" style="max-width:700px">
      <div class="loading-overlay" style="position:relative;height:100px"><div class="spinner"></div></div>
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
      ${cfg.cai ? `<span class="badge badge-green mt-2" style="display:inline-flex;margin-left:12px">✅ CAI configurado</span>` : `<span class="badge badge-yellow mt-2" style="display:inline-flex;margin-left:12px">⚠️ Sin CAI configurado</span>`}
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
