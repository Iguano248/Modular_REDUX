const cuerpoTabla = $('cuerpoTabla');
const buscador = $('buscador');
const mensajeError = $('mensajeError');

// 🔐 Auth guard — controla la inicialización
(async function() {
  if (await verificarSesion()) {
    $('loginOverlay').style.display = 'none';
    cargarPacientes();
    cargarHistorialCitas();
  } else {
    $('loginOverlay').style.display = 'flex';
  }
})();

async function doLogin() {
  const user = $('loginUser').value.trim();
  const pass = $('loginPass').value;
  if (!user || !pass) { $('loginError').textContent = 'Ingrese usuario y contraseña'; $('loginError').style.display = ''; return; }
  try {
    const res = await fetch(API_BASE + '/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass })
    });
    const data = await res.json();
    if (!res.ok) { $('loginError').textContent = data.error || 'Error de autenticación'; $('loginError').style.display = ''; return; }
    setToken(data.token);
    $('loginOverlay').style.display = 'none';
    $('loginUser').value = '';
    $('loginPass').value = '';
    cargarPacientes();
    cargarHistorialCitas();
  } catch (err) {
    $('loginError').textContent = 'Error de conexión';
    $('loginError').style.display = '';
  }
}

function mostrarError(msg) {
  mostrarToast(msg, 'error');
}

function ocultarError() {
  mensajeError.classList.remove('visible');
}

function renderizarPacientes(pacientes) {
  if (!pacientes || pacientes.length === 0) {
    cuerpoTabla.innerHTML = `<tr><td colspan="9" class="loading-msg">No se encontraron pacientes</td></tr>`;
    return;
  }

  cuerpoTabla.innerHTML = pacientes.map(p => `
    <tr>
      <td>${p.id}</td>
      <td>${escapeHTML(p.nombre)}</td>
      <td>${p.edad}</td>
      <td>${p.peso}</td>
      <td>${p.estatura}</td>
      <td>${escapeHTML(p.actividad)}</td>
      <td>${escapeHTML(p.patologias || 'Ninguna')}</td>
      <td>${escapeHTML(p.objetivo)}</td>
      <td class="acciones-cell">
        <button onclick="editarPaciente(${p.id})" class="btn-accion btn-editar">Editar</button>
        <button onclick="eliminarPaciente(${p.id}, '${escapeHTML(p.nombre)}')" class="btn-accion btn-eliminar">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

// Carga todos los pacientes desde el servidor (con paginación)
async function cargarPacientes() {
  ocultarError();
  cuerpoTabla.innerHTML = `<tr><td colspan="9" class="loading-msg">Cargando pacientes...</td></tr>`;

  try {
    const pacientes = await fetchPaginated(`${API_BASE}/usuarios`, 'pagPacientes');
    renderizarPacientes(pacientes);
  } catch (err) {
    mostrarError('Error al conectar con el servidor. Verifica que el servidor esté corriendo.');
    cuerpoTabla.innerHTML = `<tr><td colspan="9" class="loading-msg">Error al cargar datos</td></tr>`;
  }
  renderPaginacion('pagPacientes', 'pagPacientes', cargarPacientes);
}

// Busca pacientes por nombre o ID (con paginación)
async function buscarPacientes() {
  const q = buscador.value.trim();

  if (!q) {
    cargarPacientes();
    return;
  }

  ocultarError();
  cuerpoTabla.innerHTML = `<tr><td colspan="9" class="loading-msg">Buscando...</td></tr>`;
  crearPagState('pagPacientes');

  try {
    const pacientes = await fetchPaginatedWithQuery(`${API_BASE}/usuarios/buscar`, 'pagPacientes', q);
    renderizarPacientes(pacientes);
  } catch (err) {
    mostrarError('Error al buscar pacientes. Verifica la conexion con el servidor.');
    cuerpoTabla.innerHTML = `<tr><td colspan="9" class="loading-msg">Error en la busqueda</td></tr>`;
  }
  renderPaginacion('pagPacientes', 'pagPacientes', () => { buscarPacientes(); });
}

// Cierra sesion y redirige al inicio
function cerrarSesion() {
  const token = getToken();
  if (token) fetch(`${API_BASE}/logout?token=${encodeURIComponent(token)}`);
  clearToken();
  window.location.href = 'home.html';
}



// ============================================================
// 🥗 SECCIÓN DE NUTRICIÓN — Toggle visibility
// ============================================================
function toggleSeccionNutricion() {
  const seccion = $('seccionNutricion');
  const btn = $('btnNutricion');
  if (!seccion) return;

  const visible = seccion.style.display !== 'none';
  seccion.style.display = visible ? 'none' : 'block';
  btn.textContent = visible ? 'Historial de Citas' : 'Ocultar Citas';

  if (!visible) {
    cargarListaPacientes();
    cargarCitasNutricion();
  }
}

// ============================================================
// ✏️ EDITAR PACIENTE — abre modal con datos actuales
// ============================================================
async function editarPaciente(id) {
  try {
    const pacientes = await fetchPaginatedSimple(`${API_BASE}/usuarios/buscar?q=${id}`);
    const p = pacientes[0];
    if (!p) {
      mostrarError('Paciente no encontrado');
      return;
    }

    $('edit-id').value = p.id;
    $('edit-nombre').value = p.nombre;
    $('edit-edad').value = p.edad;
    $('edit-peso').value = p.peso;
    $('edit-estatura').value = p.estatura;
    $('edit-actividad').value = p.actividad;
    $('edit-patologias').value = p.patologias || '';
    $('edit-ingredientes').value = p.ingredientes_evitar || '';
    $('edit-objetivo').value = p.objetivo;
    $('edit-sexo').value = p.sexo || '';

    $('modalEditar').style.display = 'flex';
  } catch (err) {
    mostrarError('Error al cargar datos del paciente');
  }
}

// Cierra el modal de edicion
function cerrarModal() {
  $('modalEditar').style.display = 'none';
}

window.addEventListener('click', (e) => {
  const modal = $('modalEditar');
  if (e.target === modal) cerrarModal();
});

// ============================================================
// 💾 GUARDAR EDICION — envia PUT al servidor
// ============================================================
async function guardarEdicion(event) {
  event.preventDefault();
  ocultarError();

  const id = $('edit-id').value;
  const datos = {
    nombre: $('edit-nombre').value.trim(),
    edad: parseInt($('edit-edad').value),
    peso: parseFloat($('edit-peso').value),
    estatura: parseFloat($('edit-estatura').value),
    actividad: $('edit-actividad').value,
    patologias: $('edit-patologias').value.trim(),
    objetivo: $('edit-objetivo').value,
    ingredientes_evitar: $('edit-ingredientes').value.trim(),
    sexo: $('edit-sexo').value
  };

  try {
    const res = await fetchWithAuth(`${API_BASE}/usuario/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos)
    });

    const resultado = await res.json();

    if (!res.ok) {
      throw new Error(resultado.error || 'Error al guardar');
    }

    cerrarModal();
    mostrarToast('Paciente actualizado correctamente', 'success');
    cargarPacientes();
  } catch (err) {
    mostrarError(err.message || 'Error al actualizar paciente. Verifica el servidor.');
  }
}

