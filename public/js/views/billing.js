let _billingPage = 1;
const _billingPerPage = 20;
let _allInvoices = [];

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
            <input type="date" class="form-control" id="filterInvDesde" style="width:140px" onchange="applyBillingFilters()">
            <input type="date" class="form-control" id="filterInvHasta" style="width:140px" onchange="applyBillingFilters()">
            <input class="form-control" id="filterInvQ" style="width:180px" placeholder="Buscar número o descripción..." oninput="applyBillingFilters()">
          </div>
        </div>
      </div>
      <div id="invoicesList"><div class="loading-overlay"><div class="spinner"></div></div></div>
    </div>
  `);

  try {
    const [invoices, companies] = await Promise.all([api.getInvoices(), api.getCompanies()]);
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

window.applyBillingFilters = function() {
  _billingPage = 1;
  const empresa = document.getElementById('filterInvEmpresa')?.value || '';
  const estado = document.getElementById('filterInvEstado')?.value || '';
  const desde = document.getElementById('filterInvDesde')?.value || '';
  const hasta = document.getElementById('filterInvHasta')?.value || '';
  const q = (document.getElementById('filterInvQ')?.value || '').toLowerCase();
  const filtered = _allInvoices.filter(inv => {
    if (empresa && String(inv.company_id) !== empresa) return false;
    if (estado && inv.estado !== estado) return false;
    if (desde && inv.fecha_emision < desde) return false;
    if (hasta && inv.fecha_emision > hasta) return false;
    if (q && !inv.numero_factura.toLowerCase().includes(q) && !inv.descripcion.toLowerCase().includes(q)) return false;
    return true;
  });
  renderInvoiceList(filtered);
};

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
      <table style="width:100%;border-collapse:collapse;font-size:13px">
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
            <tr style="border-bottom:1px solid var(--gray-100);cursor:pointer" onclick="App.navigate('factura/${inv.id}')">
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

async function openNewInvoice() {
  const cfg = await api.getFiscalConfig();
  if (!cfg || !cfg.cai) {
    toast('Configura el CAI antes de emitir facturas (🧾 Config. Fiscal)', 'warning');
    return;
  }
  const companies = await api.getCompanies();
  const lastInv = await api.getInvoices().then(list =>
    list.filter(i => i.estado !== 'anulada').sort((a,b) => parseInt(b.numero_factura)-parseInt(a.numero_factura))[0]
  ).catch(() => null);
  const nextNum = lastInv
    ? String(parseInt(lastInv.numero_factura) + 1).padStart((cfg.rango_inicio||'000001').length, '0')
    : (cfg.rango_inicio || '000001');

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
          <div class="text-xs text-gray mt-1">Rango: ${escHtml(cfg.rango_inicio||'—')} – ${escHtml(cfg.rango_fin||'—')}</div>
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
        <textarea class="form-control" id="niDesc" rows="3" placeholder="Descripción detallada del servicio..."></textarea>
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
      <select class="form-control" style="width:160px" onchange="updateInvoiceEstado(${inv.id}, this.value)">
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
      <div>
        <div class="invoice-sar mb-4">
          <div class="invoice-sar-header">
            <div class="invoice-sar-emisor">
              <strong style="font-size:14px">${escHtml(cfg.nombre_emisor||'—')}</strong><br>
              RTN: ${escHtml(cfg.rtn_emisor||'—')}<br>
              ${escHtml(cfg.direccion_emisor||'')}
              ${cfg.telefono_emisor ? `<br>Tel: ${escHtml(cfg.telefono_emisor)}` : ''}
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
            <strong>Rango:</strong> ${escHtml(cfg.rango_inicio||'—')} – ${escHtml(cfg.rango_fin||'—')} &nbsp;|&nbsp;
            <strong>Fecha límite:</strong> ${formatDate(cfg.fecha_limite_emision)}
          </div>
          <div class="invoice-sar-parties">
            <div class="invoice-sar-party">
              <strong>Emisor</strong>
              ${escHtml(cfg.nombre_emisor||'—')}<br>RTN: ${escHtml(cfg.rtn_emisor||'—')}<br>${escHtml(cfg.direccion_emisor||'')}
            </div>
            <div class="invoice-sar-party">
              <strong>Cliente</strong>
              ${escHtml(inv.fiscal_name || inv.company_name)}<br>RTN: ${escHtml(inv.company_rtn||'—')}<br>${escHtml(inv.fiscal_address||'')}
            </div>
          </div>
          <table class="invoice-table">
            <thead><tr>
              <th>Descripción</th>
              <th style="text-align:right">Monto Gravado</th>
              <th style="text-align:right">Exento</th>
              <th style="text-align:right">Exonerado</th>
            </tr></thead>
            <tbody><tr>
              <td>${escHtml(inv.descripcion)}</td>
              <td style="text-align:right">L ${parseFloat(inv.monto_gravado).toFixed(2)}</td>
              <td style="text-align:right">L ${parseFloat(inv.monto_exento).toFixed(2)}</td>
              <td style="text-align:right">L ${parseFloat(inv.monto_exonerado).toFixed(2)}</td>
            </tr></tbody>
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

      <div>
        <div class="card mb-4">
          <div class="card-header">
            <span class="card-title">💳 Pagos</span>
            ${inv.estado !== 'anulada' && inv.saldo > 0 ? `<button class="btn btn-primary btn-sm" onclick="openAddPayment(${inv.id})">+ Pago</button>` : ''}
          </div>
          <div class="card-body">
            <div class="flex justify-between text-sm mb-2">
              <span class="text-gray">Total factura</span><strong>L ${parseFloat(inv.total).toFixed(2)}</strong>
            </div>
            <div class="flex justify-between text-sm mb-2">
              <span class="text-gray">Total cobrado</span><strong style="color:var(--success)">L ${parseFloat(inv.total_pagado).toFixed(2)}</strong>
            </div>
            <div class="flex justify-between text-sm mb-4">
              <span class="text-gray">Saldo</span>
              <strong class="${inv.saldo > 0 ? 'text-danger' : ''}">L ${parseFloat(inv.saldo).toFixed(2)}</strong>
            </div>
            <div id="paymentsList">${renderPaymentsList(inv.payments, inv.id)}</div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">📋 Detalles</span></div>
          <div class="card-body" style="font-size:13px">
            <div class="flex justify-between py-1"><span class="text-gray">Empresa</span><span>${escHtml(inv.company_name)}</span></div>
            ${inv.project_name ? `<div class="flex justify-between py-1"><span class="text-gray">Proyecto</span><span>${escHtml(inv.project_name)}</span></div>` : ''}
            <div class="flex justify-between py-1"><span class="text-gray">Creado por</span><span>${escHtml(inv.creator_name||'—')}</span></div>
            <div class="flex justify-between py-1"><span class="text-gray">Fecha creación</span><span>${formatDateTime(inv.created_at)}</span></div>
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
