import { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Globe, KeyRound, Link2, ScrollText, ShieldCheck, Users, Fingerprint, Download, RefreshCw, Lock, Smartphone, LogOut } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, timeAgo } from '@/lib/format';
import { useToast } from './Toast';
import { Badge, ErrorNote, Modal, PageLoader, Spinner, StatusBadge } from './ui';

const ICONS = { aes256: [Lock, 'bg-emerald-50 text-emerald-600'], tls: [Globe, 'bg-brand-50 text-brand-600'], jwt: [KeyRound, 'bg-violet-50 text-violet-600'],
  oauth2: [Users, 'bg-rose-50 text-rose-600'], rbac: [ShieldCheck, 'bg-brand-50 text-brand-600'], share_links: [Link2, 'bg-brand-50 text-brand-600'],
  download_tracking: [Download, 'bg-brand-50 text-brand-600'], audit: [ScrollText, 'bg-brand-50 text-brand-600'], tokens: [Fingerprint, 'bg-brand-50 text-brand-600'], rotation: [RefreshCw, 'bg-emerald-50 text-emerald-600'] };
const STATUS = { active: ['green', 'Active'], dev: ['amber', 'Dev mode'], off: ['slate', 'Not set up'] };

export function MfaPanel() {
  const toast = useToast();
  const { user, refreshUser } = useAuth();
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [disabling, setDisabling] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const start = async () => { setError(''); try { setSetup((await api.post('/auth/mfa/setup')).data); } catch (e) { setError(errorMessage(e)); } };
  const enable = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.post('/auth/mfa/enable', { code }); setSetup(null); setCode(''); toast('Two-factor authentication is on'); refreshUser(); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };
  const disable = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.post('/auth/mfa/disable', { code, password: password || null }); setDisabling(false); setCode(''); setPassword(''); toast('Two-factor authentication is off'); refreshUser(); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3"><div className="rounded-xl bg-brand-50 p-2.5 text-brand-600"><Smartphone className="h-5 w-5" /></div>
          <div><h2 className="font-bold">Two-factor authentication</h2><p className="text-sm text-ink-soft">Require a code from an authenticator app when you sign in.</p></div></div>
        {user.mfa_enabled ? <div className="flex items-center gap-3"><Badge tone="green">On</Badge><button className="btn-secondary" onClick={() => { setError(''); setDisabling(true); }}>Turn off</button></div>
          : !setup && <button className="btn-primary" onClick={start}>Set up</button>}
      </div>
      <div className="mt-3"><ErrorNote>{!disabling && error}</ErrorNote></div>
      {setup && !user.mfa_enabled && (
        <form onSubmit={enable} className="mt-5 grid gap-6 border-t border-slate-100 pt-5 sm:grid-cols-[auto_1fr]">
          <div className="rounded-xl border border-slate-200 bg-white p-3"><QRCodeSVG value={setup.otpauth_uri} size={156} /></div>
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">1. Scan the QR code with Google Authenticator, Microsoft Authenticator or a similar app.<br />2. Enter the 6-digit code it shows.</p>
            <p className="text-xs text-ink-faint">Can’t scan? Enter this key manually: <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-ink">{setup.secret}</code></p>
            <div className="flex gap-2"><input className="input max-w-[11rem] text-center tracking-[0.3em]" inputMode="numeric" maxLength={6} placeholder="000000" aria-label="6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
              <button className="btn-primary" disabled={busy || code.length !== 6}>{busy ? <Spinner className="!text-white" /> : 'Turn on'}</button>
              <button type="button" className="btn-ghost" onClick={() => { setSetup(null); setCode(''); }}>Cancel</button></div>
          </div>
        </form>)}
      {disabling && (
        <Modal title="Turn off two-factor authentication" onClose={() => setDisabling(false)}>
          <form onSubmit={disable} className="space-y-4"><ErrorNote>{error}</ErrorNote>
            {!user.oauth_provider && <div><label className="label" htmlFor="dpw">Password</label><input id="dpw" type="password" className="input" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>}
            <div><label className="label" htmlFor="dc">Current 6-digit code</label><input id="dc" className="input" inputMode="numeric" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></div>
            <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setDisabling(false)}>Cancel</button><button className="btn-danger" disabled={busy}>Turn off</button></div></form>
        </Modal>)}
    </section>
  );
}

