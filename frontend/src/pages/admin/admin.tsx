import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, Bell, CheckCircle2, Database, Download, Fingerprint, KeyRound, KeySquare, Link2, Lock, Radio, RefreshCw, Shield, ShieldCheck, ShieldAlert, Users, XCircle, Zap } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { api, errMsg, fmtBytes, fmtDate, openBlob } from "../../api";
import { useDebounced, useFetch, useRange } from "../../hooks";
import { Badge, Confirm, Empty, ErrorBox, Loading, Notice, PageHeader, Pagination, RangeSelect, Section, Spinner, SrSummary, StatCard, Table, sevTone, statusTone } from "../../ui";
import { Lines, SimpleBars, StackedBars } from "../charts";

const CAT_LABEL: Record<string, string> = { multiple_failed_logins: "Multiple Login Attempts", suspicious_access: "Suspicious Access", unauthorized_access: "Unauthorized Access", policy_violation: "Policy Violations", integrity_failure: "File Integrity Failures", sharing_link_misuse: "Share-link Misuse", abnormal_download: "Abnormal Downloads", account_role_change: "Account/Role Changes", key_rotation: "Key Rotation", rate_limit: "Rate Limited" };
const label = (c: string) => CAT_LABEL[c] || c.replace(/_/g, " ");
const PIE = ["#450a0a", "#7f1d1d", "#991b1b", "#b91c1c", "#dc2626", "#ef4444", "#f87171", "#5c0f0f", "#a01a1a", "#c81e1e"];

/* ---------- Dashboard ---------- */
export function AdminDashboard() {
  const a = useFetch<any>("/admin/analytics"); const s = useFetch<any>("/admin/system");
  if (a.error) return <ErrorBox message={a.error} onRetry={a.reload} />; if (!a.data || !s.data) return <Loading />;
  const d = a.data; const sh = d.shares;
  return <><PageHeader title="Admin Dashboard" subtitle="Platform operations overview — users, storage, activity and sharing. File contents stay encrypted and are never visible to administrators."
    actions={<><Link to="/admin/audit" className="btn-secondary"><ShieldCheck className="h-4 w-4" />Audit logs</Link><Link to="/admin/security" className="btn-primary"><Shield className="h-4 w-4" />Security Dashboard</Link></>} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard icon={<Users className="h-7 w-7 text-brand-600" />} tint="bg-brand-50" label="Registered users" value={d.users} sub={`${d.active_users} active accounts`} />
      <StatCard icon={<CheckCircle2 className="h-7 w-7 text-emerald-600" />} tint="bg-emerald-50" label="Active users (30d)" value={d.active_users_30d} sub="signed in recently" />
      <StatCard icon={<Download className="h-7 w-7 text-lavender-600" />} tint="bg-lavender-50" label="Files uploaded" value={d.files} sub={fmtBytes(d.storage_bytes)} />
      <StatCard icon={<Shield className="h-7 w-7 text-violet-600" />} tint="bg-violet-50" label="Storage utilization" value={d.storage_utilization_pct != null ? `${d.storage_utilization_pct}%` : "—"} sub={`of ${fmtBytes(d.total_quota_bytes)} quota`} /></div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard icon={<XCircle className="h-7 w-7 text-red-500" />} tint="bg-red-50" label="Failed logins (30d)" value={d.failed_logins} sub="see Security Dashboard" />
      <StatCard icon={<AlertTriangle className="h-7 w-7 text-amber-500" />} tint="bg-amber-50" label="Unauthorized attempts" value={d.unauthorized_attempts} sub="denied by access control" />
      <StatCard icon={<Link2 className="h-7 w-7 text-brand-600" />} tint="bg-brand-50" label="Active share links" value={sh.active} sub={`${sh.all} total · ${sh.expired} expired`} />
      <StatCard icon={<KeyRound className="h-7 w-7 text-lavender-600" />} tint="bg-lavender-50" label="Revoked links" value={sh.revoked} sub="access withdrawn by owners" /></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <Section title="Uploads & downloads (30 days)"><Lines data={d.uploads.map((u: any, i: number) => ({ date: u.date, uploads: u.count, downloads: d.downloads[i]?.count ?? 0 }))} keys={["uploads", "downloads"]} colors={{ uploads: "#7f1d1d", downloads: "#dc2626" }} area /></Section>
      <Section title="File-sharing activity (30 days)"><StackedBars data={d.share_activity.map((x: any) => ({ date: x.date, shares: x.count }))} keys={["shares"]} colors={{ shares: "#b91c1c" }} empty="No shares created in this period" /></Section></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-3">
      <Section title="Share links" className="lg:col-span-1"><ul className="space-y-3 text-xl">
        <li className="flex items-center justify-between"><span className="text-slate-500">Active</span><Badge tone="green">{sh.active}</Badge></li>
        <li className="flex items-center justify-between"><span className="text-slate-500">Expired</span><Badge tone="slate">{sh.expired}</Badge></li>
        <li className="flex items-center justify-between"><span className="text-slate-500">Revoked</span><Badge tone="red">{sh.revoked}</Badge></li>
        <li className="flex items-center justify-between border-t border-slate-100 pt-3"><span className="text-slate-500">Total shares</span><Badge tone="blue">{sh.all}</Badge></li></ul></Section>
      <Section title="System health" className="lg:col-span-2"><ul className="space-y-3 text-xl"><li className="flex justify-between">Database <Badge tone={s.data.database.ok ? "green" : "red"}>{s.data.database.ok ? `OK (${s.data.database.engine})` : "Down"}</Badge></li><li className="flex justify-between">Storage ({s.data.storage.backend}) <Badge tone={s.data.storage.ok ? "green" : "red"}>{s.data.storage.ok ? "Round-trip OK" : "Failing"}</Badge></li><li className="flex justify-between">Encryption <Badge tone="green">AES-256-GCM · per-file keys · KEK v{s.data.encryption.active_key_version}</Badge></li></ul>
        <p className="mt-3 text-xl text-slate-500">Each file is encrypted with its own unique AES-256 data key; the master key only wraps those per-file keys.</p></Section></div></>;
}

