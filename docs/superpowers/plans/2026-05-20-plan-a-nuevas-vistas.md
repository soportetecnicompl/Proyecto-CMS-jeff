# Plan A — Nuevas Vistas: Kanban Drag & Drop, Calendario, Métricas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar drag & drop al Kanban existente, vista de Calendario mensual y tab de Métricas con gráficas a la vista de proyecto.

**Architecture:** Todo vive dentro de `public/js/views/project.js` — se extienden las funciones `renderKanban()`, y se agregan `renderCalendar()` y `renderMetrics()`. El HTML del proyecto ya tiene los tabs wired; solo faltan los contenedores y la lógica. Los charts usan Chart.js via CDN. Sin cambios de base de datos.

**Tech Stack:** Vanilla JS, HTML5 Drag & Drop API, Chart.js 4.x (CDN), CSS Grid para el calendario.

---

## Archivos modificados

- `public/index.html` — agregar `<script src="chart.js CDN">` antes de cerrar `</body>`
- `public/js/views/project.js` — actualizar `renderKanban()`, agregar `renderCalendar()`, `renderMetrics()`, handlers de drag, navegación de calendario
- `public/css/style.css` — estilos de drag, grid de calendario, contenedores de charts

---

### Task 1: Kanban con Drag & Drop

**Files:**
- Modify: `public/js/views/project.js` — función `renderKanban()` y nuevas funciones de drag
- Modify: `public/css/style.css` — estados visuales de drag

- [ ] **Step 1: Agregar estilos de drag al CSS**

Abrir `public/css/style.css` y agregar al final:

```css
/* ── Kanban drag & drop ──────────────────────────────────────── */
.kanban-task[draggable] { cursor: grab; }
.kanban-task[draggable]:active { cursor: grabbing; }
.kanban-task.dragging { opacity: 0.4; transform: scale(0.97); }
.kanban-column.drag-over { background: var(--primary-light, #eff6ff); border: 2px dashed var(--primary); border-radius: 8px; }
```

- [ ] **Step 2: Reemplazar `renderKanban()` en project.js**

Localizar la función `renderKanban()` (línea ~294) y reemplazarla completa:

```javascript
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
        ondragover="event.preventDefault(); document.getElementById('kcol-${col.id}').classList.add('drag-over')"
        ondragleave="document.getElementById('kcol-${col.id}').classList.remove('drag-over')"
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
```

- [ ] **Step 3: Agregar funciones `onKanbanDragStart` y `onKanbanDrop` en project.js**

Después de la función `renderKanban()`, agregar:

```javascript
window.onKanbanDragStart = function(e, taskId) {
  e.dataTransfer.setData('kanban_task_id', taskId);
  setTimeout(() => e.target.classList.add('dragging'), 0);
};

window.onKanbanDrop = async function(e, newStatus) {
  e.preventDefault();
  document.querySelectorAll('.kanban-column').forEach(c => c.classList.remove('drag-over'));
  const taskId = parseInt(e.dataTransfer.getData('kanban_task_id'));
  if (!taskId) return;
  const task = (window._allTasks || []).find(t => t.id === taskId);
  if (!task || task.status === newStatus) return;

  const prevStatus = task.status;
  task.status = newStatus; // optimistic
  renderKanban();

  try {
    await api.updateTask(taskId, { status: newStatus });
  } catch (err) {
    task.status = prevStatus; // rollback
    renderKanban();
    toast('Error al mover tarea: ' + err.message, 'error');
  }
};
```

- [ ] **Step 4: Verificar en el navegador**

