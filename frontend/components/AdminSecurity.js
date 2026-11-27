import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Download, ShieldAlert, Users, XCircle } from 'lucide-react';
import { api, blobErrorMessage, errorMessage } from '@/lib/api';
import { actionLabel, formatDate } from '@/lib/format';
import { ChartCard, COLORS, Donut, StackedBars, Trend } from './charts';
import { DateRange, useRange } from './DateRange';
import { summarize } from './ActivityView';
import { useToast } from './Toast';
import { Badge, EmptyState, ErrorNote, PageLoader, Pagination, StatCard, StatusBadge, Table } from './ui';

const EVENT_COLORS = { 'Multiple Login Attempts': '#f0506e', 'Suspicious IP Access': '#12b886', 'Unauthorized Access': '#f5a524',
  'Policy Violations': '#1d4ed8', 'Malware/File Threat': '#4c9bff', Others: '#9b6cf5' };
const SEV = { critical: 'red', high: 'red', medium: 'amber', low: 'blue', info: 'blue' };
const cap = (s) => s[0].toUpperCase() + s.slice(1);

/** Admin Security Dashboard: login monitoring, access attempts, security events, recent activity. */
export function SecurityDashboard() {
  const [range, setRange] = useRange(30);
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { setError(''); api.get('/admin/security/summary', { params: range }).then((r) => setD(r.data)).catch((e) => setError(errorMessage(e))); }, [range]);

  const bar = <div className="mb-5 flex justify-end"><DateRange range={range} onChange={setRange} /></div>;
  if (error) return <>{bar}<ErrorNote>{error}</ErrorNote></>;
  if (!d) return <>{bar}<PageLoader /></>;
  const m = d.metrics;
  const donut = d.event_breakdown.map((e) => ({ name: e.type, value: e.count, color: EVENT_COLORS[e.type] }));

  return (
    <div className="space-y-5">
      {bar}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={Users} tone="blue" label="Total logins" value={m.total_logins.toLocaleString()} sub="in selected period" />
        <StatCard icon={CheckCircle2} tone="green" label="Successful logins" value={m.successful_logins.toLocaleString()} sub={`${m.success_rate}% success rate`} />
        <StatCard icon={XCircle} tone="rose" label="Failed logins" value={m.failed_logins.toLocaleString()} sub={`${m.failure_rate}% failure rate`} />
        <StatCard icon={AlertTriangle} tone="amber" label="Unauthorized attempts" value={m.unauthorized_attempts.toLocaleString()} sub={`${m.blocked_attempts} more blocked automatically`} />
        <StatCard icon={ShieldAlert} tone="purple" label="Security events" value={m.security_events.toLocaleString()} sub="includes suspicious activity" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <ChartCard title="Login activity"><Trend data={d.login_series} keys={['success', 'failed']} area height={230} /></ChartCard>
        <ChartCard title="Access attempts"><StackedBars data={d.access_series} keys={['unauthorized', 'blocked']} stacked={false} height={230} /></ChartCard>
        <ChartCard title="Security events">
          <div className="grid items-center gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Donut data={donut} height={170} center={<><div className="text-2xl font-extrabold">{m.security_events}</div><div className="text-xs text-ink-faint">Events</div></>} />
            <ul className="space-y-1.5">{d.event_breakdown.map((e) => (
              <li key={e.type} className="flex items-center justify-between gap-2 text-xs"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: EVENT_COLORS[e.type] }} />{e.type}</span><span className="text-ink-soft">{e.count} ({e.percent}%)</span></li>))}</ul>
          </div>
        </ChartCard>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Recent login activity" right={<Link href="/admin/activity?tab=logins" className="text-sm font-semibold text-brand-600">View all</Link>}>
          {d.recent_logins.length === 0 ? <p className="py-6 text-center text-sm text-ink-soft">No sign-ins recorded yet.</p> : (
            <Table><thead><tr><th className="th">User</th><th className="th">IP address</th><th className="th">Status</th><th className="th">Location</th><th className="th">Date & time</th></tr></thead>
              <tbody>{d.recent_logins.map((l, i) => (
                <tr key={i} className="border-t border-slate-100"><td className="td"><div className="font-semibold">{l.user}</div><div className="text-xs text-ink-faint">{l.email}</div></td>
                  <td className="td font-mono text-xs">{l.ip}</td><td className="td"><StatusBadge status={l.status} /></td><td className="td text-ink-soft">{l.location}</td>
                  <td className="td whitespace-nowrap text-ink-soft">{formatDate(l.ts, true)}</td></tr>))}</tbody></Table>)}
        </ChartCard>
        <ChartCard title="Recent security events" right={<Link href="/admin/activity?tab=events" className="text-sm font-semibold text-brand-600">View all</Link>}>
          {d.recent_events.length === 0 ? <p className="py-6 text-center text-sm text-ink-soft">No security events. All quiet.</p> : (
            <Table><thead><tr><th className="th">Event</th><th className="th">Severity</th><th className="th">IP address</th><th className="th">Details</th><th className="th">Date & time</th></tr></thead>
              <tbody>{d.recent_events.map((e) => (
                <tr key={e.id} className="border-t border-slate-100"><td className="td font-semibold">{e.title}</td><td className="td"><Badge tone={SEV[e.severity]}>{cap(e.severity)}</Badge></td>
                  <td className="td font-mono text-xs">{e.ip || '—'}</td><td className="td max-w-[14rem] truncate text-ink-soft" title={e.details}>{e.details || '—'}</td>
                  <td className="td whitespace-nowrap text-ink-soft">{formatDate(e.ts, true)}</td></tr>))}</tbody></Table>)}
        </ChartCard>
      </div>
    </div>
  );
}

