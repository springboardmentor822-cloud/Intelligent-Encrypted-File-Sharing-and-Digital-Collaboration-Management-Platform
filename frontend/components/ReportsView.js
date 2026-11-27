import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, Download, FileText, Link2, ShieldAlert, UploadCloud, Users, XCircle, CheckCircle2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { formatBytes, formatDate } from '@/lib/format';
import { FILE_TYPES, SelectField, UserSelect, clean, downloadCsv } from './AdminFilters';
import { ChartCard, Donut, StackedBars, Trend } from './charts';
import { DateRange, useRange } from './DateRange';
import { Badge, EmptyState, ErrorNote, PageLoader, StatCard, StatusBadge, Table } from './ui';

const PALETTE = ['#0b63f3', '#12b886', '#f0506e', '#9b6cf5', '#f5a524', '#4c9bff', '#14b8a6', '#e879f9'];
const SEV = { critical: 'red', high: 'red', medium: 'amber', low: 'blue', info: 'blue' };

function useReport(url, params, enabled = true) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const key = JSON.stringify(params);
  useEffect(() => {
    if (!enabled) { setData(null); return undefined; }
    let alive = true; setData(null); setError('');
    api.get(url, { params }).then((r) => alive && setData(r.data)).catch((e) => alive && setError(errorMessage(e)));
    return () => { alive = false; };
  }, [url, key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error };
}

function DataTable({ cols, rows, empty = 'No records for these filters.' }) {
  if (!rows?.length) return <p className="py-8 text-center text-sm text-ink-soft">{empty}</p>;
  return (
    <Table>
      <thead><tr>{cols.map((c) => <th key={c.label} className="th">{c.label}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={i} className="border-t border-slate-100">{cols.map((c) => <td key={c.label} className="td align-top">{c.render ? c.render(r) : (r[c.key] ?? '—')}</td>)}</tr>))}</tbody>
    </Table>
  );
}
const when = (k) => (r) => <span className="whitespace-nowrap text-ink-soft">{formatDate(r[k], true)}</span>;
const status = (r) => <StatusBadge status={r.status} />;
const CsvButton = ({ name, rows }) => (
  <button className="btn-secondary !px-3 !py-1.5 !text-xs" disabled={!rows?.length} onClick={() => downloadCsv(name, rows)}><Download className="h-3.5 w-3.5" />CSV</button>
);

function UploadsReport({ params }) {
  const { data, error } = useReport('/reports/uploads', params);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <PageLoader />;
  const t = data.totals;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={UploadCloud} tone="green" label="Total files uploaded" value={t.total_files} sub="including new versions" />
        <StatCard icon={FileText} tone="blue" label="Data uploaded" value={formatBytes(t.total_bytes)} />
        <StatCard icon={XCircle} tone="rose" label="Failed / blocked uploads" value={t.failed_uploads} />
      </div>
      <ChartCard title="Uploads by day and type"><StackedBars data={data.series} keys={['documents', 'images', 'videos', 'others']} /></ChartCard>
      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Files uploaded by each user"><DataTable rows={data.by_user} cols={[{ label: 'User', render: (r) => <div><b>{r.user}</b><div className="text-xs text-ink-faint">{r.email}</div></div> }, { label: 'Files', key: 'files' }, { label: 'Size', render: (r) => formatBytes(r.bytes) }]} /></ChartCard>
        <ChartCard title="Failed uploads" right={<CsvButton name="failed-uploads.csv" rows={data.failed} />}>
          <DataTable rows={data.failed} empty="No failed uploads." cols={[{ label: 'When', render: when('ts') }, { label: 'User', key: 'user' }, { label: 'File', key: 'name' }, { label: 'Reason', key: 'reason' }]} /></ChartCard>
      </div>
      <ChartCard title="Upload records" right={<CsvButton name="uploads.csv" rows={data.rows.map(({ file_id, ...r }) => r)} />}>
        <DataTable rows={data.rows} cols={[{ label: 'Uploaded', render: when('uploaded_at') }, { label: 'File', key: 'name' }, { label: 'Type', key: 'type' }, { label: 'Version', key: 'version' }, { label: 'Size', render: (r) => formatBytes(r.size_bytes) }, { label: 'User', render: (r) => r.user }, { label: 'Status', render: status }]} /></ChartCard>
    </div>
  );
}

