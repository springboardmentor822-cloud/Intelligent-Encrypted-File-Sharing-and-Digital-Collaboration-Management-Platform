import { useEffect, useRef, useState } from "react";
import { C } from "../lib/theme";
import { NotifIcon } from "./notifyMeta";
import ThemePicker from "./ThemePicker";
import ThreatToaster from "./ThreatToaster";
import VersionCheck from "./VersionCheck";
import { APP_VERSION, BUILD_NAME } from "../version";
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  Activity, BarChart3, Bell, ChevronDown, Clock, Cpu, Database, FileText, FolderOpen, Home, Link2, LayoutDashboard, LogOut,
  Menu, Search, Send, Settings, Share2, ShieldCheck, Star, Trash2, Users, X, Lock, Crown,
  BellRing, ClipboardList, DoorOpen, HardDrive, ScrollText, ShieldAlert, UserCog,
} from "lucide-react";
import api from "../lib/api";
import { formatBytes, formatDate, timeAgo } from "../lib/format";
import { isAdmin, useAuth } from "../store/auth";
import { Avatar, ProgressBar } from "./ui";

// panel = "user" (light sidebar) or "admin" (navy sidebar)
function NavItem({ to, icon: Icon, children, onClick, count, panel = "user", end = true }) {
  const dark = true;   // both panels use the dark ink sidebar
  return (
    <NavLink to={to} end={end} onClick={onClick}
      className={({ isActive }) =>
        `relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
          isActive
            ? dark ? "bg-white/10 text-white" : "bg-brand-50 text-brand-700"
            : dark ? "text-slate-300 hover:bg-white/5 hover:text-white" : "text-slate-600 hover:bg-paper-100 hover:text-slate-900"}`}>
      {({ isActive }) => (
        <>
          {isActive && <span className={`absolute -left-4 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full ${dark ? "bg-brand-300" : "bg-brand-600"}`} />}
          <Icon size={18} />
          <span className="flex-1">{children}</span>
          {count > 0 && <span className={`rounded-full px-1.5 text-[11px] font-semibold ${dark ? "bg-white/10 text-slate-200" : "bg-paper-200 text-slate-600"}`}>{count}</span>}
        </>
      )}
    </NavLink>
  );
}

// The blue shield logo from the mockups
function NavSection({ children }) {
  return <div className="px-3.5 pb-1 pt-4 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-white/35">{children}</div>;
}

function Logo({ dark = false, sub }) {
  return (
    <Link to="/" className="mb-7 flex items-center gap-2.5 px-1">
      <span className="relative rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 p-2 text-white shadow-md shadow-brand-600/30"><ShieldCheck size={20} />
        <span className="absolute -bottom-1 -right-1 rounded-full bg-wax-500 p-0.5 text-white ring-2 ring-white"><Lock size={8} /></span></span>
      <span>
        <span className={`block font-display text-xl font-extrabold leading-none ${dark ? "text-white" : "text-ink-900"}`}>TrustShare</span>
        {sub && <span className={`mt-1 block text-[10px] font-semibold uppercase tracking-widest ${dark ? "text-brand-300" : "text-slate-400"}`}>{sub}</span>}
      </span>
    </Link>
  );
}

