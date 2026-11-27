import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, Database, FileText, HardDrive, KeyRound, Link2, MoreVertical, Plus, RefreshCw, ShieldAlert, Trash2, Unlock, Users, XCircle, CheckCircle2, AlertTriangle, Smartphone } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatBytes, formatDate, timeAgo } from '@/lib/format';
import { ChartCard, StackedBars, Trend } from './charts';
import { ConfirmModal } from './FileDialogs';
import { useToast } from './Toast';
import { Badge, EmptyState, ErrorNote, FileIcon, Menu, MenuItem, Modal, PageLoader, Pagination, Spinner, StatCard, StatusBadge, Table } from './ui';

const ROLE_TONE = { admin: 'purple', user: 'blue', guest: 'slate' };

export function AdminHome() {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/admin/overview').then((r) => setD(r.data)).catch((e) => setError(errorMessage(e))); }, []);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!d) return <PageLoader />;
  const { counts: c, security: s, files: f } = d;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} tone="blue" label="Users" value={c.users} sub={`${c.active_users} active`} />
        <StatCard icon={FileText} tone="green" label="Files" value={c.files.toLocaleString()} sub="not in trash" />
        <StatCard icon={HardDrive} tone="purple" label="Encrypted storage" value={formatBytes(c.storage_bytes)} sub="all file versions" />
        <StatCard icon={Link2} tone="rose" label="Active share links" value={c.active_links} sub="not expired or revoked" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={CheckCircle2} tone="green" label="Successful logins · 30 days" value={s.successful_logins} sub={`${s.success_rate}% success rate`} />
        <StatCard icon={XCircle} tone="rose" label="Failed logins" value={s.failed_logins} sub={`${s.failure_rate}% failure rate`} />
        <StatCard icon={AlertTriangle} tone="amber" label="Unauthorized attempts" value={s.unauthorized_attempts} sub={`${s.blocked_attempts} blocked`} />
        <StatCard icon={ShieldAlert} tone="purple" label="Security events" value={s.security_events} sub={<Link href="/admin/security" className="font-semibold text-brand-600">Open security dashboard</Link>} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Uploads by type"><StackedBars data={f.uploads_series} keys={['documents', 'images', 'videos', 'others']} /></ChartCard>
        <ChartCard title="Downloads"><Trend data={f.downloads_series} keys={['total', 'unique_users', 'shared']} area /></ChartCard>
      </div>
    </div>
  );
}

function CreateUserModal({ onClose, onDone }) {
  const [f, setF] = useState({ full_name: '', email: '', password: '', role: 'user' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.post('/admin/users', f); onDone(); onClose(); } catch (err) { setError(errorMessage(err)); setBusy(false); }
  };
  return (
    <Modal title="Add user" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4"><ErrorNote>{error}</ErrorNote>
        <div><label className="label" htmlFor="cn">Full name</label><input id="cn" className="input" required value={f.full_name} onChange={set('full_name')} /></div>
        <div><label className="label" htmlFor="ce">Email</label><input id="ce" type="email" className="input" required value={f.email} onChange={set('email')} /></div>
        <div><label className="label" htmlFor="cpw">Temporary password</label><input id="cpw" type="password" className="input" required minLength={8} autoComplete="new-password" value={f.password} onChange={set('password')} /></div>
        <div><label className="label" htmlFor="cr">Role</label><select id="cr" className="input" value={f.role} onChange={set('role')}><option value="user">User: upload, share and manage files</option><option value="guest">Guest: view files shared with them only</option><option value="admin">Admin: manage users and security</option></select></div>
        <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? <Spinner className="!text-white" /> : 'Add user'}</button></div>
      </form>
    </Modal>
  );
}

