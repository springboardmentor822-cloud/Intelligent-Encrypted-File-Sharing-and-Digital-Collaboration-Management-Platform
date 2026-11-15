// ADMIN-ONLY "Threat Monitor": a separate dashboard inside the Security Dashboard.
//   1. Who tried to open an admin area without being an admin?
//   2. Who is trying to log in (and who is being targeted)?
//   3. Which automatic triggers exist and how often did each one fire?
// Protected on the server by require_roles("admin"); the React route is only a convenience.
import { useCallback, useEffect, useState } from "react";
import { C } from "../lib/theme";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Ban, BellRing, CheckCircle2, KeyRound, Lock, Radar, RefreshCw, ShieldAlert, ShieldOff, UserX } from "lucide-react";
import api, { errorMessage } from "../lib/api";
import { formatNumber, formatStamp, timeAgo } from "../lib/format";
import SecurityTabs from "../components/SecurityTabs";
import { Avatar, DateRangeFilter, EmptyState, Led, PageHeader } from "../components/ui";

const axis = { fontSize: 11, tickLine: false, axisLine: false, tick: { fill: "#64748b" } };
const shortDay = (d) => new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const RISK = { high: "bg-red-50 text-red-600", medium: "bg-amber-50 text-amber-600", low: "bg-emerald-50 text-emerald-600" };
const STATUS = { success: ["Success", "bg-emerald-50 text-emerald-600"], failed: ["Failed", "bg-red-50 text-red-600"], locked: ["Locked", "bg-amber-50 text-amber-700"] };
const ALERT_LABEL = {
  admin_access_denied: "Non-admin in admin area", admin_account_targeted: "Admin account attacked", unknown_account_login: "Unknown accounts tried",
  admin_new_ip: "Admin login from new IP", suspicious_ip: "Suspicious IP", repeated_failed_login: "Repeated failed logins",
};

