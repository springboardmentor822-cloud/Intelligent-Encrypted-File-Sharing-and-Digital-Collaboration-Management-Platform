// Everything I own that I have shared: with people (permissions) and through links.
import { useCallback, useEffect, useState } from "react";
import { Link2, Send, Settings2, Users } from "lucide-react";
import api, { errorMessage } from "../lib/api";
import { formatBytes, formatDate } from "../lib/format";
import FileTile from "../components/FileTile";
import ShareModal from "../components/ShareModal";
import { EmptyState, Led, PageHeader } from "../components/ui";

const LINK_TONE = { active: "on", expired: "off", revoked: "bad", exhausted: "warn", unavailable: "warn" };

export default function SharedByMe() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [manage, setManage] = useState(null);

  const load = useCallback(() => {
    api.get("/share/by-me").then((r) => setRows(r.data)).catch(async (e) => setError(await errorMessage(e)));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader kicker="03 — Outgoing" title="Shared by Me"
        subtitle="Who can reach your files right now — people with access and links that are still alive. Revoke anything with one click." />
      {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {rows === null ? <p className="py-10 text-center text-slate-500">Loading...</p>
        : rows.length === 0 ? (
          <EmptyState icon={Send} title="You have not shared anything" text="Open My Files and press the share icon on a file to create a secure link or give a person access." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {rows.map(({ file, people, links, active_links }) => (
              <div key={file.id} className="card flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <FileTile category={file.category} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-lg font-bold">{file.original_name}</div>
                    <div className="text-xs text-slate-500">{formatBytes(file.size_bytes)}</div>
                  </div>
                  <button className="btn-secondary !px-3 !py-1.5" onClick={() => setManage(file)}><Settings2 size={15} /> Manage</button>
                </div>

                <div>
                  <div className="kicker mb-1.5 flex items-center gap-1.5"><Users size={12} /> People ({people.length})</div>
                  {people.length === 0 ? <p className="text-sm text-slate-400">Not shared with any person.</p> : (
                    <div className="flex flex-wrap gap-1.5">
                      {people.map((p) => (
                        <span key={p.id} className="rounded-full bg-paper-100 px-2.5 py-1 text-xs" title={p.email}>
                          {p.full_name} <b className="capitalize text-brand-700">· {p.level}</b>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="kicker mb-1.5 flex items-center gap-1.5"><Link2 size={12} /> Links ({active_links} active of {links.length})</div>
                  {links.length === 0 ? <p className="text-sm text-slate-400">No links created.</p> : (
                    <div className="space-y-1.5">
                      {links.slice(0, 4).map((l) => (
                        <div key={l.id} className="flex items-center gap-2 rounded-xl border border-paper-200 px-3 py-2 text-xs">
                          <Led tone={LINK_TONE[l.status] || "off"} pulse={l.status === "active"} />
                          <span className="font-medium capitalize">{l.status}</span>
                          <span className="text-slate-500">
                            expires {formatDate(l.expires_at)} · {l.download_count}{l.max_downloads ? `/${l.max_downloads}` : ""} downloads
                            {l.has_password ? " · password" : ""}{!l.allow_download ? " · view-only" : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      {manage && <ShareModal file={manage} onClose={() => { setManage(null); load(); }} />}
    </div>
  );
}
