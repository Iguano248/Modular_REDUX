// ============================================================
// PANEL DEL NUTRIOLOGO — Logica Principal
// ============================================================
// Archivo modular organizado por secciones:
//   1. Navegacion y utilidades globales
//   2. Pacientes
//   3. Agenda de Citas
//   4. Seguimiento de Peso
//   5. Planes Alimenticios (Dietas)
//   6. Recomendacion con IA
//   7. Historial Clinico
// ============================================================

let pacientesCacheN = [];
let graficaPesoN = null;
let panelInicializadoN = false;

// 🔐 Auth guard — controla la inicialización
(async function() {
  if (await verificarSesion()) {
    $('loginOverlay').style.display = 'none';
    inicializarPanelN();
  } else {
    $('loginOverlay').style.display = 'flex';
  }
})();

async function doLogin() {
  const user = $('loginUser').value.trim();
  const pass = $('loginPass').value;
  if (!user || !pass) { mostrarToast('Ingrese usuario y contraseña', 'warning'); return; }
  try {
    const res = await fetch(API_BASE + '/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass })
    });
    const data = await res.json();
    if (!res.ok) { mostrarToast(data.error || 'Error de autenticación', 'error'); return; }
    setToken(data.token);
    $('loginOverlay').style.display = 'none';
    $('loginUser').value = '';
    $('loginPass').value = '';
    await inicializarPanelN();
  } catch (err) {
    mostrarToast('Error de conexión', 'error');
  }
}

// Inicializa el panel: carga pacientes, llena selects y registra eventos.
// Se ejecuta una sola vez (con sesión válida o tras iniciar sesión).
async function inicializarPanelN() {
  if (panelInicializadoN) return;
  panelInicializadoN = true;

  await cargarListaPacientesN();

  // Poblar todos los selects con la lista de pacientes
  poblarSelectPacientes('selPacienteCitaN', true);
  poblarSelectPacientes('selPacientePesoN', false);
  poblarSelectPacientes('selPacienteDietaN', false);
  poblarSelectPacientes('selPacienteIAN', false);
  poblarSelectPacientes('selPacienteHistorialN', false);
  poblarSelectPacientes('citaN-paciente', false);
  poblarSelectPacientes('dietaN-paciente', false);

  // Auto-calcular IMC en modal de citas
  configurarAutoIMCN();

  // Cargar vista inicial (Pacientes)
  renderizarPacientesN(pacientesCacheN);

  // Cerrar modales al hacer clic fuera
  $('modalCitaN').addEventListener('click', (e) => {
    if (e.target === $('modalCitaN')) cerrarModalCitaN();
  });
  $('modalDietaN').addEventListener('click', (e) => {
    if (e.target === $('modalDietaN')) cerrarModalDietaN();
  });

  // Cerrar sidebar en mobile al hacer clic fuera
  document.addEventListener('click', (e) => {
    const sidebar = $('sidebar');
    const toggle = $('sidebarToggle');
    if (!sidebar || !toggle) return;
    if (!sidebar.contains(e.target) && !toggle.contains(e.target)) {
      sidebar.classList.remove('open');
    }
  });
}

// ============================================================
// 1. NAVEGACION Y UTILIDADES GLOBALES
// ============================================================

