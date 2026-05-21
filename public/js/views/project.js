let _projectData = null;
let _projectUsers = [];
let _tasksPage = 1;
const _tasksPerPage = 15;

// Global page-change handler for task pagination
window._goPage = function(page) {
  _tasksPage = page;
  const filtered = getFilteredTasks();
  renderTaskPage(filtered);
};

function getFilteredTasks() {
  const q = (document.getElementById('searchTasks')?.value || '').toLowerCase();
  const s = document.getElementById('filterTaskStatus')?.value || '';
  const p = document.getElementById('filterTaskPriority')?.value || '';
  return (window._allTasks || []).filter(t =>
    (!q || t.title.toLowerCase().includes(q) || (t.description||'').toLowerCase().includes(q)) &&
    (!s || t.status === s) &&
    (!p || t.priority === p)
  );
}

function renderTaskPage(filtered) {
  _tasksPage = Math.max(1, Math.min(_tasksPage, Math.ceil(filtered.length / _tasksPerPage) || 1));
  const { items, html } = paginate(filtered, _tasksPage, _tasksPerPage);
  const container = document.getElementById('tasksList');
  if (container) container.innerHTML = renderTaskList(items) + html;
}

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
      <button class="tab-btn" onclick="switchTab('tabCalendar', this); renderCalendar()">🗓️ Calendario</button>
      <button class="tab-btn" onclick="switchTab('tabPlanning', this); renderPlanning()">📅 Planificación</button>
      <button class="tab-btn" onclick="switchTab('tabMetrics', this); renderMetrics(${project.id})">📊 Métricas</button>
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
      <div id="tasksList"></div>
    </div>

    <!-- Kanban tab -->
    <div class="tab-pane" id="tabKanban">
      <div id="kanbanBoard" class="kanban-board"></div>
    </div>

    <!-- Calendar tab -->
    <div class="tab-pane" id="tabCalendar">
      <div id="calendarContent"></div>
    </div>

    <!-- Planning tab -->
    <div class="tab-pane" id="tabPlanning">
      <div id="planningContent"></div>
    </div>

    <!-- Metrics tab -->
    <div class="tab-pane" id="tabMetrics">
      <div id="metricsContent"></div>
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
  _tasksPage = 1;
  window._calYear = undefined;   // Resetear estado del calendario
  window._calMonth = undefined;  // Resetear estado del calendario
  renderTaskPage(tasks);

  function applyTaskFilters() {
    _tasksPage = 1;
    renderTaskPage(getFilteredTasks());
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
          ${task.tags?.length ? task.tags.map(tag =>
  `<span class="tag-chip" style="background:${safeColor(tag.color)}22;color:${safeColor(tag.color)}">${escHtml(tag.name)}</span>`
).join('') : ''}
          ${task.subtasks?.length ? `<span>🔀 ${task.subtasks.filter(s=>s.status==='completada').length}/${task.subtasks.length} subtareas</span>` : ''}
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
  const canEdit = window._canEdit;
  const columns = [
    { id: 'pendiente',   label: 'Pendiente',   color: '#6b7280' },
    { id: 'en_progreso', label: 'En Progreso',  color: '#3b82f6' },
    { id: 'en_revision', label: 'En Revisión',  color: '#f59e0b' },
    { id: 'completada',  label: 'Completada',   color: '#10b981' },
    { id: 'cancelada',   label: 'Cancelada',    color: '#ef4444' },
  ];

  document.getElementById('kanbanBoard').innerHTML = columns.map(col => {
    const colTasks = tasks.filter(t => t.status === col.id);
    return `
      <div class="kanban-column" id="kcol-${col.id}"
        ondragover="event.preventDefault(); this.classList.add('drag-over')"
        ondragleave="if (!this.contains(event.relatedTarget)) this.classList.remove('drag-over')"
        ondrop="onKanbanDrop(event, '${col.id}')">
        <div class="kanban-header" style="border-bottom-color:${col.color}">
          <span>${col.label}</span>
          <span class="kanban-count">${colTasks.length}</span>
        </div>
        <div class="kanban-tasks" id="ktasks-${col.id}">
          ${colTasks.map(t => `
            <div class="kanban-task" draggable="${canEdit ? 'true' : 'false'}"
              data-task-id="${t.id}"
              ondragstart="onKanbanDragStart(event, ${t.id})"
              ondragend="event.target.classList.remove('dragging')"
              onclick="App.navigate('tarea/${t.id}')">
              <div class="kanban-task-title">${escHtml(t.title)}</div>
              <div class="kanban-task-meta">
                <span class="${getPriorityClass(t.priority)} badge" style="font-size:11px">${priorityIcon(t.priority)}</span>
                ${t.assigned_name ? `<span class="text-sm text-gray">👤 ${escHtml(t.assigned_name)}</span>` : ''}
              </div>
              ${t.due_date ? `<div class="text-xs text-gray mt-1 ${isDueDate(t.due_date, t.status) ? 'text-danger' : ''}">📅 ${formatDate(t.due_date)}</div>` : ''}
            </div>
          `).join('') || `<div class="text-sm text-gray" style="padding:8px;text-align:center">Sin tareas</div>`}
        </div>
      </div>
    `;
  }).join('');
}

