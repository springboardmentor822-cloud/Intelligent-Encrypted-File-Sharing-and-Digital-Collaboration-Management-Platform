// Global login state (Zustand: a tiny alternative to Redux / Context)
import { create } from "zustand";
import api, { clearTokens, saveTokens } from "../lib/api";

export const useAuth = create((set) => ({
  user: null,
  loading: true,

  // called once when the app opens: if a token exists, load the user
  init: async () => {
    if (!localStorage.getItem("access_token")) return set({ loading: false });
    try {
      const { data } = await api.get("/auth/me");
      set({ user: data, loading: false });
    } catch {
      clearTokens();
      set({ user: null, loading: false });
    }
  },

  login: async (email, password, otp) => {
    const { data } = await api.post("/auth/login", { email, password, otp: otp || null });
    saveTokens(data.access_token, data.refresh_token);
    set({ user: data.user });
  },

  // Google sign-in: the backend redirects back with a one-time code which we swap for the real tokens
  finishOAuth: async (code) => {
    const { data } = await api.post("/auth/oauth/exchange", { code });
    saveTokens(data.access_token, data.refresh_token);
    set({ user: data.user });
  },

  logout: async () => {
    try {
      await api.post("/auth/logout", { refresh_token: localStorage.getItem("refresh_token") });
    } catch { /* ignore: we log out locally anyway */ }
    clearTokens();
    set({ user: null });
  },

  setUser: (user) => set({ user }),
}));

export const isAdmin = (user) => user?.roles?.includes("admin");
export const canUpload = (user) => user?.roles?.some((r) => r === "admin" || r === "user");
