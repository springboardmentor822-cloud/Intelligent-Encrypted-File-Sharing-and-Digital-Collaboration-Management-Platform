import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getDashboardAnalytics, getStorageSummary, getSecurityStatus, getApiErrorMessage } from "./api";

const SECURITY_FEATURES = [
  ["AES-256 encryption", "New uploads are encrypted before storage with AES-256-GCM. Existing records are migrated without changing file IDs or permissions.", "Encryption status is deployment dependent.", "AES"],
  ["Private cloud storage", "TrustShare supports private Azure Blob Storage for new uploads when configured. Existing local files remain in their current storage until migrated.", "Azure Blob Storage is not selected or is not fully configured.", "AZURE"],
  ["HTTPS / TLS", "TLS protects browser-to-server traffic when configured by the deployment.", "Deployment dependent", "⇄"],
  ["JWT authentication", "Signed bearer tokens authenticate API requests and expire on a configured schedule.", "Active", "◈"],
  ["OAuth2 authentication", "Google and Microsoft sign-in flows are supported when provider credentials are configured.", "Deployment dependent", "◎"],
  ["Role-based access control", "Backend route dependencies enforce user and super-admin roles.", "Active", "♙"],
  ["Temporary share links", "File and folder access grants can have expiration times and can be revoked.", "File and folder link access is checked by the backend.", "LINK"],
  ["Download tracking", "Successful file downloads are recorded as activity events.", "Active", "⇩"],
  ["Audit logging", "Important account, file, folder, and sharing actions are recorded in the activity store.", "Active", "◷"],
  ["Secure token generation", "Supported recovery and session operations use cryptographically secure random values.", "Active", "⌑"],
  ["Key rotation", "File data keys can be rewrapped with a new configured key without re-encrypting file contents.", "Retain old keys until rotation completes.", "KEY"],
];

const TYPES = ["documents", "images", "videos", "other"];
const TYPE_LABELS = { documents: "Documents", images: "Images", videos: "Videos", other: "Other files" };
const COLORS = ["#60a5fa", "#22d3ee", "#a78bfa", "#2dd4bf"];