export function AdminUsers() {
  const toast = useToast();
  const { user: me } = useAuth();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const load = useCallback(() => api.get('/admin/users', { params: { q: q || undefined, page, page_size: 20 } }).then((r) => { setData(r.data); setError(''); }).catch((e) => setError(errorMessage(e))), [q, page]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const act = async (fn, ok) => { try { await fn(); toast(ok); load(); } catch (e) { toast(errorMessage(e), 'error'); } };
  const patch = (u, body, ok) => act(() => api.patch(`/admin/users/${u.id}`, body), ok);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input className="input !w-72" placeholder="Search name or email…" aria-label="Search users" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Add user</button>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <div className="card overflow-hidden">
        {!data ? <PageLoader /> : data.items.length === 0 ? <EmptyState icon={Users} title="No users found" /> : (<>
          <Table><thead className="bg-slate-50/60"><tr><th className="th">User</th><th className="th">Role</th><th className="th">Status</th><th className="th">2FA</th><th className="th">Storage</th><th className="th">Last sign-in</th><th className="th" /></tr></thead>
            <tbody>{data.items.map((u) => {
              const self = u.id === me.id;
              return (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="td"><div className="font-semibold">{u.full_name}{self && <span className="ml-2 text-xs font-normal text-ink-faint">(you)</span>}</div><div className="text-xs text-ink-faint">{u.email}</div></td>
                  <td className="td"><select aria-label={`Role for ${u.full_name}`} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm" disabled={self} value={u.role}
                    onChange={(e) => patch(u, { role: e.target.value }, `${u.full_name} is now ${e.target.value}`)}>{['admin', 'user', 'guest'].map((r) => <option key={r}>{r}</option>)}</select></td>
                  <td className="td"><Badge tone={u.is_active ? 'green' : 'red'}>{u.is_active ? 'Active' : 'Disabled'}</Badge></td>
                  <td className="td">{u.mfa_enabled ? <Badge tone="green">On</Badge> : <span className="text-ink-faint">Off</span>}</td>
                  <td className="td text-ink-soft">{formatBytes(u.storage_used)} / {formatBytes(u.storage_quota_bytes, 0)}</td>
                  <td className="td text-ink-soft">{u.last_login_at ? timeAgo(u.last_login_at) : 'Never'}</td>
                  <td className="td"><Menu trigger={<button className="btn-ghost !p-1.5" aria-label={`Actions for ${u.full_name}`}><MoreVertical className="h-4 w-4" /></button>}>
                    <MenuItem icon={Unlock} onClick={() => act(() => api.post(`/admin/users/${u.id}/unlock`), 'Sign-in lockout cleared')}>Clear lockout</MenuItem>
                    {u.mfa_enabled && <MenuItem icon={Smartphone} onClick={() => act(() => api.post(`/admin/users/${u.id}/reset-mfa`), 'Two-factor reset')}>Reset two-factor</MenuItem>}
                    {!self && <MenuItem icon={u.is_active ? XCircle : CheckCircle2} danger={u.is_active} onClick={() => patch(u, { is_active: !u.is_active }, u.is_active ? 'Account disabled' : 'Account enabled')}>{u.is_active ? 'Disable account' : 'Enable account'}</MenuItem>}
                  </Menu></td>
                </tr>);
            })}</tbody></Table>
          <Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={setPage} /></>)}
      </div>
      {creating && <CreateUserModal onClose={() => setCreating(false)} onDone={() => { toast('User added'); load(); }} />}
    </div>
  );
}

