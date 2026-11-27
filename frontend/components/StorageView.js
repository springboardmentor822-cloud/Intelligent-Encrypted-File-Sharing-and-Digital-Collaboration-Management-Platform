import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { formatBytes, pct } from '@/lib/format';
import { COLORS, ChartCard, Donut } from './charts';
import { ErrorNote, PageLoader, ProgressBar } from './ui';

const LABEL = { documents: 'Documents', images: 'Images', videos: 'Videos', others: 'Others' };

export default function StorageView() {
  const [u, setU] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/files/storage/usage').then((r) => setU(r.data)).catch((e) => setError(errorMessage(e))); }, []);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!u) return <PageLoader />;
  const data = Object.entries(u.by_category).map(([k, v]) => ({ name: LABEL[k], value: v.bytes, color: COLORS[k], files: v.files }));
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <ChartCard title="Your storage">
        <div className="mb-2 flex items-baseline justify-between"><span className="text-3xl font-extrabold">{formatBytes(u.used)}</span><span className="text-sm text-ink-soft">of {formatBytes(u.quota, 0)} · {pct(u.used, u.quota)}%</span></div>
        <ProgressBar value={pct(u.used, u.quota)} />
        <p className="mt-3 text-sm text-ink-soft">{formatBytes(u.quota - u.used)} available. Includes all file versions and anything in the trash{u.trash_bytes ? ` (${formatBytes(u.trash_bytes)})` : ''}.</p>
      </ChartCard>
      <ChartCard title="By file type">
        <div className="grid items-center gap-4 sm:grid-cols-2">
          <Donut data={data} height={170} center={<div className="text-lg font-extrabold">{formatBytes(u.used)}</div>} />
          <ul className="space-y-2.5">{data.map((d) => (
            <li key={d.name} className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />{d.name}</span>
              <span className="text-ink-soft">{formatBytes(d.value)} · {d.files} file{d.files === 1 ? '' : 's'}</span></li>))}</ul>
        </div>
      </ChartCard>
    </div>
  );
}
