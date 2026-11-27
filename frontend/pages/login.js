import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import AuthShell, { MfaStep } from '@/components/AuthShell';
import { ErrorNote, Spinner } from '@/components/ui';
import { API_URL, api, errorMessage } from '@/lib/api';
import { homeFor, useAuth } from '@/lib/auth';

const safeNext = (n) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n : null);
const BRAND = {
  google: <svg viewBox="0 0 24 24" className="h-5 w-5"><path fill="#4285F4" d="M22.5 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.2-4.8 3.2-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.4V7H2.1a11 11 0 0 0 0 10z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.3 1.7l3.2-3.2A11 11 0 0 0 2.1 7l3.7 2.8C6.700 7.300 9.100 5.400 12 5.400z"/></svg>,
  microsoft: <svg viewBox="0 0 24 24" className="h-5 w-5"><path fill="#F25022" d="M2 2h9.500v9.500H2z"/><path fill="#7FBA00" d="M12.500 2H22v9.500h-9.500z"/><path fill="#00A4EF" d="M2 12.500h9.500V22H2z"/><path fill="#FFB900" d="M12.500 12.500H22V22h-9.500z"/></svg>,
};

export default function Login() {
  const router = useRouter();
  const { user, loading, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mfaToken, setMfaToken] = useState(null);
  const [providers, setProviders] = useState([]);

  useEffect(() => {
    setEmail(localStorage.getItem('ts_email') || ''); setRemember(!!localStorage.getItem('ts_email'));
    api.get('/auth/oauth/providers').then((r) => setProviders(r.data)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.error) setError(String(router.query.error));
    else if (router.query.expired) setError('Your session expired. Please sign in again.');
  }, [router.isReady, router.query]);
  useEffect(() => { if (!loading && user) router.replace(safeNext(router.query.next) || homeFor(user)); }, [loading, user, router]);

  const done = (u) => router.push(safeNext(router.query.next) || homeFor(u));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      remember ? localStorage.setItem('ts_email', email) : localStorage.removeItem('ts_email');
      const res = await login(email, password);
      if (res.mfa_required) { setMfaToken(res.mfa_token); setBusy(false); } else done(res);
    } catch (err) { setError(errorMessage(err)); setBusy(false); }
  };

  return (
    <AuthShell title={mfaToken ? 'Two-step verification' : 'Welcome back'} subtitle={mfaToken ? 'Enter the code from your authenticator app.' : 'Sign in to your TrustShare account'}>
      {mfaToken ? <MfaStep mfaToken={mfaToken} onDone={done} /> : (
        <form onSubmit={submit} className="space-y-5">
          <ErrorNote>{error}</ErrorNote>
          <div>
            <label className="label" htmlFor="email">Email address</label>
            <div className="relative"><Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <input id="email" type="email" required autoComplete="email" className="input !pl-10" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between"><label className="text-sm font-semibold" htmlFor="password">Password</label>
              <Link href="/forgot-password" className="text-sm font-semibold text-brand-600 hover:underline">Forgot password?</Link></div>
            <div className="relative"><Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <input id="password" type={show ? 'text' : 'password'} required autoComplete="current-password" className="input !px-10" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint" aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={remember} onChange={(e) => setRemember(e.target.checked)} />Remember my email</label>
          <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner className="!text-white" /> : 'Sign in'}</button>

          {providers.length > 0 && (<>
            <div className="flex items-center gap-3 text-sm text-ink-faint"><span className="h-px flex-1 bg-slate-200" />or continue with<span className="h-px flex-1 bg-slate-200" /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              {providers.map((p) => (
                <a key={p.id} href={`${API_URL}/auth/oauth/${p.id}/login`} className="btn-secondary">{BRAND[p.id]}{p.label}</a>))}
            </div></>)}
          <p className="text-center text-sm text-ink-soft">Don’t have an account? <Link href="/register" className="font-semibold text-brand-600 hover:underline">Sign up</Link></p>
        </form>)}
    </AuthShell>
  );
}
