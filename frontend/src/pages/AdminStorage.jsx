// Admin → Storage Analytics (Milestone 3, Task 5): real storage numbers, per-user usage and upload / download / sharing charts with filters.
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Database, Download, Files, Share2, Users } from "lucide-react";
import api, { errorMessage } from "../lib/api";
import { formatBytes, formatNumber } from "../lib/format";
import { C } from "../lib/theme";
import FileTile, { TYPE_LABEL } from "../components/FileTile";
import { Field, inputCls } from "../components/filters";
import { Avatar, DateRangeFilter, EmptyState, PageHeader, ProgressBar, StatCard } from "../components/ui";

const axis = { fontSize: 11, tickLine: false, axisLine: false, tick: { fill: "#64748b" } };
const grid = <CartesianGrid strokeDasharray="3 3" stroke="#e2e9f4" vertical={false} />;
const day = (d) => new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const PIE = ["#7c3aed", "#e5484d", "#10b981", "#f59e0b", "#06b6d4", "#8b5cf6", "#f0506e", "#64748b"];

function Panel({ title, sub, children, className = "" }) {
  return <div className={`card ${className}`}><h2 className="font-display text-lg font-bold text-ink-950">{title}</h2>{sub && <p className="mb-2 text-xs text-slate-500">{sub}</p>}<div className="mt-2">{children}</div></div>;
}