export function AdminFiles() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [del, setDel] = useState(null);
  const load = useCallback(() => api.get('/admin/files', { params: { q: q || undefined, page, page_size: 20 } }).then((r) => { setData(r.data); setError(''); }).catch((e) => setError(errorMessage(e))), [q, page]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input className="input !w-72" placeholder="Search file names…" aria-label="Search files" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <p className="text-sm text-ink-soft">Administrators see file details only. Contents stay private to their owners.</p>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <div className="card overflow-hidden">
        {!data ? <PageLoader /> : data.items.length === 0 ? <EmptyState icon={FileText} title="No files found" /> : (<>
          <Table><thead className="bg-slate-50/60"><tr><th className="th">File</th><th className="th">Owner</th><th className="th">Size</th><th className="th">Versions</th><th className="th">Uploaded</th><th className="th">State</th><th className="th" /></tr></thead>
            <tbody>{data.items.map((f) => (
              <tr key={f.id} className="border-t border-slate-100">
                <td className="td"><div className="flex items-center gap-3"><FileIcon category={f.category} name={f.name} /><span className="font-semibold">{f.name}</span></div></td>
                <td className="td">{f.owner_name}<div className="text-xs text-ink-faint">{f.owner_email}</div></td><td className="td text-ink-soft">{formatBytes(f.size_bytes)}</td>
                <td className="td">{f.current_version}</td><td className="td text-ink-soft">{formatDate(f.created_at)}</td>
                <td className="td">{f.deleted_at ? <Badge tone="amber">In trash</Badge> : <Badge tone="green">Active</Badge>}</td>
                <td className="td"><button className="btn-ghost !p-2 text-rose-600" aria-label={`Delete ${f.name}`} onClick={() => setDel(f)}><Trash2 className="h-4 w-4" /></button></td>
              </tr>))}</tbody></Table>
          <Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={setPage} /></>)}
      </div>
      {del && <ConfirmModal title="Delete this file?" danger cta="Delete permanently" onClose={() => setDel(null)}
        message={`“${del.name}” (owned by ${del.owner_name}) will be erased from storage and its owner will be notified. This is recorded in the audit log.`}
        onConfirm={async () => { await api.delete(`/admin/files/${del.id}`); toast('File deleted'); load(); }} />}
    </div>
  );
}

export function AdminSharing() {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/admin/sharing').then((r) => setD(r.data)).catch((e) => setError(errorMessage(e))); }, []);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!d) return <PageLoader />;
  const t = d.totals;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={Link2} tone="blue" label="Links created" value={t.links} />
        <StatCard icon={CheckCircle2} tone="green" label="Active links" value={t.active} />
        <StatCard icon={Activity} tone="amber" label="Expired" value={t.expired} />
        <StatCard icon={XCircle} tone="rose" label="Revoked" value={t.revoked} />
        <StatCard icon={Users} tone="purple" label="Shares with people" value={t.user_shares} sub="currently active" />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Most-opened shared files">
          {d.top_files.length === 0 ? <p className="py-6 text-center text-sm text-ink-soft">No links created yet.</p> : (
            <Table><thead><tr><th className="th">File</th><th className="th">Owner</th><th className="th">Links</th><th className="th">Opens</th><th className="th">Downloads</th></tr></thead>
              <tbody>{d.top_files.map((f, i) => <tr key={i} className="border-t border-slate-100"><td className="td font-semibold">{f.name}</td><td className="td">{f.owner}</td><td className="td">{f.links}</td><td className="td">{f.opens}</td><td className="td">{f.downloads}</td></tr>)}</tbody></Table>)}
        </ChartCard>
        <ChartCard title="Recent links">
          {d.recent_links.length === 0 ? <p className="py-6 text-center text-sm text-ink-soft">Nothing yet.</p> : (
            <Table><thead><tr><th className="th">File</th><th className="th">By</th><th className="th">Status</th><th className="th">Expires</th></tr></thead>
              <tbody>{d.recent_links.map((l) => <tr key={l.id} className="border-t border-slate-100"><td className="td font-semibold">{l.file_name}</td><td className="td">{l.created_by_name}</td><td className="td"><StatusBadge status={l.status} /></td><td className="td whitespace-nowrap text-ink-soft">{formatDate(l.expires_at, true)}</td></tr>)}</tbody></Table>)}
        </ChartCard>
      </div>
    </div>
  );
}

const SERVICE_LABEL = { postgres: 'PostgreSQL', mongodb: 'MongoDB', redis: 'Redis', object_storage: 'Object storage (S3)' };