function navegarA(seccion) {
  document.querySelectorAll('.content-section').forEach(s => {
    s.style.display = 'none';
    s.classList.remove('active');
  });

  const target = document.getElementById('sec-' + seccion);
  if (target) {
    target.style.display = 'block';
    target.classList.add('active');
  }

  document.querySelectorAll('.sidebar-item[data-seccion]').forEach(item => {
    item.classList.toggle('active', item.dataset.seccion === seccion);
  });

  document.getElementById('sidebar').classList.remove('open');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function cerrarSesionNutriologo() {
  const token = getToken();
  if (token) fetch(`${API_BASE}/logout?token=${encodeURIComponent(token)}`);
  clearToken();
  window.location.href = 'home.html';
}

// Mostrar error flotante (legacy — usa toast ahora)
function mostrarErrorN(msg) {
  mostrarToast(msg, 'error');
}



// ============================================================
// CARGAR LISTA DE PACIENTES (compartida entre secciones)
// ============================================================
async function cargarListaPacientesN() {
  try {
    const res = await fetchWithAuth(`${API_BASE}/usuarios?all=true`);
    if (!res.ok) throw new Error('Error del servidor');
    pacientesCacheN = await res.json();
    return pacientesCacheN;
  } catch (err) {
    console.error('Error al cargar pacientes:', err);
    return [];
  }
}

// Poblar un select con la lista de pacientes
function poblarSelectPacientes(selectId, incluirTodos) {
  const sel = $(selectId);
  if (!sel) return;
  sel.innerHTML = incluirTodos
    ? '<option value="">Todos los pacientes</option>'
    : '<option value="">Seleccionar paciente...</option>';
  pacientesCacheN.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.nombre} (ID: ${p.id})`;
    sel.appendChild(opt);
  });
}

// ============================================================
// 2. PACIENTES
// ============================================================

function renderizarPacientesN(pacientes) {
  const tbody = $('cuerpoPacientesN');
  if (!tbody) return;

  if (!pacientes || pacientes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="loading-msg">No se encontraron pacientes</td></tr>';
    return;
  }

  tbody.innerHTML = pacientes.map(p => `
    <tr>
      <td>${p.id}</td>
      <td>${escapeHTML(p.nombre)}</td>
      <td>${p.edad}</td>
      <td>${p.peso}</td>
      <td>${p.estatura}</td>
      <td>${escapeHTML(p.actividad)}</td>
      <td>${escapeHTML(p.patologias || 'Ninguna')}</td>
      <td>${escapeHTML(p.objetivo)}</td>
    </tr>
  `).join('');
}

async function cargarPacientesN() {
  const tbody = $('cuerpoPacientesN');
  tbody.innerHTML = '<tr><td colspan="8" class="loading-msg">Cargando pacientes...</td></tr>';
  try {
    const pacientes = await fetchPaginated(`${API_BASE}/usuarios`, 'pagPacientesN');
    renderizarPacientesN(pacientes);
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="8" class="loading-msg">Error al cargar pacientes</td></tr>';
  }
  renderPaginacion('pagPacientesN', 'pagPacientesN', cargarPacientesN);
}

async function buscarPacientesN() {
  const q = $('buscadorPacientesN').value.trim();
  const tbody = $('cuerpoPacientesN');

  if (!q) {
    cargarPacientesN();
    return;
  }

  tbody.innerHTML = '<tr><td colspan="8" class="loading-msg">Buscando...</td></tr>';
  crearPagState('pagPacientesN');
  try {
    const pacientes = await fetchPaginatedWithQuery(`${API_BASE}/usuarios/buscar`, 'pagPacientesN', q);
    renderizarPacientesN(pacientes);
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="8" class="loading-msg">Error en la busqueda</td></tr>';
  }
  renderPaginacion('pagPacientesN', 'pagPacientesN', () => { buscarPacientesN(); });
}

// ============================================================
// 3. AGENDA DE CITAS
// ============================================================

function renderizarCitasN(citas) {
  const tbody = $('cuerpoCitasN');
  if (!tbody) return;

  if (!citas || citas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="loading-msg">No hay citas registradas</td></tr>';
    return;
  }

  tbody.innerHTML = citas.map(c => `
    <tr>
      <td>${c.fecha || '-'}</td>
      <td>${c.hora || '-'}</td>
      <td>${c.peso != null ? c.peso + ' kg' : '-'}</td>
      <td>${c.imc != null ? c.imc.toFixed(1) : '-'}</td>
      <td><span class="estado-badge estado-${(c.estado || 'programada').toLowerCase()}">${escapeHTML(c.estado || 'Programada')}</span></td>
      <td>${escapeHTML(c.motivo || '-')}</td>
      <td class="obs-cell">${escapeHTML(c.observaciones || '-')}</td>
      <td class="acciones-cell">
        <button onclick="editarCitaN(${c.id})" class="btn-accion btn-editar">Editar</button>
        <button onclick="eliminarCitaN(${c.id})" class="btn-accion btn-eliminar">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

async function cargarCitasN(pacienteId) {
  const tbody = $('cuerpoCitasN');
  tbody.innerHTML = '<tr><td colspan="8" class="loading-msg">Cargando citas...</td></tr>';

  try {
    const pid = pacienteId || $('selPacienteCitaN').value;
    const url = pid ? `${API_BASE}/nutricion/citas/${pid}` : `${API_BASE}/nutricion/citas`;
    const citas = await fetchPaginatedWithId(url, 'pagCitasN');
    renderizarCitasN(citas);
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="8" class="loading-msg">Error al cargar citas</td></tr>';
  }
  renderPaginacion('pagCitasN', 'pagCitasN', () => { cargarCitasN(); });
}

function filtrarCitasN() {
  crearPagState('pagCitasN');
  cargarCitasN();
}

// --- Modal de citas ---
function configurarAutoIMCN() {
  const peso = $('citaN-peso');
  const estatura = $('citaN-estatura');
  const imc = $('citaN-imc');

  function calcular() {
    const p = parseFloat(peso.value);
    let e = parseFloat(estatura.value);
    if (isNaN(p) || isNaN(e) || p <= 0 || e <= 0) return;
    if (e > 3) e = e / 100;
    imc.value = (p / (e * e)).toFixed(1);
  }

  if (peso && estatura && imc) {
    peso.addEventListener('input', calcular);
    estatura.addEventListener('input', calcular);
  }
}

function abrirModalCitaNutri() {
  $('citaN-id').value = '';
  $('citaN-paciente').value = $('selPacienteCitaN') ? $('selPacienteCitaN').value : '';
  $('citaN-fecha').value = new Date().toISOString().split('T')[0];
  $('citaN-hora').value = '';
  $('citaN-motivo').value = '';
  $('citaN-observaciones').value = '';
  $('citaN-peso').value = '';
  $('citaN-estatura').value = '';
  $('citaN-imc').value = '';
  $('citaN-estado').value = 'Programada';
  $('modalCitaNTitulo').textContent = 'Nueva Cita de Nutricion';
  $('modalCitaN').style.display = 'flex';
}

async function editarCitaN(id) {
  try {
    const res = await fetchWithAuth(`${API_BASE}/nutricion/cita/${id}`);
    if (!res.ok) throw new Error('Error al obtener cita');
    const c = await res.json();
    if (!c || c.error) { mostrarToast('Cita no encontrada', 'error'); return; }

    $('citaN-id').value = c.id;
    $('citaN-paciente').value = c.paciente_id;
    $('citaN-fecha').value = c.fecha || '';
    $('citaN-hora').value = c.hora || '';
    $('citaN-motivo').value = c.motivo || '';
    $('citaN-observaciones').value = c.observaciones || '';
    $('citaN-peso').value = c.peso != null ? c.peso : '';
    $('citaN-estatura').value = '';
    $('citaN-imc').value = c.imc != null ? c.imc : '';
    $('citaN-estado').value = c.estado || 'Programada';
    $('modalCitaNTitulo').textContent = 'Editar Cita de Nutricion';
    $('modalCitaN').style.display = 'flex';
    // recalcular IMC si hay peso pero falta IMC
    if (c.peso != null && c.peso > 0 && !c.imc) {
      $('citaN-peso').dispatchEvent(new Event('input'));
    }
  } catch (err) {
    mostrarToast('Error al cargar datos de la cita', 'error');
  }
}

async function guardarCitaN(event) {
  event.preventDefault();
  const id = $('citaN-id').value;
  const datos = {
    paciente_id: parseInt($('citaN-paciente').value),
    fecha: $('citaN-fecha').value,
    hora: $('citaN-hora').value.trim(),
    motivo: $('citaN-motivo').value.trim(),
    observaciones: $('citaN-observaciones').value.trim(),
    peso: $('citaN-peso').value ? parseFloat($('citaN-peso').value) : null,
    imc: $('citaN-imc').value ? parseFloat($('citaN-imc').value) : null,
    estado: $('citaN-estado').value
  };

  if (!datos.paciente_id || !datos.fecha) {
    mostrarToast('Paciente y fecha son obligatorios', 'warning');
    return;
  }

  await withLoading(document.querySelector('#formCitaN .btn-guardar'), 'Guardando...', async () => {
    const esEdicion = id !== '';
    const url = esEdicion ? `${API_BASE}/nutricion/citas/${id}` : `${API_BASE}/nutricion/citas`;
    const method = esEdicion ? 'PUT' : 'POST';

    const res = await fetchWithAuth(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos)
    });

    const resultado = await res.json();
    if (resultado.error) { throw new Error(resultado.error); }

    cerrarModalCitaN();
    cargarCitasN();
  }).catch(err => {
    mostrarToast(err.message || 'Error al guardar la cita', 'error');
  });
}

