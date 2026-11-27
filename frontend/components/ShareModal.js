import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { Ban, Check, Copy, Link2, Trash2, UserPlus } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { formatDate, timeAgo } from '@/lib/format';
import { Badge, ErrorNote, Modal, Spinner, StatusBadge } from './ui';
import { useToast } from './Toast';

const EXPIRY = [[1, '1 hour'], [24, '24 hours'], [168, '7 days'], [720, '30 days']];

function LinkTab({ file }) {
  const toast = useToast();
  const [perm, setPerm] = useState('view');
  const [hours, setHours] = useState(24);
  const [max, setMax] = useState('');
  const [links, setLinks] = useState(null);
  const [fresh, setFresh] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => api.get('/shares/links', { params: { file_id: file.id } }).then((r) => setLinks(r.data.items)).catch((e) => setError(errorMessage(e))), [file.id]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setBusy(true); setError('');
    try {
      const { data } = await api.post('/shares/links', { file_id: file.id, permission: perm, expires_in_hours: hours, max_downloads: max ? Number(max) : null });
      setFresh(data); setCopied(false); load();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const copy = async () => { await navigator.clipboard.writeText(fresh.url); setCopied(true); toast('Link copied'); };
  const revoke = async (id) => { try { await api.delete(`/shares/links/${id}`); toast('Link revoked'); load(); } catch (e) { toast(errorMessage(e), 'error'); } };

  return (
    <div className="space-y-5">
      <ErrorNote>{error}</ErrorNote>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className="label" htmlFor="perm">People with the link can</label>
          <select id="perm" className="input" value={perm} onChange={(e) => setPerm(e.target.value)}><option value="view">View only</option><option value="download">View and download</option></select></div>
        <div><label className="label" htmlFor="exp">Link expires after</label>
          <select id="exp" className="input" value={hours} onChange={(e) => setHours(Number(e.target.value))}>{EXPIRY.map(([h, l]) => <option key={h} value={h}>{l}</option>)}</select></div>
        <div><label className="label" htmlFor="max">Download limit</label>
          <input id="max" type="number" min="1" className="input" placeholder="Unlimited" value={max} disabled={perm !== 'download'} onChange={(e) => setMax(e.target.value)} /></div>
      </div>
      <button className="btn-primary" onClick={create} disabled={busy}>{busy ? <Spinner className="!text-white" /> : <><Link2 className="h-4 w-4" />Create link</>}</button>

      {fresh && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-3.5">
          <p className="mb-2 text-xs font-semibold text-brand-700">Copy this link now. For your security it can’t be shown again.</p>
          <div className="flex gap-2"><input readOnly className="input !bg-white font-mono !text-xs" value={fresh.url} onFocus={(e) => e.target.select()} aria-label="Share link" />
            <button className="btn-primary shrink-0" onClick={copy}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copied' : 'Copy'}</button></div>
        </div>)}

      <div>
        <h3 className="mb-2 text-sm font-bold">Links for this file</h3>
        {!links ? <Spinner /> : links.length === 0 ? <p className="text-sm text-ink-soft">No links yet.</p> : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {links.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-3.5 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge status={l.status} /><span className="font-semibold">{l.permission === 'download' ? 'View & download' : 'View only'}</span></div>
                  <div className="mt-0.5 text-xs text-ink-faint">Created {timeAgo(l.created_at)} · {l.status === 'active' ? 'expires' : 'expired'} {formatDate(l.expires_at, true)}
                    · {l.access_count} open{l.access_count === 1 ? '' : 's'} · {l.download_count}{l.max_downloads ? `/${l.max_downloads}` : ''} download{l.download_count === 1 ? '' : 's'}</div>
                </div>
                {l.status === 'active' && <button className="btn-secondary !px-3 !py-1.5 !text-xs" onClick={() => revoke(l.id)}><Ban className="h-3.5 w-3.5" />Revoke</button>}
              </li>))}
          </ul>)}
      </div>
    </div>
  );
}

