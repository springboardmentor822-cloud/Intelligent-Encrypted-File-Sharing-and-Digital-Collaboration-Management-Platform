// ADMIN-ONLY Security Dashboard (matches the mockup).
// The menu item is hidden from normal users, but the REAL lock is on the server:
// GET /reports/security-dashboard uses require_roles("admin") and answers 403 to everyone else.
import { useCallback, useEffect, useState } from "react";
import { C } from "../lib/theme";
import { Link } from "react-router-dom";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, RefreshCw, ScrollText, ShieldCheck, Users, XCircle } from "lucide-react";
import api, { errorMessage } from "../lib/api";
import { formatNumber, formatStamp, timeAgo } from "../lib/format";
import AuditLogTable from "../components/AuditLogTable";
import ActivityAnalytics from "../components/ActivityAnalytics";
import SecurityTabs from "../components/SecurityTabs";
import { Avatar, DateRangeFilter, Delta, PageHeader } from "../components/ui";

const GROUP_COLOR = {
  "Multiple Login Attempts": "#e5484d", "Suspicious IP Access": "#10b981", "Unauthorized Access": "#f59e0b",
  "Policy Violations": C.primarySoft, "Malware / File Threat": "#8b5cf6", Others: "#94a3b8",
};
const EVENT_LABEL = {
  repeated_failed_login: "Multiple failed login attempts", suspicious_ip: "Suspicious IP access", unauthorized_link_access: "Unauthorized access attempt",
  repeated_failed_download: "Repeated unauthorized downloads", admin_access_denied: "Non-admin tried an admin area",
  admin_account_targeted: "Admin account under attack", unknown_account_login: "Unknown accounts tried", admin_new_ip: "Admin login from new IP", policy_violation: "Policy violation", file_threat: "Potential file threat", download_burst: "Unusual download volume",
};
const SEV = { critical: ["High", "bg-red-50 text-red-600"], warning: ["Medium", "bg-amber-50 text-amber-600"], info: ["Info", "bg-brand-50 text-brand-600"] };
const axis = { fontSize: 11, tickLine: false, axisLine: false, tick: { fill: "#64748b" } };
const shortDay = (d) => new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const grid = <CartesianGrid strokeDasharray="3 3" stroke="#e2e9f4" vertical={false} />;

