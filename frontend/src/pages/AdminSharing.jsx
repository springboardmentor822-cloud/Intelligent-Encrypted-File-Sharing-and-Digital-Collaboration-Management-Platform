// Admin → Sharing Reports: every share link on the platform, with its state. Admins can revoke any link.
import { useCallback, useEffect, useState } from "react";
import { Ban, CheckCircle2, Clock, Gauge, Users } from "lucide-react";
import api, { errorMessage } from "../lib/api";
import { formatStamp } from "../lib/format";
import { EmptyState, Led, PageHeader, StatCard } from "../components/ui";

const TONE = { active: "on", expired: "off", revoked: "bad", exhausted: "warn", unavailable: "warn" };

export default function AdminSharing() {
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => { api.get("/admin/shares").then((r) => setD(r.data)).catch(async (e) => setError(await errorMessage(e))); }, []);
  useEffect(() => { load(); }, [load]);

  const revoke = async (l) => {
    if (!confirm(`Revoke the link for "${l.file_name}"? It stops working immediately.`)) return;
    try { await api.delete(`/share/links/${l.id}`); load(); } catch (e) { setError(await errorMessage(e)); }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader title="Sharing Reports" subtitle="Every share link on the platform and whether it can still be used." />
      {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {!d ? <p className="py-16 text-center text-slate-500">Loading...</p> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard icon={CheckCircle2} tone="green" label="Active links" value={d.counts.active} />
            <StatCard icon={Clock} tone="amber" label="Expired" value={d.counts.expired} />
            <StatCard icon={Ban} tone="red" label="Revoked" value={d.counts.revoked} />
            <StatCard icon={Gauge} tone="violet" label="Download limit reached" value={d.counts.exhausted} />
            <StatCard icon={Users} label="People with access" value={d.people_permissions} sub="direct permissions" />
          </div>
          {d.links.length === 0 ? <EmptyState title="No links created yet" /> : (
            <div className="card overflow-x-auto p-0">
              <table className="w-full text-left text-sm">
                <thead className="bg-paper-100 text-xs text-slate-500"><tr><th className="p-3.5 font-medium">File</th><th className="font-medium">Created by</th><th className="font-medium">Status</th><th className="font-medium">Expires</th><th className="font-medium">Downloads</th><th className="font-medium">Rules</th><th className="pr-3 text-right font-medium">Action</th></tr></thead>
                <tbody>
                  {d.links.map((l) => (
                    <tr key={l.id} className="border-b border-paper-200 last:border-0">
                      <td className="max-w-[220px] truncate p-3.5 font-medium text-ink-950">{l.file_name}</td>
                      <td className="text-slate-600">{l.created_by}</td>
                      <td><span className="flex items-center gap-2 capitalize"><Led tone={TONE[l.status] || "off"} pulse={l.status === "active"} />{l.status}</span></td>
                      <td className="whitespace-nowrap text-slate-600">{formatStamp(l.expires_at)}</td>
                      <td className="tabular text-slate-600">{l.download_count}{l.max_downloads ? ` / ${l.max_downloads}` : ""}</td>
                      <td className="text-xs text-slate-500">{l.allow_download ? "download" : "view only"}{l.has_password ? " · password" : ""}</td>
                      <td className="pr-3 text-right">{l.status === "active" && <button className="btn-secondary !px-3 !py-1.5 text-red-600" onClick={() => revoke(l)}>Revoke</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
