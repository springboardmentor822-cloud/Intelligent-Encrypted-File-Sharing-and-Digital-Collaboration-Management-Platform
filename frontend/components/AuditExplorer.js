import { useEffect, useState } from 'react';
import { Download, ScrollText } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { SelectField, UserSelect, clean, downloadCsv } from './AdminFilters';
import { DateRange, useRange } from './DateRange';
import { EmptyState, ErrorNote, PageLoader, Pagination, StatusBadge, Table } from './ui';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Task 2: browse and filter the complete audit trail (user, activity type, file, status, date range). */
export default function AuditExplorer() {
  const [range, setRange] = useRange(30);
  const [f, setF] = useState({ user_id: '', activity_type: '', file: '', status: '', q: '' });
  const [page, setPage] = useState(1);
  const [types, setTypes] = useState({ categories: [], actions: [] });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const set = (k) => (v) => { setF({ ...f, [k]: v }); setPage(1); };

  useEffect(() => { api.get('/audit-logs/types').then((r) => setTypes(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    const params = clean({ ...range, user_id: f.user_id, activity_type: f.activity_type, status: f.status, q: f.q, page, page_size: 25,
      ...(UUID.test(f.file.trim()) ? { file_id: f.file.trim() } : { file_name: f.file.trim() }) });
    const t = setTimeout(() => api.get('/audit-logs/filter', { params }).then((r) => { setData(r.data); setError(''); }).catch((e) => setError(errorMessage(e))), 250);
    return () => clearTimeout(t);
  }, [range, f, page]);

  const exportCsv = () => downloadCsv('audit-logs.csv', (data?.items || []).map((x) => ({
    log_id: x.log_id, time: x.ts, user: x.username, email: x.email, activity_type: x.activity_type, file: x.file_name || x.file_id || '',
    description: x.description, status: x.status, ip: x.ip })));

  return (
    <div className="space-y-4">
      <div className="card grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
        <UserSelect value={f.user_id} onChange={set('user_id')} id="a-user" />
        <div>
          <label className="label" htmlFor="a-type">Activity type</label>
          <select id="a-type" className="input" value={f.activity_type} onChange={(e) => set('activity_type')(e.target.value)}>
            <option value="">All activity</option>
            <optgroup label="Groups">{types.categories.map((c) => <option key={c} value={c}>{c} (all)</option>)}</optgroup>
            <optgroup label="Specific">{types.actions.map((a) => <option key={a} value={a}>{a}</option>)}</optgroup>
          </select>
        </div>
        <div><label className="label" htmlFor="a-file">File name or ID</label><input id="a-file" className="input" placeholder="report.pdf" value={f.file} onChange={(e) => set('file')(e.target.value)} /></div>
        <SelectField id="a-status" label="Status" value={f.status} onChange={set('status')} options={[['', 'Any status'], ['success', 'Successful'], ['failed', 'Failed']]} />
        <div><label className="label" htmlFor="a-q">Search</label><input id="a-q" className="input" placeholder="email, IP, text…" value={f.q} onChange={(e) => set('q')(e.target.value)} /></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRange range={range} onChange={(r) => { setRange(r); setPage(1); }} />
        <button className="btn-secondary" onClick={exportCsv} disabled={!data?.items?.length}><Download className="h-4 w-4" />Export this page (CSV)</button>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <div className="card overflow-hidden">
        {!data ? <PageLoader /> : data.items.length === 0 ? <EmptyState icon={ScrollText} title="No matching records" hint="Try widening the date range or clearing a filter." /> : (<>
          <Table>
            <thead className="bg-slate-50/60"><tr><th className="th">Date & time</th><th className="th">User</th><th className="th">Activity</th><th className="th">File</th><th className="th">Description</th><th className="th">Status</th><th className="th">IP address</th><th className="th">Log ID</th></tr></thead>
            <tbody>{data.items.map((x) => (
              <tr key={x.log_id} className="border-t border-slate-100 align-top">
                <td className="td whitespace-nowrap text-ink-soft">{formatDate(x.ts, true)}</td>
                <td className="td"><div className="font-semibold">{x.username}</div><div className="text-xs text-ink-faint">{x.email}</div></td>
                <td className="td"><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{x.activity_type}</code></td>
                <td className="td">{x.file_name || (x.file_id ? <span className="font-mono text-xs">{x.file_id.slice(0, 8)}…</span> : '—')}</td>
                <td className="td max-w-xs text-ink-soft">{x.description}</td>
                <td className="td"><StatusBadge status={x.status} /></td>
                <td className="td font-mono text-xs">{x.ip || '—'}</td>
                <td className="td font-mono text-xs text-ink-faint" title={x.log_id}>{x.log_id.slice(0, 8)}</td>
              </tr>))}</tbody>
          </Table>
          <Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={setPage} /></>)}
      </div>
    </div>
  );
}
