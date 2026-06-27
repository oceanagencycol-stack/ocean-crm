// Cliente API del CRM — habla con las funciones serverless de Vercel
const BASE = import.meta.env.VITE_API_URL || '';

export function getToken() { return localStorage.getItem('ocean_token'); }
export function setToken(t) { localStorage.setItem('ocean_token', t); }
export function clearToken() { localStorage.removeItem('ocean_token'); }
export function getUser() {
  try { return JSON.parse(localStorage.getItem('ocean_user') || 'null'); }
  catch { return null; }
}
export function setUser(u) { localStorage.setItem('ocean_user', JSON.stringify(u)); }

async function req(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api/${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));

  // Solo tratamos el 401 como "sesión expirada" si HABÍA un token
  // (es decir, el usuario ya estaba dentro y su sesión venció).
  // En el login NO hay token, así que un 401 ahí = credenciales inválidas,
  // y dejamos que el error se muestre normalmente.
  if (res.status === 401 && token) {
    clearToken();
    window.location.reload();
    throw new Error('Tu sesión expiró. Vuelve a entrar.');
  }

  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

export const api = {
  login: (email, password) => req('auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => req('me'),
  clientes: () => req('clientes'),
  detalleCliente: (id) => req(`clientes/${id}/detalle`),
  crearCliente: (c) => req('clientes', { method: 'POST', body: JSON.stringify(c) }),
  actualizarCliente: (id, c) => req(`clientes/${id}`, { method: 'PUT', body: JSON.stringify(c) }),
  eliminarCliente: (id) => req(`clientes/${id}`, { method: 'DELETE' }),
  dashboard: () => req('dashboard'),
  analisisIA: () => req('ai/analisis'),
  // Conversaciones / WhatsApp Web propio
  conversaciones: () => req('conversaciones'),
  mensajesDe: (id) => req(`conversaciones/${id}/mensajes`),
  enviarWhatsApp: (cliente_id, mensaje) => req('whatsapp/enviar', { method: 'POST', body: JSON.stringify({ cliente_id, mensaje }) }),
  // IA conversacional
  chatIA: (mensaje, historial) => req('ai/chat', { method: 'POST', body: JSON.stringify({ mensaje, historial }) }),
  // Seguimientos
  seguimientos: () => req('seguimientos'),
  usuarios: () => req('usuarios'),
  lanzarCampana: (c) => req('campanas', { method: 'POST', body: JSON.stringify(c) }),
};