async function eliminarCitaN(id) {
  const ok = await mostrarConfirm('¿Esta seguro de eliminar esta cita?\nEsta accion no se puede deshacer.');
  if (!ok) return;

  try {
    const res = await fetchWithAuth(`${API_BASE}/nutricion/citas/${id}`, { method: 'DELETE' });
    const resultado = await res.json();
    if (!res.ok || resultado.error) throw new Error(resultado.error || 'Error al eliminar');
    mostrarToast('Cita eliminada correctamente', 'success');
    cargarCitasN();
  } catch (err) {
    mostrarToast(err.message || 'Error al eliminar la cita', 'error');
  }
}

function cerrarModalCitaN() {
  $('modalCitaN').style.display = 'none';
}

// ============================================================
// 4. SEGUIMIENTO DE PESO
// ============================================================

function ocultarResumenPesoN() {
  $('resumenProgresoN').style.display = 'none';
  $('msgSinProgresoN').style.display = 'none';
  $('tablaProgresoWrapperN').style.display = 'none';
  $('graficaProgresoWrapperN').style.display = 'none';
}

function renderizarGraficaPesoN(historial) {
  if (graficaPesoN) {
    graficaPesoN.destroy();
    graficaPesoN = null;
  }

  const canvas = $('graficaPesoN');
  if (!canvas || !historial || historial.length === 0) {
    $('graficaProgresoWrapperN').style.display = 'none';
    return;
  }

  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  const etiquetas = historial.map(item => {
    const parts = item.fecha.split('-');
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.getDate() + ' ' + meses[d.getMonth()];
  });

  const pesos = historial.map(item => item.peso);

  $('graficaProgresoWrapperN').style.display = 'block';

  graficaPesoN = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: etiquetas,
      datasets: [{
        label: 'Peso (kg)',
        data: pesos,
        borderColor: '#00d4ff',
        backgroundColor: 'rgba(0, 212, 255, 0.1)',
        borderWidth: 2.5,
        pointBackgroundColor: '#00d4ff',
        pointBorderColor: '#141414',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 8,
        fill: true,
        tension: 0.35
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#141414',
          titleColor: '#00d4ff',
          bodyColor: '#e0e0e0',
          borderColor: '#1a3a3a',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: ctx => ctx.parsed.y + ' kg'
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Fecha', color: '#888', font: { size: 13 } },
          ticks: { color: '#888', font: { size: 12 } },
          grid: { color: '#1a1a1a' }
        },
        y: {
          title: { display: true, text: 'Peso (kg)', color: '#888', font: { size: 13 } },
          ticks: { color: '#888', font: { size: 12 } },
          grid: { color: '#1a1a1a' },
          beginAtZero: false
        }
      }
    }
  });
}