function formatBytes(value = 0) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 4);
  return `${(bytes / 1024 ** unit).toFixed(1)} ${["B", "KB", "MB", "GB", "TB"][unit]}`;
}
function SectionTitle({ eyebrow, title, description, children }) { return <div className="insights-heading"><div><span className="insights-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{children}</div>; }
function StatCard({ icon, label, value, note, tone = "blue" }) { return <article className="insight-stat"><span className={`insight-stat-icon ${tone}`}>{icon}</span><span className="insight-stat-label">{label}</span><strong>{value}</strong><small>{note}</small></article>; }
function DataTable({ title, columns, rows = [], empty, formatDate, viewTo }) {
  return <section className="insight-panel insight-table-panel"><div className="insight-panel-heading"><h2>{title}</h2><Link to={viewTo}>{title === "Recent uploads" ? "View all" : "View activity"} ↗</Link></div>{!rows.length ? <p className="insight-empty">{empty}</p> : <div className="insight-table-scroll"><table className="insight-table"><thead><tr>{columns.map((column) => <th key={column.label}>{column.label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id ?? index}>{columns.map((column) => <td key={column.label}>{column.render ? column.render(row) : column.date ? formatDate(row[column.key]) : row[column.key] ?? "—"}</td>)}</tr>)}</tbody></table></div>}</section>;
}

function LineChart({ rows, series, valueMax }) {
  const max = Math.max(1, valueMax || 1);
  const points = (key) => rows.map((row, index) => `${rows.length < 2 ? 300 : 18 + index * 564 / (rows.length - 1)},${145 - (Number(row[key]) / max) * 125}`).join(" ");
  return <svg className="insight-line-chart" viewBox="0 0 600 180" role="img" aria-label="Daily downloads, unique downloaders, and shared downloads">{[20, 60, 103, 145].map((y) => <line key={y} x1="18" x2="582" y1={y} y2={y} className="chart-gridline"/>)}{series.map(([key, color]) => <polyline key={key} points={points(key)} style={{ stroke: color }}/>)}</svg>;
}

export function FileAnalyticsPage() {
  const [days, setDays] = useState(30); const [custom, setCustom] = useState(false); const [start, setStart] = useState(""); const [end, setEnd] = useState("");
  const [data, setData] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    getDashboardAnalytics(days, custom ? start || null : null, custom ? end || null : null).then((result) => { if (active) { setData(result); setError(""); } }).catch((err) => { if (active) setError(getApiErrorMessage(err)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days, custom, start, end, retry]);
  const reports = data?.reports || [];
  const typeRows = (data?.storage_by_type || []).slice().sort((a, b) => TYPES.indexOf(a.type) - TYPES.indexOf(b.type));
  const sumBytes = typeRows.reduce((sum, row) => sum + row.bytes, 0);
  let cumulative = 0;
  const donutStops = typeRows.map((row) => { const begin = cumulative; cumulative += sumBytes ? row.bytes / sumBytes * 360 : 0; return `${COLORS[TYPES.indexOf(row.type)] || COLORS[3]} ${begin}deg ${cumulative}deg`; });
  const formatDate = (value) => value ? new Date(value).toLocaleString() : "—";
  const capacity = data?.summary.storage_capacity_bytes;
  const fileType = (name) => { const ext = String(name || "").split(".").pop(); return ext && ext !== name ? ext.toUpperCase() : "File"; };
  const uploadMax = Math.max(1, ...reports.map((row) => row.uploads || 0));
  const sharesMax = Math.max(1, ...reports.map((row) => (row.direct_shares || 0) + (row.folder_shares || 0)));
  const downloadMax = Math.max(1, ...reports.flatMap((row) => [row.downloads || 0, row.unique_users || 0, row.shared_downloads || 0]));
  return <div className="insights-page"><SectionTitle eyebrow="YOUR WORKSPACE" title="File analytics" description="Storage and activity from files and sharing records in your account."><div className="insight-range"><select aria-label="Analytics date range" value={custom ? "custom" : days} onChange={(event) => event.target.value === "custom" ? setCustom(true) : (setCustom(false), setDays(Number(event.target.value)))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value="custom">Custom range</option></select>{custom && <><input aria-label="Start date" type="date" value={start} onChange={(event) => setStart(event.target.value)}/><input aria-label="End date" type="date" value={end} onChange={(event) => setEnd(event.target.value)}/></>}</div></SectionTitle>
    {error && <div className="insight-error" role="alert">{error} <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button></div>}
    {loading && !data ? <div className="insight-panel insight-empty">Loading your file analytics…</div> : data && <>
      <div className="insight-stat-grid"><StatCard icon="▤" label="Total storage used" value={formatBytes(data.summary.storage_used_bytes)} note={`${formatBytes(capacity)} capacity · ${data.summary.storage_used_percent ?? 0}% used`} tone="blue"/><StatCard icon="↑" label="Total files" value={data.summary.file_count ?? 0} note={`${data.summary.folder_count ?? 0} folders`} tone="green"/><StatCard icon="↓" label="Total downloads" value={data.summary.downloads} note="Recorded download events" tone="purple"/><StatCard icon="↗" label="Shared files" value={data.summary.total_shared_files ?? 0} note={`${data.summary.total_file_invitations ?? 0} invitations`} tone="orange"/></div>
      <div className="insight-stat-grid"><StatCard icon="◷" label="Sent invitations" value={data.summary.invitation_status_counts?.sent ?? 0} note="Accepted by Gmail for sending" tone="green"/><StatCard icon="..." label="Pending invitations" value={(data.summary.invitation_status_counts?.pending ?? 0) + (data.summary.invitation_status_counts?.sending ?? 0)} note="Created or currently sending" tone="blue"/><StatCard icon="!" label="Failed invitations" value={data.summary.invitation_status_counts?.failed ?? 0} note="Needs retry" tone="orange"/><StatCard icon="✓" label="Revoked invitations" value={data.summary.revoked_file_invitations ?? 0} note="Access has been revoked" tone="purple"/></div>
      <div className="insight-stat-grid"><StatCard icon="?" label="Sent invitations" value={data.summary.invitation_status_counts?.sent ?? 0} note="Accepted by Gmail for sending" tone="green"/><StatCard icon="?" label="Pending invitations" value={(data.summary.invitation_status_counts?.pending ?? 0) + (data.summary.invitation_status_counts?.sending ?? 0)} note="Created or currently sending" tone="blue"/><StatCard icon="!" label="Failed invitations" value={data.summary.invitation_status_counts?.failed ?? 0} note="Needs retry" tone="orange"/><StatCard icon="?" label="Revoked invitations" value={data.summary.revoked_file_invitations ?? 0} note="Access has been revoked" tone="purple"/></div>
      <div className="insight-grid insight-grid-wide"><section className="insight-panel"><div className="insight-panel-heading"><div><h2>Storage usage</h2><p>Current files grouped by type</p></div></div><div className="insight-donut-layout"><div className="insight-donut" style={{ background: sumBytes ? `conic-gradient(${donutStops.join(",")})` : "#edf2f8" }}><span>{formatBytes(sumBytes)}<small>of {formatBytes(capacity)}</small></span></div><div className="insight-legend">{TYPES.map((type, index) => { const row = typeRows.find((item) => item.type === type) || { bytes: 0, file_count: 0 }; const pct = sumBytes ? Math.round(row.bytes / sumBytes * 100) : 0; return <div key={type}><i style={{ background: COLORS[index] }}/><span>{TYPE_LABELS[type]} <small>{row.file_count} files · {pct}%</small></span><strong>{formatBytes(row.bytes)}</strong></div>; })}</div></div></section>
        <section className="insight-panel"><div className="insight-panel-heading"><div><h2>Download analytics</h2><p>Daily downloads, distinct downloaders, and shared-file downloads</p></div></div><div className="insight-chart-legend"><span><i className="chart-blue"/>Downloads</span><span><i className="chart-green"/>Unique users</span><span><i className="chart-purple"/>Shared downloads</span></div><LineChart rows={reports} valueMax={downloadMax} series={[["downloads", "#3778e5"], ["unique_users", "#20b787"], ["shared_downloads", "#8659d9"]]}/></section></div>
      <div className="insight-grid"><section className="insight-panel"><div className="insight-panel-heading"><div><h2>File upload reports</h2><p>Uploads grouped by file type over time</p></div></div><div className="insight-chart-legend">{TYPES.map((type, index) => <span key={type}><i style={{ background: COLORS[index] }}/>{TYPE_LABELS[type]}</span>)}</div><div className="insight-bar-chart">{reports.map((row) => <div className="insight-chart-day" key={row.date} title={`${row.date}: ${row.uploads} uploads`}><div className="insight-bars">{TYPES.map((type, index) => <i key={type} style={{ height: `${Math.max(row.upload_types?.[type] ? 6 : 2, (row.upload_types?.[type] || 0) / uploadMax * 100)}%`, background: COLORS[index] }}/>)}</div><small>{new Date(`${row.date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small></div>)}</div></section>
        <section className="insight-panel"><div className="insight-panel-heading"><div><h2>Sharing activity</h2><p>File shares and folder access grants</p></div></div><div className="insight-chart-legend"><span><i className="chart-blue"/>Direct file shares</span><span><i className="chart-orange"/>Folder grants</span></div><div className="insight-bar-chart">{reports.map((row) => <div className="insight-chart-day" key={row.date} title={`${row.date}: ${row.direct_shares} file shares, ${row.folder_shares} folder grants`}><div className="insight-bars"><i className="chart-blue" style={{ height: `${Math.max(row.direct_shares ? 6 : 2, (row.direct_shares || 0) / sharesMax * 100)}%` }}/><i className="chart-orange" style={{ height: `${Math.max(row.folder_shares ? 6 : 2, (row.folder_shares || 0) / sharesMax * 100)}%` }}/></div><small>{new Date(`${row.date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small></div>)}</div></section></div>
      <div className="insight-grid"><DataTable title="Recent uploads" viewTo="/dashboard/recent-uploads" columns={[{ label: "File", key: "file_name" }, { label: "Size", render: (row) => formatBytes(row.size_bytes) }, { label: "Type", render: (row) => fileType(row.file_name) }, { label: "Uploaded", key: "created_at", date: true }]} rows={data.recent_uploads} empty="No uploads yet." formatDate={formatDate}/><DataTable title="Recent downloads" viewTo="/dashboard/activity" columns={[{ label: "File", key: "file_name" }, { label: "Downloaded by", key: "downloaded_by" }, { label: "Size", render: (row) => formatBytes(row.size_bytes) }, { label: "Downloaded", key: "created_at", date: true }]} rows={data.recent_downloads} empty="No download events are recorded in this period." formatDate={formatDate}/></div>
    </>}
  </div>;
}

export function UserSecurityPage() {
  const [data, setData] = useState(null); const [error, setError] = useState(''); const [selected, setSelected] = useState(null);
  useEffect(() => { let active = true; getSecurityStatus().then((result) => { if (active) setData(result.features || {}); }).catch((err) => { if (active) setError(getApiErrorMessage(err) || 'Security status could not be loaded.'); }); return () => { active = false; }; }, []);
  const statusClass = (status) => status === 'Active' ? 'is-active' : ['Partial', 'Deployment dependent', 'Configuration required'].includes(status) ? 'is-partial' : 'is-limited';
  const keys = { 'AES-256 encryption':'file_encryption', 'Private cloud storage':'cloud_storage', 'HTTPS / TLS':'https_tls', 'JWT authentication':'jwt', 'OAuth2 authentication':'oauth', 'Role-based access control':'rbac', 'Temporary share links':'temporary_links', 'Download tracking':'download_tracking', 'Audit logging':'audit_logging', 'Secure token generation':'secure_tokens', 'Key rotation':'key_rotation' };
  return <div className="insights-page"><SectionTitle eyebrow="ACCOUNT & DATA" title="Security" description="A transparent view of the protections available in this TrustShare build."/>{error && <div className="insight-error" role="alert">{error}</div>}<div className="security-feature-grid">{SECURITY_FEATURES.map(([title, description, fallback, icon]) => { const feature = data?.[keys[title]]; const status = feature?.status || (data ? 'Unavailable' : 'Loading'); return <article className="security-feature-card" key={title}><span className="security-feature-icon">{icon}</span><div className="security-feature-copy"><h2>{title}</h2><p>{description}</p><span className={`security-status ${statusClass(status)}`}>{status}</span></div><button type="button" className="security-learn-more" onClick={() => setSelected({title, details: feature?.details || fallback})}>Learn more</button></article>; })}</div>{selected && <div className="ts-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section className="ts-dialog" role="dialog" aria-modal="true" aria-labelledby="security-detail-title"><p className="ts-dialog-eyebrow">SECURITY DETAILS</p><h2 id="security-detail-title">{selected.title}</h2><p className="ts-dialog-description">{selected.details}</p><div className="ts-dialog-actions"><button type="button" className="ts-dialog-primary" onClick={() => setSelected(null)}>Close</button></div></section></div>}</div>;
}

export function StoragePage() {
  const [storage, setStorage] = useState(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(true); const [retry, setRetry] = useState(0);
  useEffect(() => { let active = true; getStorageSummary().then((result) => { if (active) { setStorage(result); setError(""); } }).catch((err) => { if (active) setError(getApiErrorMessage(err)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [retry]);
  const breakdown = storage?.storage_by_type || []; const total = Number(storage?.used_bytes) || 0;
  const colors = ["#60a5fa", "#22d3ee", "#a78bfa", "#2dd4bf"];
  let degrees = 0;
  const slices = breakdown.map((row, index) => { const start = degrees; degrees += total ? Number(row.size_bytes) / total * 360 : 0; return `${colors[index]} ${start}deg ${degrees}deg`; });
  const labels = { documents: "Documents", images: "Images", videos: "Videos", other: "Other files" };
  return <div className="insights-page"><SectionTitle eyebrow="YOUR WORKSPACE" title="Storage" description="Storage use from your saved file records and storage objects."><button className="button" type="button" onClick={() => setRetry((value) => value + 1)} disabled={loading}>Refresh</button></SectionTitle>
    {error && <div className="insight-error" role="alert">{error}<button type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button></div>}
    {loading && !storage ? <section className="insight-panel insight-empty">Loading storage information…</section> : storage && <>
      <div className="insight-stat-grid"><StatCard icon="▤" label="Storage used" value={formatBytes(storage.used_bytes)} note={`${storage.file_count} saved files`} tone="blue"/><StatCard icon="◉" label="Capacity" value={formatBytes(storage.total_bytes)} note="Configured account quota" tone="purple"/><StatCard icon="＋" label="Available" value={formatBytes(storage.remaining_bytes)} note={`${storage.usage_percent}% used`} tone="green"/><StatCard icon="↑" label="Maximum upload" value={formatBytes(storage.max_file_size_bytes)} note="Per-file upload limit" tone="orange"/></div>
      <div className="insight-grid insight-grid-wide"><section className="insight-panel"><div className="insight-panel-heading"><div><h2>Usage by file type</h2><p>{storage.file_count} files · {formatBytes(storage.used_bytes)} total</p></div></div><div className="insight-donut-layout"><div className="insight-donut" style={{ background: total ? `conic-gradient(${slices.join(",")})` : "#edf2f8" }}><span>{formatBytes(total)}<small>used</small></span></div><div className="insight-legend">{breakdown.map((row, index) => <div key={row.type}><i style={{ background: colors[index] }}/><span>{labels[row.type] || row.type}<small>{row.file_count} files</small></span><strong>{formatBytes(row.size_bytes)}</strong></div>)}</div></div></section>
        <section className="insight-panel"><div className="insight-panel-heading"><div><h2>Largest files</h2><p>Largest saved files in this account</p></div></div>{storage.largest_files?.length ? <div className="insight-table-scroll"><table className="insight-table"><thead><tr><th>File</th><th>Size</th><th>Added</th></tr></thead><tbody>{storage.largest_files.map((file) => <tr key={file.id}><td>{file.original_name}</td><td>{formatBytes(file.size_bytes)}</td><td>{file.created_at ? new Date(file.created_at).toLocaleDateString() : "—"}</td></tr>)}</tbody></table></div> : <p className="insight-empty">No files are stored yet.</p>}</section></div>
    </>}
  </div>;
}

export function UnsupportedWorkspacePage({ title, description }) { return <div className="insights-page"><SectionTitle eyebrow="WORKSPACE" title={title} description={description}/><section className="insight-panel insight-empty"><strong>This feature is not available yet.</strong><p>TrustShare does not currently store the data needed for this view. Your existing files and permissions are unchanged.</p></section></div>; }
