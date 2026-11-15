// Admin → User Activity Monitoring (Milestone 3, Task 1): one row per user, and a timeline for the selected user.
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, Download, LogIn, Share2, ShieldX, Upload, Users, X } from "lucide-react";
import api, { errorMessage } from "../lib/api";
import { formatNumber, formatStamp, timeAgo } from "../lib/format";
import { C } from "../lib/theme";
import { StatusPill } from "../components/filters";
import { Avatar, Led, PageHeader, Segmented, StatCard } from "../components/ui";

const RISK = { high: "bg-red-50 text-red-600", medium: "bg-amber-50 text-amber-600", low: "bg-emerald-50 text-emerald-600" };
const axis = { fontSize: 11, tickLine: false, axisLine: false, tick: { fill: "#64748b" } };

export default function AdminUserActivity() {
  const [days, setDays] = useState("30");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [live, setLive] = useState([]);            // the newest events from ALL users, refreshed every 5 seconds
  const [sel, setSel] = useState(null);          // the user whose timeline is open
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    const load = () => api.get("/activity/users", { params: { days } }).then((r) => setData(r.data)).catch(async (e) => setError(await errorMessage(e)));
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [days]);
  useEffect(() => {
    const tick = () => api.get("/audit-logs", { params: { page_size: 14 } }).then((r) => setLive(r.data.items)).catch(() => {});
    tick();
    const t = setInterval(tick, 5000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!sel) { setDetail(null); return; }
    api.get(`/activity/users/${sel.user_id}`, { params: { days } }).then((r) => setDetail(r.data)).catch(() => setDetail(false));
  }, [sel, days]);

  const t = data?.totals;
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader title="User Activity Monitoring" subtitle="Who is active, what they did, and from where. Click a person to see their full timeline.">
        <Segmented value={days} onChange={setDays} options={[["7", "7 days"], ["30", "30 days"], ["90", "90 days"]]} />
      </PageHeader>
      {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {!data ? <p className="py-16 text-center text-slate-500">Loading...</p> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <StatCard icon={Users} label="Online now" value={data.online_now} sub="active in last 10 min" tone="green" />
            <StatCard icon={LogIn} label="Logins" value={formatNumber(t.logins)} />
            <StatCard icon={Upload} tone="sky" label="Uploads" value={formatNumber(t.uploads)} />
            <StatCard icon={Download} tone="violet" label="Downloads" value={formatNumber(t.downloads)} />
            <StatCard icon={Share2} tone="amber" label="Shares" value={formatNumber(t.shares)} />
            <StatCard icon={ShieldX} tone="red" label="Denied / failed" value={formatNumber(t.denied)} />
          </div>

          <div className="card !p-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-paper-200 px-4 py-3"><h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink-950"><Led tone="on" pulse /> Live stream: everything happening now</h2><span className="text-xs text-slate-400">updates every 5 seconds</span></div>
            <div className="max-h-72 divide-y divide-paper-200 overflow-y-auto">
              {live.length === 0 && <p className="p-8 text-center text-sm text-slate-500">Nothing has happened yet.</p>}
              {live.map((r) => (
                <div key={r.log_id} className={`flex items-center gap-3 px-4 py-2 text-sm ${r.status === "failure" ? "bg-red-50/40" : ""}`}>
                  <span className="w-24 shrink-0 text-xs text-slate-400">{timeAgo(r.timestamp)}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-700">{r.description}</span>
                  <span className="hidden font-mono text-xs text-slate-400 sm:block">{r.ip}</span>
                  <StatusPill ok={r.status === "success"} />
                </div>
              ))}
            </div>
          </div>

          <div className="card overflow-x-auto !p-0">
            <table className="w-full text-left text-sm">
              <thead className="bg-paper-100 text-xs text-slate-500">
                <tr><th className="p-3 font-medium">User</th><th className="font-medium">Status</th><th className="font-medium">Logins</th><th className="font-medium">Failed</th><th className="font-medium">Uploads</th><th className="font-medium">Downloads</th><th className="font-medium">Shares</th><th className="font-medium">Denied</th><th className="font-medium">Last login</th><th className="font-medium">Last IP</th><th className="pr-3 font-medium">Risk</th></tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.user_id} onClick={() => setSel(u)} className={`cursor-pointer border-b border-paper-200 last:border-0 hover:bg-brand-50/40 ${sel?.user_id === u.user_id ? "bg-brand-50/60" : ""}`}>
                    <td className="p-3"><span className="flex items-center gap-2.5"><Avatar name={u.name} size={32} />
                      <span><span className="flex items-center gap-1.5 font-medium text-ink-950">{u.name}{u.roles.includes("admin") && <span className="rounded bg-ink-900 px-1.5 py-px text-[10px] font-semibold text-white">ADMIN</span>}{!u.active && <span className="rounded bg-slate-200 px-1.5 py-px text-[10px] font-semibold text-slate-600">DISABLED</span>}</span>
                        <span className="text-xs text-slate-500">{u.email}</span></span></span></td>
                    <td><span className="flex items-center gap-1.5 text-xs text-slate-600"><Led tone={u.online ? "on" : "off"} pulse={u.online} />{u.online ? "Online" : u.last_activity ? timeAgo(u.last_activity) : "never"}</span></td>
                    <td className="tabular">{u.logins}</td><td className={`tabular ${u.failed_logins ? "font-semibold text-red-600" : ""}`}>{u.failed_logins}</td>
                    <td className="tabular">{u.uploads}</td><td className="tabular">{u.downloads}</td><td className="tabular">{u.shares}</td>
                    <td className={`tabular ${u.denied ? "font-semibold text-red-600" : ""}`}>{u.denied}</td>
                    <td className="whitespace-nowrap text-slate-600">{u.last_login ? formatStamp(u.last_login) : "-"}</td>
                    <td className="font-mono text-xs text-slate-600">{u.last_ip || "-"}</td>
                    <td className="pr-3"><span className={`rounded-md px-2 py-0.5 text-xs font-semibold capitalize ${RISK[u.risk]}`}>{u.risk}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {sel && (
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3"><Avatar name={sel.name} size={40} /><div><div className="font-display text-lg font-bold text-ink-950">{sel.name}</div><div className="text-xs text-slate-500">{sel.email} · activity timeline</div></div></div>
            <button className="rounded-lg p-2 text-slate-400 hover:bg-paper-100" onClick={() => setSel(null)}><X size={18} /></button>
          </div>
          {detail === null ? <p className="py-8 text-center text-sm text-slate-500">Loading...</p> : detail === false ? <p className="py-8 text-center text-sm text-red-600">Could not load this user.</p> : (
            <div className="grid gap-5 lg:grid-cols-5">
              <div className="h-64 lg:col-span-2">
                <ResponsiveContainer>
                  <BarChart data={detail.series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e9f4" vertical={false} />
                    <XAxis dataKey="day" tickFormatter={(d) => d.slice(5)} {...axis} /><YAxis allowDecimals={false} {...axis} /><Tooltip /><Legend iconType="circle" />
                    <Bar dataKey="logins" stackId="a" fill={C.primary} /><Bar dataKey="uploads" stackId="a" fill="#10b981" /><Bar dataKey="downloads" stackId="a" fill="#8b5cf6" /><Bar dataKey="shares" stackId="a" fill="#f59e0b" /><Bar dataKey="denied" stackId="a" fill="#e5484d" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="max-h-64 overflow-y-auto lg:col-span-3">
                <table className="w-full text-left text-sm">
                  <tbody>
                    {detail.rows.map((r) => (
                      <tr key={r.log_id} className="border-b border-paper-200 last:border-0">
                        <td className="whitespace-nowrap py-2 pr-3 text-xs text-slate-500">{formatStamp(r.timestamp)}</td>
                        <td className="py-2 pr-3 text-slate-700">{r.description}</td>
                        <td className="py-2"><StatusPill ok={r.status === "success"} /></td>
                      </tr>
                    ))}
                    {detail.rows.length === 0 && <tr><td className="py-8 text-center text-slate-500"><Activity size={18} className="mx-auto mb-1" />No activity in this period.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
