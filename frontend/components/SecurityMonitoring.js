import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Link2, ShieldAlert, ShieldCheck, Download, XCircle } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { formatDate, timeAgo } from '@/lib/format';
import { SelectField, clean } from './AdminFilters';
import { ChartCard } from './charts';
import { DateRange, useRange } from './DateRange';
import { useToast } from './Toast';
import { Badge, EmptyState, ErrorNote, PageLoader, Pagination, StatCard, Table } from './ui';

const SEV = { critical: 'red', high: 'red', medium: 'amber', low: 'blue', info: 'blue' };
const STATUS_TONE = { open: 'red', investigating: 'amber', resolved: 'green' };
const CATEGORIES = ['Multiple Login Attempts', 'Suspicious IP Access', 'Unauthorized Access', 'Policy Violations', 'Malware/File Threat', 'Others'];

/** Task 6: Security Monitoring, with detection rules, alerts and status workflow. */
export default function SecurityMonitoring() {
  const toast = useToast();
  const [range, setRange] = useRange(30);
  const [f, setF] = useState({ user: '', event_type: '', severity: '', status: '' });
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState(null);
  const [rules, setRules] = useState(null);
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');
  const set = (k) => (v) => { setF({ ...f, [k]: v }); setPage(1); };

  const loadSummary = useCallback(() => api.get('/security-monitoring/summary', { params: range }).then((r) => setSummary(r.data)).catch((e) => setError(errorMessage(e))), [range]);
  const loadEvents = useCallback(() => api.get('/security-monitoring/events', { params: clean({ ...range, ...f, page, page_size: 20 }) })
    .then((r) => setEvents(r.data)).catch((e) => setError(errorMessage(e))), [range, f, page]);
  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { const t = setTimeout(loadEvents, 200); return () => clearTimeout(t); }, [loadEvents]);
  useEffect(() => { api.get('/security-monitoring/rules').then((r) => setRules(r.data)).catch(() => {}); }, []);

  const setStatus = async (ev, status) => {
    try { await api.patch(`/security-monitoring/events/${ev.id}`, { status }); toast('Alert marked ' + status); loadEvents(); loadSummary(); }
    catch (e) { toast(errorMessage(e), 'error'); }
  };

  if (!summary && !error) return <PageLoader />;
  const m = summary?.metrics;
  return (
    <div className="space-y-5">
      <div className="flex justify-end"><DateRange range={range} onChange={(r) => { setRange(r); setPage(1); }} /></div>
      <ErrorNote>{error}</ErrorNote>
      {m && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={ShieldAlert} tone="purple" label="Total security events" value={m.total_events} sub={`${m.open_alerts} still open`} />
          <StatCard icon={XCircle} tone="rose" label="Failed login attempts" value={m.failed_logins} />
          <StatCard icon={AlertTriangle} tone="amber" label="Unauthorized access attempts" value={m.unauthorized_attempts} />
          <StatCard icon={Download} tone="blue" label="Suspicious downloads" value={m.suspicious_downloads} />
          <StatCard icon={Link2} tone="amber" label="Expired link attempts" value={m.expired_link_attempts} />
          <StatCard icon={Link2} tone="rose" label="Revoked link attempts" value={m.revoked_link_attempts} />
        </div>)}

      <div className="grid gap-5 xl:grid-cols-5">
        <ChartCard title="Recent security alerts" className="xl:col-span-2">
          {!summary?.recent_alerts?.length ? <p className="py-6 text-center text-sm text-ink-soft">No alerts yet. All quiet.</p> : (
            <ul className="divide-y divide-slate-100">{summary.recent_alerts.map((a) => (
              <li key={a.id} className="py-3"><div className="flex items-center gap-2"><Badge tone={SEV[a.severity]}>{a.severity}</Badge><span className="text-sm font-semibold">{a.title}</span></div>
                <div className="mt-0.5 text-xs text-ink-faint">{a.ip || 'no IP'} · {timeAgo(a.ts)} · {a.status}</div></li>))}</ul>)}
        </ChartCard>
        <ChartCard title="Detection rules in force" className="xl:col-span-3">
          {rules ? (<>
            <Table><thead><tr><th className="th">Rule</th><th className="th">Condition</th><th className="th">Severity</th><th className="th">Response</th></tr></thead>
              <tbody>{rules.rules.map((r) => <tr key={r.rule} className="border-t border-slate-100"><td className="td font-semibold">{r.rule}</td><td className="td text-ink-soft">{r.condition}</td><td className="td">{r.severity}</td><td className="td text-ink-soft">{r.action}</td></tr>)}</tbody></Table>
            <p className="mt-3 text-xs text-ink-faint">Thresholds are configurable with: {rules.configurable_with.join(', ')}.</p></>) : <PageLoader />}
        </ChartCard>
      </div>

      <div className="card grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <div><label className="label" htmlFor="m-user">User (email)</label><input id="m-user" className="input" placeholder="name@example.com" value={f.user} onChange={(e) => set('user')(e.target.value)} /></div>
        <SelectField id="m-type" label="Event type" value={f.event_type} onChange={set('event_type')} options={[['', 'All types'], ...CATEGORIES.map((c) => [c, c])]} />
        <SelectField id="m-sev" label="Severity" value={f.severity} onChange={set('severity')} options={[['', 'All severities'], ...['critical', 'high', 'medium', 'low', 'info'].map((s) => [s, s])]} />
        <SelectField id="m-status" label="Event status" value={f.status} onChange={set('status')} options={[['', 'Any status'], ['open', 'Open'], ['investigating', 'Investigating'], ['resolved', 'Resolved']]} />
      </div>

      <div className="card overflow-hidden">
        {!events ? <PageLoader /> : events.items.length === 0 ? <EmptyState icon={ShieldCheck} title="No security events" hint="Nothing matches these filters." /> : (<>
          <Table><thead className="bg-slate-50/60"><tr><th className="th">Alert</th><th className="th">Time</th><th className="th">Event</th><th className="th">Type</th><th className="th">Severity</th><th className="th">User</th><th className="th">IP</th><th className="th">Status</th></tr></thead>
            <tbody>{events.items.map((e) => (
              <tr key={e.id} className="border-t border-slate-100 align-top">
                <td className="td font-mono text-xs text-ink-faint" title={e.alert_id}>{e.alert_id.slice(0, 8)}</td>
                <td className="td whitespace-nowrap text-ink-soft">{formatDate(e.ts, true)}</td>
                <td className="td"><div className="font-semibold">{e.title}</div><div className="max-w-xs text-xs text-ink-soft">{e.details}</div></td>
                <td className="td text-ink-soft">{e.category}</td><td className="td"><Badge tone={SEV[e.severity]}>{e.severity}</Badge></td>
                <td className="td">{e.user_email || '—'}</td><td className="td font-mono text-xs">{e.ip || '—'}</td>
                <td className="td"><select aria-label={`Status of alert ${e.alert_id.slice(0, 8)}`} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm" value={e.status} onChange={(ev) => setStatus(e, ev.target.value)}>
                  {['open', 'investigating', 'resolved'].map((s) => <option key={s} value={s}>{s}</option>)}</select>
                  <div className="mt-1"><Badge tone={STATUS_TONE[e.status]}>{e.status}</Badge></div></td>
              </tr>))}</tbody></Table>
          <Pagination page={events.page} pageSize={events.page_size} total={events.total} onChange={setPage} /></>)}
      </div>
    </div>
  );
}
