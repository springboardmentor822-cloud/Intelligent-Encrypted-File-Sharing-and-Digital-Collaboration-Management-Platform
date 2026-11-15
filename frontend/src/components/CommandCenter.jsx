// The admin "Command center": the first page an administrator sees.
// Animated hero with the current threat level, live numbers with sparklines, a platform activity heatmap,
// service health, and a live feed of security events.
import { useEffect, useState } from "react";
import { C } from "../lib/theme";
import { Link } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ArrowRight, Ban, CheckCircle2, Crosshair, FileText, Radar, ShieldCheck, ShieldAlert, Upload, UserCheck, UserX, Users, XCircle, Cpu, Download } from "lucide-react";
import api from "../lib/api";
import { formatBytes, timeAgo } from "../lib/format";
import { GROUP_COLOR, GROUP_LABEL } from "./FileTile";
import { CountUp, GlassStat, Heatmap, HeroBackdrop, Reveal, ShieldOrbit, Sparkline } from "./fx";
import { Led } from "./ui";

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const EVENT_LABEL = {
  repeated_failed_login: "Repeated failed logins", suspicious_ip: "Suspicious IP access", unauthorized_link_access: "Unauthorized link access",
  repeated_failed_download: "Unauthorized downloads", policy_violation: "Policy violation", file_threat: "Potential file threat", download_burst: "Unusual download volume",
  admin_access_denied: "Non-admin tried an admin area", admin_account_targeted: "Admin account under attack", unknown_account_login: "Unknown accounts tried", admin_new_ip: "Admin login from a new IP",
};

function threat(m) {
  if (!m) return { name: "...", color: C.primarySoft, note: "Scanning the platform" };
  if (m.open_alerts >= 3) return { name: "HIGH", color: "#ff7b80", note: `${m.open_alerts} unresolved alerts need review now` };
  if (m.open_alerts >= 1 || m.failed_logins >= 5) return { name: "ELEVATED", color: "#ffc857", note: "Some suspicious activity to review" };
  return { name: "CALM", color: "#5eead4", note: "No unusual activity detected" };
}

