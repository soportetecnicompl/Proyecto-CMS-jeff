const App = {
  user: null,

  async init() {
    const token = localStorage.getItem('cms_token');

    // Check for invitation token in URL
    const urlParams = new URLSearchParams(window.location.search);
    const inviteToken = urlParams.get('token');
    if (inviteToken || window.location.pathname === '/invitacion') {
      this.renderInvitationPage(inviteToken);
      return;
    }

    if (!token) {
      this.renderLogin();
      return;
    }

    try {
      api.setToken(token);
      this.user = await api.getMe();
      this.setupRouter();
      this.route();
    } catch {
      api.clearToken();
      this.renderLogin();
    }
  },

  setupRouter() {
    window.addEventListener('hashchange', () => this.route());
  },

  route() {
    const hash = window.location.hash.replace('#', '').replace(/^\//, '') || '';
    const parts = hash.split('/');

    if (!this.user) { this.renderLogin(); return; }

    if (hash === '' || hash === 'dashboard') {
      renderDashboard();
    } else if (parts[0] === 'empresa' && parts[1]) {
      renderCompany(parts[1]);
    } else if (parts[0] === 'proyecto' && parts[1]) {
      renderProject(parts[1]);
    } else if (parts[0] === 'tarea' && parts[1]) {
      renderTask(parts[1]);
    } else if (hash === 'automatizaciones') {
      renderAutomations();
    } else if (hash === 'usuarios') {
      if (this.user.role !== 'admin') {
        toast('Sin acceso a esta sección', 'error');
        this.navigate('');
        return;
      }
      renderUsers();
    } else if (hash === 'perfil') {
      this.renderProfile();
    } else {
      renderDashboard();
    }
  },

  navigate(path) {
    window.location.hash = path ? `/${path}` : '';
  },

  logout() {
    confirm('¿Cerrar sesión?', () => {
      api.clearToken();
      this.user = null;
      this.renderLogin();
    });
  },

  renderLogin() {
    document.getElementById('app').innerHTML = `
      <div class="auth-page">
        <div class="auth-card">
          <div class="auth-logo">
            <h1>🗂️ ProyectoCMS</h1>
            <p>Sistema de Gestión de Proyectos</p>
          </div>
          <div id="loginError" class="form-error hidden"></div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input class="form-control" id="loginEmail" type="email" placeholder="tu@correo.com"
              onkeydown="if(event.key==='Enter') App.doLogin()">
          </div>
          <div class="form-group">
            <label class="form-label">Contraseña</label>
            <input class="form-control" id="loginPass" type="password" placeholder="••••••••"
              onkeydown="if(event.key==='Enter') App.doLogin()">
          </div>
          <button class="btn btn-primary w-full" style="margin-top:8px" onclick="App.doLogin()">
            Iniciar Sesión
          </button>
          <p class="text-sm text-gray" style="text-align:center; margin-top:20px">
            ¿Tienes una invitación? Usa el enlace enviado a tu correo.
          </p>
        </div>
      </div>
    `;
    setTimeout(() => document.getElementById('loginEmail')?.focus(), 50);
  },

  async doLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPass').value;
    const errEl = document.getElementById('loginError');

    if (!email || !password) {
      errEl.textContent = 'Ingresa tu email y contraseña';
      errEl.classList.remove('hidden');
      return;
    }

    const btn = document.querySelector('.auth-card .btn-primary');
    btn.textContent = 'Iniciando sesión...';
    btn.disabled = true;

    try {
      const data = await api.login(email, password);
      api.setToken(data.token);
      this.user = data.user;
      this.setupRouter();
      window.location.hash = '';
      this.route();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
      btn.textContent = 'Iniciar Sesión';
      btn.disabled = false;
    }
  },

  async renderInvitationPage(token) {
    document.getElementById('app').innerHTML = `
      <div class="auth-page">
        <div class="auth-card">
          <div class="auth-logo">
            <h1>🗂️ ProyectoCMS</h1>
            <p>Aceptar Invitación</p>
          </div>
          <div id="inviteContent">
            <div class="loading-overlay"><div class="spinner"></div></div>
          </div>
        </div>
      </div>
    `;

    try {
      const info = await api.getInvitation(token);
      document.getElementById('inviteContent').innerHTML = `
        <div class="form-group" style="background:var(--gray-50); padding:14px; border-radius:8px; margin-bottom:20px">
          <p class="text-sm"><strong>${escHtml(info.inviter_name)}</strong> te invita a unirte a <strong>${escHtml(info.company_name)}</strong></p>
          <p class="text-sm text-gray mt-1">Email: ${escHtml(info.email)} · Rol: ${roleLabel(info.role)}</p>
        </div>
        <div id="inviteError" class="form-error hidden"></div>
        <div class="form-group">
          <label class="form-label">Tu nombre *</label>
          <input class="form-control" id="inviteName" placeholder="Nombre completo">
        </div>
        <div class="form-group">
          <label class="form-label">Contraseña * (mínimo 8 caracteres)</label>
          <input class="form-control" id="invitePass" type="password" placeholder="••••••••">
        </div>
        <div class="form-group">
          <label class="form-label">Confirmar contraseña *</label>
          <input class="form-control" id="invitePass2" type="password" placeholder="••••••••">
        </div>
        <button class="btn btn-primary w-full" onclick="App.acceptInvite('${token}')">
          Crear Cuenta y Unirse
        </button>
      `;
    } catch (err) {
      document.getElementById('inviteContent').innerHTML = `
        <div class="form-error">
          <strong>Invitación inválida</strong><br>
          ${err.message}. El enlace puede haber expirado o ya fue utilizado.
        </div>
        <button class="btn btn-secondary w-full" onclick="window.location.href='/'">Ir al inicio</button>
      `;
    }
  },

  async acceptInvite(token) {
    const name = document.getElementById('inviteName').value.trim();
    const pass = document.getElementById('invitePass').value;
    const pass2 = document.getElementById('invitePass2').value;
    const errEl = document.getElementById('inviteError');

    if (!name || !pass) { errEl.textContent = 'Todos los campos son requeridos'; errEl.classList.remove('hidden'); return; }
    if (pass !== pass2) { errEl.textContent = 'Las contraseñas no coinciden'; errEl.classList.remove('hidden'); return; }
    if (pass.length < 8) { errEl.textContent = 'La contraseña debe tener al menos 8 caracteres'; errEl.classList.remove('hidden'); return; }

    try {
      const data = await api.acceptInvitation({ token, name, password: pass });
      api.setToken(data.token);
      this.user = data.user;
      toast('¡Bienvenido/a!', 'success');
      window.history.replaceState({}, '', '/');
      this.setupRouter();
      this.route();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  },

  renderProfile() {
    const u = this.user;
    document.getElementById('app').innerHTML = renderAppShell('perfil', `
      <div class="page-header">
        <div class="page-header-left"><h1>Mi Perfil</h1></div>
      </div>
      <div class="page-body" style="max-width:600px">
        <div class="card mb-4">
          <div class="card-header"><span class="card-title">Información Personal</span></div>
          <div class="card-body">
            <div id="profileError" class="form-error hidden"></div>
            <div style="text-align:center; margin-bottom:20px">
              <div class="comment-avatar" style="width:72px;height:72px;font-size:28px;margin:0 auto">
                ${avatarInitials(u.name)}
              </div>
              <p class="text-sm text-gray mt-2">${u.role === 'admin' ? '🔑 Administrador' : '👤 Usuario'}</p>
            </div>
            <div class="form-group">
              <label class="form-label">Nombre</label>
              <input class="form-control" id="profileName" value="${escHtml(u.name)}">
            </div>
            <div class="form-group">
              <label class="form-label">Email</label>
              <input class="form-control" value="${escHtml(u.email)}" disabled>
            </div>
            <button class="btn btn-primary" onclick="App.saveName()">Guardar Nombre</button>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">Cambiar Contraseña</span></div>
          <div class="card-body">
            <div id="pwError" class="form-error hidden"></div>
            <div class="form-group">
              <label class="form-label">Contraseña actual</label>
              <input class="form-control" id="curPw" type="password">
            </div>
            <div class="form-group">
              <label class="form-label">Nueva contraseña</label>
              <input class="form-control" id="newPw" type="password">
            </div>
            <button class="btn btn-primary" onclick="App.savePassword()">Cambiar Contraseña</button>
          </div>
        </div>
      </div>
    `);
  },

  async saveName() {
    const name = document.getElementById('profileName').value.trim();
    const errEl = document.getElementById('profileError');
    if (!name) { errEl.textContent = 'El nombre es requerido'; errEl.classList.remove('hidden'); return; }
    try {
      const updated = await api.updateProfile({ name });
      this.user = { ...this.user, name: updated.name };
      toast('Nombre actualizado', 'success');
      this.renderProfile();
    } catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
  },

  async savePassword() {
    const curPw = document.getElementById('curPw').value;
    const newPw = document.getElementById('newPw').value;
    const errEl = document.getElementById('pwError');
    if (!curPw || !newPw) { errEl.textContent = 'Completa ambos campos'; errEl.classList.remove('hidden'); return; }
    try {
      await api.updateProfile({ current_password: curPw, new_password: newPw });
      document.getElementById('curPw').value = '';
      document.getElementById('newPw').value = '';
      errEl.classList.add('hidden');
      toast('Contraseña actualizada', 'success');
    } catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
  }
};

function renderAppShell(activeSection, content) {
  const u = App.user;
  const navItems = [
    { id: 'dashboard', icon: '🏠', label: 'Inicio', path: '' },
    { id: 'automatizaciones', icon: '⚡', label: 'Automatizaciones', path: 'automatizaciones' },
    ...(u.role === 'admin' ? [{ id: 'usuarios', icon: '👥', label: 'Usuarios', path: 'usuarios' }] : []),
    { id: 'perfil', icon: '👤', label: 'Mi Perfil', path: 'perfil' },
  ];

  return `
    <div class="app-layout">
      <aside class="sidebar">
        <div class="sidebar-logo">
          <div class="logo-icon">🗂️</div>
          <div>
            <h2>ProyectoCMS</h2>
            <p>Gestión de Proyectos</p>
          </div>
        </div>
        <nav class="sidebar-nav">
          <div class="nav-section-title">Navegación</div>
          ${navItems.map(item => `
            <a class="nav-item ${activeSection === item.id || (activeSection === 'empresa' && item.id === 'dashboard') || (activeSection === 'proyecto' && item.id === 'dashboard') || (activeSection === 'tarea' && item.id === 'dashboard') ? 'active' : ''}"
              href="#${item.path}" onclick="">
              <span class="icon">${item.icon}</span>
              <span>${item.label}</span>
            </a>
          `).join('')}
        </nav>
        <div class="sidebar-user">
          <div class="user-avatar">${avatarInitials(u.name)}</div>
          <div class="user-info">
            <div class="name">${escHtml(u.name)}</div>
            <div class="role">${u.role === 'admin' ? '🔑 Admin' : '👤 Usuario'}</div>
          </div>
          <button class="btn-logout" onclick="App.logout()" title="Cerrar sesión">⏻</button>
        </div>
      </aside>
      <main class="main-content">
        ${content}
      </main>
    </div>
  `;
}



function roleLabel(r) {
  return { admin: 'Administrador', member: 'Miembro', viewer: 'Observador' }[r] || r;
}

// Initialize app on load
window.addEventListener('DOMContentLoaded', () => App.init());