window.onKanbanDragStart = function(e, taskId) {
  e.dataTransfer.setData('kanban_task_id', taskId);
  setTimeout(() => e.target.classList.add('dragging'), 0);
};

window.onKanbanDrop = async function(e, newStatus) {
  if (!window._canEdit) return;
  e.preventDefault();
  document.querySelectorAll('.kanban-column').forEach(c => c.classList.remove('drag-over'));
  const taskId = parseInt(e.dataTransfer.getData('kanban_task_id'));
  if (!taskId) return;
  const task = (window._allTasks || []).find(t => t.id === taskId);
  if (!task || task.status === newStatus) return;

  const prevStatus = task.status;
  task.status = newStatus;
  renderKanban();

  try {
    await api.updateTask(taskId, { status: newStatus });
  } catch (err) {
    task.status = prevStatus;
    renderKanban();
    toast('Error al mover tarea: ' + err.message, 'error');
  }
};

function renderPlanning() {
  const allTasks = window._allTasks || [];
  const project = _projectData;

  // Usar tareas con fecha de vencimiento. Si tiene fecha inicio del proyecto, usar como referencia
  const tasks = allTasks.filter(t => t.due_date);

  if (!tasks.length) {
    document.getElementById('planningContent').innerHTML = `
      <div class="empty-state"><div class="icon">📅</div>
        <h3>Sin planificación</h3>
        <p>Agrega fechas de vencimiento a las tareas para ver la línea de tiempo.</p>
      </div>`;
    return;
  }

  // Calcular rango total — desde la fecha más temprana hasta la más tardía
  const allDates = tasks.map(t => new Date(t.due_date));
  if (project.start_date) allDates.push(new Date(project.start_date));
  const minDate = new Date(Math.min(...allDates));
  const maxDate = new Date(Math.max(...allDates));
  // Añadir padding de 1 día a cada lado
  minDate.setDate(minDate.getDate() - 1);
  maxDate.setDate(maxDate.getDate() + 1);
  const totalMs = maxDate - minDate;
  const totalDays = Math.max(totalMs / 86400000, 7);

  // Generar cabecera de fechas (una por cada 7 días aprox.)
  const headerDates = [];
  const step = Math.max(1, Math.round(totalDays / 10));
  const cur = new Date(minDate);
  while (cur <= maxDate) {
    headerDates.push(new Date(cur));
    cur.setDate(cur.getDate() + step);
  }

  const priorityColors = { critica:'#ef4444', alta:'#f97316', media:'#3b82f6', baja:'#10b981' };
  const sorted = [...tasks].sort((a,b) => new Date(a.due_date) - new Date(b.due_date));

  document.getElementById('planningContent').innerHTML = `
    <div class="card">
      <div class="card-body">
        <div class="flex justify-between items-center mb-4">
          <h3 class="card-title">📅 Línea de tiempo</h3>
          ${project.start_date && project.end_date ? `
            <div class="flex gap-4 text-sm text-gray">
              <span>🚀 <strong>${formatDate(project.start_date)}</strong></span>
              <span>🏁 <strong>${formatDate(project.end_date)}</strong></span>
              <span>📊 <strong>${project.progress || 0}%</strong></span>
            </div>` : ''}
        </div>
        <div class="gantt-container" style="overflow-x:auto">
          <div style="min-width:560px">
            <!-- Header -->
            <div class="gantt-row" style="border-bottom:2px solid var(--gray-200);margin-bottom:4px">
              <div class="gantt-task-name" style="font-weight:600;font-size:11px;color:var(--gray-500)">TAREA</div>
              <div style="flex:1;position:relative;height:24px">
                ${headerDates.map(d => {
                  const pct = ((d - minDate) / totalMs) * 100;
                  return `<div style="position:absolute;left:${pct}%;font-size:10px;color:var(--gray-400);transform:translateX(-50%);white-space:nowrap">
                    ${d.getDate()}/${d.getMonth()+1}
                  </div>`;
                }).join('')}
              </div>
            </div>
            <!-- Task rows -->
            ${sorted.map(task => {
              // Bar: starts at created_at (or project start), ends at due_date
              const startRef = task.created_at ? new Date(task.created_at) : minDate;
              const end = new Date(task.due_date);
              const barStart = Math.max(0, ((startRef - minDate) / totalMs) * 100);
              const barEnd = Math.min(100, ((end - minDate) / totalMs) * 100);
              const barWidth = Math.max(1.5, barEnd - barStart);
              const color = priorityColors[task.priority] || '#6366f1';
              const isOverdue = end < new Date() && task.status !== 'completada';
              return `
                <div class="gantt-row" onclick="App.navigate('tarea/${task.id}')" style="cursor:pointer">
                  <div class="gantt-task-name" title="${escHtml(task.title)}">
                    <span class="status-badge status-${task.status}" style="font-size:10px;margin-right:4px">${statusLabel(task.status)}</span>
                    ${escHtml(task.title)}
                  </div>
                  <div class="gantt-bar-area">
                    <div class="gantt-bar" style="left:${barStart}%;width:${barWidth}%;background:${isOverdue ? '#ef4444' : color};opacity:${task.status==='completada'?.6:1}"
                      title="${escHtml(task.title)} — Vence: ${formatDate(task.due_date)}${isOverdue?' ⚠️ VENCIDA':''}">
                      ${task.assigned_name ? `<span style="font-size:10px;white-space:nowrap;overflow:hidden;max-width:100%;display:block">👤 ${escHtml(task.assigned_name.split(' ')[0])}</span>` : ''}
                    </div>
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>
        <div class="flex gap-4 mt-4 text-xs text-gray flex-wrap">
          <span><span style="display:inline-block;width:10px;height:10px;background:#ef4444;border-radius:2px;margin-right:4px"></span>Crítica / Vencida</span>
          <span><span style="display:inline-block;width:10px;height:10px;background:#f97316;border-radius:2px;margin-right:4px"></span>Alta</span>
          <span><span style="display:inline-block;width:10px;height:10px;background:#3b82f6;border-radius:2px;margin-right:4px"></span>Media</span>
          <span><span style="display:inline-block;width:10px;height:10px;background:#10b981;border-radius:2px;margin-right:4px"></span>Baja / Completada</span>
        </div>
      </div>
    </div>
  `;
}

async function renderMetrics(projectId) {
  const container = document.getElementById('metricsContent');
  if (!container) return;
  ['chartStatus', 'chartPriority', 'chartHours'].forEach(id => {
    const existing = Chart.getChart(id);
    if (existing) existing.destroy();
  });
  container.innerHTML = '<div class="loading-overlay" style="position:relative;height:200px"><div class="spinner"></div></div>';

  try {
    const stats = await api.getProjectStats(projectId);

    container.innerHTML = `
      <div class="grid-2 mb-4">
        <div class="card">
          <div class="card-body">
            <h4 class="card-title mb-3">Tareas por Estado</h4>
            <div class="chart-canvas-wrap"><canvas id="chartStatus"></canvas></div>
          </div>
        </div>
        <div class="card">
          <div class="card-body">
            <h4 class="card-title mb-3">Tareas por Prioridad</h4>
            <div class="chart-canvas-wrap"><canvas id="chartPriority"></canvas></div>
          </div>
        </div>
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="card-body">
            <h4 class="card-title mb-3">Horas: Estimadas vs Registradas</h4>
            <div class="chart-canvas-wrap"><canvas id="chartHours"></canvas></div>
          </div>
        </div>
        <div class="card">
          <div class="card-body">
            <h4 class="card-title mb-3">Actividad Reciente</h4>
            <div id="activityList"></div>
          </div>
        </div>
      </div>
    `;

    const statusColors = {
      pendiente:'#6b7280', en_progreso:'#3b82f6',
      en_revision:'#f59e0b', completada:'#10b981', cancelada:'#ef4444'
    };
    const priorityColors = { baja:'#10b981', media:'#3b82f6', alta:'#f97316', critica:'#ef4444' };

    const sd = stats.tasksByStatus || [];
    new Chart(document.getElementById('chartStatus'), {
      type: 'doughnut',
      data: {
        labels: sd.map(s => statusLabel(s.status)),
        datasets: [{ data: sd.map(s => s.count), backgroundColor: sd.map(s => statusColors[s.status] || '#6b7280'), borderWidth: 2 }]
      },
      options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } }, maintainAspectRatio: false }
    });

    const pd = stats.tasksByPriority || [];
    new Chart(document.getElementById('chartPriority'), {
      type: 'bar',
      data: {
        labels: pd.map(p => priorityLabel(p.priority)),
        datasets: [{ label: 'Tareas', data: pd.map(p => p.count), backgroundColor: pd.map(p => priorityColors[p.priority] || '#6b7280'), borderRadius: 4 }]
      },
      options: {
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
        maintainAspectRatio: false
      }
    });

    const h = stats.totalHours || {};
    new Chart(document.getElementById('chartHours'), {
      type: 'bar',
      data: {
        labels: ['Horas'],
        datasets: [
          { label: 'Estimadas', data: [parseFloat((h.estimated || 0).toFixed(1))], backgroundColor: '#3b82f6', borderRadius: 4 },
          { label: 'Registradas', data: [parseFloat((h.actual || 0).toFixed(1))], backgroundColor: '#10b981', borderRadius: 4 }
        ]
      },
      options: {
        scales: { y: { beginAtZero: true } },
        plugins: { legend: { labels: { boxWidth: 12, font: { size: 11 } } } },
        maintainAspectRatio: false
      }
    });

    const acts = stats.recentActivity || [];
    document.getElementById('activityList').innerHTML = acts.length
      ? acts.map(a => `
        <div class="activity-item">
          <div class="comment-avatar" style="width:28px;height:28px;font-size:11px;flex-shrink:0">${avatarInitials(a.user_name)}</div>
          <div>
            <div class="text-sm"><strong>${escHtml(a.user_name)}</strong> — ${escHtml(a.description)}</div>
            <div class="text-xs text-gray">${timeAgo(a.created_at)}</div>
          </div>
        </div>
      `).join('')
      : '<p class="text-sm text-gray">Sin actividad reciente.</p>';

  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p class="text-danger">${escHtml(err.message)}</p></div>`;
  }
}

