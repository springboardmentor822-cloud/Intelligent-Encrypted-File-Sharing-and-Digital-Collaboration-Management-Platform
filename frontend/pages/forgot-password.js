import { useState } from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import AuthShell from '@/components/AuthShell';
import { ErrorNote, Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.post('/auth/forgot-password', { email }); setSent(true); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };
  return (
    <AuthShell title="Reset your password" subtitle="We’ll email you a link to choose a new one.">
      {sent ? (
        <div className="space-y-4 text-center">
          <MailCheck className="mx-auto h-10 w-10 text-brand-600" />
          <p className="font-semibold">Check your inbox</p>
          <p className="text-sm text-ink-soft">If an account exists for {email}, a reset link is on its way. It expires in 30 minutes.</p>
          <Link href="/login" className="btn-secondary w-full">Back to sign in</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <ErrorNote>{error}</ErrorNote>
          <div><label className="label" htmlFor="email">Email address</label><input id="email" type="email" required className="input" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner className="!text-white" /> : 'Send reset link'}</button>
          <p className="text-center text-sm"><Link href="/login" className="font-semibold text-brand-600 hover:underline">Back to sign in</Link></p>
        </form>)}
    </AuthShell>
  );
}
