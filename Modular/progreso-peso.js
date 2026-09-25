// ============================================================
// 📊 MÓDULO DE SEGUIMIENTO DE PESO Y PROGRESO
// ============================================================
// Archivo independiente que maneja la visualización del progreso
// de peso de los pacientes. Diseñado para ser extensible con
// gráficas (Chart.js, etc.) sin modificar el backend.
//
// API consumida: GET /progreso/:pacienteId
// ============================================================

const selPacienteProgreso = $('selPacienteProgreso');
const resumenProgreso = $('resumenProgreso');
const msgSinProgreso = $('msgSinProgreso');
const tablaProgresoWrapper = $('tablaProgresoWrapper');
const cuerpoTablaProgreso = $('cuerpoTablaProgreso');
const contenedorGrafica = $('contenedorGrafica');

// Estado del módulo
let datosProgresoCache = null;
let graficaProgreso = null;

// ============================================================
// TOGGLE VISIBILIDAD DE LA SECCIÓN
// ============================================================
function toggleSeccionProgreso() {
  const seccion = $('seccionProgreso');
  const btn = $('btnProgreso');
  if (!seccion) return;

  const visible = seccion.style.display !== 'none';
  seccion.style.display = visible ? 'none' : 'block';
  btn.textContent = visible ? 'Seguimiento de Peso' : 'Ocultar Progreso';

  // Cargar lista de pacientes al abrir la sección
  if (!visible) {
    cargarListaPacientesProgreso();
  }
}

