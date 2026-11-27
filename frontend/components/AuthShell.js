import { useState } from 'react';
import Link from 'next/link';
import { KeyRound, ShieldCheck, Users, Activity } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ErrorNote, Logo, Spinner } from './ui';

const POINTS = [
  { icon: KeyRound, title: 'AES-256 Encrypted Storage', text: 'Your files stay private and protected' },
  { icon: Users, title: 'Controlled Sharing', text: 'Set permissions and expiry' },
  { icon: Activity, title: 'Track & Monitor', text: 'Full audit logs and activity tracking' },
];

export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-surface p-3 sm:p-6">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl lg:grid-cols-[1.05fr_1fr]">
        <div className="relative hidden flex-col justify-between bg-navy-900 p-10 text-white lg:flex">
          <Link href="/"><Logo dark /></Link>
          <div>
            <h2 className="text-4xl font-extrabold leading-tight tracking-tight">Secure file sharing<br />for a safer tomorrow</h2>
            <p className="mt-4 max-w-sm text-slate-300">Upload, store, and share your important files with end-to-end security, encryption, and complete control.</p>
            <ul className="mt-8 space-y-5">
              {POINTS.map((p) => (
                <li key={p.title} className="flex items-center gap-4">
                  <div className="rounded-full bg-white/10 p-3"><p.icon className="h-5 w-5 text-brand-500" /></div>
                  <div><div className="font-semibold">{p.title}</div><div className="text-sm text-slate-400">{p.text}</div></div>
                </li>))}
            </ul>
          </div>
          <ShieldCheck className="absolute -right-10 -top-10 h-56 w-56 text-white/[0.04]" aria-hidden="true" />
          <p className="text-xs text-slate-500">Files are encrypted on the server before they reach storage.</p>
        </div>
        <div className="flex flex-col justify-center px-6 py-10 sm:px-12 sm:py-14">
          <div className="mb-8 lg:hidden"><Logo /></div>
          <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
          <p className="mb-8 mt-1.5 text-ink-soft">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Second step after password sign-in (or OAuth) for accounts with two-factor authentication. */
export function MfaStep({ mfaToken, onDone }) {
  const { verifyMfa } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { onDone(await verifyMfa(mfaToken, code)); } catch (err) { setError(errorMessage(err)); setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorNote>{error}</ErrorNote>
      <div>
        <label className="label" htmlFor="code">6-digit code</label>
        <input id="code" className="input text-center text-xl tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
          autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" />
        <p className="mt-1.5 text-xs text-ink-faint">Open your authenticator app and enter the current code for TrustShare.</p>
      </div>
      <button className="btn-primary w-full" disabled={busy || code.length !== 6}>{busy ? <Spinner className="!text-white" /> : 'Verify and sign in'}</button>
    </form>
  );
}