function Metric({ icon: Icon, tone, label, value, delta, bad, sub, subTone = "text-slate-500" }) {
  return (
    <div className="card flex items-center gap-4">
      <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${tone}`}><Icon size={26} /></span>
      <div className="min-w-0">
        <div className="text-xs text-slate-500">{label}</div>
        <div className="flex items-center gap-2"><span className="font-display text-[28px] font-extrabold leading-tight tabular text-ink-950">{formatNumber(value)}</span><Delta value={delta} bad={bad} /></div>
        <div className={`truncate text-xs ${subTone}`}>{sub}</div>
      </div>
    </div>
  );
}

function Panel({ title, right, children, className = "" }) {
  return (
    <div className={`card ${className}`}>
      <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-lg font-bold text-ink-950">{title}</h2>{right}</div>
      {children}
    </div>
  );
}

export default function AdminSecurity() {
  const [range, setRange] = useState({ days: 30 });
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [loadedAt, setLoadedAt] = useState(null);
  const [fa, setFa] = useState(null);   // the File Analytics graphs shown inside this dashboard

  const load = useCallback(async () => {
    try {
      setError("");
      const [sec, files] = await Promise.all([api.get("/reports/security-dashboard", { params: range }), api.get("/reports/file-analytics", { params: range })]);
      setD(sec.data);
      setFa(files.data);
      setLoadedAt(new Date());
    } catch (e) { setError(await errorMessage(e)); }
  }, [range]);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const resolve = async (id) => { await api.patch(`/analytics/alerts/${id}/resolve`); load(); };
  const m = d?.metrics, dl = d?.deltas;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-900 text-white shadow-lg shadow-ink-900/20"><ShieldCheck size={28} /></span>
          <PageHeader title="Security Dashboard" subtitle="Monitor login activity, access attempts, security events and audit logs" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter value={range} onChange={setRange} range={d?.range} />
          <button className="btn-secondary !py-2.5" onClick={load} title="Refreshes by itself every 30 seconds"><RefreshCw size={15} /> {loadedAt ? timeAgo(loadedAt.toISOString()) : "Refresh"}</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SecurityTabs openThreats={d?.metrics.open_alerts} />
        <div className="flex items-center gap-1 text-sm text-slate-500">Jump to
          {[["#analytics", "Activity analytics"], ["#audit", "Audit monitoring"]].map(([h, l]) => <a key={h} href={h} className="rounded-lg px-2.5 py-1 font-medium text-brand-600 hover:bg-brand-50">{l}</a>)}
        </div>
      </div>

      {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {!d ? <p className="py-24 text-center text-slate-500">{error ? "" : "Loading security data..."}</p> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Metric icon={Users} tone="bg-brand-50 text-brand-600" label="Total Logins" value={m.total_logins} delta={dl.total_logins} sub={`+${m.logins_today} today`} subTone="text-emerald-600" />
            <Metric icon={CheckCircle2} tone="bg-emerald-50 text-emerald-600" label="Successful Logins" value={m.successful_logins} delta={dl.successful_logins}
              sub={m.success_rate !== null ? `${m.success_rate}% success rate` : "no logins yet"} />
            <Metric icon={XCircle} tone="bg-red-50 text-red-500" label="Failed Logins" value={m.failed_logins} delta={dl.failed_logins} bad
              sub={m.failure_rate !== null ? `${m.failure_rate}% failure rate` : "no logins yet"} />
            <Metric icon={AlertTriangle} tone="bg-amber-50 text-amber-500" label="Unauthorized Attempts" value={m.unauthorized_attempts} delta={dl.unauthorized_attempts} bad
              sub={`${m.blocked_requests} blocked requests`} />
            <Metric icon={ShieldCheck} tone="bg-violet-50 text-violet-600" label="Security Events" value={m.security_events} delta={dl.security_events} bad
              sub={m.open_alerts ? `${m.open_alerts} open - needs review` : "Includes suspicious activity"} subTone={m.open_alerts ? "text-red-500" : "text-slate-500"} />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Panel title="Login Activity">
              <div className="h-60">
                <ResponsiveContainer>
                  <AreaChart data={d.login_series}>
                    <defs>
                      <linearGradient id="lOk" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                      <linearGradient id="lBad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#e5484d" stopOpacity={0.3} /><stop offset="95%" stopColor="#e5484d" stopOpacity={0} /></linearGradient>
                    </defs>
                    {grid}<XAxis dataKey="day" tickFormatter={shortDay} interval="preserveStartEnd" {...axis} /><YAxis allowDecimals={false} {...axis} />
                    <Tooltip /><Legend iconType="circle" />
                    <Area type="monotone" name="Successful Logins" dataKey="success" stroke="#10b981" strokeWidth={2} fill="url(#lOk)" />
                    <Area type="monotone" name="Failed Logins" dataKey="failure" stroke="#e5484d" strokeWidth={2} fill="url(#lBad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Access Attempts">
              <div className="h-60">
                <ResponsiveContainer>
                  <BarChart data={d.access_series} barCategoryGap="20%">
                    {grid}<XAxis dataKey="day" tickFormatter={shortDay} interval="preserveStartEnd" {...axis} /><YAxis allowDecimals={false} {...axis} />
                    <Tooltip cursor={{ fill: "rgba(29,92,234,.05)" }} /><Legend iconType="circle" />
                    <Bar name="Unauthorized Attempts" dataKey="unauthorized" fill="#e5484d" radius={[3, 3, 0, 0]} />
                    <Bar name="Blocked Requests" dataKey="blocked" fill={C.primarySoft} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Security Events">
              <div className="grid items-center gap-2 sm:grid-cols-[150px_1fr]">
                <div className="relative h-40">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={m.security_events ? d.event_groups : [{ name: "none", count: 1 }]} dataKey="count" nameKey="name" innerRadius={48} outerRadius={70} stroke="none" paddingAngle={1}>
                        {(m.security_events ? d.event_groups : [{ name: "none" }]).map((g) => <Cell key={g.name} fill={GROUP_COLOR[g.name] || "#e2e9f4"} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><div className="font-display text-2xl font-extrabold text-ink-950">{m.security_events}</div><div className="text-[11px] text-slate-500">Events</div></div>
                </div>
                <div className="space-y-1.5 text-xs">
                  {d.event_groups.map((g) => (
                    <div key={g.name} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: GROUP_COLOR[g.name] }} />{g.name}</span>
                      <span className="tabular text-slate-600">{g.count} <span className="text-slate-400">({g.pct}%)</span></span>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Recent Login Activity" right={<a href="#audit" className="text-sm font-medium text-brand-600 hover:underline">View All</a>} className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-paper-100 text-xs text-slate-500"><tr><th className="rounded-l-lg p-2.5 font-medium">User</th><th className="font-medium">Email</th><th className="font-medium">IP Address</th><th className="font-medium">Status</th><th className="font-medium">Location</th><th className="rounded-r-lg font-medium">Date &amp; Time</th></tr></thead>
                <tbody>
                  {d.recent_logins.length === 0 && <tr><td colSpan="6" className="py-8 text-center text-slate-500">No logins yet.</td></tr>}
                  {d.recent_logins.map((r) => (
                    <tr key={r.id} className="border-b border-paper-200 last:border-0">
                      <td className="py-2.5 pr-2"><span className="flex items-center gap-2"><Avatar name={r.user_name || "?"} size={28} /><span className="whitespace-nowrap font-medium text-ink-950">{r.user_name || "Unknown User"}</span></span></td>
                      <td className="text-slate-600">{r.user_email || "-"}</td>
                      <td className="whitespace-nowrap font-mono text-xs text-slate-600">{r.ip}</td>
                      <td><span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${r.status === "success" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`} title={r.reason || ""}>{r.status === "success" ? "Success" : "Failed"}</span></td>
                      <td className="whitespace-nowrap text-slate-600">{r.location}</td>
                      <td className="whitespace-nowrap text-slate-600">{formatStamp(r.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>

            <Panel title="Recent Security Events" right={<a href="#audit" className="text-sm font-medium text-brand-600 hover:underline">View All</a>} className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-paper-100 text-xs text-slate-500"><tr><th className="rounded-l-lg p-2.5 font-medium">Event</th><th className="font-medium">Severity</th><th className="font-medium">IP Address</th><th className="font-medium">Details</th><th className="rounded-r-lg font-medium">Date &amp; Time</th></tr></thead>
                <tbody>
                  {d.recent_events.length === 0 && <tr><td colSpan="5" className="py-8 text-center text-slate-500">All quiet. No events recorded.</td></tr>}
                  {d.recent_events.map((e) => {
                    const [label, cls] = SEV[e.severity] || SEV.info;
                    return (
                      <tr key={e.id} className={`border-b border-paper-200 last:border-0 ${e.resolved ? "opacity-50" : ""}`}>
                        <td className="max-w-[170px] py-2.5 pr-2 font-medium text-ink-950">{EVENT_LABEL[e.type] || e.type}</td>
                        <td><span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span></td>
                        <td className="whitespace-nowrap font-mono text-xs text-slate-600">{e.ip || "-"}</td>
                        <td className="max-w-[170px] text-xs text-slate-600">
                          {e.description}{e.details?.file ? ` (${e.details.file})` : ""}
                          {!e.resolved && <button className="ml-2 font-medium text-brand-600 hover:underline" onClick={() => resolve(e.id)}>Resolve</button>}
                        </td>
                        <td className="whitespace-nowrap text-slate-600">{formatStamp(e.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>
          </div>

          {d.top_ips.length > 0 && (
            <Panel title="Riskiest IP addresses" right={<span className="text-xs text-slate-500">most failed or denied requests</span>}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {d.top_ips.map((ip) => (
                  <div key={ip.ip} className="rounded-2xl border border-paper-200 p-3">
                    <div className="font-mono text-sm font-medium text-ink-950">{ip.ip}</div>
                    <div className="mt-1 flex items-center justify-between text-xs text-slate-500"><span>last {timeAgo(ip.last_seen)}</span><span className="rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-600">{ip.attempts}</span></div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <div id="analytics" className="space-y-4 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold text-ink-950"><Activity size={20} className="text-brand-600" /> Activity Analytics</h2>
              <span className="text-xs text-slate-500">Whole platform · same period as above · <Link to="/admin/analytics" className="font-semibold text-brand-600 hover:underline">open full page</Link></span>
            </div>
            {fa ? <ActivityAnalytics data={fa} /> : <p className="py-10 text-center text-slate-500">Loading analytics...</p>}
          </div>

          <div id="audit" className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold text-ink-950"><ScrollText size={20} className="text-brand-600" /> Audit Monitoring</h2>
              <span className="text-xs text-slate-500">{formatNumber(m.audit_records)} records in this period</span>
            </div>
            <AuditLogTable />
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-paper-200 bg-white px-5 py-3 text-sm text-slate-600">
            <span>Need to manage users, files or encryption keys?</span>
            <Link to="/admin/system" className="flex items-center gap-1 font-medium text-brand-600 hover:underline">Open System Monitoring <ArrowRight size={14} /></Link>
          </div>
        </>
      )}
    </div>
  );
}