function renderCalendar() {
  const tasks = window._allTasks || [];
  const now = new Date();
  if (window._calYear === undefined) window._calYear = now.getFullYear();
  if (window._calMonth === undefined) window._calMonth = now.getMonth();
  const year = window._calYear;
  const month = window._calMonth;

  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDow = firstDay.getDay();

  const monthTasks = tasks.filter(t => {
    if (!t.due_date) return false;
    const d = new Date(t.due_date + 'T00:00:00');
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const tasksByDay = {};
  monthTasks.forEach(t => {
    const day = new Date(t.due_date + 'T00:00:00').getDate();
    if (!tasksByDay[day]) tasksByDay[day] = [];
    tasksByDay[day].push(t);
  });

  const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const dayNames = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;
  const todayStr = new Date().toDateString();

  let cells = '';
  for (let i = 0; i < totalCells; i++) {
    const day = i - startDow + 1;
    const valid = day >= 1 && day <= daysInMonth;
    const isToday = valid && new Date(year, month, day).toDateString() === todayStr;
    const dayTasks = valid ? (tasksByDay[day] || []) : [];

    cells += `<div class="cal-cell${!valid ? ' cal-cell-empty' : ''}${isToday ? ' cal-cell-today' : ''}">
      ${valid ? `<div class="cal-day-num${isToday ? ' today' : ''}">${day}</div>` : ''}
      ${dayTasks.slice(0, 3).map(t => `
        <div class="cal-task priority-${t.priority}" onclick="event.stopPropagation();App.navigate('tarea/${t.id}')"
          title="${escHtml(t.title)} — ${escHtml(statusLabel(t.status))}">
          ${priorityIcon(t.priority)} ${escHtml(t.title.length > 14 ? t.title.slice(0,14)+'…' : t.title)}
        </div>
      `).join('')}
      ${dayTasks.length > 3 ? `<div class="cal-task-more">+${dayTasks.length - 3} más</div>` : ''}
    </div>`;
  }

  document.getElementById('calendarContent').innerHTML = `
    <div class="card">
      <div class="card-body">
        <div class="cal-nav">
          <button class="btn btn-ghost btn-sm" onclick="navCalendar(-1)">‹ Anterior</button>
          <h3>${monthNames[month]} ${year}</h3>
          <button class="btn btn-ghost btn-sm" onclick="navCalendar(1)">Siguiente ›</button>
        </div>
        <div class="cal-grid">
          ${dayNames.map(d => `<div class="cal-header-cell">${d}</div>`).join('')}
          ${cells}
        </div>
        ${monthTasks.length === 0 ? `<p class="text-sm text-gray mt-4 text-center">No hay tareas con fecha de vencimiento en ${monthNames[month]}.</p>` : ''}
      </div>
    </div>
  `;
}

window.navCalendar = function(dir) {
  let m = window._calMonth + dir;
  let y = window._calYear;
  if (m < 0) { m = 11; y--; }
  if (m > 11) { m = 0; y++; }
  window._calMonth = m;
  window._calYear = y;
  renderCalendar();
};

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
  confirm('¿Eliminar esta observación? No se puede deshacer.', async () => {
    try {
      await api.deleteObservation(projectId, obsId);
      loadObservations(projectId);
      toast('Observación eliminada', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
};

window.deleteCommentItem = async function(commentId, containerId, type, entityId) {
  confirm('¿Eliminar este comentario?', async () => {
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
  const task = (window._allTasks || []).find(t => t.id === taskId);
  if (!task) return;

  // Remove from UI immediately (optimistic)
  window._allTasks = window._allTasks.filter(t => t.id !== taskId);
  renderTaskPage(getFilteredTasks());

  softDelete({
    label: task.title,
    delay: 5000,
    onDelete: async () => {
      try {
        await api.deleteTask(taskId);
      } catch (err) {
        // If delete fails, restore
        window._allTasks.push(task);
        renderTaskPage(getFilteredTasks());
        toast('Error al eliminar: ' + err.message, 'error');
      }
    },
    onUndo: () => {
      window._allTasks.push(task);
      window._allTasks.sort((a, b) => a.id - b.id);
      renderTaskPage(getFilteredTasks());
    }
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
  confirm('Se eliminarán permanentemente todas las tareas, comentarios y datos de este proyecto.', async () => {
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
window.renderCalendar = renderCalendar;
window.renderPlanning = renderPlanning;
window.renderMetrics = renderMetrics;
window.loadProjectComments = loadProjectComments;
window.loadObservations = loadObservations;

function getPriorityClass(p) {
  return { baja: 'badge-green', media: 'badge-yellow', alta: 'badge-red', critica: 'badge-red' }[p] || 'badge-gray';
}


