async function renderDashboard() {
  const app = document.getElementById('app');
  app.innerHTML = renderAppShell('dashboard', `
    <div class="page-header">
      <div class="page-header-left">
        <h1>Mis Empresas</h1>
      </div>
      <div class="flex gap-2">
        <div class="search-box">
          <span>🔍</span>
          <input type="text" id="searchCompanies" placeholder="Buscar empresa...">
        </div>
        ${App.user.role === 'admin' ? `<button class="btn btn-primary" onclick="openCreateCompany()">+ Nueva Empresa</button>` : ''}
      </div>
    </div>
    <div class="page-body">
      <div id="statsRow" class="grid-4 mb-6"></div>
      <div id="companiesGrid" class="grid-3">
        <div class="loading-overlay"><div class="spinner"></div></div>
      </div>
    </div>
  `);

  try {
    const companies = await api.getCompanies();
    renderStats(companies);
    renderCompanies(companies);

    document.getElementById('searchCompanies').addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      const filtered = companies.filter(c =>
        c.name.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q)
      );
      renderCompanies(filtered);
    });
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderStats(companies) {
  const totalProjects = companies.reduce((s, c) => s + (c.project_count || 0), 0);
  const totalMembers = companies.reduce((s, c) => s + (c.member_count || 0), 0);

  document.getElementById('statsRow').innerHTML = `
    <div class="stat-card">
      <div class="stat-icon stat-icon-blue">🏢</div>
      <div class="stat-info">
        <div class="value">${companies.length}</div>
        <div class="label">Empresas</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon stat-icon-purple">📁</div>
      <div class="stat-info">
        <div class="value">${totalProjects}</div>
        <div class="label">Proyectos</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon stat-icon-green">👥</div>
      <div class="stat-info">
        <div class="value">${totalMembers}</div>
        <div class="label">Miembros</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon stat-icon-yellow">⚡</div>
      <div class="stat-info">
        <div class="value">${App.user.role === 'admin' ? 'Admin' : 'Usuario'}</div>
        <div class="label">Tu rol</div>
      </div>
    </div>
  `;
}

function renderCompanies(companies) {
  const grid = document.getElementById('companiesGrid');
  if (!companies.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="icon">🏢</div>
        <h3>Sin empresas</h3>
        <p>No hay empresas disponibles aún.</p>
        ${App.user.role === 'admin' ? `<button class="btn btn-primary" onclick="openCreateCompany()">+ Crear empresa</button>` : ''}
      </div>
    `;
    return;
  }

  grid.innerHTML = companies.map(c => `
    <div class="company-card" onclick="App.navigate('empresa/${c.id}')">
      <div class="company-card-header" style="background:${c.color}"></div>
      <div class="company-card-body">
        <div class="company-icon" style="background:${c.color}">
          ${avatarInitials(c.name)}
        </div>
        <h3>${escHtml(c.name)}</h3>
        <p>${escHtml(c.description || 'Sin descripción')}</p>
        ${c.my_role ? `<span class="badge badge-indigo mt-3" style="display:inline-flex">${roleLabel(c.my_role)}</span>` : ''}
      </div>
      <div class="company-card-footer">
        <span>📁 ${c.project_count || 0} proyectos</span>
        <span>👥 ${c.member_count || 0} miembros</span>
      </div>
    </div>
  `).join('');
}

function roleLabel(r) {
  return { admin: 'Administrador', member: 'Miembro', viewer: 'Observador' }[r] || r;
}

function openCreateCompany() {
  const colors = ['#6366f1','#3B82F6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4'];
  let selectedColor = '#6366f1';

  createModal({
    id: 'modalCreateCompany',
    title: 'Nueva Empresa',
    size: 'modal-lg',
    body: `
      <div id="formError" class="form-error hidden"></div>
      <div class="form-group">
        <label class="form-label">Nombre *</label>
        <input class="form-control" id="cName" placeholder="Nombre de la empresa" required>
      </div>
      <div class="form-group">
        <label class="form-label">Descripción</label>
        <textarea class="form-control" id="cDesc" placeholder="Descripción breve" rows="2"></textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Sitio web</label>
          <input class="form-control" id="cWeb" placeholder="https://...">
        </div>
        <div class="form-group">
          <label class="form-label">Teléfono</label>
          <input class="form-control" id="cPhone" placeholder="+504...">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Dirección</label>
        <input class="form-control" id="cAddr" placeholder="Dirección">
      </div>
      <div class="form-group">
        <label class="form-label">Color</label>
        <div class="color-picker">
          ${colors.map(c => `
            <div class="color-dot${c === selectedColor ? ' selected' : ''}"
              style="background:${c}" onclick="selectColor('${c}', this)" data-color="${c}"></div>
          `).join('')}
        </div>
        <input type="hidden" id="cColor" value="${selectedColor}">
      </div>
    `,
    footer: `
      <button class="btn btn-secondary" onclick="hideModal('modalCreateCompany')">Cancelar</button>
      <button class="btn btn-primary" onclick="submitCreateCompany()">Crear Empresa</button>
    `
  });
  showModal('modalCreateCompany');
}

window.selectColor = function(color, el) {
  document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('cColor').value = color;
};

window.submitCreateCompany = async function() {
  const name = document.getElementById('cName').value.trim();
  const errEl = document.getElementById('formError');

  if (!name) {
    errEl.textContent = 'El nombre es requerido';
    errEl.classList.remove('hidden');
    return;
  }

  try {
    await api.createCompany({
      name,
      description: document.getElementById('cDesc').value.trim() || null,
      color: document.getElementById('cColor').value,
      website: document.getElementById('cWeb').value.trim() || null,
      phone: document.getElementById('cPhone').value.trim() || null,
      address: document.getElementById('cAddr').value.trim() || null,
    });
    hideModal('modalCreateCompany');
    toast('Empresa creada exitosamente', 'success');
    renderDashboard();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
};

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

window.openCreateCompany = openCreateCompany;
