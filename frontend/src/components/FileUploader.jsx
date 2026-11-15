import { useRef, useState } from "react";
import { CheckCircle2, UploadCloud, XCircle } from "lucide-react";
import api, { errorMessage } from "../lib/api";
import { formatBytes } from "../lib/format";
import Modal from "./Modal";

const MAX_MB = 25;

export default function FileUploader({ folderId, onClose, onDone, initialFiles }) {
  const inputRef = useRef(null);
  const [items, setItems] = useState(() =>
    initialFiles ? [...initialFiles].map((file) => ({ file, progress: 0, status: "ready", error: "" })) : []
  ); // {file, progress, status, error}
  const [busy, setBusy] = useState(false);

  const update = (index, patch) =>
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));

  const choose = (fileList) => {
    setItems([...fileList].map((file) => ({ file, progress: 0, status: "ready", error: "" })));
  };

  const uploadAll = async () => {
    setBusy(true);
    for (let i = 0; i < items.length; i++) {
      const { file } = items[i];
      if (file.size > MAX_MB * 1024 * 1024) {
        update(i, { status: "error", error: `Larger than ${MAX_MB} MB` });
        continue;
      }
      const form = new FormData();
      form.append("file", file);
      if (folderId) form.append("folder_id", folderId);
      update(i, { status: "uploading" });
      try {
        await api.post("/files/upload", form, {
          onUploadProgress: (e) => update(i, { progress: Math.round((e.loaded * 100) / (e.total || file.size)) }),
        });
        update(i, { status: "done", progress: 100 });
      } catch (err) {
        update(i, { status: "error", error: await errorMessage(err) });
      }
    }
    setBusy(false);
    onDone();
  };

  return (
    <Modal title="Upload files" onClose={onClose}>
      <div
        className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-slate-300 p-8 text-center hover:border-brand-400"
        onClick={() => inputRef.current.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); choose(e.dataTransfer.files); }}
      >
        <UploadCloud className="mb-2 text-brand-500" size={36} />
        <p className="text-sm">Click to choose files or drag them here</p>
        <p className="text-xs text-slate-500">PDF, images, Word, Excel, PowerPoint, TXT, CSV, MP4/MOV/WEBM - up to {MAX_MB} MB</p>
        <input ref={inputRef} type="file" multiple hidden onChange={(e) => choose(e.target.files)} />
      </div>

      <div className="mt-4 space-y-3">
        {items.map((it, i) => (
          <div key={i} className="text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate">{it.file.name} <span className="text-slate-400">({formatBytes(it.file.size)})</span></span>
              {it.status === "done" && <CheckCircle2 size={16} className="text-green-600" />}
              {it.status === "error" && <XCircle size={16} className="text-red-600" />}
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-200">
              <div className={`h-full ${it.status === "error" ? "bg-red-500" : "bg-brand-500"}`} style={{ width: `${it.progress}%` }} />
            </div>
            {it.error && <p className="mt-1 text-xs text-red-600">{it.error}</p>}
          </div>
        ))}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Close</button>
        <button className="btn-primary" disabled={!items.length || busy} onClick={uploadAll}>
          {busy ? "Encrypting & uploading..." : "Upload"}
        </button>
      </div>
    </Modal>
  );
}
