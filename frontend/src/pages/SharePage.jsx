// Public page opened from a secure share link. No login needed.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Clock, Download, Eye, Lock, ShieldCheck } from "lucide-react";
import api, { accessSharedFile, errorMessage } from "../lib/api";
import { formatBytes, formatDate } from "../lib/format";

export default function SharePage() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  useEffect(() => {
    api.get(`/share/public/${token}`).then((r) => setInfo(r.data)).catch(async (e) => setError(await errorMessage(e)));
  }, [token]);

  const access = async (mode) => {
    setBusy(true); setError(""); setDone("");
    try {
      await accessSharedFile(token, password || null, mode, info.file_name, info.mime_type);
      setDone(mode === "download" ? "Download started." : "Opened in a new tab.");
      const { data } = await api.get(`/share/public/${token}`);
      setInfo(data);
    } catch (e) { setError(await errorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 p-4">
      <div className="card w-full max-w-md text-center">
        <div className="mx-auto mb-3 w-fit rounded-2xl bg-brand-600 p-3 text-white"><ShieldCheck size={30} /></div>
        <h1 className="text-lg font-bold">TrustShare secure file</h1>
        {error && !info && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {info && (
          <div className="mt-4 space-y-3 text-left">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="break-all font-medium">{info.file_name}</div>
              <div className="text-sm text-slate-500">{formatBytes(info.size_bytes)}</div>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600"><Clock size={14} /> Expires {formatDate(info.expires_at)}</div>
            {info.remaining_downloads !== null && (
              <div className="text-sm text-slate-600">Downloads remaining: <b>{info.remaining_downloads}</b></div>
            )}
            {info.requires_password && (
              <div>
                <label className="label flex items-center gap-1"><Lock size={14} /> Password required</label>
                <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            )}
            {error && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}
            {done && <div className="rounded-lg bg-green-50 p-2 text-sm text-green-700">{done}</div>}
            <div className="flex gap-2">
              {info.allow_download && (
                <button className="btn-primary flex-1" disabled={busy} onClick={() => access("download")}><Download size={16} /> Download</button>
              )}
              <button className="btn-secondary flex-1" disabled={busy} onClick={() => access("view")}><Eye size={16} /> View</button>
            </div>
            {!info.allow_download && <p className="text-center text-xs text-slate-500">This link is view-only.</p>}
            <p className="text-center text-xs text-slate-400">The file is stored encrypted (AES-256) and decrypted only for you.</p>
          </div>
        )}
      </div>
    </div>
  );
}
