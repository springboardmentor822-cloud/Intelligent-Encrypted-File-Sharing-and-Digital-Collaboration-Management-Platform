import { useEffect, useState } from "react";
import { Activity, AlertTriangle, Bell, CheckCircle2, ClipboardList, Database, Download, FileText, HardDrive, Link2, Mail, PieChart, RefreshCw, ScanLine, Share2, ShieldAlert, ShieldCheck, Users, XCircle, Zap } from "lucide-react";
import { api, errMsg, fmtBytes, fmtDate } from "../../api";
import { useDebounced, useFetch, useRange } from "../../hooks";
import { Badge, Empty, ErrorBox, Loading, Notice, PageHeader, Pagination, RangeSelect, Section, Spinner, StatCard, Table, sevTone, statusTone } from "../../ui";
import { Donut, Lines, SimpleBars } from "../charts";

const FILE_TYPES = ["documents", "images", "videos", "others"];
const actLabel = (s: string) => (s || "").replace(/_/g, " ");
const PIE = ["#450a0a", "#7f1d1d", "#991b1b", "#b91c1c", "#dc2626", "#ef4444", "#f87171", "#5c0f0f"];

/** Shared user dropdown for admin filters. */
function useUsers() {
  const { data } = useFetch<any>("/admin/users", { page: 1, page_size: 100 });
  return (data?.items || []) as any[];
}

function UserFilter({ value, onChange, users }: { value: string; onChange: (v: string) => void; users: any[] }) {
  return <select aria-label="Filter by user" className="input !w-auto" value={value} onChange={(e) => onChange(e.target.value)}>
    <option value="">All users</option>
    {users.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
  </select>;
}

/* ================= Activity Monitoring ================= */
export function AdminActivityMonitoring() {
  const r = useRange(30); const users = useUsers();
  const [uid, setUid] = useState(""); const [type, setType] = useState(""); const [status, setStatus] = useState("");
  const [q, setQ] = useState(""); const dq = useDebounced(q); const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [uid, type, status, dq, r.start, r.end]);
  const sum = useFetch<any>("/activity/summary", { start: r.start, end: r.end, user_id: uid || undefined });
  const types = useFetch<any>("/activity/types");
  const list = useFetch<any>("/activity/all", { start: r.start, end: r.end, user_id: uid || undefined, activity_type: type || undefined, status: status || undefined, q: dq || undefined, page, page_size: 25 });
  const s = sum.data;
  return <>
    <PageHeader title="User Activity Monitoring" subtitle="Every sign-in, upload, download, share and access attempt, recorded with user, file, status, IP and timestamp."
      actions={<RangeSelect r={r} />} />
    {sum.error ? <ErrorBox message={sum.error} onRetry={sum.reload} /> : !s ? <Loading /> : <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Activity className="h-6 w-6 text-brand-600" />} tint="bg-brand-50" label="Total activities" value={s.total} sub="in selected range" />
        <StatCard icon={<CheckCircle2 className="h-6 w-6 text-emerald-600" />} tint="bg-emerald-50" label="Successful" value={s.by_status.success || 0} sub="completed actions" />
        <StatCard icon={<XCircle className="h-6 w-6 text-red-500" />} tint="bg-red-50" label="Failed / denied" value={(s.by_status.failed || 0) + (s.by_status.denied || 0)} sub="blocked or errored" />
        <StatCard icon={<FileText className="h-6 w-6 text-violet-600" />} tint="bg-violet-50" label="Activity types" value={Object.keys(s.by_type).length} sub="distinct event kinds" />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Section title="Activity volume"><Lines area data={s.by_day} keys={["count"]} colors={{ count: "#991b1b" }} names={{ count: "Activities" }} empty="No activity in this period" /></Section>
        <Section title="Breakdown by type"><SimpleBars data={Object.entries(s.by_type).map(([k, v]) => ({ type: actLabel(k), count: v as number })).sort((a, b) => b.count - a.count).slice(0, 10)} xKey="type" yKey="count" /></Section>
      </div>
    </>}
    <div className="card mt-5">
      <div className="flex flex-wrap gap-2 p-4">
        <input aria-label="Search activity" className="input !w-56" placeholder="Search user, file, type…" value={q} onChange={(e) => setQ(e.target.value)} />
        <UserFilter value={uid} onChange={setUid} users={users} />
        <select aria-label="Activity type" className="input !w-auto" value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{(types.data?.types || []).map((t: string) => <option key={t} value={t}>{actLabel(t)}</option>)}</select>
        <select aria-label="Status" className="input !w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option><option value="success">Success</option><option value="failed">Failed</option><option value="denied">Denied</option></select>
      </div>
      {list.error ? <div className="p-4"><ErrorBox message={list.error} onRetry={list.reload} /></div> : list.loading && !list.data ? <Loading /> : <>
        <Table rowKey={(x: any) => x.id} rows={list.data.items} empty={<Empty title="No activity matches" />} cols={[
          { key: "id", header: "Activity ID", render: (x: any) => <span className="font-mono text-base">{x.activity_id}</span> },
          { key: "u", header: "User", render: (x: any) => <div><p className="font-semibold">{x.user_name || "—"}</p><p className="text-base text-slate-500">{x.user_email || "anonymous"}</p></div> },
          { key: "t", header: "Activity", render: (x: any) => <Badge tone={x.activity_type.includes("failed") || x.activity_type.includes("unauthorized") ? "red" : "blue"}>{actLabel(x.activity_type)}</Badge> },
          { key: "f", header: "File", render: (x: any) => x.file_name || (x.file_id ? <span className="font-mono text-base">{x.file_id.slice(0, 8)}</span> : "—") },
          { key: "s", header: "Status", render: (x: any) => <Badge tone={statusTone(x.status)}>{x.status}</Badge> },
          { key: "ip", header: "IP", render: (x: any) => x.ip || "—" },
          { key: "d", header: "Timestamp", render: (x: any) => fmtDate(x.created_at) }]} />
        <Pagination page={page} pageSize={25} total={list.data.total} onChange={setPage} /></>}
    </div>
  </>;
}

