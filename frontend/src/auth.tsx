import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, tokenStore } from "./api";

export type User = { id: string; email: string; full_name: string; role: "user" | "admin"; is_verified: boolean; quota_bytes: number; prefs: any; has_password: boolean; oauth_provider?: string | null };
type Ctx = { user: User | null; loading: boolean; login: (email: string, password: string, remember: boolean) => Promise<User>; logout: () => Promise<void>; refresh: () => Promise<void>; setToken: (t: string) => Promise<void> };
const C = createContext<Ctx>(null as any);
export const useAuth = () => useContext(C);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!tokenStore.get());
  const refresh = async () => { try { setUser((await api.get("/auth/me")).data); } catch { setUser(null); } finally { setLoading(false); } };
  useEffect(() => { if (tokenStore.get()) refresh(); }, []);
  const login: Ctx["login"] = async (email, password, remember) => {
    const r = await api.post("/auth/login", { email, password, remember });
    tokenStore.set(r.data.access_token, remember); setUser(r.data.user); return r.data.user;
  };
  const logout = async () => { try { await api.post("/auth/logout"); } catch { /* token may already be invalid */ } tokenStore.clear(); setUser(null); };
  const setToken = async (t: string) => { tokenStore.set(t, false); await refresh(); };
  return <C.Provider value={{ user, loading, login, logout, refresh, setToken }}>{children}</C.Provider>;
}
