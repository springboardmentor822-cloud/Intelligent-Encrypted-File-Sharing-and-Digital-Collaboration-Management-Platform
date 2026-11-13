import axios from "axios";

const KEY = "ts_token";
export const tokenStore = {
  get: () => sessionStorage.getItem(KEY) || localStorage.getItem(KEY),
  set: (t: string, remember: boolean) => { tokenStore.clear(); (remember ? localStorage : sessionStorage).setItem(KEY, t); },
  clear: () => { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); },
};

const VISIT = "ts_admin_visit";
/** Admin Visit grant: a short-lived, password-gated token that lets any signed-in account open the
 *  admin panel. It lives in sessionStorage only and is sent as X-Admin-Visit on /admin calls. */
export const adminVisit = {
  get: () => sessionStorage.getItem(VISIT),
  set: (t: string) => sessionStorage.setItem(VISIT, t),
  clear: () => sessionStorage.removeItem(VISIT),
};

export const api = axios.create({ baseURL: "/api" });
api.interceptors.request.use((c) => {
  const t = tokenStore.get(); if (t) c.headers.Authorization = `Bearer ${t}`;
  const v = adminVisit.get(); if (v && String(c.url).startsWith("/admin")) c.headers["X-Admin-Visit"] = v;
  return c;
});
api.interceptors.response.use((r) => r, (e) => {
  const url = String(e.config?.url || "");
  if (e.response?.status === 401 && tokenStore.get() && !url.includes("/auth/login")) {
    tokenStore.clear(); if (!location.pathname.startsWith("/login")) location.href = "/login?expired=1";
  }
  // Admin Visit grant expired or rejected: drop it and send the user back to the gate.
  const visitDenied = e.response?.status === 403 && url.startsWith("/admin") &&
    (e.response?.headers?.["x-admin-visit"] === "required" ||
     /administrator privileges|admin visit/i.test(String(e.response?.data?.detail || "")));
  if (visitDenied) {
    adminVisit.clear();
    if (location.pathname.startsWith("/admin")) location.href = "/admin/login?expired=1";
  }
  return Promise.reject(e);
});

export function errMsg(e: any): string {
  const resp = e?.response;
  const d = resp?.data?.detail ?? resp?.data?.message ?? resp?.data?.error;
  if (typeof d === "string" && d.trim()) return d;
  if (Array.isArray(d)) {
    const m = d.map((x: any) => (x.msg || "").replace(/^Value error, /, "")).filter(Boolean).join("; ");
    if (m) return m;
  }
  if (resp?.status === 429) return "Too many requests. Please wait a moment.";
  if (resp?.status === 401) return "Your session has expired. Please sign in again.";
  if (resp?.status === 403) return "You do not have permission to do that.";
  if (resp?.status === 404) return "The requested item could not be found.";
  if (resp?.status === 413) return "That file is too large to upload.";
  if (resp?.status === 415) return "That file type is not supported.";
  if (resp?.status >= 500) return "The server ran into a problem. Please try again in a moment.";
  if (!resp) return e?.message ? `Cannot reach the server (${e.message}).` : "Cannot reach the server. Is the backend running?";
  return `Request failed (${resp.status}${resp.statusText ? " " + resp.statusText : ""}). Please try again.`;
}

export const fmtBytes = (n: number) => {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"]; const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), 4);
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
};
export const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
export const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function openBlob(url: string, filename?: string, headers?: Record<string, string>) {
  // Open the tab synchronously (before awaiting) so browsers do not treat it as a pop-up.
  const win = filename ? null : window.open("about:blank", "_blank");
  if (win) win.opener = null;
  try {
    const r = await api.get(url, { responseType: "blob", headers });
    const u = URL.createObjectURL(r.data);
    if (filename) {
      const a = document.createElement("a"); a.href = u; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 5000);
    } else if (win) {
      win.location.href = u;
    } else {
      window.open(u, "_blank", "noopener");
    }
  } catch (e) {
    if (win) win.close();
    throw e;
  }
}