/* ---------- Users ---------- */
export function AdminUsers() {
  const [q, setQ] = useState(""); const dq = useDebounced(q); const [page, setPage] = useState(1); useEffect(() => setPage(1), [dq]);
  const { data, error, loading, reload } = useFetch<any>("/admin/users", { q: dq || undefined, page, page_size: 25 }); const [ask, setAsk] = useState<any>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const apply = async () => { setBusy(true); try { await api.patch(`/admin/users/${ask.u.id}`, ask.body); setAsk(null); reload(); } catch (e) { setErr(errMsg(e)); setAsk(null); } finally { setBusy(false); } };
  return <><PageHeader title="User Management" subtitle="Roles are stored and enforced server-side. Every change is audited." />{err && <div className="mb-3"><ErrorBox message={err} /></div>}
    <div className="card"><div className="p-4"><input aria-label="Search users" className="input max-w-xs" placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {error ? <div className="p-4"><ErrorBox message={error} onRetry={reload} /></div> : loading && !data ? <Loading /> : <><Table rowKey={(u: any) => u.id} rows={data.items} empty={<Empty title="No users found" />}
        cols={[{ key: "n", header: "User", render: (u: any) => <div><p className="font-semibold">{u.full_name}</p><p className="text-xl text-slate-500">{u.email}</p></div> }, { key: "r", header: "Role", render: (u: any) => <Badge tone={u.role === "admin" ? "purple" : "blue"}>{u.role}</Badge> }, { key: "s", header: "Status", render: (u: any) => <Badge tone={u.is_active ? "green" : "red"}>{u.is_active ? "Active" : "Disabled"}</Badge> },
          { key: "st", header: "Storage", render: (u: any) => fmtBytes(u.storage_used) }, { key: "l", header: "Last login", render: (u: any) => fmtDate(u.last_login_at) },
          { key: "a", header: "Actions", className: "text-right", render: (u: any) => <div className="flex justify-end gap-2"><button className="btn-secondary !py-1.5" onClick={() => setAsk({ u, body: { role: u.role === "admin" ? "user" : "admin" }, t: u.role === "admin" ? "Demote to standard user?" : "Promote to administrator?" })}>{u.role === "admin" ? "Make user" : "Make admin"}</button><button className="btn-secondary !py-1.5" onClick={() => setAsk({ u, body: { is_active: !u.is_active }, t: u.is_active ? "Disable this account?" : "Re-enable this account?" })}>{u.is_active ? "Disable" : "Enable"}</button></div> }]} />
        <Pagination page={page} pageSize={25} total={data.total} onChange={setPage} /></>}</div>
    <Confirm open={!!ask} title={ask?.t || ""} busy={busy} danger message={<>This changes access for <b>{ask?.u.email}</b> and is recorded in the audit log. You cannot change your own role or status.</>} onClose={() => setAsk(null)} onConfirm={apply} /></>;
}

/* ---------- Files / sharing ---------- */
export function AdminFiles() {
  const [sp] = useSearchParams(); const [q, setQ] = useState(sp.get("q") || ""); const dq = useDebounced(q); const [page, setPage] = useState(1); useEffect(() => setPage(1), [dq]);
  const { data, error, loading, reload } = useFetch<any>("/admin/files", { q: dq || undefined, page, page_size: 25 });
  return <><PageHeader title="File Management" subtitle="File metadata only. Contents are encrypted and not available to administrators through the app." />
    <div className="card"><div className="p-4"><input aria-label="Search files" className="input max-w-xs" placeholder="Search file name…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {error ? <div className="p-4"><ErrorBox message={error} onRetry={reload} /></div> : loading && !data ? <Loading /> : <><Table rowKey={(f: any) => f.id} rows={data.items} empty={<Empty title="No files" />} cols={[{ key: "n", header: "Name", render: (f: any) => <span className="font-semibold">{f.name}</span> }, { key: "o", header: "Owner", render: (f: any) => f.owner }, { key: "s", header: "Size", render: (f: any) => fmtBytes(f.size) }, { key: "e", header: "Encryption", render: (f: any) => <Badge tone="green">AES-256-GCM · KEK v{f.kek_version}</Badge> }, { key: "t", header: "State", render: (f: any) => f.trashed ? <Badge tone="amber">In trash</Badge> : <Badge tone="slate">Active</Badge> }, { key: "d", header: "Uploaded", render: (f: any) => fmtDate(f.created_at) }]} /><Pagination page={page} pageSize={25} total={data.total} onChange={setPage} /></>}</div></>;
}

export function AdminSharing() {
  const [page, setPage] = useState(1); const { data, error, loading, reload } = useFetch<any>("/admin/sharing", { page, page_size: 25 });
  return <><PageHeader title="Sharing Reports" subtitle="All shares across the system." />
    {data && <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard icon={<Shield className="h-6 w-6 text-brand-600" />} tint="bg-brand-50" label="Total shares" value={data.totals.all} /><StatCard icon={<CheckCircle2 className="h-6 w-6 text-emerald-600" />} tint="bg-emerald-50" label="Active" value={data.totals.active} /><StatCard icon={<AlertTriangle className="h-6 w-6 text-amber-500" />} tint="bg-amber-50" label="Expired" value={data.totals.expired ?? 0} /><StatCard icon={<XCircle className="h-6 w-6 text-red-500" />} tint="bg-red-50" label="Revoked" value={data.totals.revoked} /></div>}
    <div className="card">{error ? <div className="p-4"><ErrorBox message={error} onRetry={reload} /></div> : loading && !data ? <Loading /> : <><Table rowKey={(s: any) => s.id} rows={data.items} empty={<Empty title="No shares yet" />} cols={[{ key: "f", header: "File", render: (s: any) => s.file }, { key: "o", header: "Owner", render: (s: any) => s.owner }, { key: "k", header: "Type", render: (s: any) => s.kind }, { key: "p", header: "Permission", render: (s: any) => s.permission }, { key: "pc", header: "Passcode", render: (s: any) => s.passcode_protected ? <Badge tone="amber"><KeyRound className="h-3 w-3" />Yes</Badge> : <span className="text-am text-slate-400">No</span> }, { key: "u", header: "Uses", render: (s: any) => s.uses }, { key: "e", header: "Expires", render: (s: any) => fmtDate(s.expires_at) }, { key: "s", header: "Status", render: (s: any) => <Badge tone={statusTone(s.status)}>{s.status.replace("_", " ")}</Badge> }]} /><Pagination page={page} pageSize={25} total={data.total} onChange={setPage} /></>}</div></>;
}

