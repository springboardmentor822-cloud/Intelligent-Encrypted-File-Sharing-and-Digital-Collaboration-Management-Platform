import { ReactNode, useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { Activity, BarChart3, Bell, ClipboardList, Clock, Cog, FileText, Folder, FolderOpen, HardDrive, LayoutDashboard, LogOut, Menu, PieChart, Search, Send, Settings, Shield, ShieldCheck, Star, Trash2, Users, X, Share2, ChevronDown, Lock, ShieldAlert } from "lucide-react";
import { useAuth } from "./auth";
import { adminVisit, api } from "./api";
import { fmtBytes, fmtDate } from "./api";
import { useFetch } from "./hooks";
import { Logo } from "./ui";

type Item = { to: string; label: string; icon: any; end?: boolean };
const USER_NAV: Item[] = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true }, { to: "/app/files", label: "My Files", icon: Folder },
  { to: "/app/shared-with-me", label: "Shared with Me", icon: Users }, { to: "/app/shared-by-me", label: "Shared by Me", icon: Send },
  { to: "/app/recent", label: "Recent", icon: Clock }, { to: "/app/favorites", label: "Favorites", icon: Star }, { to: "/app/secure-folder", label: "Secure Folder", icon: Lock }, { to: "/app/trash", label: "Trash", icon: Trash2 },
  { to: "/app/storage", label: "Storage", icon: PieChart }, { to: "/app/analytics", label: "File Analytics", icon: BarChart3 },
  { to: "/app/activity", label: "Activity Logs", icon: FileText }, { to: "/app/security", label: "Security", icon: ShieldCheck }, { to: "/app/settings", label: "Settings", icon: Settings },
];
const ADMIN_NAV: Item[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true }, { to: "/admin/users", label: "User Management", icon: Users },
  { to: "/admin/files", label: "File Management", icon: FolderOpen }, { to: "/admin/sharing", label: "Sharing Reports", icon: Share2 },
  { to: "/admin/security", label: "Security Dashboard", icon: Shield }, { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/admin/system", label: "System Monitoring", icon: Activity }, { to: "/admin/audit", label: "Activity Logs", icon: ClipboardList }, { to: "/admin/settings", label: "Settings", icon: Cog },
  { to: "/admin/activity-monitoring", label: "Activity Monitoring", icon: Activity },
  { to: "/admin/audit-logs", label: "Audit Logs", icon: ClipboardList },
  { to: "/admin/reports", label: "Reports", icon: FileText },
  { to: "/admin/storage-analytics", label: "Storage Analytics", icon: PieChart },
  { to: "/admin/notifications", label: "Notifications", icon: Bell },
  { to: "/admin/security-monitoring", label: "Security Monitoring", icon: ShieldCheck },
  { to: "/admin/suspicious", label: "Suspicious Alerts", icon: ShieldAlert },
];

function Notifications({ admin }: { admin: boolean }) {
  const [open, setOpen] = useState(false);
  const { data, reload } = useFetch<any>(open ? "/notifications" : null, { page_size: 8 });
  const { data: unread, reload: reloadCount } = useFetch<any>("/notifications/unread-count");
  const count = unread?.unread || 0;
  const markAll = async () => { try { await api.post("/notifications/read-all"); reload(); reloadCount(); } catch { /* ignore */ } };
  const markOne = async (id: number) => { try { await api.post(`/notifications/${id}/read`); reload(); reloadCount(); } catch { /* ignore */ } };
  return (
    <div className="relative">
      <button className="btn-ghost relative" aria-label="Notifications" aria-expanded={open} onClick={() => { setOpen(!open); reloadCount(); }}>
        <Bell className="h-5 w-5" />
        {count > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{count > 9 ? "9+" : count}</span>}
      </button>
      {open && (<>
        <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
        <div className="card absolute right-0 z-40 mt-2 w-80 p-3" role="menu">
          <div className="flex items-center justify-between px-2 pb-2">
            <p className="text-sm font-bold">Notifications</p>
            {count > 0 && <button className="text-xs font-semibold text-lavender-700 hover:underline" onClick={markAll}>Mark all read</button>}
          </div>
          {!data ? <p className="p-3 text-sm text-slate-500">Loading…</p> : !data.items.length ? <p className="p-3 text-sm text-slate-500">Nothing yet.</p> :
            data.items.map((x: any) => <button key={x.id} onClick={() => markOne(x.id)} className={`block w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50 ${x.read ? "" : "bg-red-50/60"}`}>
              <p className="font-medium text-slate-800">{x.title}</p>
              {x.message && <p className="line-clamp-2 text-xs text-slate-500">{x.message}</p>}
              <p className="text-[11px] text-slate-400">{fmtDate(x.created_at)}</p>
            </button>)}
          <Link to={admin ? "/admin/notifications" : "/app/activity"} onClick={() => setOpen(false)} className="mt-1 block rounded-lg px-2 py-2 text-sm font-semibold text-lavender-700 hover:bg-lavender-50">View all</Link>
        </div></>)}
    </div>
  );
}

