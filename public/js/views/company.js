async function renderCompany(id) {
  const app = document.getElementById('app');
  app.innerHTML = renderAppShell('empresa', `
    <div class="page-header">
      <div class="page-header-left">
        <div class="breadcrumb">
          <a href="#" onclick="App.navigate('')">Empresas</a>
          <span class="sep">›</span>
          <span id="companyBreadcrumb">Cargando...</span>
        </div>
      </div>
      <div class="flex gap-2" id="companyHeaderActions"></div>
    </div>
    <div class="page-body" id="companyBody">
      <div class="loading-overlay"><div class="spinner"></div></div>
    </div>
  `);

  try {
    const [company, projects] = await Promise.all([
      api.getCompany(id),
      api.getProjects(id)
    ]);

    document.getElementById('companyBreadcrumb').textContent = company.name;
    renderCompanyContent(company, projects);
  } catch (err) {
    toast(err.message, 'error');
    document.getElementById('companyBody').innerHTML = `<div class="empty-state"><div class="icon">❌</div><h3>Error al cargar</h3></div>`;
  }
}

function renderCompanyContent(company, projects) {
  const canEdit = App.user.role === 'admin' || company.my_role === 'admin';

  document.getElementById('companyHeaderActions').innerHTML = `
    ${canEdit ? `<button class="btn btn-secondary btn-sm" onclick="openInviteModal(${company.id})">✉️ Invitar</button>` : ''}
    ${canEdit ? `<button class="btn btn-secondary btn-sm" onclick="openEditCompany(${company.id})">✏️ Editar</button>` : ''}
    <button class="btn btn-primary btn-sm" onclick="openCreateProject(${company.id})">+ Proyecto</button>
  `;

  const body = document.getElementById('companyBody');
  body.innerHTML = `
    <!-- Company header card -->
    <div class="card mb-6">
      <div class="card-body">
        <div class="flex gap-4 items-center">
          <div class="company-icon" style="background:${company.color}; width:56px; height:56px; font-size:26px">
            ${avatarInitials(company.name)}
          </div>
          <div style="flex:1">
            <h2 style="font-size:20px; font-weight:700; color:var(--gray-900)">${escHtml(company.name)}</h2>
            <p class="text-gray text-sm mt-1">${escHtml(company.description || 'Sin descripción')}</p>
            <div class="flex gap-4 mt-2 text-sm text-gray">
              ${company.website ? `<span>🌐 <a href="${company.website}" target="_blank">${company.website}</a></span>` : ''}
              ${company.phone ? `<span>📞 ${company.phone}</span>` : ''}
              ${company.address ? `<span>📍 ${company.address}</span>` : ''}
            </div>
          </div>
          <div class="flex gap-4 text-sm">
            <div style="text-align:center">
              <div style="font-size:24px; font-weight:700; color:var(--gray-900)">${projects.length}</div>
              <div class="text-gray">Proyectos</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:24px; font-weight:700; color:var(--gray-900)">${company.members?.length || 0}</div>
              <div class="text-gray">Miembros</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button class="tab-btn active" onclick="switchTab('tabProjects', this)">📁 Proyectos (${projects.length})</button>
      <button class="tab-btn" onclick="switchTab('tabMembers', this)">👥 Miembros</button>
      ${canEdit ? `<button class="tab-btn" onclick="switchTab('tabInvitations', this); loadInvitations(${company.id})">✉️ Invitaciones</button>` : ''}
      ${canEdit ? `<button class="tab-btn" onclick="switchTab('tabFiscal', this)">🏛️ Datos Fiscales</button>` : ''}
    </div>

    <!-- Projects tab -->
    <div class="tab-pane active" id="tabProjects">
      <div class="flex justify-between items-center mb-4">
        <div class="search-box">
          <span>🔍</span>
          <input type="text" id="searchProjects" placeholder="Buscar proyecto...">
        </div>
        <div class="flex gap-2">
          <select class="form-control" id="filterStatus" style="width:160px">
            <option value="">Todos los estados</option>
            <option value="activo">Activo</option>
            <option value="completado">Completado</option>
            <option value="en_espera">En espera</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
      </div>
      <div id="projectsGrid" class="grid-2">
        ${renderProjectCards(projects)}
      </div>
    </div>

    <!-- Members tab -->
    <div class="tab-pane" id="tabMembers">
      <div class="card">
        <div class="card-body" style="padding:0">
          <table class="data-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Unido</th>
                ${canEdit ? '<th>Acciones</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${(company.members || []).map(m => `
                <tr>
                  <td>
                    <div class="flex items-center gap-2">
                      <div class="comment-avatar" style="width:28px;height:28px;font-size:11px">${avatarInitials(m.name)}</div>
                      <span>${escHtml(m.name)}</span>
                    </div>
                  </td>
                  <td>${escHtml(m.email)}</td>
                  <td>
                    <span class="badge badge-indigo">${roleLabel(m.role)}</span>
                  </td>
                  <td class="text-sm text-gray">${formatDate(m.joined_at)}</td>
                  ${canEdit ? `
                    <td>
                      <div class="flex gap-1">
                        <select class="form-control" style="width:130px; padding:4px 8px; font-size:12px"
                          onchange="changeMemberRole(${company.id}, ${m.id}, this.value)">
                          <option value="admin" ${m.role==='admin'?'selected':''}>Administrador</option>
                          <option value="member" ${m.role==='member'?'selected':''}>Miembro</option>
                          <option value="viewer" ${m.role==='viewer'?'selected':''}>Observador</option>
                        </select>
                        <button class="btn btn-danger btn-sm" onclick="removeMember(${company.id}, ${m.id}, '${escHtml(m.name)}')">🗑️</button>
                      </div>
                    </td>
                  ` : ''}
                </tr>
              `).join('')}
            </tbody>
          </table>
          ${!(company.members || []).length ? `<div class="empty-state" style="padding:40px"><div class="icon">👥</div><h3>Sin miembros</h3></div>` : ''}
        </div>
      </div>
    </div>

    <!-- Invitations tab -->
    <div class="tab-pane" id="tabInvitations">
      <div id="invitationsContent">
        <div class="loading-overlay"><div class="spinner"></div></div>
      </div>
    </div>

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
  `;

  // Search/filter projects
  const allProjects = [...projects];
  function applyFilters() {
    const q = document.getElementById('searchProjects').value.toLowerCase();
    const s = document.getElementById('filterStatus').value;
    const filtered = allProjects.filter(p =>
      (!q || p.name.toLowerCase().includes(q) || (p.description||'').toLowerCase().includes(q)) &&
      (!s || p.status === s)
    );
    document.getElementById('projectsGrid').innerHTML = renderProjectCards(filtered);
  }
  document.getElementById('searchProjects').addEventListener('input', applyFilters);
  document.getElementById('filterStatus').addEventListener('change', applyFilters);

  // Store company context
  window._currentCompany = company;
}