// ============================================================
// CARGAR LISTA DE PACIENTES PARA EL SELECTOR
// ============================================================
async function cargarListaPacientesProgreso() {
  try {
    const res = await fetchWithAuth(`${API_BASE}/usuarios?all=true`);
    if (!res.ok) throw new Error('Error del servidor');
    const pacientes = await res.json();

    if (!selPacienteProgreso) return;
    selPacienteProgreso.innerHTML = '<option value="">Seleccionar paciente...</option>';
    pacientes.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.nombre} (ID: ${p.id})`;
      selPacienteProgreso.appendChild(opt);
    });
  } catch (err) {
    console.error('Error al cargar pacientes para progreso:', err);
  }
}

// ============================================================
// CARGAR Y RENDERIZAR PROGRESO DE UN PACIENTE
// ============================================================
async function cargarProgresoPaciente() {
  const pacienteId = selPacienteProgreso ? selPacienteProgreso.value : '';

  // Ocultar todo si no se seleccionó paciente
  if (!pacienteId) {
    ocultarSeccionesProgreso();
    return;
  }

  // Mostrar estado de carga
  ocultarSeccionesProgreso();
  cuerpoTablaProgreso.innerHTML = '<tr><td colspan="4" class="loading-msg">Cargando progreso...</td></tr>';
  tablaProgresoWrapper.style.display = 'block';

  try {
    const res = await fetchWithAuth(`${API_BASE}/progreso/${pacienteId}`);
    if (!res.ok) throw new Error('Error del servidor');
    const datos = await res.json();

    datosProgresoCache = datos;
    renderizarProgreso(datos);
  } catch (err) {
    console.error('Error al cargar progreso:', err);
    cuerpoTablaProgreso.innerHTML = '<tr><td colspan="4" class="loading-msg">Error al cargar el progreso</td></tr>';
    tablaProgresoWrapper.style.display = 'block';
  }
}

// ============================================================
// RENDERIZAR TODA LA SECCIÓN DE PROGRESO
// ============================================================
function renderizarProgreso(datos) {
  ocultarSeccionesProgreso();

  // Caso: no hay datos de seguimiento
  if (!datos.historial || datos.historial.length === 0) {
    msgSinProgreso.style.display = 'block';
    return;
  }

  // Renderizar tarjetas de resumen
  renderizarResumen(datos);

  // Renderizar tabla cronológica
  renderizarTablaProgreso(datos.historial);

  // Renderizar gráfica de evolución
  contenedorGrafica.style.display = 'block';
  renderizarGraficaProgreso(datos.historial);
}

// ============================================================
// RENDERIZAR TARJETAS DE RESUMEN
// ============================================================
function renderizarResumen(datos) {
  const el = (id) => $(id);

  // Nombre del paciente
  el('progNombre').textContent = datos.paciente ? datos.paciente.nombre : '-';

  // Pesos
  el('progPesoInicial').textContent = datos.pesoInicial != null ? `${datos.pesoInicial} kg` : '-';
  el('progPesoActual').textContent = datos.pesoActual != null ? `${datos.pesoActual} kg` : '-';

  // Cambio de peso con indicador visual
  if (datos.cambioPeso != null) {
    const cambio = datos.cambioPeso;
    const signo = cambio > 0 ? '+' : '';
    el('progCambio').textContent = `${signo}${cambio} kg`;
    // Clase CSS para indicar si subió o bajó de peso
    el('progCambio').className = 'resumen-valor ' +
      (cambio < 0 ? 'cambio-negativo' : cambio > 0 ? 'cambio-positivo' : '');
  } else {
    el('progCambio').textContent = '-';
    el('progCambio').className = 'resumen-valor';
  }

  // IMCs
  el('progImcInicial').textContent = datos.imcInicial != null ? datos.imcInicial.toFixed(1) : '-';
  el('progImcActual').textContent = datos.imcActual != null ? datos.imcActual.toFixed(1) : '-';

  // Peso Ideal
  el('progPesoIdeal').textContent = datos.pesoIdeal != null ? `${datos.pesoIdeal} kg` : '-';

  // Diferencia al Ideal
  if (datos.diferenciaIdeal != null) {
    const dif = datos.diferenciaIdeal;
    const signo = dif > 0 ? '+' : '';
    el('progDiferenciaIdeal').textContent = `${signo}${dif} kg`;
    el('progDiferenciaIdeal').className = 'resumen-valor ' +
      (dif < 0 ? 'cambio-negativo' : dif > 0 ? 'cambio-positivo' : '');
  } else {
    el('progDiferenciaIdeal').textContent = '-';
    el('progDiferenciaIdeal').className = 'resumen-valor';
  }

  resumenProgreso.style.display = 'grid';
}

// ============================================================
// RENDERIZAR TABLA CRONOLÓGICA
// ============================================================
function renderizarTablaProgreso(historial) {
  if (!historial || historial.length === 0) {
    cuerpoTablaProgreso.innerHTML = '<tr><td colspan="4" class="loading-msg">Sin datos</td></tr>';
    tablaProgresoWrapper.style.display = 'block';
    return;
  }

  cuerpoTablaProgreso.innerHTML = historial.map(item => `
    <tr>
      <td>${item.fecha || '-'}</td>
      <td>${item.peso != null ? item.peso + ' kg' : '-'}</td>
      <td>${item.imc != null ? item.imc.toFixed(1) : '-'}</td>
      <td><span class="estado-badge estado-${(item.estado || 'programada').toLowerCase()}">${escapeHTML(item.estado || 'Programada')}</span></td>
    </tr>
  `).join('');

  tablaProgresoWrapper.style.display = 'block';
}

// ============================================================
// RENDERIZAR GRÁFICA DE EVOLUCIÓN DE PESO
// ============================================================
function renderizarGraficaProgreso(historial) {
  if (graficaProgreso) {
    graficaProgreso.destroy();
    graficaProgreso = null;
  }

  const canvas = document.getElementById('graficaProgreso');
  if (!canvas || !historial || historial.length === 0) {
    contenedorGrafica.style.display = 'none';
    return;
  }

  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  const etiquetas = historial.map(item => {
    const parts = item.fecha.split('-');
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.getDate() + ' ' + meses[d.getMonth()];
  });

  const pesos = historial.map(item => item.peso);

  contenedorGrafica.style.display = 'block';

  graficaProgreso = new Chart(canvas.getContext('2d'), {
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

// ============================================================
// UTILIDADES
// ============================================================

// Ocultar todas las sub-secciones del progreso
function ocultarSeccionesProgreso() {
  resumenProgreso.style.display = 'none';
  msgSinProgreso.style.display = 'none';
  tablaProgresoWrapper.style.display = 'none';
  contenedorGrafica.style.display = 'none';
}

// ============================================================
// INICIALIZACIÓN
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // La carga de pacientes se hace al abrir la sección (toggleSeccionProgreso)
  // No se carga automáticamente para no interferir con el panel principal
});
