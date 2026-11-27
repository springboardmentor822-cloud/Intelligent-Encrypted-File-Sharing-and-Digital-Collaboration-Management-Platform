import { useEffect, useState } from 'react';
import { Database, Download, FileText, Share2, UploadCloud } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import { FILE_TYPES, SelectField, UserSelect, clean } from './AdminFilters';
import { ChartCard, Donut, StackedBars, Trend } from './charts';
import { DateRange, useRange } from './DateRange';
import { ErrorNote, PageLoader, StatCard, Table } from './ui';

const PALETTE = ['#0b63f3', '#12b886', '#f0506e', '#9b6cf5', '#f5a524', '#4c9bff', '#14b8a6', '#e879f9', '#64748b', '#84cc16'];
const ACTIVITY = [['all', 'All activity'], ['uploads', 'Uploads'], ['downloads', 'Downloads'], ['sharing', 'Sharing']];

/** Task 5: storage analytics and usage monitoring dashboard for administrators. */
export default function StorageAnalytics() {
  const [range, setRange] = useRange(30);
  const [userId, setUserId] = useState('');
  const [fileType, setFileType] = useState('');
  const [activity, setActivity] = useState('all');
  const [d, setD] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    api.get('/admin/analytics/overview', { params: clean({ ...range, user_id: userId, file_type: fileType }) })
      .then((r) => setD(r.data)).catch((e) => setError(errorMessage(e)));
  }, [range, userId, fileType]);

  const filters = (
    <div className="card mb-5 grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
      <UserSelect value={userId} onChange={setUserId} id="s-user" label="User (file owner)" />
      <SelectField id="s-type" label="File type" value={fileType} onChange={setFileType} options={FILE_TYPES} />
      <SelectField id="s-act" label="Activity type" value={activity} onChange={setActivity} options={ACTIVITY} />
      <div><span className="label">Date range</span><DateRange range={range} onChange={setRange} /></div>
    </div>
  );
  if (error) return <>{filters}<ErrorNote>{error}</ErrorNote></>;
  if (!d) return <>{filters}<PageLoader /></>;

  const users = d.users_storage;
  const pie = users.slice(0, 9).map((u, i) => ({ name: u.name, value: u.bytes, color: PALETTE[i] }));
  const rest = users.slice(9).reduce((s, u) => s + u.bytes, 0);
  if (rest) pie.push({ name: 'Other users', value: rest, color: PALETTE[9] });
  const show = (k) => activity === 'all' || activity === k;

  return (
    <div className="space-y-5">
      {filters}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={Database} tone="blue" label="Total storage used" value={formatBytes(d.storage.total_bytes)} sub="encrypted bytes on disk" />
        <StatCard icon={FileText} tone="green" label="Total files" value={d.storage.total_files.toLocaleString()} sub="excluding trash" />
        <StatCard icon={UploadCloud} tone="purple" label="Uploads in period" value={d.uploads.total.toLocaleString()} />
        <StatCard icon={Download} tone="rose" label="Downloads in period" value={d.downloads.total.toLocaleString()} />
        <StatCard icon={Share2} tone="amber" label="Shares in period" value={d.sharing.total.toLocaleString()} />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <ChartCard title="Storage usage by user" className="lg:col-span-2">
          <Donut data={pie} height={220} center={<><div className="text-xl font-extrabold">{formatBytes(d.storage.total_bytes)}</div><div className="text-xs text-ink-faint">{users.length} user{users.length === 1 ? '' : 's'}</div></>} />
          <ul className="mt-3 space-y-1.5 text-sm">{pie.map((p) => <li key={p.name} className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />{p.name}</span><span className="text-ink-soft">{formatBytes(p.value)}</span></li>)}</ul>
        </ChartCard>
        <ChartCard title="User-wise storage" className="lg:col-span-3">
          {users.length === 0 ? <p className="py-8 text-center text-sm text-ink-soft">No stored files match these filters.</p> : (
            <Table><thead><tr><th className="th">User</th><th className="th">Files</th><th className="th">Storage used</th><th className="th">Share</th></tr></thead>
              <tbody>{users.map((u) => (
                <tr key={u.user_id} className="border-t border-slate-100"><td className="td"><div className="font-semibold">{u.name}</div><div className="text-xs text-ink-faint">{u.email}</div></td>
                  <td className="td">{u.files}</td><td className="td">{formatBytes(u.bytes)}</td>
                  <td className="td"><div className="flex items-center gap-2"><div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-brand-600" style={{ width: `${u.percent}%` }} /></div><span className="text-xs text-ink-soft">{u.percent}%</span></div></td></tr>))}</tbody></Table>)}
        </ChartCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {show('uploads') && <ChartCard title="File uploads by date"><StackedBars data={d.uploads.series} keys={['documents', 'images', 'videos', 'others']} /></ChartCard>}
        {show('downloads') && <ChartCard title="File downloads"><Trend data={d.downloads.series} keys={['total', 'unique_users', 'shared']} area /></ChartCard>}
        {show('sharing') && <ChartCard title="File-sharing statistics"><StackedBars data={d.sharing.series} keys={['direct', 'link', 'internal']} /></ChartCard>}
        <ChartCard title="Most frequently downloaded files">
          {d.downloads.top_files.length === 0 ? <p className="py-8 text-center text-sm text-ink-soft">No downloads in this period.</p> : (
            <Table><thead><tr><th className="th">File</th><th className="th">Downloads</th></tr></thead>
              <tbody>{d.downloads.top_files.map((f) => <tr key={f.file_id} className="border-t border-slate-100"><td className="td font-semibold">{f.name}</td><td className="td">{f.downloads}</td></tr>)}</tbody></Table>)}
        </ChartCard>
      </div>
    </div>
  );
}