function StorageCard({ panel }) {
  const [stats, setStats] = useState(null);
  const load = () => api.get("/analytics/storage").then((r) => setStats(r.data)).catch(() => {});
  useEffect(() => {
    load();
    window.addEventListener("storage-changed", load);
    return () => window.removeEventListener("storage-changed", load);
  }, []);
  if (!stats) return null;
  const capacity = stats.quota_bytes || stats.capacity_bytes || 0;
  const pct = capacity ? (stats.used_bytes / capacity) * 100 : 0;
  if (panel === "admin") {
    return (
      <div className="rounded-2xl bg-white/5 p-4 text-xs text-slate-300 ring-1 ring-white/10">
        <div className="mb-2 flex items-center gap-2 font-medium text-white"><Database size={14} /> Storage Usage</div>
        <ProgressBar pct={pct} />
        <div className="mt-2 flex justify-between"><span>{formatBytes(stats.used_bytes)}{capacity ? ` / ${formatBytes(capacity)}` : ""}</span><span>{pct.toFixed(0)}%</span></div>
      </div>
    );
  }
  // little ring + numbers + button, like the mockup
  const r = 20, c = 2 * Math.PI * r;
  return (
    <div className="rounded-2xl bg-white/10 p-4 text-white ring-1 ring-white/15 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="relative h-12 w-12 shrink-0">
          <svg viewBox="0 0 48 48" className="-rotate-90"><circle cx="24" cy="24" r={r} fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="5" />
            <circle cx="24" cy="24" r={r} fill="none" stroke={pct >= 90 ? "#ff7a93" : "#ffffff"} strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * Math.min(pct, 100)) / 100} /></svg>
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">{pct.toFixed(0)}%</span>
        </div>
        <div className="text-xs"><div className="text-sm font-bold text-white">{formatBytes(stats.used_bytes)}{capacity ? ` / ${formatBytes(capacity)}` : ""}</div><div className="text-blue-100/60">Used Storage</div></div>
      </div>
      <Link to="/storage" className="btn mt-3 w-full border border-white/30 !py-2 text-white hover:bg-white/10"><Database size={14} /> Manage Storage</Link>
    </div>
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ items: [], unread: 0 });
  const box = useRef(null);
  const navigate = useNavigate();
  const load = () => api.get("/notifications").then((r) => setData(r.data)).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const openItem = async (n) => {            // clicking a notification marks it read and opens the related page
    if (!n.read) { await api.post(`/notifications/${n.id}/read`).catch(() => {}); load(); }
    if (n.link) { setOpen(false); navigate(n.link); }
  };
  const readAll = async () => { await api.post("/notifications/read-all"); load(); };
  return (
    <div className="relative" ref={box}>
      <button onClick={() => setOpen(!open)} className="relative rounded-xl border border-paper-300 bg-white p-2.5 text-slate-600 transition hover:border-brand-300 hover:text-brand-700">
        <Bell size={18} />
        {data.unread > 0 && <span className="absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-wax-500 px-1 text-center text-[10px] font-bold leading-[18px] text-white ring-2 ring-white">{data.unread > 99 ? "99+" : data.unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[22rem] overflow-hidden rounded-2xl border border-paper-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-paper-200 px-4 py-3">
            <div className="font-display font-bold text-ink-950">Notifications {data.unread > 0 && <span className="ml-1 rounded-full bg-wax-500 px-2 py-0.5 text-xs text-white">{data.unread} new</span>}</div>
            {data.unread > 0 && <button className="text-xs font-semibold text-brand-600 hover:underline" onClick={readAll}>Mark all read</button>}
          </div>
          <div className="max-h-96 overflow-y-auto p-2">
            {data.items.length === 0 && <div className="p-8 text-center text-sm text-slate-500">You're all caught up.</div>}
            {data.items.slice(0, 8).map((n) => (
              <button key={n.id} onClick={() => openItem(n)} className={`flex w-full items-start gap-3 rounded-xl p-2.5 text-left text-sm transition hover:bg-paper-100 ${n.read ? "" : "bg-brand-50/70"}`}>
                <NotifIcon type={n.type} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-semibold text-ink-950">{n.title}{!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-wax-500" />}</span>
                  <span className="line-clamp-2 text-slate-600">{n.message}</span>
                  <span className="text-xs text-slate-400" title={formatDate(n.created_at)}>{timeAgo(n.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
          <Link to="/notifications" onClick={() => setOpen(false)} className="block border-t border-paper-200 px-4 py-3 text-center text-sm font-semibold text-brand-600 hover:bg-paper-100">View all notifications</Link>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <div className="relative" ref={box}>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white py-1.5 pl-1.5 pr-3 hover:bg-slate-50">
        <Avatar name={user?.full_name} size={32} />
        <div className="hidden text-left sm:block">
          <div className="text-sm font-medium leading-tight">{user?.full_name}</div>
          <div className="text-xs leading-tight text-slate-500">{user?.roles?.includes("admin") ? "System Administrator" : "Standard User"}</div>
        </div>
        <ChevronDown size={15} className="hidden text-slate-400 sm:block" />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-56 rounded-2xl border bg-white p-1.5 shadow-xl">
          <div className="border-b px-3 py-2 text-xs text-slate-500">{user?.email}</div>
          <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-slate-50" onClick={() => { setOpen(false); navigate("/settings"); }}>
            <Settings size={16} /> Settings</button>
          <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            onClick={async () => { await logout(); navigate("/"); }}><LogOut size={16} /> Log out</button>
        </div>
      )}
    </div>
  );
}

function SidebarContent({ onNavigate, panel }) {
  const { user } = useAuth();
  const [counts, setCounts] = useState({ trash: 0, favorites: 0, shared_with_me: 0 });
  const [openAlerts, setOpenAlerts] = useState(0);
  const [pending, setPending] = useState(0);
  const location = useLocation();
  // refresh the small numbers whenever the user moves to another page
  useEffect(() => {
    if (panel === "admin") api.get("/analytics/summary").then((r) => { setOpenAlerts(r.data.open_alerts || 0); setPending(r.data.pending_approvals || 0); }).catch(() => {});
    else api.get("/files/counts").then((r) => setCounts(r.data)).catch(() => {});
  }, [location.pathname, panel]);
  const go = { onClick: onNavigate, panel };

  if (panel === "admin") {
    return (
      <div className="flex h-full flex-col overflow-y-auto p-4 pl-5">
        <Logo dark sub="Admin panel" />
        <nav className="space-y-1">
          <NavItem to="/admin" icon={Home} {...go}>Dashboard</NavItem>
          <NavItem to="/admin/security" icon={ShieldCheck} end={false} count={openAlerts} {...go}>Security Dashboard</NavItem>
          <NavSection>Monitor</NavSection>
          <NavItem to="/admin/access" icon={DoorOpen} count={pending} {...go}>Access Control</NavItem>
          <NavItem to="/admin/user-activity" icon={Users} {...go}>User Activity</NavItem>
          <NavItem to="/admin/audit" icon={ScrollText} {...go}>Audit Logs</NavItem>
          <NavItem to="/admin/alerts" icon={ShieldAlert} {...go}>Security Alerts</NavItem>
          <NavItem to="/admin/activity" icon={Activity} {...go}>Activity Feed</NavItem>
          <NavSection>Insights</NavSection>
          <NavItem to="/admin/reports" icon={ClipboardList} {...go}>Reports</NavItem>
          <NavItem to="/admin/storage" icon={HardDrive} {...go}>Storage Analytics</NavItem>
          <NavItem to="/admin/analytics" icon={BarChart3} {...go}>File Analytics</NavItem>
          <NavItem to="/admin/sharing" icon={Link2} {...go}>Sharing Reports</NavItem>
          <NavSection>Manage</NavSection>
          <NavItem to="/admin/users" icon={UserCog} {...go}>User Management</NavItem>
          <NavItem to="/admin/files" icon={FileText} {...go}>File Management</NavItem>
          <NavItem to="/admin/notifications" icon={BellRing} {...go}>Notifications</NavItem>
          <NavItem to="/admin/system" icon={Cpu} {...go}>System Monitoring</NavItem>
          <NavItem to="/settings" icon={Settings} {...go}>Settings</NavItem>
        </nav>
        <div className="mt-auto space-y-3 pt-6">
          <Link to="/dashboard" onClick={onNavigate} className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white"><FolderOpen size={16} /> Switch to my files</Link>
          <StorageCard panel="admin" />
          <div className="px-1 font-mono text-[10px] tracking-wider text-white/40">TRUSTSHARE v{APP_VERSION} · {BUILD_NAME.toUpperCase()}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col overflow-y-auto p-4 pl-5">
      <Logo dark />
      <nav className="space-y-1">
        <NavItem to="/dashboard" icon={Home} {...go}>Dashboard</NavItem>
        <NavItem to="/files" icon={FolderOpen} {...go}>My Files</NavItem>
        <NavItem to="/shared" icon={Share2} count={counts.shared_with_me} {...go}>Shared with Me</NavItem>
        <NavItem to="/shared-by-me" icon={Send} {...go}>Shared by Me</NavItem>
        <NavItem to="/recent" icon={Clock} {...go}>Recent</NavItem>
        <NavItem to="/favorites" icon={Star} count={counts.favorites} {...go}>Favorites</NavItem>
        <NavItem to="/trash" icon={Trash2} count={counts.trash} {...go}>Trash</NavItem>
        <div className="!my-3 border-t border-white/10" />
        <NavItem to="/storage" icon={Database} {...go}>Storage</NavItem>
        <NavItem to="/file-analytics" icon={BarChart3} {...go}>File Analytics</NavItem>
        <NavItem to="/activity" icon={Activity} {...go}>Activity Logs</NavItem>
        <NavItem to="/notifications" icon={BellRing} {...go}>Notifications</NavItem>
        <NavItem to="/security" icon={ShieldCheck} {...go}>My Security</NavItem>
        <NavItem to="/settings" icon={Settings} {...go}>Settings</NavItem>
      </nav>
      <div className="mt-auto space-y-3 pt-6">
        {isAdmin(user) && (
          <Link to="/admin" onClick={onNavigate} className="flex items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2.5 text-sm font-medium text-white ring-1 ring-white/20 transition hover:bg-white/15">
            <Crown size={16} className="text-wax-400" /> Open Admin Panel</Link>
        )}
        <StorageCard panel="user" />
        <div className="px-1 font-mono text-[10px] tracking-wider text-white/40">TRUSTSHARE v{APP_VERSION} · {BUILD_NAME.toUpperCase()}</div>
      </div>
    </div>
  );
}

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const [drawer, setDrawer] = useState(false);
  useEffect(() => setDrawer(false), [location.pathname]);
  const panel = location.pathname.startsWith("/admin") ? "admin" : "user";   // two different panels, like the mockups

  const search = (e) => {
    e.preventDefault();
    navigate(panel === "admin" ? `/admin/files${q ? `?q=${encodeURIComponent(q)}` : ""}` : `/files${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  };
  const sidebarClass = panel === "admin" ? "sidebar-ink border-r border-wax-500/30" : "sidebar-ink";

  return (
    <div className="flex min-h-screen">
      <aside className={`sticky top-0 hidden h-screen w-64 shrink-0 lg:block ${sidebarClass}`}><SidebarContent panel={panel} /></aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
          <aside className={`relative h-full w-72 ${sidebarClass}`}>
            <button className="absolute right-3 top-4 text-slate-300" onClick={() => setDrawer(false)}><X size={20} /></button>
            <SidebarContent panel={panel} onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {panel === "admin" && <div className="h-1 bg-gradient-to-r from-wax-500 via-brand-500 to-wax-500" />}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-paper-200 bg-white/85 px-4 py-3 backdrop-blur sm:px-6">
          <button className="rounded-xl border border-paper-300 bg-white p-2.5 lg:hidden" onClick={() => setDrawer(true)}><Menu size={18} /></button>
          <form onSubmit={search} className="relative max-w-xl flex-1">
            <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
            <input className="input rounded-2xl border-transparent bg-paper-100 pl-10" placeholder={panel === "admin" ? "Search users, files, logs..." : "Search files, folders..."} value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
          {panel === "admin" && <span className="hidden items-center gap-1.5 rounded-full bg-wax-500/10 px-3 py-1 text-xs font-bold tracking-wider text-wax-600 ring-1 ring-wax-500/30 md:inline-flex"><Crown size={13} /> ADMIN MODE</span>}
          <div className="ml-auto flex items-center gap-3"><ThemePicker /><NotificationBell /><UserMenu /></div>
        </header>
        <main className="canvas-aurora flex-1 p-4 sm:p-6 lg:p-8"><VersionCheck /><Outlet /></main>
        {panel === "admin" && <ThreatToaster />}
      </div>
    </div>
  );
}
