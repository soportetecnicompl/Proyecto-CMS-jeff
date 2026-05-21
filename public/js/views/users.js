async function renderUsers() {
  const app = document.getElementById('app');
  app.innerHTML = renderAppShell('usuarios', `
    <div class="page-header">
      <div class="page-header-left">
        <h1>👥 Usuarios</h1>
      </div>
      ${App.user.role === 'admin' ? `<button class="btn btn-primary" onclick="openCreateUser()">+ Nuevo Usuario</button>` : ''}
    </div>
    <div class="page-body">
      <div id="usersContent">
        <div class="loading-overlay"><div class="spinner"></div></div>
      </div>
    </div>
  `);

  try {
    const users = await api.getUsers();
    renderUsersTable(users);
  } catch (err) {
    toast(err.message, 'error');
    document.getElementById('usersContent').innerHTML = `<div class="empty-state"><div class="icon">❌</div><h3>Sin acceso</h3><p>No tienes permisos para ver esta sección.</p></div>`;
  }
}

function renderUsersTable(users) {
  document.getElementById('usersContent').innerHTML = `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Total: ${users.length} usuarios</span>
        <div class="search-box">
          <span>🔍</span>
          <input type="text" id="searchUsers" placeholder="Buscar usuario..." oninput="filterUsers(event)">
        </div>
      </div>
      <div class="card-body" style="padding:0">
        <table class="data-table" id="usersTable">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Empresas</th>
              <th>Estado</th>
              <th>Registro</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody id="usersTableBody">
            ${renderUserRows(users)}
          </tbody>
        </table>
      </div>
    </div>
  `;

  window._allUsers = users;
}

function renderUserRows(users) {
  if (!users.length) return `<tr><td colspan="7" style="text-align:center; padding:40px; color:var(--gray-400)">Sin usuarios</td></tr>`;

  return users.map(u => `
    <tr>
      <td>
        <div class="flex items-center gap-2">
          <div class="comment-avatar" style="width:32px;height:32px;font-size:12px">${avatarInitials(u.name)}</div>
          <div>
            <div class="font-semibold">${escHtml(u.name)}</div>
            ${u.id === App.user.id ? '<span class="badge badge-indigo" style="font-size:10px">Tú</span>' : ''}
          </div>
        </div>
      </td>
      <td>${escHtml(u.email)}</td>
      <td>
        <span class="badge ${u.role === 'admin' ? 'badge-purple' : 'badge-blue'}">
          ${u.role === 'admin' ? '🔑 Admin' : '👤 Usuario'}
        </span>
      </td>
      <td class="text-sm text-gray">${u.company_count || 0} empresa(s)</td>
      <td>
        <span class="badge ${u.is_active ? 'badge-green' : 'badge-red'}">
          ${u.is_active ? '✅ Activo' : '❌ Inactivo'}
        </span>
      </td>
      <td class="text-sm text-gray">${formatDate(u.created_at)}</td>
      <td>
        <div class="flex gap-1">
          <button class="btn btn-secondary btn-sm" onclick="openEditUser(${u.id})">✏️</button>
          ${u.id !== App.user.id ? `<button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id}, '${escHtml(u.name)}')">🗑️</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

window.filterUsers = function(e) {
  const q = e.target.value.toLowerCase();
  const filtered = (window._allUsers || []).filter(u =>
    u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  );
  document.getElementById('usersTableBody').innerHTML = renderUserRows(filtered);
};

