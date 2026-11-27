import { useState } from 'react';
import { api, errorMessage, tokens } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/router';
import { useToast } from './Toast';
import { ErrorNote, Spinner } from './ui';

export default function SettingsView() {
  const toast = useToast();
  const router = useRouter();
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user.full_name);
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState({});
  const hasPassword = !user.oauth_provider;

  const saveName = async (e) => {
    e.preventDefault(); setBusy({ n: true }); setErr({});
    try { const { data } = await api.patch('/auth/me', { full_name: name }); setUser(data); toast('Profile updated'); } catch (x) { setErr({ n: errorMessage(x) }); } finally { setBusy({}); }
  };
  const changePw = async (e) => {
    e.preventDefault(); setBusy({ p: true }); setErr({});
    try { await api.post('/auth/change-password', pw); toast('Password changed. Please sign in again.'); tokens.clear(); setUser(null); router.push('/login'); }
    catch (x) { setErr({ p: errorMessage(x) }); setBusy({}); }
  };
  return (
    <div className="grid max-w-4xl gap-5">
      <form onSubmit={saveName} className="card space-y-4 p-6">
        <h2 className="text-lg font-bold">Profile</h2><ErrorNote>{err.n}</ErrorNote>
        <div><label className="label" htmlFor="nm">Full name</label><input id="nm" className="input" required value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label" htmlFor="em">Email</label><input id="em" className="input !bg-slate-50" disabled value={user.email} /></div>
        <div className="text-sm text-ink-soft">Role: <b className="capitalize text-ink">{user.role}</b></div>
        <button className="btn-primary" disabled={busy.n || name === user.full_name}>{busy.n ? <Spinner className="!text-white" /> : 'Save changes'}</button>
      </form>
      {hasPassword && (
        <form onSubmit={changePw} className="card space-y-4 p-6">
          <h2 className="text-lg font-bold">Change password</h2><ErrorNote>{err.p}</ErrorNote>
          <div><label className="label" htmlFor="cp">Current password</label><input id="cp" type="password" autoComplete="current-password" className="input" required value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></div>
          <div><label className="label" htmlFor="np">New password</label><input id="np" type="password" autoComplete="new-password" className="input" required minLength={8} value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />
            <p className="mt-1.5 text-xs text-ink-faint">At least 8 characters, with letters and numbers. You’ll be signed out everywhere.</p></div>
          <button className="btn-primary" disabled={busy.p}>{busy.p ? <Spinner className="!text-white" /> : 'Change password'}</button>
        </form>)}
    </div>
  );
}