function Tile({ icon: Icon, tone, label, value, spark, color, sub, delay }) {
  return (
    <Reveal delay={delay}>
      <div className="card group h-full overflow-hidden transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-brand-600/10">
        <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500">{label}</span>
          <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone} transition group-hover:scale-110`}><Icon size={18} /></span></div>
        <div className="mt-2 font-display text-[32px] font-extrabold leading-none tabular text-ink-950"><CountUp value={value} /></div>
        <div className="mt-1 text-xs text-slate-500">{sub}</div>
        <div className="-mx-5 -mb-5 mt-3"><Sparkline data={spark} color={color} id={label.replace(/\W/g, "")} /></div>
      </div>
    </Reveal>
  );
}

export default function CommandCenter({ ov }) {
  const [sec, setSec] = useState(null);
  const [fa, setFa] = useState(null);
  const [sys, setSys] = useState(null);
  const [heat, setHeat] = useState(null);
  const [acc, setAcc] = useState(null);     // access control summary (approvals, blocked IPs, tripwires)
  const [so, setSo] = useState(null);       // storage per user

  useEffect(() => {
    const load = () => {
      api.get("/reports/security-dashboard", { params: { days: 14 } }).then((r) => setSec(r.data)).catch(() => {});
      api.get("/reports/file-analytics", { params: { days: 14 } }).then((r) => setFa(r.data)).catch(() => {});
      api.get("/admin/system").then((r) => setSys(r.data)).catch(() => {});
      api.get("/admin/access/overview").then((r) => setAcc(r.data)).catch(() => {});
      api.get("/analytics/overview", { params: { days: 30 } }).then((r) => setSo(r.data)).catch(() => {});
    };
    load();
    api.get("/reports/activity-heatmap", { params: { days: 14, tz: TZ } }).then((r) => setHeat(r.data)).catch(() => {});
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);

  const m = sec?.metrics;
  const level = threat(m);
  const s = ov.storage;
  const storagePct = s.capacity_bytes ? (s.used_bytes / s.capacity_bytes) * 100 : 0;
  const groups = fa ? fa.storage.by_group.filter((g) => g.bytes > 0) : [];

  return (
    <div className="space-y-5">
      <Reveal>
        <div className="control-room relative overflow-hidden rounded-[28px] p-7 text-white sm:p-9">
          <HeroBackdrop />
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div className="min-w-[260px] max-w-xl flex-1">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium ring-1 ring-white/20 backdrop-blur"><Led tone="on" pulse /> Command center · live</span>
              <h1 className="mt-4 font-display text-4xl font-extrabold leading-[1.1] tracking-tight">Platform security level</h1>
              <div className="mt-2 flex items-baseline gap-3">
                <span className="font-display text-6xl font-extrabold tracking-tight transition-colors" style={{ color: level.color }}>{level.name}</span>
              </div>
              <p className="mt-1 text-blue-100/80">{level.note}</p>
              <div className="mt-6 flex flex-wrap gap-2.5">
                <Link to="/admin/security" className="btn bg-white text-brand-700 shadow-lg shadow-black/20 hover:bg-blue-50"><ShieldCheck size={16} /> Security Dashboard</Link>
                <Link to="/admin/security/threats" className="btn border border-white/30 text-white hover:bg-white/10"><Radar size={16} /> Threat Monitor</Link>
              </div>
            </div>
            <div className="hidden sm:block"><ShieldOrbit size={220} tone={level.name === "CALM" ? "blue" : "red"} /></div>
          </div>
          <div className="relative mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <GlassStat label="Users" sub={`${ov.users.active} active · ${ov.users.disabled} disabled`}><CountUp value={ov.users.total} /></GlassStat>
            <GlassStat label="Active sessions" sub={`${ov.users.mfa_enabled} with MFA`}><CountUp value={ov.active_sessions} /></GlassStat>
            <GlassStat label="Files encrypted" sub="AES-256-GCM"><CountUp value={sys?.counts.files ?? 0} /></GlassStat>
            <GlassStat label="Storage" sub={`${formatBytes(s.used_bytes)} of ${formatBytes(s.capacity_bytes)}`}><CountUp value={storagePct} format={(n) => `${n.toFixed(0)}%`} /></GlassStat>
          </div>
        </div>
      </Reveal>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile delay={60} icon={CheckCircle2} tone="bg-emerald-50 text-emerald-600" label="Successful logins" value={m?.successful_logins ?? 0} spark={(sec?.login_series || []).map((x) => x.success)} color="#10b981" sub="last 14 days" />
        <Tile delay={120} icon={UserX} tone="bg-red-50 text-red-500" label="Failed logins" value={m?.failed_logins ?? 0} spark={(sec?.login_series || []).map((x) => x.failure)} color="#e5484d" sub={`${m?.unauthorized_attempts ?? 0} unauthorized attempts`} />
        <Tile delay={180} icon={Upload} tone="bg-brand-50 text-brand-600" label="Uploads" value={fa?.cards.total_uploads ?? 0} spark={(fa?.uploads.series || []).map((x) => x.documents + x.images + x.videos + x.others)} color={C.primary} sub="files added" />
        <Tile delay={240} icon={Download} tone="bg-violet-50 text-violet-600" label="Downloads" value={fa?.cards.total_downloads ?? 0} spark={(fa?.downloads.series || []).map((x) => x.total)} color="#8b5cf6" sub={`${fa?.downloads.unique_users ?? 0} unique users`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-12">
        <Reveal delay={80} className="xl:col-span-7">
          <div className="card h-full">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-lg font-bold text-ink-950">Who gets in</h2>
              <Link to="/admin/access" className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">Access Control <ArrowRight size={14} /></Link></div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[[UserCheck, "Waiting for approval", acc?.counts.pending ?? 0, "bg-violet-50 text-violet-600", acc?.policy.require_approval ? "approval is ON" : "registration is open"],
                [Ban, "Blocked IP addresses", acc?.counts.blocked ?? 0, "bg-red-50 text-red-500", `${acc?.counts.auto_blocked ?? 0} automatic`],
                [Crosshair, "Tripwire files", acc?.counts.tripwires ?? 0, "bg-amber-50 text-amber-600", "traps set"]].map(([Icon, l, v, tone, sub]) => (
                <div key={l} className="rounded-2xl border border-paper-200 p-4"><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}><Icon size={17} /></span>
                  <div className="mt-2 font-display text-3xl font-extrabold tabular text-ink-950"><CountUp value={v} /></div><div className="text-sm text-slate-600">{l}</div><div className="text-xs text-slate-400">{sub}</div></div>
              ))}
            </div>
          </div>
        </Reveal>
        <Reveal delay={140} className="xl:col-span-5">
          <div className="card h-full">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-lg font-bold text-ink-950">Storage by user</h2>
              <Link to="/admin/storage" className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">Analytics <ArrowRight size={14} /></Link></div>
            {!so ? <p className="py-6 text-center text-sm text-slate-400">Loading...</p> : so.users_storage.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No files stored yet.</p> : (
              <div className="space-y-3">
                {so.users_storage.slice(0, 5).map((u) => (
                  <div key={u.user_id}><div className="mb-1 flex justify-between text-sm"><span className="truncate text-slate-700">{u.name}</span><span className="tabular font-semibold text-ink-950">{formatBytes(u.bytes)}</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-paper-200"><div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-wax-500" style={{ width: `${Math.max((u.bytes / so.totals.capacity_bytes) * 100, 1.5)}%` }} /></div></div>
                ))}
                <p className="text-xs text-slate-400">Bars show each user's share of the {formatBytes(so.totals.capacity_bytes)} limit.</p>
              </div>
            )}
          </div>
        </Reveal>
      </div>

      <div className="grid gap-5 xl:grid-cols-12">
        <Reveal delay={100} className="xl:col-span-7">
          <div className="card h-full">
            <h2 className="font-display text-lg font-bold text-ink-950">Platform activity pulse</h2>
            <p className="mb-3 text-xs text-slate-500">Every logged event, by weekday and hour · last 14 days · {TZ}</p>
            <Heatmap data={heat} />
          </div>
        </Reveal>

        <Reveal delay={160} className="xl:col-span-5">
          <div className="card h-full">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-lg font-bold text-ink-950">Service health</h2>
              <Link to="/admin/system" className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">Details <ArrowRight size={14} /></Link></div>
            {!sys ? <p className="py-6 text-center text-sm text-slate-400">Checking...</p> : (
              <div className="space-y-2">
                {sys.services.map((x) => (
                  <div key={x.name} className="flex items-center justify-between rounded-2xl bg-paper-100 px-3.5 py-2.5 text-sm">
                    <span className="flex items-center gap-2.5">{x.ok ? <Led tone="on" pulse /> : <XCircle size={14} className="text-red-500" />}<span className="font-medium text-ink-950">{x.name}</span></span>
                    <span className="tabular text-xs text-slate-500">{x.ok ? `${x.ms} ms` : "down"}</span>
                  </div>
                ))}
                <div className="flex items-center gap-3 pt-2">
                  <div className="h-24 w-24">
                    <ResponsiveContainer><PieChart><Pie data={groups.length ? groups : [{ type: "none", bytes: 1 }]} dataKey="bytes" innerRadius={28} outerRadius={44} stroke="none" paddingAngle={2}>
                      {(groups.length ? groups : [{ type: "none" }]).map((g) => <Cell key={g.type} fill={GROUP_COLOR[g.type] || "#e2e9f4"} />)}</Pie><Tooltip formatter={(v) => formatBytes(v)} /></PieChart></ResponsiveContainer>
                  </div>
                  <div className="space-y-1 text-xs">{groups.map((g) => <div key={g.type} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: GROUP_COLOR[g.type] }} />{GROUP_LABEL[g.type]} <span className="text-slate-400">{formatBytes(g.bytes)}</span></div>)}</div>
                </div>
              </div>
            )}
          </div>
        </Reveal>
      </div>

      <div className="grid gap-5 xl:grid-cols-12">
        <Reveal delay={120} className="xl:col-span-7">
          <div className="card h-full">
            <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink-950"><Led tone={m?.open_alerts ? "bad" : "on"} pulse /> Live security feed</h2>
              <Link to="/admin/security/threats" className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">Threat Monitor <ArrowRight size={14} /></Link></div>
            {!sec ? <p className="py-6 text-center text-sm text-slate-400">Loading...</p> : sec.recent_events.length === 0 ? (
              <p className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700">All quiet. No security events recorded.</p>
            ) : (
              <div className="relative space-y-3.5 pl-5 before:absolute before:left-[7px] before:top-1 before:h-[calc(100%-8px)] before:w-px before:bg-paper-300">
                {sec.recent_events.slice(0, 6).map((e) => (
                  <div key={e.id} className={`relative text-sm ${e.resolved ? "opacity-50" : ""}`}>
                    <span className={`absolute -left-5 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white ${e.severity === "critical" ? "bg-wax-500" : e.severity === "warning" ? "bg-amber-400" : "bg-brand-500"}`} />
                    <div className="font-semibold text-ink-950">{EVENT_LABEL[e.type] || e.type} <span className="ml-1 text-xs font-normal text-slate-400">{timeAgo(e.created_at)}</span></div>
                    <div className="text-xs text-slate-500">{e.description} · IP {e.ip || "unknown"}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Reveal>

        <div className="grid content-start gap-4 sm:grid-cols-2 xl:col-span-5">
          {[
            [ShieldCheck, "Security Dashboard", "Logins, attempts, analytics", "/admin/security", "from-brand-600 to-brand-400"],
            [Radar, "Threat Monitor", "Intruders and triggers", "/admin/security/threats", "from-wax-600 to-wax-400"],
            [Users, "User Management", "Roles, disable accounts", "/admin/users", "from-violet-600 to-violet-400"],
            [Cpu, "System Monitoring", "Health, storage, keys", "/admin/system", "from-emerald-600 to-emerald-400"],
          ].map(([Icon, title, sub, to, grad], i) => (
            <Reveal key={title} delay={160 + i * 60}>
              <Link to={to} className={`group relative flex h-full items-center gap-3.5 overflow-hidden rounded-[20px] bg-gradient-to-br ${grad} p-4 text-white shadow-lg transition duration-300 hover:-translate-y-1 hover:shadow-2xl`}>
                <span className="rounded-2xl bg-white/20 p-2.5 backdrop-blur transition group-hover:rotate-6 group-hover:scale-110"><Icon size={20} /></span>
                <span><span className="block font-display text-[15px] font-bold leading-tight">{title}</span><span className="text-xs text-white/80">{sub}</span></span>
                <span className="absolute -right-5 -top-5 h-20 w-20 rounded-full bg-white/10" />
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </div>
  );
}