export function SessionsPanel() {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const load = useCallback(() => api.get('/auth/sessions').then((r) => setItems(r.data)).catch(() => setItems([])), []);
  useEffect(() => { load(); }, [load]);
  const revoke = async (id) => { try { await api.delete(`/auth/sessions/${id}`); toast('Session signed out'); load(); } catch (e) { toast(errorMessage(e), 'error'); } };
  const device = (ua = '') => (/Mobile|Android|iPhone/.test(ua) ? 'Mobile browser' : /Edg\//.test(ua) ? 'Microsoft Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Unknown device');
  return (
    <section className="card p-5">
      <h2 className="font-bold">Active sessions</h2><p className="mb-3 text-sm text-ink-soft">Devices currently signed in to your account.</p>
      {!items ? <Spinner /> : (
        <ul className="divide-y divide-slate-100">
          {items.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-3 text-sm">
              <div className="min-w-0 flex-1"><div className="font-semibold">{device(s.user_agent)} {s.current && <Badge tone="blue" className="ml-1">This device</Badge>}</div>
                <div className="text-xs text-ink-faint">IP {s.ip} · signed in {timeAgo(new Date(s.created_at * 1000).toISOString())}</div></div>
              {!s.current && <button className="btn-secondary !px-3 !py-1.5 !text-xs" onClick={() => revoke(s.id)}><LogOut className="h-3.5 w-3.5" />Sign out</button>}
            </li>))}
        </ul>)}
    </section>
  );
}

export function RecentSignIns() {
  const [items, setItems] = useState(null);
  useEffect(() => { api.get('/security/my-logins').then((r) => setItems(r.data.items)).catch(() => setItems([])); }, []);
  return (
    <section className="card p-5">
      <h2 className="font-bold">Recent sign-ins</h2><p className="mb-3 text-sm text-ink-soft">If you see something you don’t recognise, change your password and sign out other sessions.</p>
      {!items ? <Spinner /> : items.length === 0 ? <p className="text-sm text-ink-soft">No sign-ins recorded yet.</p> : (
        <ul className="divide-y divide-slate-100">{items.map((l, i) => (
          <li key={i} className="flex flex-wrap items-center gap-3 py-2.5 text-sm"><StatusBadge status={l.status} /><span className="font-mono text-xs">{l.ip}</span><span className="text-ink-soft">{l.location}</span>
            <span className="ml-auto text-xs text-ink-faint">{formatDate(l.ts, true)}</span></li>))}</ul>)}
    </section>
  );
}

/** The user-facing Security page: ten protections with live status, plus account-level controls. */
export function UserSecurity() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/security/overview').then((r) => setData(r.data)).catch((e) => setError(errorMessage(e))); }, []);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <PageLoader />;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {data.features.map((f) => {
          const [Icon, tone] = ICONS[f.key]; const [badge, label] = STATUS[f.status] || STATUS.active;
          return (
            <div key={f.key} className="card flex flex-col p-4">
              <div className="mb-3 flex items-start justify-between gap-2"><div className={`rounded-xl p-2.5 ${tone}`}><Icon className="h-5 w-5" /></div><Badge tone={badge}>{label}</Badge></div>
              <h3 className="text-sm font-bold">{f.name}</h3><p className="mt-1 text-sm text-ink-soft">{f.description}</p>
            </div>);
        })}
      </div>
      <p className="text-sm text-ink-soft">{data.account.encrypted_file_versions} encrypted file version{data.account.encrypted_file_versions === 1 ? '' : 's'} protected
        {data.account.key_versions.length > 0 && <> · master key version{data.account.key_versions.length > 1 ? 's' : ''} in use: {data.account.key_versions.map((k) => k.kek_version).join(', ')}</>}</p>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5"><MfaPanel /><SessionsPanel /></div>
        <RecentSignIns />
      </div>
    </div>
  );
}