export function AdminAnalytics() {
  const r = useRange(30); const { data, error, reload } = useFetch<any>("/admin/analytics", { start: r.start, end: r.end });
  return <><PageHeader title="Analytics" subtitle="System-wide activity." actions={<RangeSelect r={r} />} />{error ? <ErrorBox message={error} onRetry={reload} /> : !data ? <Loading /> : <><div className="grid gap-4 sm:grid-cols-3"><StatCard icon={<Users className="h-6 w-6 text-brand-600" />} tint="bg-brand-50" label="Users" value={data.users} /><StatCard icon={<Download className="h-6 w-6 text-emerald-600" />} tint="bg-emerald-50" label="Files" value={data.files} /><StatCard icon={<Shield className="h-6 w-6 text-violet-600" />} tint="bg-violet-50" label="Stored" value={fmtBytes(data.storage_bytes)} /></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2"><Section title="Uploads & downloads"><Lines area data={data.uploads.map((u: any, i: number) => ({ date: u.date, uploads: u.count, downloads: data.downloads[i]?.count ?? 0 }))} keys={["uploads", "downloads"]} colors={{ uploads: "#7f1d1d", downloads: "#dc2626" }} /></Section>
      <Section title="Sign-ups & shares"><StackedBars data={data.signups.map((u: any, i: number) => ({ date: u.date, signups: u.count, shares: data.share_activity[i]?.count ?? 0 }))} keys={["signups", "shares"]} colors={{ signups: "#991b1b", shares: "#ef4444" }} /></Section></div></>}</>;
}

export function AdminSystem() {
  const { data, error, reload, loading } = useFetch<any>("/admin/system");
  return <><PageHeader title="System Monitoring" subtitle="Live checks against the running services." actions={<button className="btn-secondary" onClick={reload}><RefreshCw className="h-4 w-4" />Re-check</button>} />
    {error ? <ErrorBox message={error} onRetry={reload} /> : !data ? <Loading /> : <div className={`grid gap-5 lg:grid-cols-2 ${loading ? "opacity-60" : ""}`}>
      <Section title="Services"><dl className="divide-y divide-slate-100 text-xl">{[["Database", <Badge tone={data.database.ok ? "green" : "red"}>{data.database.ok ? `OK · ${data.database.engine}` : "Unavailable"}</Badge>], ["Object storage", <Badge tone={data.storage.ok ? "green" : "red"}>{data.storage.backend} · {data.storage.ok ? "write/read/delete OK" : "FAILING"}</Badge>],
        ...(data.storage.backend === "s3" ? [["S3 public access block", <Badge tone={data.storage.public_access_blocked ? "green" : "amber"}>{data.storage.public_access_blocked === null ? "Unknown" : data.storage.public_access_blocked ? "Fully blocked" : "Not fully blocked"}</Badge>]] : []),
        ["Rate limiting", <span>{data.rate_limiting.enabled ? "On" : "Off"} · {data.rate_limiting.scope}</span>], ["Environment", data.environment], ["HSTS enforced", data.https_enforced ? "Yes" : "No"]].map(([k, v]: any) => <div key={k} className="flex items-center justify-between py-3"><dt className="text-slate-500">{k}</dt><dd className="font-medium">{v}</dd></div>)}</dl></Section>
      <Section title="Encryption & data"><dl className="divide-y divide-slate-100 text-xl">{[["Algorithm", data.encryption.algorithm], ["Active key version", `v${data.encryption.active_key_version}`], ["Key source", data.encryption.key_source], ["Users", data.counts.users], ["Files", data.counts.files], ["Audit entries", data.counts.audit_entries]].map(([k, v]: any) => <div key={k} className="flex justify-between gap-4 py-3"><dt className="text-slate-500">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}</dl></Section></div>}</>;
}

/* ---------- Settings (key management + audit integrity) ---------- */
export function AdminSettings() {
  const keys = useFetch<any>("/admin/keys"); const v = useFetch<any>(null); const [ver, setVer] = useState<any>(null); const [ask, setAsk] = useState(false); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; m: string } | null>(null);
  const rotate = async () => { setBusy(true); try { const r = await api.post("/admin/keys/rotate", {}); setMsg({ ok: true, m: `Rotated v${r.data.from} → v${r.data.to}; ${r.data.files_rewrapped} data keys re-wrapped.` }); keys.reload(); } catch (e) { setMsg({ ok: false, m: errMsg(e) }); } finally { setBusy(false); setAsk(false); } };
  const verify = async () => { try { setVer((await api.get("/admin/security/audit/verify")).data); } catch (e) { setMsg({ ok: false, m: errMsg(e) }); } };
  return <><PageHeader title="Settings" subtitle="Encryption key lifecycle and audit-log integrity." />{msg && <div className="mb-4">{msg.ok ? <Notice kind="success">{msg.m}</Notice> : <ErrorBox message={msg.m} />}</div>}
    <div className="grid gap-5 lg:grid-cols-2">
      <Section title="Encryption keys" right={<button className="btn-primary" onClick={() => setAsk(true)}><KeyRound className="h-4 w-4" />Rotate master key</button>}>{!keys.data ? <Loading /> : <><dl className="divide-y divide-slate-100 text-xl"><div className="flex justify-between py-2.5"><dt className="text-slate-500">Active version</dt><dd className="font-semibold">v{keys.data.active_version}</dd></div><div className="flex justify-between py-2.5"><dt className="text-slate-500">Provisioned versions</dt><dd>{keys.data.available_versions.map((x: number) => `v${x}`).join(", ")}</dd></div><div className="flex justify-between py-2.5"><dt className="text-slate-500">Key source</dt><dd className="max-w-[60%] text-right">{keys.data.source}</dd></div><div className="flex justify-between py-2.5"><dt className="text-slate-500">Files per key version</dt><dd>{Object.entries(keys.data.files_by_version).map(([k, n]) => `v${k}: ${n}`).join(" · ") || "—"}</dd></div><div className="flex justify-between py-2.5"><dt className="text-slate-500">Automatic rotation</dt><dd>Not configured</dd></div></dl>
        <h3 className="mb-2 mt-4 text-xl font-bold">Rotation history</h3>{keys.data.history.length ? <ul className="space-y-1 text-xl text-slate-600">{keys.data.history.map((h: any, i: number) => <li key={i}>{fmtDate(h.at)} — v{h.from} → v{h.to} ({h.files_rewrapped} files)</li>)}</ul> : <p className="text-xl text-slate-500">No rotations yet.</p>}</>}</Section>
      <Section title="Audit log integrity" right={<button className="btn-secondary" onClick={verify}><ShieldCheck className="h-4 w-4" />Verify chain</button>}><p className="text-xl text-slate-600">Each audit entry includes a hash of the previous entry. Verification detects edits or deletions in the middle of the log. It is tamper-<i>evidence</i>, not immutability: someone with full database access could rewrite the whole chain.</p>
        {ver && <div className="mt-4">{ver.ok ? <Notice kind="success">Chain intact — {ver.checked} entries verified.</Notice> : <ErrorBox message={`Chain broken at entry #${ver.broken_at_id} after ${ver.checked} valid entries.`} />}</div>}</Section></div>
    <Confirm open={ask} busy={busy} title="Rotate master key?" confirmLabel="Rotate" onClose={() => setAsk(false)} onConfirm={rotate} message="Every file's data key will be re-wrapped under the new master key. File contents are not rewritten, and the old key must be kept until rotation completes. In production, a new key version must already be provisioned in TS_MASTER_KEYS." /></>;
}