function DownloadsReport({ params }) {
  const { data, error } = useReport('/reports/downloads', params);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <PageLoader />;
  const t = data.totals;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Download} tone="purple" label="Total downloads" value={t.total_downloads} />
        <StatCard icon={FileText} tone="blue" label="Distinct files downloaded" value={t.distinct_files} />
        <StatCard icon={AlertTriangle} tone="amber" label="Failed download attempts" value={t.failed_attempts} sub="denied or blocked" />
      </div>
      <ChartCard title="Downloads by day"><Trend data={data.series} keys={['total']} area /></ChartCard>
      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Most downloaded files"><DataTable rows={data.top_files} cols={[{ label: 'File', key: 'name' }, { label: 'Downloads', key: 'downloads' }]} /></ChartCard>
        <ChartCard title="Downloads by each user"><DataTable rows={data.by_user} cols={[{ label: 'User', key: 'user' }, { label: 'Downloads', key: 'downloads' }]} /></ChartCard>
      </div>
      <ChartCard title="Download records" right={<CsvButton name="downloads.csv" rows={data.rows} />}>
        <DataTable rows={data.rows} cols={[{ label: 'When', render: when('ts') }, { label: 'File', key: 'file_name' }, { label: 'Downloaded by', key: 'downloaded_by' }, { label: 'Via', key: 'via' }, { label: 'IP', key: 'ip' }, { label: 'Status', render: status }]} /></ChartCard>
      <ChartCard title="Failed download attempts" right={<CsvButton name="failed-downloads.csv" rows={data.failed} />}>
        <DataTable rows={data.failed} empty="No failed attempts." cols={[{ label: 'When', render: when('ts') }, { label: 'Reason', key: 'reason' }, { label: 'User', key: 'user' }, { label: 'IP', key: 'ip' }, { label: 'Status', render: status }]} /></ChartCard>
    </div>
  );
}

function SharingReport({ params }) {
  const { data, error } = useReport('/reports/sharing', params);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <PageLoader />;
  const t = data.totals;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard icon={Link2} tone="blue" label="Files shared" value={t.files_shared} sub={`${t.links_created} links · ${t.user_shares} person shares`} />
        <StatCard icon={CheckCircle2} tone="green" label="Active links" value={t.active_links} />
        <StatCard icon={AlertTriangle} tone="amber" label="Expired links" value={t.expired_links} />
        <StatCard icon={XCircle} tone="rose" label="Revoked links" value={t.revoked_links} />
        <StatCard icon={Download} tone="purple" label="Download limit reached" value={t.exhausted_links} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Files shared by each user"><DataTable rows={data.by_user} cols={[{ label: 'User', key: 'user' }, { label: 'Shares', key: 'shares' }]} /></ChartCard>
        <ChartCard title="Link status"><Donut height={170} data={[['Active', t.active_links], ['Expired', t.expired_links], ['Revoked', t.revoked_links], ['Limit reached', t.exhausted_links]].map(([name, value], i) => ({ name, value, color: PALETTE[i] }))}
          center={<div className="text-xl font-extrabold">{t.links_created}</div>} /></ChartCard>
      </div>
      <ChartCard title="Sharing recipients" right={<CsvButton name="recipients.csv" rows={data.recipients} />}>
        <DataTable rows={data.recipients} cols={[{ label: 'Shared', render: when('created_at') }, { label: 'File', key: 'file' }, { label: 'Shared by', key: 'shared_by' }, { label: 'Recipient', render: (r) => <div>{r.recipient}<div className="text-xs text-ink-faint">{r.email}</div></div> }, { label: 'Permission', key: 'permission' }, { label: 'Type', key: 'type' }, { label: 'Status', render: status }]} /></ChartCard>
      <ChartCard title="Share links" right={<CsvButton name="links.csv" rows={data.links} />}>
        <DataTable rows={data.links} cols={[{ label: 'Created', render: when('created_at') }, { label: 'File', key: 'file' }, { label: 'By', key: 'created_by' }, { label: 'Permission', key: 'permission' }, { label: 'Opens', key: 'opens' }, { label: 'Downloads', key: 'downloads' }, { label: 'Expires', render: when('expires_at') }, { label: 'Status', render: status }]} /></ChartCard>
    </div>
  );
}

function UserActivityReport({ params, userId }) {
  const [type, setType] = useState('');
  const { data, error } = useReport(`/reports/users/${userId}/activity`, clean({ start: params.start, end: params.end, activity_type: type }), !!userId);
  if (!userId) return <div className="card"><EmptyState icon={Users} title="Choose a user" hint="Select a user in the filters above to see their login, upload, download and sharing history." /></div>;
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <PageLoader />;
  const s = data.summary;
  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-5"><div><div className="text-lg font-bold">{data.user.name}</div><div className="text-sm text-ink-soft">{data.user.email} · {data.user.role}</div></div>
        <div className="w-48"><SelectField id="ua-type" label="Activity" value={type} onChange={setType} options={[['', 'All activity'], ['auth', 'Sign-ins'], ['file.upload', 'Uploads'], ['file.download', 'Downloads'], ['share', 'Sharing']]} /></div></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={CheckCircle2} tone="green" label="Sign-ins" value={s.logins} />
        <StatCard icon={XCircle} tone="rose" label="Failed sign-ins" value={s.failed_logins} />
        <StatCard icon={UploadCloud} tone="blue" label="Uploads" value={s.uploads} />
        <StatCard icon={Download} tone="purple" label="Downloads" value={s.downloads} />
        <StatCard icon={Link2} tone="amber" label="Sharing actions" value={s.shares} />
      </div>
      <ChartCard title="Activity history" right={<CsvButton name="user-activity.csv" rows={data.timeline} />}>
        <DataTable rows={data.timeline} cols={[{ label: 'When', render: when('ts') }, { label: 'Activity', render: (r) => <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{r.activity_type}</code> }, { label: 'Description', key: 'description' }, { label: 'IP', key: 'ip' }, { label: 'Status', render: status }]} /></ChartCard>
    </div>
  );
}

