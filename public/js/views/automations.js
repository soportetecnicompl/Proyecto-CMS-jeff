async function renderAutomations() {
  const app = document.getElementById('app');
  app.innerHTML = renderAppShell('automatizaciones', `
    <div class="page-header">
      <div class="page-header-left">
        <h1>⚡ Automatizaciones</h1>
      </div>
      <button class="btn btn-primary" onclick="openCreateAutomation()">+ Nueva Automatización</button>
    </div>
    <div class="page-body">
      <div class="card mb-4">
        <div class="card-body">
          <h3 style="font-size:15px; font-weight:600; margin-bottom:8px">¿Qué son las automatizaciones?</h3>
          <p class="text-sm text-gray">Las automatizaciones te permiten generar tareas, actualizar estados, o agregar comentarios de forma automática o con un clic. Puedes configurar cuándo se activan y qué acción realizan.</p>
        </div>
      </div>
      <div id="automationsList">
        <div class="loading-overlay"><div class="spinner"></div></div>
      </div>
    </div>
  `);

  await loadAutomations();
}

async function loadAutomations() {
  try {
    const automations = await api.getAutomations();
    const container = document.getElementById('automationsList');

    if (!automations.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="icon">⚡</div>
          <h3>Sin automatizaciones</h3>
          <p>Crea tu primera automatización para agilizar tu flujo de trabajo.</p>
          <button class="btn btn-primary" onclick="openCreateAutomation()">+ Crear Automatización</button>
        </div>
      `;
      return;
    }

    const triggerLabels = {
      manual: '🖱️ Manual',
      task_completed: '✅ Tarea completada',
      project_status: '📊 Cambio de estado',
      due_date: '📅 Fecha de vencimiento'
    };
    const actionLabels = {
      create_task: '📋 Crear tarea',
      send_email: '📧 Enviar email',
      update_status: '🔄 Actualizar estado',
      add_comment: '💬 Agregar comentario'
    };

    container.innerHTML = automations.map(a => `
      <div class="automation-card">
        <div class="automation-card-header">
          <div>
            <div class="flex items-center gap-2">
              <div class="automation-name">${escHtml(a.name)}</div>
              <label class="toggle">
                <input type="checkbox" ${a.is_active ? 'checked' : ''}
                  onchange="toggleAutomation(${a.id}, this.checked)">
                <span class="toggle-slider"></span>
              </label>
            </div>
            ${a.description ? `<div class="automation-desc">${escHtml(a.description)}</div>` : ''}
          </div>
          <div class="flex gap-2">
            <button class="btn btn-primary btn-sm" onclick="runAutomation(${a.id})" ${!a.is_active ? 'disabled' : ''}>
              ▶ Ejecutar
            </button>
            <button class="btn btn-secondary btn-sm" onclick="openEditAutomation(${a.id})">✏️</button>
            <button class="btn btn-danger btn-sm" onclick="deleteAutomation(${a.id})">🗑️</button>
          </div>
        </div>
        <div class="automation-meta">
          <span>🏢 ${escHtml(a.company_name || 'Todas las empresas')}</span>
          ${a.project_name ? `<span>📁 ${escHtml(a.project_name)}</span>` : ''}
          <span>⚡ Disparador: ${triggerLabels[a.trigger_type] || a.trigger_type}</span>
          <span>🎯 Acción: ${actionLabels[a.action_type] || a.action_type}</span>
          ${a.run_count ? `<span>🔄 Ejecuciones: ${a.run_count}</span>` : ''}
          ${a.last_run_at ? `<span>🕒 Última ejecución: ${timeAgo(a.last_run_at)}</span>` : ''}
        </div>
        ${renderAutomationPreview(a)}
      </div>
    `).join('');
  } catch (err) { toast(err.message, 'error'); }
}

function renderAutomationPreview(a) {
  const config = a.action_config || {};
  if (a.action_type === 'create_task' && config.title) {
    return `<div style="margin-top:10px; background:var(--gray-50); padding:10px 14px; border-radius:8px; font-size:12px">
      <strong>Creará tarea:</strong> ${escHtml(config.title)}
      ${config.priority ? `· Prioridad: ${config.priority}` : ''}
      ${config.estimated_hours ? `· ${config.estimated_hours}h` : ''}
    </div>`;
  }
  if (a.action_type === 'update_status' && config.status) {
    return `<div style="margin-top:10px; background:var(--gray-50); padding:10px 14px; border-radius:8px; font-size:12px">
      <strong>Actualizará estado a:</strong> ${statusLabel(config.status)}
    </div>`;
  }
  if (a.action_type === 'add_comment' && config.content) {
    return `<div style="margin-top:10px; background:var(--gray-50); padding:10px 14px; border-radius:8px; font-size:12px">
      <strong>Comentario:</strong> ${escHtml(config.content.substring(0, 80))}${config.content.length > 80 ? '...' : ''}
    </div>`;
  }
  return '';
}

async function openCreateAutomation() {
  let companies = [];
  let projects = [];
  try {
    companies = await api.getCompanies();
  } catch {}

  const actionFields = `
    <div id="actionConfig"></div>
  `;

  createModal({
    id: 'modalCreateAuto',
    title: 'Nueva Automatización',
    size: 'modal-lg',
    body: `
      <div id="caError" class="form-error hidden"></div>
      <div class="form-group">
        <label class="form-label">Nombre *</label>
        <input class="form-control" id="caName" placeholder="Nombre de la automatización">
      </div>
      <div class="form-group">
        <label class="form-label">Descripción</label>
        <input class="form-control" id="caDesc" placeholder="Describe qué hace esta automatización">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Empresa</label>
          <select class="form-control" id="caCompany" onchange="loadProjectsForAuto(this.value)">
            <option value="">Todas</option>
            ${companies.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Proyecto</label>
          <select class="form-control" id="caProject">
            <option value="">Todos</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Disparador (¿cuándo se activa?)</label>
          <select class="form-control" id="caTrigger">
            <option value="manual">🖱️ Manual (ejecutar con botón)</option>
            <option value="task_completed">✅ Cuando una tarea se completa</option>
            <option value="project_status">📊 Cuando cambia el estado del proyecto</option>
            <option value="due_date">📅 Cuando vence una fecha</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Acción (¿qué hace?)</label>
          <select class="form-control" id="caAction" onchange="renderActionConfig()">
            <option value="create_task">📋 Crear tarea</option>
            <option value="update_status">🔄 Actualizar estado del proyecto</option>
            <option value="add_comment">💬 Agregar comentario</option>
          </select>
        </div>
      </div>
      <div id="actionConfigContainer">
        <hr style="border:none;border-top:1px solid var(--gray-200);margin:16px 0">
        <h4 class="text-sm font-semibold mb-3">Configuración de la acción</h4>
        <div id="actionConfig"></div>
      </div>
    `,
    footer: `
      <button class="btn btn-secondary" onclick="hideModal('modalCreateAuto')">Cancelar</button>
      <button class="btn btn-primary" onclick="submitCreateAutomation()">Crear</button>
    `
  });

  showModal('modalCreateAuto');
  renderActionConfig();
}

window.loadProjectsForAuto = async function(companyId) {
  const sel = document.getElementById('caProject');
  sel.innerHTML = '<option value="">Todos</option>';
  if (!companyId) return;
  try {
    const projects = await api.getProjects(companyId);
    projects.forEach(p => {
      sel.innerHTML += `<option value="${p.id}">${escHtml(p.name)}</option>`;
    });
  } catch {}
};

window.renderActionConfig = function() {
  const action = document.getElementById('caAction')?.value;
  const container = document.getElementById('actionConfig');
  if (!container) return;

  if (action === 'create_task') {
    container.innerHTML = `
      <div class="form-group">
        <label class="form-label">Título de la tarea *</label>
        <input class="form-control" id="acTaskTitle" placeholder="Título que tendrá la tarea creada">
      </div>
      <div class="form-group">
        <label class="form-label">Descripción</label>
        <textarea class="form-control" id="acTaskDesc" rows="2" placeholder="Descripción de la tarea"></textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Estado inicial</label>
          <select class="form-control" id="acTaskStatus">
            <option value="pendiente">Pendiente</option>
            <option value="en_progreso">En progreso</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Prioridad</label>
          <select class="form-control" id="acTaskPriority">
            <option value="baja">Baja</option>
            <option value="media" selected>Media</option>
            <option value="alta">Alta</option>
            <option value="critica">Crítica</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Horas estimadas</label>
        <input class="form-control" id="acTaskHours" type="number" step="0.5" placeholder="0.0">
      </div>
    `;
  } else if (action === 'update_status') {
    container.innerHTML = `
      <div class="form-group">
        <label class="form-label">Nuevo estado del proyecto</label>
        <select class="form-control" id="acNewStatus">
          <option value="activo">Activo</option>
          <option value="en_espera">En espera</option>
          <option value="completado">Completado</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </div>
    `;
  } else if (action === 'add_comment') {
    container.innerHTML = `
      <div class="form-group">
        <label class="form-label">Contenido del comentario *</label>
        <textarea class="form-control" id="acCommentContent" rows="3" placeholder="Texto del comentario automático"></textarea>
      </div>
    `;
  }
};

window.submitCreateAutomation = async function() {
  const name = document.getElementById('caName').value.trim();
  const action = document.getElementById('caAction').value;
  const errEl = document.getElementById('caError');

  if (!name) { errEl.textContent = 'El nombre es requerido'; errEl.classList.remove('hidden'); return; }

  let actionConfig = {};
  if (action === 'create_task') {
    const title = document.getElementById('acTaskTitle')?.value.trim();
    if (!title) { errEl.textContent = 'El título de la tarea es requerido'; errEl.classList.remove('hidden'); return; }
    const projectId = document.getElementById('caProject').value;
    actionConfig = {
      title,
      description: document.getElementById('acTaskDesc')?.value.trim() || null,
      status: document.getElementById('acTaskStatus')?.value || 'pendiente',
      priority: document.getElementById('acTaskPriority')?.value || 'media',
      estimated_hours: document.getElementById('acTaskHours')?.value || null,
      project_id: projectId || null,
    };
  } else if (action === 'update_status') {
    actionConfig = { status: document.getElementById('acNewStatus')?.value };
    const projectId = document.getElementById('caProject').value;
    if (projectId) actionConfig.project_id = projectId;
  } else if (action === 'add_comment') {
    const content = document.getElementById('acCommentContent')?.value.trim();
    if (!content) { errEl.textContent = 'El contenido del comentario es requerido'; errEl.classList.remove('hidden'); return; }
    const projectId = document.getElementById('caProject').value;
    actionConfig = { content, entity_type: 'project', entity_id: projectId };
  }

  try {
    await api.createAutomation({
      name,
      description: document.getElementById('caDesc').value.trim() || null,
      company_id: document.getElementById('caCompany').value || null,
      project_id: document.getElementById('caProject').value || null,
      trigger_type: document.getElementById('caTrigger').value,
      action_type: action,
      action_config: actionConfig,
    });
    hideModal('modalCreateAuto');
    toast('Automatización creada', 'success');
    await loadAutomations();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
};

window.runAutomation = async function(id) {
  try {
    const result = await api.runAutomation(id);
    toast(`✅ ${result.message || 'Automatización ejecutada'}`, 'success');
    await loadAutomations();
  } catch (err) { toast(err.message, 'error'); }
};

window.toggleAutomation = async function(id, active) {
  try {
    await api.updateAutomation(id, { is_active: active });
    toast(active ? 'Automatización activada' : 'Automatización desactivada', 'success');
  } catch (err) { toast(err.message, 'error'); }
};

window.deleteAutomation = function(id) {
  confirm('¿Eliminar esta automatización?', async () => {
    try {
      await api.deleteAutomation(id);
      toast('Automatización eliminada', 'success');
      await loadAutomations();
    } catch (err) { toast(err.message, 'error'); }
  });
};

window.openEditAutomation = async function(id) {
  try {
    const a = await api.getAutomation(id);
    const companies = await api.getCompanies();

    createModal({
      id: 'modalEditAuto',
      title: 'Editar Automatización',
      size: 'modal-lg',
      body: `
        <div id="eaError" class="form-error hidden"></div>
        <div class="form-group">
          <label class="form-label">Nombre *</label>
          <input class="form-control" id="eaName" value="${escHtml(a.name)}">
        </div>
        <div class="form-group">
          <label class="form-label">Descripción</label>
          <input class="form-control" id="eaDesc" value="${escHtml(a.description || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Estado</label>
          <label class="toggle" style="display:inline-flex; align-items:center; gap:8px">
            <input type="checkbox" id="eaActive" ${a.is_active ? 'checked' : ''}>
            <span class="toggle-slider"></span>
            <span class="text-sm ml-2">Activa</span>
          </label>
        </div>

        ${a.logs && a.logs.length ? `
          <div>
            <h4 class="text-sm font-semibold mb-2">Últimas ejecuciones</h4>
            <div class="card" style="max-height:200px;overflow-y:auto">
              <table class="data-table">
                <thead><tr><th>Estado</th><th>Resultado</th><th>Fecha</th></tr></thead>
                <tbody>
                  ${a.logs.map(l => `
                    <tr>
                      <td><span class="badge ${l.status==='success'?'badge-green':'badge-red'}">${l.status}</span></td>
                      <td class="text-sm">${escHtml(l.result ? JSON.parse(l.result).message || l.result : '—')}</td>
                      <td class="text-sm text-gray">${timeAgo(l.created_at)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : ''}
      `,
      footer: `
        <button class="btn btn-secondary" onclick="hideModal('modalEditAuto')">Cerrar</button>
        <button class="btn btn-primary" onclick="submitEditAutomation(${id})">Guardar</button>
      `
    });
    showModal('modalEditAuto');
  } catch (err) { toast(err.message, 'error'); }
};

window.submitEditAutomation = async function(id) {
  const name = document.getElementById('eaName').value.trim();
  const errEl = document.getElementById('eaError');
  if (!name) { errEl.textContent = 'El nombre es requerido'; errEl.classList.remove('hidden'); return; }

  try {
    await api.updateAutomation(id, {
      name,
      description: document.getElementById('eaDesc').value.trim() || null,
      is_active: document.getElementById('eaActive').checked,
    });
    hideModal('modalEditAuto');
    toast('Automatización actualizada', 'success');
    await loadAutomations();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
};

window.openCreateAutomation = openCreateAutomation;


