import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AuthShell from '@/components/AuthShell';
import { ErrorNote, Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { homeFor, useAuth } from '@/lib/auth';

export default function Register() {
  const router = useRouter();
  const { user, loading, login } = useAuth();
  const [f, setF] = useState({ full_name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!loading && user) router.replace(homeFor(user)); }, [loading, user, router]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await api.post('/auth/register', f);
      const u = await login(f.email, f.password);
      router.push(homeFor(u));
    } catch (err) { setError(errorMessage(err)); setBusy(false); }
  };
  const ok = { len: f.password.length >= 8, mix: /[A-Za-z]/.test(f.password) && /\d/.test(f.password) };
  return (
    <AuthShell title="Create your account" subtitle="Start sharing files securely in minutes">
      <form onSubmit={submit} className="space-y-5">
        <ErrorNote>{error}</ErrorNote>
        <div><label className="label" htmlFor="name">Full name</label><input id="name" required autoComplete="name" className="input" value={f.full_name} onChange={set('full_name')} /></div>
        <div><label className="label" htmlFor="email">Email address</label><input id="email" type="email" required autoComplete="email" className="input" placeholder="you@example.com" value={f.email} onChange={set('email')} /></div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" required autoComplete="new-password" className="input" value={f.password} onChange={set('password')} />
          <ul className="mt-2 space-y-0.5 text-xs">
            <li className={ok.len ? 'text-emerald-600' : 'text-ink-faint'}>{ok.len ? '✓' : '○'} At least 8 characters</li>
            <li className={ok.mix ? 'text-emerald-600' : 'text-ink-faint'}>{ok.mix ? '✓' : '○'} A mix of letters and numbers</li>
          </ul>
        </div>
        <button className="btn-primary w-full" disabled={busy || !ok.len || !ok.mix}>{busy ? <Spinner className="!text-white" /> : 'Create account'}</button>
        <p className="text-center text-sm text-ink-soft">Already have an account? <Link href="/login" className="font-semibold text-brand-600 hover:underline">Sign in</Link></p>
      </form>
    </AuthShell>
  );
}
