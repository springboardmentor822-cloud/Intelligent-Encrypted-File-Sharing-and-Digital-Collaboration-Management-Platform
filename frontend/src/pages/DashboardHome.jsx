// The first page after login: a "vault command" dashboard. Animated hero, live numbers with sparklines,
// an activity heatmap, a protection score and a live event feed.
import { useEffect, useMemo, useState } from "react";
import { C } from "../lib/theme";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, BarChart3, CheckCircle2, Clock, File, FolderLock, HardDrive, KeyRound, Link2, Send, ShieldCheck, Star, Upload, Users,
} from "lucide-react";
import api from "../lib/api";
import { formatBytes, timeAgo } from "../lib/format";
import { useAuth } from "../store/auth";
import FileTile from "../components/FileTile";
import { CountUp, GlassStat, Heatmap, HeroBackdrop, Reveal, ShieldOrbit, Sparkline } from "../components/fx";
import { EmptyState, Led, Seal } from "../components/ui";

const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

// What each audit action looks like as a sentence in the live feed
const EVENT_TEXT = {
  upload: "uploaded", download: "downloaded", view: "previewed", delete: "moved to Trash", restore: "restored", delete_permanent: "deleted forever",
  share_link_create: "created a share link for", share_link_revoke: "revoked a share link for", permission_grant: "shared", permission_revoke: "removed access to",
  share_download: "was downloaded through a link:", share_view: "was opened through a link:", login: "signed in", register: "created the account", password_change: "changed the password",
};

function PostureRing({ score }) {
  const r = 54, c = 2 * Math.PI * r;
  return (
    <div className="relative h-40 w-40 shrink-0">
      <svg viewBox="0 0 140 140" className="-rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#e2e9f4" strokeWidth="11" />
        <circle cx="70" cy="70" r={r} fill="none" stroke="url(#postureGrad)" strokeWidth="11" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * score) / 100} style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(.2,.7,.2,1)" }} />
        <defs><linearGradient id="postureGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor={C.primary} /><stop offset="100%" stopColor={C.primarySoft} /></linearGradient></defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-display text-4xl font-extrabold tabular text-ink-950"><CountUp value={score} /></div>
        <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">protection</div>
      </div>
    </div>
  );
}

