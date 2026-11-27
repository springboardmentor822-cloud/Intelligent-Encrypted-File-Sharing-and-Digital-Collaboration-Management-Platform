import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AuthShell from '@/components/AuthShell';
import { ErrorNote, Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

export default function Reset() {
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.post('/auth/reset-password', { token: router.query.token, new_password: pw }); setDone(true); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };
  return (
    <AuthShell title="Choose a new password" subtitle="Use at least 8 characters with letters and numbers.">
      {done ? (
        <div className="space-y-4 text-center"><p className="font-semibold">Password updated</p>
          <p className="text-sm text-ink-soft">All your other sessions were signed out for safety.</p>
          <Link href="/login" className="btn-primary w-full">Sign in</Link></div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <ErrorNote>{error}</ErrorNote>
          <div><label className="label" htmlFor="pw">New password</label><input id="pw" type="password" required minLength={8} autoComplete="new-password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
          <button className="btn-primary w-full" disabled={busy || !router.query.token}>{busy ? <Spinner className="!text-white" /> : 'Update password'}</button>
        </form>)}
    </AuthShell>
  );
}
