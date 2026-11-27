import { useCallback, useEffect, useState } from 'react';
import { Download, Eye, Ban, Users, Send } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { downloadFrom, fetchBlob } from '@/lib/download';
import { formatBytes, formatDate, timeAgo } from '@/lib/format';
import PreviewModal from './PreviewModal';
import { useToast } from './Toast';
import { Badge, EmptyState, ErrorNote, FileIcon, PageLoader, StatusBadge, Table } from './ui';

export function SharedWithMe() {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  useEffect(() => { api.get('/shares/with-me').then((r) => setItems(r.data.items)).catch((e) => setError(errorMessage(e))); }, []);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!items) return <PageLoader />;
  const dl = (f) => downloadFrom(`/files/${f.id}/download`, f.name).catch((e) => toast(e.message, 'error'));
  return (
    <div className="card overflow-hidden">
      {items.length === 0 ? <EmptyState icon={Users} title="Nothing shared with you yet" hint="When someone shares a file with you, it will appear here." /> : (
        <Table><thead className="bg-slate-50/60"><tr><th className="th">Name</th><th className="th">Shared by</th><th className="th">Access</th><th className="th">Size</th><th className="th">Access ends</th><th className="th"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{items.map((f) => (
            <tr key={f.id} className="border-t border-slate-100 hover:bg-slate-50/60">
              <td className="td"><div className="flex items-center gap-3"><FileIcon category={f.category} name={f.name} /><span className="font-semibold">{f.name}</span></div></td>
              <td className="td">{f.shared_by_name}<div className="text-xs text-ink-faint">{timeAgo(f.shared_at)}</div></td>
              <td className="td"><Badge tone={f.access === 'download' ? 'green' : 'blue'}>{f.access === 'download' ? 'View & download' : 'View only'}</Badge></td>
              <td className="td text-ink-soft">{formatBytes(f.size_bytes)}</td>
              <td className="td text-ink-soft">{f.share_expires_at ? formatDate(f.share_expires_at, true) : 'No expiry'}</td>
              <td className="td"><div className="flex justify-end gap-2">
                <button className="btn-secondary !px-3 !py-1.5 !text-xs" onClick={() => setPreview(f)}><Eye className="h-3.5 w-3.5" />View</button>
                {f.access === 'download' && <button className="btn-primary !px-3 !py-1.5 !text-xs" onClick={() => dl(f)}><Download className="h-3.5 w-3.5" />Download</button>}</div></td>
            </tr>))}</tbody></Table>)}
      {preview && <PreviewModal name={preview.name} load={() => fetchBlob(`/files/${preview.id}/view`)} onDownload={preview.access === 'download' ? () => dl(preview) : null} onClose={() => setPreview(null)} />}
    </div>
  );
}

export function SharedByMe() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api.get('/shares/by-me').then((r) => setData(r.data)).catch((e) => setError(errorMessage(e))), []);
  useEffect(() => { load(); }, [load]);
  const revoke = async (url) => { try { await api.delete(url); toast('Access revoked'); load(); } catch (e) { toast(errorMessage(e), 'error'); } };
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <PageLoader />;
  if (!data.links.length && !data.users.length) return <div className="card"><EmptyState icon={Send} title="You haven’t shared anything yet" hint="Open a file’s menu in My Files and choose Share." /></div>;
  return (
    <div className="space-y-6">
      <section className="card overflow-hidden"><h2 className="px-5 pt-5 text-base font-bold">Share links</h2>
        {data.links.length === 0 ? <p className="px-5 py-6 text-sm text-ink-soft">No links created.</p> : (
          <Table><thead><tr><th className="th">File</th><th className="th">Permission</th><th className="th">Status</th><th className="th">Opens</th><th className="th">Downloads</th><th className="th">Expires</th><th className="th" /></tr></thead>
            <tbody>{data.links.map((l) => (
              <tr key={l.id} className="border-t border-slate-100">
                <td className="td font-semibold">{l.file_name}</td><td className="td">{l.permission === 'download' ? 'View & download' : 'View only'}</td>
                <td className="td"><StatusBadge status={l.status} /></td><td className="td">{l.access_count}</td><td className="td">{l.download_count}{l.max_downloads ? ` / ${l.max_downloads}` : ''}</td>
                <td className="td whitespace-nowrap text-ink-soft">{formatDate(l.expires_at, true)}</td>
                <td className="td">{l.status === 'active' && <button className="btn-secondary !px-3 !py-1.5 !text-xs" onClick={() => revoke(`/shares/links/${l.id}`)}><Ban className="h-3.5 w-3.5" />Revoke</button>}</td>
              </tr>))}</tbody></Table>)}</section>
      <section className="card overflow-hidden"><h2 className="px-5 pt-5 text-base font-bold">People</h2>
        {data.users.length === 0 ? <p className="px-5 py-6 text-sm text-ink-soft">Nothing shared with individual people.</p> : (
          <Table><thead><tr><th className="th">File</th><th className="th">Shared with</th><th className="th">Permission</th><th className="th">Status</th><th className="th">Access ends</th><th className="th" /></tr></thead>
            <tbody>{data.users.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="td font-semibold">{s.file_name}</td><td className="td">{s.shared_with_name}<div className="text-xs text-ink-faint">{s.shared_with_email}</div></td>
                <td className="td">{s.permission === 'download' ? 'View & download' : 'View only'}</td><td className="td"><StatusBadge status={s.status} /></td>
                <td className="td text-ink-soft">{s.expires_at ? formatDate(s.expires_at, true) : 'No expiry'}</td>
                <td className="td">{s.status === 'active' && <button className="btn-secondary !px-3 !py-1.5 !text-xs" onClick={() => revoke(`/shares/users/${s.id}`)}><Ban className="h-3.5 w-3.5" />Remove</button>}</td>
              </tr>))}</tbody></Table>)}</section>
    </div>
  );
}
