import { useEffect, useState } from 'react';
import { ScrollText, Search } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { actionLabel, formatDate } from '@/lib/format';
import { EmptyState, ErrorNote, PageLoader, Pagination, Table } from './ui';

export const summarize = (d = {}) => {
  const parts = [];
  if (d.name) parts.push(d.name);
  if (d.with) parts.push(`with ${d.with}`);
  if (d.permission) parts.push(d.permission === 'download' ? 'view & download' : 'view only');
  if (d.via) parts.push(`via ${d.via}`);
  if (d.version) parts.push(`v${d.version}`);
  if (d.reason) parts.push(d.reason);
  if (d.expires_in_hours) parts.push(`expires in ${d.expires_in_hours}h`);
  return parts.join(' · ') || '—';
};

/** Your own activity plus actions others took on your files. */
export default function ActivityView() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const t = setTimeout(() => api.get('/activity', { params: { q: q || undefined, page, page_size: 25 } }).then((r) => setData(r.data)).catch((e) => setError(errorMessage(e))), 250);
    return () => clearTimeout(t);
  }, [q, page]);
  return (
    <div className="space-y-4">
      <div className="relative max-w-sm"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input className="input !pl-10" placeholder="Search activity…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search activity" /></div>
      <ErrorNote>{error}</ErrorNote>
      <div className="card overflow-hidden">
        {!data ? <PageLoader /> : data.items.length === 0 ? <EmptyState icon={ScrollText} title="No activity found" hint="Uploads, downloads and sharing actions will be listed here." /> : (<>
          <Table><thead className="bg-slate-50/60"><tr><th className="th">When</th><th className="th">Who</th><th className="th">What</th><th className="th">Details</th><th className="th">IP address</th></tr></thead>
            <tbody>{data.items.map((a) => (
              <tr key={a.id} className="border-t border-slate-100">
                <td className="td whitespace-nowrap text-ink-soft">{formatDate(a.ts, true)}</td><td className="td">{a.by_me ? 'You' : a.actor_name}</td>
                <td className="td font-semibold">{actionLabel(a.action)}</td><td className="td text-ink-soft">{summarize(a.details)}</td><td className="td font-mono text-xs text-ink-soft">{a.ip || '—'}</td>
              </tr>))}</tbody></Table>
          <Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={setPage} /></>)}
      </div>
    </div>
  );
}
