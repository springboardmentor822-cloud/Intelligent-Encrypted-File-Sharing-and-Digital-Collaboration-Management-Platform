import { useEffect, useState } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import clsx from 'clsx';
import {
  Activity, Bell, ChevronDown, Clock, Folder, HardDrive, LayoutDashboard, LogOut, Menu as MenuIcon, ScrollText, Search,
  Send, Settings, ShieldCheck, Star, Trash2, TrendingUp, Users, X, Share2, FileStack, UserCog,
} from 'lucide-react';
import { api } from '@/lib/api';
import { homeFor, useAuth } from '@/lib/auth';
import { formatBytes, pct, timeAgo } from '@/lib/format';
import { Logo, Menu, MenuItem, PageLoader, ProgressBar } from './ui';

const USER_NAV = [
  { href: '/app', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/app/files', label: 'My Files', icon: Folder },
  { href: '/app/shared-with-me', label: 'Shared with Me', icon: Users },
  { href: '/app/shared-by-me', label: 'Shared by Me', icon: Send },
  { href: '/app/recent', label: 'Recent', icon: Clock },
  { href: '/app/favorites', label: 'Favorites', icon: Star },
  { href: '/app/trash', label: 'Trash', icon: Trash2 },
  { divider: true },
  { href: '/app/storage', label: 'Storage', icon: HardDrive },
  { href: '/app/analytics', label: 'File Analytics', icon: TrendingUp },
  { href: '/app/activity', label: 'Activity Logs', icon: ScrollText },
  { href: '/app/notifications', label: 'Notifications', icon: Bell },
  { href: '/app/security', label: 'Security', icon: ShieldCheck },
  { href: '/app/settings', label: 'Settings', icon: Settings },
];
const GUEST_NAV = [
  { href: '/app/shared-with-me', label: 'Shared with Me', icon: Users },
  { href: '/app/activity', label: 'Activity Logs', icon: ScrollText },
  { href: '/app/notifications', label: 'Notifications', icon: Bell },
  { href: '/app/security', label: 'Security', icon: ShieldCheck },
  { href: '/app/settings', label: 'Settings', icon: Settings },
];
const ADMIN_NAV = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/users', label: 'User Management', icon: UserCog },
  { href: '/admin/files', label: 'File Management', icon: FileStack },
  { href: '/admin/sharing', label: 'Sharing Reports', icon: Share2 },
  { href: '/admin/security', label: 'Security Dashboard', icon: ShieldCheck },
  { href: '/admin/analytics', label: 'Analytics', icon: TrendingUp },
  { href: '/admin/system', label: 'System Monitoring', icon: Activity },
  { href: '/admin/reports', label: 'Reports', icon: FileStack },
  { href: '/admin/storage-analytics', label: 'Storage Analytics', icon: HardDrive },
  { href: '/admin/monitoring', label: 'Security Monitoring', icon: ShieldCheck },
  { href: '/admin/audit-logs', label: 'Audit Logs', icon: ScrollText },
  { href: '/admin/notifications', label: 'Notifications', icon: Bell },
  { href: '/admin/activity', label: 'Activity Logs', icon: ScrollText },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

function NotificationBell() {
  const router = useRouter();
  const [data, setData] = useState({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const load = () => api.get('/notifications', { params: { limit: 15 } }).then((r) => setData(r.data)).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  const click = async (n) => {
    if (!n.is_read) await api.post(`/notifications/${n.id}/read`).catch(() => {});
    setOpen(false); load();
    if (n.link) router.push(n.link);
  };
  const readAll = async () => { await api.post('/notifications/read-all'); load(); };

  return (
    <div className="relative">
      <button className="btn-ghost relative !p-2.5" onClick={() => { setOpen(!open); load(); }} aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ''}`}>
        <Bell className="h-5 w-5" />
        {data.unread > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-rose-500" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-[22rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="font-bold">Notifications</span>
              {data.unread > 0 && <button className="text-xs font-semibold text-brand-600" onClick={readAll}>Mark all as read</button>}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {data.items.length === 0 && <p className="px-4 py-8 text-center text-sm text-ink-soft">You’re all caught up.</p>}
              {data.items.map((n) => (
                <button key={n.id} onClick={() => click(n)} className={clsx('block w-full border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50', !n.is_read && 'bg-brand-50/50')}>
                  <div className="flex items-start gap-2">
                    {!n.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" />}
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{n.title}</div>
                      <div className="text-sm text-ink-soft">{n.message}</div>
                      <div className="mt-0.5 text-xs text-ink-faint">{timeAgo(n.created_at)}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Sidebar({ nav, admin, usage, onNavigate, user }) {
  const router = useRouter();
  const active = (href) => (href === '/app' || href === '/admin' ? router.pathname === href : router.pathname.startsWith(href));
  return (
    <aside className={clsx('flex h-full w-64 flex-col', admin ? 'bg-navy-900 text-slate-300' : 'border-r border-slate-200/70 bg-white')}>
      <div className="px-5 pb-3 pt-5"><Logo dark={admin} subtitle="Secure File-Sharing System" /></div>
      {admin && <div className="px-5 pb-2 pt-3 text-xs font-semibold text-slate-500">Admin panel</div>}
      {!admin && user.role !== 'guest' && <div className="px-5 pb-2 pt-3 text-xs font-semibold text-ink-faint">User panel</div>}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-3" aria-label="Main">
        {nav.map((item, i) => item.divider ? <div key={i} className="my-3 border-t border-slate-200/70" /> : (
          <Link key={item.href} href={item.href} onClick={onNavigate}
            aria-current={active(item.href) ? 'page' : undefined}
            className={clsx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition',
              admin ? (active(item.href) ? 'bg-brand-600 text-white' : 'hover:bg-white/10')
                : (active(item.href) ? 'bg-brand-50 text-brand-700' : 'text-ink-soft hover:bg-slate-50'))}>
            <item.icon className="h-[18px] w-[18px]" />{item.label}
          </Link>
        ))}
        {admin && <Link href="/app/files" onClick={onNavigate} className="mt-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-400 hover:bg-white/10"><Folder className="h-[18px] w-[18px]" />My workspace</Link>}
        {!admin && user.role === 'admin' && <Link href="/admin" onClick={onNavigate} className="mt-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50"><UserCog className="h-[18px] w-[18px]" />Admin panel</Link>}
      </nav>
      {usage && !admin && (
        <div className="m-3 rounded-2xl border border-slate-200 p-4">
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="font-bold">{formatBytes(usage.used)}</span><span className="text-xs text-ink-faint">of {formatBytes(usage.quota, 0)}</span>
          </div>
          <ProgressBar value={pct(usage.used, usage.quota)} />
          <div className="mt-1.5 text-xs text-ink-faint">{pct(usage.used, usage.quota)}% of your storage used</div>
        </div>
      )}
    </aside>
  );
}

/** Page frame: auth guard, role-aware sidebar, search, notifications, user menu. */
export default function AppShell({ title, subtitle, actions, roles, children }) {
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const [mobileNav, setMobileNav] = useState(false);
  const [usage, setUsage] = useState(null);
  const [q, setQ] = useState('');

  const area = router.pathname.startsWith('/admin') ? 'admin' : 'app';
  const allowed = !roles || (user && roles.includes(user.role));

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(router.asPath)}`);
    else if (!allowed) router.replace(homeFor(user));
  }, [loading, user, allowed, router]);

  useEffect(() => {
    if (user && area === 'app' && user.role !== 'guest') api.get('/files/storage/usage').then((r) => setUsage(r.data)).catch(() => {});
  }, [user, area, router.pathname]);

  if (loading || !user || !allowed) return <div className="min-h-screen bg-surface"><PageLoader /></div>;

  const admin = area === 'admin';
  const nav = admin ? ADMIN_NAV : user.role === 'guest' ? GUEST_NAV : USER_NAV;
  const search = (e) => { e.preventDefault(); router.push({ pathname: '/app/files', query: q ? { q } : {} }); };

  return (
    <div className="min-h-screen bg-surface">
      <Head><title>{title} · TrustShare</title></Head>
      <div className="fixed inset-y-0 left-0 z-30 hidden lg:block"><Sidebar nav={nav} admin={admin} usage={usage} user={user} /></div>
      {mobileNav && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy-900/50" onClick={() => setMobileNav(false)} />
          <div className="absolute inset-y-0 left-0"><Sidebar nav={nav} admin={admin} usage={usage} user={user} onNavigate={() => setMobileNav(false)} /></div>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200/70 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
          <button className="btn-ghost !p-2 lg:hidden" onClick={() => setMobileNav(!mobileNav)} aria-label="Menu">{mobileNav ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}</button>
          {user.role !== 'guest' && !admin ? (
            <form onSubmit={search} className="relative max-w-xl flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <input className="input !rounded-full !bg-surface !pl-10" placeholder="Search files and folders…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search files" />
            </form>
          ) : <div className="flex-1" />}
          <NotificationBell />
          <Menu trigger={
            <button className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-slate-50" aria-label="Account menu">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{user.full_name[0]?.toUpperCase()}</div>
              <div className="hidden text-left leading-tight sm:block">
                <div className="text-sm font-bold">{user.full_name}</div>
                <div className="text-xs capitalize text-ink-faint">{user.role === 'admin' ? 'System Administrator' : `${user.role} user`}</div>
              </div>
              <ChevronDown className="hidden h-4 w-4 text-ink-faint sm:block" />
            </button>}>
            <MenuItem icon={Settings} onClick={() => router.push(admin ? '/admin/settings' : '/app/settings')}>Settings</MenuItem>
            <MenuItem icon={ShieldCheck} onClick={() => router.push('/app/security')}>Security</MenuItem>
            <MenuItem icon={LogOut} onClick={logout}>Sign out</MenuItem>
          </Menu>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
            </div>
            {actions}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
