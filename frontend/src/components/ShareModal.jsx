import { useEffect, useState } from "react";
import { Copy, Link2, Trash2, UserPlus } from "lucide-react";
import api, { errorMessage } from "../lib/api";
import { formatDate } from "../lib/format";
import Modal from "./Modal";

export default function ShareModal({ file, onClose }) {
  const [tab, setTab] = useState("link");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  // ----- link state -----
  const [ttl, setTtl] = useState(24);
  const [maxDl, setMaxDl] = useState("");
  const [password, setPassword] = useState("");
  const [allowDownload, setAllowDownload] = useState(true);
  const [createdUrl, setCreatedUrl] = useState("");
  const [links, setLinks] = useState([]);

  // ----- people state -----
  const [email, setEmail] = useState("");
  const [level, setLevel] = useState("download");
  const [perms, setPerms] = useState([]);

  const loadLinks = () =>
    api.get("/share/links").then((r) => setLinks(r.data.filter((l) => l.file_id === file.id))).catch(() => {});
  const loadPerms = () =>
    api.get(`/files/${file.id}/permissions`).then((r) => setPerms(r.data)).catch(() => {});

  useEffect(() => { loadLinks(); loadPerms(); }, []);

  const createLink = async () => {
    setError(""); setCreatedUrl("");
    try {
      const { data } = await api.post(`/share/links/${file.id}`, {
        ttl_hours: Number(ttl),
        max_downloads: maxDl ? Number(maxDl) : null,
        password: password || null,
        allow_download: allowDownload,
      });
      setCreatedUrl(data.url);
      setPassword("");
      loadLinks();
    } catch (e) { setError(await errorMessage(e)); }
  };

  const revoke = async (id) => { await api.delete(`/share/links/${id}`); loadLinks(); };

  const grant = async () => {
    setError(""); setMsg("");
    try {
      await api.post(`/files/${file.id}/permissions`, { email, level });
      setEmail(""); setMsg("Access granted. The user was notified.");
      loadPerms();
    } catch (e) { setError(await errorMessage(e)); }
  };
  const removePerm = async (id) => { await api.delete(`/files/${file.id}/permissions/${id}`); loadPerms(); };

  const statusColor = { active: "text-green-600", expired: "text-slate-500", revoked: "text-red-600", exhausted: "text-amber-600", unavailable: "text-amber-600" };

  return (
    <Modal title={`Share "${file.original_name}"`} onClose={onClose} wide>
      <div className="mb-4 flex gap-2 border-b">
        {[["link", "Secure link", Link2], ["people", "People", UserPlus]].map(([key, label, Icon]) => (
          <button key={key} onClick={() => { setTab(key); setError(""); setMsg(""); }}
            className={`flex items-center gap-2 border-b-2 px-3 py-2 text-sm ${tab === key ? "border-brand-600 font-medium text-brand-700" : "border-transparent text-slate-500"}`}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>
      {error && <div className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}
      {msg && <div className="mb-3 rounded-lg bg-green-50 p-2 text-sm text-green-700">{msg}</div>}

      {tab === "link" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Expires after (hours)</label>
              <input type="number" min="1" max="720" className="input" value={ttl} onChange={(e) => setTtl(e.target.value)} />
            </div>
            <div>
              <label className="label">Max downloads (optional)</label>
              <input type="number" min="1" className="input" placeholder="Unlimited" value={maxDl} onChange={(e) => setMaxDl(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Password (optional)</label>
            <input type="text" className="input" placeholder="Leave empty for no password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allowDownload} onChange={(e) => setAllowDownload(e.target.checked)} />
            Allow download (untick for view-only)
          </label>
          <button className="btn-primary" onClick={createLink}>Generate secure link</button>

          {createdUrl && (
            <div className="rounded-lg bg-brand-50 p-3 text-sm">
              <p className="mb-1 font-medium">Copy this link now - it is shown only once:</p>
              <div className="flex gap-2">
                <input readOnly className="input" value={createdUrl} />
                <button className="btn-secondary" onClick={() => navigator.clipboard.writeText(createdUrl)}><Copy size={16} /></button>
              </div>
            </div>
          )}

          <h3 className="pt-2 text-sm font-semibold">Existing links for this file</h3>
          {links.length === 0 && <p className="text-sm text-slate-500">No links yet.</p>}
          {links.map((l) => (
            <div key={l.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
              <div>
                <span className={`font-medium capitalize ${statusColor[l.status]}`}>{l.status}</span>
                <span className="text-slate-500"> - expires {formatDate(l.expires_at)} - {l.download_count}{l.max_downloads ? `/${l.max_downloads}` : ""} downloads
                  {l.has_password ? " - password" : ""}{!l.allow_download ? " - view-only" : ""}</span>
              </div>
              {l.status === "active" && (
                <button className="rounded p-1 text-red-600 hover:bg-red-50" onClick={() => revoke(l.id)} title="Revoke"><Trash2 size={16} /></button>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "people" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input className="input" placeholder="Registered user's email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <select className="input w-40" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="view">View</option>
              <option value="download">Download</option>
              <option value="admin">Admin</option>
            </select>
            <button className="btn-primary" onClick={grant}>Add</button>
          </div>
          <h3 className="pt-2 text-sm font-semibold">People with access</h3>
          {perms.length === 0 && <p className="text-sm text-slate-500">Only you.</p>}
          {perms.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
              <span>{p.full_name} <span className="text-slate-500">({p.email})</span> - <b className="capitalize">{p.level}</b></span>
              <button className="rounded p-1 text-red-600 hover:bg-red-50" onClick={() => removePerm(p.id)}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
