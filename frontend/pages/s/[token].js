import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { Clock, Download, Eye, Lock } from 'lucide-react';
import PreviewModal from '@/components/PreviewModal';
import { ErrorNote, FileIcon, Logo, PageLoader } from '@/components/ui';
import { errorMessage, publicApi } from '@/lib/api';
import { downloadFrom, fetchBlob } from '@/lib/download';
import { formatBytes, formatDate, timeUntil } from '@/lib/format';

export default function SharedFile() {
  const router = useRouter();
  const token = router.query.token;
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    publicApi.get(`/public/share/${token}`).then((r) => setInfo(r.data)).catch((e) => setError(errorMessage(e, 'This link isn’t available.')));
  }, [token]);

  const download = async () => {
    setBusy(true); setError('');
    try { await downloadFrom(`/public/share/${token}/download`, info.file.name, publicApi);
      setInfo((i) => ({ ...i, downloads_remaining: i.downloads_remaining == null ? null : Math.max(i.downloads_remaining - 1, 0) }));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-brand-50 to-surface p-4">
      <Link href="/" className="mb-8"><Logo /></Link>
      <div className="card w-full max-w-md p-7">
        {!info && !error && <PageLoader />}
        {error && !info && (<div className="py-6 text-center"><Lock className="mx-auto mb-3 h-9 w-9 text-ink-faint" /><p className="font-bold">Can’t open this link</p><p className="mt-1 text-sm text-ink-soft">{error}</p></div>)}
        {info && (<>
          <div className="flex items-center gap-4">
            <div className="scale-125"><FileIcon category={info.file.category} name={info.file.name} /></div>
            <div className="min-w-0"><p className="truncate text-lg font-bold">{info.file.name}</p><p className="text-sm text-ink-soft">{formatBytes(info.file.size_bytes)} · shared by {info.owner_name}</p></div>
          </div>
          <ul className="mt-5 space-y-2 text-sm text-ink-soft">
            <li className="flex items-center gap-2"><Clock className="h-4 w-4" />Link expires {timeUntil(info.expires_at)} ({formatDate(info.expires_at, true)})</li>
            <li className="flex items-center gap-2"><Lock className="h-4 w-4" />Encrypted at rest · {info.permission === 'download' ? 'view and download allowed' : 'view only'}</li>
            {info.downloads_remaining != null && <li className="flex items-center gap-2"><Download className="h-4 w-4" />{info.downloads_remaining} download{info.downloads_remaining === 1 ? '' : 's'} left</li>}
          </ul>
          <div className="mt-6"><ErrorNote>{error}</ErrorNote></div>
          <div className="mt-4 flex gap-3">
            <button className="btn-secondary flex-1" onClick={() => setPreview(true)}><Eye className="h-4 w-4" />View</button>
            {info.permission === 'download' && <button className="btn-primary flex-1" onClick={download} disabled={busy || info.downloads_remaining === 0}><Download className="h-4 w-4" />Download</button>}
          </div>
        </>)}
      </div>
      <p className="mt-6 text-xs text-ink-faint">Shared securely with TrustShare</p>
      {preview && <PreviewModal name={info.file.name} load={() => fetchBlob(`/public/share/${token}/view`, publicApi)}
        onDownload={info.permission === 'download' ? download : null} onClose={() => setPreview(false)} />}
    </div>
  );
}