/* ---------- Audit logs ---------- */
export function AdminAudit() {
  const r = useRange(30); const [q, setQ] = useState(""); const dq = useDebounced(q); const [outcome, setOutcome] = useState(""); const [action, setAction] = useState(""); const [page, setPage] = useState(1); useEffect(() => setPage(1), [dq, outcome, action, r.start, r.end]);
  const params = { start: r.start, end: r.end, q: dq || undefined, outcome: outcome || undefined, action: action || undefined };
  const { data, error, loading, reload } = useFetch<any>("/admin/security/audit", { ...params, page, page_size: 25 }); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const exp = async () => { setBusy(true); try { const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as any).toString(); await openBlob(`/admin/security/audit/export.csv?${qs}`, "trustshare-audit.csv"); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); } };
  return <><PageHeader title="Activity Logs" subtitle="Append-only audit trail of security-relevant actions." actions={<><RangeSelect r={r} /><button className="btn-secondary" onClick={exp} disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />}Export CSV</button></>} />{err && <div className="mb-3"><ErrorBox message={err} /></div>}
    <div className="card"><div className="flex flex-wrap gap-2 p-4"><input aria-label="Search audit log" className="input !w-60" placeholder="Search action, resource, IP…" value={q} onChange={(e) => setQ(e.target.value)} />
      <select aria-label="Action group" className="input !w-auto" value={action} onChange={(e) => setAction(e.target.value)}><option value="">All actions</option>{["auth.", "file.", "share.", "admin.", "key.", "audit."].map((a) => <option key={a} value={a}>{a}*</option>)}</select>
      <select aria-label="Outcome" className="input !w-auto" value={outcome} onChange={(e) => setOutcome(e.target.value)}><option value="">Any outcome</option><option value="success">Success</option><option value="denied">Denied</option><option value="failure">Failure</option></select></div>
      {error ? <div className="p-4"><ErrorBox message={error} onRetry={reload} /></div> : loading && !data ? <Loading /> : <><Table rowKey={(x: any) => x.id} rows={data.items} empty={<Empty title="No audit entries match" />} cols={[{ key: "i", header: "#", render: (x: any) => x.id }, { key: "a", header: "Action", render: (x: any) => <span className="font-semibold">{x.action}</span> }, { key: "o", header: "Outcome", render: (x: any) => <Badge tone={x.outcome === "success" ? "green" : "red"}>{x.outcome}</Badge> }, { key: "u", header: "Actor", render: (x: any) => <span className="font-mono text-xl">{x.actor_id?.slice(0, 8) || "—"}</span> }, { key: "r", header: "Resource", render: (x: any) => x.resource_type ? `${x.resource_type}:${(x.resource_id || "").slice(0, 8)}` : "—" }, { key: "p", header: "IP", render: (x: any) => x.ip || "—" }, { key: "d", header: "Time", render: (x: any) => fmtDate(x.created_at) }]} /><Pagination page={page} pageSize={25} total={data.total} onChange={setPage} /></>}</div></>;
}

/* ---------- Security dashboard ---------- */
const SEV_ICON: Record<string, any> = { critical: XCircle, high: ShieldAlert, medium: AlertTriangle, low: Bell };
const SEV_RING: Record<string, string> = { critical: "border-red-300 bg-red-50", high: "border-orange-300 bg-orange-50", medium: "border-amber-300 bg-amber-50", low: "border-slate-200 bg-slate-50" };
const RISK_TONE: Record<string, string> = { critical: "red", high: "orange", medium: "amber", low: "green" };