function openCreateUser() {
  createModal({
    id: 'modalCreateUser',
    title: 'Nuevo Usuario',
    body: `
      <div id="cuError" class="form-error hidden"></div>
      <div class="form-group">
        <label class="form-label">Nombre *</label>
        <input class="form-control" id="cuName" placeholder="Nombre completo">
      </div>
      <div class="form-group">
        <label class="form-label">Email *</label>
        <input class="form-control" id="cuEmail" type="email" placeholder="correo@ejemplo.com">
      </div>
      <div class="form-group">
        <label class="form-label">Contraseña * (mínimo 8 caracteres)</label>
        <input class="form-control" id="cuPass" type="password" placeholder="••••••••">
      </div>
      <div class="form-group">
        <label class="form-label">Rol</label>
        <select class="form-control" id="cuRole">
          <option value="user">Usuario</option>
          <option value="admin">Administrador</option>
        </select>
      </div>
    `,
    footer: `
      <button class="btn btn-secondary" onclick="hideModal('modalCreateUser')">Cancelar</button>
      <button class="btn btn-primary" onclick="submitCreateUser()">Crear Usuario</button>
    `
  });
  showModal('modalCreateUser');
}

window.submitCreateUser = async function() {
  const name = document.getElementById('cuName').value.trim();
  const email = document.getElementById('cuEmail').value.trim();
  const password = document.getElementById('cuPass').value;
  const errEl = document.getElementById('cuError');

  if (!name || !email || !password) {
    errEl.textContent = 'Todos los campos son requeridos';
    errEl.classList.remove('hidden');
    return;
  }

  try {
    await api.createUser({
      name,
      email,
      password,
      role: document.getElementById('cuRole').value,
    });
    hideModal('modalCreateUser');
    toast('Usuario creado', 'success');
    const users = await api.getUsers();
    renderUsersTable(users);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
};

window.openEditUser = async function(id) {
  const user = await api.getUser(id);

  createModal({
    id: 'modalEditUser',
    title: 'Editar Usuario',
    body: `
      <div id="euError" class="form-error hidden"></div>
      <div class="form-group">
        <label class="form-label">Nombre *</label>
        <input class="form-control" id="euName" value="${escHtml(user.name)}">
      </div>
      <div class="form-group">
        <label class="form-label">Email *</label>
        <input class="form-control" id="euEmail" type="email" value="${escHtml(user.email)}">
      </div>
      <div class="form-group">
        <label class="form-label">Nueva contraseña (dejar vacío para no cambiar)</label>
        <input class="form-control" id="euPass" type="password" placeholder="••••••••">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Rol</label>
          <select class="form-control" id="euRole">
            <option value="user" ${user.role==='user'?'selected':''}>Usuario</option>
            <option value="admin" ${user.role==='admin'?'selected':''}>Administrador</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Estado</label>
          <select class="form-control" id="euActive">
            <option value="1" ${user.is_active?'selected':''}>Activo</option>
            <option value="0" ${!user.is_active?'selected':''}>Inactivo</option>
          </select>
        </div>
      </div>
    `,
    footer: `
      <button class="btn btn-secondary" onclick="hideModal('modalEditUser')">Cancelar</button>
      <button class="btn btn-primary" onclick="submitEditUser(${id})">Guardar</button>
    `
  });
  showModal('modalEditUser');
};

window.submitEditUser = async function(id) {
  const name = document.getElementById('euName').value.trim();
  const email = document.getElementById('euEmail').value.trim();
  const errEl = document.getElementById('euError');

  if (!name || !email) {
    errEl.textContent = 'Nombre y email son requeridos';
    errEl.classList.remove('hidden');
    return;
  }

  const data = {
    name,
    email,
    role: document.getElementById('euRole').value,
    is_active: document.getElementById('euActive').value === '1',
  };

  const pass = document.getElementById('euPass').value;
  if (pass) data.password = pass;

  try {
    await api.updateUser(id, data);
    hideModal('modalEditUser');
    toast('Usuario actualizado', 'success');
    const users = await api.getUsers();
    renderUsersTable(users);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
};

window.deleteUser = function(id, name) {
  confirm(`¿Eliminar al usuario "${name}"? Esta acción no se puede deshacer.`, async () => {
    try {
      await api.deleteUser(id);
      toast('Usuario eliminado', 'success');
      const users = await api.getUsers();
      renderUsersTable(users);
    } catch (err) { toast(err.message, 'error'); }
  });
};

window.openCreateUser = openCreateUser;


