let _taskData = null;

async function renderTask(id) {
  const app = document.getElementById('app');
  app.innerHTML = renderAppShell('tarea', `
    <div class="page-header">
      <div class="page-header-left">
        <div class="breadcrumb">
          <a href="#" onclick="App.navigate('')">Empresas</a>
          <span class="sep">›</span>
          <a href="#" id="taskProjectLink">Proyecto</a>
          <span class="sep">›</span>
          <span id="taskBreadcrumb">Cargando...</span>
        </div>
      </div>
      <div class="flex gap-2" id="taskHeaderActions"></div>
    </div>
    <div class="page-body" id="taskBody">
      <div class="loading-overlay"><div class="spinner"></div></div>
    </div>
  `);

  try {
    const task = await api.getTask(id);
    _taskData = task;

    document.getElementById('taskProjectLink').textContent = task.project_name;
    document.getElementById('taskProjectLink').onclick = () => App.navigate(`proyecto/${task.project_id}`);
    document.getElementById('taskBreadcrumb').textContent = task.title;

    renderTaskContent(task);
    loadTaskComments(id);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderTaskContent(task) {
  document.getElementById('taskHeaderActions').innerHTML = `
    <select class="form-control" id="quickStatus" style="width:160px"
      onchange="updateTaskStatus(${task.id}, this.value)">
      <option value="pendiente" ${task.status==='pendiente'?'selected':''}>Pendiente</option>
      <option value="en_progreso" ${task.status==='en_progreso'?'selected':''}>En Progreso</option>
      <option value="en_revision" ${task.status==='en_revision'?'selected':''}>En Revisión</option>
      <option value="completada" ${task.status==='completada'?'selected':''}>Completada</option>
      <option value="cancelada" ${task.status==='cancelada'?'selected':''}>Cancelada</option>
    </select>
    <button class="btn btn-secondary btn-sm" onclick="openEditTaskFull(${task.id})">✏️ Editar</button>
    <button class="btn btn-danger btn-sm" onclick="deleteTaskFromDetail(${task.id})">🗑️ Eliminar</button>
  `;

  const loggedHours = (task.time_logs || []).reduce((s, l) => s + l.hours, 0);
  const hoursUsed = Math.min(100, task.estimated_hours ? (loggedHours / task.estimated_hours * 100) : 0);

  document.getElementById('taskBody').innerHTML = `
    <div style="display:grid; grid-template-columns:1fr 300px; gap:20px">
      <!-- Main content -->
      <div>
        <!-- Task info card -->
        <div class="card mb-4">
          <div class="card-body">
            <h2 style="font-size:20px; font-weight:700; color:var(--gray-900); margin-bottom:10px">${escHtml(task.title)}</h2>
            <div class="flex gap-2 flex-wrap mb-4">
              <span class="status-badge status-${task.status}">${statusLabel(task.status)}</span>
              <span class="badge ${getPriorityClass(task.priority)}">${priorityIcon(task.priority)} ${priorityLabel(task.priority)}</span>
            </div>
            ${task.description ? `
              <div style="background:var(--gray-50); border-radius:8px; padding:14px; margin-bottom:16px;">
                <p class="text-sm" style="line-height:1.6; white-space:pre-wrap">${escHtml(task.description)}</p>
              </div>
            ` : ''}

            <!-- Subtasks -->
            ${task.subtasks && task.subtasks.length ? `
              <div class="mb-4">
                <h4 class="text-sm font-semibold mb-2">Subtareas (${task.subtasks.length})</h4>
                ${task.subtasks.map(s => `
                  <div class="task-item" onclick="App.navigate('tarea/${s.id}')">
                    <div class="task-checkbox ${s.status==='completada'?'done':''}">
                      ${s.status==='completada'?'✓':''}
                    </div>
                    <div class="task-item-body">
                      <div class="task-item-title ${s.status==='completada'?'completed':''}">${escHtml(s.title)}</div>
                      <div class="task-item-meta">
                        <span class="status-badge status-${s.status}" style="font-size:11px">${statusLabel(s.status)}</span>
                        ${s.assigned_name ? `<span>👤 ${escHtml(s.assigned_name)}</span>` : ''}
                      </div>
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Comments -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">💬 Comentarios</span>
          </div>
          <div class="card-body">
            <div id="taskComments"></div>
            <div class="comment-input-area">
              <div class="comment-avatar">${avatarInitials(App.user.name)}</div>
              <div style="flex:1">
                <textarea class="comment-textarea" id="taskCommentInput" placeholder="Escribe un comentario..."></textarea>
                <button class="btn btn-primary btn-sm mt-2" onclick="submitTaskComment(${task.id})">Comentar</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Sidebar -->
      <div>
        <!-- Task details -->
        <div class="card mb-4">
          <div class="card-header"><span class="card-title">📋 Detalles</span></div>
          <div class="card-body" style="padding:0">
            <div style="padding:12px 16px; border-bottom:1px solid var(--gray-100)">
              <div class="text-xs text-gray mb-1">Asignado a</div>
              <div class="flex items-center gap-2">
                ${task.assigned_name ? `
                  <div class="comment-avatar" style="width:24px;height:24px;font-size:10px">${avatarInitials(task.assigned_name)}</div>
                  <span class="text-sm font-semibold">${escHtml(task.assigned_name)}</span>
                ` : '<span class="text-sm text-gray">Sin asignar</span>'}
              </div>
            </div>
            ${task.due_date ? `
              <div style="padding:12px 16px; border-bottom:1px solid var(--gray-100)">
                <div class="text-xs text-gray mb-1">Vencimiento</div>
                <div class="text-sm ${isDueDatePast(task.due_date, task.status) ? 'text-danger' : ''}">
                  📅 ${formatDate(task.due_date)}
                  ${isDueDatePast(task.due_date, task.status) ? ' ⚠️ Vencida' : ''}
                </div>
              </div>
            ` : ''}
            <div style="padding:12px 16px; border-bottom:1px solid var(--gray-100)">
              <div class="text-xs text-gray mb-1">Creado por</div>
              <div class="text-sm">${escHtml(task.creator_name || '—')}</div>
            </div>
            <div style="padding:12px 16px">
              <div class="text-xs text-gray mb-1">Fecha de creación</div>
              <div class="text-sm">${formatDateTime(task.created_at)}</div>
            </div>
          </div>
        </div>

        <!-- Time tracking -->
        <div class="card mb-4">
          <div class="card-header">
            <span class="card-title">⏱️ Tiempo</span>
            <button class="btn btn-primary btn-sm" onclick="openLogTime(${task.id})">+ Registrar</button>
          </div>
          <div class="card-body">
            ${task.estimated_hours ? `
              <div class="mb-3">
                <div class="flex justify-between text-sm mb-1">
                  <span>Progreso de horas</span>
                  <span>${loggedHours.toFixed(1)}h / ${task.estimated_hours}h</span>
                </div>
                <div class="progress-bar">
                  <div class="progress-fill" style="width:${hoursUsed}%; background:${hoursUsed > 100 ? 'var(--danger)' : 'linear-gradient(90deg, var(--primary), #a855f7)'}"></div>
                </div>
              </div>
            ` : `<p class="text-sm text-gray mb-3">Total: <strong>${loggedHours.toFixed(1)}h</strong></p>`}
            <div id="timeLogsList">
              ${renderTimeLogs(task.time_logs || [], task.id)}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  function isDueDatePast(date, status) {
    if (status === 'completada') return false;
    return new Date(date) < new Date();
  }
}

function renderTimeLogs(logs, taskId) {
  if (!logs.length) return '<p class="text-sm text-gray">Sin registros de tiempo</p>';

  return logs.map(l => `
    <div class="time-log-item">
      <div>
        <div class="text-sm font-semibold">${l.hours}h</div>
        <div class="text-xs text-gray">${escHtml(l.user_name)} · ${formatDate(l.logged_date)}</div>
        ${l.description ? `<div class="text-xs text-gray mt-1">${escHtml(l.description)}</div>` : ''}
      </div>
      ${l.user_id === App.user.id || App.user.role === 'admin' ? `
        <button class="btn btn-ghost btn-sm" onclick="deleteTimeLog(${taskId}, ${l.id})">🗑️</button>
      ` : ''}
    </div>
  `).join('');
}

async function loadTaskComments(taskId) {
  try {
    const comments = await api.getComments('task', taskId);
    const container = document.getElementById('taskComments');
    if (!container) return;

    container.innerHTML = comments.length ? comments.map(c => `
      <div class="comment-item">
        <div class="comment-avatar">${avatarInitials(c.user_name)}</div>
        <div class="comment-body">
          <div class="comment-meta">
            <strong>${escHtml(c.user_name)}</strong> · ${timeAgo(c.created_at)}
            ${c.user_id === App.user.id || App.user.role === 'admin' ? `
              <button class="btn btn-ghost" style="font-size:12px;padding:2px 6px;margin-left:4px"
                onclick="deleteTaskComment(${c.id}, ${taskId})">🗑️</button>
            ` : ''}
          </div>
          <div class="comment-content">${escHtml(c.content)}</div>
        </div>
      </div>
    `).join('') : '<p class="text-sm text-gray">Sin comentarios aún. ¡Sé el primero en comentar!</p>';
  } catch (err) { toast(err.message, 'error'); }
}

window.submitTaskComment = async function(taskId) {
  const input = document.getElementById('taskCommentInput');
  const content = input.value.trim();
  if (!content) return;
  try {
    await api.addComment('task', taskId, content);
    input.value = '';
    loadTaskComments(taskId);
    toast('Comentario agregado', 'success');
  } catch (err) { toast(err.message, 'error'); }
};

window.deleteTaskComment = async function(commentId, taskId) {
  confirm('¿Eliminar comentario?', async () => {
    try {
      await api.deleteComment(commentId);
      loadTaskComments(taskId);
      toast('Comentario eliminado', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
};

window.updateTaskStatus = async function(taskId, status) {
  try {
    await api.updateTask(taskId, { status });
    toast('Estado actualizado', 'success');
  } catch (err) { toast(err.message, 'error'); }
};

window.deleteTaskFromDetail = function(taskId) {
  confirm('¿Eliminar esta tarea?', async () => {
    try {
      const projectId = _taskData.project_id;
      await api.deleteTask(taskId);
      toast('Tarea eliminada', 'success');
      App.navigate(`proyecto/${projectId}`);
    } catch (err) { toast(err.message, 'error'); }
  });
};

function openLogTime(taskId) {
  createModal({
    id: 'modalLogTime',
    title: 'Registrar Tiempo',
    body: `
      <div id="ltError" class="form-error hidden"></div>
      <div class="form-group">
        <label class="form-label">Horas *</label>
        <input class="form-control" id="ltHours" type="number" step="0.25" min="0.25" placeholder="Ej: 2.5">
      </div>
      <div class="form-group">
        <label class="form-label">Fecha</label>
        <input class="form-control" id="ltDate" type="date" value="${new Date().toISOString().split('T')[0]}">
      </div>
      <div class="form-group">
        <label class="form-label">Descripción</label>
        <input class="form-control" id="ltDesc" placeholder="¿En qué trabajaste?">
      </div>
    `,
    footer: `
      <button class="btn btn-secondary" onclick="hideModal('modalLogTime')">Cancelar</button>
      <button class="btn btn-primary" onclick="submitLogTime(${taskId})">Registrar</button>
    `
  });
  showModal('modalLogTime');
}

window.submitLogTime = async function(taskId) {
  const hours = parseFloat(document.getElementById('ltHours').value);
  const errEl = document.getElementById('ltError');
  if (!hours || hours <= 0) { errEl.textContent = 'Ingresa un número de horas válido'; errEl.classList.remove('hidden'); return; }

  try {
    await api.addTimeLog(taskId, {
      hours,
      description: document.getElementById('ltDesc').value.trim() || null,
      logged_date: document.getElementById('ltDate').value || null,
    });
    hideModal('modalLogTime');
    toast('Tiempo registrado', 'success');
    const task = await api.getTask(taskId);
    _taskData = task;
    document.getElementById('timeLogsList').innerHTML = renderTimeLogs(task.time_logs || [], taskId);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
};

window.deleteTimeLog = async function(taskId, logId) {
  confirm('¿Eliminar este registro de tiempo?', async () => {
    try {
      await api.deleteTimeLog(taskId, logId);
      toast('Registro eliminado', 'success');
      const task = await api.getTask(taskId);
      document.getElementById('timeLogsList').innerHTML = renderTimeLogs(task.time_logs || [], taskId);
    } catch (err) { toast(err.message, 'error'); }
  });
};

window.openEditTaskFull = async function(taskId) {
  const task = _taskData;
  let users = [];
  if (task.company_id) {
    try { users = await api.getCompanyUsers(task.company_id); } catch {}
  }

  createModal({
    id: 'modalEditTaskFull',
    title: 'Editar Tarea',
    size: 'modal-lg',
    body: `
      <div id="etfError" class="form-error hidden"></div>
      <div class="form-group">
        <label class="form-label">Título *</label>
        <input class="form-control" id="etfTitle" value="${escHtml(task.title)}">
      </div>
      <div class="form-group">
        <label class="form-label">Descripción</label>
        <textarea class="form-control" id="etfDesc" rows="4">${escHtml(task.description || '')}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Estado</label>
          <select class="form-control" id="etfStatus">
            <option value="pendiente" ${task.status==='pendiente'?'selected':''}>Pendiente</option>
            <option value="en_progreso" ${task.status==='en_progreso'?'selected':''}>En progreso</option>
            <option value="en_revision" ${task.status==='en_revision'?'selected':''}>En revisión</option>
            <option value="completada" ${task.status==='completada'?'selected':''}>Completada</option>
            <option value="cancelada" ${task.status==='cancelada'?'selected':''}>Cancelada</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Prioridad</label>
          <select class="form-control" id="etfPriority">
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
          <select class="form-control" id="etfAssigned">
            <option value="">Sin asignar</option>
            ${users.map(u => `<option value="${u.id}" ${task.assigned_to==u.id?'selected':''}>${escHtml(u.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Horas estimadas</label>
          <input class="form-control" id="etfHours" type="number" step="0.5" min="0" value="${task.estimated_hours || ''}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Fecha de vencimiento</label>
        <input class="form-control" id="etfDue" type="date" value="${task.due_date || ''}">
      </div>
    `,
    footer: `
      <button class="btn btn-secondary" onclick="hideModal('modalEditTaskFull')">Cancelar</button>
      <button class="btn btn-primary" onclick="submitEditTaskFull(${taskId})">Guardar</button>
    `
  });
  showModal('modalEditTaskFull');
};

window.submitEditTaskFull = async function(taskId) {
  const title = document.getElementById('etfTitle').value.trim();
  const errEl = document.getElementById('etfError');
  if (!title) { errEl.textContent = 'El título es requerido'; errEl.classList.remove('hidden'); return; }

  try {
    const updated = await api.updateTask(taskId, {
      title,
      description: document.getElementById('etfDesc').value.trim() || null,
      status: document.getElementById('etfStatus').value,
      priority: document.getElementById('etfPriority').value,
      assigned_to: document.getElementById('etfAssigned').value || null,
      estimated_hours: document.getElementById('etfHours').value || null,
      due_date: document.getElementById('etfDue').value || null,
    });
    hideModal('modalEditTaskFull');
    toast('Tarea actualizada', 'success');
    renderTask(taskId);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
};

window.openLogTime = openLogTime;

function getPriorityClass(p) {
  return { baja: 'badge-green', media: 'badge-yellow', alta: 'badge-red', critica: 'badge-red' }[p] || 'badge-gray';
}

function isDueDatePast(date, status) {
  if (status === 'completada') return false;
  return new Date(date) < new Date();
}