export function AdminSecurity() {
  const r = useRange(30); const rg = { start: r.start, end: r.end };
  const ov = useFetch<any>("/admin/security/overview", rg);
  const [af, setAf] = useState("open"); const [asev, setAsev] = useState(""); const [ap, setAp] = useState(1);
  const alerts = useFetch<any>("/admin/security/alerts", { status: af || undefined, severity: asev || undefined, page: ap, page_size: 6 });
  const [up, setUp] = useState(1); const [uq, setUq] = useState(""); const duq = useDebounced(uq); const [urisk, setUrisk] = useState("");
  useEffect(() => setUp(1), [duq, urisk]);
  const users = useFetch<any>("/admin/security/users", { q: duq || undefined, risk: urisk || undefined, page: up, page_size: 8 });
  const [ep, setEp] = useState(1); const [sev, setSev] = useState(""); const [cat, setCat] = useState("");
  useEffect(() => setEp(1), [sev, cat, r.start, r.end]);
  const ev = useFetch<any>("/admin/security/events", { ...rg, severity: sev || undefined, category: cat || undefined, page: ep, page_size: 8 });
  const [sel, setSel] = useState<any>(null); const [busy, setBusy] = useState<number | "all" | null>(null); const [err, setErr] = useState<string | null>(null);

  // Live threat feed: poll every 10s; when a new alert id appears, flash the red LED and refresh.
  const [live, setLive] = useState<any>(null); const [flash, setFlash] = useState(false);
  const lastId = useRef<number | null>(null); const flashTimer = useRef<any>(null);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const r = await api.get("/admin/security/live");
        if (stop) return;
        if (lastId.current !== null && r.data.latest_id > lastId.current) {
          setFlash(true); alerts.reload(); ov.reload();
          clearTimeout(flashTimer.current); flashTimer.current = setTimeout(() => setFlash(false), 9000);
        }
        lastId.current = r.data.latest_id; setLive(r.data);
      } catch { /* transient poll failure is fine */ }
    };
    tick(); const t = setInterval(tick, 10000);
    return () => { stop = true; clearInterval(t); clearTimeout(flashTimer.current); };
  }, []);
  const threat = live?.open || { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
  const hot = (threat.critical + threat.high) > 0;

  const ack = async (id: number) => { setBusy(id); try { await api.post(`/admin/security/alerts/${id}/acknowledge`); alerts.reload(); ov.reload(); } catch (e) { setErr(errMsg(e)); } finally { setBusy(null); } };
  const ackAll = async () => { setBusy("all"); try { await api.post("/admin/security/alerts/acknowledge-all"); alerts.reload(); ov.reload(); } catch (e) { setErr(errMsg(e)); } finally { setBusy(null); } };

  if (ov.error) return <ErrorBox message={ov.error} onRetry={ov.reload} />; if (!ov.data) return <Loading />;
  const c = ov.data.cards; const sevCounts = ov.data.alerts_by_severity;

  return <>
    {/* Distinct security header band */}
    <div className="mb-5 overflow-hidden rounded-2xl bg-grad-hero p-6 text-white shadow-glow">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className={`relative grid h-14 w-14 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25 ${flash || hot ? "led-alert" : ""}`}>
            <ShieldAlert className="h-7 w-7" />
            {(flash || hot) && <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-red-600 text-xl font-bold text-white led-dot">{threat.critical + threat.high}</span>}
          </div>
          <div><p className="text-xl font-semibold uppercase tracking-wider text-lavender-200">Security Operations</p><h1 className="text-3xl font-extrabold">Security Dashboard</h1>
            <p className="text-xl text-slate-200">Live alerts, per-user risk posture and the security activity log.</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => { alerts.reload(); ov.reload(); }}
                  aria-label={`Live threat monitor: ${threat.total} open alerts`}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xl font-bold uppercase tracking-wider transition ${flash || hot
                    ? "led-alert border-red-400 bg-red-600 text-white"
                    : "border-white/25 bg-white/10 text-slate-200 hover:bg-white/20"}`}>
            <Radio className={`h-4 w-4 ${flash || hot ? "led-dot" : ""}`} />
            {flash ? "New alert" : hot ? `${threat.critical + threat.high} urgent` : "Live"}
          </button>
          <RangeSelect r={r} /><button className="btn !bg-white/15 !text-white !border !border-white/25 hover:!bg-white/25" disabled={busy === "all" || !ov.data.open_alerts} onClick={ackAll}>{busy === "all" ? <Spinner className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}Acknowledge all</button></div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(["critical", "high", "medium", "low"] as const).map((k) => { const I = SEV_ICON[k]; return (
          <div key={k} className={`flex items-center gap-3 rounded-xl border p-3 ${SEV_RING[k]}`}>
            <span className={`grid h-10 w-10 place-items-center rounded-xl ${k === "critical" ? "bg-red-600 text-white" : k === "high" ? "bg-orange-500 text-white" : k === "medium" ? "bg-amber-500 text-white" : "bg-slate-400 text-white"}`}><I className="h-5 w-5" /></span>
            <div><p className="text-3xl font-extrabold leading-none text-navy-950">{sevCounts[k] ?? 0}</p><p className="text-xl font-semibold capitalize text-slate-600">{k} alerts</p></div></div>); })}
      </div>
    </div>

    {err && <div className="mb-3"><ErrorBox message={err} /></div>}

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <StatCard icon={<Bell className="h-6 w-6 text-red-500" />} tint="bg-red-50" label="Open alerts" value={ov.data.open_alerts} sub={`${ov.data.alerts_24h} in last 24h`} />
      <StatCard icon={<Users className="h-6 w-6 text-brand-600" />} tint="bg-brand-50" label="Total Logins" value={c.total_logins.value} change={c.total_logins.change_pct} sub="vs previous period" />
      <StatCard icon={<CheckCircle2 className="h-6 w-6 text-emerald-600" />} tint="bg-emerald-50" label="Successful" value={c.successful_logins.value} change={c.successful_logins.change_pct} sub={ov.data.success_rate_pct != null ? `${ov.data.success_rate_pct}% success` : "No logins"} />
      <StatCard icon={<XCircle className="h-6 w-6 text-red-500" />} tint="bg-red-50" label="Failed logins" value={c.failed_logins.value} change={c.failed_logins.change_pct} sub="wrong password / locked" />
      <StatCard icon={<AlertTriangle className="h-6 w-6 text-amber-500" />} tint="bg-amber-50" label="Unauthorized" value={c.unauthorized_attempts.value} change={c.unauthorized_attempts.change_pct} sub="denied by access control" /></div>

    <div className="mt-5 grid gap-5 xl:grid-cols-3">
      <Section title="Alert volume" className="xl:col-span-2"><Lines area data={ov.data.alerts_series} keys={["alerts"]} colors={{ alerts: "#b91c1c" }} names={{ alerts: "Security alerts" }} empty="No alerts in this period" /><SrSummary>{ov.data.open_alerts} open alerts.</SrSummary></Section>
      <Section title="Open alerts by severity">{Object.values(sevCounts).some((v: any) => v > 0) ? <div className="flex flex-wrap items-center gap-4">
        <div className="relative h-40 w-40"><ResponsiveContainer><PieChart><Pie isAnimationActive={false} data={(["critical", "high", "medium", "low"] as const).map((k) => ({ name: k, value: sevCounts[k] || 0 }))} dataKey="value" innerRadius="62%" outerRadius="100%" stroke="#fff" strokeWidth={2}>{(["critical", "high", "medium", "low"] as const).map((k, i) => <Cell key={k} fill={["#7f1d1d", "#b91c1c", "#dc2626", "#f87171"][i]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center"><div><p className="text-3xl font-bold">{ov.data.open_alerts}</p><p className="text-xl text-slate-500">Open</p></div></div></div>
        <ul className="flex-1 space-y-1.5 text-xl">{(["critical", "high", "medium", "low"] as const).map((k, i) => <li key={k} className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 capitalize"><i className="h-2.5 w-2.5 rounded-full" style={{ background: ["#7f1d1d", "#b91c1c", "#dc2626", "#f87171"][i] }} />{k}</span><span className="text-slate-600">{sevCounts[k] || 0}</span></li>)}</ul></div> : <Empty title="No open alerts" hint="You're all caught up." />}</Section></div>

    <EncryptionPanel flash={flash} />

    <div className="mt-5 grid gap-5 2xl:grid-cols-2">
      <section className={`card ${flash ? "alert-flash" : ""}`}><div className="flex flex-wrap items-center justify-between gap-2 p-5 pb-3"><h2 className="flex items-center gap-2 font-bold"><Bell className="h-4 w-4 text-red-500" />Security Alerts</h2>
        <div className="flex flex-wrap gap-2"><select aria-label="Alert status" className="input !w-auto !py-1.5 text-xl" value={af} onChange={(e) => { setAf(e.target.value); setAp(1); }}><option value="open">Open</option><option value="acknowledged">Acknowledged</option><option value="">All</option></select>
          <select aria-label="Alert severity" className="input !w-auto !py-1.5 text-xl" value={asev} onChange={(e) => { setAsev(e.target.value); setAp(1); }}><option value="">Any severity</option>{["critical", "high", "medium", "low"].map((k) => <option key={k} value={k}>{k}</option>)}</select></div></div>
        {alerts.error ? <div className="p-4"><ErrorBox message={alerts.error} onRetry={alerts.reload} /></div> : !alerts.data ? <Loading /> : <>
          <ul className="divide-y divide-slate-100">{alerts.data.items.map((a: any) => { const I = SEV_ICON[a.severity] || Bell; return (
            <li key={a.id} className="flex items-start gap-3 px-5 py-3">
              <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${a.severity === "critical" ? "bg-red-600 text-white" : a.severity === "high" ? "bg-orange-500 text-white" : a.severity === "medium" ? "bg-amber-500 text-white" : "bg-slate-300 text-white"}`}><I className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-navy-900">{a.title}</p><Badge tone={sevTone(a.severity)}>{a.severity}</Badge>{a.status === "acknowledged" && <Badge tone="green">acknowledged</Badge>}</div>
                <p className="text-xl text-slate-600">{a.description}</p>
                <p className="mt-0.5 text-xl text-slate-400">{a.email || "unknown user"}{a.ip ? ` · ${a.ip}` : ""} · {fmtDate(a.created_at)}</p></div>
              {a.status === "open" && <button className="btn-secondary !py-1.5 text-xl" disabled={busy === a.id} onClick={() => ack(a.id)}>{busy === a.id ? <Spinner className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Ack</button>}</li>); })}
            {!alerts.data.items.length && <li><Empty title="No alerts match" hint="Nothing needs attention right now." /></li>}</ul>
          <Pagination page={ap} pageSize={6} total={alerts.data.total} onChange={setAp} /></>}</section>

      <section className="card"><div className="flex flex-wrap items-center justify-between gap-2 p-5 pb-3"><h2 className="flex items-center gap-2 font-bold"><Users className="h-4 w-4 text-brand-600" />Per-user Security Posture</h2>
        <div className="flex flex-wrap gap-2"><input aria-label="Search users" className="input !w-36 !py-1.5 text-xl" placeholder="Search user…" value={uq} onChange={(e) => setUq(e.target.value)} />
          <select aria-label="Risk level" className="input !w-auto !py-1.5 text-xl" value={urisk} onChange={(e) => setUrisk(e.target.value)}><option value="">Any risk</option>{["critical", "high", "medium", "low"].map((k) => <option key={k} value={k}>{k}</option>)}</select></div></div>
        {users.error ? <div className="p-4"><ErrorBox message={users.error} onRetry={users.reload} /></div> : !users.data ? <Loading /> : <><Table rowKey={(u: any) => u.id} rows={users.data.items} empty={<Empty title="No users match" />}
          cols={[{ key: "u", header: "User", render: (u: any) => <div><p className="font-semibold">{u.full_name}</p><p className="text-xl text-slate-500">{u.email}</p></div> },
            { key: "r", header: "Risk", render: (u: any) => <div className="flex items-center gap-2"><Badge tone={RISK_TONE[u.risk_level]}>{u.risk_level}</Badge><span className="text-xl text-slate-500">{u.risk_score}</span></div> },
            { key: "f", header: "Failed 30d", render: (u: any) => u.failed_logins_30d },
            { key: "a", header: "Open alerts", render: (u: any) => u.open_alerts },
            { key: "s", header: "Status", render: (u: any) => <Badge tone={u.is_active ? "green" : "red"}>{u.is_active ? "Active" : "Disabled"}</Badge> },
            { key: "v", header: "Vault", render: (u: any) => u.secure_folder_enabled ? <Badge tone="purple">Secure</Badge> : <span className="text-xl text-slate-400">—</span> }]} />
          <Pagination page={up} pageSize={8} total={users.data.total} onChange={setUp} /></>}</section></div>

    <section className="card mt-5"><div className="flex flex-wrap items-center justify-between gap-2 p-5 pb-3"><h2 className="flex items-center gap-2 font-bold"><ShieldCheck className="h-4 w-4 text-lavender-600" />Security Activity Log</h2>
      <div className="flex flex-wrap gap-2"><select aria-label="Severity" className="input !w-auto !py-1.5 text-xl" value={sev} onChange={(e) => setSev(e.target.value)}><option value="">Any severity</option>{["informational", "low", "medium", "high", "critical"].map((x) => <option key={x} value={x}>{x}</option>)}</select>
        <select aria-label="Category" className="input !w-auto !py-1.5 text-xl" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Any category</option>{Object.keys(CAT_LABEL).map((k) => <option key={k} value={k}>{label(k)}</option>)}</select>
        <Link to="/admin/audit" className="btn-secondary !py-1.5 text-xl">Full audit log</Link></div></div>
      {ev.error ? <div className="p-4"><ErrorBox message={ev.error} onRetry={ev.reload} /></div> : !ev.data ? <Loading /> : <><Table rowKey={(x: any) => x.id} rows={ev.data.items} empty={<Empty title="No events match" />}
        cols={[{ key: "e", header: "Event", render: (x: any) => <button className="text-left font-semibold text-lavender-700 hover:underline" onClick={() => setSel(x)}>{x.description}</button> },
          { key: "s", header: "Severity", render: (x: any) => <Badge tone={sevTone(x.severity)}>{x.severity}</Badge> },
          { key: "u", header: "User", render: (x: any) => x.user_id ? <span className="font-mono text-xl">{x.user_id.slice(0, 8)}</span> : "—" },
          { key: "i", header: "IP", render: (x: any) => x.ip || "—" }, { key: "k", header: "Disposition", render: (x: any) => x.disposition }, { key: "d", header: "Time", render: (x: any) => fmtDate(x.created_at) }]} />
        <Pagination page={ep} pageSize={8} total={ev.data.total} onChange={setEp} /></>}</section>

    <p className="mt-4 text-xl text-slate-500">Alerts are raised by real events (failed logins, passcode failures, vault unlock failures, unauthorized access). A single failure does not necessarily mean an account is compromised.</p>
    {sel && <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/50 p-4" onClick={() => setSel(null)}><div className="card w-full max-w-lg p-6" role="dialog" aria-modal="true" aria-label="Security event details" onClick={(e) => e.stopPropagation()}><div className="mb-3 flex items-center justify-between"><h2 className="text-xl font-bold">Event #{sel.id}</h2><Badge tone={sevTone(sel.severity)}>{sel.severity}</Badge></div><p className="font-medium">{sel.description}</p>
      <dl className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200 text-xl">{([["Category", label(sel.category)], ["Type", sel.kind], ["Disposition", sel.disposition], ["Time", fmtDate(sel.created_at)], ["Related user", sel.user_id || "Unknown / unauthenticated"], ["Source IP", sel.ip || "—"], ["Resource", sel.resource || "—"], ["Details", JSON.stringify(sel.details)]].map(([k, v]) => <div key={k} className="flex justify-between gap-4 px-4 py-2"><dt className="text-slate-500">{k}</dt><dd className="break-all text-right font-medium">{v}</dd></div>))}</dl><div className="mt-5 text-right"><button className="btn-primary" onClick={() => setSel(null)}>Close</button></div></div></div>}
  </>;
}