function renderProjectCards(projects) {
  if (!projects.length) {
    return `<div class="empty-state" style="grid-column:1/-1">
      <div class="icon">📁</div>
      <h3>Sin proyectos</h3>
      <p>Crea el primer proyecto para esta empresa.</p>
    </div>`;
  }

  return projects.map(p => {
    const pct = p.progress || 0;
    const statusColors = {
      activo: '#3B82F6', completado: '#10b981', en_espera: '#8b5cf6', cancelado: '#ef4444'
    };
    return `
      <div class="project-card" onclick="App.navigate('proyecto/${p.id}')"
        style="border-left-color:${statusColors[p.status]||'var(--primary)'}">
        <div class="project-card-top">
          <div>
            <h3>${escHtml(p.name)}</h3>
          </div>
          <span class="status-badge status-${p.status}">${statusLabel(p.status)}</span>
        </div>
        <p>${escHtml(p.description || 'Sin descripción')}</p>
        <div class="progress-bar">
          <div class="progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="project-card-meta">
          <span>${pct}% completado</span>
          <span>${priorityIcon(p.priority)} ${priorityLabel(p.priority)}</span>
          <span>✅ ${p.completed_tasks || 0}/${p.task_count || 0} tareas</span>
          ${p.end_date ? `<span>📅 ${formatDate(p.end_date)}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

async function loadInvitations(companyId) {
  try {
    const invites = await api.getCompanyInvitations(companyId);
    const el = document.getElementById('invitationsContent');
    if (!invites.length) {
      el.innerHTML = `<div class="empty-state"><div class="icon">✉️</div><h3>Sin invitaciones pendientes</h3></div>`;
      return;
    }
    el.innerHTML = `
      <div class="card">
        <div class="card-body" style="padding:0">
          <table class="data-table">
            <thead>
              <tr><th>Email</th><th>Rol</th><th>Invitado por</th><th>Vence</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              ${invites.map(i => `
                <tr>
                  <td>${escHtml(i.email)}</td>
                  <td><span class="badge badge-indigo">${roleLabel(i.role)}</span></td>
                  <td>${escHtml(i.inviter_name)}</td>
                  <td class="text-sm text-gray">${formatDate(i.expires_at)}</td>
                  <td>
                    <button class="btn btn-danger btn-sm" onclick="cancelInvite(${companyId}, ${i.id})">Cancelar</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    toast(err.message, 'error');
  }
}

function switchTab(tabId, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(tabId).classList.add('active');
}

function openInviteModal(companyId) {
  createModal({
    id: 'modalInvite',
    title: 'Invitar Usuario',
    body: `
      <div id="inviteError" class="form-error hidden"></div>
      <div class="form-group">
        <label class="form-label">Email del usuario *</label>
        <input class="form-control" id="inviteEmail" type="email" placeholder="correo@ejemplo.com">
      </div>
      <div class="form-group">
        <label class="form-label">Rol</label>
        <select class="form-control" id="inviteRole">
          <option value="member">Miembro</option>
          <option value="admin">Administrador</option>
          <option value="viewer">Observador</option>
        </select>
      </div>
      <p class="text-sm text-gray">Se enviará un correo de invitación al usuario para que pueda crear su cuenta y acceder a esta empresa.</p>
    `,
    footer: `
      <button class="btn btn-secondary" onclick="hideModal('modalInvite')">Cancelar</button>
      <button class="btn btn-primary" onclick="submitInvite(${companyId})">Enviar Invitación</button>
    `
  });
  showModal('modalInvite');
}

window.submitInvite = async function(companyId) {
  const email = document.getElementById('inviteEmail').value.trim();
  const role = document.getElementById('inviteRole').value;
  const errEl = document.getElementById('inviteError');

  if (!email) {
    errEl.textContent = 'El email es requerido';
    errEl.classList.remove('hidden');
    return;
  }

  try {
    await api.inviteToCompany(companyId, { email, role });
    hideModal('modalInvite');
    toast('Invitación enviada exitosamente', 'success');
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
};

window.cancelInvite = async function(companyId, inviteId) {
  confirm('¿Cancelar esta invitación?', async () => {
    try {
      await api.cancelInvitation(companyId, inviteId);
      toast('Invitación cancelada', 'success');
      loadInvitations(companyId);
    } catch (err) { toast(err.message, 'error'); }
  });
};

window.removeMember = function(companyId, userId, name) {
  confirm(`¿Eliminar a ${name} de la empresa?`, async () => {
    try {
      await api.removeMember(companyId, userId);
      toast('Miembro eliminado', 'success');
      renderCompany(companyId);
    } catch (err) { toast(err.message, 'error'); }
  });
};

window.changeMemberRole = async function(companyId, userId, role) {
  try {
    await api.updateMemberRole(companyId, userId, role);
    toast('Rol actualizado', 'success');
  } catch (err) { toast(err.message, 'error'); }
};

function openEditCompany(companyId) {
  const c = window._currentCompany;
  const colors = ['#6366f1','#3B82F6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4'];

  createModal({
    id: 'modalEditCompany',
    title: 'Editar Empresa',
    size: 'modal-lg',
    body: `
      <div id="editCompError" class="form-error hidden"></div>
      <div class="form-group">
        <label class="form-label">Nombre *</label>
        <input class="form-control" id="ecName" value="${escHtml(c.name)}">
      </div>
      <div class="form-group">
        <label class="form-label">Descripción</label>
        <textarea class="form-control" id="ecDesc" rows="2">${escHtml(c.description || '')}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Sitio web</label>
          <input class="form-control" id="ecWeb" value="${escHtml(c.website || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Teléfono</label>
          <input class="form-control" id="ecPhone" value="${escHtml(c.phone || '')}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Dirección</label>
        <input class="form-control" id="ecAddr" value="${escHtml(c.address || '')}">
      </div>
      <div class="form-group">
        <label class="form-label">Color</label>
        <div class="color-picker">
          ${colors.map(col => `
            <div class="color-dot${col === c.color ? ' selected' : ''}"
              style="background:${col}" onclick="selectColor('${col}', this)" data-color="${col}"></div>
          `).join('')}
        </div>
        <input type="hidden" id="ecColor" value="${c.color}">
      </div>
    `,
    footer: `
      <button class="btn btn-secondary" onclick="hideModal('modalEditCompany')">Cancelar</button>
      <button class="btn btn-danger btn-sm" onclick="deleteCompany(${companyId})">Eliminar</button>
      <button class="btn btn-primary" onclick="submitEditCompany(${companyId})">Guardar</button>
    `
  });
  showModal('modalEditCompany');
}

window.submitEditCompany = async function(id) {
  const name = document.getElementById('ecName').value.trim();
  const errEl = document.getElementById('editCompError');
  if (!name) { errEl.textContent = 'El nombre es requerido'; errEl.classList.remove('hidden'); return; }

  try {
    await api.updateCompany(id, {
      name,
      description: document.getElementById('ecDesc').value.trim() || null,
      color: document.getElementById('ecColor').value,
      website: document.getElementById('ecWeb').value.trim() || null,
      phone: document.getElementById('ecPhone').value.trim() || null,
      address: document.getElementById('ecAddr').value.trim() || null,
    });
    hideModal('modalEditCompany');
    toast('Empresa actualizada', 'success');
    renderCompany(id);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
};

window.deleteCompany = function(id) {
  confirm('¿Eliminar esta empresa? Se eliminarán todos sus proyectos y tareas.', async () => {
    try {
      await api.deleteCompany(id);
      hideModal('modalEditCompany');
      toast('Empresa eliminada', 'success');
      App.navigate('');
    } catch (err) { toast(err.message, 'error'); }
  });
};

function openCreateProject(companyId) {
  createModal({
    id: 'modalCreateProject',
    title: 'Nuevo Proyecto',
    size: 'modal-lg',
    body: `
      <div id="cpError" class="form-error hidden"></div>
      <div class="form-group">
        <label class="form-label">Nombre *</label>
        <input class="form-control" id="cpName" placeholder="Nombre del proyecto">
      </div>
      <div class="form-group">
        <label class="form-label">Descripción</label>
        <textarea class="form-control" id="cpDesc" rows="3" placeholder="Describe el proyecto..."></textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Estado</label>
          <select class="form-control" id="cpStatus">
            <option value="activo">Activo</option>
            <option value="en_espera">En espera</option>
            <option value="completado">Completado</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Prioridad</label>
          <select class="form-control" id="cpPriority">
            <option value="baja">Baja</option>
            <option value="media" selected>Media</option>
            <option value="alta">Alta</option>
            <option value="critica">Crítica</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Fecha inicio</label>
          <input class="form-control" type="date" id="cpStart">
        </div>
        <div class="form-group">
          <label class="form-label">Fecha fin</label>
          <input class="form-control" type="date" id="cpEnd">
        </div>
      </div>
    `,
    footer: `
      <button class="btn btn-secondary" onclick="hideModal('modalCreateProject')">Cancelar</button>
      <button class="btn btn-primary" onclick="submitCreateProject(${companyId})">Crear Proyecto</button>
    `
  });
  showModal('modalCreateProject');
  document.getElementById('cpStart').value = new Date().toISOString().split('T')[0];
}

window.submitCreateProject = async function(companyId) {
  const name = document.getElementById('cpName').value.trim();
  const errEl = document.getElementById('cpError');
  if (!name) { errEl.textContent = 'El nombre es requerido'; errEl.classList.remove('hidden'); return; }

  try {
    const project = await api.createProject({
      company_id: companyId,
      name,
      description: document.getElementById('cpDesc').value.trim() || null,
      status: document.getElementById('cpStatus').value,
      priority: document.getElementById('cpPriority').value,
      start_date: document.getElementById('cpStart').value || null,
      end_date: document.getElementById('cpEnd').value || null,
    });
    hideModal('modalCreateProject');
    toast('Proyecto creado', 'success');
    App.navigate(`proyecto/${project.id}`);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
};

window.openInviteModal = openInviteModal;
window.openEditCompany = openEditCompany;
window.openCreateProject = openCreateProject;
window.switchTab = switchTab;
window.loadInvitations = loadInvitations;

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