function PeopleTab({ file }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [perm, setPerm] = useState('view');
  const [hours, setHours] = useState('');
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get('/shares/users', { params: { file_id: file.id } }).then((r) => setItems(r.data.items)).catch((e) => setError(errorMessage(e))), [file.id]);
  useEffect(() => { load(); }, [load]);

  const share = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.post('/shares/users', { file_id: file.id, email, permission: perm, expires_in_hours: hours ? Number(hours) : null }); setEmail(''); toast('File shared'); load(); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };
  const revoke = async (id) => { try { await api.delete(`/shares/users/${id}`); toast('Access removed'); load(); } catch (e) { toast(errorMessage(e), 'error'); } };

  return (
    <div className="space-y-5">
      <form onSubmit={share} className="space-y-3">
        <ErrorNote>{error}</ErrorNote>
        <div><label className="label" htmlFor="pe">Person’s email</label><input id="pe" type="email" required className="input" placeholder="colleague@company.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="pp">Permission</label><select id="pp" className="input" value={perm} onChange={(e) => setPerm(e.target.value)}><option value="view">View only</option><option value="download">View and download</option></select></div>
          <div><label className="label" htmlFor="ph">Access ends</label><select id="ph" className="input" value={hours} onChange={(e) => setHours(e.target.value)}><option value="">Never</option>{EXPIRY.map(([h, l]) => <option key={h} value={h}>After {l}</option>)}</select></div>
        </div>
        <button className="btn-primary" disabled={busy}>{busy ? <Spinner className="!text-white" /> : <><UserPlus className="h-4 w-4" />Share</>}</button>
      </form>
      <div>
        <h3 className="mb-2 text-sm font-bold">People with access</h3>
        {!items ? <Spinner /> : items.length === 0 ? <p className="text-sm text-ink-soft">Not shared with anyone yet.</p> : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {items.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-3.5 py-3 text-sm">
                <div className="min-w-0 flex-1"><div className="font-semibold">{s.shared_with_name} <span className="font-normal text-ink-faint">{s.shared_with_email}</span></div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-faint"><StatusBadge status={s.status} /><Badge>{s.permission === 'download' ? 'View & download' : 'View only'}</Badge>{s.expires_at && <span>ends {formatDate(s.expires_at, true)}</span>}</div></div>
                {s.status === 'active' && <button className="btn-ghost !p-2 text-rose-600" onClick={() => revoke(s.id)} aria-label={`Remove ${s.shared_with_name}`}><Trash2 className="h-4 w-4" /></button>}
              </li>))}
          </ul>)}
      </div>
    </div>
  );
}

function ActivityTab({ file }) {
  const [items, setItems] = useState(null);
  useEffect(() => { api.get('/shares/activity', { params: { file_id: file.id } }).then((r) => setItems(r.data.items)).catch(() => setItems([])); }, [file.id]);
  if (!items) return <Spinner />;
  if (!items.length) return <p className="text-sm text-ink-soft">No sharing activity yet.</p>;
  return (
    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
      {items.map((e, i) => (
        <li key={i} className="flex justify-between gap-3 px-3.5 py-2.5 text-sm"><span className="font-medium capitalize">{e.kind.replace(/_/g, ' ')}{e.details ? <span className="font-normal text-ink-soft"> · {e.details}</span> : null}</span>
          <span className="shrink-0 text-xs text-ink-faint">{e.ip} · {timeAgo(e.ts)}</span></li>))}
    </ul>
  );
}

export default function ShareModal({ file, onClose }) {
  const [tab, setTab] = useState('link');
  const tabs = [['link', 'Share link'], ['people', 'People'], ['activity', 'Activity']];
  return (
    <Modal title={`Share “${file.name}”`} onClose={onClose} wide>
      <div className="mb-5 flex gap-1 rounded-xl bg-slate-100 p-1" role="tablist">
        {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={clsx('flex-1 rounded-lg px-3 py-2 text-sm font-semibold', tab === k ? 'bg-white shadow-sm' : 'text-ink-soft')}>{l}</button>)}
      </div>
      {tab === 'link' && <LinkTab file={file} />}{tab === 'people' && <PeopleTab file={file} />}{tab === 'activity' && <ActivityTab file={file} />}
    </Modal>
  );
}
