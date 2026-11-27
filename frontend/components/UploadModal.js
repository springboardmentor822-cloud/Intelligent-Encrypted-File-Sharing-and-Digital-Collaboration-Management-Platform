import { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, UploadCloud, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import { Modal, Spinner } from './ui';

export default function UploadModal({ folderId, onClose, onDone }) {
  const [items, setItems] = useState([]);
  const [running, setRunning] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef(null);

  const patch = (id, p) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const add = (files) => setItems((xs) => [...xs, ...Array.from(files).map((file) => ({ id: Math.random().toString(36).slice(2), file, progress: 0, status: 'queued' }))]);

  const start = async () => {
    setRunning(true);
    for (const it of items.filter((x) => x.status === 'queued' || x.status === 'error')) {
      patch(it.id, { status: 'uploading', progress: 0, error: '' });
      const fd = new FormData();
      fd.append('file', it.file);
      if (folderId) fd.append('folder_id', folderId);
      try {
        await api.post('/files/upload', fd, { onUploadProgress: (e) => patch(it.id, { progress: e.total ? Math.round((e.loaded / e.total) * 100) : 50 }) });
        patch(it.id, { status: 'done', progress: 100 });
      } catch (err) { patch(it.id, { status: 'error', error: errorMessage(err, 'Upload failed.') }); }
    }
    setRunning(false); onDone();
  };

  const pending = items.some((x) => x.status === 'queued' || x.status === 'error');
  return (
    <Modal title="Upload files" onClose={onClose} wide
      footer={<><button className="btn-secondary" onClick={onClose}>{items.length && !pending ? 'Done' : 'Cancel'}</button>
        <button className="btn-primary" disabled={!pending || running} onClick={start}>{running ? <Spinner className="!text-white" /> : 'Encrypt & upload'}</button></>}>
      <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
        className={`flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-6 py-9 text-center transition ${drag ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-brand-200'}`}
        onClick={() => input.current.click()} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && input.current.click()}>
        <UploadCloud className="h-9 w-9 text-brand-600" />
        <p className="mt-2 font-semibold">Drag files here or click to browse</p>
        <p className="mt-1 text-xs text-ink-faint">PDF, Office documents, images, video, text and ZIP. Each file is encrypted before it is stored.</p>
        <input ref={input} type="file" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      </div>
      {items.length > 0 && (
        <ul className="mt-4 space-y-2">
          {items.map((it) => (
            <li key={it.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{it.file.name}</p><p className="text-xs text-ink-faint">{formatBytes(it.file.size)}</p></div>
                {it.status === 'done' && <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-label="Uploaded" />}
                {it.status === 'error' && <AlertCircle className="h-5 w-5 text-rose-600" aria-label="Failed" />}
                {it.status === 'uploading' && <span className="text-xs font-semibold text-brand-600">{it.progress}%</span>}
                {(it.status === 'queued' || it.status === 'error') && !running && <button className="btn-ghost !p-1" aria-label="Remove" onClick={() => setItems((xs) => xs.filter((x) => x.id !== it.id))}><X className="h-4 w-4" /></button>}
              </div>
              {it.status === 'uploading' && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-brand-600 transition-all" style={{ width: `${it.progress}%` }} /></div>}
              {it.error && <p className="mt-1.5 text-xs text-rose-600">{it.error}</p>}
            </li>))}
        </ul>)}
    </Modal>
  );
}