const TABS = {
  audit: { label: 'Audit logs', url: '/admin/audit-logs', head: ['When', 'User', 'Action', 'Details', 'IP address'],
    row: (x) => [formatDate(x.ts, true), x.actor_email || <span className="text-ink-faint">Anonymous</span>, <b key="a">{actionLabel(x.action)}</b>, summarize(x.details), <code key="i" className="text-xs">{x.ip || '—'}</code>] },
  logins: { label: 'Sign-ins', url: '/admin/security/logins', head: ['When', 'User', 'Result', 'Reason', 'IP address', 'Location'],
    row: (x) => [formatDate(x.ts, true), x.email, <StatusBadge key="s" status={x.status} />, (x.reason || '').replace(/_/g, ' '), <code key="i" className="text-xs">{x.ip}</code>, x.location] },
  events: { label: 'Security events', url: '/admin/security/events', head: ['When', 'Event', 'Category', 'Severity', 'Details', 'IP address'],
    row: (x) => [formatDate(x.ts, true), <b key="t">{x.title}</b>, x.category, <Badge key="s" tone={SEV[x.severity]}>{cap(x.severity)}</Badge>, x.details || '—', <code key="i" className="text-xs">{x.ip || '—'}</code>] },
  access: { label: 'Access attempts', url: '/admin/security/access-attempts', head: ['When', 'Type', 'Reason', 'User', 'Request', 'IP address'],
    row: (x) => [formatDate(x.ts, true), <Badge key="k" tone={x.kind === 'blocked' ? 'blue' : 'red'}>{cap(x.kind)}</Badge>, x.reason, x.user_email || '—', <code key="p" className="text-xs">{x.method} {x.path}</code>, <code key="i" className="text-xs">{x.ip}</code>] },
};

/** Admin Activity Logs: audit trail, sign-in history, security events and access attempts. */
export function AdminLogs() {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState('audit');
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [sev, setSev] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { const t = router.query.tab; if (t && TABS[t]) setTab(String(t)); }, [router.query.tab]);
  const load = useCallback(() => {
    const params = { page, page_size: 25, q: q || undefined };
    if (tab === 'events' && sev) params.severity = sev;
    api.get(TABS[tab].url, { params: tab === 'audit' || tab === 'logins' ? params : { ...params, q: undefined } })
      .then((r) => { setData(r.data); setError(''); }).catch((e) => setError(errorMessage(e)));
  }, [tab, page, q, sev]);
  useEffect(() => { setData(null); const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  const exportCsv = async () => {
    try {
      const res = await api.get('/admin/audit-logs/export', { params: { q: q || undefined }, responseType: 'blob' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(res.data); a.download = 'trustshare-audit-log.csv'; a.click();
    } catch (e) { toast(await blobErrorMessage(e), 'error'); }
  };
  const t = TABS[tab];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1" role="tablist">
          {Object.entries(TABS).map(([k, v]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setPage(1); }}
            className={clsx('rounded-lg px-3.5 py-2 text-sm font-semibold', tab === k ? 'bg-white shadow-sm' : 'text-ink-soft')}>{v.label}</button>)}
        </div>
        <div className="flex flex-wrap gap-2">
          {(tab === 'audit' || tab === 'logins') && <input className="input !w-56" placeholder="Search…" aria-label="Search logs" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />}
          {tab === 'events' && <select className="input !w-auto" aria-label="Severity" value={sev} onChange={(e) => { setSev(e.target.value); setPage(1); }}><option value="">All severities</option>{['critical', 'high', 'medium', 'low', 'info'].map((s) => <option key={s} value={s}>{cap(s)}</option>)}</select>}
          {tab === 'audit' && <button className="btn-secondary" onClick={exportCsv}><Download className="h-4 w-4" />Export CSV</button>}
        </div>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <div className="card overflow-hidden">
        {!data ? <PageLoader /> : data.items.length === 0 ? <EmptyState title="Nothing to show" hint="No records match this view yet." /> : (<>
          <Table><thead className="bg-slate-50/60"><tr>{t.head.map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>{data.items.map((x) => <tr key={x.id} className="border-t border-slate-100">{t.row(x).map((c, i) => <td key={i} className="td align-top">{c}</td>)}</tr>)}</tbody></Table>
          <Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={setPage} /></>)}
      </div>
    </div>
  );
}
