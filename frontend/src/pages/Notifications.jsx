// Notification history (Milestone 3, Task 3): every notification, with filters, mark-as-read, delete and the e-mail preference.
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCheck, Mail, Trash2 } from "lucide-react";
import api, { errorMessage } from "../lib/api";
import { formatStamp, timeAgo } from "../lib/format";
import { NotifIcon, TYPE_META } from "../components/notifyMeta";
import { Pager } from "../components/filters";
import { EmptyState, PageHeader, Segmented } from "../components/ui";

export default function Notifications() {
  const navigate = useNavigate();
  const [type, setType] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [prefs, setPrefs] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api.get("/notifications/history", { params: { type: type || undefined, unread_only: unreadOnly || undefined, q: q || undefined, page, page_size: 15 } })
      .then((r) => setData(r.data)).catch(async (e) => setError(await errorMessage(e)));
  }, [type, unreadOnly, q, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/notifications/preferences").then((r) => setPrefs(r.data)).catch(() => {}); }, []);

  const mark = async (n) => { await api.post(`/notifications/${n.id}/read`); load(); window.dispatchEvent(new Event("storage-changed")); };
  const remove = async (n) => { await api.delete(`/notifications/${n.id}`); load(); };
  const readAll = async () => { await api.post("/notifications/read-all"); load(); };
  const toggleMail = async () => { const next = !prefs.email_enabled; await api.put("/notifications/preferences", { email_enabled: next }); setPrefs({ email_enabled: next }); };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title="Notifications" subtitle="Everything that happened with your files: shares, downloads, link expiries and security messages.">
        <button className="btn-secondary" onClick={readAll}><CheckCheck size={16} /> Mark all as read</button>
      </PageHeader>
      {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="card flex flex-wrap items-center justify-between gap-4 !p-4">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-brand-50 p-2.5 text-brand-600"><Mail size={18} /></span>
          <div><div className="font-semibold text-ink-950">E-mail notifications</div><div className="text-xs text-slate-500">Also get shares, downloads and link reminders by e-mail. Security alerts for admins are always e-mailed.</div></div>
        </div>
        {prefs && (
          <button onClick={toggleMail} className={`relative h-7 w-12 rounded-full transition ${prefs.email_enabled ? "bg-brand-600" : "bg-paper-300"}`} aria-label="Toggle e-mail notifications">
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${prefs.email_enabled ? "left-6" : "left-1"}`} />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={unreadOnly ? "unread" : "all"} onChange={(v) => { setUnreadOnly(v === "unread"); setPage(1); }} options={[["all", "All"], ["unread", `Unread${data?.unread ? ` (${data.unread})` : ""}`]]} />
        <select className="input !w-auto !py-2" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
          <option value="">All types</option>
          {Object.entries(TYPE_META).map(([k, m]) => <option key={k} value={k}>{m.label}{data?.by_type?.[k] ? ` (${data.by_type[k]})` : ""}</option>)}
        </select>
        <input className="input !w-56 !py-2" placeholder="Search..." value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      </div>

      {!data ? <p className="py-16 text-center text-slate-500">Loading...</p> : data.items.length === 0 ? <EmptyState title="No notifications" text="When someone shares a file with you or downloads one of yours, it appears here." /> : (
        <div className="card overflow-hidden !p-0">
          {data.items.map((n) => (
            <div key={n.id} className={`flex items-start gap-3 border-b border-paper-200 p-4 last:border-0 ${n.read ? "" : "bg-brand-50/50"}`}>
              <NotifIcon type={n.type} size={40} />
              <button className="min-w-0 flex-1 text-left" onClick={() => n.link && navigate(n.link)}>
                <div className="flex flex-wrap items-center gap-2 font-semibold text-ink-950">{n.title}
                  <span className="rounded-md bg-paper-100 px-1.5 py-px text-[11px] font-medium text-slate-500">{(TYPE_META[n.type] || TYPE_META.system).label}</span>
                  {!n.read && <span className="rounded-full bg-wax-500 px-2 py-px text-[10px] font-bold text-white">NEW</span>}
                  {n.email_status && <span className={`rounded-md px-1.5 py-px text-[11px] font-medium ${n.email_status === "sent" ? "bg-emerald-50 text-emerald-600" : "bg-paper-100 text-slate-500"}`}>e-mail {n.email_status}</span>}
                </div>
                <div className="text-sm text-slate-600">{n.message}</div>
                <div className="mt-0.5 text-xs text-slate-400" title={formatStamp(n.created_at)}>{formatStamp(n.created_at)} · {timeAgo(n.created_at)}</div>
              </button>
              <div className="flex shrink-0 gap-1">
                {!n.read && <button title="Mark as read" className="rounded-lg p-2 text-slate-400 hover:bg-brand-50 hover:text-brand-600" onClick={() => mark(n)}><CheckCheck size={16} /></button>}
                <button title="Delete" className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => remove(n)}><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
          <Pager page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
