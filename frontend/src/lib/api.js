// All communication with the FastAPI backend goes through this file.
import axios from "axios";

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const api = axios.create({ baseURL: API_URL });

export function saveTokens(access, refresh) {
  localStorage.setItem("access_token", access);
  localStorage.setItem("refresh_token", refresh);
}
export function clearTokens() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

// Attach the JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// If the access token expired (401), get a new one with the refresh token and retry once
let refreshing = null;
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const url = original?.url || "";
    const refreshToken = localStorage.getItem("refresh_token");
    const skip = url.includes("/auth/login") || url.includes("/auth/refresh") || url.includes("/share/public");
    if (error.response?.status === 401 && !original._retry && !skip && refreshToken) {
      original._retry = true;
      try {
        refreshing =
          refreshing ||
          axios.post(`${API_URL}/auth/refresh`, { refresh_token: refreshToken }).finally(() => (refreshing = null));
        const { data } = await refreshing;
        saveTokens(data.access_token, data.refresh_token);
        original.headers.Authorization = `Bearer ${data.access_token}`;
        return api(original);
      } catch {
        clearTokens();
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

// Turn any error into a readable message (also works when the error body is a Blob)
export async function errorMessage(err) {
  let data = err?.response?.data;
  if (data instanceof Blob) {
    try { data = JSON.parse(await data.text()); } catch { data = null; }
  }
  const detail = data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg).join(", ");
  if (err?.code === "ERR_NETWORK") return "Cannot reach the server. Is the backend running?";
  return "Something went wrong";
}

// Download/preview a file: fetch as blob, then save or open it
function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function openBlob(blob) {
  window.open(URL.createObjectURL(blob), "_blank");
}

export async function downloadFile(file) {
  const { data } = await api.get(`/files/${file.id}/download`, { responseType: "blob" });
  saveBlob(data, file.original_name);
}
export async function previewFile(file) {
  const { data } = await api.get(`/files/${file.id}/download`, { params: { inline: true }, responseType: "blob" });
  openBlob(new Blob([data], { type: file.mime_type }));
}
export async function accessSharedFile(token, password, mode, fileName, mimeType) {
  const { data } = await api.post(`/share/public/${token}/access`, { password, mode }, { responseType: "blob" });
  if (mode === "download") saveBlob(data, fileName);
  else openBlob(new Blob([data], { type: mimeType }));
}

export default api;

// Download a CSV report: the browser asks the API (with the login token) and saves the answer as a file
export async function downloadCsv(path, params, filename) {
  const { data } = await api.get(path, { params: { ...params, format: "csv" }, responseType: "blob" });
  saveBlob(data, filename);
}