async function cargarProgresoN() {
  const pacienteId = $('selPacientePesoN').value;
  ocultarResumenPesoN();

  if (!pacienteId) return;

  cargarRegistrosPesoN(pacienteId);

  $('cuerpoProgresoN').innerHTML = '<tr><td colspan="4" class="loading-msg">Cargando progreso...</td></tr>';
  $('tablaProgresoWrapperN').style.display = 'block';

  try {
    const res = await fetchWithAuth(`${API_BASE}/progreso/${pacienteId}`);
    if (!res.ok) throw new Error('Error del servidor');
    const datos = await res.json();

    if (!datos.historial || datos.historial.length === 0) {
      ocultarResumenPesoN();
      $('msgSinProgresoN').style.display = 'block';
      return;
    }

    // Renderizar resumen
    $('progNNombre').textContent = datos.paciente ? datos.paciente.nombre : '-';
    $('progNPesoInicial').textContent = datos.pesoInicial != null ? `${datos.pesoInicial} kg` : '-';
    $('progNPesoActual').textContent = datos.pesoActual != null ? `${datos.pesoActual} kg` : '-';

    if (datos.cambioPeso != null) {
      const signo = datos.cambioPeso > 0 ? '+' : '';
      $('progNCambio').textContent = `${signo}${datos.cambioPeso} kg`;
      $('progNCambio').className = 'resumen-valor ' +
        (datos.cambioPeso < 0 ? 'cambio-negativo' : datos.cambioPeso > 0 ? 'cambio-positivo' : '');
    } else {
      $('progNCambio').textContent = '-';
    }

    $('progNImcInicial').textContent = datos.imcInicial != null ? datos.imcInicial.toFixed(1) : '-';
    $('progNImcActual').textContent = datos.imcActual != null ? datos.imcActual.toFixed(1) : '-';

    // Peso Ideal
    $('progNPesoIdeal').textContent = datos.pesoIdeal != null ? `${datos.pesoIdeal} kg` : '-';

    // Diferencia al Ideal
    if (datos.diferenciaIdeal != null) {
      const dif = datos.diferenciaIdeal;
      const signo = dif > 0 ? '+' : '';
      $('progNDiferenciaIdeal').textContent = `${signo}${dif} kg`;
      $('progNDiferenciaIdeal').className = 'resumen-valor ' +
        (dif < 0 ? 'cambio-negativo' : dif > 0 ? 'cambio-positivo' : '');
    } else {
      $('progNDiferenciaIdeal').textContent = '-';
      $('progNDiferenciaIdeal').className = 'resumen-valor';
    }

    $('resumenProgresoN').style.display = 'grid';

    // Renderizar tabla
    $('cuerpoProgresoN').innerHTML = datos.historial.map(item => `
      <tr>
        <td>${item.fecha || '-'}</td>
        <td>${item.peso != null ? item.peso + ' kg' : '-'}</td>
        <td>${item.imc != null ? item.imc.toFixed(1) : '-'}</td>
        <td><span class="estado-badge estado-${(item.estado || 'programada').toLowerCase()}">${escapeHTML(item.estado || 'Programada')}</span></td>
      </tr>
    `).join('');
    $('tablaProgresoWrapperN').style.display = 'block';
    renderizarGraficaPesoN(datos.historial);
  } catch (err) {
    $('cuerpoProgresoN').innerHTML = '<tr><td colspan="4" class="loading-msg">Error al cargar progreso</td></tr>';
    $('tablaProgresoWrapperN').style.display = 'block';
    renderizarGraficaPesoN([]);
  }
}

// ============================================================
// 4b. REGISTRO DE PESO INDEPENDIENTE
// ============================================================

function abrirFormPesoN() {
  const pacienteId = $('selPacientePesoN').value;
  if (!pacienteId) { mostrarToast('Selecciona un paciente primero', 'warning'); return; }
  $('pesoN-fecha').value = new Date().toISOString().split('T')[0];
  $('pesoN-peso').value = '';
  $('panelRegistroPesoN').style.display = 'block';
}

function cerrarFormPesoN() {
  $('panelRegistroPesoN').style.display = 'none';
  $('pesoN-peso').value = '';
}

async function guardarPesoN() {
  const pacienteId = $('selPacientePesoN').value;
  const fecha = $('pesoN-fecha').value;
  const peso = parseFloat($('pesoN-peso').value);

  if (!pacienteId) { mostrarToast('Selecciona un paciente primero', 'warning'); return; }
  if (!fecha) { mostrarToast('La fecha es obligatoria', 'warning'); return; }
  if (!peso || isNaN(peso) || peso <= 0) { mostrarToast('Ingresa un peso valido', 'warning'); return; }

  await withLoading(document.querySelector('#panelRegistroPesoN .btn-guardar'), 'Guardando...', async () => {
    const res = await fetchWithAuth(`${API_BASE}/peso`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paciente_id: parseInt(pacienteId), fecha, peso })
    });
    const resultado = await res.json();
    if (!res.ok || resultado.error) throw new Error(resultado.error || 'Error al registrar peso');
    mostrarToast('Peso registrado correctamente', 'success');
    cerrarFormPesoN();
    cargarProgresoN();
  }).catch(err => {
    mostrarToast(err.message || 'Error al registrar peso', 'error');
  });
}

async function cargarRegistrosPesoN(pacienteId) {
  const wrapper = $('tablaRegistrosPesoWrapperN');
  if (!pacienteId) { wrapper.style.display = 'none'; return; }

  const tbody = $('cuerpoRegistrosPesoN');
  try {
    const res = await fetchWithAuth(`${API_BASE}/peso/${pacienteId}`);
    if (!res.ok) throw new Error('Error del servidor');
    const registros = await res.json();

    if (!registros || registros.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="loading-msg">No hay registros de peso independientes</td></tr>';
      wrapper.style.display = 'none';
      return;
    }

    tbody.innerHTML = registros.map(r => `
      <tr>
        <td>${r.fecha || '-'}</td>
        <td>${r.peso != null ? r.peso + ' kg' : '-'}</td>
        <td>${r.imc != null ? r.imc.toFixed(1) : '-'}</td>
        <td class="acciones-cell">
          <button onclick="eliminarRegistroPesoN(${r.id})" class="btn-accion btn-eliminar">Eliminar</button>
        </td>
      </tr>
    `).join('');
    wrapper.style.display = 'block';
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="4" class="loading-msg">Error al cargar registros</td></tr>';
    wrapper.style.display = 'none';
  }
}

