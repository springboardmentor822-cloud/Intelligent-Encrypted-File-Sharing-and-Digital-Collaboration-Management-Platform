import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Copy, Download, FileText, Fingerprint, KeyRound, Link2, Lock, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { api, errMsg, fmtBytes, fmtDate } from "../api";
import { useDebounced, useFetch, useRange } from "../hooks";
import { Badge, Empty, ErrorBox, Loading, Modal, Notice, RangeSelect, Section, Spinner, StatCard, Table, statusTone } from "../ui";
import { CAT_COLORS, Donut, Lines, SimpleBars, StackedBars } from "./charts";
import { ShareModal } from "./FilePanels";

// Every chart on these screens uses the dark-red palette (see ./charts.tsx).
const RED = ["#450a0a", "#7f1d1d", "#991b1b", "#b91c1c", "#dc2626", "#ef4444"];
const STATUS_COLORS: Record<string, string> = { active: "#b91c1c", expired: "#7f1d1d", revoked: "#450a0a" };
const alertTone = (s: string) => (s === "alert" ? "red" : s === "watching" ? "amber" : "green");
const alertLabel = (s: string) => (s === "alert" ? "Triggered" : s === "watching" ? "Watching" : "Clear");

/* ------------------------------------------------------------------ charts */
function Legend({ items }: { items: { name: string; value: number; color: string }[] }) {
  return <ul className="flex-1 space-y-2 text-sm">{items.map((i) => <li key={i.name} className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 capitalize"><i className="h-3 w-3 rounded-full" style={{ background: i.color }} />{i.name}</span><span className="text-slate-600">{i.value}</span></li>)}</ul>;
}

function WrongPasswordTrigger({ pt }: { pt: any }) {
  return <Section title="Wrong-password trigger" right={<Badge tone={alertTone(pt.state)}>{alertLabel(pt.state)}</Badge>}>
    <p className="text-sm text-slate-600">If {pt.threshold} wrong passwords are entered for your account within {pt.window_minutes} minutes you get an in-app alert and an email. Each first attempt also creates a low-priority notice.</p>
    <div className="mt-4 grid grid-cols-3 gap-3 text-center">
      <div className="rounded-xl bg-slate-50 p-3"><p className="text-2xl font-bold text-red-900">{pt.failed_in_window}</p><p className="text-xs text-slate-500">in last {pt.window_minutes} min</p></div>
      <div className="rounded-xl bg-slate-50 p-3"><p className="text-2xl font-bold text-red-900">{pt.threshold}</p><p className="text-xs text-slate-500">alert threshold</p></div>
      <div className="rounded-xl bg-slate-50 p-3"><p className="text-2xl font-bold text-red-900">{pt.failed_in_range}</p><p className="text-xs text-slate-500">in selected range</p></div>
    </div>
    <div className="mt-4"><Table rowKey={(x: any) => x.at + (x.ip || "")} rows={pt.recent_failed} empty={<Empty title="No wrong passwords recorded" hint="Attempts against your account will appear here." />}
      cols={[{ key: "t", header: "When", render: (x: any) => fmtDate(x.at) }, { key: "i", header: "IP address", render: (x: any) => x.ip || "—" }, { key: "d", header: "Device", render: (x: any) => <span className="text-xs text-slate-500">{x.device || "—"}</span> }]} /></div>
  </Section>;
}

function KeyCharts({ d }: { d: any }) {
  const f = d.files;
  return <>
    <Section title="Files by master-key version"><SimpleBars data={f.by_master_key} xKey="version" yKey="files" empty="No files yet" /><p className="mt-2 text-xs text-slate-500">Active master key: v{f.active_master_key}. Older versions mean the file should be re-wrapped.</p></Section>
    <Section title="Encryption key age" right={<span className="text-xs text-slate-500">policy: rotate every {f.policy_days} days</span>}><SimpleBars data={f.key_age} xKey="bucket" yKey="files" empty="No files yet" /></Section>
  </>;
}

/** Dark-red charts about the security of the signed-in user's files and account. `compact` = dashboard version. */
export function FileSecurityCharts({ compact = false }: { compact?: boolean }) {
  const r = useRange(30);
  const q = useFetch<any>("/my-security/overview", { start: r.start, end: r.end });
  if (q.error) return <ErrorBox message={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading />;
  const d = q.data, f = d.files;
  const shareData = d.shares.by_status.map((x: any) => ({ name: x.name, value: x.value, color: STATUS_COLORS[x.name] }));
  const typeData = f.by_type.map((x: any) => ({ name: x.category, value: x.files, color: CAT_COLORS[x.category] || RED[1] }));
  const sharesTotal = d.shares.total;
  return <>
    {!compact && <div className="mb-4 flex justify-end"><RangeSelect r={r} /></div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard icon={<Lock className="h-7 w-7 text-red-800" />} tint="bg-red-50" label="Encrypted files" value={`${f.encrypted} / ${f.total}`} sub={`${f.algorithm} · ${fmtBytes(f.bytes)}`} />
      <StatCard icon={<RefreshCw className="h-7 w-7 text-red-800" />} tint="bg-red-50" label="Keys due for rotation" value={f.rotation_due} sub={`policy ${f.policy_days} days`} />
      <StatCard icon={<Link2 className="h-7 w-7 text-red-800" />} tint="bg-red-50" label="Active share links" value={d.shares.by_status[0].value} sub={`${d.shares.passcode_protected} passcode-protected`} />
      <StatCard icon={<ShieldAlert className="h-7 w-7 text-red-800" />} tint="bg-red-50" label="Wrong passwords" value={d.password_trigger.failed_in_range} sub="against your account" />
    </div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <Section title="Sign-in attempts"><StackedBars data={d.series.sign_ins} keys={["failed", "success"]} colors={{ failed: "#450a0a", success: "#dc2626" }} empty="No sign-ins in this period" /></Section>
      <Section title="Downloads of my files"><Lines area data={d.series.downloads} keys={["count"]} colors={{ count: "#991b1b" }} names={{ count: "Downloads" }} empty="No downloads in this period" /></Section>
      <Section title="Share links by status"><div className="flex flex-wrap items-center gap-6"><Donut data={shareData} center={<div><p className="text-xl font-bold">{sharesTotal}</p><p className="text-xs text-slate-500">links</p></div>} /><Legend items={shareData} /></div></Section>
      {!compact && <Section title="Files by type"><div className="flex flex-wrap items-center gap-6"><Donut data={typeData} center={<div><p className="text-xl font-bold">{f.total}</p><p className="text-xs text-slate-500">files</p></div>} /><Legend items={typeData} /></div></Section>}
      {!compact && <Section title="Denied access attempts on my files"><StackedBars data={d.series.denied} keys={["count"]} colors={{ count: "#7f1d1d" }} empty="No denied attempts — good" /></Section>}
      {!compact && <Section title="Active links by permission"><SimpleBars data={d.shares.active_by_permission} xKey="name" yKey="value" empty="No active links" /></Section>}
      <KeyCharts d={d} />
    </div>
    {!compact && <div className="mt-5"><WrongPasswordTrigger pt={d.password_trigger} /></div>}
    {compact && <p className="mt-3 text-right text-sm"><Link to="/app/security" className="font-semibold text-brand-600">Open full Security dashboard →</Link></p>}
  </>;
}

/* ----------------------------------------------------------------- helpers */
function FilePicker({ onPick, onClose, title = "Choose a file" }: { onPick: (f: any) => void; onClose: () => void; title?: string }) {
  const [q, setQ] = useState(""); const dq = useDebounced(q);
  const files = useFetch<any>("/files", { q: dq || undefined, page_size: 10 });
  return <Modal open onClose={onClose} title={title}>
    <input aria-label="Search your files" className="input mb-3" placeholder="Search your files…" value={q} onChange={(e) => setQ(e.target.value)} />
    <div className="max-h-72 space-y-1 overflow-auto">{files.loading ? <Spinner /> : files.data?.items.length ? files.data.items.map((f: any) =>
      <button key={f.id} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => onPick(f)}><span className="truncate font-medium">{f.name}</span><span className="text-xs text-slate-500">{fmtBytes(f.size)}</span></button>) : <Empty title="No files found" />}</div>
  </Modal>;
}

function useFlash() {
  const [m, setM] = useState<{ t: string; err?: boolean } | null>(null);
  const flash = (t: string, err?: boolean) => { setM({ t, err }); setTimeout(() => setM(null), 6000); };
  const node = m && <Notice kind={m.err ? "warn" : "success"}>{m.t}</Notice>;
  return { flash, node };
}

/* -------------------------------------------------------------------- tabs */
function TempLinks() {
  const sh = useFetch<any>("/shares/mine"); const { flash, node } = useFlash();
  const [pick, setPick] = useState(false); const [target, setTarget] = useState<any>(null);
  const revoke = async (id: string) => { try { await api.post(`/shares/${id}/revoke`); flash("Link revoked"); sh.reload(); } catch (e) { flash(errMsg(e), true); } };
  return <Section title="Temporary share links" right={<button className="btn-primary !py-1.5" onClick={() => setPick(true)}><Link2 className="h-4 w-4" />New temporary link</button>}>
    <p className="mb-3 text-sm text-slate-600">Time-limited links with a defined permission (view-only or download), optional passcode and download limit. They stop working at expiry or the moment you revoke them.</p>
    {node}
    {sh.error ? <ErrorBox message={sh.error} onRetry={sh.reload} /> : !sh.data ? <Loading /> : <Table rowKey={(x: any) => x.id} rows={sh.data.items} empty={<Empty title="No share links yet" hint="Create one with “New temporary link”." />}
      cols={[{ key: "f", header: "File", render: (x: any) => <span className="font-semibold">{x.file_name}</span> },
        { key: "k", header: "Type", render: (x: any) => x.kind === "link" ? <Badge tone="blue">Link</Badge> : <Badge tone="purple">{x.recipient_email}</Badge> },
        { key: "p", header: "Access", render: (x: any) => <span className="flex items-center gap-1.5">{x.permission === "download" ? "View + download" : "View only"}{x.passcode_protected && <Badge tone="amber">Passcode</Badge>}</span> },
        { key: "e", header: "Expires", render: (x: any) => fmtDate(x.expires_at) },
        { key: "u", header: "Uses", render: (x: any) => x.max_downloads ? `${x.use_count} / ${x.max_downloads}` : x.use_count },
        { key: "s", header: "Status", render: (x: any) => <Badge tone={statusTone(x.status)}>{String(x.status).replace("_", " ")}</Badge> },
        { key: "a", header: "", className: "text-right", render: (x: any) => x.status === "active" ? <button className="btn-secondary !py-1.5 text-red-700" onClick={() => revoke(x.id)}>Revoke</button> : null }]} />}
    {pick && <FilePicker title="Choose a file to share" onClose={() => setPick(false)} onPick={(f) => { setPick(false); setTarget(f); }} />}
    {target && <ShareModal file={target} onClose={() => setTarget(null)} onDone={sh.reload} />}
  </Section>;
}

function DownloadTracking() {
  const r = useRange(30);
  const dl = useFetch<any>("/downloads/mine"); const ov = useFetch<any>("/my-security/overview", { start: r.start, end: r.end });
  return <div className="space-y-5">
    <Section title="Download tracking" right={<RangeSelect r={r} />}>
      <p className="mb-3 text-sm text-slate-600">Every authorised download or view of your files is recorded with who, how (owner or share link), size and time.</p>
      {ov.data ? <Lines area data={ov.data.series.downloads} keys={["count"]} colors={{ count: "#991b1b" }} names={{ count: "Downloads" }} empty="No downloads in this period" /> : <Loading />}
    </Section>
    <Section title="Download history">{dl.error ? <ErrorBox message={dl.error} onRetry={dl.reload} /> : !dl.data ? <Loading /> :
      <Table rowKey={(x: any) => x.created_at + x.file_name + x.by} rows={dl.data.items} empty={<Empty title="No downloads yet" />}
        cols={[{ key: "f", header: "File", render: (x: any) => x.file_name }, { key: "a", header: "Action", render: (x: any) => x.action }, { key: "b", header: "By", render: (x: any) => x.by },
          { key: "v", header: "Via", render: (x: any) => x.via }, { key: "s", header: "Size", render: (x: any) => fmtBytes(x.size) }, { key: "d", header: "When", render: (x: any) => fmtDate(x.created_at) }]} />}</Section>
  </div>;
}

function AuditLog() {
  const a = useFetch<any>("/activity", { page_size: 12 });
  return <Section title="Audit log" right={<Link to="/app/activity" className="text-sm font-semibold text-brand-600">Open full log →</Link>}>
    <p className="mb-3 text-sm text-slate-600">Important file activities and security-related events are written to an append-only, hash-chained log. You see actions you performed and events concerning your own files.</p>
    {a.error ? <ErrorBox message={a.error} onRetry={a.reload} /> : !a.data ? <Loading /> :
      <Table rowKey={(x: any) => x.id} rows={a.data.items} empty={<Empty title="No activity yet" />}
        cols={[{ key: "a", header: "Action", render: (x: any) => <span className="font-semibold">{x.action}</span> }, { key: "o", header: "Result", render: (x: any) => <Badge tone={x.outcome === "success" ? "green" : "red"}>{x.outcome}</Badge> },
          { key: "w", header: "By", render: (x: any) => x.by_me ? "You" : "Someone else (on your file)" }, { key: "d", header: "When", render: (x: any) => fmtDate(x.created_at) }]} />}
  </Section>;
}

function SecureTokens() {
  const sh = useFetch<any>("/shares/mine"); const { flash, node } = useFlash();
  const [file, setFile] = useState<any>(null); const [pick, setPick] = useState(false); const [perm, setPerm] = useState("view"); const [hours, setHours] = useState(24); const [max, setMax] = useState("");
  const [busy, setBusy] = useState(false); const [res, setRes] = useState<any>(null); const [copied, setCopied] = useState(false);
  const generate = async () => {
    if (!file) return; setBusy(true); setRes(null);
    try { const r = await api.post("/shares", { file_id: file.id, kind: "link", permission: perm, expires_in_hours: hours, max_downloads: max ? Number(max) : undefined }); setRes(r.data); sh.reload(); }
    catch (e) { flash(errMsg(e), true); } finally { setBusy(false); }
  };
  const revoke = async (id: string) => { try { await api.post(`/shares/${id}/revoke`); flash("Token revoked"); sh.reload(); } catch (e) { flash(errMsg(e), true); } };
  const tokens = (sh.data?.items || []).filter((x: any) => x.kind === "link");
  return <div className="space-y-5">
    <Section title="Generate a secure access token">
      <p className="mb-3 text-sm text-slate-600">Each token is 256 bits from a cryptographically secure random generator. Only its SHA-256 hash is stored, so the token is shown <b>once</b> — copy it now.</p>
      {node}
      <div className="grid gap-3 md:grid-cols-4">
        <button className="input text-left" onClick={() => setPick(true)}>{file ? file.name : "Choose a file…"}</button>
        <select aria-label="Permission" className="input" value={perm} onChange={(e) => setPerm(e.target.value)}><option value="view">View only</option><option value="download">View + download</option></select>
        <select aria-label="Expiry" className="input" value={hours} onChange={(e) => setHours(Number(e.target.value))}><option value={1}>Expires in 1 hour</option><option value={24}>24 hours</option><option value={168}>7 days</option></select>
        <input aria-label="Maximum uses" type="number" min={1} className="input" placeholder="Max uses (optional)" value={max} onChange={(e) => setMax(e.target.value)} />
      </div>
      <div className="mt-3 flex justify-end"><button className="btn-primary" disabled={!file || busy} onClick={generate}>{busy ? <Spinner className="h-4 w-4" /> : <Fingerprint className="h-4 w-4" />}Generate token</button></div>
      {res?.url && <div className="mt-4 rounded-xl border border-red-200 bg-red-50/40 p-4"><p className="text-sm font-semibold text-red-900">Token created — expires {fmtDate(res.expires_at)}</p>
        <div className="mt-2 flex gap-2"><input readOnly aria-label="Secure link" className="input font-mono text-xs" value={res.url} onFocus={(e) => e.target.select()} />
          <button className="btn-secondary" onClick={async () => { await navigator.clipboard.writeText(res.url); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Copied" : "Copy"}</button></div></div>}
    </Section>
    <Section title="My tokens"><Table rowKey={(x: any) => x.id} rows={tokens} empty={<Empty title="No tokens yet" />}
      cols={[{ key: "f", header: "File", render: (x: any) => x.file_name }, { key: "i", header: "Token ID", render: (x: any) => <code className="text-xs">{String(x.id).slice(0, 8)}…</code> }, { key: "p", header: "Access", render: (x: any) => x.permission },
        { key: "e", header: "Expires", render: (x: any) => fmtDate(x.expires_at) }, { key: "u", header: "Uses", render: (x: any) => x.max_downloads ? `${x.use_count} / ${x.max_downloads}` : x.use_count },
        { key: "s", header: "Status", render: (x: any) => <Badge tone={statusTone(x.status)}>{String(x.status).replace("_", " ")}</Badge> },
        { key: "a", header: "", className: "text-right", render: (x: any) => x.status === "active" ? <button className="btn-secondary !py-1.5 text-red-700" onClick={() => revoke(x.id)}>Revoke</button> : null }]} /></Section>
    {pick && <FilePicker onClose={() => setPick(false)} onPick={(f) => { setFile(f); setPick(false); }} />}
  </div>;
}

function KeyRotation() {
  const k = useFetch<any>("/my-security/keys"); const { flash, node } = useFlash(); const [busy, setBusy] = useState("");
  const run = async (label: string, body: any) => {
    setBusy(label);
    try { const r = await api.post("/my-security/keys/rotate", body); flash(`${r.data.rotated} key(s) ${body.mode === "rewrap" ? "re-wrapped" : "rotated"}${r.data.failed.length ? `, ${r.data.failed.length} failed` : ""}.`, r.data.failed.length > 0); k.reload(); }
    catch (e) { flash(errMsg(e), true); } finally { setBusy(""); }
  };
  if (k.error) return <ErrorBox message={k.error} onRetry={k.reload} />; if (!k.data) return <Loading />;
  const p = k.data.policy;
  return <div className="space-y-5">
    <Section title="Key rotation policy" right={<Badge tone={k.data.due ? "red" : "green"}>{k.data.due ? `${k.data.due} due` : "All keys current"}</Badge>}>
      <div className="grid gap-3 sm:grid-cols-3 text-sm">
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Rotate data keys every</p><p className="text-xl font-bold text-red-900">{p.rotate_every_days} days</p></div>
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Active master key</p><p className="text-xl font-bold text-red-900">v{p.active_master_key}</p></div>
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Master key source</p><p className="text-sm font-semibold">{p.master_key_source}</p></div>
      </div>
      <p className="mt-3 text-sm text-slate-600">{p.description}</p>
      <p className="mt-1 text-xs text-slate-500"><b>Rotate key</b> generates a brand-new AES-256 data key and re-encrypts the file. <b>Re-wrap</b> moves the existing data key under the newest master key without touching the file.</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button className="btn-secondary" disabled={!!busy} onClick={() => run("rewrap", { mode: "rewrap" })}>{busy === "rewrap" ? <Spinner className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}Re-wrap all to v{p.active_master_key}</button>
        <button className="btn-primary" disabled={!!busy || !k.data.due} onClick={() => run("due", { mode: "data_key", only_due: true })}>{busy === "due" ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}Rotate all due keys</button>
      </div>{node && <div className="mt-3">{node}</div>}
    </Section>
    <Section title="Encryption keys per file"><Table rowKey={(x: any) => x.id} rows={k.data.files} empty={<Empty title="No files yet" />}
      cols={[{ key: "n", header: "File", render: (x: any) => <span className="font-semibold">{x.name}</span> }, { key: "a", header: "Algorithm", render: (x: any) => x.algorithm }, { key: "m", header: "Master key", render: (x: any) => <Badge tone={x.outdated_master_key ? "red" : "green"}>v{x.kek_version}</Badge> },
        { key: "l", header: "Last rotated", render: (x: any) => x.last_rotated ? fmtDate(x.last_rotated) : <span className="text-slate-500">Never (uploaded {fmtDate(x.key_created_or_rotated)})</span> },
        { key: "g", header: "Key age", render: (x: any) => `${x.age_days} d` }, { key: "s", header: "Status", render: (x: any) => <Badge tone={x.due ? "red" : "green"}>{x.due ? "Due" : "Current"}</Badge> },
        { key: "x", header: "", className: "text-right", render: (x: any) => <button className="btn-secondary !py-1.5" disabled={!!busy} onClick={() => run(x.id, { mode: "data_key", file_ids: [x.id] })}>{busy === x.id ? <Spinner className="h-4 w-4" /> : "Rotate key"}</button> }]} /></Section>
  </div>;
}

const TABS = [
  { id: "links", label: "Temporary Share Links", icon: Link2 }, { id: "downloads", label: "Download Tracking", icon: Download }, { id: "audit", label: "Audit Logging", icon: FileText },
  { id: "tokens", label: "Secure Tokens", icon: Fingerprint }, { id: "keys", label: "Key Rotation", icon: RefreshCw },
] as const;

/** The five user-dashboard security features, each fully working (not just described). */
export function SecurityTools() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("links");
  return <div className="mt-8">
    <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-navy-950"><ShieldCheck className="h-5 w-5 text-red-800" />Manage your file security</h2>
    <div role="tablist" aria-label="Security tools" className="mb-5 flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
      {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${tab === t.id ? "bg-white text-navy-950 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}><t.icon className="h-4 w-4" />{t.label}</button>)}
    </div>
    {tab === "links" && <TempLinks />}{tab === "downloads" && <DownloadTracking />}{tab === "audit" && <AuditLog />}{tab === "tokens" && <SecureTokens />}{tab === "keys" && <KeyRotation />}
  </div>;
}
