// Estado del módulo
let pacientesCache = [];
let pacienteSeleccionado = null;

// ============================================================
// CARGAR LISTA DE PACIENTES PARA SELECTOR
// ============================================================
async function cargarListaPacientes() {
  try {
    const res = await fetchWithAuth(`${API_BASE}/usuarios?all=true`);
    if (!res.ok) throw new Error('Error del servidor');
    pacientesCache = await res.json();

    const sel = $('selPacienteCita');
    if (!sel) return;
    sel.innerHTML = '<option value="">Seleccionar paciente...</option>';
    pacientesCache.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.nombre} (ID: ${p.id})`;
      sel.appendChild(opt);
    });
  } catch (err) {
    console.error('Error al cargar pacientes:', err);
  }
}

// ============================================================
// CARGAR CITAS DE NUTRICIÓN
// ============================================================
async function cargarCitasNutricion(pacienteId) {
  const tbody = $('cuerpoTablaNutricion');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="8" class="loading-msg">Cargando citas...</td></tr>`;

  try {
    const url = pacienteId
      ? `${API_BASE}/nutricion/citas/${pacienteId}`
      : `${API_BASE}/nutricion/citas`;
    const citas = pacienteId
      ? await fetchPaginatedWithId(url, 'pagCitasNutricion')
      : await fetchPaginated(url, 'pagCitasNutricion');
    renderizarCitasNutricion(citas);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="loading-msg">Error al cargar citas</td></tr>`;
  }
  renderPaginacion('pagCitasNutricion', 'pagCitasNutricion', () => { cargarCitasNutricion(pacienteId); });
}

// ============================================================
// RENDERIZAR TABLA DE CITAS
// ============================================================
function renderizarCitasNutricion(citas) {
  const tbody = $('cuerpoTablaNutricion');
  if (!tbody) return;

  if (!citas || citas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="loading-msg">No hay citas registradas</td></tr>`;
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
        <button onclick="editarCitaNutricion(${c.id})" class="btn-accion btn-editar">Editar</button>
        <button onclick="eliminarCitaNutricion(${c.id})" class="btn-accion btn-eliminar">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

// ============================================================
// FILTRAR POR PACIENTE
// ============================================================
function filtrarCitasPorPaciente() {
  const sel = $('selPacienteCita');
  const pacienteId = sel ? sel.value : '';
  pacienteSeleccionado = pacienteId || null;
  crearPagState('pagCitasNutricion');
  cargarCitasNutricion(pacienteSeleccionado);
}

// ============================================================
// ABRIR MODAL NUEVA CITA
// ============================================================
function abrirModalNuevaCita() {
  $('cita-id').value = '';
  $('cita-paciente').value = pacienteSeleccionado || '';
  $('cita-fecha').value = new Date().toISOString().split('T')[0];
  $('cita-hora').value = '';
  $('cita-motivo').value = '';
  $('cita-observaciones').value = '';
  $('cita-peso').value = '';
  $('cita-estatura').value = '';
  $('cita-imc').value = '';
  $('cita-estado').value = 'Programada';
  $('modalCitaNutricion').style.display = 'flex';
  $('modalCitaNutricion').querySelector('h2').textContent = 'Nueva Cita de Nutrición';
}

// ============================================================
// EDITAR CITA
// ============================================================
async function editarCitaNutricion(id) {
  try {
    const res = await fetchWithAuth(`${API_BASE}/nutricion/cita/${id}`);
    if (!res.ok) throw new Error('Error al obtener cita');
    const c = await res.json();

    $('cita-id').value = c.id;
    $('cita-paciente').value = c.paciente_id;
    $('cita-fecha').value = c.fecha || '';
    $('cita-hora').value = c.hora || '';
    $('cita-motivo').value = c.motivo || '';
    $('cita-observaciones').value = c.observaciones || '';
    $('cita-peso').value = c.peso != null ? c.peso : '';
    $('cita-estatura').value = '';
    $('cita-imc').value = c.imc != null ? c.imc : '';
    $('cita-estado').value = c.estado || 'Programada';
    $('modalCitaNutricion').style.display = 'flex';
    $('modalCitaNutricion').querySelector('h2').textContent = 'Editar Cita de Nutrición';
    // recalcular IMC si hay peso pero falta IMC
    if (c.peso != null && c.peso > 0 && !c.imc) {
      $('cita-peso').dispatchEvent(new Event('input'));
    }
  } catch (err) {
    mostrarToast('Error al cargar datos de la cita', 'error');
  }
}

// ============================================================
// GUARDAR CITA (Crear o Actualizar)
// ============================================================
async function guardarCitaNutricion(event) {
  event.preventDefault();

  const id = $('cita-id').value;
  const datos = {
    paciente_id: parseInt($('cita-paciente').value),
    fecha: $('cita-fecha').value,
    hora: $('cita-hora').value.trim(),
    motivo: $('cita-motivo').value.trim(),
    observaciones: $('cita-observaciones').value.trim(),
    peso: $('cita-peso').value ? parseFloat($('cita-peso').value) : null,
    imc: $('cita-imc').value ? parseFloat($('cita-imc').value) : null,
    estado: $('cita-estado').value
  };

  if (!datos.paciente_id || !datos.fecha) {
    mostrarToast('Paciente y fecha son obligatorios', 'warning');
    return;
  }

  await withLoading(document.querySelector('#formCitaNutricion .btn-guardar'), 'Guardando...', async () => {
    const esEdicion = id !== '';
    const url = esEdicion
      ? `${API_BASE}/nutricion/citas/${id}`
      : `${API_BASE}/nutricion/citas`;
    const method = esEdicion ? 'PUT' : 'POST';

    const res = await fetchWithAuth(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos)
    });

    const resultado = await res.json();

    if (!res.ok || resultado.error) {
      throw new Error(resultado.error || 'Error al guardar');
    }

    cerrarModalCitaNutricion();
    mostrarToast('Cita guardada correctamente', 'success');
    cargarCitasNutricion(pacienteSeleccionado);
  }).catch(err => {
    mostrarToast(err.message || 'Error al guardar la cita', 'error');
  });
}

