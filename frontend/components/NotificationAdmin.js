import { useCallback, useEffect, useState } from 'react';
import { Bell, Send } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { SelectField, clean } from './AdminFilters';
import { ChartCard } from './charts';
import { useToast } from './Toast';
import { Badge, EmptyState, ErrorNote, PageLoader, Pagination, Spinner, StatCard, Table } from './ui';

const TONE = { share: 'blue', download: 'purple', access: 'amber', security: 'red', expiry: 'amber', system: 'slate' };

/** Task 3 (admin): notification management and broadcast. */
export default function NotificationAdmin() {
  const toast = useToast();
  const [f, setF] = useState({ type: '', read: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title: '', message: '', audience: 'all', send_email: false });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => { setF({ ...f, [k]: v }); setPage(1); };

  const load = useCallback(() => api.get('/admin/notifications', { params: clean({ type: f.type, read: f.read, page, page_size: 20 }) })
    .then((r) => { setData(r.data); setError(''); }).catch((e) => setError(errorMessage(e))), [f, page]);
  useEffect(() => { load(); }, [load]);

  const send = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const { data: r } = await api.post('/admin/notifications/broadcast', form); toast(`Sent to ${r.recipients} user${r.recipients === 1 ? '' : 's'}`); setForm({ ...form, title: '', message: '' }); load(); }
    catch (err) { toast(errorMessage(err), 'error'); } finally { setBusy(false); }
  };

  if (!data && !error) return <PageLoader />;
  const st = data?.stats;
  return (
    <div className="space-y-5">
      <ErrorNote>{error}</ErrorNote>
      {st && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Bell} tone="blue" label="Notifications sent" value={st.total} />
          <StatCard icon={Bell} tone="rose" label="Unread" value={st.unread} />
          {Object.entries(st.by_type).slice(0, 2).map(([t, n]) => <StatCard key={t} icon={Bell} tone="purple" label={`Type: ${t}`} value={n} />)}
        </div>)}
      <div className="grid gap-5 xl:grid-cols-3">
        <ChartCard title="Send an announcement" className="xl:col-span-1">
          <form onSubmit={send} className="space-y-3">
            <div><label className="label" htmlFor="b-title">Title</label><input id="b-title" required maxLength={200} className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><label className="label" htmlFor="b-msg">Message</label><textarea id="b-msg" required maxLength={2000} rows={4} className="input" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>
            <SelectField id="b-aud" label="Send to" value={form.audience} onChange={(v) => setForm({ ...form, audience: v })} options={[['all', 'Everyone'], ['user', 'Users'], ['guest', 'Guests'], ['admin', 'Admins']]} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={form.send_email} onChange={(e) => setForm({ ...form, send_email: e.target.checked })} />Also send by email</label>
            <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner className="!text-white" /> : <><Send className="h-4 w-4" />Send</>}</button>
          </form>
        </ChartCard>
        <div className="space-y-4 xl:col-span-2">
          <div className="card grid gap-3 p-4 sm:grid-cols-2">
            <SelectField id="n-type" label="Type" value={f.type} onChange={set('type')} options={[['', 'All types'], ...Object.keys(TONE).map((t) => [t, t])]} />
            <SelectField id="n-read" label="State" value={f.read} onChange={set('read')} options={[['', 'Read and unread'], ['false', 'Unread'], ['true', 'Read']]} />
          </div>
          <div className="card overflow-hidden">
            {!data ? <PageLoader /> : data.items.length === 0 ? <EmptyState icon={Bell} title="No notifications" hint="Nothing matches these filters." /> : (<>
              <Table><thead className="bg-slate-50/60"><tr><th className="th">Sent</th><th className="th">To</th><th className="th">Type</th><th className="th">Notification</th><th className="th">State</th></tr></thead>
                <tbody>{data.items.map((n) => (
                  <tr key={n.id} className="border-t border-slate-100 align-top">
                    <td className="td whitespace-nowrap text-ink-soft">{formatDate(n.created_at, true)}</td>
                    <td className="td"><div className="font-semibold">{n.user_name}</div><div className="text-xs text-ink-faint">{n.user_email}</div></td>
                    <td className="td"><Badge tone={TONE[n.type] || 'slate'}>{n.type}</Badge></td>
                    <td className="td max-w-sm"><div className="font-semibold">{n.title}</div><div className="text-xs text-ink-soft">{n.message}</div></td>
                    <td className="td">{n.is_read ? <Badge tone="slate">Read</Badge> : <Badge tone="blue">Unread</Badge>}</td>
                  </tr>))}</tbody></Table>
              <Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={setPage} /></>)}
          </div>
        </div>
      </div>
    </div>
  );
}
