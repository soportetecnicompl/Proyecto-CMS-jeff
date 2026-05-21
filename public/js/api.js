const API_BASE = '/api';

const api = {
  _token: localStorage.getItem('cms_token'),

  setToken(t) { this._token = t; localStorage.setItem('cms_token', t); },
  clearToken() { this._token = null; localStorage.removeItem('cms_token'); },

  async request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this._token) headers['Authorization'] = `Bearer ${this._token}`;

    const res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    return data;
  },

  get: (path) => api.request('GET', path),
  post: (path, body) => api.request('POST', path, body),
  put: (path, body) => api.request('PUT', path, body),
  delete: (path) => api.request('DELETE', path),

  // Auth
  login: (email, password) => api.post('/auth/login', { email, password }),
  getMe: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/profile', data),
  getInvitation: (token) => api.get(`/auth/invitation/${token}`),
  acceptInvitation: (data) => api.post('/auth/accept-invitation', data),

  // Companies
  getCompanies: () => api.get('/companies'),
  getCompany: (id) => api.get(`/companies/${id}`),
  createCompany: (data) => api.post('/companies', data),
  updateCompany: (id, data) => api.put(`/companies/${id}`, data),
  deleteCompany: (id) => api.delete(`/companies/${id}`),
  getCompanyMembers: (id) => api.get(`/companies/${id}/members`),
  inviteToCompany: (id, data) => api.post(`/companies/${id}/invite`, data),
  getCompanyInvitations: (id) => api.get(`/companies/${id}/invitations`),
  cancelInvitation: (companyId, inviteId) => api.delete(`/companies/${companyId}/invitations/${inviteId}`),
  removeMember: (companyId, userId) => api.delete(`/companies/${companyId}/members/${userId}`),
  updateMemberRole: (companyId, userId, role) => api.put(`/companies/${companyId}/members/${userId}`, { role }),

  // Projects
  getProjects: (companyId) => api.get(`/projects/company/${companyId}`),
  getProject: (id) => api.get(`/projects/${id}`),
  createProject: (data) => api.post('/projects', data),
  updateProject: (id, data) => api.put(`/projects/${id}`, data),
  deleteProject: (id) => api.delete(`/projects/${id}`),
  getProjectObservations: (id) => api.get(`/projects/${id}/observations`),
  addObservation: (id, data) => api.post(`/projects/${id}/observations`, data),
  deleteObservation: (projectId, obsId) => api.delete(`/projects/${projectId}/observations/${obsId}`),
  getProjectStats: (id) => api.get(`/projects/${id}/stats`),

  // Tasks
  getTasks: (projectId) => api.get(`/tasks/project/${projectId}`),
  getTask: (id) => api.get(`/tasks/${id}`),
  createTask: (data) => api.post('/tasks', data),
  updateTask: (id, data) => api.put(`/tasks/${id}`, data),
  deleteTask: (id) => api.delete(`/tasks/${id}`),
  addTimeLog: (taskId, data) => api.post(`/tasks/${taskId}/time-logs`, data),
  deleteTimeLog: (taskId, logId) => api.delete(`/tasks/${taskId}/time-logs/${logId}`),

  // Comments
  getComments: (type, id) => api.get(`/comments/${type}/${id}`),
  addComment: (type, id, content) => api.post(`/comments/${type}/${id}`, { content }),
  updateComment: (id, content) => api.put(`/comments/${id}`, { content }),
  deleteComment: (id) => api.delete(`/comments/${id}`),

  // Users
  getUsers: () => api.get('/users'),
  getUser: (id) => api.get(`/users/${id}`),
  createUser: (data) => api.post('/users', data),
  updateUser: (id, data) => api.put(`/users/${id}`, data),
  deleteUser: (id) => api.delete(`/users/${id}`),
  getCompanyUsers: (companyId) => api.get(`/users/company/${companyId}`),

  // Automations
  getAutomations: () => api.get('/automations'),
  getAutomation: (id) => api.get(`/automations/${id}`),
  createAutomation: (data) => api.post('/automations', data),
  updateAutomation: (id, data) => api.put(`/automations/${id}`, data),
  deleteAutomation: (id) => api.delete(`/automations/${id}`),
  runAutomation: (id) => api.post(`/automations/${id}/run`, {}),
};