1. Abrir http://localhost:3000 → login → entrar a un proyecto con tareas
2. Click en tab "📌 Kanban"
3. Arrastrar una tarjeta a otra columna
4. Confirmar que la columna se ilumina al pasar por encima
5. Confirmar que al soltar cambia de columna y el backend se actualiza (recargando la página)

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/jeffr/OneDrive/Aplicaciones/Proyecto-CMS-jeff"
git add public/js/views/project.js public/css/style.css
git commit -m "feat: kanban drag & drop con actualización optimista de estado"
```

---

### Task 2: Tab de Calendario Mensual

**Files:**
- Modify: `public/js/views/project.js` — agregar tab button, div contenedor, `renderCalendar()`, `navCalendar()`
- Modify: `public/css/style.css` — grid del calendario

- [ ] **Step 1: Agregar estilos del calendario en style.css**

Agregar al final de `public/css/style.css`:

```css
/* ── Calendario mensual ──────────────────────────────────────── */
.cal-nav { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
.cal-nav h3 { font-size:16px; font-weight:600; }
.cal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:4px; }
.cal-header-cell { text-align:center; font-size:11px; font-weight:600; color:var(--gray-500); padding:6px 0; }
.cal-cell { min-height:88px; border:1px solid var(--gray-100); border-radius:6px; padding:4px; background:var(--white); }
.cal-cell-empty { background:var(--gray-50); border-color:transparent; }
.cal-cell-today { border-color:var(--primary); background:var(--primary-50, #eff6ff); }
.cal-day-num { font-size:12px; font-weight:600; color:var(--gray-600); margin-bottom:3px; }
.cal-day-num.today { background:var(--primary); color:white; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; }
.cal-task { font-size:11px; padding:2px 5px; border-radius:4px; margin-bottom:2px; cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; background:var(--primary-light, #dbeafe); color:var(--primary-dark, #1d4ed8); }
.cal-task.priority-critica { background:#fee2e2; color:#b91c1c; }
.cal-task.priority-alta    { background:#ffedd5; color:#c2410c; }
.cal-task.priority-media   { background:#dbeafe; color:#1d4ed8; }
.cal-task.priority-baja    { background:#dcfce7; color:#15803d; }
.cal-task-more { font-size:10px; color:var(--gray-500); padding:1px 4px; }
```

- [ ] **Step 2: Agregar el tab button de Calendario en `renderProjectContent()`**

En `renderProjectContent()` (línea ~147), localizar el bloque de tabs:

```html
<div class="tabs">
  <button class="tab-btn active" onclick="switchTab('tabTasks', this)">📋 Tareas (${totalTasks})</button>
  <button class="tab-btn" onclick="switchTab('tabKanban', this); renderKanban()">📌 Kanban</button>
  <button class="tab-btn" onclick="switchTab('tabPlanning', this); renderPlanning()">📅 Planificación</button>
  <button class="tab-btn" onclick="switchTab('tabComments', this); loadProjectComments(${project.id})">💬 Comentarios</button>
  <button class="tab-btn" onclick="switchTab('tabObservations', this); loadObservations(${project.id})">📝 Observaciones</button>
</div>
```

Reemplazarlo con (agrega Calendario después de Kanban):

```html
<div class="tabs">
  <button class="tab-btn active" onclick="switchTab('tabTasks', this)">📋 Tareas (${totalTasks})</button>
  <button class="tab-btn" onclick="switchTab('tabKanban', this); renderKanban()">📌 Kanban</button>
  <button class="tab-btn" onclick="switchTab('tabCalendar', this); renderCalendar()">🗓️ Calendario</button>
  <button class="tab-btn" onclick="switchTab('tabPlanning', this); renderPlanning()">📅 Planificación</button>
  <button class="tab-btn" onclick="switchTab('tabComments', this); loadProjectComments(${project.id})">💬 Comentarios</button>
  <button class="tab-btn" onclick="switchTab('tabObservations', this); loadObservations(${project.id})">📝 Observaciones</button>
</div>
```

- [ ] **Step 3: Agregar el div contenedor `tabCalendar`**

En el mismo `renderProjectContent()`, después del div `tabKanban` y antes del div `tabPlanning`:

```html
<!-- Kanban tab (ya existe) -->
<div class="tab-pane" id="tabKanban">
  <div id="kanbanBoard" class="kanban-board"></div>
</div>

<!-- Calendar tab — AGREGAR ESTO -->
<div class="tab-pane" id="tabCalendar">
  <div id="calendarContent"></div>
</div>

<!-- Planning tab (ya existe) -->
<div class="tab-pane" id="tabPlanning">
```

- [ ] **Step 4: Agregar la función `renderCalendar()` en project.js**

Después de `renderPlanning()`, agregar:

```javascript
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
          title="${escHtml(t.title)} — ${statusLabel(t.status)}">
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
```

- [ ] **Step 5: Exponer `renderCalendar` y `navCalendar` como globals al final de project.js**

Al final de `project.js`, donde están los `window.xxx = xxx`:

```javascript
window.renderCalendar = renderCalendar;
window.navCalendar = navCalendar;
```

- [ ] **Step 6: Verificar en el navegador**

1. Entrar a un proyecto → click en tab "🗓️ Calendario"
2. Verificar que muestra la grilla mensual con el mes actual
3. Si hay tareas con `due_date`, verificar que aparecen en el día correcto con el color de prioridad
4. Click en ‹/› para navegar meses
5. Click en una tarea para ir al detalle

- [ ] **Step 7: Commit**

```bash
git add public/js/views/project.js public/css/style.css
git commit -m "feat: calendario mensual de tareas con navegación por mes"
```

---

### Task 3: Tab de Métricas con Chart.js

**Files:**
- Modify: `public/index.html` — agregar Chart.js CDN
- Modify: `public/js/views/project.js` — agregar tab button, div contenedor, `renderMetrics()`
- Modify: `public/css/style.css` — altura de canvas y grid de métricas

- [ ] **Step 1: Agregar Chart.js en index.html**

Abrir `public/index.html` y agregar antes del cierre de `</body>`:

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
```

- [ ] **Step 2: Agregar estilos de métricas en style.css**

Agregar al final de `public/css/style.css`:

```css
/* ── Métricas / Charts ───────────────────────────────────────── */
.chart-canvas-wrap { position:relative; height:220px; }
.activity-item { display:flex; gap:10px; align-items:flex-start; padding:8px 0; border-bottom:1px solid var(--gray-100); }
.activity-item:last-child { border-bottom:none; }
```

- [ ] **Step 3: Agregar tab button de Métricas en `renderProjectContent()`**

En el bloque de tabs (ya actualizado en Task 2), agregar Métricas al final:

```html
<div class="tabs">
  <button class="tab-btn active" onclick="switchTab('tabTasks', this)">📋 Tareas (${totalTasks})</button>
  <button class="tab-btn" onclick="switchTab('tabKanban', this); renderKanban()">📌 Kanban</button>
  <button class="tab-btn" onclick="switchTab('tabCalendar', this); renderCalendar()">🗓️ Calendario</button>
  <button class="tab-btn" onclick="switchTab('tabPlanning', this); renderPlanning()">📅 Planificación</button>
  <button class="tab-btn" onclick="switchTab('tabMetrics', this); renderMetrics(${project.id})">📊 Métricas</button>
  <button class="tab-btn" onclick="switchTab('tabComments', this); loadProjectComments(${project.id})">💬 Comentarios</button>
  <button class="tab-btn" onclick="switchTab('tabObservations', this); loadObservations(${project.id})">📝 Observaciones</button>
</div>
```

- [ ] **Step 4: Agregar div contenedor `tabMetrics`**

Después del div `tabCalendar` y antes del div `tabPlanning`:

```html
<!-- Metrics tab — AGREGAR ESTO -->
<div class="tab-pane" id="tabMetrics">
  <div id="metricsContent"></div>
</div>
```

- [ ] **Step 5: Agregar función `renderMetrics()` en project.js**

Después de `renderCalendar()` (y `navCalendar`), agregar:

```javascript
async function renderMetrics(projectId) {
  const container = document.getElementById('metricsContent');
  if (!container) return;
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

    // Donut: tareas por estado
    const sd = stats.tasksByStatus || [];
    new Chart(document.getElementById('chartStatus'), {
      type: 'doughnut',
      data: {
        labels: sd.map(s => statusLabel(s.status)),
        datasets: [{ data: sd.map(s => s.count), backgroundColor: sd.map(s => statusColors[s.status] || '#6b7280'), borderWidth: 2 }]
      },
      options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } }, maintainAspectRatio: false }
    });

    // Bar: tareas por prioridad
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

    // Bar: horas estimadas vs registradas
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

    // Lista de actividad reciente
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
    container.innerHTML = `<div class="empty-state"><p class="text-danger">${err.message}</p></div>`;
  }
}
```

- [ ] **Step 6: Exponer `renderMetrics` como global al final de project.js**

```javascript
window.renderMetrics = renderMetrics;
```

- [ ] **Step 7: Verificar en el navegador**

1. Entrar a un proyecto → click en tab "📊 Métricas"
2. Verificar que carga los 3 gráficos sin errores en consola
3. Verificar que la lista de actividad reciente muestra eventos o "Sin actividad reciente"
4. Verificar que los gráficos son responsivos (redimensionar ventana)

- [ ] **Step 8: Commit**

```bash
git add public/index.html public/js/views/project.js public/css/style.css
git commit -m "feat: tab de métricas con gráficas Chart.js — estados, prioridades, horas y actividad"
```
