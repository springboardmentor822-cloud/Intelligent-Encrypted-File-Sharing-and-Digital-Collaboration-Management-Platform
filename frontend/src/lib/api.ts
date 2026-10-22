import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000",
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor: Automatically attach Bearer token if present
api.interceptors.request.use(
  (config) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("trustshare_token");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    // Let browser set multipart/form-data boundary when data is FormData
    if (typeof FormData !== "undefined" && config.data instanceof FormData) {
      delete config.headers["Content-Type"];
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: Redirect to /login if token expires or is revoked
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only redirect to login if it's an actual authentication failure (expired/invalid JWT)
    // NEVER redirect if it's a folder/file password check or download verification error!
    const url = error.config?.url || "";
    const isResourcePasswordError =
      url.includes("/verify-password") ||
      url.includes("/password") ||
      url.includes("/download");

    if (
      typeof window !== "undefined" &&
      error.response?.status === 401 &&
      !isResourcePasswordError
    ) {
      localStorage.removeItem("trustshare_token");
      localStorage.removeItem("trustshare_user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;