// ============================================================
// ELIMINAR CITA
// ============================================================
async function eliminarCitaNutricion(id) {
  const ok = await mostrarConfirm('¿Estás seguro de eliminar esta cita?\nEsta acción no se puede deshacer.');
  if (!ok) return;

  try {
    const res = await fetchWithAuth(`${API_BASE}/nutricion/citas/${id}`, {
      method: 'DELETE'
    });
    const resultado = await res.json();

    if (!res.ok || resultado.error) {
      throw new Error(resultado.error || 'Error al eliminar');
    }

    mostrarToast('Cita eliminada correctamente', 'success');
    cargarCitasNutricion(pacienteSeleccionado);
  } catch (err) {
    mostrarToast(err.message || 'Error al eliminar la cita', 'error');
  }
}

// ============================================================
// CERRAR MODAL
// ============================================================
function cerrarModalCitaNutricion() {
  $('modalCitaNutricion').style.display = 'none';
}

// ============================================================
// AUTO-CALCULAR IMC AL INGRESAR PESO/ESTATURA
// ============================================================
function configurarAutoIMC() {
  const pesoInput = $('cita-peso');
  const estaturaInput = $('cita-estatura');
  const imcInput = $('cita-imc');

  function calcularIMC() {
    const peso = parseFloat(pesoInput.value);
    let estatura = parseFloat(estaturaInput.value);

    if (isNaN(peso) || isNaN(estatura) || peso <= 0 || estatura <= 0) {
      return;
    }

    if (estatura > 3) {
      estatura = estatura / 100;
    }

    imcInput.value = (peso / (estatura * estatura)).toFixed(1);
  }

  if (pesoInput && estaturaInput && imcInput) {
    pesoInput.addEventListener('input', calcularIMC);
    estaturaInput.addEventListener('input', calcularIMC);
  }
}

// ============================================================
// INICIALIZACIÓN
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  cargarListaPacientes();
  cargarCitasNutricion();

  // Cerrar modal al hacer clic fuera
  const modal = $('modalCitaNutricion');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) cerrarModalCitaNutricion();
    });
  }

  configurarAutoIMC();
});