// ============================================================
// 🗑️ ELIMINAR PACIENTE — confirma y envia DELETE
// ============================================================
async function eliminarPaciente(id, nombre) {
  const ok = await mostrarConfirm(`¿Esta seguro de eliminar a "${nombre}" (ID: ${id})?\n\nEsta accion no se puede deshacer.`);
  if (!ok) return;

  ocultarError();

  try {
    const res = await fetchWithAuth(`${API_BASE}/usuario/${id}`, { method: 'DELETE' });
    const resultado = await res.json();

    if (!res.ok) {
      throw new Error(resultado.error || 'Error al eliminar');
    }

    mostrarToast('Paciente eliminado correctamente', 'success');
    cargarPacientes();
  } catch (err) {
    mostrarError(err.message || 'Error al eliminar paciente. Verifica el servidor.');
  }
}

// ============================================================
// 📋 HISTORIAL DE CITAS
// ============================================================
  const cuerpoTablaCitas = $('cuerpoTablaCitas');
const buscadorCitas = $('buscadorCitas');
function renderizarHistorial(citas) {
  if (!citas || citas.length === 0) {
    cuerpoTablaCitas.innerHTML = `<tr><td colspan="6" class="loading-msg">No hay citas registradas</td></tr>`;
    return;
  }
  cuerpoTablaCitas.innerHTML = citas.map(c => `
    <tr>
      <td>${c.id}</td>
      <td>${c.usuarioId}</td>
      <td>${escapeHTML(c.paciente)}</td>
      <td>${escapeHTML(c.medico)}</td>
      <td>${c.fecha}</td>
      <td class="acciones-cell">
        <button onclick="abrirModalReagendar(${c.id}, ${c.medicoId})" class="btn-accion btn-reagendar">Reagendar</button>
        <button onclick="eliminarCitaGeneral(${c.id})" class="btn-accion btn-eliminar">Eliminar</button>
      </td>
    </tr>
  `).join('');
}
async function cargarHistorialCitas() {
  cuerpoTablaCitas.innerHTML = `<tr><td colspan="6" class="loading-msg">Cargando historial de citas...</td></tr>`;
  try {
    const citas = await fetchPaginated(`${API_BASE}/historial-citas`, 'pagHistorialCitas');
    renderizarHistorial(citas);
  } catch (err) {
    cuerpoTablaCitas.innerHTML = `<tr><td colspan="6" class="loading-msg">Error al cargar historial de citas</td></tr>`;
  }
  renderPaginacion('pagHistorialCitas', 'pagHistorialCitas', cargarHistorialCitas);
}
async function buscarHistorialCitas() {
  const q = buscadorCitas.value.trim();
  if (!q) {
    cargarHistorialCitas();
    return;
  }
  cuerpoTablaCitas.innerHTML = `<tr><td colspan="6" class="loading-msg">Buscando...</td></tr>`;
  crearPagState('pagHistorialCitas');
  try {
    const citas = await fetchPaginatedWithQuery(`${API_BASE}/historial-citas`, 'pagHistorialCitas', q);
    renderizarHistorial(citas);
  } catch (err) {
    cuerpoTablaCitas.innerHTML = `<tr><td colspan="6" class="loading-msg">Error en la búsqueda</td></tr>`;
  }
  renderPaginacion('pagHistorialCitas', 'pagHistorialCitas', () => { buscarHistorialCitas(); });
}

