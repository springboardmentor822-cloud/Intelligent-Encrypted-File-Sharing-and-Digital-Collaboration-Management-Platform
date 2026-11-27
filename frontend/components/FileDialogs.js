import { useEffect, useRef, useState } from 'react';
import { Download, UploadCloud } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { downloadFrom } from '@/lib/download';
import { formatBytes, formatDate } from '@/lib/format';
import { ErrorNote, Modal, Spinner } from './ui';
import { useToast } from './Toast';

export function PromptModal({ title, label, initial = '', cta = 'Save', onSubmit, onClose }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await onSubmit(value); onClose(); } catch (err) { setError(errorMessage(err)); setBusy(false); }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorNote>{error}</ErrorNote>
        <div><label className="label" htmlFor="pv">{label}</label><input id="pv" autoFocus required className="input" value={value} onChange={(e) => setValue(e.target.value)} onFocus={(e) => e.target.select()} /></div>
        <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? <Spinner className="!text-white" /> : cta}</button></div>
      </form>
    </Modal>
  );
}

export function ConfirmModal({ title, message, cta, danger, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const go = async () => { setBusy(true); try { await onConfirm(); onClose(); } catch (e) { setError(errorMessage(e)); setBusy(false); } };
  return (
    <Modal title={title} onClose={onClose} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button>
      <button className={danger ? 'btn-danger' : 'btn-primary'} disabled={busy} onClick={go}>{busy ? <Spinner className="!text-white" /> : cta}</button></>}>
      <p className="text-sm text-ink-soft">{message}</p><div className="mt-3"><ErrorNote>{error}</ErrorNote></div>
    </Modal>
  );
}

export function MoveModal({ file, folders, onMoved, onClose }) {
  const [target, setTarget] = useState(file.folder_id || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pathOf = (f) => { const parts = [f.name]; let p = f.parent_id; while (p) { const x = folders.find((y) => y.id === p); if (!x) break; parts.unshift(x.name); p = x.parent_id; } return parts.join(' / '); };
  const go = async () => {
    setBusy(true);
    try { await api.patch(`/files/${file.id}`, { folder_id: target || null }); onMoved(); onClose(); } catch (e) { setError(errorMessage(e)); setBusy(false); }
  };
  return (
    <Modal title={`Move “${file.name}”`} onClose={onClose} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy} onClick={go}>Move here</button></>}>
      <ErrorNote>{error}</ErrorNote>
      <label className="label" htmlFor="mv">Destination</label>
      <select id="mv" className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
        <option value="">My Files (top level)</option>{folders.map((f) => <option key={f.id} value={f.id}>{pathOf(f)}</option>)}
      </select>
    </Modal>
  );
}

export function VersionsModal({ file, onChanged, onClose }) {
  const toast = useToast();
  const [versions, setVersions] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef(null);
  const load = () => api.get(`/files/${file.id}/versions`).then((r) => setVersions([...r.data].reverse())).catch((e) => setError(errorMessage(e)));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (f) => {
    if (!f) return;
    setBusy(true); setError('');
    const fd = new FormData(); fd.append('file', f);
    try { await api.post(`/files/${file.id}/versions`, fd); toast('New version uploaded'); await load(); onChanged(); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Versions of “${file.name}”`} onClose={onClose} wide
      footer={<button className="btn-primary" disabled={busy} onClick={() => input.current.click()}>{busy ? <Spinner className="!text-white" /> : <><UploadCloud className="h-4 w-4" />Upload new version</>}</button>}>
      <input ref={input} type="file" hidden onChange={(e) => { upload(e.target.files[0]); e.target.value = ''; }} />
      <ErrorNote>{error}</ErrorNote>
      {!versions ? <Spinner /> : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {versions.map((v) => (
            <li key={v.version} className="flex items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1"><div className="font-semibold">Version {v.version}{v.current && <span className="ml-2 rounded-md bg-brand-50 px-1.5 py-0.5 text-xs font-bold text-brand-700">Current</span>}</div>
                <div className="text-xs text-ink-faint">{formatBytes(v.size_bytes)} · {formatDate(v.created_at, true)} · {v.algorithm}</div></div>
              <button className="btn-secondary !px-3 !py-1.5 !text-xs" onClick={() => downloadFrom(`/files/${file.id}/download?version=${v.version}`, file.name).catch((e) => toast(e.message, 'error'))}><Download className="h-3.5 w-3.5" />Download</button>
            </li>))}
        </ul>)}
    </Modal>
  );
}
