import axios from 'axios';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
const isBrowser = typeof window !== 'undefined';

export const tokens = {
  // "Remember me" -> localStorage (survives restarts); otherwise sessionStorage (cleared when the tab closes).
  get access() { return isBrowser ? localStorage.getItem('ts_access') || sessionStorage.getItem('ts_access') : null; },
  get refresh() { return isBrowser ? localStorage.getItem('ts_refresh') || sessionStorage.getItem('ts_refresh') : null; },
  set({ access_token, refresh_token }, remember) {
    const keep = remember ?? !!localStorage.getItem('ts_refresh');
    const [on, off] = keep ? [localStorage, sessionStorage] : [sessionStorage, localStorage];
    on.setItem('ts_access', access_token); on.setItem('ts_refresh', refresh_token);
    off.removeItem('ts_access'); off.removeItem('ts_refresh');
  },
  clear() { for (const s of [localStorage, sessionStorage]) { s.removeItem('ts_access'); s.removeItem('ts_refresh'); } },
};

/** Authenticated client with silent token refresh. */
export const api = axios.create({ baseURL: API_URL });
/** Client for public share-link pages (never sends credentials). */
export const publicApi = axios.create({ baseURL: API_URL });

api.interceptors.request.use((cfg) => {
  const t = tokens.access;
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

let refreshing = null;
api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const original = err.config;
    const url = original?.url || '';
    const canRefresh = err.response?.status === 401 && !original._retry && tokens.refresh
      && !url.includes('/auth/login') && !url.includes('/auth/refresh') && !url.includes('/auth/mfa/verify');
    if (!canRefresh) throw err;
    original._retry = true;
    refreshing = refreshing || axios
      .post(`${API_URL}/auth/refresh`, { refresh_token: tokens.refresh })
      .then((r) => { tokens.set(r.data); return r.data.access_token; })
      .catch((e) => { tokens.clear(); if (isBrowser) window.location.href = '/login?expired=1'; throw e; })
      .finally(() => { refreshing = null; });
    const access = await refreshing;
    original.headers.Authorization = `Bearer ${access}`;
    return api(original);
  }
);

/** Turn any axios error into a readable message. */
export function errorMessage(err, fallback = 'Something went wrong. Please try again.') {
  const d = err?.response?.data;
  if (d && typeof d === 'object' && !(d instanceof Blob)) {
    if (typeof d.detail === 'string') return d.detail;
    if (Array.isArray(d.detail) && d.detail[0]?.msg) return d.detail[0].msg.replace(/^Value error, /, '');
  }
  if (err?.response?.status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (err?.code === 'ERR_NETWORK') return 'Can’t reach the server. Check your connection and try again.';
  return fallback;
}

/** Errors from blob requests carry a Blob body; read the JSON message out of it. */
export async function blobErrorMessage(err, fallback) {
  const d = err?.response?.data;
  if (d instanceof Blob) {
    try { const j = JSON.parse(await d.text()); if (typeof j.detail === 'string') return j.detail; } catch { /* ignore */ }
  }
  return errorMessage(err, fallback);
}