async function eliminarRegistroPesoN(id) {
  const ok = await mostrarConfirm('¿Esta seguro de eliminar este registro de peso?\nEsta accion no se puede deshacer.');
  if (!ok) return;

  try {
    const res = await fetchWithAuth(`${API_BASE}/peso/${id}`, { method: 'DELETE' });
    const resultado = await res.json();
    if (!res.ok || resultado.error) throw new Error(resultado.error || 'Error al eliminar');
    mostrarToast('Registro de peso eliminado correctamente', 'success');
    cargarProgresoN();
  } catch (err) {
    mostrarToast(err.message || 'Error al eliminar el registro', 'error');
  }
}

// ============================================================
// 5. PLANES ALIMENTICIOS (DIETAS)
// ============================================================

function renderizarDietasN(dietas) {
  const tbody = $('cuerpoDietasN');
  if (!tbody) return;

  if (!dietas || dietas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="loading-msg">No hay planes registrados para este paciente</td></tr>';
    return;
  }

  tbody.innerHTML = dietas.map(d => `
    <tr>
      <td>${d.fecha || '-'}</td>
      <td class="obs-cell">${escapeHTML(d.desayuno || '-')}</td>
      <td class="obs-cell">${escapeHTML(d.colacion1 || '-')}</td>
      <td class="obs-cell">${escapeHTML(d.comida || '-')}</td>
      <td class="obs-cell">${escapeHTML(d.colacion2 || '-')}</td>
      <td class="obs-cell">${escapeHTML(d.cena || '-')}</td>
      <td class="obs-cell">${escapeHTML(d.recomendaciones || '-')}</td>
      <td class="acciones-cell">
        <button data-dieta='${JSON.stringify(d).replace(/'/g, "&#39;")}' onclick="exportarDietaPDF(this)" class="btn-accion btn-pdf">PDF</button>
        <button onclick="editarDietaN(${d.id})" class="btn-accion btn-editar">Editar</button>
        <button onclick="eliminarDietaN(${d.id})" class="btn-accion btn-eliminar">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

async function cargarDietasN() {
  const tbody = $('cuerpoDietasN');
  const pacienteId = $('selPacienteDietaN').value;

  if (!pacienteId) {
    tbody.innerHTML = '<tr><td colspan="8" class="loading-msg">Selecciona un paciente para ver sus planes</td></tr>';
    return;
  }

  tbody.innerHTML = '<tr><td colspan="8" class="loading-msg">Cargando planes...</td></tr>';

  try {
    const dietas = await fetchPaginatedWithId(`${API_BASE}/dietas/${pacienteId}`, 'pagDietasN');
    renderizarDietasN(dietas);
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="8" class="loading-msg">Error al cargar planes</td></tr>';
  }
  renderPaginacion('pagDietasN', 'pagDietasN', cargarDietasN);
}

// --- Modal de dietas ---
function abrirModalDieta() {
  $('dietaN-id').value = '';
  $('dietaN-paciente').value = $('selPacienteDietaN') ? $('selPacienteDietaN').value : '';
  $('dietaN-fecha').value = new Date().toISOString().split('T')[0];
  $('dietaN-desayuno').value = '';
  $('dietaN-colacion1').value = '';
  $('dietaN-comida').value = '';
  $('dietaN-colacion2').value = '';
  $('dietaN-cena').value = '';
  $('dietaN-recomendaciones').value = '';
  $('modalDietaNTitulo').textContent = 'Nuevo Plan Alimenticio';
  $('modalDietaN').style.display = 'flex';
}

async function editarDietaN(id) {
  try {
    const res = await fetchWithAuth(`${API_BASE}/dieta/${id}`);
    if (!res.ok) throw new Error('Error al obtener plan');
    const d = await res.json();

    $('dietaN-id').value = d.id;
    $('dietaN-paciente').value = d.paciente_id;
    $('dietaN-fecha').value = d.fecha || '';
    $('dietaN-desayuno').value = d.desayuno || '';
    $('dietaN-colacion1').value = d.colacion1 || '';
    $('dietaN-comida').value = d.comida || '';
    $('dietaN-colacion2').value = d.colacion2 || '';
    $('dietaN-cena').value = d.cena || '';
    $('dietaN-recomendaciones').value = d.recomendaciones || '';
    $('modalDietaNTitulo').textContent = 'Editar Plan Alimenticio';
    $('modalDietaN').style.display = 'flex';
  } catch (err) {
    mostrarToast('Error al cargar datos del plan', 'error');
  }
}

async function guardarDietaN(event) {
  event.preventDefault();
  const id = $('dietaN-id').value;
  const datos = {
    paciente_id: parseInt($('dietaN-paciente').value),
    fecha: $('dietaN-fecha').value,
    desayuno: $('dietaN-desayuno').value.trim(),
    colacion1: $('dietaN-colacion1').value.trim(),
    comida: $('dietaN-comida').value.trim(),
    colacion2: $('dietaN-colacion2').value.trim(),
    cena: $('dietaN-cena').value.trim(),
    recomendaciones: $('dietaN-recomendaciones').value.trim()
  };

  if (!datos.paciente_id) {
    mostrarToast('El paciente es obligatorio', 'warning');
    return;
  }

  await withLoading(document.querySelector('#formDietaN .btn-guardar'), 'Guardando...', async () => {
    const esEdicion = id !== '';
    const url = esEdicion ? `${API_BASE}/dietas/${id}` : `${API_BASE}/dietas`;
    const method = esEdicion ? 'PUT' : 'POST';

    const res = await fetchWithAuth(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos)
    });

    const resultado = await res.json();
    if (resultado.error) { throw new Error(resultado.error); }

    cerrarModalDietaN();
    cargarDietasN();
  }).catch(err => {
    mostrarToast(err.message || 'Error al guardar el plan', 'error');
  });
}

async function eliminarDietaN(id) {
  const ok = await mostrarConfirm('¿Esta seguro de eliminar este plan alimenticio?\nEsta accion no se puede deshacer.');
  if (!ok) return;

  try {
    const res = await fetchWithAuth(`${API_BASE}/dietas/${id}`, { method: 'DELETE' });
    const resultado = await res.json();
    if (!res.ok || resultado.error) throw new Error(resultado.error || 'Error al eliminar');
    mostrarToast('Plan alimenticio eliminado correctamente', 'success');
    cargarDietasN();
  } catch (err) {
    mostrarToast(err.message || 'Error al eliminar el plan', 'error');
  }
}

function cerrarModalDietaN() {
  $('modalDietaN').style.display = 'none';
}

// ============================================================
// 5b. GENERAR DIETA CON IA
// ============================================================

async function generarDietaIA() {
  const pacienteId = $('selPacienteDietaN').value;
  if (!pacienteId) {
    mostrarToast('Selecciona un paciente primero', 'warning');
    return;
  }

  await withLoading($('btnGenerarIA'), 'Generando...', async () => {
    const pacientes = await fetchPaginatedSimple(`${API_BASE}/usuarios/buscar?q=${pacienteId}`);
    const p = pacientes[0];
    if (!p) throw new Error('Paciente no encontrado');

    const resIA = await fetchWithAuth(`${API_BASE}/api/generar-dieta-ia`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        edad: p.edad,
        peso: p.peso,
        estatura: p.estatura,
        actividad: p.actividad,
        patologias: p.patologias,
        objetivo: p.objetivo,
        ingredientes_evitar: p.ingredientes_evitar
      })
    });

    if (!resIA.ok) throw new Error('Servicio de IA no disponible');
    const resultado = await resIA.json();
    if (resultado.error) throw new Error(resultado.error);

    $('genDietaNombre').textContent = p.nombre;
    $('genDieta-desayuno').value = resultado.plan.desayuno || '';
    $('genDieta-colacion1').value = resultado.plan.colacion_1 || '';
    $('genDieta-comida').value = resultado.plan.comida || '';
    $('genDieta-colacion2').value = resultado.plan.colacion_2 || '';
    $('genDieta-cena').value = resultado.plan.cena || '';
    $('genDieta-recomendaciones').value = 'Tipo de dieta: ' + (resultado.tipo || 'personalizada');

    $('panelGenerarDietaIA').style.display = 'block';
  }).catch(err => {
    mostrarToast('Error al generar dieta: ' + err.message, 'error');
  });
}

async function guardarDietaDefinitiva() {
  const pacienteId = $('selPacienteDietaN').value;
  if (!pacienteId) { mostrarToast('Selecciona un paciente', 'warning'); return; }

  const datos = {
    paciente_id: parseInt(pacienteId),
    fecha: new Date().toISOString().split('T')[0],
    desayuno: $('genDieta-desayuno').value.trim(),
    colacion1: $('genDieta-colacion1').value.trim(),
    comida: $('genDieta-comida').value.trim(),
    colacion2: $('genDieta-colacion2').value.trim(),
    cena: $('genDieta-cena').value.trim(),
    recomendaciones: $('genDieta-recomendaciones').value.trim()
  };

  await withLoading(document.querySelector('#panelGenerarDietaIA .btn-guardar'), 'Guardando...', async () => {
    const res = await fetchWithAuth(`${API_BASE}/dietas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos)
    });

    const resultado = await res.json();
    if (!res.ok || resultado.error) throw new Error(resultado.error || 'Error al guardar');

    mostrarToast('Dieta guardada correctamente', 'success');
    cerrarPanelGenerarDieta();
    cargarDietasN();
  }).catch(err => {
    mostrarToast('Error al guardar: ' + err.message, 'error');
  });
}

