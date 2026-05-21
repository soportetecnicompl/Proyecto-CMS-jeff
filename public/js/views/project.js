let _projectData = null;
let _projectUsers = [];

async function renderProject(id) {
  const app = document.getElementById('app');
  app.innerHTML = renderAppShell('proyecto', `
    <div class="page-header">
      <div class="page-header-left">
        <div class="breadcrumb">
          <a href="#" onclick="App.navigate('')">Empresas</a>
          <span class="sep">›</span>
          <a href="#" id="companyLink">...</a>
          <span class="sep">›</span>
          <span id="projectBreadcrumb">Cargando...</span>
        </div>
      </div>
      <div class="flex gap-2" id="projectHeaderActions"></div>
    </div>
    <div class="page-body" id="projectBody">
      <div class="loading-overlay"><div class="spinner"></div></div>
    </div>
  `);

  try {
    const [project, tasks] = await Promise.all([
      api.getProject(id),
      api.getTasks(id)
    ]);
    _projectData = project;

    // Cargar usuarios en paralelo con el resto — garantizar que estén listos
    api.getCompanyUsers(project.company_id)
      .then(users => { _projectUsers = users; })
      .catch(() => { _projectUsers = []; });

    document.getElementById('companyLink').textContent = project.company_name;
    document.getElementById('companyLink').onclick = () => App.navigate(`empresa/${project.company_id}`);
    document.getElementById('projectBreadcrumb').textContent = project.name;

    renderProjectContent(project, tasks);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderProjectContent(project, tasks) {
  // canEdit: admin global O miembro/admin de la empresa (no viewer)
  const canEdit = App.user.role === 'admin' || ['admin', 'member'].includes(project.my_company_role);

  document.getElementById('projectHeaderActions').innerHTML = `
    ${canEdit ? `<button class="btn btn-primary btn-sm" onclick="openCreateTask(${project.id})">+ Tarea</button>` : ''}
    ${canEdit ? `<button class="btn btn-secondary btn-sm" onclick="openEditProject(${project.id})">✏️ Editar</button>` : ''}
  `;

  const body = document.getElementById('projectBody');
  const pct = project.progress || 0;
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'completada').length;
  const totalHours = tasks.reduce((s, t) => s + (t.estimated_hours || 0), 0);
  const loggedHours = tasks.reduce((s, t) => s + (t.actual_hours || 0), 0);

  body.innerHTML = `
    <!-- Project Info -->
    <div class="grid-4 mb-6">
      <div class="stat-card">
        <div class="stat-icon stat-icon-blue">📋</div>
        <div class="stat-info">
          <div class="value">${totalTasks}</div>
          <div class="label">Total tareas</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon stat-icon-green">✅</div>
        <div class="stat-info">
          <div class="value">${completedTasks}</div>
          <div class="label">Completadas</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon stat-icon-yellow">⏱️</div>
        <div class="stat-info">
          <div class="value">${totalHours.toFixed(1)}h</div>
          <div class="label">Horas estimadas</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon stat-icon-purple">📊</div>
        <div class="stat-info">
          <div class="value">${pct}%</div>
          <div class="label">Progreso</div>
        </div>
      </div>
    </div>

    <!-- Progress bar -->
    <div class="card mb-6">
      <div class="card-body">
        <div class="flex justify-between items-center mb-2">
          <div class="flex gap-3 items-center">
            <span style="font-size:18px; font-weight:700">${escHtml(project.name)}</span>
            <span class="status-badge status-${project.status}">${statusLabel(project.status)}</span>
            <span class="badge ${getPriorityClass(project.priority)}">${priorityIcon(project.priority)} ${priorityLabel(project.priority)}</span>
          </div>
          <div class="text-sm text-gray">
            ${project.start_date ? `📅 ${formatDate(project.start_date)} → ${project.end_date ? formatDate(project.end_date) : 'Sin fecha fin'}` : ''}
          </div>
        </div>
        ${project.description ? `<p class="text-sm text-gray mb-3">${escHtml(project.description)}</p>` : ''}
        <div class="progress-bar" style="height:8px">
          <div class="progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="flex justify-between mt-1 text-xs text-gray">
          <span>${completedTasks} de ${totalTasks} tareas completadas</span>
          <span>${pct}%</span>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button class="tab-btn active" onclick="switchTab('tabTasks', this)">📋 Tareas (${totalTasks})</button>
      <button class="tab-btn" onclick="switchTab('tabKanban', this); renderKanban()">📌 Kanban</button>
      <button class="tab-btn" onclick="switchTab('tabPlanning', this); renderPlanning()">📅 Planificación</button>
      <button class="tab-btn" onclick="switchTab('tabComments', this); loadProjectComments(${project.id})">💬 Comentarios</button>
      <button class="tab-btn" onclick="switchTab('tabObservations', this); loadObservations(${project.id})">📝 Observaciones</button>
    </div>

    <!-- Tasks tab -->
    <div class="tab-pane active" id="tabTasks">
      <div class="flex justify-between items-center mb-4">
        <div class="flex gap-2">
          <div class="search-box">
            <span>🔍</span>
            <input type="text" id="searchTasks" placeholder="Buscar tarea...">
          </div>
          <select class="form-control" id="filterTaskStatus" style="width:160px">
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendiente</option>
            <option value="en_progreso">En progreso</option>
            <option value="en_revision">En revisión</option>
            <option value="completada">Completada</option>
            <option value="cancelada">Cancelada</option>
          </select>
          <select class="form-control" id="filterTaskPriority" style="width:140px">
            <option value="">Todas las prioridades</option>
            <option value="critica">Crítica</option>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>
        </div>
        <button class="btn btn-primary btn-sm" onclick="openCreateTask(${project.id})">+ Nueva Tarea</button>
      </div>
      <div id="tasksList">
        ${renderTaskList(tasks)}
      </div>
    </div>

    <!-- Kanban tab -->
    <div class="tab-pane" id="tabKanban">
      <div id="kanbanBoard" class="kanban-board"></div>
    </div>

    <!-- Planning tab -->
    <div class="tab-pane" id="tabPlanning">
      <div id="planningContent"></div>
    </div>

    <!-- Comments tab -->
    <div class="tab-pane" id="tabComments">
      <div class="card">
        <div class="card-body">
          <div id="projectComments"></div>
          <div class="comment-input-area">
            <div class="comment-avatar">${avatarInitials(App.user.name)}</div>
            <div style="flex:1">
              <textarea class="comment-textarea" id="projectCommentInput" placeholder="Escribe un comentario..."></textarea>
              <button class="btn btn-primary btn-sm mt-2" onclick="submitProjectComment(${project.id})">Comentar</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Observations tab -->
    <div class="tab-pane" id="tabObservations">
      <div class="card mb-4">
        <div class="card-body">
          <div class="form-row">
            <div class="form-group" style="flex:1">
              <label class="form-label">Nueva Observación</label>
              <textarea class="form-control" id="obsContent" rows="2" placeholder="Escribe una observación sobre el proyecto..."></textarea>
            </div>
            <div class="form-group" style="width:160px">
              <label class="form-label">Tipo</label>
              <select class="form-control" id="obsType">
                <option value="general">General</option>
                <option value="riesgo">Riesgo</option>
                <option value="problema">Problema</option>
                <option value="decision">Decisión</option>
                <option value="nota">Nota</option>
              </select>
            </div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="submitObservation(${project.id})">Agregar Observación</button>
        </div>
      </div>
      <div id="observationsList"></div>
    </div>
  `;

  // Task filter logic
  window._allTasks = tasks;
  window._canEdit = canEdit;
  function applyTaskFilters() {
    const q = (document.getElementById('searchTasks').value || '').toLowerCase();
    const s = document.getElementById('filterTaskStatus').value;
    const p = document.getElementById('filterTaskPriority').value;
    const filtered = window._allTasks.filter(t =>
      (!q || t.title.toLowerCase().includes(q) || (t.description||'').toLowerCase().includes(q)) &&
      (!s || t.status === s) &&
      (!p || t.priority === p)
    );
    document.getElementById('tasksList').innerHTML = renderTaskList(filtered);
  }
  document.getElementById('searchTasks').addEventListener('input', applyTaskFilters);
  document.getElementById('filterTaskStatus').addEventListener('change', applyTaskFilters);
  document.getElementById('filterTaskPriority').addEventListener('change', applyTaskFilters);
}

function renderTaskList(tasks) {
  const canEdit = window._canEdit;
  if (!tasks.length) {
    return `<div class="empty-state">
      <div class="icon">📋</div>
      <h3>Sin tareas</h3>
      <p>${canEdit ? 'Crea la primera tarea para este proyecto.' : 'No hay tareas aún.'}</p>
    </div>`;
  }

  return tasks.map(task => `
    <div class="task-item" onclick="App.navigate('tarea/${task.id}')">
      <div class="task-checkbox ${task.status === 'completada' ? 'done' : ''}"
        onclick="event.stopPropagation(); ${canEdit ? `quickComplete(${task.id}, '${task.status}')` : ''}">
        ${task.status === 'completada' ? '✓' : ''}
      </div>
      <div class="task-item-body">
        <div class="task-item-title ${task.status === 'completada' ? 'completed' : ''}">${escHtml(task.title)}</div>
        <div class="task-item-meta">
          <span class="status-badge status-${task.status}" style="font-size:11px">${statusLabel(task.status)}</span>
          <span class="${getPriorityClass(task.priority)} badge" style="font-size:11px">${priorityIcon(task.priority)} ${priorityLabel(task.priority)}</span>
          ${task.assigned_name ? `<span>👤 ${escHtml(task.assigned_name)}</span>` : ''}
          ${task.estimated_hours ? `<span>⏱️ ${task.estimated_hours}h est.</span>` : ''}
          ${task.due_date ? `<span class="${isDueDate(task.due_date, task.status) ? 'text-danger' : ''}">📅 ${formatDate(task.due_date)}</span>` : ''}
          ${task.comment_count > 0 ? `<span>💬 ${task.comment_count}</span>` : ''}
          ${task.subtasks?.length ? `<span>🔀 ${task.subtasks.length} subtareas</span>` : ''}
        </div>
      </div>
      ${canEdit ? `
      <div class="task-item-actions" onclick="event.stopPropagation()">
        <button class="btn btn-ghost btn-sm" onclick="openEditTask(${task.id})">✏️</button>
        <button class="btn btn-ghost btn-sm" title="Eliminar" onclick="deleteTask(${task.id})">🗑️</button>
      </div>` : ''}
    </div>
  `).join('');
}

function isDueDate(date, status) {
  if (status === 'completada') return false;
  return new Date(date) < new Date();
}

function renderKanban() {
  const tasks = window._allTasks || [];
  const columns = [
    { id: 'pendiente', label: 'Pendiente', color: '#6b7280' },
    { id: 'en_progreso', label: 'En Progreso', color: '#3b82f6' },
    { id: 'en_revision', label: 'En Revisión', color: '#f59e0b' },
    { id: 'completada', label: 'Completada', color: '#10b981' },
    { id: 'cancelada', label: 'Cancelada', color: '#ef4444' },
  ];

  document.getElementById('kanbanBoard').innerHTML = columns.map(col => {
    const colTasks = tasks.filter(t => t.status === col.id);
    return `
      <div class="kanban-column">
        <div class="kanban-header" style="border-bottom-color:${col.color}">
          <span>${col.label}</span>
          <span class="kanban-count">${colTasks.length}</span>
        </div>
        <div class="kanban-tasks">
          ${colTasks.map(t => `
            <div class="kanban-task" onclick="App.navigate('tarea/${t.id}')">
              <div class="kanban-task-title">${escHtml(t.title)}</div>
              <div class="kanban-task-meta">
                <span class="${getPriorityClass(t.priority)} badge" style="font-size:11px">${priorityIcon(t.priority)}</span>
                ${t.assigned_name ? `<span class="text-sm text-gray">👤 ${escHtml(t.assigned_name)}</span>` : ''}
              </div>
              ${t.estimated_hours ? `<div class="text-xs text-gray mt-1">⏱️ ${t.estimated_hours}h</div>` : ''}
            </div>
          `).join('') || `<div class="text-sm text-gray" style="padding:8px;text-align:center">Sin tareas</div>`}
        </div>
      </div>
    `;
  }).join('');
}

function renderPlanning() {
  const tasks = (window._allTasks || []).filter(t => t.due_date);
  const project = _projectData;

  if (!tasks.length) {
    document.getElementById('planningContent').innerHTML = `
      <div class="empty-state"><div class="icon">📅</div><h3>Sin planificación</h3><p>Agrega fechas de vencimiento a las tareas para ver la planificación.</p></div>
    `;
    return;
  }

  const sorted = [...tasks].sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
  const minDate = new Date(sorted[0].due_date);
  const maxDate = new Date(sorted[sorted.length-1].due_date);
  const totalDays = Math.max((maxDate - minDate) / 86400000 + 1, 7);

  const months = [];
  const cur = new Date(minDate);
  while (cur <= maxDate) {
    const key = `${cur.getFullYear()}-${cur.getMonth()}`;
    if (!months.includes(key)) months.push(key);
    cur.setDate(cur.getDate() + 1);
  }

  document.getElementById('planningContent').innerHTML = `
    <div class="card">
      <div class="card-body">
        <h3 class="card-title mb-4">📅 Línea de tiempo del proyecto</h3>
        ${project.start_date && project.end_date ? `
          <div class="flex gap-4 mb-4 text-sm text-gray">
            <span>📅 Inicio: <strong>${formatDate(project.start_date)}</strong></span>
            <span>🏁 Fin: <strong>${formatDate(project.end_date)}</strong></span>
            <span>📊 Progreso: <strong>${project.progress || 0}%</strong></span>
          </div>
        ` : ''}
        <div class="gantt-container">
          <div style="min-width:600px">
            <div class="gantt-row" style="border-bottom:2px solid var(--gray-200)">
              <div class="gantt-task-name" style="font-weight:600;font-size:12px">Tarea</div>
              <div style="flex:1;display:flex;font-size:11px;color:var(--gray-400)">
                ${sorted.map(t => {
                  const d = new Date(t.due_date);
                  return `<div style="flex:1;text-align:center;border-right:1px solid var(--gray-100);padding:4px 0">
                    ${d.getDate()}/${d.getMonth()+1}
                  </div>`;
                }).join('')}
              </div>
            </div>
            ${sorted.map((task, i) => {
              const startOffset = (new Date(task.due_date) - minDate) / 86400000;
              const pct = (startOffset / totalDays) * 100;
              const width = Math.max(3, 100 / totalDays);
              return `
                <div class="gantt-row">
                  <div class="gantt-task-name">${escHtml(task.title)}</div>
                  <div class="gantt-bar-area">
                    <div class="gantt-bar" style="left:${pct}%; width:${width}%">
                      ${task.assigned_name ? escHtml(task.assigned_name.split(' ')[0]) : ''}
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

async function loadProjectComments(projectId) {
  try {
    const comments = await api.getComments('project', projectId);
    renderComments(comments, 'projectComments', 'project', projectId);
  } catch (err) { toast(err.message, 'error'); }
}

async function loadObservations(projectId) {
  try {
    const obs = await api.getProjectObservations(projectId);
    const obsTypes = { general: '📌', riesgo: '⚠️', problema: '❌', decision: '✅', nota: '📝' };
    const obsColors = { riesgo: 'badge-yellow', problema: 'badge-red', decision: 'badge-green', general: 'badge-gray', nota: 'badge-blue' };

    document.getElementById('observationsList').innerHTML = obs.length ? obs.map(o => `
      <div class="card mb-3">
        <div class="card-body">
          <div class="flex justify-between items-start">
            <div class="flex items-center gap-2 mb-2">
              <div class="comment-avatar" style="width:28px;height:28px;font-size:11px">${avatarInitials(o.user_name)}</div>
              <strong class="text-sm">${escHtml(o.user_name)}</strong>
              <span class="badge ${obsColors[o.type] || 'badge-gray'}">${obsTypes[o.type] || '📌'} ${o.type}</span>
              <span class="text-xs text-gray">${timeAgo(o.created_at)}</span>
            </div>
            ${o.user_id === App.user.id || App.user.role === 'admin' ? `
              <button class="btn btn-ghost btn-sm" onclick="deleteObs(${projectId}, ${o.id})">🗑️</button>
            ` : ''}
          </div>
          <p class="text-sm" style="line-height:1.6">${escHtml(o.content)}</p>
        </div>
      </div>
    `).join('') : `<div class="empty-state"><div class="icon">📝</div><h3>Sin observaciones</h3></div>`;
  } catch (err) { toast(err.message, 'error'); }
}

function renderComments(comments, containerId, type, entityId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = comments.length ? comments.map(c => `
    <div class="comment-item">
      <div class="comment-avatar">${avatarInitials(c.user_name)}</div>
      <div class="comment-body">
        <div class="comment-meta">
          <strong>${escHtml(c.user_name)}</strong> · ${timeAgo(c.created_at)}
          ${c.user_id === App.user.id ? `
            <button class="btn btn-ghost" style="font-size:12px;padding:2px 6px;margin-left:4px"
              onclick="deleteCommentItem(${c.id}, '${containerId}', '${type}', ${entityId})">🗑️</button>
          ` : ''}
        </div>
        <div class="comment-content">${escHtml(c.content)}</div>
      </div>
    </div>
  `).join('') : `<p class="text-sm text-gray">Sin comentarios aún.</p>`;
}

window.submitProjectComment = async function(projectId) {
  const input = document.getElementById('projectCommentInput');
  const content = input.value.trim();
  if (!content) return;

  try {
    await api.addComment('project', projectId, content);
    input.value = '';
    loadProjectComments(projectId);
    toast('Comentario agregado', 'success');
  } catch (err) { toast(err.message, 'error'); }
};

window.submitObservation = async function(projectId) {
  const content = document.getElementById('obsContent').value.trim();
  const type = document.getElementById('obsType').value;
  if (!content) { toast('El contenido es requerido', 'warning'); return; }

  try {
    await api.addObservation(projectId, { content, type });
    document.getElementById('obsContent').value = '';
    loadObservations(projectId);
    toast('Observación agregada', 'success');
  } catch (err) { toast(err.message, 'error'); }
};

window.deleteObs = async function(projectId, obsId) {
  confirm('¿Eliminar observación?', async () => {
    try {
      await api.deleteObservation(projectId, obsId);
      loadObservations(projectId);
      toast('Observación eliminada', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
};

window.deleteCommentItem = async function(commentId, containerId, type, entityId) {
  confirm('¿Eliminar comentario?', async () => {
    try {
      await api.deleteComment(commentId);
      const comments = await api.getComments(type, entityId);
      renderComments(comments, containerId, type, entityId);
      toast('Comentario eliminado', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
};

window.quickComplete = async function(taskId, currentStatus) {
  const newStatus = currentStatus === 'completada' ? 'pendiente' : 'completada';
  try {
    await api.updateTask(taskId, { status: newStatus });
    const [tasks, project] = await Promise.all([
      api.getTasks(_projectData.id),
      api.getProject(_projectData.id)
    ]);
    window._allTasks = tasks;
    _projectData = project;
    document.getElementById('tasksList').innerHTML = renderTaskList(tasks);

    // Actualizar stats en tiempo real
    const completedTasks = tasks.filter(t => t.status === 'completada').length;
    const totalTasks = tasks.length;
    const pct = project.progress || 0;
    document.querySelectorAll('.stat-card')[1]?.querySelector('.value')
      && (document.querySelectorAll('.stat-card')[1].querySelector('.value').textContent = completedTasks);
    document.querySelectorAll('.stat-card')[3]?.querySelector('.value')
      && (document.querySelectorAll('.stat-card')[3].querySelector('.value').textContent = pct + '%');
    const fill = document.querySelector('.progress-fill');
    if (fill) fill.style.width = pct + '%';
    document.querySelectorAll('.progress-bar + div span')[0]
      && (document.querySelectorAll('.progress-bar + div span')[0].textContent = `${completedTasks} de ${totalTasks} tareas completadas`);
    document.querySelectorAll('.progress-bar + div span')[1]
      && (document.querySelectorAll('.progress-bar + div span')[1].textContent = pct + '%');
  } catch (err) { toast(err.message, 'error'); }
};

window.deleteTask = function(taskId) {
  confirm('¿Eliminar esta tarea?', async () => {
    try {
      await api.deleteTask(taskId);
      window._allTasks = window._allTasks.filter(t => t.id !== taskId);
      document.getElementById('tasksList').innerHTML = renderTaskList(window._allTasks);
      toast('Tarea eliminada', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
};

function openCreateTask(projectId) {
  const users = _projectUsers;

  createModal({
    id: 'modalCreateTask',
    title: 'Nueva Tarea',
    size: 'modal-lg',
    body: `
      <div id="ctError" class="form-error hidden"></div>
      <div class="form-group">
        <label class="form-label">Título *</label>
        <input class="form-control" id="ctTitle" placeholder="Título de la tarea">
      </div>
      <div class="form-group">
        <label class="form-label">Descripción</label>
        <textarea class="form-control" id="ctDesc" rows="3" placeholder="Describe la tarea..."></textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Estado</label>
          <select class="form-control" id="ctStatus">
            <option value="pendiente">Pendiente</option>
            <option value="en_progreso">En progreso</option>
            <option value="en_revision">En revisión</option>
            <option value="completada">Completada</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Prioridad</label>
          <select class="form-control" id="ctPriority">
            <option value="baja">Baja</option>
            <option value="media" selected>Media</option>
            <option value="alta">Alta</option>
            <option value="critica">Crítica</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Asignar a</label>
          <select class="form-control" id="ctAssigned">
            <option value="">Sin asignar</option>
            ${users.map(u => `<option value="${u.id}">${escHtml(u.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Horas estimadas</label>
          <input class="form-control" id="ctHours" type="number" step="0.5" min="0" placeholder="0.0">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Fecha de vencimiento</label>
        <input class="form-control" id="ctDue" type="date">
      </div>
    `,
    footer: `
      <button class="btn btn-secondary" onclick="hideModal('modalCreateTask')">Cancelar</button>
      <button class="btn btn-primary" onclick="submitCreateTask(${projectId})">Crear Tarea</button>
    `
  });
  showModal('modalCreateTask');
}

window.submitCreateTask = async function(projectId) {
  const title = document.getElementById('ctTitle').value.trim();
  const errEl = document.getElementById('ctError');
  if (!title) { errEl.textContent = 'El título es requerido'; errEl.classList.remove('hidden'); return; }

  try {
    await api.createTask({
      project_id: projectId,
      title,
      description: document.getElementById('ctDesc').value.trim() || null,
      status: document.getElementById('ctStatus').value,
      priority: document.getElementById('ctPriority').value,
      assigned_to: document.getElementById('ctAssigned').value || null,
      estimated_hours: document.getElementById('ctHours').value || null,
      due_date: document.getElementById('ctDue').value || null,
    });
    hideModal('modalCreateTask');
    toast('Tarea creada', 'success');
    const tasks = await api.getTasks(projectId);
    window._allTasks = tasks;
    document.getElementById('tasksList').innerHTML = renderTaskList(tasks);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
};

window.openEditTask = async function(taskId) {
  const task = await api.getTask(taskId);
  // Si los usuarios aún no cargaron, esperarlos ahora
  const users = _projectUsers.length > 0
    ? _projectUsers
    : await api.getCompanyUsers(_projectData?.company_id || task.company_id).catch(() => []);

  createModal({
    id: 'modalEditTask',
    title: 'Editar Tarea',
    size: 'modal-lg',
    body: `
      <div id="etError" class="form-error hidden"></div>
      <div class="form-group">
        <label class="form-label">Título *</label>
        <input class="form-control" id="etTitle" value="${escHtml(task.title)}">
      </div>
      <div class="form-group">
        <label class="form-label">Descripción</label>
        <textarea class="form-control" id="etDesc" rows="3">${escHtml(task.description || '')}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Estado</label>
          <select class="form-control" id="etStatus">
            <option value="pendiente" ${task.status==='pendiente'?'selected':''}>Pendiente</option>
            <option value="en_progreso" ${task.status==='en_progreso'?'selected':''}>En progreso</option>
            <option value="en_revision" ${task.status==='en_revision'?'selected':''}>En revisión</option>
            <option value="completada" ${task.status==='completada'?'selected':''}>Completada</option>
            <option value="cancelada" ${task.status==='cancelada'?'selected':''}>Cancelada</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Prioridad</label>
          <select class="form-control" id="etPriority">
            <option value="baja" ${task.priority==='baja'?'selected':''}>Baja</option>
            <option value="media" ${task.priority==='media'?'selected':''}>Media</option>
            <option value="alta" ${task.priority==='alta'?'selected':''}>Alta</option>
            <option value="critica" ${task.priority==='critica'?'selected':''}>Crítica</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Asignar a</label>
          <select class="form-control" id="etAssigned">
            <option value="">Sin asignar</option>
            ${users.map(u => `<option value="${u.id}" ${task.assigned_to==u.id?'selected':''}>${escHtml(u.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Horas estimadas</label>
          <input class="form-control" id="etHours" type="number" step="0.5" min="0" value="${task.estimated_hours || ''}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Fecha de vencimiento</label>
        <input class="form-control" id="etDue" type="date" value="${task.due_date || ''}">
      </div>
    `,
    footer: `
      <button class="btn btn-secondary" onclick="hideModal('modalEditTask')">Cancelar</button>
      <button class="btn btn-primary" onclick="submitEditTask(${taskId})">Guardar Cambios</button>
    `
  });
  showModal('modalEditTask');
};

window.submitEditTask = async function(taskId) {
  const title = document.getElementById('etTitle').value.trim();
  const errEl = document.getElementById('etError');
  if (!title) { errEl.textContent = 'El título es requerido'; errEl.classList.remove('hidden'); return; }

  try {
    await api.updateTask(taskId, {
      title,
      description: document.getElementById('etDesc').value.trim() || null,
      status: document.getElementById('etStatus').value,
      priority: document.getElementById('etPriority').value,
      assigned_to: document.getElementById('etAssigned').value || null,
      estimated_hours: document.getElementById('etHours').value || null,
      due_date: document.getElementById('etDue').value || null,
    });
    hideModal('modalEditTask');
    toast('Tarea actualizada', 'success');
    const tasks = await api.getTasks(_projectData.id);
    window._allTasks = tasks;
    document.getElementById('tasksList').innerHTML = renderTaskList(tasks);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
};

function openEditProject(projectId) {
  const p = _projectData;
  createModal({
    id: 'modalEditProject',
    title: 'Editar Proyecto',
    size: 'modal-lg',
    body: `
      <div id="epError" class="form-error hidden"></div>
      <div class="form-group">
        <label class="form-label">Nombre *</label>
        <input class="form-control" id="epName" value="${escHtml(p.name)}">
      </div>
      <div class="form-group">
        <label class="form-label">Descripción</label>
        <textarea class="form-control" id="epDesc" rows="3">${escHtml(p.description || '')}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Estado</label>
          <select class="form-control" id="epStatus">
            <option value="activo" ${p.status==='activo'?'selected':''}>Activo</option>
            <option value="en_espera" ${p.status==='en_espera'?'selected':''}>En espera</option>
            <option value="completado" ${p.status==='completado'?'selected':''}>Completado</option>
            <option value="cancelado" ${p.status==='cancelado'?'selected':''}>Cancelado</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Prioridad</label>
          <select class="form-control" id="epPriority">
            <option value="baja" ${p.priority==='baja'?'selected':''}>Baja</option>
            <option value="media" ${p.priority==='media'?'selected':''}>Media</option>
            <option value="alta" ${p.priority==='alta'?'selected':''}>Alta</option>
            <option value="critica" ${p.priority==='critica'?'selected':''}>Crítica</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Fecha inicio</label>
          <input class="form-control" type="date" id="epStart" value="${p.start_date || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Fecha fin</label>
          <input class="form-control" type="date" id="epEnd" value="${p.end_date || ''}">
        </div>
      </div>
    `,
    footer: `
      <button class="btn btn-secondary" onclick="hideModal('modalEditProject')">Cancelar</button>
      <button class="btn btn-danger btn-sm" onclick="deleteProject(${projectId})">Eliminar</button>
      <button class="btn btn-primary" onclick="submitEditProject(${projectId})">Guardar</button>
    `
  });
  showModal('modalEditProject');
}

window.submitEditProject = async function(id) {
  const name = document.getElementById('epName').value.trim();
  const errEl = document.getElementById('epError');
  if (!name) { errEl.textContent = 'El nombre es requerido'; errEl.classList.remove('hidden'); return; }

  try {
    const updated = await api.updateProject(id, {
      name,
      description: document.getElementById('epDesc').value.trim() || null,
      status: document.getElementById('epStatus').value,
      priority: document.getElementById('epPriority').value,
      start_date: document.getElementById('epStart').value || null,
      end_date: document.getElementById('epEnd').value || null,
    });
    _projectData = updated;
    hideModal('modalEditProject');
    toast('Proyecto actualizado', 'success');
    renderProject(id);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
};

window.deleteProject = function(id) {
  confirm('¿Eliminar este proyecto? Se eliminarán todas sus tareas.', async () => {
    try {
      const companyId = _projectData.company_id;
      await api.deleteProject(id);
      hideModal('modalEditProject');
      toast('Proyecto eliminado', 'success');
      App.navigate(`empresa/${companyId}`);
    } catch (err) { toast(err.message, 'error'); }
  });
};

window.openCreateTask = openCreateTask;
window.openEditProject = openEditProject;
window.switchTab = switchTab;
window.renderKanban = renderKanban;
window.renderPlanning = renderPlanning;
window.loadProjectComments = loadProjectComments;
window.loadObservations = loadObservations;

function getPriorityClass(p) {
  return { baja: 'badge-green', media: 'badge-yellow', alta: 'badge-red', critica: 'badge-red' }[p] || 'badge-gray';
}