function KeyManagement() {
  const toast = useToast();
  const [k, setK] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const load = useCallback(() => api.get('/admin/keys').then((r) => setK(r.data)).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  if (!k) return <Spinner />;
  const rotate = async () => {
    const { data } = await api.post('/admin/keys/rotate');
    toast(`${data.rewrapped} data key${data.rewrapped === 1 ? '' : 's'} re-wrapped under master key ${data.active_version}${data.failed ? `; ${data.failed} failed` : ''}`, data.failed ? 'error' : 'success'); load();
  };
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3"><div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600"><KeyRound className="h-5 w-5" /></div>
          <div><h2 className="font-bold">Encryption key management</h2><p className="text-sm text-ink-soft">Provider: <b>{k.provider}</b> · active master key: <b>{k.active_version}</b></p></div></div>
        <button className="btn-primary" onClick={() => setConfirm(true)} disabled={k.provider === 'aws_kms'}><RefreshCw className="h-4 w-4" />Re-wrap data keys</button>
      </div>
      <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
        {k.versions.length === 0 && <li className="px-4 py-3 text-ink-soft">No encrypted files yet.</li>}
        {k.versions.map((v) => <li key={v.kek_version} className="flex items-center justify-between px-4 py-2.5"><span>Master key <b>{v.kek_version}</b>{v.kek_version === k.active_version && <Badge tone="green" className="ml-2">Active</Badge>}</span><span className="text-ink-soft">{v.count} data key{v.count === 1 ? '' : 's'}</span></li>)}
      </ul>
      <p className="mt-3 text-xs text-ink-faint">{k.provider === 'aws_kms' ? 'AWS KMS rotates the master key itself; existing data keys keep working.'
        : 'To rotate: add a new key to MASTER_KEYS, set ACTIVE_KEY_VERSION to it, restart the API, then re-wrap. Files are never re-encrypted, and old keys can be retired once nothing uses them.'}
        {k.outdated > 0 && <b className="text-amber-700"> {k.outdated} data key{k.outdated === 1 ? ' is' : 's are'} still under an older master key.</b>}</p>
      {confirm && <ConfirmModal title="Re-wrap data keys?" cta="Re-wrap now" onClose={() => setConfirm(false)} onConfirm={rotate}
        message={`Every data key not protected by master key ${k.active_version} will be re-wrapped under it. Files stay readable throughout.`} />}
    </section>
  );
}

export function AdminSystem() {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api.get('/admin/system').then((r) => setD(r.data)).catch((e) => setError(errorMessage(e))), []);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!d) return <PageLoader />;
  const up = d.uptime_seconds; const uptime = up > 86400 ? `${Math.floor(up / 86400)}d ${Math.floor((up % 86400) / 3600)}h` : up > 3600 ? `${Math.floor(up / 3600)}h ${Math.floor((up % 3600) / 60)}m` : `${Math.floor(up / 60)}m`;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Object.entries(d.services).map(([k, s]) => (
          <div key={k} className="card flex items-center gap-4 p-5">
            <div className={`rounded-xl p-3 ${s.ok ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}><Database className="h-6 w-6" /></div>
            <div><div className="text-sm font-bold">{SERVICE_LABEL[k]}</div><div className={`text-sm font-semibold ${s.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{s.ok ? 'Operational' : 'Unreachable'}</div>
              {s.latency_ms != null && <div className="text-xs text-ink-faint">{s.latency_ms} ms</div>}</div>
          </div>))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Activity} tone="blue" label="API uptime" value={uptime} />
        <StatCard icon={Users} tone="purple" label="Users" value={d.totals.users} />
        <StatCard icon={FileText} tone="green" label="Encrypted file versions" value={d.totals.file_versions.toLocaleString()} />
        <StatCard icon={HardDrive} tone="rose" label="Stored ciphertext" value={formatBytes(d.totals.stored_bytes)} sub={d.redis.used_memory ? `Redis memory ${d.redis.used_memory}` : undefined} />
      </div>
      <KeyManagement />
    </div>
  );
}