function cerrarPanelGenerarDieta() {
  $('panelGenerarDietaIA').style.display = 'none';
  ['genDieta-desayuno', 'genDieta-colacion1', 'genDieta-comida', 'genDieta-colacion2', 'genDieta-cena', 'genDieta-recomendaciones'].forEach(id => {
    $(id).value = '';
  });
}

// ============================================================
// EXPORTAR REPORTE A PDF
// ============================================================

function exportarDietaPDF(btn) {
  const data = JSON.parse(btn.dataset.dieta);
  exportarReportePDF(data);
}
async function exportarReportePDF(dietaData) {
  let pacienteId, desayuno, colacion1, comida, colacion2, cena, recomendaciones;

  if (dietaData) {
    pacienteId = dietaData.paciente_id;
    desayuno = dietaData.desayuno || '';
    colacion1 = dietaData.colacion1 || '';
    comida = dietaData.comida || '';
    colacion2 = dietaData.colacion2 || '';
    cena = dietaData.cena || '';
    recomendaciones = dietaData.recomendaciones || '';
  } else {
    pacienteId = $('selPacienteDietaN').value;
    desayuno = $('genDieta-desayuno').value.trim();
    colacion1 = $('genDieta-colacion1').value.trim();
    comida = $('genDieta-comida').value.trim();
    colacion2 = $('genDieta-colacion2').value.trim();
    cena = $('genDieta-cena').value.trim();
    recomendaciones = $('genDieta-recomendaciones').value.trim();
  }

  if (!pacienteId) {
    mostrarToast('Selecciona un paciente primero', 'warning');
    return;
  }

  if (!desayuno && !comida && !cena) {
    mostrarToast('No hay datos de dieta para exportar', 'warning');
    return;
  }

  let nombre = '—';
  let peso = '—';
  let imc = '—';
  let fechaStr = new Date().toLocaleDateString('es-MX', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  if (dietaData && dietaData.fecha) {
    const parts = dietaData.fecha.split('-');
    if (parts.length === 3) {
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      fechaStr = d.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
    }
  }

  try {
    const pacientes = await fetchPaginatedSimple(`${API_BASE}/usuarios/buscar?q=${pacienteId}`);
    const p = pacientes[0];
    if (p) {
      nombre = p.nombre || '—';
      peso = p.peso != null ? p.peso + ' kg' : '—';
      if (p.peso > 0 && p.estatura > 0) {
        let est = p.estatura;
        if (est > 3) est = est / 100;
        imc = (p.peso / (est * est)).toFixed(1);
      }
    }
  } catch (err) {
    console.error('Error al obtener datos del paciente:', err);
  }

  $('rep-nombre').textContent = nombre;
  $('rep-fecha').textContent = fechaStr;
  $('rep-peso').textContent = peso;
  $('rep-imc').textContent = imc;
  $('rep-desayuno').textContent = desayuno || '—';
  $('rep-colacion1').textContent = colacion1 || '—';
  $('rep-comida').textContent = comida || '—';
  $('rep-colacion2').textContent = colacion2 || '—';
  $('rep-cena').textContent = cena || '—';
  $('rep-recomendaciones').textContent = recomendaciones || '—';

  const elemento = $('plantillaReporte');
  elemento.style.display = 'block';

  try {
    await html2pdf()
      .set({
        margin: [0.4, 0.4, 0.4, 0.4],
        filename: 'Reporte_Nutricional_' + nombre.replace(/\s+/g, '_') + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
      })
      .from(elemento)
      .save();
  } catch (err) {
    mostrarToast('Error al generar el PDF: ' + err.message, 'error');
  } finally {
    elemento.style.display = 'none';
  }
}

// ============================================================
// 6. RECOMENDACION CON IA
// ============================================================

async function cargarPerfilIAN() {
  const pacienteId = $('selPacienteIAN').value;
  $('perfilIAN').style.display = 'none';
  $('msgSinIA').style.display = 'none';
  $('resultadoIA').style.display = 'none';

  if (!pacienteId) {
    $('msgSinIA').style.display = 'block';
    return;
  }

  try {
    const pacientes = await fetchPaginatedSimple(`${API_BASE}/usuarios/buscar?q=${pacienteId}`);
    const p = pacientes[0];
    if (!p) return;

    $('iaNNombre').textContent = p.nombre || '-';
    $('iaNEdad').textContent = p.edad ? p.edad + ' anios' : '-';
    $('iaNPeso').textContent = p.peso ? p.peso + ' kg' : '-';
    $('iaNEstatura').textContent = p.estatura ? p.estatura + ' m' : '-';
    $('iaNActividad').textContent = p.actividad || '-';
    $('iaNObjetivo').textContent = p.objetivo || '-';
    $('iaNPatologias').textContent = p.patologias || 'Ninguna';
    $('iaNIngredientes').textContent = p.ingredientes_evitar || 'Ninguno';
    $('perfilIAN').style.display = 'block';
  } catch (err) {
    mostrarToast('Error al cargar perfil del paciente', 'error');
  }
}

async function obtenerRecomendacionIA() {
  const pacienteId = $('selPacienteIAN').value;
  if (!pacienteId) return;

  await withLoading($('btnRecomendarIA'), 'Generando...', async () => {
    const pacientes = await fetchPaginatedSimple(`${API_BASE}/usuarios/buscar?q=${pacienteId}`);
    const p = pacientes[0];
    if (!p) throw new Error('Paciente no encontrado');

    const resDirecta = await fetchWithAuth(`${API_BASE}/api/generar-dieta-ia`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: p.nombre,
        edad: p.edad,
        peso: p.peso,
        estatura: p.estatura,
        actividad: p.actividad,
        patologias: p.patologias,
        objetivo: p.objetivo,
        ingredientes_evitar: p.ingredientes_evitar
      })
    });

    if (!resDirecta.ok) throw new Error('El servicio de IA no esta disponible');
    const resultado = await resDirecta.json();

    if (typeof resultado === 'string') {
      $('iaContenido').innerHTML = '<div class="ia-plan-card"><p>' + escapeHTML(resultado) + '</p></div>';
    } else {
      $('iaContenido').innerHTML = renderRecomendacionIA(resultado);
    }
    $('resultadoIA').style.display = 'block';
  }).catch(err => {
    $('iaContenido').textContent = 'Error: ' + (err.message || 'No se pudo obtener la recomendacion. Verifica que el servicio de IA este activo.');
    $('resultadoIA').style.display = 'block';
  });
}

