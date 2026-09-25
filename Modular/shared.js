const API_BASE = 'http://localhost:4000';

function $(id) {
  return document.getElementById(id);
}

function escapeHTML(texto) {
  if (!texto) return '';
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

// 🔐 Auth helpers
function getToken() {
  return localStorage.getItem('adminToken');
}

function setToken(token) {
  localStorage.setItem('adminToken', token);
}

function clearToken() {
  localStorage.removeItem('adminToken');
}

function mostrarToast(mensaje, tipo = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const iconos = { success: '\u2705', error: '\u274C', info: '\u2139\uFE0F', warning: '\u26A0\uFE0F' };
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + tipo;
  toast.innerHTML = '<span class="toast-icon">' + (iconos[tipo] || iconos.info) + '</span>' + escapeHTML(mensaje);
  container.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 4500);
}

function mostrarConfirm(mensaje) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML =
      '<div class="confirm-dialog"><p class="confirm-msg">' + escapeHTML(mensaje) + '</p>' +
      '<div class="confirm-actions"><button class="btn-cancelar" id="confirmNo">Cancelar</button>' +
      '<button class="btn-guardar" id="confirmYes">Aceptar</button></div></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
    document.getElementById('confirmNo').addEventListener('click', () => { overlay.remove(); resolve(false); });
    document.getElementById('confirmYes').addEventListener('click', () => { overlay.remove(); resolve(true); });
  });
}

async function withLoading(btn, text, callback) {
  if (!btn) return callback();
  const originalText = btn.textContent;
  btn.textContent = text || 'Cargando...';
  btn.disabled = true;
  try {
    await callback();
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

// ============================================================
// 📄 PAGINACIÓN — estado y renderizado
// ============================================================

// Estado de paginación por tabla (key -> { page, limit, total })
const estadosPaginacion = {};

function crearPagState(key, total = 0, page = 1, limit = 20) {
  estadosPaginacion[key] = { page, limit, total };
}

function actualizarPagState(key, total, page, limit) {
  estadosPaginacion[key] = { page, limit, total };
}

function getPagState(key) {
  return estadosPaginacion[key] || { page: 1, limit: 20, total: 0 };
}

function renderPaginacion(containerId, key, onPageChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const st = getPagState(key);
  const totalPages = Math.ceil(st.total / st.limit) || 1;
  container.innerHTML =
    '<div class="pag-controls" data-pag-key="' + key + '">' +
    '<button class="pag-btn" data-page="1" ' + (st.page <= 1 ? 'disabled' : '') + '>&laquo;</button>' +
    '<button class="pag-btn" data-page="' + (st.page - 1) + '" ' + (st.page <= 1 ? 'disabled' : '') + '>&lsaquo;</button>' +
    '<span class="pag-info">P\u00e1gina ' + st.page + ' de ' + totalPages + ' (' + st.total + ' registros)</span>' +
    '<button class="pag-btn" data-page="' + (st.page + 1) + '" ' + (st.page >= totalPages ? 'disabled' : '') + '>&rsaquo;</button>' +
    '<button class="pag-btn" data-page="' + totalPages + '" ' + (st.page >= totalPages ? 'disabled' : '') + '>&raquo;</button>' +
    '</div>';
  container.querySelector('.pag-controls').addEventListener('click', function(e) {
    const btn = e.target.closest('.pag-btn');
    if (!btn || btn.disabled) return;
    const p = parseInt(btn.dataset.page);
    const k = this.dataset.pagKey;
    const s = getPagState(k);
    if (isNaN(p) || p < 1 || p > Math.ceil(s.total / s.limit) || p === s.page) return;
    estadosPaginacion[k].page = p;
    onPageChange();
  });
}

async function fetchPaginated(url, key, options = {}) {
  const st = getPagState(key);
  const sep = url.includes('?') ? '&' : '?';
  const fullUrl = url + sep + 'page=' + st.page + '&limit=' + st.limit;
  const res = await fetchWithAuth(fullUrl, options);
  const json = await res.json();
  // el servidor devuelve { data, total, page, limit }
  actualizarPagState(key, json.total, json.page, json.limit);
  return json.data;
}

async function fetchPaginatedWithQuery(url, key, q) {
  const st = getPagState(key);
  const sep = url.includes('?') ? '&' : '?';
  const fullUrl = url + sep + 'q=' + encodeURIComponent(q) + '&page=' + st.page + '&limit=' + st.limit;
  const res = await fetchWithAuth(fullUrl);
  const json = await res.json();
  actualizarPagState(key, json.total, json.page, json.limit);
  return json.data;
}

async function fetchPaginatedWithId(url, key) {
  const st = getPagState(key);
  const sep = url.includes('?') ? '&' : '?';
  const fullUrl = url + sep + 'page=' + st.page + '&limit=' + st.limit;
  const res = await fetchWithAuth(fullUrl);
  const json = await res.json();
  actualizarPagState(key, json.total, json.page, json.limit);
  return json.data;
}

// Fetch paginado sin estado (para búsquedas puntuales por ID)
async function fetchPaginatedSimple(url) {
  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error('Error del servidor');
  const json = await res.json();
  return json.data || json;
}

async function fetchWithAuth(url, options = {}) {
  const token = getToken();
  if (token) {
    if (url.includes('?')) {
      url += '&token=' + encodeURIComponent(token);
    } else {
      url += '?token=' + encodeURIComponent(token);
    }
  }
  const res = await fetch(url, options);
  if (res.status === 401) {
    forzarLogout('Sesión expirada');
    throw new Error('Sesión expirada');
  }
  return res;
}

function forzarLogout(mensaje) {
  clearToken();
  const overlay = $('loginOverlay');
  if (overlay) {
    overlay.style.display = 'flex';
    if (mensaje) mostrarToast(mensaje, 'warning');
  } else {
    window.location.href = 'home.html';
  }
}

// Verifica sesión al cargar la página; redirige si expiró
async function verificarSesion() {
  const token = getToken();
  if (!token) return false;
  try {
    const res = await fetch(API_BASE + '/session?token=' + encodeURIComponent(token));
    const data = await res.json();
    if (data && data.valid) return true;
    // Solo cerrar sesión si el token no cambió mientras se validaba.
    // Esto evita que una validación vieja (con token anterior) cierre la
    // sesión recién creada al iniciar sesión.
    if (getToken() === token) {
      forzarLogout('Tu sesión ha expirado. Inicia sesión de nuevo.');
    }
    return false;
  } catch {
    return true; // si falla la red, asume válido para no bloquear
  }
}
