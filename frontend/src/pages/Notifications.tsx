import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, CheckCheck, ShieldAlert, Info, Mail } from "lucide-react";
import { api, errMsg, fmtDate } from "../api";
import { useFetch } from "../hooks";
import { Badge, Empty, ErrorBox, Loading, PageHeader, Pagination, sevTone } from "../ui";

const TYPE_TONE: Record<string, string> = {
  file_shared: "blue", file_downloaded: "green", security_alert: "red",
  share_expiring: "amber", share_expired: "slate", suspicious_activity: "red",
};
const toneFor = (n: any) => n.severity && n.severity !== "info" ? sevTone(n.severity) : (TYPE_TONE[n.type] || "slate");

/** Bell in the app header: unread badge, dropdown preview, mark-as-read and history link. */
export function NotificationBell({ admin = false }: { admin?: boolean }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const loadCount = useCallback(async () => {
    try { const r = await api.get("/notifications/unread-count"); setUnread(r.data.unread || 0); }
    catch { /* unauthenticated / transient — leave count as-is */ }
  }, []);

  const loadList = useCallback(async () => {
    try { const r = await api.get("/notifications", { params: { page_size: 8 } }); setItems(r.data.items || []); setUnread(r.data.unread || 0); setErr(null); }
    catch (e) { setErr(errMsg(e)); }
  }, []);

  useEffect(() => {
    loadCount();
    timer.current = window.setInterval(loadCount, 30000);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [loadCount]);

  useEffect(() => { if (open) loadList(); }, [open, loadList]);

  const markOne = async (n: any) => {
    if (n.read) return;
    setBusy(true);
    try { await api.post(`/notifications/${n.id}/read`); setItems((xs) => xs.map((x) => x.id === n.id ? { ...x, read: true } : x)); setUnread((u) => Math.max(0, u - 1)); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  const markAll = async () => {
    setBusy(true);
    try { await api.post("/notifications/read-all"); setItems((xs) => xs.map((x) => ({ ...x, read: true }))); setUnread(0); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <div className="relative">
      <button className="btn-ghost relative" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (<>
        <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
        <div className="card absolute right-0 z-40 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] p-3" role="menu">
          <div className="flex items-center justify-between px-2 pb-2">
            <p className="text-sm font-bold">Notifications</p>
            {unread > 0 && <button className="inline-flex items-center gap-1 text-xs font-semibold text-lavender-700 hover:underline disabled:opacity-50" disabled={busy} onClick={markAll}><CheckCheck className="h-3.5 w-3.5" />Mark all read</button>}
          </div>
          {err && <div className="p-2"><ErrorBox message={err} /></div>}
          {!items.length ? <p className="p-3 text-sm text-slate-500">Nothing yet.</p> :
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button onClick={() => markOne(n)} className={`w-full rounded-lg px-2 py-2 text-left text-sm transition hover:bg-slate-50 ${n.read ? "opacity-70" : ""}`}>
                    <div className="flex items-start gap-2">
                      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-slate-200" : "bg-red-600"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-slate-800">{n.title}</p>
                        <p className="line-clamp-2 text-xs text-slate-600">{n.message}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">{n.email_sent && <Mail className="h-3 w-3" />}{fmtDate(n.created_at)}</p>
                      </div>
                      <Badge tone={toneFor(n)}>{n.type.replace(/_/g, " ")}</Badge>
                    </div>
                  </button>
                </li>
              ))}
            </ul>}
          <Link to={admin ? "/admin/notifications" : "/app/notifications"} onClick={() => setOpen(false)} className="mt-1 block rounded-lg px-2 py-2 text-sm font-semibold text-lavender-700 hover:bg-lavender-50">View all notifications</Link>
        </div>
      </>)}
    </div>
  );
}

/** Full notification history for the signed-in user. */
export function NotificationHistory() {
  const [page, setPage] = useState(1);
  const [type, setType] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const { data, error, loading, reload } = useFetch<any>("/notifications/history", {
    page, page_size: 20, type: type || undefined,
  });
  const markOne = async (n: any) => { try { await api.post(`/notifications/${n.id}/read`); reload(); } catch (e) { setMsg(errMsg(e)); } };
  const markAll = async () => { try { await api.post("/notifications/read-all"); reload(); } catch (e) { setMsg(errMsg(e)); } };
  const rows = (data?.items || []).filter((n: any) => !unreadOnly || !n.read);

  return <>
    <PageHeader title="Notifications" subtitle="Sharing, download and security alerts concerning your account and files."
      actions={<><select aria-label="Filter notifications" className="input !w-auto" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
        <option value="">All types</option>
        {["file_shared", "file_downloaded", "share_expiring", "share_expired", "security_alert", "suspicious_activity"].map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
      </select>
        <label className="inline-flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />Unread only</label>
        <button className="btn-secondary" onClick={markAll}><CheckCheck className="h-4 w-4" />Mark all read</button></>} />
    {msg && <div className="mb-3"><ErrorBox message={msg} /></div>}
    <div className="card">
      {error ? <div className="p-4"><ErrorBox message={error} onRetry={reload} /></div> : loading && !data ? <Loading /> : <>
        {!rows.length ? <Empty title="No notifications" hint="You will see alerts here when files are shared with you or your files are downloaded." icon={<Info className="mb-3 h-9 w-9 text-slate-300" />} /> :
          <ul className="divide-y divide-slate-100">
            {rows.map((n: any) => (
              <li key={n.id} className={`flex flex-wrap items-start gap-3 p-4 ${n.read ? "" : "bg-red-50/40"}`}>
                <span className={`mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full ${n.type.includes("security") || n.type.includes("suspicious") ? "bg-red-100 text-red-700" : "bg-lavender-50 text-lavender-700"}`}>
                  {n.type.includes("security") || n.type.includes("suspicious") ? <ShieldAlert className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-800">{n.title}</p><Badge tone={toneFor(n)}>{n.type.replace(/_/g, " ")}</Badge>{!n.read && <Badge tone="red">new</Badge>}</div>
                  <p className="mt-0.5 text-sm text-slate-600">{n.message}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">{n.email_sent && <Mail className="h-3 w-3" />}{fmtDate(n.created_at)}</p>
                </div>
                {!n.read && <button className="btn-secondary !py-1.5" onClick={() => markOne(n)}>Mark read</button>}
              </li>
            ))}
          </ul>}
        <Pagination page={page} pageSize={20} total={data.total} onChange={setPage} /></>}
    </div>
  </>;
}