export default function AdminStorage() {
  const [range, setRange] = useState({ days: 30 });
  const [user, setUser] = useState("");
  const [fileType, setFileType] = useState("");
  const [activity, setActivity] = useState("");
  const [d, setD] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    api.get("/analytics/overview", { params: { ...range, user: user || undefined, file_type: fileType || undefined, activity_type: activity || undefined } })
      .then((r) => setD(r.data)).catch(async (e) => setError(await errorMessage(e)));
  }, [range, fileType, activity]);   // user is applied with the Enter key / blur below
  const applyUser = () => api.get("/analytics/overview", { params: { ...range, user: user || undefined, file_type: fileType || undefined, activity_type: activity || undefined } }).then((r) => setD(r.data));

  const t = d?.totals;
  const platPct = t ? Math.min((t.platform_used_bytes / t.capacity_bytes) * 100, 100) : 0;
  const pct = t ? Math.min((t.storage_bytes / t.capacity_bytes) * 100, 100) : 0;
  const pie = d ? d.users_storage.slice(0, 7).map((u) => ({ name: u.name, value: u.bytes })).concat(d.users_storage.length > 7 ? [{ name: "Others", value: d.users_storage.slice(7).reduce((s, u) => s + u.bytes, 0) }] : []) : [];

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader title="Storage Analytics" subtitle="How much space is used, by whom, and how files are uploaded, downloaded and shared. Every number comes from the real database.">
        <DateRangeFilter value={range} onChange={setRange} range={d?.range} />
      </PageHeader>
      <div className="card !p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="User (e-mail or ID)"><input className={`${inputCls} w-56`} value={user} onChange={(e) => setUser(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applyUser()} onBlur={applyUser} placeholder="all users" /></Field>
          <Field label="File type"><select className={`${inputCls} w-44`} value={fileType} onChange={(e) => setFileType(e.target.value)}><option value="">All types</option>{Object.entries(TYPE_LABEL).filter(([k]) => k !== "other").map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Activity type"><select className={`${inputCls} w-40`} value={activity} onChange={(e) => setActivity(e.target.value)}><option value="">All activity</option><option value="upload">Uploads</option><option value="download">Downloads</option><option value="share">Sharing</option></select></Field>
          {(user || fileType || activity) && <button className="btn-secondary !py-2" onClick={() => { setUser(""); setFileType(""); setActivity(""); setTimeout(applyUser, 0); }}>Clear filters</button>}
        </div>
      </div>
      {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {!d ? <p className="py-20 text-center text-slate-500">{error ? "" : "Calculating..."}</p> : (
        <>
          {/* the 1 GB limit: big gauge, warning levels and a forecast */}
          <div className="control-room relative overflow-hidden rounded-[28px] p-6 text-white sm:p-8">
            <div className="bg-grid pointer-events-none absolute inset-0 opacity-40" />
            <div className="relative grid items-center gap-6 lg:grid-cols-[auto_1fr_auto]">
              <div className="relative h-44 w-44">
                <svg viewBox="0 0 120 120" className="-rotate-90"><circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="12" />
                  <circle cx="60" cy="60" r="50" fill="none" strokeWidth="12" strokeLinecap="round" stroke={platPct >= t.critical_percent ? "#ff7a93" : platPct >= t.warn_percent ? "#fbbf24" : "#ffffff"}
                    strokeDasharray={2 * Math.PI * 50} strokeDashoffset={2 * Math.PI * 50 * (1 - Math.min(platPct, 100) / 100)} style={{ transition: "stroke-dashoffset 1.2s ease" }} /></svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center"><div className="font-display text-4xl font-extrabold tabular">{platPct.toFixed(platPct < 10 ? 1 : 0)}%</div><div className="text-[11px] uppercase tracking-widest text-white/60">of the limit</div></div>
              </div>
              <div>
                <div className="font-mono text-xs uppercase tracking-[0.2em] text-white/60">Platform storage limit</div>
                <div className="font-display text-4xl font-extrabold">{formatBytes(t.platform_used_bytes)} <span className="text-white/50">/ {formatBytes(t.capacity_bytes)}</span></div>
                <p className="mt-1 text-sm text-white/75">{formatBytes(Math.max(t.capacity_bytes - t.platform_used_bytes, 0))} free. Each user can also use up to {formatBytes(t.capacity_bytes)}. Files in the Trash still count until they are deleted.</p>
                <div className="relative mt-4 h-3 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full rounded-full bg-white/90 transition-all duration-1000" style={{ width: `${Math.min(platPct, 100)}%` }} />
                  <span className="absolute inset-y-0 w-px bg-amber-300" style={{ left: `${t.warn_percent}%` }} title={`warning at ${t.warn_percent}%`} />
                  <span className="absolute inset-y-0 w-px bg-red-300" style={{ left: `${t.critical_percent}%` }} title={`critical at ${t.critical_percent}%`} />
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-white/50"><span>0</span><span>warning {t.warn_percent}%</span><span>critical {t.critical_percent}%</span></div>
              </div>
              <div className="rounded-2xl bg-white/10 p-4 text-center ring-1 ring-white/15 backdrop-blur">
                <div className="text-[11px] font-medium uppercase tracking-wider text-white/60">Forecast</div>
                <div className="font-display text-3xl font-extrabold tabular">{t.days_until_full === null ? "∞" : `${t.days_until_full}d`}</div>
                <div className="text-xs text-white/70">{t.days_until_full === null ? "no growth lately" : "until the limit at the current pace"}</div>
                <div className="mt-1 text-[11px] text-white/50">+{formatBytes(t.growth_bytes_per_day)}/day (14-day average)</div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard icon={Database} label="Total storage used" value={formatBytes(t.storage_bytes)} sub={`of ${formatBytes(t.capacity_bytes)} (${pct.toFixed(1)}%)`}><ProgressBar pct={pct} /></StatCard>
            <StatCard icon={Files} tone="sky" label="Total uploaded files" value={formatNumber(t.files)} sub={`${t.uploaded_in_range} in this period`} />
            <StatCard icon={Download} tone="violet" label="Total downloaded files" value={formatNumber(t.downloads)} sub="in this period" />
            <StatCard icon={Share2} tone="amber" label="Total shared files" value={formatNumber(t.shared_files)} />
            <StatCard icon={Users} tone="green" label="Users with files" value={formatNumber(t.users_with_files)} />
          </div>

          <div className="grid gap-5 lg:grid-cols-5">
            <Panel title="Storage usage by user" sub="Share of all stored bytes" className="lg:col-span-2">
              {pie.length === 0 ? <EmptyState title="No files" /> : (
                <div className="h-64"><ResponsiveContainer><PieChart><Pie data={pie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} stroke="none">{pie.map((p, i) => <Cell key={p.name} fill={PIE[i % PIE.length]} />)}</Pie><Tooltip formatter={(v) => formatBytes(v)} /><Legend iconType="circle" /></PieChart></ResponsiveContainer></div>
              )}
            </Panel>
            <Panel title="User-wise storage" sub="Actual values from the database" className="overflow-x-auto lg:col-span-3">
              <table className="w-full text-left text-sm">
                <thead className="bg-paper-100 text-xs text-slate-500"><tr><th className="rounded-l-lg p-2.5 font-medium">User</th><th className="font-medium">Files uploaded</th><th className="font-medium">Storage used</th><th className="rounded-r-lg font-medium">Share</th></tr></thead>
                <tbody>
                  {d.users_storage.length === 0 && <tr><td colSpan="4" className="py-8 text-center text-slate-500">No files match.</td></tr>}
                  {d.users_storage.slice(0, 10).map((u) => (
                    <tr key={u.user_id} className="border-b border-paper-200 last:border-0">
                      <td className="p-2.5"><span className="flex items-center gap-2"><Avatar name={u.name} size={28} /><span><span className="block font-medium text-ink-950">{u.name}</span><span className="text-xs text-slate-500">{u.email}</span></span></span></td>
                      <td className="tabular text-slate-700">{u.files}</td><td className="tabular font-semibold text-ink-950">{formatBytes(u.bytes)}</td>
                      <td className="w-40"><div className="flex items-center gap-2"><div className="flex-1"><ProgressBar warn={false} height="h-1.5" pct={u.percent} /></div><span className="w-10 text-right text-xs tabular text-slate-500">{u.percent}%</span></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="File uploads by date"><div className="h-64"><ResponsiveContainer><BarChart data={d.uploads_series}>{grid}<XAxis dataKey="day" tickFormatter={day} interval="preserveStartEnd" {...axis} /><YAxis allowDecimals={false} {...axis} /><Tooltip /><Bar name="Files uploaded" dataKey="uploads" fill={C.primary} radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div></Panel>
            <Panel title="File downloads"><div className="h-64"><ResponsiveContainer><LineChart data={d.downloads_series}>{grid}<XAxis dataKey="day" tickFormatter={day} interval="preserveStartEnd" {...axis} /><YAxis allowDecimals={false} {...axis} /><Tooltip /><Legend iconType="circle" />
              <Line name="All downloads" dataKey="downloads" stroke={C.primary} strokeWidth={2.5} dot={{ r: 2.5 }} /><Line name="Through share links" dataKey="via_link" stroke="#e5484d" strokeWidth={2} dot={{ r: 2.5 }} /></LineChart></ResponsiveContainer></div></Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Panel title="File-sharing statistics" className="lg:col-span-2">
              <div className="h-56"><ResponsiveContainer><BarChart data={d.sharing_series}>{grid}<XAxis dataKey="day" tickFormatter={day} interval="preserveStartEnd" {...axis} /><YAxis allowDecimals={false} {...axis} /><Tooltip /><Legend iconType="circle" />
                <Bar name="Links created" dataKey="links" stackId="s" fill="#10b981" /><Bar name="Given to people" dataKey="people" stackId="s" fill="#8b5cf6" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">{Object.entries(d.links).map(([k, v]) => <span key={k} className="rounded-full bg-paper-100 px-3 py-1 capitalize text-slate-600">{k}: <b className="text-ink-950">{v}</b></span>)}</div>
            </Panel>
            <Panel title="Most frequently downloaded">
              {d.top_downloads.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No downloads in this period.</p> : d.top_downloads.map((f, i) => (
                <div key={f.file} className="flex items-center gap-3 border-b border-paper-200 py-2 last:border-0"><span className="w-4 font-mono text-xs text-slate-400">{i + 1}</span><span className="min-w-0 flex-1 truncate text-sm text-ink-950">{f.file}</span><span className="tabular text-sm font-semibold">{f.downloads}</span></div>
              ))}
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Storage by file type">{d.by_type.map((x) => (
              <div key={x.type} className="mb-2.5"><div className="mb-1 flex justify-between text-sm"><span>{TYPE_LABEL[x.type] || x.type} <span className="text-slate-400">· {x.files} file{x.files === 1 ? "" : "s"}</span></span><span className="tabular font-semibold">{formatBytes(x.bytes)}</span></div><ProgressBar warn={false} height="h-1.5" pct={t.storage_bytes ? (x.bytes / t.storage_bytes) * 100 : 0} /></div>
            ))}{d.by_type.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No files.</p>}</Panel>
            <Panel title="Largest files">{d.largest.map((f) => (
              <div key={f.name + f.owner} className="flex items-center gap-3 border-b border-paper-200 py-2 last:border-0"><FileTile category={f.category} size={32} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-ink-950">{f.name}</div><div className="text-xs text-slate-500">{f.owner}</div></div><span className="tabular text-sm font-semibold">{formatBytes(f.size_bytes)}</span></div>
            ))}{d.largest.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No files.</p>}</Panel>
          </div>
        </>
      )}
    </div>
  );
}