// Shared HTML escaping — defined once here, available globally
function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

// Toast notifications
function toast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;

  container.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastIn .3s ease reverse';
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

// Format helpers
function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(d) {
  if (!d) return '';
  const diff = (Date.now() - new Date(d)) / 1000;
  if (diff < 60) return 'hace un momento';
  if (diff < 3600) return `hace ${Math.floor(diff/60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff/3600)}h`;
  if (diff < 604800) return `hace ${Math.floor(diff/86400)}d`;
  return formatDate(d);
}

function avatarInitials(name) {
  return (name || '?').split(' ').slice(0,2).map(n => n[0]).join('').toUpperCase();
}

function statusLabel(s) {
  const labels = {
    activo: 'Activo', completado: 'Completado', en_espera: 'En espera',
    cancelado: 'Cancelado', pendiente: 'Pendiente', en_progreso: 'En progreso',
    en_revision: 'En revisión', completada: 'Completada', cancelada: 'Cancelada'
  };
  return labels[s] || s;
}

function priorityLabel(p) {
  const labels = { baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica' };
  return labels[p] || p;
}

function priorityIcon(p) {
  return { baja: '🟢', media: '🟡', alta: '🟠', critica: '🔴' }[p] || '⚪';
}

function el(tag, attrs = {}, ...children) {
  const elem = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'className') elem.className = v;
    else if (k === 'onClick') elem.onclick = v;
    else if (k === 'innerHTML') elem.innerHTML = v;
    else if (k === 'style') Object.assign(elem.style, v);
    else elem.setAttribute(k, v);
  });
  children.flat().forEach(c => {
    if (c == null) return;
    elem.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return elem;
}

function showModal(id) {
  const m = document.getElementById(id);
  if (m) m.style.display = 'flex';
}

function hideModal(id) {
  const m = document.getElementById(id);
  if (m) m.style.display = 'none';
}

// Loading state helper for buttons
async function withLoading(btnEl, asyncFn) {
  if (!btnEl) return asyncFn();
  const originalText = btnEl.innerHTML;
  btnEl.classList.add('btn-loading');
  btnEl.disabled = true;
  try {
    await asyncFn();
  } finally {
    btnEl.classList.remove('btn-loading');
    btnEl.disabled = false;
    btnEl.innerHTML = originalText;
  }
}

function createModal({ id, title, body, footer, size = '' }) {
  const existing = document.getElementById(id);
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = id;
  modal.className = 'modal-overlay';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="modal ${size}">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="modal-close" onclick="hideModal('${id}')">✕</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
    </div>
  `;
  modal.addEventListener('click', e => { if (e.target === modal) hideModal(id); });
  document.body.appendChild(modal);
  return modal;
}

function confirm(msg, cb, opts = {}) {
  const existing = document.getElementById('_confirmModal');
  if (existing) existing.remove();

  const danger  = opts.danger  !== false;
  const title   = opts.title   || (danger ? '⚠️ Confirmar acción' : 'Confirmar');
  const label   = opts.label   || 'Confirmar';
  const detail  = opts.detail  || '';

  const overlay = document.createElement('div');
  overlay.id = '_confirmModal';
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'display:flex;z-index:1100';
  overlay.innerHTML = `
    <div class="modal" style="max-width:420px">
      <div class="modal-header">
        <h3 style="font-size:16px">${title}</h3>
        <button class="modal-close" onclick="document.getElementById('_confirmModal').remove()">✕</button>
      </div>
      <div class="modal-body">
        <p style="color:var(--gray-600);line-height:1.6;margin:0">${msg}</p>
        ${detail ? `<p class="text-sm text-gray mt-2">${detail}</p>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="document.getElementById('_confirmModal').remove()">
          Cancelar
        </button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="_confirmOkBtn">
          ${label}
        </button>
      </div>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);

  document.getElementById('_confirmOkBtn').addEventListener('click', () => {
    overlay.remove();
    cb();
  });

  // Focus the ok button for keyboard accessibility
  setTimeout(() => document.getElementById('_confirmOkBtn')?.focus(), 50);
}