/* ================= Audit Logs ================= */
export function AdminAuditLogs() {
  const r = useRange(30); const users = useUsers();
  const [uid, setUid] = useState(""); const [type, setType] = useState(""); const [status, setStatus] = useState("");
  const [q, setQ] = useState(""); const dq = useDebounced(q); const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [uid, type, status, dq, r.start, r.end]);
  const types = useFetch<any>("/audit-logs/types");
  const list = useFetch<any>("/audit-logs", { start: r.start, end: r.end, user_id: uid || undefined, activity_type: type || undefined, status: status || undefined, q: dq || undefined, page, page_size: 25 });
  return <>
    <PageHeader title="Audit Logs" subtitle="Append-only, hash-chained record of security-relevant actions across authentication, files, sharing, access control and monitoring."
      actions={<RangeSelect r={r} />} />
    <div className="card">
      <div className="flex flex-wrap gap-2 p-4">
        <input aria-label="Search audit logs" className="input !w-56" placeholder="Search action, user, file…" value={q} onChange={(e) => setQ(e.target.value)} />
        <UserFilter value={uid} onChange={setUid} users={users} />
        <select aria-label="Activity type" className="input !w-auto" value={type} onChange={(e) => setType(e.target.value)}><option value="">All actions</option>{(types.data?.types || []).map((t: any) => <option key={t.action} value={t.action}>{t.action} ({t.count})</option>)}</select>
        <select aria-label="Status" className="input !w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option><option value="success">Success</option><option value="denied">Denied</option><option value="failure">Failure</option></select>
      </div>
      {list.error ? <div className="p-4"><ErrorBox message={list.error} onRetry={list.reload} /></div> : list.loading && !list.data ? <Loading /> : <>
        <Table rowKey={(x: any) => x.id} rows={list.data.items} empty={<Empty title="No audit entries match" />} cols={[
          { key: "id", header: "Log ID", render: (x: any) => <span className="font-mono text-base">{x.log_id}</span> },
          { key: "u", header: "User", render: (x: any) => <div><p className="font-semibold">{x.username || "—"}</p><p className="text-base text-slate-500">{x.email || "system"}</p></div> },
          { key: "a", header: "Activity type", render: (x: any) => <span className="font-mono text-base">{x.activity_type}</span> },
          { key: "f", header: "File", render: (x: any) => x.file_name || (x.file_id ? <span className="font-mono text-base">{x.file_id.slice(0, 8)}</span> : "—") },
          { key: "d", header: "Description", render: (x: any) => <span className="text-slate-600">{x.description}</span> },
          { key: "s", header: "Status", render: (x: any) => <Badge tone={x.status === "success" ? "green" : "red"}>{x.status}</Badge> },
          { key: "ip", header: "IP", render: (x: any) => x.ip || "—" },
          { key: "t", header: "Date & time", render: (x: any) => fmtDate(x.created_at) }]} />
        <Pagination page={page} pageSize={25} total={list.data.total} onChange={setPage} /></>}
    </div>
  </>;
}

/* ================= Reports ================= */
type ReportTab = "uploads" | "downloads" | "sharing" | "users" | "security";
const TABS: { id: ReportTab; label: string }[] = [
  { id: "uploads", label: "Uploads" }, { id: "downloads", label: "Downloads" }, { id: "sharing", label: "Sharing" },
  { id: "users", label: "User activity" }, { id: "security", label: "Security" },
];

