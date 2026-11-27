import { useEffect, useState } from 'react';
import { Database, Download, Share2, UploadCloud } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { formatBytes, formatDate } from '@/lib/format';
import { ChartCard, COLORS, Donut, StackedBars, Trend } from './charts';
import { DateRange, useRange } from './DateRange';
import { ErrorNote, FileIcon, PageLoader, StatCard, Table } from './ui';

const CAT_LABEL = { documents: 'Documents', images: 'Images', videos: 'Videos', others: 'Others' };

/** File analytics dashboard. `endpoint` decides whether it shows your own files or (admin) the whole system. */
export default function FileAnalytics({ endpoint, scope = 'your' }) {
  const [range, setRange] = useRange(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    api.get(endpoint, { params: range }).then((r) => setData(r.data)).catch((e) => setError(errorMessage(e)));
  }, [endpoint, range]);

  const header = (
    <div className="mb-5 flex justify-end"><DateRange range={range} onChange={setRange} /></div>
  );
  if (error) return <>{header}<ErrorNote>{error}</ErrorNote></>;
  if (!data) return <>{header}<PageLoader /></>;

  const c = data.cards;
  const total = data.storage_by_category.reduce((s, x) => s + x.bytes, 0);
  const quota = c.storage.quota;
  const donut = data.storage_by_category.map((x) => ({ name: CAT_LABEL[x.category], value: x.bytes, color: COLORS[x.category] }));

  return (
    <div className="space-y-5">
      {header}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Database} tone="blue" label="Total storage used" value={formatBytes(c.storage.used)} delta={c.storage.change_pct}
          sub={quota ? `of ${formatBytes(quota, 0)}` : 'across all users'} />
        <StatCard icon={UploadCloud} tone="green" label="Total uploads" value={c.uploads.value.toLocaleString()} delta={c.uploads.change_pct} sub="files uploaded" />
        <StatCard icon={Download} tone="purple" label="Total downloads" value={c.downloads.value.toLocaleString()} delta={c.downloads.change_pct} sub="files downloaded" />
        <StatCard icon={Share2} tone="rose" label="Total shares" value={c.shares.value.toLocaleString()} delta={c.shares.change_pct} sub="files shared" />
      </div>
      <p className="-mt-2 text-xs text-ink-faint">Percent changes compare with the previous period of the same length.</p>

      <div className="grid gap-5 lg:grid-cols-5">
        <ChartCard title="Storage usage statistics" className="lg:col-span-2">
          <Donut data={donut} center={<><div className="text-xl font-extrabold">{formatBytes(total)}</div>{quota && <div className="text-xs text-ink-faint">of {formatBytes(quota, 0)}</div>}</>} />
          <ul className="mt-4 space-y-2">
            {donut.map((d) => (
              <li key={d.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />{d.name}</span>
                <span className="text-ink-soft">{formatBytes(d.value)} ({total ? Math.round((d.value / total) * 100) : 0}%)</span>
              </li>
            ))}
          </ul>
        </ChartCard>
        <ChartCard title="File upload reports" className="lg:col-span-3">
          <StackedBars data={data.uploads_series} keys={['documents', 'images', 'videos', 'others']} />
        </ChartCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Download analytics"><Trend data={data.downloads_series} keys={['total', 'unique_users', 'shared']} area /></ChartCard>
        <ChartCard title="Sharing activity reports"><StackedBars data={data.shares_series} keys={['direct', 'link', 'internal']} /></ChartCard>
      </div>
      <p className="-mt-2 text-xs text-ink-faint">“Internal” shares go to people with the same email domain, “direct” to other domains, “link” are share links.</p>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Recent uploads">
          {data.recent_uploads.length === 0 ? <p className="py-6 text-center text-sm text-ink-soft">No uploads yet.</p> : (
            <Table><thead><tr><th className="th">File name</th><th className="th">Size</th><th className="th">Type</th><th className="th">Date & time</th></tr></thead>
              <tbody>{data.recent_uploads.map((u, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="td"><div className="flex items-center gap-2.5"><FileIcon name={u.name} /><span className="font-medium">{u.name}</span></div></td>
                  <td className="td">{formatBytes(u.size_bytes)}</td><td className="td">{u.type}</td><td className="td whitespace-nowrap">{formatDate(u.created_at, true)}</td>
                </tr>))}</tbody></Table>)}
        </ChartCard>
        <ChartCard title="Recent downloads">
          {data.recent_downloads.length === 0 ? <p className="py-6 text-center text-sm text-ink-soft">No downloads yet.</p> : (
            <Table><thead><tr><th className="th">File name</th><th className="th">Downloaded by</th><th className="th">Size</th><th className="th">Date & time</th></tr></thead>
              <tbody>{data.recent_downloads.map((u, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="td"><div className="flex items-center gap-2.5"><FileIcon name={u.name} /><span className="font-medium">{u.name}</span></div></td>
                  <td className="td">{u.downloaded_by}</td><td className="td">{formatBytes(u.size_bytes)}</td><td className="td whitespace-nowrap">{formatDate(u.created_at, true)}</td>
                </tr>))}</tbody></Table>)}
        </ChartCard>
      </div>
    </div>
  );
}
