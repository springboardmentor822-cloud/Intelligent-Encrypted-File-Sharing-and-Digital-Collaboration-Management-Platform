import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Download, Share2, UploadCloud } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatBytes, pct, timeAgo } from '@/lib/format';
import { EmptyState, FileIcon, ProgressBar, StatCard } from './ui';

export default function DashboardHome() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState(null);
  useEffect(() => {
    api.get('/analytics/files').then((r) => setStats(r.data)).catch(() => {});
    api.get('/files', { params: { view: 'recent' } }).then((r) => setRecent(r.data.items.slice(0, 6))).catch(() => setRecent([]));
  }, []);
  const c = stats?.cards;
  return (
    <div className="space-y-6">
      <div className="card flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-brand-600 to-brand-500 p-6 text-white">
        <div><h2 className="text-xl font-extrabold">Hi {user.full_name.split(' ')[0]}, your files are encrypted and ready.</h2>
          <p className="mt-1 text-sm text-brand-100">{c ? `${formatBytes(c.storage.used)} of ${formatBytes(c.storage.quota, 0)} used (${pct(c.storage.used, c.storage.quota)}%).` : 'Loading your storage…'}</p>
          {c && <div className="mt-3 w-64 max-w-full"><ProgressBar value={pct(c.storage.used, c.storage.quota)} tone="bg-white" /></div>}</div>
        <Link href="/app/files" className="btn bg-white text-brand-700 hover:bg-brand-50"><UploadCloud className="h-4 w-4" />Upload files</Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={UploadCloud} tone="green" label="Uploads · last 30 days" value={c?.uploads.value ?? '—'} delta={c?.uploads.change_pct} />
        <StatCard icon={Download} tone="purple" label="Downloads · last 30 days" value={c?.downloads.value ?? '—'} delta={c?.downloads.change_pct} />
        <StatCard icon={Share2} tone="rose" label="Shares · last 30 days" value={c?.shares.value ?? '—'} delta={c?.shares.change_pct} />
      </div>
      <section className="card">
        <div className="flex items-center justify-between px-5 pt-5"><h2 className="font-bold">Recent files</h2><Link href="/app/recent" className="flex items-center gap-1 text-sm font-semibold text-brand-600">View all <ArrowRight className="h-4 w-4" /></Link></div>
        {!recent ? <p className="p-6 text-sm text-ink-soft">Loading…</p> : recent.length === 0 ? <EmptyState icon={UploadCloud} title="No files yet" hint="Upload your first file from My Files." /> : (
          <ul className="divide-y divide-slate-100 p-2">{recent.map((f) => (
            <li key={f.id} className="flex items-center gap-3 rounded-xl px-3 py-3"><FileIcon category={f.category} name={f.name} />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{f.name}</p><p className="text-xs text-ink-faint">{formatBytes(f.size_bytes)}</p></div>
              <span className="text-xs text-ink-faint">{timeAgo(f.created_at)}</span></li>))}</ul>)}
      </section>
    </div>
  );
}
