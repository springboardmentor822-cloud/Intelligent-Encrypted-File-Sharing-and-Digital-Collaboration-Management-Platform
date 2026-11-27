import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { api, tokens } from './api';

const AuthContext = createContext(null);

export const homeFor = (user) => (user?.role === 'admin' ? '/admin' : user?.role === 'guest' ? '/app/shared-with-me' : '/app');

export function AuthProvider({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    if (!tokens.access && !tokens.refresh) { setUser(null); setLoading(false); return; }
    try { setUser((await api.get('/auth/me')).data); } catch { setUser(null); } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadMe(); }, [loadMe]);

  const finish = (data) => { tokens.set(data); setUser(data.user); return data.user; };

  const value = {
    user, loading, setUser, refreshUser: loadMe,
    /** Returns {mfa_required, mfa_token} when a second step is needed, otherwise the signed-in user. */
    async login(email, password) {
      const { data } = await api.post('/auth/login', { email, password });
      return data.mfa_required ? data : finish(data);
    },
    async verifyMfa(mfa_token, code) { return finish((await api.post('/auth/mfa/verify', { mfa_token, code })).data); },
    async exchangeOAuth(code) {
      const { data } = await api.post('/auth/oauth/exchange', { code });
      return data.mfa_required ? data : finish(data);
    },
    async logout() {
      try { await api.post('/auth/logout'); } catch { /* session may already be gone */ }
      tokens.clear(); setUser(null); router.push('/login');
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