// ============================================================
// 🔄 REAGENDAR CITA
// ============================================================
function abrirModalReagendar(citaId, medicoId) {
  $('reagendar-id').value = citaId;
  $('reagendar-medico').value = medicoId || '';
  $('reagendar-fecha').value = '';
  $('modalReagendar').style.display = 'flex';

  fetchWithAuth(`${API_BASE}/medicos`)
    .then(res => res.json())
    .then(medicos => {
      const sel = $('reagendar-medico');
      sel.innerHTML = '<option value="">Seleccionar...</option>';
      medicos.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.nombre;
        if (m.id === medicoId) opt.selected = true;
        sel.appendChild(opt);
      });
    })
    .catch(() => mostrarError('Error al cargar médicos'));
}

function cerrarModalReagendar() {
  $('modalReagendar').style.display = 'none';
}

window.addEventListener('click', (e) => {
  const modal = $('modalReagendar');
  if (e.target === modal) cerrarModalReagendar();
});

async function guardarReagendar(event) {
  event.preventDefault();
  ocultarError();

  const id = $('reagendar-id').value;
  const medicoId = $('reagendar-medico').value;
  const fecha = $('reagendar-fecha').value;

  try {
    const res = await fetchWithAuth(`${API_BASE}/citas/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ medicoId: parseInt(medicoId), fecha })
    });

    const resultado = await res.json();

    if (!res.ok || resultado.error) {
      throw new Error(resultado.error || 'Error al reagendar');
    }

    cerrarModalReagendar();
    mostrarToast('Cita reagendada correctamente', 'success');
    cargarHistorialCitas();
  } catch (err) {
    mostrarError(err.message || 'Error al reagendar cita');
  }
}

// ============================================================
// 🗑️ ELIMINAR CITA GENERAL
// ============================================================
async function eliminarCitaGeneral(id) {
  const ok = await mostrarConfirm(`¿Esta seguro de eliminar la cita #${id}?\n\nEsta accion no se puede deshacer.`);
  if (!ok) return;

  ocultarError();

  try {
    const res = await fetchWithAuth(`${API_BASE}/citas/${id}`, { method: 'DELETE' });
    const resultado = await res.json();

    if (!res.ok) {
      throw new Error(resultado.error || 'Error al eliminar');
    }

    mostrarToast('Cita eliminada correctamente', 'success');
    cargarHistorialCitas();
  } catch (err) {
    mostrarError(err.message || 'Error al eliminar cita. Verifica el servidor.');
  }
}
