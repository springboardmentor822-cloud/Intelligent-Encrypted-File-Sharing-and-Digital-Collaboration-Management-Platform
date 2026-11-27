import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { ErrorNote, Modal, Spinner } from './ui';

/** Shows a decrypted file inline. `load` returns a Blob (the server decrypts and verifies it first). */
export default function PreviewModal({ name, load, onDownload, onClose }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let url, alive = true;
    load().then(async (blob) => {
      if (!alive) return;
      const type = blob.type || '';
      if (type.startsWith('text/') || type === 'application/json') {
        setState({ text: (await blob.text()).slice(0, 200000), type });
      } else { url = URL.createObjectURL(blob); setState({ url, type }); }
    }).catch((e) => alive && setState({ error: e.message }));
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { loading, error, url, text, type = '' } = state;
  return (
    <Modal title={name} onClose={onClose} wide
      footer={onDownload && <button className="btn-secondary" onClick={onDownload}><Download className="h-4 w-4" />Download</button>}>
      {loading && <div className="flex justify-center py-16"><Spinner className="h-7 w-7" /></div>}
      {error && <ErrorNote>{error}</ErrorNote>}
      {text != null && <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm">{text}</pre>}
      {url && type.startsWith('image/') && <img src={url} alt={name} className="mx-auto max-h-[60vh] rounded-xl" />}
      {url && type.startsWith('video/') && <video src={url} controls className="mx-auto max-h-[60vh] w-full rounded-xl" />}
      {url && type === 'application/pdf' && <iframe src={url} title={name} className="h-[60vh] w-full rounded-xl border" />}
      {url && !/^(image|video)\//.test(type) && type !== 'application/pdf' && (
        <p className="py-10 text-center text-sm text-ink-soft">A preview isn’t available for this file type. Download it to open it.</p>)}
    </Modal>
  );
}