function renderRecomendacionIA(resultado) {
  const plan = resultado.plan || {};
  const tipo = resultado.tipo || 'personalizada';

  const comidas = [
    ['desayuno', 'Desayuno', plan.desayuno],
    ['colacion_1', 'Colacion (Manana)', plan.colacion_1],
    ['comida', 'Comida', plan.comida],
    ['colacion_2', 'Colacion (Tarde)', plan.colacion_2],
    ['cena', 'Cena', plan.cena]
  ];

  const tarjetas = comidas.map(([key, label, valor]) =>
    '<div class="ia-plan-card">' +
      '<div class="ia-plan-comida">' + escapeHTML(label) + '</div>' +
      '<p>' + (escapeHTML(valor) || 'Sin dato') + '</p>' +
    '</div>'
  ).join('');

  return '<div class="ia-plan-badge">Tipo de dieta: ' + escapeHTML(tipo) + '</div>' +
         '<div class="ia-plan-grid">' + tarjetas + '</div>';
}

// ============================================================
// 7. HISTORIAL CLINICO
// ============================================================

async function cargarHistorialN() {
  const pacienteId = $('selPacienteHistorialN').value;
  $('historialContenidoN').style.display = 'none';
  $('msgSinHistorialN').style.display = 'none';

  if (!pacienteId) {
    $('msgSinHistorialN').style.display = 'block';
    return;
  }

  $('historialContenidoN').style.display = 'block';

  // Cargar datos del paciente
  try {
    const pacientes = await fetchPaginatedSimple(`${API_BASE}/usuarios/buscar?q=${pacienteId}`);
    const p = pacientes[0];

    if (p) {
      $('historialDatosPacienteN').innerHTML = `
        <div class="hp-item"><strong>Nombre:</strong> ${escapeHTML(p.nombre)}</div>
        <div class="hp-item"><strong>Edad:</strong> ${p.edad} anios</div>
        <div class="hp-item"><strong>Peso actual:</strong> ${p.peso} kg</div>
        <div class="hp-item"><strong>Estatura:</strong> ${p.estatura} m</div>
        <div class="hp-item"><strong>Actividad:</strong> ${escapeHTML(p.actividad)}</div>
        <div class="hp-item"><strong>Objetivo:</strong> ${escapeHTML(p.objetivo)}</div>
        <div class="hp-item"><strong>Patologias:</strong> ${escapeHTML(p.patologias || 'Ninguna')}</div>
        <div class="hp-item"><strong>Ingredientes a evitar:</strong> ${escapeHTML(p.ingredientes_evitar || 'Ninguno')}</div>
      `;
    }
  } catch (err) {
    console.error('Error al cargar datos del paciente:', err);
  }

  // Cargar citas del paciente
  await cargarHistorialCitasN(pacienteId);

  // Cargar dietas del paciente
  await cargarHistorialDietasN(pacienteId);

  renderPaginacion('pagHistorialCitasN', 'pagHistorialCitasN', () => { cargarHistorialCitasN(pacienteId); });
  renderPaginacion('pagHistorialDietasN', 'pagHistorialDietasN', () => { cargarHistorialDietasN(pacienteId); });
}

