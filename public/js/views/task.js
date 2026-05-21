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
    loadTaskAttachments(id);
    loadTaskActivity(id);
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
            <div class="mb-4" id="subtasksSection">
              <div class="flex items-center justify-between mb-2">
                <h4 class="text-sm font-semibold">
                  Subtareas
                  ${task.subtasks && task.subtasks.length ? `
                    <span class="subtask-progress">(${task.subtasks.filter(s=>s.status==='completada').length}/${task.subtasks.length} completadas)</span>
                  ` : ''}
                </h4>
                <button class="btn btn-ghost btn-sm" onclick="toggleSubtaskForm()">+ Agregar</button>
              </div>
              <div id="subtaskFormRow" class="subtask-add-row hidden">
                <input class="form-control" id="subtaskTitle" placeholder="Título de la subtarea..." onkeydown="if(event.key==='Enter') submitSubtask(${task.id})">
                <button class="btn btn-primary btn-sm" onclick="submitSubtask(${task.id})">Crear</button>
                <button class="btn btn-ghost btn-sm" onclick="toggleSubtaskForm()">✕</button>
              </div>
              <div id="subtaskList">
                ${task.subtasks && task.subtasks.length ? task.subtasks.map(s => `
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
                `).join('') : '<p class="text-sm text-gray" id="noSubtasksMsg">Sin subtareas aún.</p>'}
              </div>
            </div>
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
            <div style="padding:12px 16px; border-bottom:1px solid var(--gray-100)">
              <div class="text-xs text-gray mb-1">Fecha de creación</div>
              <div class="text-sm">${formatDateTime(task.created_at)}</div>
            </div>
            <div style="padding:12px 16px">
              <div class="text-xs text-gray mb-1">Etiquetas</div>
              <div class="tags-wrap" id="taskTagsWrap">
                ${(task.tags || []).map(tag => `
                  <span class="tag-chip" style="background:${safeColor(tag.color)}22;color:${safeColor(tag.color)}">
                    ${escHtml(tag.name)}
                    <span class="tag-remove" onclick="removeTagFromTask(${task.id}, ${tag.id})">✕</span>
                  </span>
                `).join('') || '<span class="text-xs text-gray">Sin etiquetas</span>'}
              </div>
              <button class="btn btn-ghost btn-sm mt-2" onclick="openTagManager(${task.id}, ${task.company_id || 0})">
                + Etiqueta
              </button>
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

        <!-- Dependencies -->
        <div class="card mb-4">
          <div class="card-header">
            <span class="card-title">🔗 Dependencias</span>
            <button class="btn btn-primary btn-sm" onclick="openAddDependency(${task.id}, ${task.project_id})">+ Agregar</button>
          </div>
          <div class="card-body" id="depsList">
            ${renderDepsList(task.dependencies || [], task.id)}
          </div>
        </div>

        <!-- Attachments -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">📎 Adjuntos</span>
          </div>
          <div class="card-body">
            <div class="upload-zone" onclick="document.getElementById('attachInput').click()">
              <div class="text-sm text-gray">📁 Click para subir archivo</div>
              <div class="text-xs text-gray">Máx. 10 MB — JPG, PNG, PDF, DOC, XLS, ZIP, CSV</div>
            </div>
            <input type="file" id="attachInput" style="display:none"
              accept=".jpg,.jpeg,.png,.gif,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.csv"
              onchange="uploadAttachment(${task.id}, this)">
            <div id="attachmentsList" class="mt-3">
              ${renderAttachmentsList(task.attachments || [], task.id)}
            </div>
          </div>
        </div>

        <!-- Activity log -->
        <div class="card mt-4">
          <div class="card-header"><span class="card-title">📜 Historial</span></div>
          <div class="card-body" id="taskActivityLog">
            <p class="text-sm text-gray">Cargando...</p>
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
  confirm('¿Eliminar este comentario?', async () => {
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
  const projectId = _taskData.project_id;
  const title = _taskData.title || 'Tarea';

  // Navigate back immediately — soft delete handles the actual API call
  App.navigate(`proyecto/${projectId}`);

  softDelete({
    label: title,
    delay: 5000,
    onDelete: async () => {
      try {
        await api.deleteTask(taskId);
      } catch (err) {
        toast('Error al eliminar la tarea: ' + err.message, 'error');
      }
    },
    onUndo: () => {
      // Navigate back to task if undo
      App.navigate(`tarea/${taskId}`);
    }
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

window.toggleSubtaskForm = function() {
  const row = document.getElementById('subtaskFormRow');
  if (!row) return;
  row.classList.toggle('hidden');
  if (!row.classList.contains('hidden')) {
    document.getElementById('subtaskTitle')?.focus();
  }
};

function renderDepsList(deps, taskId) {
  if (!deps.length) return '<p class="text-sm text-gray">Sin dependencias.</p>';
  return deps.map(d => `
    <div class="dep-item">
      <div>
        <a href="#" onclick="event.preventDefault();App.navigate('tarea/${d.id}')" class="text-sm font-semibold">${escHtml(d.title)}</a>
        <span class="status-badge status-${d.status}" style="font-size:10px;margin-left:4px">${statusLabel(d.status)}</span>
        ${d.status !== 'completada' ? '<span class="dep-blocked-badge" style="margin-left:4px">Bloqueada</span>' : ''}
      </div>
      <button class="btn btn-ghost btn-sm" onclick="removeDep(${taskId}, ${d.id})">✕</button>
    </div>
  `).join('');
}

function renderAttachmentsList(attachments, taskId) {
  if (!attachments.length) return '<p class="text-sm text-gray">Sin archivos adjuntos.</p>';
  return attachments.map(a => `
    <div class="attachment-item">
      <div style="overflow:hidden">
        <div class="attachment-name" title="${escHtml(a.original_name)}">📄 ${escHtml(a.original_name)}</div>
        <div class="attachment-size">${(a.size / 1024).toFixed(1)} KB · ${escHtml(a.user_name)} · ${timeAgo(a.created_at)}</div>
      </div>
      <div class="flex gap-2">
        <a href="/api/attachments/${a.id}/download" class="btn btn-ghost btn-sm" title="Descargar">⬇</a>
        ${a.user_id === App.user.id || App.user.role === 'admin' ? `
          <button class="btn btn-ghost btn-sm" onclick="deleteAttachmentItem(${a.id}, ${taskId})">🗑️</button>
        ` : ''}
      </div>
    </div>
  `).join('');
}

window.openAddDependency = async function(taskId, projectId) {
  const tasks = await api.getTasks(projectId);
  const current = (_taskData.dependencies || []).map(d => d.id);
  const available = tasks.filter(t => t.id !== taskId && !current.includes(t.id));

  if (!available.length) {
    toast('No hay otras tareas disponibles para agregar como dependencia', 'info');
    return;
  }

  createModal({
    id: 'modalAddDep',
    title: 'Agregar Dependencia',
    body: `
      <p class="text-sm text-gray mb-3">Esta tarea no podrá completarse hasta que la tarea seleccionada esté completada.</p>
      <div class="form-group">
        <label class="form-label">Tarea bloqueante</label>
        <select class="form-control" id="depSelect">
          <option value="">Seleccionar tarea...</option>
          ${available.map(t => `<option value="${t.id}">${escHtml(t.title)} (${statusLabel(t.status)})</option>`).join('')}
        </select>
      </div>
    `,
    footer: `
      <button class="btn btn-secondary" onclick="hideModal('modalAddDep')">Cancelar</button>
      <button class="btn btn-primary" onclick="submitAddDep(${taskId})">Agregar</button>
    `
  });
  showModal('modalAddDep');
};

window.submitAddDep = async function(taskId) {
  const depId = document.getElementById('depSelect')?.value;
  if (!depId) return;
  try {
    await api.addDependency(taskId, depId);
    hideModal('modalAddDep');
    toast('Dependencia agregada', 'success');
    const updated = await api.getTask(taskId);
    _taskData = updated;
    const list = document.getElementById('depsList');
    if (list) list.innerHTML = renderDepsList(updated.dependencies || [], taskId);
  } catch (err) { toast(err.message, 'error'); }
};

window.removeDep = async function(taskId, depId) {
  try {
    await api.removeDependency(taskId, depId);
    const updated = await api.getTask(taskId);
    _taskData = updated;
    const list = document.getElementById('depsList');
    if (list) list.innerHTML = renderDepsList(updated.dependencies || [], taskId);
    toast('Dependencia eliminada', 'success');
  } catch (err) { toast(err.message, 'error'); }
};

async function loadTaskAttachments(taskId) {
  try {
    const attachments = await api.getAttachments(taskId);
    const list = document.getElementById('attachmentsList');
    if (list) list.innerHTML = renderAttachmentsList(attachments, taskId);
  } catch { /* silencioso */ }
}

window.uploadAttachment = async function(taskId, input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  try {
    toast('Subiendo archivo...', 'info');
    await api.uploadAttachment(taskId, file);
    toast('Archivo subido', 'success');
    loadTaskAttachments(taskId);
  } catch (err) { toast(err.message, 'error'); }
};

window.deleteAttachmentItem = async function(attachId, taskId) {
  confirm('¿Eliminar este archivo?', async () => {
    try {
      await api.deleteAttachment(attachId);
      loadTaskAttachments(taskId);
      toast('Archivo eliminado', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
};

window.submitSubtask = async function(parentTaskId) {
  const titleEl = document.getElementById('subtaskTitle');
  const btnEl = document.querySelector('#subtaskFormRow .btn-primary');
  const title = titleEl?.value.trim();
  if (!title) return;
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = '...'; }

  try {
    const task = _taskData;
    await api.createTask({
      project_id: task.project_id,
      title,
      parent_task_id: parentTaskId,
      status: 'pendiente',
      priority: 'media',
    });
    titleEl.value = '';
    document.getElementById('subtaskFormRow').classList.add('hidden');
    toast('Subtarea creada', 'success');
    const updated = await api.getTask(parentTaskId);
    _taskData = updated;
    renderTaskContent(updated);
    loadTaskComments(parentTaskId);
    loadTaskAttachments(parentTaskId);
  } catch (err) {
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Crear'; }
    toast('Error: ' + err.message, 'error');
  }
};

window.openTagManager = async function(taskId, companyId) {
  const [allTags] = await Promise.all([
    api.getTagsByCompany(companyId)
  ]);
  const taskTags = _taskData.tags || [];
  const assignedIds = new Set(taskTags.map(t => t.id));

  createModal({
    id: 'modalTags',
    title: 'Gestionar Etiquetas',
    body: `
      <div class="form-group">
        <label class="form-label">Etiquetas disponibles</label>
        <div class="tag-selector" id="tagSelectorList">
          ${allTags.length ? allTags.map(tag => `
            <span class="tag-option${assignedIds.has(tag.id) ? ' selected' : ''}"
              style="background:${safeColor(tag.color)}22;color:${safeColor(tag.color)};border-color:${assignedIds.has(tag.id) ? safeColor(tag.color) : 'transparent'}"
              onclick="toggleTaskTag(${taskId}, ${tag.id}, this)"
              data-color="${safeColor(tag.color)}"
              data-assigned="${assignedIds.has(tag.id) ? '1' : '0'}">
              ${escHtml(tag.name)}
            </span>
          `).join('') : '<p class="text-sm text-gray">No hay etiquetas creadas aún.</p>'}
        </div>
      </div>
      <hr style="margin:16px 0">
      <div class="form-group">
        <label class="form-label">Nueva etiqueta</label>
        <div class="flex gap-2">
          <input class="form-control" id="newTagName" placeholder="Nombre de la etiqueta" style="flex:1">
          <input type="color" id="newTagColor" value="#6366f1" style="width:40px;height:38px;border:1px solid var(--gray-200);border-radius:6px;cursor:pointer;padding:2px">
          <button class="btn btn-primary btn-sm" onclick="createTagAndAssign(${taskId}, ${companyId})">Crear</button>
        </div>
      </div>
    `,
    footer: `<button class="btn btn-secondary" onclick="hideModal('modalTags')">Cerrar</button>`
  });
  showModal('modalTags');
};

window.toggleTaskTag = async function(taskId, tagId, el) {
  const color = safeColor(el.dataset.color || '#6366f1');
  el.style.pointerEvents = 'none';  // guard doble click
  const isAssigned = el.dataset.assigned === '1';
  try {
    if (isAssigned) {
      await api.removeTag(taskId, tagId);
      el.dataset.assigned = '0';
      el.style.borderColor = 'transparent';
      el.classList.remove('selected');
    } else {
      await api.assignTag(taskId, tagId);
      el.dataset.assigned = '1';
      el.style.borderColor = color;
      el.classList.add('selected');
    }
    const updated = await api.getTask(taskId);
    _taskData = updated;
    const wrap = document.getElementById('taskTagsWrap');
    if (wrap) {
      wrap.innerHTML = (updated.tags || []).map(tag => `
        <span class="tag-chip" style="background:${safeColor(tag.color)}22;color:${safeColor(tag.color)}">
          ${escHtml(tag.name)}
          <span class="tag-remove" onclick="removeTagFromTask(${taskId}, ${tag.id})">✕</span>
        </span>
      `).join('') || '<span class="text-xs text-gray">Sin etiquetas</span>';
    }
  } catch (err) { toast(err.message, 'error'); }
  finally { el.style.pointerEvents = ''; }
};

window.removeTagFromTask = async function(taskId, tagId) {
  try {
    await api.removeTag(taskId, tagId);
    const updated = await api.getTask(taskId);
    _taskData = updated;
    const wrap = document.getElementById('taskTagsWrap');
    if (wrap) {
      wrap.innerHTML = (updated.tags || []).map(tag => `
        <span class="tag-chip" style="background:${safeColor(tag.color)}22;color:${safeColor(tag.color)}">
          ${escHtml(tag.name)}
          <span class="tag-remove" onclick="removeTagFromTask(${taskId}, ${tag.id})">✕</span>
        </span>
      `).join('') || '<span class="text-xs text-gray">Sin etiquetas</span>';
    }
  } catch (err) { toast(err.message, 'error'); }
};

window.createTagAndAssign = async function(taskId, companyId) {
  const name = document.getElementById('newTagName')?.value.trim();
  const color = document.getElementById('newTagColor')?.value || '#6366f1';
  if (!name) return;
  try {
    const tag = await api.createTag({ company_id: companyId, name, color });
    await api.assignTag(taskId, tag.id);
    hideModal('modalTags');
    const updated = await api.getTask(taskId);
    _taskData = updated;
    const wrap = document.getElementById('taskTagsWrap');
    if (wrap) {
      wrap.innerHTML = (updated.tags || []).map(t => `
        <span class="tag-chip" style="background:${safeColor(t.color)}22;color:${safeColor(t.color)}">
          ${escHtml(t.name)}
          <span class="tag-remove" onclick="removeTagFromTask(${taskId}, ${t.id})">✕</span>
        </span>
      `).join('') || '<span class="text-xs text-gray">Sin etiquetas</span>';
    }
    toast('Etiqueta creada y asignada', 'success');
  } catch (err) { toast(err.message, 'error'); }
};

window.openLogTime = openLogTime;

async function loadTaskActivity(taskId) {
  try {
    const logs = await api.getTaskActivity(taskId);
    const container = document.getElementById('taskActivityLog');
    if (!container) return;
    container.innerHTML = logs.length ? logs.map(l => `
      <div class="activity-log-item">
        <div class="activity-log-dot"></div>
        <div class="activity-log-body">
          <div class="activity-log-desc">${escHtml(l.description || l.action)}</div>
          <div class="activity-log-meta">${escHtml(l.user_name || 'Sistema')} · ${timeAgo(l.created_at)}</div>
        </div>
      </div>
    `).join('') : '<p class="text-sm text-gray">Sin actividad registrada.</p>';
  } catch { /* silencioso */ }
}

function getPriorityClass(p) {
  return { baja: 'badge-green', media: 'badge-yellow', alta: 'badge-red', critica: 'badge-red' }[p] || 'badge-gray';
}

function isDueDatePast(date, status) {
  if (status === 'completada') return false;
  return new Date(date) < new Date();
}