export function AdminReports() {
  const r = useRange(30); const users = useUsers();
  const [tab, setTab] = useState<ReportTab>("uploads"); const [uid, setUid] = useState("");
  const { data, error, loading, reload } = useFetch<any>(`/reports/${tab}`, { start: r.start, end: r.end, user_id: uid || undefined });
  return <>
    <PageHeader title="File Activity Reports" subtitle="Upload, download, sharing, user-activity and security reports with date, user and file filters."
      actions={<><UserFilter value={uid} onChange={setUid} users={users} /><RangeSelect r={r} /></>} />
    <div className="mb-4 flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
      {TABS.map((t) => <button key={t.id} onClick={() => setTab(t.id)} className={`rounded-lg px-3 py-1.5 text-base font-semibold transition ${tab === t.id ? "bg-white text-navy-950 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>{t.label}</button>)}
    </div>
    {error ? <ErrorBox message={error} onRetry={reload} /> : loading && !data ? <Loading /> : data && <>
      {tab === "uploads" && <UploadReport d={data} />}
      {tab === "downloads" && <DownloadReport d={data} />}
      {tab === "sharing" && <SharingReport d={data} />}
      {tab === "users" && <UsersReport d={data} />}
      {tab === "security" && <SecurityReport d={data} />}
    </>}
  </>;
}

function UploadReport({ d }: { d: any }) {
  return <>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard icon={<Download className="h-6 w-6 text-brand-600" />} tint="bg-brand-50" label="Total uploads" value={d.total_uploads} />
      <StatCard icon={<HardDrive className="h-6 w-6 text-emerald-600" />} tint="bg-emerald-50" label="Bytes uploaded" value={fmtBytes(d.total_bytes)} />
      <StatCard icon={<Users className="h-6 w-6 text-lavender-600" />} tint="bg-lavender-50" label="Uploading users" value={(d.by_user || []).length} />
      <StatCard icon={<FileText className="h-6 w-6 text-violet-600" />} tint="bg-violet-50" label="File types" value={Object.keys(d.by_file_type || {}).length} />
    </div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <Section title="Uploads by day"><Lines area data={d.by_day} keys={["count"]} colors={{ count: "#991b1b" }} names={{ count: "Uploads" }} /></Section>
      <Section title="Uploads by file type"><SimpleBars data={Object.entries(d.by_file_type || {}).map(([k, v]) => ({ type: k, count: v as number }))} xKey="type" yKey="count" /></Section>
    </div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <Section title="Uploads per user"><Table rowKey={(x: any) => x.user_id || x.email || Math.random()} rows={d.by_user || []} empty={<Empty title="No uploads" />} cols={[{ key: "u", header: "User", render: (x: any) => x.name || x.email || "—" }, { key: "c", header: "Uploads", render: (x: any) => x.count }]} /></Section>
      <Section title="Recent uploads"><Table rowKey={(x: any) => x.id} rows={d.recent || []} empty={<Empty title="No uploads" />} cols={[{ key: "f", header: "File", render: (x: any) => x.file_name || "—" }, { key: "s", header: "Status", render: (x: any) => <Badge tone={statusTone(x.status)}>{x.status}</Badge> }, { key: "d", header: "When", render: (x: any) => fmtDate(x.created_at) }]} /></Section>
    </div>
  </>;
}

function DownloadReport({ d }: { d: any }) {
  return <>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard icon={<Download className="h-6 w-6 text-brand-600" />} tint="bg-brand-50" label="Total downloads" value={d.total_downloads} />
      <StatCard icon={<HardDrive className="h-6 w-6 text-emerald-600" />} tint="bg-emerald-50" label="Bytes downloaded" value={fmtBytes(d.total_bytes)} />
      <StatCard icon={<Users className="h-6 w-6 text-lavender-600" />} tint="bg-lavender-50" label="Downloading users" value={(d.by_user || []).length} />
      <StatCard icon={<XCircle className="h-6 w-6 text-red-500" />} tint="bg-red-50" label="Failed attempts" value={d.failed_attempts} />
    </div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <Section title="Downloads by day"><Lines area data={d.by_day} keys={["count"]} colors={{ count: "#dc2626" }} names={{ count: "Downloads" }} /></Section>
      <Section title="Most downloaded files"><Table rowKey={(x: any) => x.file_id} rows={d.most_downloaded || []} empty={<Empty title="No downloads" />} cols={[{ key: "f", header: "File", render: (x: any) => x.file_name || "—" }, { key: "c", header: "Downloads", render: (x: any) => x.count }]} /></Section>
    </div>
    <div className="mt-5"><Section title="Downloads per user"><Table rowKey={(x: any) => x.user_id || x.email || Math.random()} rows={d.by_user || []} empty={<Empty title="No downloads" />} cols={[{ key: "u", header: "User", render: (x: any) => x.name || x.email || "—" }, { key: "c", header: "Downloads", render: (x: any) => x.count }]} /></Section></div>
  </>;
}

function SharingReport({ d }: { d: any }) {
  return <>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard icon={<Share2 className="h-6 w-6 text-brand-600" />} tint="bg-brand-50" label="Total shares" value={d.total_shares} />
      <StatCard icon={<CheckCircle2 className="h-6 w-6 text-emerald-600" />} tint="bg-emerald-50" label="Active links" value={d.active_links} />
      <StatCard icon={<AlertTriangle className="h-6 w-6 text-amber-500" />} tint="bg-amber-50" label="Expired links" value={d.expired_links} />
      <StatCard icon={<XCircle className="h-6 w-6 text-red-500" />} tint="bg-red-50" label="Revoked links" value={d.revoked_links} />
    </div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <Section title="Shares by day"><Lines area data={d.by_day} keys={["count"]} colors={{ count: "#b91c1c" }} names={{ count: "Shares" }} /></Section>
      <Section title="Shares per owner"><Table rowKey={(x: any) => x.user_id || x.email || Math.random()} rows={d.by_user || []} empty={<Empty title="No shares" />} cols={[{ key: "u", header: "Owner", render: (x: any) => x.email || "—" }, { key: "c", header: "Shares", render: (x: any) => x.count }]} /></Section>
    </div>
    <div className="mt-5"><Section title="Recipients"><Table rowKey={(x: any) => x.user_id || x.email || Math.random()} rows={d.recipients || []} empty={<Empty title="No recipients" />} cols={[{ key: "u", header: "Recipient", render: (x: any) => x.email || "—" }, { key: "c", header: "Files received", render: (x: any) => x.count }]} /></Section></div>
  </>;
}

function UsersReport({ d }: { d: any }) {
  return <>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <StatCard icon={<Users className="h-6 w-6 text-brand-600" />} tint="bg-brand-50" label="Users" value={(d.users || []).length} />
      <StatCard icon={<Activity className="h-6 w-6 text-emerald-600" />} tint="bg-emerald-50" label="Total events" value={d.total_events} />
      <StatCard icon={<Zap className="h-6 w-6 text-violet-600" />} tint="bg-violet-50" label="Most active" value={(d.users || [])[0]?.total ?? 0} sub={(d.users || [])[0]?.email || "—"} />
    </div>
    <div className="mt-5 card"><Table rowKey={(x: any) => x.user_id} rows={d.users || []} empty={<Empty title="No users" />} cols={[
      { key: "u", header: "User", render: (x: any) => <div><p className="font-semibold">{x.name}</p><p className="text-base text-slate-500">{x.email}</p></div> },
      { key: "r", header: "Role", render: (x: any) => <Badge tone={x.role === "admin" ? "purple" : "blue"}>{x.role}</Badge> },
      { key: "t", header: "Total activities", render: (x: any) => x.total },
      { key: "b", header: "Top activity", render: (x: any) => { const e = Object.entries(x.by_type || {}).sort((a: any, b: any) => b[1] - a[1])[0] as any; return e ? `${actLabel(e[0])} (${e[1]})` : "—"; } }]} /></div>
  </>;
}

function SecurityReport({ d }: { d: any }) {
  return <>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard icon={<ShieldAlert className="h-6 w-6 text-red-500" />} tint="bg-red-50" label="Security events" value={d.total_events} />
      <StatCard icon={<Bell className="h-6 w-6 text-amber-500" />} tint="bg-amber-50" label="Alerts" value={d.total_alerts} />
      <StatCard icon={<AlertTriangle className="h-6 w-6 text-orange-500" />} tint="bg-orange-50" label="Open alerts" value={d.open_alerts} />
      <StatCard icon={<ShieldCheck className="h-6 w-6 text-emerald-600" />} tint="bg-emerald-50" label="Event categories" value={Object.keys(d.by_category || {}).length} />
    </div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <Section title="Security events by day"><Lines area data={d.by_day} keys={["count"]} colors={{ count: "#7f1d1d" }} names={{ count: "Events" }} /></Section>
      <Section title="Alerts by rule"><SimpleBars data={Object.entries(d.alerts_by_rule || {}).map(([k, v]) => ({ rule: actLabel(k), count: v as number }))} xKey="rule" yKey="count" /></Section>
    </div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <Section title="Events by category"><Table rowKey={(x: any) => x[0]} rows={Object.entries(d.by_category || {}).map(([k, v]) => [k, v])} empty={<Empty title="No events" />} cols={[{ key: "c", header: "Category", render: (x: any) => actLabel(x[0]) }, { key: "n", header: "Count", render: (x: any) => x[1] }]} /></Section>
      <Section title="Events by severity"><Table rowKey={(x: any) => x[0]} rows={Object.entries(d.by_severity || {}).map(([k, v]) => [k, v])} empty={<Empty title="No events" />} cols={[{ key: "s", header: "Severity", render: (x: any) => <Badge tone={sevTone(x[0])}>{x[0]}</Badge> }, { key: "n", header: "Count", render: (x: any) => x[1] }]} /></Section>
    </div>
  </>;
}

/* ================= Storage Analytics ================= */
export function AdminStorageAnalytics() {
  const r = useRange(90); const users = useUsers();
  const [uid, setUid] = useState(""); const [ftype, setFtype] = useState(""); const [act, setAct] = useState("");
  const show = (k: string) => !act || act === k;   // activity-type filter: uploads | downloads | shares
  const q = { start: r.start, end: r.end, user_id: uid || undefined, file_type: ftype || undefined };
  const st = useFetch<any>("/analytics/storage", q);
  const us = useFetch<any>("/analytics/users/storage");
  const files = useFetch<any>("/analytics/files", q);
  const dl = useFetch<any>("/analytics/downloads", { start: r.start, end: r.end, user_id: uid || undefined });
  const sh = useFetch<any>("/analytics/sharing", { start: r.start, end: r.end, user_id: uid || undefined });
  if (st.error) return <ErrorBox message={st.error} onRetry={st.reload} />;
  if (!st.data) return <Loading />;
  const d = st.data;
  const topUsers = (d.by_user || []).slice(0, 7);
  const donut: { name: string; value: number; color: string }[] = topUsers.map((u: any, i: number) => ({ name: u.name || u.email || "Unknown", value: u.bytes, color: PIE[i % PIE.length] }));
  const rest = (d.by_user || []).slice(7).reduce((n: number, u: any) => n + u.bytes, 0);
  if (rest > 0) donut.push({ name: "Others", value: rest, color: "#f87171" });
  return <>
    <PageHeader title="Storage Analytics" subtitle="Total and per-user storage, file statistics, download trends and sharing distribution."
      actions={<><UserFilter value={uid} onChange={setUid} users={users} /><select aria-label="File type" className="input !w-auto" value={ftype} onChange={(e) => setFtype(e.target.value)}><option value="">All file types</option>{FILE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select><select aria-label="Activity type" className="input !w-auto" value={act} onChange={(e) => setAct(e.target.value)}><option value="">All activity</option><option value="uploads">Uploads</option><option value="downloads">Downloads</option><option value="shares">Sharing</option></select><RangeSelect r={r} /></>} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard icon={<Database className="h-6 w-6 text-brand-600" />} tint="bg-brand-50" label="Total storage" value={fmtBytes(d.total_bytes)} sub={`${d.total_files} files`} />
      <StatCard icon={<PieChart className="h-6 w-6 text-emerald-600" />} tint="bg-emerald-50" label="Quota utilisation" value={`${d.used_pct}%`} sub={`of ${fmtBytes(d.quota_bytes)}`} />
      <StatCard icon={<HardDrive className="h-6 w-6 text-lavender-600" />} tint="bg-lavender-50" label="Active files" value={d.total_files} sub={`${d.deleted_files} in trash`} />
      <StatCard icon={<Download className="h-6 w-6 text-violet-600" />} tint="bg-violet-50" label="Downloads" value={dl.data?.total_downloads ?? "—"} sub={dl.data ? fmtBytes(dl.data.total_bytes) : ""} />
    </div>
    <div className="mt-5 grid gap-5 lg:grid-cols-3">
      <Section title="Storage by user" className="lg:col-span-1">
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Donut data={donut} height={190} center={<div><p className="text-base font-bold">{fmtBytes(d.total_bytes)}</p><p className="text-[11px] text-slate-500">used</p></div>} />
          <ul className="space-y-1 text-base">{donut.map((x, i) => <li key={`${x.name}-${i}`} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: x.color }} /><span className="max-w-[9rem] truncate text-slate-600">{x.name}</span><span className="ml-auto font-semibold">{fmtBytes(x.value)}</span></li>)}</ul>
        </div>
      </Section>
      {show("uploads") && <Section title="Uploads by date" className="lg:col-span-2"><SimpleBars data={(d.series || []).map((x: any) => ({ date: x.date, files: x.files }))} xKey="date" yKey="files" empty="No uploads in this period" /></Section>}
    </div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      {show("downloads") && <Section title="Downloads over time">{dl.data ? <Lines area data={dl.data.series} keys={["count"]} colors={{ count: "#dc2626" }} names={{ count: "Downloads" }} /> : <Loading />}</Section>}
      {show("shares") && <Section title="Sharing activity">{sh.data ? <SimpleBars data={sh.data.series} xKey="date" yKey="count" empty="No shares in this period" /> : <Loading />}</Section>}
    </div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <Section title="Storage per user"><Table rowKey={(x: any) => x.user_id} rows={us.data?.users || []} empty={<Empty title="No users" />} cols={[
        { key: "u", header: "User", render: (x: any) => <div><p className="font-semibold">{x.name}</p><p className="text-base text-slate-500">{x.email}</p></div> },
        { key: "f", header: "Files", render: (x: any) => x.files },
        { key: "b", header: "Storage", render: (x: any) => fmtBytes(x.bytes) },
        { key: "p", header: "Quota used", render: (x: any) => <Badge tone={x.used_pct > 90 ? "red" : x.used_pct > 70 ? "amber" : "green"}>{x.used_pct}%</Badge> }]} /></Section>
      <Section title="File statistics">{files.data ? <><SimpleBars data={files.data.by_category.map((x: any) => ({ type: x.category, files: x.files }))} xKey="type" yKey="files" empty="No files" />
        <div className="mt-4"><Table rowKey={(x: any) => x.ext} rows={files.data.by_extension.slice(0, 8)} empty={<Empty title="No extensions" />} cols={[{ key: "e", header: "Extension", render: (x: any) => x.ext }, { key: "f", header: "Files", render: (x: any) => x.files }, { key: "b", header: "Size", render: (x: any) => fmtBytes(x.bytes) }]} /></div></> : <Loading />}</Section>
    </div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      {show("downloads") && <Section title="Most downloaded files"><Table rowKey={(x: any) => x.file_id} rows={dl.data?.top_files || []} empty={<Empty title="No downloads" />} cols={[{ key: "f", header: "File", render: (x: any) => x.name || "—" }, { key: "c", header: "Downloads", render: (x: any) => x.count }]} /></Section>}
      {show("shares") && <Section title="Most shared files"><Table rowKey={(x: any) => x.file_id} rows={sh.data?.top_files || []} empty={<Empty title="No shares" />} cols={[{ key: "f", header: "File", render: (x: any) => x.name || "—" }, { key: "c", header: "Shares", render: (x: any) => x.count }]} /></Section>}
    </div>
  </>;
}

/* ================= Notification Management ================= */
export function AdminNotifications() {
  const [uid, setUid] = useState(""); const [type, setType] = useState(""); const [sev, setSev] = useState("");
  const [read, setRead] = useState(""); const [page, setPage] = useState(1); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => setPage(1), [uid, type, sev, read]);
  const users = useUsers();
  const stats = useFetch<any>("/notifications/admin/stats");
  const list = useFetch<any>("/notifications/admin/all", { user_id: uid || undefined, type: type || undefined, severity: sev || undefined, read: read === "" ? undefined : read === "read", page, page_size: 25 });
  const run = async () => {
    setBusy(true); setMsg(null);
    try { const r = await api.post("/notifications/admin/run-expiry-reminders"); setMsg(`Expiry reminders sent: ${r.data.reminders_sent ?? 0}; expired shares processed: ${r.data.expired_processed ?? 0}.`); list.reload(); stats.reload(); }
    catch (e) { setMsg(errMsg(e)); } finally { setBusy(false); }
  };
  const s = stats.data;
  return <>
    <PageHeader title="Notification Management" subtitle="Sharing, download and security notifications delivered to users, with email status and expiry reminders."
      actions={<button className="btn-primary" onClick={run} disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}Run expiry reminders</button>} />
    {msg && <div className="mb-4"><Notice kind="success">{msg}</Notice></div>}
    {s && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard icon={<Bell className="h-6 w-6 text-brand-600" />} tint="bg-brand-50" label="Total notifications" value={s.total} />
      <StatCard icon={<Zap className="h-6 w-6 text-amber-500" />} tint="bg-amber-50" label="Unread" value={s.unread} />
      <StatCard icon={<Mail className="h-6 w-6 text-emerald-600" />} tint="bg-emerald-50" label="Emails sent" value={s.emails_sent} />
      <StatCard icon={<ShieldAlert className="h-6 w-6 text-red-500" />} tint="bg-red-50" label="Security alerts" value={(s.by_type.security_alert || 0) + (s.by_type.suspicious_activity || 0)} />
    </div>}
    <div className="mt-5 card">
      <div className="flex flex-wrap gap-2 p-4">
        <UserFilter value={uid} onChange={setUid} users={users} />
        <select aria-label="Type" className="input !w-auto" value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{["file_shared", "file_downloaded", "share_expiring", "share_expired", "security_alert", "suspicious_activity"].map((t) => <option key={t} value={t}>{actLabel(t)}</option>)}</select>
        <select aria-label="Severity" className="input !w-auto" value={sev} onChange={(e) => setSev(e.target.value)}><option value="">Any severity</option>{["info", "low", "medium", "high", "critical"].map((x) => <option key={x} value={x}>{x}</option>)}</select>
        <select aria-label="Read state" className="input !w-auto" value={read} onChange={(e) => setRead(e.target.value)}><option value="">Any state</option><option value="unread">Unread</option><option value="read">Read</option></select>
      </div>
      {list.error ? <div className="p-4"><ErrorBox message={list.error} onRetry={list.reload} /></div> : list.loading && !list.data ? <Loading /> : <>
        <Table rowKey={(x: any) => x.id} rows={list.data.items} empty={<Empty title="No notifications" />} cols={[
          { key: "id", header: "Notification ID", render: (x: any) => <span className="font-mono text-base">{x.notification_id}</span> },
          { key: "u", header: "User", render: (x: any) => x.user_email || "—" },
          { key: "t", header: "Title", render: (x: any) => <div><p className="font-semibold">{x.title}</p><p className="text-base text-slate-500">{x.message}</p></div> },
          { key: "ty", header: "Type", render: (x: any) => <Badge tone="blue">{actLabel(x.type)}</Badge> },
          { key: "sv", header: "Severity", render: (x: any) => <Badge tone={sevTone(x.severity)}>{x.severity}</Badge> },
          { key: "r", header: "State", render: (x: any) => <Badge tone={x.read ? "slate" : "red"}>{x.read ? "read" : "unread"}</Badge> },
          { key: "m", header: "Email", render: (x: any) => x.email_sent ? <Badge tone="green">sent</Badge> : <span className="text-base text-slate-400">—</span> },
          { key: "d", header: "Created", render: (x: any) => fmtDate(x.created_at) }]} />
        <Pagination page={page} pageSize={25} total={list.data.total} onChange={setPage} /></>}
    </div>
  </>;
}

/* ================= Security Monitoring & Suspicious Activity ================= */
export function AdminSecurityMonitoring() {
  const r = useRange(30); const users = useUsers();
  const [uid, setUid] = useState(""); const [rule, setRule] = useState(""); const [sev, setSev] = useState(""); const [status, setStatus] = useState("open");
  const [page, setPage] = useState(1); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => setPage(1), [uid, rule, sev, status, r.start, r.end]);
  const ov = useFetch<any>("/security-monitoring/overview", { start: r.start, end: r.end });
  const rules = useFetch<any>("/security-monitoring/rules");
  const alerts = useFetch<any>("/security-monitoring/suspicious", { start: r.start, end: r.end, user_id: uid || undefined, rule: rule || undefined, severity: sev || undefined, status: status || undefined, page, page_size: 20 });
  const scan = async () => {
    setBusy(true); setMsg(null);
    try { const res = await api.post("/security-monitoring/scan"); setMsg(`Scan complete — ${res.data.alerts_created} new alert(s) across ${res.data.rules?.length ?? 0} rules.`); ov.reload(); alerts.reload(); }
    catch (e) { setMsg(errMsg(e)); } finally { setBusy(false); }
  };
  const ack = async (id: number) => { try { await api.post(`/security-monitoring/alerts/${id}/acknowledge`); alerts.reload(); ov.reload(); } catch (e) { setMsg(errMsg(e)); } };
  const d = ov.data;
  return <>
    <PageHeader title="Security Monitoring" subtitle="Rule-based detection of repeated failed logins, unauthorized access, download bursts and expired/revoked link abuse."
      actions={<><RangeSelect r={r} /><button className="btn-primary" onClick={scan} disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : <ScanLine className="h-4 w-4" />}Run detection scan</button></>} />
    {msg && <div className="mb-4"><Notice kind="success">{msg}</Notice></div>}
    {ov.error ? <ErrorBox message={ov.error} onRetry={ov.reload} /> : !d ? <Loading /> : <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<XCircle className="h-6 w-6 text-red-500" />} tint="bg-red-50" label="Failed logins" value={d.totals.failed_logins} sub="repeated attempts monitored" />
        <StatCard icon={<ShieldAlert className="h-6 w-6 text-orange-500" />} tint="bg-orange-50" label="Unauthorized attempts" value={d.totals.unauthorized_attempts} sub="denied by access control" />
        <StatCard icon={<Download className="h-6 w-6 text-amber-500" />} tint="bg-amber-50" label="Suspicious downloads" value={d.totals.suspicious_downloads} sub="burst detection" />
        <StatCard icon={<Link2 className="h-6 w-6 text-violet-600" />} tint="bg-violet-50" label="Expired-link attempts" value={d.totals.expired_link_attempts} sub={`${d.totals.revoked_link_attempts} revoked-link`} />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Bell className="h-6 w-6 text-brand-600" />} tint="bg-brand-50" label="Open alerts" value={d.totals.open_alerts} sub={`${d.totals.alerts} total`} />
        <StatCard icon={<Activity className="h-6 w-6 text-lavender-600" />} tint="bg-lavender-50" label="Security events" value={d.totals.events} />
        <StatCard icon={<AlertTriangle className="h-6 w-6 text-red-500" />} tint="bg-red-50" label="High severity" value={(d.alerts_by_severity.high || 0) + (d.alerts_by_severity.critical || 0)} />
        <StatCard icon={<ShieldCheck className="h-6 w-6 text-emerald-600" />} tint="bg-emerald-50" label="Detection rules" value={rules.data?.rules?.length ?? 5} sub="active monitors" />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Section title="Alerts over time"><Lines area data={d.alerts_series} keys={["count"]} colors={{ count: "#7f1d1d" }} names={{ count: "Alerts" }} empty="No alerts in this period" /></Section>
        <Section title="Detection rules"><ul className="space-y-2 text-base">{(rules.data?.rules || []).map((x: any) => <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2"><div><p className="font-semibold">{x.label}</p><p className="text-base text-slate-500">{x.description}</p></div><Badge tone={sevTone(x.severity)}>{x.severity}</Badge></li>)}</ul></Section>
      </div>
    </>}
    <div className="card mt-5">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4">
        <h2 className="mr-auto font-bold text-navy-950">Suspicious activity alerts</h2>
        <UserFilter value={uid} onChange={setUid} users={users} />
        <select aria-label="Rule" className="input !w-auto" value={rule} onChange={(e) => setRule(e.target.value)}><option value="">All rules</option>{(rules.data?.rules || []).map((x: any) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
        <select aria-label="Severity" className="input !w-auto" value={sev} onChange={(e) => setSev(e.target.value)}><option value="">Any severity</option>{["low", "medium", "high", "critical"].map((x) => <option key={x} value={x}>{x}</option>)}</select>
        <select aria-label="Status" className="input !w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option><option value="open">Open</option><option value="acknowledged">Acknowledged</option></select>
      </div>
      {alerts.error ? <div className="p-4"><ErrorBox message={alerts.error} onRetry={alerts.reload} /></div> : alerts.loading && !alerts.data ? <Loading /> : <>
        <Table rowKey={(x: any) => x.id} rows={alerts.data.items} empty={<Empty title="No suspicious activity alerts" hint="Run a detection scan or adjust the filters." />} cols={[
          { key: "id", header: "Alert ID", render: (x: any) => <span className="font-mono text-base">{x.alert_id}</span> },
          { key: "u", header: "User", render: (x: any) => x.email || x.user_id?.slice(0, 8) || "—" },
          { key: "r", header: "Rule", render: (x: any) => <div><p className="font-semibold">{actLabel(x.rule || x.kind)}</p><p className="text-base text-slate-500">{x.description}</p></div> },
          { key: "s", header: "Severity", render: (x: any) => <Badge tone={sevTone(x.severity)}>{x.severity}</Badge> },
          { key: "t", header: "Time", render: (x: any) => fmtDate(x.created_at) },
          { key: "st", header: "Status", render: (x: any) => <Badge tone={x.status === "open" ? "red" : "green"}>{x.status}</Badge> },
          { key: "a", header: "Action", className: "text-right", render: (x: any) => x.status === "open" ? <button className="btn-secondary !py-1.5" onClick={() => ack(x.id)}>Acknowledge</button> : <span className="text-base text-slate-400">—</span> }]} />
        <Pagination page={page} pageSize={20} total={alerts.data.total} onChange={setPage} /></>}
    </div>
  </>;
}

/* ================= Suspicious Activity Alerts (focused) ================= */
export function AdminSuspiciousAlerts() {
  const r = useRange(30); const users = useUsers();
  const [uid, setUid] = useState(""); const [rule, setRule] = useState(""); const [sev, setSev] = useState(""); const [status, setStatus] = useState("");
  const [page, setPage] = useState(1); const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => setPage(1), [uid, rule, sev, status, r.start, r.end]);
  const rules = useFetch<any>("/security-monitoring/rules");
  const alerts = useFetch<any>("/security-monitoring/suspicious", { start: r.start, end: r.end, user_id: uid || undefined, rule: rule || undefined, severity: sev || undefined, status: status || undefined, page, page_size: 25 });
  const scan = async () => {
    setBusy(true); setMsg(null);
    try { const res = await api.post("/security-monitoring/scan"); setMsg(`Scan complete — ${res.data.alerts_created} new alert(s) created.`); alerts.reload(); }
    catch (e) { setMsg(errMsg(e)); } finally { setBusy(false); }
  };
  const ack = async (id: number) => { try { await api.post(`/security-monitoring/alerts/${id}/acknowledge`); alerts.reload(); } catch (e) { setMsg(errMsg(e)); } };
  return <>
    <PageHeader title="Suspicious Activity Alerts" subtitle="Alerts generated by detection rules, with severity, status and acknowledgement."
      actions={<><RangeSelect r={r} /><button className="btn-primary" onClick={scan} disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : <ScanLine className="h-4 w-4" />}Run scan</button></>} />
    {msg && <div className="mb-4"><Notice kind="success">{msg}</Notice></div>}
    <div className="card">
      <div className="flex flex-wrap gap-2 p-4">
        <UserFilter value={uid} onChange={setUid} users={users} />
        <select aria-label="Rule" className="input !w-auto" value={rule} onChange={(e) => setRule(e.target.value)}><option value="">All rules</option>{(rules.data?.rules || []).map((x: any) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
        <select aria-label="Severity" className="input !w-auto" value={sev} onChange={(e) => setSev(e.target.value)}><option value="">Any severity</option>{["low", "medium", "high", "critical"].map((x) => <option key={x} value={x}>{x}</option>)}</select>
        <select aria-label="Status" className="input !w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option><option value="open">Open</option><option value="acknowledged">Acknowledged</option></select>
      </div>
      {alerts.error ? <div className="p-4"><ErrorBox message={alerts.error} onRetry={alerts.reload} /></div> : alerts.loading && !alerts.data ? <Loading /> : <>
        <Table rowKey={(x: any) => x.id} rows={alerts.data.items} empty={<Empty title="No suspicious activity alerts" hint="Run a detection scan or adjust the filters." />} cols={[
          { key: "id", header: "Alert ID", render: (x: any) => <span className="font-mono text-base">{x.alert_id}</span> },
          { key: "u", header: "User", render: (x: any) => x.email || x.user_id?.slice(0, 8) || "—" },
          { key: "r", header: "Rule", render: (x: any) => <div><p className="font-semibold">{actLabel(x.rule || x.kind)}</p><p className="text-base text-slate-500">{x.description}</p></div> },
          { key: "s", header: "Severity", render: (x: any) => <Badge tone={sevTone(x.severity)}>{x.severity}</Badge> },
          { key: "ip", header: "IP", render: (x: any) => x.ip || "—" },
          { key: "t", header: "Time", render: (x: any) => fmtDate(x.created_at) },
          { key: "st", header: "Status", render: (x: any) => <Badge tone={x.status === "open" ? "red" : "green"}>{x.status}</Badge> },
          { key: "a", header: "Action", className: "text-right", render: (x: any) => x.status === "open" ? <button className="btn-secondary !py-1.5" onClick={() => ack(x.id)}>Acknowledge</button> : <span className="text-base text-slate-400">—</span> }]} />
        <Pagination page={page} pageSize={25} total={alerts.data.total} onChange={setPage} /></>}
    </div>
  </>;
}