export default function Shell({ admin = false }: { admin?: boolean }) {
  const { user, logout } = useAuth(); const nav = useNavigate(); const loc = useLocation();
  const [drawer, setDrawer] = useState(false); const [menu, setMenu] = useState(false); const [q, setQ] = useState("");
  useEffect(() => { setDrawer(false); setMenu(false); }, [loc.pathname]);
  const st = useFetch<any>(admin ? null : "/users/me/storage", { k: loc.pathname });
  const items = admin ? ADMIN_NAV : USER_NAV;
  const pct = st.data ? Math.min(100, Math.round((st.data.used / st.data.quota) * 100)) : 0;
  const side: ReactNode = (
    <div className={`flex h-full flex-col ${admin ? "bg-grad-hero text-slate-200" : "bg-white"}`}>
      <div className="px-5 py-5"><Logo light={admin} /><p className={`mt-1 text-[11px] ${admin ? "text-slate-400" : "text-slate-500"}`}>Secure File-Sharing System</p></div>
      <p className={`px-5 pb-2 text-[11px] font-semibold tracking-wider ${admin ? "text-slate-400" : "text-slate-400"}`}>{admin ? "ADMIN PANEL" : "USER PANEL"}</p>
      <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {items.map(({ to, label, icon: I, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[20px] font-bold transition ${admin
            ? isActive ? "bg-white/15 text-white shadow ring-1 ring-white/20" : "text-slate-300 hover:bg-white/10"
            : isActive ? "bg-grad-brand text-white shadow-sm" : "text-slate-600 hover:bg-lavender-50 hover:text-lavender-700"}`}>
            <I className="h-[18px] w-[18px]" />{label}</NavLink>))}
      </nav>
      {!admin && (
        <div className="m-3 rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center gap-3"><div className="relative grid h-11 w-11 place-items-center rounded-full" style={{ background: `conic-gradient(#b91c1c ${pct * 3.6}deg, #f1d5d5 0)` }}><span className="grid h-8 w-8 place-items-center rounded-full bg-white text-[10px] font-bold">{pct}%</span></div>
            <div><p className="text-sm font-bold">{st.data ? `${fmtBytes(st.data.used)} / ${fmtBytes(st.data.quota)}` : "…"}</p><p className="text-xs text-slate-500">Used storage</p></div></div>
        </div>)}
    </div>
  );
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 hidden h-screen border-r border-slate-200 lg:block">{side}</aside>
      {drawer && <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-navy-950/50" onClick={() => setDrawer(false)} /><div className="absolute inset-y-0 left-0 w-72 shadow-xl">{side}</div></div>}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
          <button className="btn-ghost lg:hidden" aria-label={drawer ? "Close menu" : "Open menu"} onClick={() => setDrawer(!drawer)}>{drawer ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
          <form role="search" className="relative max-w-xl flex-1" onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(admin ? `/admin/files?q=${encodeURIComponent(q)}` : `/app/files?q=${encodeURIComponent(q)}`); }}>
            <label htmlFor="gsearch" className="sr-only">{admin ? "Search files" : "Search files and folders"}</label>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input id="gsearch" className="input !rounded-full !bg-slate-100 !pl-10 focus:!bg-white" placeholder={admin ? "Search files by name…" : "Search files, folders…"} value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
          <div className="ml-auto flex items-center gap-2">
            {admin && user?.role !== "admin" && (
              <div className="hidden items-center gap-2 rounded-full border border-amber-200 bg-amber-50 py-1 pl-3 pr-1 sm:flex">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-800"><ShieldAlert className="h-3.5 w-3.5" />Admin visit</span>
                <button className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
                        onClick={async () => { try { await api.post("/admin-visit/lock"); } catch { /* grant may already be gone */ } adminVisit.clear(); nav("/app"); }}>Exit</button>
              </div>
            )}
            <Notifications admin={admin} />
            <div className="relative">
              <button className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-slate-100" aria-expanded={menu} onClick={() => setMenu(!menu)}>
                <span className="grid h-9 w-9 place-items-center rounded-full bg-grad-brand text-sm font-bold text-white">{(user?.full_name || user?.email || "?")[0].toUpperCase()}</span>
                <span className="hidden text-left sm:block"><span className="block text-sm font-semibold leading-tight">{user?.full_name}</span><span className="block text-xs text-slate-500">{user?.role === "admin" ? "System Administrator" : "Standard User"}</span></span><ChevronDown className="h-4 w-4 text-slate-400" /></button>
              {menu && <><div className="fixed inset-0 z-30" onClick={() => setMenu(false)} /><div className="card absolute right-0 z-40 mt-2 w-56 p-2">
                <p className="truncate px-3 py-2 text-xs text-slate-500">{user?.email}</p>
                <Link to={admin ? "/admin/settings" : "/app/settings"} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50"><Settings className="h-4 w-4" />Settings</Link>
                {user?.role === "admin" && <Link to={admin ? "/app" : "/admin"} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50"><Shield className="h-4 w-4" />{admin ? "My workspace" : "Admin panel"}</Link>}
                <button onClick={async () => { await logout(); nav("/login"); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"><LogOut className="h-4 w-4" />Sign out</button></div></>}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] p-4 sm:p-6"><Outlet /></main>
      </div>
    </div>
  );
}
