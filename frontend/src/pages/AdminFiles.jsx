// Admin → File Management: every file on the platform (details only: admins never see file content or keys).
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Crosshair, Trash2 } from "lucide-react";
import api, { errorMessage } from "../lib/api";
import { extOf, formatBytes, formatStamp } from "../lib/format";
import FileTile from "../components/FileTile";
import { Avatar, EmptyState, PageHeader, Segmented, Seal } from "../components/ui";

export default function AdminFiles() {
  const [params] = useSearchParams();
  const q = params.get("q") || "";
  const [status, setStatus] = useState("active");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api.get("/admin/files", { params: { q: q || undefined, status } }).then((r) => setRows(r.data)).catch(async (e) => setError(await errorMessage(e)));
  }, [q, status]);
  useEffect(() => { load(); }, [load]);

  const trash = async (f) => {
    if (!confirm(`Move "${f.name}" to its owner's Trash?`)) return;
    try { await api.delete(`/files/${f.id}`); load(); } catch (e) { setError(await errorMessage(e)); }
  };

  const trap = async (f) => {
    try { await api.put(`/admin/access/tripwires/${f.id}`, { on: !f.tripwire }); load(); } catch (e) { setError(await errorMessage(e)); }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader title="File Management" subtitle={q ? `Files matching "${q}"` : "All files on the platform. Contents stay encrypted; you only see details."}>
        <Segmented value={status} onChange={setStatus} options={[["active", "Active"], ["trash", "In Trash"]]} />
      </PageHeader>
      {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {rows === null ? <p className="py-16 text-center text-slate-500">Loading...</p> : rows.length === 0 ? <EmptyState title="No files found" /> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper-100 text-xs text-slate-500">
              <tr><th className="p-3.5 font-medium">File</th><th className="font-medium">Owner</th><th className="font-medium">Size</th><th className="font-medium">Type</th><th className="font-medium">{status === "trash" ? "Deleted" : "Uploaded"}</th><th className="pr-3 text-right font-medium">Action</th></tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id} className="border-b border-paper-200 last:border-0 hover:bg-paper-50">
                  <td className="p-3.5"><span className="flex items-center gap-3"><FileTile category={f.category} size={34} /><span><span className="block font-medium text-ink-950">{f.name}{f.tripwire && <span className="ml-2 rounded bg-red-50 px-1.5 py-px text-[10px] font-bold text-red-600">TRIPWIRE</span>}</span><Seal version={f.kek_version} compact /></span></span></td>
                  <td><span className="flex items-center gap-2"><Avatar name={f.owner_name} size={26} /><span><span className="block text-slate-800">{f.owner_name}</span><span className="text-xs text-slate-500">{f.owner_email}</span></span></span></td>
                  <td className="whitespace-nowrap tabular text-slate-600">{formatBytes(f.size_bytes)}</td>
                  <td className="text-slate-600">{extOf(f.name)}</td>
                  <td className="whitespace-nowrap text-slate-600">{formatStamp(status === "trash" ? f.deleted_at : f.created_at)}</td>
                  <td className="whitespace-nowrap pr-3 text-right">{status === "active" && <button title={f.tripwire ? "Remove tripwire" : "Set as a tripwire (trap file)"} className={`rounded-lg p-2 ${f.tripwire ? "bg-red-50 text-red-500" : "text-slate-400 hover:bg-red-50 hover:text-red-500"}`} onClick={() => trap(f)}><Crosshair size={16} /></button>}{status === "active" && <button title="Move to Trash" className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => trash(f)}><Trash2 size={16} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