function SecurityReport({ params }) {
  const [severity, setSeverity] = useState('');
  const { data, error } = useReport('/reports/security', clean({ ...params, severity }));
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <PageLoader />;
  const t = data.totals;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard icon={XCircle} tone="rose" label="Failed login attempts" value={t.failed_logins} />
        <StatCard icon={AlertTriangle} tone="amber" label="Unauthorized access attempts" value={t.unauthorized_attempts} />
        <StatCard icon={Download} tone="purple" label="Suspicious download activity" value={t.suspicious_downloads} />
        <StatCard icon={Link2} tone="blue" label="Expired link attempts" value={t.expired_link_attempts} />
        <StatCard icon={Link2} tone="blue" label="Revoked link attempts" value={t.revoked_link_attempts} />
        <StatCard icon={ShieldAlert} tone="purple" label="Security alerts generated" value={t.alerts_generated} />
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <ChartCard title="Alerts by category"><Donut height={170} data={data.by_category.map((c, i) => ({ name: c.name || 'Other', value: c.count, color: PALETTE[i % PALETTE.length] }))} center={<div className="text-xl font-extrabold">{t.alerts_generated}</div>} />
          <ul className="mt-3 space-y-1 text-sm">{data.by_category.map((c, i) => <li key={c.name} className="flex justify-between"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />{c.name}</span><span className="text-ink-soft">{c.count}</span></li>)}</ul></ChartCard>
        <ChartCard title="By severity"><DataTable rows={data.by_severity} cols={[{ label: 'Severity', render: (r) => <Badge tone={SEV[r.name]}>{r.name}</Badge> }, { label: 'Alerts', key: 'count' }]} /></ChartCard>
        <ChartCard title="By status"><DataTable rows={data.by_status} cols={[{ label: 'Status', key: 'name' }, { label: 'Alerts', key: 'count' }]} /></ChartCard>
      </div>
      <ChartCard title="Security alerts" right={<div className="flex items-center gap-2"><select aria-label="Severity" className="input !w-auto !py-1.5 !text-xs" value={severity} onChange={(e) => setSeverity(e.target.value)}><option value="">All severities</option>{['critical', 'high', 'medium', 'low', 'info'].map((s) => <option key={s}>{s}</option>)}</select><CsvButton name="security-alerts.csv" rows={data.rows} /></div>}>
        <DataTable rows={data.rows} empty="No alerts for these filters." cols={[{ label: 'When', render: when('ts') }, { label: 'Alert', key: 'title' }, { label: 'Severity', render: (r) => <Badge tone={SEV[r.severity]}>{r.severity}</Badge> }, { label: 'Status', key: 'status' }, { label: 'User', key: 'user' }, { label: 'IP', key: 'ip' }, { label: 'Details', key: 'details' }]} /></ChartCard>
    </div>
  );
}

const TABS = [['uploads', 'File uploads'], ['downloads', 'File downloads'], ['sharing', 'File sharing'], ['user', 'User activity'], ['security', 'Security']];

/** Task 4: file activity and security reports with filters (user, file type, date range). */
export default function ReportsView() {
  const [tab, setTab] = useState('uploads');
  const [range, setRange] = useRange(30);
  const [userId, setUserId] = useState('');
  const [fileType, setFileType] = useState('');
  const params = clean({ ...range, user_id: tab === 'user' ? '' : userId, file_type: tab === 'uploads' ? fileType : '' });
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={clsx('rounded-lg px-4 py-2 text-sm font-semibold', tab === k ? 'bg-white shadow-sm' : 'text-ink-soft')}>{l}</button>)}
      </div>
      <div className="card grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <UserSelect value={userId} onChange={setUserId} id="r-user" label={tab === 'user' ? 'User (required)' : 'User'} />
        {tab === 'uploads' && <SelectField id="r-type" label="File type" value={fileType} onChange={setFileType} options={FILE_TYPES} />}
        <div className="sm:col-span-2 xl:col-span-2"><span className="label">Date range</span><DateRange range={range} onChange={setRange} /></div>
      </div>
      {tab === 'uploads' && <UploadsReport params={params} />}
      {tab === 'downloads' && <DownloadsReport params={params} />}
      {tab === 'sharing' && <SharingReport params={params} />}
      {tab === 'user' && <UserActivityReport params={params} userId={userId} />}
      {tab === 'security' && <SecurityReport params={params} />}
    </div>
  );
}