/* ---------- Encryption & Key Registry (Security Dashboard) ---------- */
const KEY_TONE: Record<string, string> = { ok: "green", stale_kek: "amber", kek_unavailable: "red", metadata_missing: "red" };

function EncryptionPanel({ flash }: { flash: boolean }) {
  const [q, setQ] = useState(""); const dq = useDebounced(q);
  const [status, setStatus] = useState(""); const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [dq, status]);
  const reg = useFetch<any>("/admin/security/encryption", { q: dq || undefined, status: status || undefined, page, page_size: 8 });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const verify = async (id: string) => {
    setBusy(id); setMsg(null);
    try {
      const r = await api.post(`/admin/security/encryption/${id}/verify`);
      setMsg({ text: `Key verified — ${fmtBytes(r.data.bytes)} decrypted and authenticated successfully.`, ok: true });
      reg.reload();
    } catch (e) { setMsg({ text: errMsg(e), ok: false }); reg.reload(); }
    finally { setBusy(null); }
  };

  if (reg.error) return <div className="mt-5"><ErrorBox message={reg.error} onRetry={reg.reload} /></div>;
  if (!reg.data) return <div className="mt-5"><Loading /></div>;
  const s = reg.data.summary;

  return <section className={`card mt-5 overflow-hidden ${flash ? "alert-flash" : ""}`}>
    <div className="border-b border-slate-100 bg-grad-soft p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-grad-brand text-white shadow-sm"><Fingerprint className="h-6 w-6" /></span>
          <div>
            <h2 className="text-xl font-bold text-navy-950">Encryption & Key Registry</h2>
            <p className="text-xl text-slate-600">Every document has its own AES-256 data key. The master key only wraps those keys — it never encrypts file content directly.</p>
          </div>
        </div>
        <Badge tone={s.stale_key_files || s.integrity_failures ? "amber" : "green"}>
          {s.stale_key_files || s.integrity_failures ? "attention needed" : "all keys healthy"}
        </Badge>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { icon: <Database className="h-5 w-5 text-lavender-600" />, label: "Encrypted documents", value: s.files, sub: "AES-256-GCM" },
          { icon: <KeySquare className="h-5 w-5 text-lavender-600" />, label: "Unique data keys", value: s.unique_data_keys, sub: "one per document" },
          { icon: <Lock className="h-5 w-5 text-lavender-600" />, label: "Active master key", value: `v${s.active_kek_version}`, sub: `${s.available_kek_versions.length} version(s) held` },
          { icon: <RefreshCw className="h-5 w-5 text-amber-500" />, label: "On older keys", value: s.stale_key_files, sub: "re-wrap on rotation" },
          { icon: <AlertTriangle className="h-5 w-5 text-red-500" />, label: "Integrity failures", value: s.integrity_failures, sub: `${s.rotations} rotation(s)` },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-white/70 bg-white/80 p-3 shadow-sm">
            <div className="flex items-center gap-2">{c.icon}<p className="text-xl font-semibold uppercase tracking-wide text-slate-500">{c.label}</p></div>
            <p className="mt-1 text-3xl font-extrabold text-navy-950">{c.value}</p>
            <p className="text-xl text-slate-500">{c.sub}</p>
          </div>
        ))}
      </div>
    </div>

    <div className="grid grid-cols-1 gap-5 p-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-xl font-bold text-navy-900"><KeyRound className="h-4 w-4 text-lavender-600" />Per-document key records</h3>
          <div className="flex flex-wrap gap-2">
            <input aria-label="Search documents" className="input !w-40 !py-1.5 text-xl" placeholder="Search file or owner…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select aria-label="Key status" className="input !w-auto !py-1.5 text-xl" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Any status</option><option value="ok">ok</option><option value="stale_kek">stale_kek</option>
              <option value="kek_unavailable">kek_unavailable</option><option value="metadata_missing">metadata_missing</option>
            </select>
          </div>
        </div>
        {msg && <div className="mb-3"><Notice kind={msg.ok ? "success" : "warn"}>{msg.text}</Notice></div>}
        <Table rowKey={(f: any) => f.id} rows={reg.data.items} empty={<Empty title="No encrypted documents match" hint="Upload a file to see its per-document key record." />}
          cols={[
            { key: "d", header: "Document", render: (f: any) => <div className="min-w-0"><p className="truncate font-semibold">{f.name}{f.secure && <span className="ml-2 align-middle"><Badge tone="purple">vault</Badge></span>}</p><p className="truncate text-xl text-slate-500">{f.owner_email} · {fmtBytes(f.size)}</p></div> },
            { key: "a", header: "Algorithm", render: (f: any) => <div><p className="font-mono text-xl font-semibold">{f.enc_alg}</p><p className="text-xl text-slate-500">256-bit · 96-bit nonce</p></div> },
            { key: "k", header: "Data key", render: (f: any) => <div><p className="font-mono text-xl">{f.key_fingerprint}</p><p className="text-xl text-slate-500">wrapped · {f.wrapped_dek_bytes} B</p></div> },
            { key: "v", header: "Master key", render: (f: any) => <Badge tone={f.status === "ok" ? "green" : "amber"}>KEK v{f.kek_version}</Badge> },
            { key: "n", header: "Nonce", render: (f: any) => <span className="font-mono text-xl text-slate-500">{f.nonce_b64 ? f.nonce_b64.slice(0, 12) + "…" : "—"}</span> },
            { key: "s", header: "Status", render: (f: any) => <Badge tone={KEY_TONE[f.status] || "slate"}>{f.status.replace(/_/g, " ")}</Badge> },
            { key: "t", header: "Last access", render: (f: any) => <span className="text-xl text-slate-500">{fmtDate(f.last_accessed_at)}</span> },
            { key: "x", header: "", className: "text-right", render: (f: any) => <button className="btn-secondary !py-1.5 text-xl" disabled={busy === f.id} onClick={() => verify(f.id)}>{busy === f.id ? <Spinner className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}Verify</button> },
          ]} />
        <Pagination page={page} pageSize={8} total={reg.data.total} onChange={setPage} />
      </div>
      <div className="min-w-0 w-full space-y-4">
        <div className="rounded-xl border border-slate-200 p-4">
          <h3 className="mb-2 flex items-center gap-2 text-xl font-bold text-navy-900"><Zap className="h-4 w-4 text-red-600" />Documents per master key</h3>
          <SimpleBars data={reg.data.kek_series} xKey="version" yKey="files" color="#991b1b" height={180} empty="No keys in use" />
        </div>
        <div className="rounded-xl border border-slate-200 p-4 text-xl text-slate-600">
          <p className="mb-2 flex items-center gap-2 text-xl font-bold text-navy-900"><Lock className="h-4 w-4 text-lavender-600" />How it works</p>
          <ul className="space-y-1.5">
            <li>· Each upload generates a fresh random 256-bit data key (DEK).</li>
            <li>· The file is encrypted with that DEK and a unique 96-bit nonce.</li>
            <li>· The DEK is wrapped by the versioned master key (KEK) and stored as metadata.</li>
            <li>· The file id is bound as AAD, so ciphertext cannot be swapped between records.</li>
            <li>· Rotation re-wraps DEKs only — file ciphertext is never rewritten.</li>
            <li>· Raw keys are never shown here; only non-reversible fingerprints.</li>
          </ul>
          <p className="mt-2 text-slate-500">Key source: {s.kek_source}. Last rotation: {s.last_rotation ? fmtDate(s.last_rotation) : "never"}.</p>
        </div>
      </div>
    </div>
  </section>;
}