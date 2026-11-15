// Admin → Reports (Milestone 3, Task 4): file upload, download, sharing and security reports with filters, charts, tables and CSV export.
import { useEffect, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import api, { errorMessage } from "../lib/api";
import { formatBytes, formatNumber, formatStamp } from "../lib/format";
import { C } from "../lib/theme";
import { ExportButton, Field, FilterBar, StatusPill, inputCls } from "../components/filters";
import { EmptyState, PageHeader, Segmented } from "../components/ui";

const axis = { fontSize: 11, tickLine: false, axisLine: false, tick: { fill: "#64748b" } };
const grid = <CartesianGrid strokeDasharray="3 3" stroke="#e2e9f4" vertical={false} />;
const day = (d) => new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const EMPTY = { user: "", file: "", status: "", activity_type: "", date_from: "", date_to: "" };

function Kpi({ label, value, tone = "text-ink-950", sub }) {
  return <div className="card !p-4"><div className="text-xs text-slate-500">{label}</div><div className={`font-display text-3xl font-extrabold tabular ${tone}`}>{value}</div>{sub && <div className="text-xs text-slate-400">{sub}</div>}</div>;
}
function Panel({ title, children, className = "" }) {
  return <div className={`card ${className}`}><h2 className="mb-3 font-display text-lg font-bold text-ink-950">{title}</h2>{children}</div>;
}
function Ranking({ rows, labelKey, valueKey = "count", color = C.primary }) {
  const max = Math.max(...rows.map((r) => r[valueKey]), 1);
  if (!rows.length) return <p className="py-6 text-center text-sm text-slate-500">No data in this period.</p>;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r[labelKey]}>
          <div className="mb-1 flex justify-between text-sm"><span className="max-w-[70%] truncate text-slate-700">{r[labelKey]}</span><span className="tabular font-semibold text-ink-950">{r[valueKey]}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-paper-200"><div className="h-full rounded-full" style={{ width: `${(r[valueKey] / max) * 100}%`, background: color }} /></div>
        </div>
      ))}
    </div>
  );
}
function Table({ cols, rows, empty = "No records." }) {
  return (
    <div className="max-h-96 overflow-auto">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-paper-100 text-xs text-slate-500"><tr>{cols.map((c) => <th key={c.k} className="p-2.5 font-medium">{c.h}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={cols.length} className="py-8 text-center text-slate-500">{empty}</td></tr>}
          {rows.map((r, i) => <tr key={i} className="border-b border-paper-200 last:border-0">{cols.map((c) => <td key={c.k} className="p-2.5 text-slate-700">{c.f ? c.f(r[c.k], r) : r[c.k] ?? "-"}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}
const when = (v) => <span className="whitespace-nowrap text-slate-600">{formatStamp(v)}</span>;
const status = (v) => <StatusPill ok={v === "success"} />;

function Uploads({ d }) {
  return (<>
    <div className="grid gap-4 sm:grid-cols-4"><Kpi label="Total files uploaded" value={formatNumber(d.total)} /><Kpi label="Failed / blocked uploads" value={formatNumber(d.failed)} tone="text-red-600" /><Kpi label="Data uploaded" value={formatBytes(d.total_bytes)} /><Kpi label="File types" value={d.by_type.length} sub={d.by_type.slice(0, 4).map((t) => t.type).join(" · ")} /></div>
    <div className="grid gap-5 lg:grid-cols-3">
      <Panel title="Uploads per day" className="lg:col-span-2"><div className="h-64"><ResponsiveContainer><BarChart data={d.series}>{grid}<XAxis dataKey="day" tickFormatter={day} interval="preserveStartEnd" {...axis} /><YAxis allowDecimals={false} {...axis} /><Tooltip /><Legend iconType="circle" />
        <Bar name="Successful" dataKey="success" stackId="u" fill={C.primary} /><Bar name="Failed" dataKey="failed" stackId="u" fill="#e5484d" /></BarChart></ResponsiveContainer></div></Panel>
      <Panel title="Files uploaded by each user"><Ranking rows={d.by_user} labelKey="user" /></Panel>
    </div>
    <Panel title="Upload records"><Table rows={d.rows} cols={[{ k: "time", h: "Date & time", f: when }, { k: "user", h: "User" }, { k: "file", h: "File" }, { k: "type", h: "Type" }, { k: "size_bytes", h: "Size", f: (v) => (v ? formatBytes(v) : "-") }, { k: "status", h: "Status", f: status }, { k: "note", h: "Note" }]} /></Panel>
  </>);
}

function Downloads({ d }) {
  return (<>
    <div className="grid gap-4 sm:grid-cols-3"><Kpi label="Total downloads" value={formatNumber(d.total)} /><Kpi label="Unique downloaders" value={formatNumber(d.unique_users)} /><Kpi label="Failed download attempts" value={formatNumber(d.failed)} tone="text-red-600" /></div>
    <div className="grid gap-5 lg:grid-cols-3">
      <Panel title="Downloads per day" className="lg:col-span-2"><div className="h-64"><ResponsiveContainer><AreaChart data={d.series}>{grid}<XAxis dataKey="day" tickFormatter={day} interval="preserveStartEnd" {...axis} /><YAxis allowDecimals={false} {...axis} /><Tooltip /><Legend iconType="circle" />
        <Area name="Successful" dataKey="success" stroke={C.primary} fill={C.primary} fillOpacity={0.18} strokeWidth={2} /><Area name="Failed" dataKey="failed" stroke="#e5484d" fill="#e5484d" fillOpacity={0.15} strokeWidth={2} /></AreaChart></ResponsiveContainer></div></Panel>
      <Panel title="Most downloaded files"><Ranking rows={d.top_files} labelKey="file" color="#8b5cf6" /></Panel>
    </div>
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="Downloads by each user"><Ranking rows={d.by_user} labelKey="user" color="#10b981" /></Panel>
      <Panel title="Failed download attempts"><Table rows={d.failed_rows} empty="No failed downloads." cols={[{ k: "time", h: "When", f: when }, { k: "user", h: "User" }, { k: "file", h: "File" }, { k: "reason", h: "Why" }, { k: "ip", h: "IP" }]} /></Panel>
    </div>
    <Panel title="Download records"><Table rows={d.rows} cols={[{ k: "time", h: "Date & time", f: when }, { k: "user", h: "User" }, { k: "file", h: "File" }, { k: "via", h: "Via" }, { k: "status", h: "Status", f: status }, { k: "ip", h: "IP" }]} /></Panel>
  </>);
}

function Sharing({ d }) {
  const pie = Object.entries(d.links).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  const col = { active: "#10b981", expired: "#94a3b8", revoked: "#e5484d", exhausted: "#f59e0b", unavailable: "#8b5cf6" };
  return (<>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Kpi label="Total files shared" value={d.files_shared} /><Kpi label="People given access" value={d.people_shares} /><Kpi label="Active links" value={d.links.active} tone="text-emerald-600" /><Kpi label="Expired links" value={d.links.expired} /><Kpi label="Revoked links" value={d.links.revoked} tone="text-red-600" /></div>
    <div className="grid gap-5 lg:grid-cols-3">
      <Panel title="Link status">{pie.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">No links yet.</p> : <div className="h-56"><ResponsiveContainer><PieChart><Pie data={pie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} stroke="none" paddingAngle={2}>{pie.map((p) => <Cell key={p.name} fill={col[p.name]} />)}</Pie><Tooltip /><Legend iconType="circle" /></PieChart></ResponsiveContainer></div>}</Panel>
      <Panel title="Files shared by each user" className="lg:col-span-2"><Ranking rows={d.by_user} labelKey="user" color="#f59e0b" /></Panel>
    </div>
    <Panel title="Sharing recipients"><Table rows={d.recipients} empty="Nothing shared with people yet." cols={[{ k: "file", h: "File" }, { k: "shared_by", h: "Shared by" }, { k: "recipient", h: "Recipient" }, { k: "access", h: "Access" }, { k: "when", h: "When", f: when }]} /></Panel>
    <Panel title="Sharing links"><Table rows={d.link_rows} empty="No links yet." cols={[{ k: "file", h: "File" }, { k: "shared_by", h: "Created by" }, { k: "status", h: "Status", f: (v) => <span className="capitalize">{v}</span> }, { k: "expires", h: "Expires", f: when }, { k: "downloads", h: "Downloads", f: (v, r) => `${v}${r.max_downloads ? ` / ${r.max_downloads}` : ""}` }, { k: "view_only", h: "Access", f: (v) => (v ? "view only" : "download") }]} /></Panel>
  </>);
}

function Security({ d }) {
  const sev = { high: "bg-red-50 text-red-600", medium: "bg-amber-50 text-amber-600", low: "bg-emerald-50 text-emerald-600" };
  return (<>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6"><Kpi label="Failed logins" value={formatNumber(d.failed_logins)} tone="text-red-600" /><Kpi label="Unauthorized attempts" value={formatNumber(d.unauthorized_attempts)} tone="text-amber-600" /><Kpi label="Suspicious downloads" value={formatNumber(d.suspicious_downloads)} /><Kpi label="Expired-link attempts" value={formatNumber(d.expired_link_attempts)} /><Kpi label="Revoked-link attempts" value={formatNumber(d.revoked_link_attempts)} /><Kpi label="Alerts generated" value={formatNumber(d.alerts_total)} tone="text-red-600" /></div>
    <div className="grid gap-5 lg:grid-cols-3">
      <Panel title="Hostile activity per day" className="lg:col-span-2"><div className="h-64"><ResponsiveContainer><LineChart data={d.series}>{grid}<XAxis dataKey="day" tickFormatter={day} interval="preserveStartEnd" {...axis} /><YAxis allowDecimals={false} {...axis} /><Tooltip /><Legend iconType="circle" />
        <Line name="Failed logins" dataKey="failed_logins" stroke={C.primary} strokeWidth={2.5} dot={{ r: 2.5 }} /><Line name="Unauthorized" dataKey="unauthorized" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2.5 }} /><Line name="Blocked" dataKey="blocked" stroke="#e5484d" strokeWidth={2} dot={{ r: 2.5 }} /></LineChart></ResponsiveContainer></div></Panel>
      <Panel title="Alerts by type"><div className="mb-3 flex gap-2">{Object.entries(d.alerts_by_severity).map(([k, v]) => <span key={k} className={`rounded-md px-2 py-0.5 text-xs font-semibold capitalize ${sev[k]}`}>{k} {v}</span>)}</div>
        <Ranking rows={d.alerts_by_type.map((a) => ({ ...a, type: a.type.replace(/_/g, " ") }))} labelKey="type" color="#e5484d" /></Panel>
    </div>
    <Panel title="Failed and denied activity"><Table rows={d.rows} empty="Nothing failed in this period." cols={[{ k: "time", h: "Date & time", f: when }, { k: "event", h: "Event", f: (v) => <span className="capitalize">{v.replace(/_/g, " ")}</span> }, { k: "user", h: "User" }, { k: "ip", h: "IP" }, { k: "description", h: "What happened" }]} /></Panel>
  </>);
}

export default function AdminReports() {
  const [tab, setTab] = useState("uploads");
  const [draft, setDraft] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const params = Object.fromEntries(Object.entries(applied).filter(([, v]) => v));

  useEffect(() => {
    setD(null); setError("");
    api.get(`/reports/${tab}`, { params }).then((r) => setD(r.data)).catch(async (e) => setError(await errorMessage(e)));
  }, [tab, applied]);   // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setDraft({ ...draft, [k]: e.target.value });
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader title="Reports" subtitle="File activity and security reports for investigation and review. Filter them, then export a CSV.">
        <ExportButton path={`/reports/${tab}`} params={params} filename={`${tab}_report.csv`} />
      </PageHeader>
      <Segmented value={tab} onChange={(v) => { setTab(v); }} options={[["uploads", "File uploads"], ["downloads", "File downloads"], ["sharing", "File sharing"], ["security", "Security"]]} />
      <FilterBar onApply={() => setApplied(draft)} onReset={() => { setDraft(EMPTY); setApplied(EMPTY); }}>
        <Field label={tab === "sharing" ? "Shared by (e-mail)" : "User (e-mail or ID)"}><input className={`${inputCls} w-52`} value={draft.user} onChange={set("user")} /></Field>
        <Field label="File name"><input className={`${inputCls} w-44`} value={draft.file} onChange={set("file")} /></Field>
        {tab === "uploads" && <Field label="Status"><select className={`${inputCls} w-32`} value={draft.status} onChange={set("status")}><option value="">Any</option><option value="success">Successful</option><option value="failure">Failed</option></select></Field>}
        {tab === "security" && <Field label="Activity type"><select className={`${inputCls} w-40`} value={draft.activity_type} onChange={set("activity_type")}><option value="">All</option>{["login", "download", "view", "share_access", "admin_access", "blocked_request", "upload"].map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select></Field>}
        <Field label="From"><input type="date" className={inputCls} value={draft.date_from} onChange={set("date_from")} /></Field>
        <Field label="To"><input type="date" className={inputCls} value={draft.date_to} onChange={set("date_to")} /></Field>
      </FilterBar>
      {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {!d ? <p className="py-16 text-center text-slate-500">{error ? "" : "Generating report..."}</p> : (
        <div className="space-y-5">{tab === "uploads" ? <Uploads d={d} /> : tab === "downloads" ? <Downloads d={d} /> : tab === "sharing" ? <Sharing d={d} /> : <Security d={d} />}</div>
      )}
      {d && tab !== "sharing" && d.total === 0 && tab !== "security" && <EmptyState title="No records in this period" text="Widen the dates or press Reset." />}
    </div>
  );
}