function Metric({ icon: Icon, tone, label, value, sub, hot = false }) {
  return (
    <div className={`card flex items-center gap-4 ${hot ? "!border-red-300 !bg-red-50/40" : ""}`}>
      <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${tone}`}><Icon size={26} /></span>
      <div className="min-w-0">
        <div className="text-xs text-slate-500">{label}</div>
        <div className="font-display text-[28px] font-extrabold leading-tight tabular text-ink-950">{formatNumber(value)}</div>
        <div className="truncate text-xs text-slate-500">{sub}</div>
      </div>
    </div>
  );
}

function Panel({ title, sub, right, children, className = "" }) {
  return (
    <div className={`card ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div><h2 className="font-display text-lg font-bold text-ink-950">{title}</h2>{sub && <p className="text-xs text-slate-500">{sub}</p>}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

// Name + e-mail with a small "role" label, or "Unknown account" when the e-mail is not registered
function Person({ email, name, known, isAdminUser, disabled }) {
  return (
    <span className="flex items-center gap-2.5">
      <Avatar name={name || email || "?"} size={30} />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 whitespace-nowrap font-medium text-ink-950">
          {known ? name : "Unknown account"}
          {isAdminUser && <span className="rounded bg-ink-900 px-1.5 py-px text-[10px] font-semibold text-white">ADMIN</span>}
          {disabled && <span className="rounded bg-slate-200 px-1.5 py-px text-[10px] font-semibold text-slate-600">DISABLED</span>}
        </span>
        <span className="block max-w-[200px] truncate text-xs text-slate-500">{email || "-"}</span>
      </span>
    </span>
  );
}

export default function AdminThreats() {
  const [range, setRange] = useState({ days: 7 });
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [loadedAt, setLoadedAt] = useState(null);

  const load = useCallback(async () => {
    try {
      setError("");
      setD((await api.get("/reports/threat-monitor", { params: range })).data);
      setLoadedAt(new Date());
    } catch (e) { setError(await errorMessage(e)); }
  }, [range]);
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);

  const resolve = async (id) => { await api.patch(`/analytics/alerts/${id}/resolve`); load(); };
  const [testMsg, setTestMsg] = useState("");
  const blockIp = async (ip) => {
    const minutes = window.prompt(`Block ${ip} for how many minutes? (leave empty to block until you remove it)`, "60");
    if (minutes === null) return;
    try { await api.post("/admin/access/blocked-ips", { ip, reason: "Blocked from the Threat Monitor", minutes: minutes ? Number(minutes) : null }); setTestMsg(`${ip} is blocked. See Access Control → Blocked IPs.`); }
    catch (e) { setTestMsg(await errorMessage(e)); }
  };
  // Sends one harmless sample alert: it should show in the bell, as a red pop-up and in "Recent threat alerts"
  const sendTest = async () => {
    try { await api.post("/reports/threat-test"); setTestMsg("Test alert sent. Watch for the pop-up (up to 8 seconds) and the bell."); load(); }
    catch (e) { setTestMsg(await errorMessage(e)); }
  };
  const m = d?.metrics;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-500"><Radar size={28} /></span>
          <PageHeader title="Threat Monitor" subtitle="Who is trying to get in: non-admin users in admin areas, login attempts, and the triggers that notify you" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter value={range} onChange={setRange} range={d?.range} />
          <button className="btn-secondary !py-2.5" onClick={load} title="Refreshes by itself every 10 seconds"><RefreshCw size={15} /> {loadedAt ? timeAgo(loadedAt.toISOString()) : "Refresh"}</button>
        </div>
      </div>
      <SecurityTabs openThreats={m?.open_threats} />

      {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {!d ? <p className="py-24 text-center text-slate-500">{error ? "" : "Scanning..."}</p> : (
        <>
          <div className={`flex items-center gap-3 rounded-2xl border px-5 py-3.5 text-sm ${m.open_threats ? "border-red-300 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            <Led tone={m.open_threats ? "bad" : "on"} pulse />
            {m.open_threats
              ? <span><b>{m.open_threats} open threat alert{m.open_threats === 1 ? "" : "s"}</b> need your review. Resolve them in the list below once handled.</span>
              : <span><b>No open threat alerts.</b> Monitoring is live; new alerts pop up here and in the bell.</span>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Metric icon={ShieldOff} tone="bg-red-50 text-red-500" label="Admin-area intrusions" value={m.admin_attempts} sub="non-admin users blocked" hot={m.admin_attempts > 0} />
            <Metric icon={Lock} tone="bg-amber-50 text-amber-500" label="Intruder accounts" value={m.intruders} sub="different people" />
            <Metric icon={UserX} tone="bg-brand-50 text-brand-600" label="Failed login attempts" value={m.failed_logins} sub="in this period" />
            <Metric icon={KeyRound} tone="bg-violet-50 text-violet-600" label="Unknown-account attempts" value={m.unknown_attempts} sub="emails that do not exist" />
            <Metric icon={Ban} tone="bg-red-50 text-red-500" label="Accounts locked now" value={m.locked_now} sub="after 5 failed tries" />
          </div>

          <div className="grid gap-5 lg:grid-cols-5">
            <Panel title="Non-admin users in admin areas" sub="Signed-in users without the admin role who tried an admin page or API. Each one raised an alert." className="overflow-x-auto lg:col-span-3">
              {d.intruders.length === 0 ? <EmptyState icon={CheckCircle2} title="No intrusions" text="No non-admin user has tried to open an admin area in this period." /> : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-paper-100 text-xs text-slate-500"><tr><th className="rounded-l-lg p-2.5 font-medium">Who</th><th className="font-medium">Attempts</th><th className="font-medium">Tried to open</th><th className="font-medium">IP</th><th className="rounded-r-lg font-medium">Last attempt</th></tr></thead>
                  <tbody>
                    {d.intruders.map((i) => (
                      <tr key={i.email} className="border-b border-paper-200 last:border-0">
                        <td className="py-2.5 pr-2"><Person email={i.email} name={i.name} known={i.known} isAdminUser={i.is_admin} disabled={i.disabled} /></td>
                        <td><span className="rounded-full bg-red-50 px-2.5 py-0.5 text-sm font-bold tabular text-red-600">{i.attempts}</span></td>
                        <td className="max-w-[170px] truncate font-mono text-xs text-slate-600" title={i.paths.join(", ")}>{i.paths[0] || "-"}</td>
                        <td className="font-mono text-xs text-slate-600">{i.ips[0] || "-"}</td>
                        <td className="whitespace-nowrap text-slate-600">{formatStamp(i.last_attempt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>

            <Panel title="Hostile activity over time" className="lg:col-span-2">
              <div className="h-64">
                <ResponsiveContainer>
                  <LineChart data={d.series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e9f4" vertical={false} />
                    <XAxis dataKey="day" tickFormatter={shortDay} interval="preserveStartEnd" {...axis} /><YAxis allowDecimals={false} {...axis} />
                    <Tooltip /><Legend iconType="circle" />
                    <Line type="monotone" name="Admin-area intrusions" dataKey="admin_denied" stroke="#e5484d" strokeWidth={2.5} dot={{ r: 3 }} />
                    <Line type="monotone" name="Failed logins" dataKey="failed_logins" stroke={C.primary} strokeWidth={2} dot={{ r: 2.5 }} />
                    <Line type="monotone" name="Unknown accounts" dataKey="unknown_accounts" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 2.5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          <Panel title="Login attempt detection" sub="Every sign-in attempt, newest first: who tried, whether the account exists, and why it failed"
            right={<span className="flex items-center gap-1.5 text-xs text-slate-500"><Led tone="on" pulse /> live</span>} className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-paper-100 text-xs text-slate-500"><tr><th className="rounded-l-lg p-2.5 font-medium">Who tried</th><th className="font-medium">Result</th><th className="font-medium">Reason</th><th className="font-medium">Method</th><th className="font-medium">IP address</th><th className="font-medium">Location</th><th className="rounded-r-lg font-medium">Date &amp; Time</th></tr></thead>
              <tbody>
                {d.login_feed.length === 0 && <tr><td colSpan="7" className="py-8 text-center text-slate-500">No login attempts in this period.</td></tr>}
                {d.login_feed.map((r) => {
                  const [label, cls] = STATUS[r.status];
                  return (
                    <tr key={r.id} className={`border-b border-paper-200 last:border-0 ${r.unknown_account ? "bg-red-50/40" : ""}`}>
                      <td className="py-2.5 pr-2"><Person email={r.email} name={r.name} known={r.known} isAdminUser={r.is_admin} disabled={r.disabled} /></td>
                      <td><span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span></td>
                      <td className="text-xs text-slate-600">{r.reason || "-"}{r.unknown_account && <span className="ml-1 font-semibold text-red-600">· account does not exist</span>}</td>
                      <td className="text-xs capitalize text-slate-600">{r.provider}</td>
                      <td className="whitespace-nowrap font-mono text-xs text-slate-600">{r.ip}</td>
                      <td className="whitespace-nowrap text-slate-600">{r.location}</td>
                      <td className="whitespace-nowrap text-slate-600">{formatStamp(r.timestamp)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Accounts being targeted" sub="E-mails with the most failed logins" className="overflow-x-auto">
              {d.targeted_accounts.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No failed logins in this period.</p> : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-paper-100 text-xs text-slate-500"><tr><th className="rounded-l-lg p-2.5 font-medium">Account</th><th className="font-medium">Failed</th><th className="font-medium">IPs</th><th className="font-medium">State</th><th className="rounded-r-lg font-medium">Last try</th></tr></thead>
                  <tbody>
                    {d.targeted_accounts.map((t) => (
                      <tr key={t.email} className="border-b border-paper-200 last:border-0">
                        <td className="py-2.5 pr-2"><Person email={t.email} name={t.name} known={t.known} isAdminUser={t.is_admin} disabled={t.disabled} /></td>
                        <td><span className="rounded-full bg-red-50 px-2.5 py-0.5 text-sm font-bold tabular text-red-600">{t.attempts}</span></td>
                        <td className="tabular text-slate-600">{t.distinct_ips}</td>
                        <td>{t.locked ? <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Locked</span> : <span className="text-xs text-slate-400">{t.known ? "Open" : "Not a user"}</span>}</td>
                        <td className="whitespace-nowrap text-slate-600">{timeAgo(t.last_attempt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>

            <Panel title="Attacking IP addresses" sub="Risk = many failures, or many different accounts tried" className="overflow-x-auto">
              {d.attacker_ips.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No failed logins in this period.</p> : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-paper-100 text-xs text-slate-500"><tr><th className="rounded-l-lg p-2.5 font-medium">IP address</th><th className="font-medium">Failed</th><th className="font-medium">Accounts tried</th><th className="font-medium">Risk</th><th className="font-medium">Location</th><th className="rounded-r-lg font-medium">Last seen</th></tr></thead>
                  <tbody>
                    {d.attacker_ips.map((i) => (
                      <tr key={i.ip} className="border-b border-paper-200 last:border-0">
                        <td className="p-2.5 font-mono text-xs text-ink-950">{i.ip}<button className="ml-2 font-sans font-semibold text-red-600 hover:underline" onClick={() => blockIp(i.ip)}>Block</button></td>
                        <td className="tabular font-semibold text-slate-700">{i.attempts}</td>
                        <td className="tabular text-slate-600">{i.accounts_tried}</td>
                        <td><span className={`rounded-md px-2 py-0.5 text-xs font-semibold capitalize ${RISK[i.risk]}`}>{i.risk}</span></td>
                        <td className="whitespace-nowrap text-slate-600">{i.location}</td>
                        <td className="whitespace-nowrap text-slate-600">{timeAgo(i.last_seen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Active triggers" sub="Automatic rules. When one fires, an alert is created and every admin is notified (bell, pop-up and e-mail if configured)."
              right={<button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={sendTest}><BellRing size={14} /> Send test alert</button>}>
              {testMsg && <div className="mb-3 rounded-xl bg-brand-50 p-2.5 text-xs text-brand-800">{testMsg}</div>}
              <div className="space-y-2.5">
                {d.rules.map((r) => (
                  <div key={r.id} className="rounded-2xl border border-paper-200 p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-semibold text-ink-950"><Led tone="on" /> {r.name}</div>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.fired ? "bg-red-50 text-red-600" : "bg-paper-100 text-slate-500"}`}>fired {r.fired}×</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-600"><b>When:</b> {r.when}</div>
                    <div className="text-xs text-slate-600"><b>Then:</b> {r.then}</div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Recent threat alerts" sub="Resolve an alert after you have looked into it">
              {d.recent_alerts.length === 0 ? <EmptyState icon={ShieldAlert} title="No threat alerts yet" text="Try the demo steps in the README to see one appear." /> : (
                <div className="space-y-2">
                  {d.recent_alerts.map((a) => (
                    <div key={a.id} className={`flex items-start justify-between gap-3 rounded-2xl border border-paper-200 p-3 ${a.resolved ? "opacity-50" : ""}`}>
                      <div className="flex gap-2.5">
                        <span className="mt-1.5"><Led tone={a.resolved ? "off" : a.severity === "critical" ? "bad" : "warn"} /></span>
                        <div>
                          <div className="text-sm font-semibold text-ink-950">{ALERT_LABEL[a.type] || a.type}</div>
                          <div className="text-xs text-slate-600">{a.message}</div>
                          <div className="mt-0.5 text-xs text-slate-400">IP {a.ip || "unknown"} · {formatStamp(a.created_at)}</div>
                        </div>
                      </div>
                      {!a.resolved && <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => resolve(a.id)}>Resolve</button>}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