function Tile({ icon: Icon, tone, label, children, sub, spark, sparkColor, delay }) {
  return (
    <Reveal delay={delay}>
      <div className="card group relative h-full overflow-hidden transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-brand-600/10">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-500">{label}</span>
          <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone} transition group-hover:scale-110`}><Icon size={18} /></span>
        </div>
        <div className="mt-2 font-display text-[32px] font-extrabold leading-none tabular text-ink-950">{children}</div>
        <div className="mt-1 text-xs text-slate-500">{sub}</div>
        {spark && <div className="-mx-5 -mb-5 mt-3"><Sparkline data={spark} color={sparkColor} id={label.replace(/\W/g, "")} /></div>}
      </div>
    </Reveal>
  );
}

export default function DashboardHome() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [summary, setSummary] = useState(null);
  const [activity, setActivity] = useState([]);
  const [recent, setRecent] = useState(null);
  const [sec, setSec] = useState(null);
  const [counts, setCounts] = useState({ shared_with_me: 0, favorites: 0 });
  const [heat, setHeat] = useState(null);
  const [feed, setFeed] = useState([]);

  useEffect(() => {
    const ok = (fn) => (r) => fn(r.data);
    api.get("/analytics/storage").then(ok(setStats)).catch(() => {});
    api.get("/analytics/summary").then(ok(setSummary)).catch(() => {});
    api.get("/analytics/activity", { params: { days: 14 } }).then(ok(setActivity)).catch(() => {});
    api.get("/files", { params: { scope: "recent" } }).then((r) => setRecent(r.data.slice(0, 5))).catch(() => setRecent([]));
    api.get("/reports/my-security").then(ok(setSec)).catch(() => {});
    api.get("/files/counts").then(ok(setCounts)).catch(() => {});
    api.get("/reports/activity-heatmap", { params: { days: 14, tz: TZ } }).then(ok(setHeat)).catch(() => setHeat({ matrix: Array.from({ length: 7 }, () => Array(24).fill(0)), max: 0, total: 0, peak: null, day_names: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] }));
    api.get("/analytics/audit", { params: { page_size: 7 } }).then((r) => setFeed(r.data.items)).catch(() => {});
  }, []);

  const checks = useMemo(() => {
    if (!sec) return [];
    return [
      { ok: user.mfa_enabled, label: "Two-factor login is on", fix: "Turn on", to: "/settings" },
      { ok: sec.key_rotation.files_on_older === 0, label: "Files use the newest master key", fix: "Details", to: "/security" },
      { ok: sec.audit.failed_30d === 0, label: "No denied actions in 30 days", fix: "Review", to: "/activity" },
      { ok: sec.links.active === 0 || !!sec.links.next_expiry, label: "Every share link has an expiry", fix: "", to: "/shared-by-me" },
    ];
  }, [sec, user]);
  const score = checks.length ? Math.round((checks.filter((c) => c.ok).length / checks.length) * 100) : 0;
  const quotaPct = stats?.quota_bytes ? Math.min((stats.used_bytes / stats.quota_bytes) * 100, 100) : 0;
  const ups = activity.map((a) => a.uploads), downs = activity.map((a) => a.downloads);
  const sum = (a) => a.reduce((x, y) => x + y, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="grid gap-5 xl:grid-cols-12">
        {/* hero */}
        <Reveal className="xl:col-span-8">
          <div className="control-room relative h-full overflow-hidden rounded-[28px] p-7 text-white sm:p-9">
            <HeroBackdrop />
            <div className="relative flex flex-wrap items-center justify-between gap-6">
              <div className="min-w-[260px] max-w-md flex-1">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium ring-1 ring-white/20 backdrop-blur">
                  <Led tone="on" pulse /> Vault online · everything is encrypted
                </span>
                <h1 className="mt-4 font-display text-4xl font-extrabold leading-[1.1] tracking-tight">{greeting()},<br />{user?.full_name?.split(" ")[0]}.</h1>
                <p className="mt-3 text-blue-100/80">
                  {sec ? <><b className="text-white"><CountUp value={sec.encryption.files_encrypted} /></b> file{sec.encryption.files_encrypted === 1 ? "" : "s"} sealed with their own AES-256 keys.</> : "Loading your vault..."}
                </p>
                <div className="mt-6 flex flex-wrap gap-2.5">
                  <Link to="/files" className="btn bg-white text-brand-700 shadow-lg shadow-black/20 hover:bg-blue-50"><Upload size={16} /> Upload files</Link>
                  <Link to="/shared-by-me" className="btn border border-white/30 text-white hover:bg-white/10"><Link2 size={16} /> Manage sharing</Link>
                </div>
              </div>
              <div className="hidden sm:block"><ShieldOrbit size={210} /></div>
            </div>
            <div className="relative mt-7 grid gap-3 sm:grid-cols-3">
              <GlassStat label="Files in vault"><CountUp value={stats?.file_count || 0} /></GlassStat>
              <GlassStat label="Storage used" sub={stats?.quota_bytes ? `of ${formatBytes(stats.quota_bytes)}` : ""}>{stats ? formatBytes(stats.used_bytes) : "-"}</GlassStat>
              <GlassStat label="Events today"><CountUp value={summary?.events_24h || 0} /></GlassStat>
            </div>
          </div>
        </Reveal>

        {/* protection score */}
        <Reveal delay={120} className="xl:col-span-4">
          <div className="card h-full">
            <div className="flex items-center justify-between"><h2 className="font-display text-lg font-bold text-ink-950">Protection score</h2><ShieldCheck className="text-brand-600" size={20} /></div>
            <div className="mt-3 flex items-center gap-4"><PostureRing score={score} />
              <div className="text-sm text-slate-500">{score === 100 ? "Excellent. Everything is locked down." : score >= 50 ? "Good. A couple of things can still improve." : "Needs attention. Fix the items below."}</div></div>
            <div className="mt-4 space-y-2">
              {checks.map((c) => (
                <div key={c.label} className="flex items-center gap-2.5 text-sm">
                  {c.ok ? <CheckCircle2 size={17} className="shrink-0 text-emerald-500" /> : <AlertTriangle size={17} className="shrink-0 text-wax-500" />}
                  <span className={c.ok ? "text-slate-600" : "font-medium text-ink-950"}>{c.label}</span>
                  {!c.ok && c.fix && <Link to={c.to} className="ml-auto text-xs font-semibold text-brand-600 hover:underline">{c.fix}</Link>}
                </div>
              ))}
              {!sec && <p className="text-sm text-slate-400">Checking...</p>}
            </div>
            {sec && <div className="mt-4 flex items-center gap-2 rounded-xl bg-paper-100 p-2.5 text-xs text-slate-600"><KeyRound size={14} className="text-wax-500" /> Master key in use: <b className="font-mono">{sec.key_rotation.current_version}</b></div>}
          </div>
        </Reveal>
      </div>

      {/* live numbers */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile delay={80} icon={File} tone="bg-brand-50 text-brand-600" label="Your files" spark={ups} sparkColor={C.primary} sub="uploads, last 14 days">
          <CountUp value={stats?.file_count || 0} /></Tile>
        <Tile delay={140} icon={HardDrive} tone="bg-amber-50 text-amber-600" label="Storage" sub={stats?.quota_bytes ? `${formatBytes(Math.max(stats.quota_bytes - stats.used_bytes, 0))} left` : ""}>
          <CountUp value={quotaPct} format={(n) => `${n.toFixed(0)}%`} />
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-paper-200"><div className={`h-full rounded-full transition-all duration-1000 ${quotaPct > 85 ? "bg-wax-500" : "bg-gradient-to-r from-brand-500 to-brand-300"}`} style={{ width: `${quotaPct}%` }} /></div></Tile>
        <Tile delay={200} icon={Link2} tone="bg-violet-50 text-violet-600" label="Active links" sub="expiring share links"><CountUp value={summary?.active_links || 0} /></Tile>
        <Tile delay={260} icon={Users} tone="bg-red-50 text-red-500" label="Downloads" spark={downs} sparkColor="#e5484d" sub={`${counts.shared_with_me} files shared with you`}>
          <CountUp value={sum(downs)} /></Tile>
      </div>

      <div className="grid gap-5 xl:grid-cols-12">
        <Reveal delay={100} className="xl:col-span-7">
          <div className="card h-full">
            <div className="mb-3 flex items-center justify-between">
              <div><h2 className="font-display text-lg font-bold text-ink-950">Activity pulse</h2><p className="text-xs text-slate-500">When your vault is busiest · last 14 days · {TZ}</p></div>
              <Link to="/file-analytics" className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">Analytics <ArrowRight size={14} /></Link>
            </div>
            <Heatmap data={heat} />
          </div>
        </Reveal>

        <Reveal delay={160} className="xl:col-span-5">
          <div className="card h-full">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-lg font-bold text-ink-950">Pick up where you left off</h2>
              <Link to="/recent" className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">All <ArrowRight size={14} /></Link></div>
            {recent === null ? <p className="py-8 text-center text-sm text-slate-500">Loading...</p>
              : recent.length === 0 ? <EmptyState icon={Clock} title="Nothing yet" text="Files you upload or open will appear here." />
              : <div className="space-y-1">{recent.map((f) => (
                <div key={f.id} className="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-paper-100">
                  <FileTile category={f.category} size={40} />
                  <div className="min-w-0 flex-1"><div className="truncate font-medium text-ink-950">{f.original_name}</div><div className="text-xs text-slate-500">{formatBytes(f.size_bytes)} · {timeAgo(f.created_at)}</div></div>
                  {f.is_favorite && <Star size={15} className="fill-amber-400 text-amber-500" />}<Seal version={f.kek_version || "v1"} compact />
                </div>))}</div>}
          </div>
        </Reveal>
      </div>

      {/* quick actions */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [Upload, "Upload & encrypt", "Add files to your vault", "/files", "from-brand-600 to-brand-400"],
          [Send, "Share securely", "Links that expire", "/shared-by-me", "from-violet-600 to-violet-400"],
          [BarChart3, "File analytics", "Uploads, downloads, sharing", "/file-analytics", "from-emerald-600 to-emerald-400"],
          [FolderLock, "Security center", "Ten protection layers", "/security", "from-wax-600 to-wax-400"],
        ].map(([Icon, title, sub, to, grad], i) => (
          <Reveal key={title} delay={120 + i * 60}>
            <Link to={to} className={`group relative flex items-center gap-4 overflow-hidden rounded-[20px] bg-gradient-to-br ${grad} p-5 text-white shadow-lg transition duration-300 hover:-translate-y-1 hover:shadow-2xl`}>
              <span className="rounded-2xl bg-white/20 p-3 backdrop-blur transition group-hover:rotate-6 group-hover:scale-110"><Icon size={22} /></span>
              <span><span className="block font-display font-bold">{title}</span><span className="text-xs text-white/80">{sub}</span></span>
              <ArrowRight size={18} className="ml-auto opacity-0 transition group-hover:translate-x-1 group-hover:opacity-100" />
              <span className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" />
            </Link>
          </Reveal>
        ))}
      </div>

      {/* live feed */}
      <Reveal delay={200}>
        <div className="card">
          <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink-950"><Led tone="on" pulse /> Live activity</h2>
            <Link to="/activity" className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">Full log <ArrowRight size={14} /></Link></div>
          {feed.length === 0 ? <p className="py-4 text-center text-sm text-slate-500">No activity yet.</p> : (
            <div className="relative space-y-3 pl-5 before:absolute before:left-[7px] before:top-1 before:h-[calc(100%-8px)] before:w-px before:bg-paper-300">
              {feed.map((e) => (
                <div key={e.id || e._id || e.timestamp + e.action} className="relative text-sm">
                  <span className={`absolute -left-5 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white ${e.result === "failure" ? "bg-wax-500" : "bg-brand-500"}`} />
                  <span className="text-ink-950"><b>{e.user_email === user.email ? "You" : e.user_email || "Someone"}</b> {EVENT_TEXT[e.action] || e.action.replace(/_/g, " ")}{e.details?.name ? <> <b>{e.details.name}</b></> : ""}
                    {e.result === "failure" && <span className="ml-1.5 rounded bg-red-50 px-1.5 py-px text-[11px] font-semibold text-red-600">denied</span>}</span>
                  <span className="ml-2 text-xs text-slate-400">{timeAgo(e.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Reveal>
    </div>
  );
}