async function cargarHistorialCitasN(pacienteId) {
  try {
    const citas = await fetchPaginatedWithId(`${API_BASE}/nutricion/citas/${pacienteId}`, 'pagHistorialCitasN');
    const tbody = $('cuerpoHistorialN');
    if (!citas || citas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="loading-msg">No hay citas registradas</td></tr>';
    } else {
      tbody.innerHTML = citas.map(c => `
        <tr>
          <td>${c.fecha || '-'}</td>
          <td>${c.hora || '-'}</td>
          <td>${c.peso != null ? c.peso + ' kg' : '-'}</td>
          <td>${c.imc != null ? c.imc.toFixed(1) : '-'}</td>
          <td><span class="estado-badge estado-${(c.estado || 'programada').toLowerCase()}">${escapeHTML(c.estado || 'Programada')}</span></td>
          <td>${escapeHTML(c.motivo || '-')}</td>
          <td class="obs-cell">${escapeHTML(c.observaciones || '-')}</td>
        </tr>
      `).join('');
    }
  } catch (err) {
    $('cuerpoHistorialN').innerHTML = '<tr><td colspan="7" class="loading-msg">Error al cargar historial</td></tr>';
  }
  renderPaginacion('pagHistorialCitasN', 'pagHistorialCitasN', () => { cargarHistorialCitasN(pacienteId); });
}

async function cargarHistorialDietasN(pacienteId) {
  try {
    const dietas = await fetchPaginatedWithId(`${API_BASE}/dietas/${pacienteId}`, 'pagHistorialDietasN');
    const tbody = $('cuerpoHistorialDietasN');
    if (!dietas || dietas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="loading-msg">No hay planes alimenticios registrados</td></tr>';
    } else {
      tbody.innerHTML = dietas.map(d => `
        <tr>
          <td>${d.fecha || '-'}</td>
          <td class="obs-cell">${escapeHTML(d.desayuno || '-')}</td>
          <td class="obs-cell">${escapeHTML(d.colacion1 || '-')}</td>
          <td class="obs-cell">${escapeHTML(d.comida || '-')}</td>
          <td class="obs-cell">${escapeHTML(d.colacion2 || '-')}</td>
          <td class="obs-cell">${escapeHTML(d.cena || '-')}</td>
          <td class="obs-cell">${escapeHTML(d.recomendaciones || '-')}</td>
        </tr>
      `).join('');
    }
  } catch (err) {
    $('cuerpoHistorialDietasN').innerHTML = '<tr><td colspan="7" class="loading-msg">Error al cargar planes</td></tr>';
  }
  renderPaginacion('pagHistorialDietasN', 'pagHistorialDietasN', () => { cargarHistorialDietasN(pacienteId); });
}
