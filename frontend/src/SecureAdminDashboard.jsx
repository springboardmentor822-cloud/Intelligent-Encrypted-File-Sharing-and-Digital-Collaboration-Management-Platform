import { Component, useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  clearSession,
  logoutUser,
  getAdminAuditLogs,
  getAdminFileAnalytics,
  getAdminFiles,
  getAdminOverview,
  getAdminPlatformSettings,
  getAdminSharingReports,
  getAdminSecurityDashboard,
  getAdminKeyRotationPreview,
  applyAdminKeyRotation,
  getAdminSystemHealth,
  getStorageAnalytics,
  getFileAnalytics,
  getDownloadAnalytics,
  getSharingAnalytics,
  getSecurityEvents,
  getAdminNotifications,
  getAdminUsers,
  updateAdminPlatformSettings,
  getApiErrorMessage,
  getCurrentUser,
} from "./api";
import "./SecureAdminDashboard.css";

const sections = [
  { label: "Dashboard", path: "/admin", icon: "dashboard" },
  { label: "User Management", path: "/admin/users", icon: "users" },
  { label: "File Management", path: "/admin/files", icon: "files" },
  { label: "Sharing Reports", path: "/admin/sharing-reports", icon: "share" },
  { label: "Security Dashboard", path: "/admin/security-dashboard", icon: "shield" },
  { label: "Analytics", path: "/admin/analytics", icon: "chart" },
  { label: "System Monitoring", path: "/admin/system-monitoring", icon: "monitor" },
  { label: "Activity Logs", path: "/admin/audit-logs", icon: "activity" },
  { label: "Storage Analytics", path: "/admin/storage-analytics", icon: "database" },
  { label: "Security Monitoring", path: "/admin/security-monitoring", icon: "shield" },
  { label: "Notifications", path: "/admin/notifications", icon: "activity" },
  { label: "Settings", path: "/admin/settings", icon: "settings" },
];

const overviewActivityTypes = [
  "registration_success",
  "file_upload_success", "file_delete_success", "file_move_success", "file_download_success", "file_download_failed",
  "file_share_created", "file_share_changed", "file_share_revoked",
  "folder_create_success", "folder_delete_success", "folder_rename_success",
  "folder_access_granted", "folder_access_changed", "folder_access_revoked",
  "share_email_sending", "share_email_sent", "share_email_failed", "share_email_uncertain",
  "unauthorized_access", "revoked_link_access", "expired_link_access", "login_failed", "login_blocked",
];

const sectionByPath = Object.fromEntries(sections.map(({ label, path }) => [path, label]));
const sectionAliases = {
  "/admin/dashboard": "Dashboard",
  "/admin/user-management": "User Management",
  "/admin/file-management": "File Management",
  "/admin/sharing": "Sharing Reports",
  "/admin/security": "Security Dashboard",
  "/admin/security-alerts": "Security Dashboard",
  "/admin/file-analytics": "Analytics",
  "/admin/monitoring": "System Monitoring",
  "/admin/system-health": "System Monitoring",
  "/admin/activity": "Activity Logs",
  "/admin/activity-logs": "Activity Logs",
  "/admin/storage": "Storage Analytics",
  "/admin/security-monitoring": "Security Monitoring",
  "/admin/notification-management": "Notifications",
};

const ICON_PATHS = {
  dashboard: <><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="11" width="7" height="10" rx="1.5"/><rect x="3" y="14" width="8" height="7" rx="1.5"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  files: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></>,
  share: <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 10.7 6.6-4.4m-6.6 8 6.6 4"/></>,
  shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></>,
  chart: <><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-5 5"/></>,
  monitor: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></>,
  activity: <><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.6.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.6-.9l-1.7.6-1.4-2.4 1.4-1.1a8 8 0 0 1 0-1.9l-1.4-1.2 1.4-2.4 1.7.6a8 8 0 0 1 1.6-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.6.9l1.7-.6 1.4 2.4-1.4 1.2a8 8 0 0 1-.1 1.9Z" transform="translate(-1 -1) scale(1.08)"/></>,
  usersAdd: <><circle cx="9" cy="8" r="4"/><path d="M3 21v-2a6 6 0 0 1 12 0v2m4-11v6m-3-3h6"/></>,
  fileSearch: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h7"/><path d="M14 2v6h6M8 13h5m-5 4h3"/><circle cx="18" cy="18" r="3"/><path d="m20.2 20.2 1.3 1.3"/></>,
  log: <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></>,
  arrow: <><path d="M7 17 17 7M7 7h10v10"/></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2"/></>,
  logout: <><path d="M10 17l5-5-5-5m5 5H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3m-4 5v2"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  database: <><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/></>,
};

function Icon({ name, size = 18, className = "" }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON_PATHS[name] || ICON_PATHS.dashboard}</svg>;
}

function formatBytes(value = 0) {
  const size = Number(value);
  if (!Number.isFinite(size) || size < 0) return "—";
  if (size < 1024) return `${size} B`;
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), 4);
  return `${(size / 1024 ** index).toFixed(1)} ${["B", "KB", "MB", "GB", "TB"][index]}`;
}

function formatDate(value) {
  if (!value) return "Time not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Time not recorded" : date.toLocaleString();
}

function eventTitle(eventType = "") {
  const titles = {
    registration_success: "New account registered",
    file_upload_success: "File uploaded",
    file_delete_success: "File deleted",
    file_move_success: "File moved",
    file_download_success: "File downloaded",
    file_download_failed: "Download blocked",
    file_share_created: "File shared",
    file_share_changed: "File access changed",
    file_share_revoked: "File access revoked",
    folder_create_success: "Folder created",
    folder_delete_success: "Folder deleted",
    folder_rename_success: "Folder renamed",
    share_email_sent: "Share invitation sent",
    share_email_sending: "Share invitation sending",
    share_email_failed: "Share invitation failed",
    share_email_uncertain: "Share invitation status uncertain",
    folder_access_granted: "Folder access granted",
    folder_access_changed: "Folder access changed",
    folder_access_revoked: "Folder access revoked",
    unauthorized_access: "Unauthorized access blocked",
    revoked_link_access: "Revoked link access blocked",
    expired_link_access: "Expired link access blocked",
    login_failed: "Failed sign-in",
    login_blocked: "Sign-in blocked",
  };
  return titles[eventType] || eventType.replaceAll("_", " ");
}

function isShareEvent(event) {
  return /share|folder_access_(granted|changed|revoked)/i.test(event.event_type || "");
}

function isOverviewActivity(event) {
  const type = event?.event_type || event?.activity_type || "";
  return type === "registration_success"
    || /^file_(upload|delete|move|download)_success$/.test(type)
    || type === "file_download_failed"
    || /^file_share_(created|changed|revoked)$/.test(type)
    || /^folder_(create|delete|rename)_success$/.test(type)
    || /^folder_access_(granted|changed|revoked)$/.test(type)
    || /^share_email_(sending|sent|failed|uncertain)$/.test(type)
    || /^(unauthorized_access|revoked_link_access|expired_link_access|login_failed|login_blocked)$/.test(type);
}



function DataTable({
  title,
  rows = [],
  columns = [],
  emptyMessage = "No records found.",
  onViewAll,
  rowKey,
}) {
  return (
    <section className="admin-card admin-table-card">
      {(title || onViewAll) && (
        <header className="admin-card-heading">
          <div>
            {title && <h2>{title}</h2>}
            {title && <p>{rows.length} records loaded</p>}
          </div>

          {onViewAll && (
            <button
              type="button"
              className="admin-text-button"
              onClick={onViewAll}
            >
              View all
            </button>
          )}
        </header>
      )}

      {rows.length > 0 ? (
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map(([label]) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={
                    rowKey
                      ? rowKey(row, index)
                      : `${row.event_type || "record"}-${row.id || index}`
                  }
                >
                  {columns.map(([label, render]) => (
                    <td key={label}>
                      {render(row) ?? "Not recorded"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="admin-empty-inline">
          <p>{emptyMessage}</p>
        </div>
      )}
    </section>
  );
}



function Pagination({ offset, limit, total, onChange }) {
  if (total <= limit) return null;
  const first = offset + 1;
  const last = Math.min(offset + limit, total);
  return <div className="admin-pagination"><button type="button" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>Previous</button><span>Records {first}–{last} of {total}</span><button type="button" disabled={last >= total} onClick={() => onChange(offset + limit)}>Next</button></div>;
}

function MetricCard({ icon, label, value, note, tone = "blue" }) {
  return <article className="admin-metric-card"><span className={`admin-metric-icon ${tone}`}><Icon name={icon}/></span><div className="admin-metric-copy"><span>{label}</span><strong>{value ?? "—"}</strong><small>{note}</small></div></article>;
}

function Skeleton({ className = "" }) {
  return <span className={`admin-skeleton ${className}`} aria-hidden="true"/>;
}

function LoadingOverview() {
  return <div className="admin-overview-content" aria-label="Loading dashboard data">
    <div className="admin-metric-grid">{Array.from({ length: 4 }, (_, index) => <div className="admin-metric-card admin-metric-loading" key={index}><Skeleton className="admin-skeleton-icon"/><div><Skeleton className="admin-skeleton-label"/><Skeleton className="admin-skeleton-value"/><Skeleton className="admin-skeleton-note"/></div></div>)}</div>
    <div className="admin-overview-grid"><section className="admin-card"><Skeleton className="admin-skeleton-heading"/>{Array.from({ length: 4 }, (_, index) => <Skeleton className="admin-skeleton-row" key={index}/>)}</section><section className="admin-card"><Skeleton className="admin-skeleton-heading"/><Skeleton className="admin-skeleton-chart"/></section></div>
  </div>;
}

function ActivityScene({ signals, quiet }) {
  function movePointer(event) {
    if (event.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    event.currentTarget.style.setProperty("--activity-tilt-x", `${(-y * 5).toFixed(2)}deg`);
    event.currentTarget.style.setProperty("--activity-tilt-y", `${(x * 6).toFixed(2)}deg`);
    event.currentTarget.style.setProperty("--activity-light-x", `${((x + 0.5) * 100).toFixed(1)}%`);
    event.currentTarget.style.setProperty("--activity-light-y", `${((y + 0.5) * 100).toFixed(1)}%`);
  }
  function resetPointer(event) {
    event.currentTarget.style.setProperty("--activity-tilt-x", "0deg");
    event.currentTarget.style.setProperty("--activity-tilt-y", "0deg");
    event.currentTarget.style.setProperty("--activity-light-x", "50%");
    event.currentTarget.style.setProperty("--activity-light-y", "45%");
  }
  return <div className={`admin-activity-scene${quiet ? " is-quiet" : " has-records"}`} onPointerMove={movePointer} onPointerLeave={resetPointer} aria-label="TrustShare secure file ecosystem visualization">
    <div className="admin-activity-scene-depth" aria-hidden="true">
      <div className="activity-scene-grid"/><div className="activity-scene-halo"/>
      <div className="activity-scene-orbit orbit-one"/><div className="activity-scene-orbit orbit-two"/>
      <div className={`activity-data-route route-upload${signals.storage ? " is-active" : ""}`}><i/></div>
      <div className={`activity-data-route route-share${signals.sharing ? " is-active" : ""}`}><i/></div>
      <div className={`activity-data-route route-transfer${signals.transfer ? " is-active" : ""}`}><i/></div>
      <div className={`activity-scene-object activity-document${signals.storage ? " is-active" : ""}`}><span className="document-fold"/><Icon name="files" size={18}/><i/><i/><i/><b>FILE</b></div>
      <div className="activity-scene-object activity-folder"><span className="folder-tab"/><span className="folder-lines"><i/><i/><i/></span><b>WORKSPACE</b></div>
      <div className="activity-scene-object activity-vault"><span className="vault-core"><Icon name="shield" size={25}/><Icon name="lock" size={13}/></span><b>ENCRYPTED VAULT</b></div>
      <div className={`activity-scene-object activity-storage${signals.storage ? " is-active" : ""}`}><span className="storage-cloud"><Icon name="database" size={23}/></span><b>SECURE STORAGE</b></div>
      <div className={`activity-scene-object activity-recipient${signals.registration || signals.sharing ? " is-active" : ""}`}><span className="recipient-node"><Icon name="users" size={18}/></span><b>ACCESS</b></div>
      <span className={`activity-security-node${signals.security ? " is-active" : ""}`}><Icon name="shield" size={13}/></span>
      <span className={`activity-permission-node${signals.sharing ? " is-active" : ""}`}><Icon name="lock" size={12}/></span>
      <span className="activity-scene-particle particle-one"/><span className="activity-scene-particle particle-two"/><span className="activity-scene-particle particle-three"/>
    </div>
    <div className="activity-scene-caption">
      {quiet ? <><span className="activity-scene-caption-mark"><Icon name="lock" size={14}/></span><span><strong>Your secure workspace is quiet</strong><small>Activity appears here as files are uploaded, shared, and accessed.</small></span></>
        : <><span className="activity-scene-caption-mark"><Icon name="shield" size={14}/></span><span><strong>TrustShare ecosystem</strong><small>Encrypted files · controlled access</small></span></>}
    </div>
  </div>;
}

function ActivityFeed({ rows, loading, error, onRetry }) {
  const items = rows.filter(isOverviewActivity).slice(0, 7);
  const hasEvent = (pattern) => items.some((item) => pattern.test(item.event_type || item.activity_type || ""));
  const signals = {
    registration: hasEvent(/^registration_success$/),
    storage: hasEvent(/^file_(upload|delete|move)_success$/),
    transfer: hasEvent(/^file_download_(success|failed)$/),
    sharing: hasEvent(/share|folder_access/),
    security: hasEvent(/unauthorized|revoked_link|expired_link|login_(failed|blocked)/),
  };
  return <section className="admin-card admin-activity-card">
    <header className="admin-card-heading"><div><h2>Platform activity</h2><p>File movement, secure sharing, access, and security events</p></div><span className="admin-live-label"><i/> Latest audit records</span></header>
    <ActivityScene signals={signals} quiet={!loading && !error && items.length === 0}/>
    {error ? <div className="admin-activity-state is-error" role="alert"><p>Platform activity could not be loaded. {error}</p><button type="button" className="admin-text-button" onClick={onRetry}>Retry</button></div>
      : loading ? <div className="admin-activity-state" role="status"><span className="admin-spinner"/><p>Loading recent activity…</p></div>
      : items.length ? <ul className="admin-activity-list">{items.map((item, index) => {
        const type = item.event_type || item.activity_type || "";
        const actor = item.username || (item.user_id == null ? "Account not recorded" : `Account ${item.user_id}`);
        const resource = item.target_name || (item.file_id != null ? `File #${item.file_id}` : item.folder_id != null ? `Folder #${item.folder_id}` : "");
        const accent = /share|access/i.test(type) ? "violet" : /delete|failed/i.test(type) ? "amber" : /registration/i.test(type) ? "teal" : "blue";
        const description = item.details || item.activity_description || "";
        return <li key={`${type}-${item.created_at}-${item.activity_id || item.log_id || index}`}>
          <span className={`admin-activity-icon ${accent}`}><Icon name={/share|access/i.test(type) ? "share" : /registration/i.test(type) ? "users" : "files"} size={16}/></span>
          <span className="admin-activity-copy"><strong>{eventTitle(type)}</strong><small>{actor}{resource ? ` · ${resource}` : ""}{item.target_email ? ` · To ${item.target_email}` : ""}</small>{description && description !== eventTitle(type) && <small className="admin-activity-description">{description}</small>}</span>
          <time dateTime={item.created_at || undefined}>{formatDate(item.created_at)}</time>
        </li>;
      })}</ul> : null}
  </section>;
}

function SecurityPanel({ overview, security, onNavigate }) {
  const summary = security?.summary || {};
  const events = (security?.recent_security_events || []).slice(0, 4);
  return <section className="admin-card admin-security-card">
    <header className="admin-card-heading"><div><h2>Security monitoring</h2><p>Recent authentication and access signals</p></div><span className="admin-security-status"><Icon name="shield" size={14}/> Protected</span></header>
    <div className="admin-security-counts">
      <div><span className="admin-status-dot red"/><span>Failed sign-ins <small>Last 24 hours</small></span><strong>{overview.failed_logins_last_24_hours}</strong></div>
      <div><span className="admin-status-dot violet"/><span>Unauthorized requests <small>Last 7 days</small></span><strong>{summary.unauthorized_access_attempts ?? "—"}</strong></div>
      <div><span className="admin-status-dot amber"/><span>Blocked sign-ins <small>Last 7 days</small></span><strong>{summary.blocked_attempts ?? "—"}</strong></div>
    </div>
    <div className="admin-recent-security"><div className="admin-subheading"><strong>Latest security events</strong><button type="button" className="admin-text-button" onClick={() => onNavigate("Security Dashboard")}>Security dashboard <Icon name="arrow" size={14}/></button></div>
      {events.length ? <ul>{events.map((event, index) => <li key={`${event.event_type}-${event.created_at}-${index}`}><span className={`admin-event-mark ${event.event_type === "login_blocked" ? "amber" : "red"}`}><Icon name={event.event_type === "login_blocked" ? "lock" : "shield"} size={14}/></span><span><strong>{eventTitle(event.event_type)}</strong><small>{event.user_id == null ? "Account not recorded" : `Account ${event.user_id}`}</small></span><time>{formatDate(event.created_at)}</time></li>)}</ul> : <p className="admin-no-events">No security events are recorded for the last 7 days.</p>}
    </div>
  </section>;
}

function TrendChart({ rows }) {
  const max = Math.max(1, ...rows.map((row) => Number(row.successful_logins || 0) + Number(row.failed_logins || 0)));
  if (!rows.length) return <div className="admin-chart-empty">No daily authentication records are available.</div>;
  return <div className="admin-trend-chart" role="img" aria-label="Successful and failed sign-in counts by day for the last seven days">
    {rows.map((row) => {
      const successful = Number(row.successful_logins || 0);
      const failed = Number(row.failed_logins || 0);
      const day = new Date(`${row.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" });
      return <div className="admin-trend-day" key={row.date} title={`${row.date}: ${successful} successful, ${failed} failed`}>
        <div className="admin-trend-track"><i className="success" style={{ height: `${successful ? Math.max(4, successful / max * 100) : 0}%` }}/><i className="failed" style={{ height: `${failed ? Math.max(4, failed / max * 100) : 0}%` }}/></div><small>{day}</small>
      </div>;
    })}
  </div>;
}

function EventMix({ auditEvents, overview, analytics }) {
  const items = [
    { label: "Registrations", count: auditEvents.filter((event) => event.event_type === "registration_success").length, color: "blue" },
    { label: "File changes", count: auditEvents.filter((event) => ["file_upload_success", "file_delete_success", "file_move_success", "folder_create_success", "folder_delete_success", "folder_rename_success"].includes(event.event_type)).length, color: "teal" },
    { label: "Sharing", count: auditEvents.filter(isShareEvent).length, color: "violet" },
  ];
  const total = items.reduce((sum, item) => sum + item.count, 0);
  return <section className="admin-card admin-resources-card">
    <header className="admin-card-heading"><div><h2>Platform resources</h2><p>Current records and recent operational activity</p></div><span className="admin-muted-chip">Live totals</span></header>
    <div className="admin-resource-total"><span className="admin-resource-icon"><Icon name="database" size={18}/></span><div><small>Storage consumed across accounts</small><strong>{formatBytes(analytics.current_storage_bytes)}</strong></div><span className="admin-resource-note">No platform quota configured</span></div>
    <div className="admin-resource-pair"><div><span>Registered accounts</span><strong>{overview.total_users.toLocaleString()}</strong></div><div><span>Saved file records</span><strong>{overview.total_files.toLocaleString()}</strong></div></div>
    <div className="admin-mix-heading"><strong>Recent activity mix</strong><small>Latest {auditEvents.length} audit records</small></div>
    {total ? <><div className="admin-mix-track" aria-label="Distribution of recent registrations, file changes, and sharing activity">{items.filter((item) => item.count).map((item) => <span key={item.label} className={item.color} style={{ width: `${item.count / total * 100}%` }}/>)}</div><div className="admin-mix-legend">{items.map((item) => <span key={item.label}><i className={item.color}/>{item.label}<strong>{item.count}</strong></span>)}</div></> : <div className="admin-chart-empty">No matching activity in the latest audit records.</div>}
  </section>;
}

function QuickActions({ onNavigate }) {
  const actions = [
    ["usersAdd", "Manage users", "User Management"],
    ["fileSearch", "Manage files", "File Management"],
    ["share", "Review sharing", "Sharing Reports"],
    ["shield", "Investigate security", "Security Dashboard"],
    ["log", "View audit logs", "Activity Logs"],
  ];
  return <section className="admin-quick-actions"><div className="admin-quick-heading"><div><h2>Administrative actions</h2><p>Jump directly to a platform workspace</p></div></div><div className="admin-action-list">{actions.map(([icon, label, destination]) => <button type="button" key={label} onClick={() => onNavigate(destination)}><Icon name={icon} size={17}/><span>{label}</span><Icon name="arrow" size={14}/></button>)}</div></section>;
}

function Overview({ overview, security, analytics, auditEvents, platformActivityEvents, activityLoading, activityError, onRefreshActivity, onNavigate }) {
  return <div className="admin-overview-content">
    <div className="admin-metric-grid">
      <MetricCard icon="users" label="Registered users" value={overview.total_users.toLocaleString()} note="All platform accounts" tone="blue"/>
      <MetricCard icon="files" label="File records" value={overview.total_files.toLocaleString()} note="Current saved records" tone="teal"/>
      <MetricCard icon="database" label="Storage consumed" value={formatBytes(overview.total_storage_bytes)} note="Across all accounts" tone="violet"/>
      <MetricCard icon="shield" label="Failed sign-ins" value={overview.failed_logins_last_24_hours.toLocaleString()} note="Last 24 hours" tone="red"/>
    </div>
    <div className="admin-overview-grid">
      <ActivityFeed rows={platformActivityEvents} loading={activityLoading} error={activityError} onRetry={onRefreshActivity}/>
      <SecurityPanel overview={overview} security={security} onNavigate={onNavigate}/>
      <EventMix auditEvents={auditEvents} overview={overview} analytics={analytics}/>
      <section className="admin-card admin-trend-card"><header className="admin-card-heading"><div><h2>Authentication trend</h2><p>Successful and failed sign-ins by day · last 7 days</p></div><button type="button" className="admin-text-button" onClick={() => onNavigate("Security Dashboard")}>View security <Icon name="arrow" size={14}/></button></header><div className="admin-chart-legend"><span><i className="success"/>Successful</span><span><i className="failed"/>Failed</span></div><TrendChart rows={security.daily || []}/></section>
    </div>
    <QuickActions onNavigate={onNavigate}/>
  </div>;
}


function TablePage({
  title,
  description,
  rows,
  columns,
  empty,
  onViewAll,
  tableTitle = title,
}) {
  return (
    <>
      <div className="admin-page-intro">
        <div>
          <span className="admin-eyebrow">
            PLATFORM MANAGEMENT
          </span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>

      <DataTable
        title={tableTitle}
        rows={rows}
        columns={columns}
        emptyMessage={empty}
        onViewAll={onViewAll}
      />
    </>
  );
}



function KeyRotationPanel() {
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  const loadPreview = async () => {
    setLoadingPreview(true);
    setMessage("");
    setMessageType("");

    try {
      const result = await getAdminKeyRotationPreview();
      setPreview(result);
    } catch (error) {
      setPreview(null);
      setMessage(getApiErrorMessage(error));
      setMessageType("error");
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleApply = async () => {
    if (!preview || Number(preview.pending) <= 0 || applying) return;

    const confirmed = window.confirm(
      `Apply encryption key rotation? The active key is "${preview.active_key_id}" and ${preview.pending} file(s) are pending. This action will rewrap their encryption keys.`
    );

    if (!confirmed) return;

    setApplying(true);
    setMessage("");
    setMessageType("");

    try {
      const result = await applyAdminKeyRotation();

      setMessage(
        result.message ||
        `Key rotation completed. Files rewrapped: ${result.rewrapped ?? 0}.`
      );
      setMessageType("success");

      try {
        const refreshedPreview = await getAdminKeyRotationPreview();
        setPreview(refreshedPreview);
      } catch {
        setPreview(null);
      }
    } catch (error) {
      setMessage(getApiErrorMessage(error));
      setMessageType("error");
    } finally {
      setApplying(false);
    }
  };

  return (
    <section className="admin-card admin-key-rotation">
      <header className="admin-card-heading">
        <div>
          <h2>Encryption key rotation</h2>
          <p>Preview files that need rewrapping before applying the active key.</p>
        </div>
        <span className="admin-status-pill warning">Super Admin</span>
      </header>

      {preview && (
        <div className="admin-key-rotation-stats">
          <div>
            <span>Active key ID</span>
            <strong>{preview.active_key_id || "Not available"}</strong>
          </div>
          <div>
            <span>Files pending rotation</span>
            <strong>{Number(preview.pending ?? 0).toLocaleString()}</strong>
          </div>
        </div>
      )}

      {message && (
        <p
          className={`admin-key-rotation-message ${messageType}`}
          role="status"
          aria-live="polite"
        >
          {message}
        </p>
      )}

      <div className="admin-key-rotation-actions">
        <button
          type="button"
          className="admin-key-rotation-preview"
          onClick={loadPreview}
          disabled={loadingPreview || applying}
        >
          {loadingPreview ? "Loading preview..." : "Preview Rotation"}
        </button>

        <button
          type="button"
          className="admin-key-rotation-apply"
          onClick={handleApply}
          disabled={
            !preview ||
            Number(preview.pending) <= 0 ||
            loadingPreview ||
            applying
          }
        >
          {applying ? "Applying rotation..." : "Apply Rotation"}
        </button>
      </div>

      {preview && Number(preview.pending) === 0 && (
        <p className="admin-key-rotation-note">
          All encrypted files already use the active key.
        </p>
      )}
    </section>
  );
}
function SecurityDashboard({ data, days, onViewLogs }) {
  const summary = data.summary || {};
  const changes = data.summary_change_percent || {};
  const daily = data.daily || [];
  const statCards = [
    ["Total sign-ins", summary.login_attempts, changes.login_attempts, "blue"],
    ["Successful", summary.successful_logins, changes.successful_logins, "teal"],
    ["Failed", summary.failed_logins, changes.failed_logins, "red"],
    ["Unauthorized", summary.unauthorized_access_attempts, changes.unauthorized_access_attempts, "violet"],
    ["Blocked", summary.blocked_attempts, changes.blocked_attempts, "amber"],
  ];
  const securityRows = data.recent_security_events || [];
  const loginRows = data.recent_logins || [];
  const changeNote = (change) => change == null ? "No prior-period baseline" : `${change > 0 ? "+" : ""}${change}% vs previous period`;
  return <div className="admin-page-content">
    <div className="admin-page-intro"><div><span className="admin-eyebrow">TRUSTSHARE SECURITY</span><h2>Security dashboard</h2><p>Authentication and access events recorded over the selected period.</p></div><span className="admin-period-chip"><Icon name="clock" size={14}/> Last {days} days</span></div>
    <div className="admin-metric-grid admin-security-metrics">{statCards.map(([label, value, change, tone]) => <MetricCard key={label} icon={tone === "red" || tone === "violet" ? "shield" : "activity"} label={label} value={Number(value || 0).toLocaleString()} note={changeNote(change)} tone={tone}/>)}</div>
    <div className="admin-security-chart-grid"><section className="admin-card"><header className="admin-card-heading"><div><h2>Daily authentication</h2><p>Successful and failed sign-ins</p></div></header><div className="admin-chart-legend"><span><i className="success"/>Successful</span><span><i className="failed"/>Failed</span></div><TrendChart rows={daily}/></section>
      <section className="admin-card"><header className="admin-card-heading"><div><h2>Access controls</h2><p>Unauthorized and blocked attempts</p></div></header><div className="admin-access-bars">{daily.slice(-14).map((row) => { const unauthorized = Number(row.unauthorized_access || 0); const blocked = Number(row.blocked_attempts || 0); const max = Math.max(1, ...daily.map((day) => Number(day.unauthorized_access || 0) + Number(day.blocked_attempts || 0))); return <div key={row.date} title={`${row.date}: ${unauthorized} unauthorized, ${blocked} blocked`}><span><i className="unauthorized" style={{ height: `${unauthorized ? Math.max(4, unauthorized / max * 100) : 0}%` }}/><i className="blocked" style={{ height: `${blocked ? Math.max(4, blocked / max * 100) : 0}%` }}/></span><small>{new Date(`${row.date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric" })}</small></div>; })}{!daily.length && <div className="admin-chart-empty">No access-control events are available.</div>}</div><div className="admin-chart-legend"><span><i className="unauthorized"/>Unauthorized</span><span><i className="blocked"/>Blocked</span></div></section></div>
    <KeyRotationPanel />
    <div className="admin-overview-grid admin-security-tables"><DataTable title="Recent sign-ins" rows={loginRows} emptyMessage="No sign-ins are recorded for this period." columns={[["Account", (row) => row.account_email || (row.user_id ? `User ${row.user_id}` : "Unknown")],["Result", (row) => <span className={`admin-status-pill ${row.event_type === "login_success" ? "good" : row.event_type === "login_blocked" ? "warning" : "bad"}`}>{eventTitle(row.event_type)}</span>],["Time", (row) => formatDate(row.created_at)]]}/>
      <DataTable title="Recent security events" rows={securityRows} emptyMessage="No security events are recorded for this period." onViewAll={onViewLogs} columns={[["Event", (row) => eventTitle(row.event_type)],["Severity", (row) => row.severity || "Not recorded"],["Account", (row) => row.account_email || (row.user_id ? `User ${row.user_id}` : "Unknown")],["Time", (row) => formatDate(row.created_at)]]}/></div>
  </div>;
}

function SettingsInfoCard({ title, icon, rows }) {
  return <section className="admin-card admin-settings-info-card"><header className="admin-card-heading"><div><h2>{title}</h2></div><Icon name={icon} size={17}/></header><dl>{rows.map(([label, value, detail]) => <div key={label}><dt>{label}</dt><dd>{value ?? "Not configured"}</dd>{detail && <small>{detail}</small>}</div>)}</dl></section>;
}

function AdminSettingsPage({ admin, onOpenAccount }) {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getAdminPlatformSettings();
      setData(result);
      setDraft({
        max_upload_size_bytes: result.settings.max_upload_size_bytes,
        per_user_storage_quota_bytes: result.settings.per_user_storage_quota_bytes,
        auth_rate_limit_attempts: result.settings.auth_rate_limit_attempts,
        allowed_file_extensions: [...result.settings.allowed_file_extensions],
      });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadSettings, 0);
    return () => window.clearTimeout(timer);
  }, [loadSettings]);

  const dirty = data && draft && JSON.stringify(draft) !== JSON.stringify({
    max_upload_size_bytes: data.settings.max_upload_size_bytes,
    per_user_storage_quota_bytes: data.settings.per_user_storage_quota_bytes,
    auth_rate_limit_attempts: data.settings.auth_rate_limit_attempts,
    allowed_file_extensions: data.settings.allowed_file_extensions,
  });

  async function saveSettings(event) {
    event.preventDefault();
    if (!dirty || !draft) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await updateAdminPlatformSettings(draft);
      setData(result);
      setDraft({
        max_upload_size_bytes: result.settings.max_upload_size_bytes,
        per_user_storage_quota_bytes: result.settings.per_user_storage_quota_bytes,
        auth_rate_limit_attempts: result.settings.auth_rate_limit_attempts,
        allowed_file_extensions: [...result.settings.allowed_file_extensions],
      });
      setNotice("Platform settings saved.");
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  const toggleExtension = (extension) => setDraft((current) => {
    const selected = current.allowed_file_extensions;
    if (selected.includes(extension) && selected.length === 1) return current;
    return { ...current, allowed_file_extensions: selected.includes(extension) ? selected.filter((item) => item !== extension) : [...selected, extension].sort() };
  });

  if (loading && !data) return <div className="admin-page-content"><div className="admin-page-intro"><div><span className="admin-eyebrow">PLATFORM MANAGEMENT</span><h2>Settings</h2><p>Review effective platform policies and configuration.</p></div></div><div className="admin-loading-state" role="status"><span className="admin-spinner"/>Loading platform settings…</div></div>;
  if (!data) return <div className="admin-page-content"><div className="admin-page-intro"><div><span className="admin-eyebrow">PLATFORM MANAGEMENT</span><h2>Settings</h2><p>Review effective platform policies and configuration.</p></div></div><div className="admin-error" role="alert"><div><strong>Platform settings could not be loaded</strong><p>{error}</p></div><button type="button" onClick={loadSettings}>Retry</button></div></div>;

  const maxUploadGiB = (data.limits.max_upload_size_bytes / 1024 ** 3).toFixed(2);
  const maxQuotaGiB = (data.limits.per_user_storage_quota_bytes / 1024 ** 3).toFixed(2);
  const maxAuthAttempts = data.limits.auth_rate_limit_attempts;
  const readOnlyCards = [
    { title: "Security & access", icon: "shield", rows: [
      ["Password policy", `${data.security.password_min_length}–${data.security.password_max_length} characters`, data.security.password_policy_status],
      ["Session token lifetime", `${data.security.session_timeout_minutes} minutes`, "Deployment configuration; issued JWT expiry is not changed here"],
      ["Multi-factor authentication", data.security.mfa_status],
      ["File encryption", data.security.encryption_algorithm, `${data.security.encryption_status}; ${data.security.legacy_unencrypted_file_count} legacy unencrypted files`],
    ] },
    { title: "Files & storage", icon: "database", rows: [
      ["Storage provider", `${data.storage.provider} · ${data.storage.provider_status}`],
      ["Stored file records", data.storage.file_count.toLocaleString()],
      ["Current storage use", formatBytes(data.storage.usage_bytes)],
      ["Quota behavior", data.storage.quota_scope],
    ] },
    { title: "Sharing policies", icon: "share", rows: [
      ["Default link expiration", data.sharing.default_expiration],
      ["Maximum link duration", data.sharing.maximum_duration],
      ["Public links", data.sharing.public_links],
      ["Password protection", data.sharing.password_protection],
      ["Revocation", data.sharing.revocation],
    ] },
    { title: "Email & notifications", icon: "activity", rows: [
      ["SMTP service", data.email.smtp_status, data.email.delivery_note],
      ["Connected Gmail senders", data.email.gmail_sender_connections],
      ["Failed file-share notifications", data.email.failed_file_share_notifications],
      ["Security alert preferences", "Not supported; there is no user-configurable alert delivery policy"],
    ] },
    { title: "User management", icon: "users", rows: [
      ["Registration", data.users.registration_policy],
      ["Google sign-in", data.users.google_sign_in],
      ["New account role", data.users.default_role],
      ["Account restrictions", data.users.account_restrictions],
    ] },
    { title: "Audit & system", icon: "monitor", rows: [
      ["Audit retention", data.audit.retention],
      ["Activity tracking", data.audit.activity_tracking],
      ["Application version", data.audit.application_version],
      ...Object.entries(data.audit.system_health).map(([name, status]) => [`${name.toUpperCase()} health`, status]),
      ["Backups", data.audit.backup_status],
    ] },
  ];

  return <div className="admin-page-content">
    <div className="admin-page-intro"><div><span className="admin-eyebrow">PLATFORM MANAGEMENT</span><h2>Platform settings</h2><p>Manage persisted operational limits and review the security configuration currently enforced by TrustShare.</p></div><button type="button" className="admin-text-button" onClick={loadSettings} disabled={loading}><Icon name="refresh" size={14}/>{loading ? "Refreshing" : "Refresh"}</button></div>
    {error && <div className="admin-error" role="alert"><div><strong>Settings request failed</strong><p>{error}</p></div><button type="button" onClick={loadSettings}>Retry</button></div>}
    {notice && <div className="admin-settings-success" role="status">{notice}</div>}
    <form className="admin-card admin-settings-edit-card" onSubmit={saveSettings}>
      <header className="admin-card-heading"><div><h2>Effective platform limits</h2><p>Changes are stored in MySQL and enforced by the backend. Deployment configuration remains the upper limit.</p></div><span className="admin-muted-chip">Super Admin</span></header>
      <div className="admin-settings-edit-grid">
        <label>Maximum upload size <span>MB</span><input type="number" min="1" max={data.limits.max_upload_size_bytes / 1024 ** 2} step="0.01" value={(draft.max_upload_size_bytes / 1024 ** 2).toFixed(2)} disabled={saving} onChange={(event) => setDraft((current) => ({ ...current, max_upload_size_bytes: Math.round(Number(event.target.value) * 1024 ** 2) }))}/><small>Deployment ceiling: {maxUploadGiB} GiB. Existing stored files are not affected.</small></label>
        <label>Per-account storage quota <span>GiB</span><input type="number" min="0.001" max={maxQuotaGiB} step="0.01" value={(draft.per_user_storage_quota_bytes / 1024 ** 3).toFixed(2)} disabled={saving} onChange={(event) => setDraft((current) => ({ ...current, per_user_storage_quota_bytes: Math.round(Number(event.target.value) * 1024 ** 3) }))}/><small>Applies to current and newly registered accounts; this project has one shared quota policy.</small></label>
        <label>Maximum authentication attempts <span>per configured window</span><input type="number" min="1" max={data.settings.auth_rate_limit_attempts} step="1" value={draft.auth_rate_limit_attempts} disabled={saving} onChange={(event) => setDraft((current) => ({ ...current, auth_rate_limit_attempts: Number(event.target.value) }))}/><small>Current saved limit: {data.settings.auth_rate_limit_attempts}; deployment ceiling: {maxAuthAttempts}. This control can only tighten the limit.</small></label>
      </div>
      <fieldset className="admin-settings-extensions" disabled={saving}><legend>Allowed upload file types</legend><p>Only types already permitted by deployment configuration can be selected. At least one type must remain enabled.</p><div>{data.limits.allowed_file_extensions.map((extension) => <label key={extension}><input type="checkbox" checked={draft.allowed_file_extensions.includes(extension)} onChange={() => toggleExtension(extension)}/>{extension}</label>)}</div></fieldset>
      <footer className="admin-settings-actions"><span>{dirty ? "Unsaved changes" : "All settings are saved"}</span><button type="button" className="admin-text-button" onClick={() => setDraft({ max_upload_size_bytes: data.settings.max_upload_size_bytes, per_user_storage_quota_bytes: data.settings.per_user_storage_quota_bytes, auth_rate_limit_attempts: data.settings.auth_rate_limit_attempts, allowed_file_extensions: [...data.settings.allowed_file_extensions] })} disabled={!dirty || saving}>Cancel</button><button className="admin-primary" type="submit" disabled={!dirty || saving}>{saving ? "Saving…" : "Save changes"}</button></footer>
    </form>
    <div className="admin-settings-grid">{readOnlyCards.map((card) => <SettingsInfoCard key={card.title} {...card}/>)}</div>
    <section className="admin-card admin-settings-account"><div><h2>Administrator account</h2><p>{admin?.full_name || "Name not recorded"} · {admin?.email || "Email not recorded"} · {admin?.role || "Role not verified"}</p></div><button type="button" className="admin-primary" onClick={onOpenAccount}>Open account settings</button></section>
  </div>;
}

function MonitoringTable({ title, rows, columns, emptyMessage }) {
  return (
    <DataTable
      title={title}
      rows={rows}
      columns={columns}
      emptyMessage={emptyMessage}
      rowKey={(row, index) => row.alert_id || row.notification_id || row.log_id || `${title}-${index}`}
    />
  );
}

function StorageAnalyticsPage({ data }) {
  const users = data?.user_storage || [];
  const topDownloads = data?.top_downloaded_files || [];
  const fileTypes = data?.file_types || [];
  const maxTypeCount = Math.max(1, ...fileTypes.map((row) => Number(row.count || 0)));
  return (
    <div className="admin-page-content">
      <div className="admin-page-intro">
        <div><span className="admin-eyebrow">STORAGE ANALYTICS</span><h2>Storage analytics</h2><p>Metadata totals use MySQL; activity totals use recorded MongoDB events and may omit older events that were never logged.</p></div>
      </div>
      <div className="admin-metric-grid admin-four-metrics">
        <MetricCard icon="database" label="Storage in results" value={formatBytes(data?.total_storage_bytes)} note="Matching MySQL metadata" tone="violet" />
        <MetricCard icon="files" label="Files in results" value={Number(data?.total_files || 0).toLocaleString()} note="Matching MySQL records" tone="blue" />
        <MetricCard icon="activity" label="Total downloads" value={Number(data?.total_downloads || 0).toLocaleString()} note="Successful download events" tone="teal" />
        <MetricCard icon="share" label="Shared files" value={Number(data?.total_shared_files || 0).toLocaleString()} note="Distinct shared file records" tone="amber" />
      </div>
      <div className="admin-metric-grid admin-four-metrics">
        <MetricCard icon="share" label="Sharing links" value={Number(data?.sharing?.total_links || 0).toLocaleString()} note="Files and folders" tone="violet" />
        <MetricCard icon="share" label="Active links" value={Number(data?.sharing?.active_links || 0).toLocaleString()} note="Current access" tone="teal" />
        <MetricCard icon="clock" label="Expired links" value={Number(data?.sharing?.expired_links || 0).toLocaleString()} note="No longer active" tone="amber" />
        <MetricCard icon="lock" label="Revoked links" value={Number(data?.sharing?.revoked_links || 0).toLocaleString()} note="Access removed" tone="red" />
      </div>
      <section className="admin-card">
        <header className="admin-card-heading"><div><h2>Files by type</h2><p>Counts and bytes from the selected file metadata</p></div></header>
        {fileTypes.length ? <div className="admin-analytics-bars" role="img" aria-label="File count by content type">
          {fileTypes.map((row) => <div className="admin-analytics-bar-row" key={row.content_type}>
            <span>{row.content_type}</span><div><i style={{ width: `${Math.max(2, Number(row.count || 0) / maxTypeCount * 100)}%` }} /></div>
            <strong>{Number(row.count || 0).toLocaleString()}</strong><small>{formatBytes(row.size_bytes)}</small>
          </div>)}
        </div> : <div className="admin-empty-inline"><p>No files match the selected filters.</p></div>}
      </section>
      <MonitoringTable title="Storage by user" rows={users} columns={[["User", (row) => row.email], ["Storage", (row) => formatBytes(row.storage_bytes)], ["Bytes", (row) => Number(row.storage_bytes || 0).toLocaleString()]]} emptyMessage="No user storage records." />
      <MonitoringTable title={`Download report · ${Number(data?.failed_downloads || 0).toLocaleString()} failed`} rows={topDownloads} columns={[["File", (row) => row.file_name || "File unavailable"], ["Downloads", (row) => Number(row.downloads || 0).toLocaleString()]]} emptyMessage="No successful downloads match the selected filters." />
    </div>
  );
}

function SecurityMonitoringPage({ data }) {
  const rows = data?.events || [];
  return (
    <div className="admin-page-content">
      <div className="admin-page-intro">
        <div><span className="admin-eyebrow">SECURITY MONITORING</span><h2>Security events</h2><p>Deduplicated suspicious-activity alerts from MongoDB.</p></div>
      </div>
      <div className="admin-metric-grid admin-four-metrics">
        <MetricCard icon="shield" label="Security events" value={Number(data?.count || 0).toLocaleString()} note="Loaded alerts" tone="red" />
      </div>
      <MonitoringTable title="Recent security alerts" rows={rows} columns={[["Event", (row) => row.event_type], ["Severity", (row) => row.severity], ["Status", (row) => row.status], ["Description", (row) => row.description], ["Time", (row) => formatDate(row.timestamp)]]} emptyMessage="No security events." />
    </div>
  );
}

function NotificationsPage({ data }) {
  const rows = data?.notifications || [];
  return (
    <div className="admin-page-content">
      <div className="admin-page-intro">
        <div><span className="admin-eyebrow">NOTIFICATION MANAGEMENT</span><h2>Notifications</h2><p>Recent persisted notifications across TrustShare accounts.</p></div>
      </div>
      <MetricCard icon="activity" label="Unread notifications" value={Number(data?.unread_count || 0).toLocaleString()} note="Across accounts" tone="amber" />
      <MonitoringTable title="Notification history" rows={rows} columns={[["User ID", (row) => row.user_id], ["Title", (row) => row.title], ["Message", (row) => row.message], ["Status", (row) => row.read ? "Read" : "Unread"], ["Time", (row) => formatDate(row.created_at)]]} emptyMessage="No notifications." />
    </div>
  );
}


function SecureAdminDashboardContent() {
  const navigate = useNavigate();
  const location = useLocation();

  const normalizedPath =
    location.pathname.replace(/\/+$/, "") || "/admin";

  const section =
    sectionByPath[normalizedPath] ||
    sectionAliases[normalizedPath] ||
    "Not Found";

  const [days, setDays] = useState(30);
  const [customRange, setCustomRange] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [admin, setAdmin] = useState(null);
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [analytics, setAnalytics] = useState(null);
  const [files, setFiles] = useState([]);
  const [filesTotal, setFilesTotal] = useState(0);
  const [sharingReports, setSharingReports] = useState([]);
  const [sharesTotal, setSharesTotal] = useState(0);
  const [systemHealth, setSystemHealth] = useState(null);
  const [security, setSecurity] = useState(null);
  const [auditEvents, setAuditEvents] = useState([]);
  const [platformActivityEvents, setPlatformActivityEvents] = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState("");
  const auditLoadSequence = useRef(0);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [analyticsShareStatus, setAnalyticsShareStatus] = useState("");
  const [fileType, setFileType] = useState("");
  const [auditType, setAuditType] = useState("");
  const [filterUserId, setFilterUserId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("");
  const [shareKind, setShareKind] = useState("");
  const [userRole, setUserRole] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [storageAnalytics, setStorageAnalytics] = useState(null);
  const [uploadEvents, setUploadEvents] = useState([]);
  const [securityEvents, setSecurityEvents] = useState(null);
  const [notifications, setNotifications] = useState(null);
  const loadSequence = useRef(0);

  const refreshAuditActivity = useCallback(async () => {
    const requestId = ++auditLoadSequence.current;
    setActivityLoading(true);
    setActivityError("");
    try {
      const [recentResult, ...activityResults] = await Promise.all([
        getAdminAuditLogs({ limit: 100 }),
        ...overviewActivityTypes.map((eventType) => getAdminAuditLogs({ limit: 7, eventType })),
      ]);
      if (requestId !== auditLoadSequence.current) return;
      const recentRecords = Array.isArray(recentResult?.events) ? recentResult.events : recentResult?.logs;
      setAuditEvents(Array.isArray(recentRecords) ? recentRecords : []);
      const activityRows = activityResults.flatMap((result) => Array.isArray(result?.events) ? result.events : Array.isArray(result?.logs) ? result.logs : []);
      const uniqueRows = new Map(activityRows.map((row) => [row.activity_id || row.log_id || `${row.event_type}-${row.created_at}-${row.user_id}-${row.file_id}-${row.folder_id}`, row]));
      setPlatformActivityEvents([...uniqueRows.values()]
        .filter(isOverviewActivity)
        .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime())
        .slice(0, 7));
    } catch (requestError) {
      if (requestId !== auditLoadSequence.current) return;
      setActivityError(getApiErrorMessage(requestError));
      setAuditEvents([]);
      setPlatformActivityEvents([]);
    } finally {
      if (requestId === auditLoadSequence.current) setActivityLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await logoutUser();
    } catch {
      // Local sign-out remains available if the server is unavailable.
    } finally {
      clearSession();
      navigate("/login", { replace: true });
    }
  }, [navigate]);


const load = useCallback(async () => {
  const requestId = ++loadSequence.current;
  const isCurrent = () => requestId === loadSequence.current;
  setLoading(true);
  setError("");

  try {
    const identity = await getCurrentUser();
    if (!isCurrent()) return;

    if (identity.role !== "super_admin") {
      setDenied(true);
      return;
    }

    setDenied(false);
    setAdmin(identity);

    if (section === "Dashboard") {
      const [
        overviewData,
        securityData,
        analyticsData,
      ] = await Promise.all([
        getAdminOverview(),
        getAdminSecurityDashboard(7),
        getAdminFileAnalytics(),
      ]);
      if (!isCurrent()) return;

      setOverview(overviewData);
      setSecurity(securityData);
      setAnalytics(analyticsData);
      void refreshAuditActivity();
    } else if (section === "User Management") {
      const result = await getAdminUsers({
        search,
        role: userRole,
        limit: 100,
        offset,
      });
      if (!isCurrent()) return;

      setUsers(result.users || []);
      setUsersTotal(result.total || 0);
    } else if (
      section === "File Management" ||
      section === "Analytics"
    ) {
      if (section === "File Management") {
        const [analyticsData, filesData] = await Promise.all([
          getAdminFileAnalytics(),
          getAdminFiles({ search, limit: 100, offset }),
        ]);
        if (!isCurrent()) return;

        setAnalytics(analyticsData);
        setFiles(filesData.files || []);
        setFilesTotal(filesData.total || 0);
      } else {
        const filters = {
          ...(filterUserId ? { user_id: filterUserId } : {}),
          ...(startDate ? { start_date: startDate } : {}),
          ...(endDate ? { end_date: endDate } : {}),
          ...(auditType ? { activity_type: auditType } : {}),
          ...(filterStatus ? { status: filterStatus } : {}),
        };
        const [analyticsData, uploadsData] = await Promise.all([
          getAdminFileAnalytics(filters),
          getAdminAuditLogs({
            limit: 100,
            eventType: auditType || "file_upload_success",
            userId: filterUserId,
            status: filterStatus,
            startDate,
            endDate,
          }),
        ]);
        if (!isCurrent()) return;
        setAnalytics(analyticsData);
        setUploadEvents(uploadsData.events || []);
      }
    } else if (section === "Security Dashboard") {
      const securityData = await getAdminSecurityDashboard(
          days,
          customRange ? startDate || null : null,
          customRange ? endDate || null : null
        );
      if (!isCurrent()) return;
      setSecurity(securityData);
    } else if (section === "Sharing Reports") {
      const result = await getAdminSharingReports({
        search,
        status: shareStatus,
        ownerId: filterUserId,
        kind: shareKind,
        startDate,
        endDate,
        limit: 100,
        offset,
      });
      if (!isCurrent()) return;

      setSharingReports(result.shares || []);
      setSharesTotal(result.total || 0);
    } else if (section === "System Monitoring") {
      const healthData = await getAdminSystemHealth();
      if (!isCurrent()) return;
      setSystemHealth(healthData);
    } else if (section === "Activity Logs") {
      const result = await getAdminAuditLogs({
        limit: 100,
        offset,
        eventType: auditType,
        userId: filterUserId,
        status: filterStatus,
        startDate,
        endDate,
        search,
      });
      if (!isCurrent()) return;

      setAuditEvents(
        Array.isArray(result?.events) ? result.events : []
      );
    } else if (section === "Storage Analytics") {
      const filters = {
        ...(filterUserId ? { user_id: filterUserId } : {}),
        ...(startDate ? { start_date: startDate } : {}),
        ...(endDate ? { end_date: endDate } : {}),
        ...(fileType ? { file_type: fileType } : {}),
      };
      const [storageData, downloadData, sharingData, filesData] = await Promise.all([
        getStorageAnalytics(filters),
        getDownloadAnalytics(filters),
        getSharingAnalytics({
          ...(filterUserId ? { user_id: filterUserId } : {}),
          ...(startDate ? { start_date: startDate } : {}),
          ...(endDate ? { end_date: endDate } : {}),
          ...(analyticsShareStatus ? { status: analyticsShareStatus } : {}),
        }),
        getFileAnalytics(filters),
      ]);
      if (!isCurrent()) return;
      setStorageAnalytics({
        ...storageData,
        total_downloads: downloadData.total_downloads,
        failed_downloads: downloadData.failed_downloads,
        top_downloaded_files: downloadData.files,
        total_shared_files: sharingData.total_shared_files,
        sharing: sharingData,
        file_types: filesData.files,
      });
    } else if (section === "Security Monitoring") {
      const eventData = await getSecurityEvents({
        ...(filterUserId ? { user_id: filterUserId } : {}),
        ...(filterSeverity ? { severity: filterSeverity } : {}),
        ...(filterStatus ? { status: filterStatus } : {}),
        ...(auditType ? { event_type: auditType } : {}),
        ...(startDate ? { start_date: startDate } : {}),
        ...(endDate ? { end_date: endDate } : {}),
      });
      if (!isCurrent()) return;
      setSecurityEvents(eventData);
    } else if (section === "Notifications") {
      const notificationData = await getAdminNotifications({ limit: 100 });
      if (!isCurrent()) return;
      setNotifications(notificationData);
    }
  } catch (requestError) {
    if (!isCurrent()) return;
    if (requestError.response?.status === 401) {
      signOut();
      return;
    }

    if (requestError.response?.status === 403) {
      setDenied(true);
    } else {
      setError(getApiErrorMessage(requestError));
    }
  } finally {
    if (isCurrent()) setLoading(false);
  }
}, [
  auditType,
  filterSeverity,
  filterStatus,
  filterUserId,
  customRange,
  days,
  endDate,
  offset,
  search,
  section,
  shareStatus,
  analyticsShareStatus,
  shareKind,
  fileType,
  refreshAuditActivity,
  signOut,
  startDate,
  userRole,
]);


  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => {
      window.clearTimeout(timer);
      loadSequence.current += 1;
    };
  }, [load]);

  const navigateSection = (destination) => {
    setError("");
    setOffset(0);

    const route = sections.find(
      (item) => item.label === destination
    )?.path;

    if (route) {
      navigate(route);
    }
  };

  const initials = (admin?.full_name || "Admin")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

  const userColumns = [
    ["Name", (row) => row.full_name || "Name not recorded"],
    ["Email", (row) => row.email || "Email not recorded"],
    ["Role", (row) => row.role || "Not recorded"],
    ["Status", () => "Not tracked by current schema"],
    ["Provider", (row) => row.auth_provider || "Not recorded"],
    ["Storage", (row) => formatBytes(row.storage_used_bytes)],
    ["Joined", (row) => formatDate(row.created_at)],
    [
      "Details",
      (row) => (
        <button
          type="button"
          className="admin-text-button"
          onClick={() => setSelectedUser(row)}
        >
          View details
        </button>
      ),
    ],
  ];

  const eventColumns = [
    ["Event", (row) => eventTitle(row.event_type)],
    ["Account", (row) => row.user_id ?? "Not recorded"],
    ["File ID", (row) => row.file_id ?? "Not recorded"],
    ["Recipient", (row) => row.target_email || "Not recorded"],
    ["Status", (row) => row.status || row.activity_status || "Not recorded"],
    ["Severity", (row) => row.severity || "Not recorded"],
    ["Details", (row) => row.details || row.activity_description || "Activity recorded"],
    ["Time", (row) => formatDate(row.created_at)],
  ];

  const fileColumns = [
    ["File", (row) => row.name],
    [
      "Owner",
      (row) => `${row.owner_name} (${row.owner_email})`,
    ],
    ["Type", (row) => row.content_type || "Not recorded"],
    ["Size", (row) => formatBytes(row.size_bytes)],
    ["Folder", (row) => row.folder_id ?? "Root"],
    ["Created", (row) => formatDate(row.created_at)],
  ];

  const shareColumns = [
    [
      "Resource",
      (row) => `${row.resource_name} (${row.kind})`,
    ],
    [
      "Sender",
      (row) => `${row.owner_name} (${row.owner_email})`,
    ],
    ["Recipient", (row) => row.recipient_email],
    ["Permission", (row) => row.permission],
    [
      "Share status",
      (row) => (
        <span
          className={`admin-status-pill ${
            row.status === "active" ? "good" : "bad"
          }`}
        >
          {row.status}
        </span>
      ),
    ],
    ["Invitation", (row) => row.email_status || "Not applicable"],
    [
      "Expires",
      (row) => row.expires_at ? formatDate(row.expires_at) : "No expiry",
    ],
    ["Created", (row) => formatDate(row.created_at)],
  ];

  if (denied) {
    return (
      <main className="admin-denied">
        <div>
          <span>
            <Icon name="lock" size={24} />
          </span>
          <h1>Administrator access required</h1>
          <p>
            This account does not have the super-administrator role.
            Platform data remains restricted.
          </p>
          <button
            className="admin-primary"
            type="button"
            onClick={() => navigate("/dashboard", { replace: true })}
          >
            Return to workspace
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <button
          type="button"
          className="admin-brand"
          onClick={() => navigateSection("Dashboard")}
          aria-label="TrustShare Super Admin dashboard"
        >
          <span className="admin-brand-mark">
            <Icon name="shield" size={18} />
          </span>
          <span>
            trust<span>share</span>
          </span>
        </button>

        <div className="admin-sidebar-heading">
          <span>CONTROL CENTER</span>
          <small>PLATFORM ADMIN</small>
        </div>

        <nav
          className="admin-navigation"
          aria-label="Super administrator navigation"
        >
          {sections.map((item) => (
            <button
              type="button"
              key={item.label}
              className={`admin-nav-item${
                section === item.label ? " active" : ""
              }`}
              onClick={() => navigateSection(item.label)}
              aria-current={
                section === item.label ? "page" : undefined
              }
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {section === item.label && <i />}
            </button>
          ))}
          <button type="button" className="admin-nav-item" onClick={() => navigate("/dashboard")}>
            <Icon name="arrow" />
            <span>My workspace</span>
          </button>
        </nav>

        <div className="admin-sidebar-bottom">
          <div className="admin-user-avatar">{initials}</div>
          <span className="admin-admin-identity">
            <strong>{admin?.full_name || "Administrator"}</strong>
            <small>Super administrator</small>
          </span>
          <button
            type="button"
            onClick={signOut}
            aria-label="Sign out"
            title="Sign out"
          >
            <Icon name="logout" size={17} />
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div className="admin-heading-copy">
            <span className="admin-eyebrow">
              TRUSTSHARE / SUPER ADMIN
            </span>
            <h1>
              {section === "Dashboard"
                ? "Platform overview"
                : section}
            </h1>
            <p>
              {section === "Dashboard"
                ? `Good to see you, ${
                    admin?.full_name || "Administrator"
                  }. Here is your platform at a glance.`
                : "Review and manage TrustShare platform operations."}
            </p>
          </div>

          <div className="admin-topbar-controls">
            {[
              "User Management",
              "File Management",
              "Sharing Reports",
              "Activity Logs",
            ].includes(section) && (
              <form
                className="admin-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  setOffset(0);
                  setSearch(searchDraft.trim());
                }}
              >
                <label htmlFor="admin-record-search">
                  Search{" "}
                  {section === "User Management"
                    ? "users"
                    : section === "File Management"
                      ? "files and owners"
                      : section === "Sharing Reports"
                        ? "shares, resources, and recipients"
                        : "audit events"}
                </label>
                <input
                  id="admin-record-search"
                  value={searchDraft}
                  onChange={(event) =>
                    setSearchDraft(event.target.value)
                  }
                  placeholder={
                    section === "User Management"
                      ? "Name or email"
                      : section === "File Management"
                        ? "File name or owner"
                        : section === "Sharing Reports"
                          ? "Resource or recipient"
                          : "Event, email, or details"
                  }
                />
                <button type="submit" aria-label="Search records">
                  <Icon name="users" size={16} />
                </button>
              </form>
            )}

            {section === "User Management" && (
              <select
                aria-label="Filter users by role"
                value={userRole}
                onChange={(event) => {
                  setOffset(0);
                  setUserRole(event.target.value);
                }}
              >
                <option value="">All roles</option>
                <option value="user">User</option>
                <option value="admin">Administrator</option>
                <option value="super_admin">Super administrator</option>
              </select>
            )}

            {section === "Sharing Reports" && (
              <select
                aria-label="Filter share status"
                value={shareStatus}
                onChange={(event) => {
                  setOffset(0);
                  setShareStatus(event.target.value);
                }}
              >
                <option value="">All statuses</option>
                <option value="active">Active shares</option>
                <option value="expired">Expired</option>
                <option value="revoked">Revoked</option>
              </select>
            )}

            {["Activity Logs", "Analytics"].includes(section) && (
              <select
                aria-label="Filter activity type"
                value={auditType}
                onChange={(event) => {
                  setOffset(0);
                  setAuditType(event.target.value);
                }}
              >
                <option value="">All events</option>
                {[
                  "registration_success",
                  "login_success",
                  "file_upload_success",
                  "file_download_success",
                  "file_download_failed",
                  "file_delete_success",
                  "file_share_created",
                  "file_share_revoked",
                  "share_email_sending",
                  "share_email_sent",
                  "share_email_failed",
                  "folder_created",
                  "folder_deleted",
                  "folder_renamed",
                  "folder_access_granted",
                  "folder_access_changed",
                  "folder_access_revoked",
                  "login_failed",
                  "login_blocked",
                  "unauthorized_access",
                ].map((type) => (
                  <option key={type} value={type}>
                    {eventTitle(type)}
                  </option>
                ))}
              </select>
            )}

            {["Activity Logs", "Sharing Reports", "Analytics", "Security Monitoring", "Storage Analytics"].includes(section) && (
              <>
                <input
                  aria-label="Filter by user ID"
                  type="number"
                  min="1"
                  placeholder="User ID"
                  value={filterUserId}
                  onChange={(event) => {
                    setOffset(0);
                    setFilterUserId(event.target.value);
                  }}
                />
                <input
                  aria-label="Filter start date"
                  type="date"
                  value={startDate}
                  onChange={(event) => {
                    setOffset(0);
                    setStartDate(event.target.value);
                  }}
                />
                <input
                  aria-label="Filter end date"
                  type="date"
                  value={endDate}
                  onChange={(event) => {
                    setOffset(0);
                    setEndDate(event.target.value);
                  }}
                />
              </>
            )}

            {["Activity Logs", "Analytics"].includes(section) && (
              <select
                aria-label="Filter activity status"
                value={filterStatus}
                onChange={(event) => {
                  setOffset(0);
                  setFilterStatus(event.target.value);
                }}
              >
                <option value="">All statuses</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
                <option value="warning">Warning</option>
              </select>
            )}

            {section === "Sharing Reports" && (
              <select
                aria-label="Filter sharing resource type"
                value={shareKind}
                onChange={(event) => {
                  setOffset(0);
                  setShareKind(event.target.value);
                }}
              >
                <option value="">All resources</option>
                <option value="file">Files</option>
                <option value="folder">Folders</option>
              </select>
            )}

            {section === "Storage Analytics" && (
              <>
                <select aria-label="Filter sharing status" value={analyticsShareStatus} onChange={(event) => setAnalyticsShareStatus(event.target.value)}>
                  <option value="">All link statuses</option>
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                  <option value="revoked">Revoked</option>
                </select>
                <select aria-label="Filter files by type" value={fileType} onChange={(event) => setFileType(event.target.value)}>
                  <option value="">All file types</option>
                  <option value="application/pdf">PDF</option>
                  <option value="text/plain">Text</option>
                  <option value="image/png">PNG image</option>
                  <option value="image/jpeg">JPEG image</option>
                  <option value="application/zip">ZIP archive</option>
                </select>
              </>
            )}

            {section === "Security Monitoring" && (
              <select
                aria-label="Filter security severity"
                value={filterSeverity}
                onChange={(event) => {
                  setOffset(0);
                  setFilterSeverity(event.target.value);
                }}
              >
                <option value="">All severities</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            )}

            {section === "Security Dashboard" && (
              <div className="admin-date-controls">
                <select
                  aria-label="Security date range"
                  value={customRange ? "custom" : days}
                  onChange={(event) => {
                    if (event.target.value === "custom") {
                      setCustomRange(true);
                    } else {
                      setCustomRange(false);
                      setDays(Number(event.target.value));
                    }
                  }}
                >
                  <option value={7}>Last 7 days</option>
                  <option value={30}>Last 30 days</option>
                  <option value={90}>Last 90 days</option>
                  <option value={365}>Last year</option>
                  <option value="custom">Custom range</option>
                </select>

                {customRange && (
                  <>
                    <input
                      aria-label="Start date"
                      type="date"
                      value={startDate}
                      onChange={(event) =>
                        setStartDate(event.target.value)
                      }
                    />
                    <input
                      aria-label="End date"
                      type="date"
                      value={endDate}
                      onChange={(event) =>
                        setEndDate(event.target.value)
                      }
                    />
                  </>
                )}
              </div>
            )}

            <details className="admin-profile">
              <summary>
                <span className="admin-user-avatar">{initials}</span>
                <span>
                  <strong>
                    {admin?.full_name || "Administrator"}
                  </strong>
                  <small>Super administrator</small>
                </span>
              </summary>
              <div className="admin-profile-menu">
                <span>{admin?.email || "Administrator account"}</span>
                <button type="button" onClick={signOut}>
                  <Icon name="logout" size={15} /> Sign out
                </button>
              </div>
            </details>

            <button
              className="admin-refresh"
              type="button"
              onClick={load}
              disabled={loading}
            >
              <Icon name="refresh" size={15} />
              {loading ? "Refreshing" : "Refresh"}
            </button>
          </div>
        </header>

        {error && (
          <div className="admin-error" role="alert">
            <span>
              <Icon name="shield" size={17} />
            </span>
            <div>
              <strong>Admin data could not be loaded</strong>
              <p>{error}</p>
            </div>
            <button type="button" onClick={load}>
              Retry
            </button>
          </div>
        )}

        {loading && section === "Dashboard" && <LoadingOverview />}

        {loading && section !== "Dashboard" && (
          <div className="admin-loading-state" role="status">
            <span className="admin-spinner" />
            Loading {section.toLowerCase()} data…
          </div>
        )}

        {!loading &&
          !error &&
          section === "Dashboard" &&
          overview &&
          security &&
          analytics && (
            <Overview
              overview={overview}
              security={security}
              analytics={analytics}
              auditEvents={auditEvents}
              platformActivityEvents={platformActivityEvents}
              activityLoading={activityLoading}
              activityError={activityError}
              onRefreshActivity={refreshAuditActivity}
              onNavigate={navigateSection}
            />
          )}

        {!loading && !error && section === "User Management" && (
          <div className="admin-page-content">
            <TablePage
              title="User management"
              description="Registered TrustShare accounts and their current storage use."
              rows={users}
              columns={userColumns}
              empty={
                search
                  ? "No accounts match this search."
                  : "No user accounts are recorded."
              }
            />
            <Pagination
              offset={offset}
              limit={100}
              total={usersTotal}
              onChange={setOffset}
            />
          </div>
        )}

        {!loading &&
          !error &&
          section === "File Management" &&
          analytics && (
            <div className="admin-page-content">
              <div className="admin-page-intro">
                <div>
                  <span className="admin-eyebrow">
                    PLATFORM RECORDS
                  </span>
                  <h2>File management</h2>
                  <p>
                    Current file totals and recorded file activity from
                    TrustShare services.
                  </p>
                </div>
              </div>

              <div className="admin-metric-grid admin-four-metrics">
                <MetricCard
                  icon="files"
                  label="Current file records"
                  value={analytics.current_file_count.toLocaleString()}
                  note="Saved database records"
                  tone="blue"
                />
                <MetricCard
                  icon="database"
                  label="Current storage"
                  value={formatBytes(analytics.current_storage_bytes)}
                  note="Sum of saved file sizes"
                  tone="violet"
                />
                <MetricCard
                  icon="files"
                  label="Recorded uploads"
                  value={analytics.recorded_upload_events.toLocaleString()}
                  note="Activity log events"
                  tone="teal"
                />
                <MetricCard
                  icon="activity"
                  label="Recorded deletions"
                  value={analytics.recorded_delete_events.toLocaleString()}
                  note="Activity log events"
                  tone="amber"
                />
              </div>
              <DataTable
                title="Saved file records"
                rows={files}
                columns={fileColumns}
                emptyMessage={
                  search
                    ? "No file records match this search."
                    : "No file records are saved."
                }
                rowKey={(row) => row.id}
              />

              <Pagination
                offset={offset}
                limit={100}
                total={filesTotal}
                onChange={setOffset}
              />

              <section className="admin-card admin-note-card">
                <Icon name="lock" size={18} />
                <p>
                  Administrative deletion is not supported by this
                  backend. File records remain read-only here.
                </p>
              </section>
            </div>
          )}

        {!loading && !error && section === "Analytics" && analytics && (
          <div className="admin-page-content">
            <div className="admin-page-intro">
              <div>
                <span className="admin-eyebrow">
                  PLATFORM ANALYTICS
                </span>
                <h2>File activity</h2>
                <p>
                  Current platform totals with recorded historical
                  operations.
                </p>
              </div>
            </div>

            <div className="admin-metric-grid admin-four-metrics">
              <MetricCard
                icon="files"
                label="Current file records"
                value={analytics.current_file_count.toLocaleString()}
                note="Current database count"
                tone="blue"
              />
              <MetricCard
                icon="database"
                label="Storage consumed"
                value={formatBytes(analytics.current_storage_bytes)}
                note="Current database total"
                tone="violet"
              />
              <MetricCard
                icon="arrow"
                label="Recorded downloads"
                value={analytics.recorded_download_events.toLocaleString()}
                note="All recorded activity"
                tone="teal"
              />
              <MetricCard
                icon="files"
                label="Recorded deletions"
                value={analytics.recorded_delete_events.toLocaleString()}
                note="All recorded activity"
                tone="amber"
              />
            </div>

            <section className="admin-card admin-note-card">
              <Icon name="chart" size={18} />
              <p>
                Historical comparisons are not available for these
                all-time event totals, so no trends are inferred.
              </p>
            </section>
            <MonitoringTable title={`${auditType ? eventTitle(auditType) : "Upload"} report`} rows={uploadEvents} columns={[["User", (row) => row.user_id ?? "Not recorded"], ["File ID", (row) => row.file_id ?? "Not recorded"], ["Details", (row) => row.details || row.activity_description || "Activity recorded"], ["Date", (row) => formatDate(row.created_at)]]} emptyMessage="No matching activity records match the selected filters." />
          </div>
        )}

        {!loading && !error && section === "Sharing Reports" && (
          <div className="admin-page-content">
            <div className="admin-page-intro">
              <div>
                <span className="admin-eyebrow">
                  SHARING OVERSIGHT
                </span>
                <h2>Sharing reports</h2>
                <p>
                  Current file and folder share records, with stored
                  invitation and access status.{" "}
                  {sharesTotal.toLocaleString()} matching records.
                </p>
              </div>
            </div>

            <DataTable
              title="Share records"
              rows={sharingReports}
              columns={shareColumns}
              emptyMessage="No matching share records are stored."
              rowKey={(row) => `${row.kind}-${row.id}`}
            />

            <Pagination
              offset={offset}
              limit={100}
              total={sharesTotal}
              onChange={setOffset}
            />
          </div>
        )}

        {!loading && !error && section === "Activity Logs" && (
          <div className="admin-page-content">
            <TablePage
              title="Activity logs"
              tableTitle=""
              description={`Recent security and platform events. ${auditEvents.length} events loaded.`}
              rows={auditEvents}
              columns={eventColumns}
              empty={
                auditEvents.length === 0
                  ? "No audit events were returned by the API."
                  : "No audit events are available."
              }
            />

            <div className="admin-pagination">
              <button
                type="button"
                disabled={offset === 0 || loading}
                onClick={() =>
                  setOffset(Math.max(0, offset - 100))
                }
              >
                Previous
              </button>

              <span>
                {auditEvents.length > 0
                  ? `Records ${offset + 1}–${
                      offset + auditEvents.length
                    }`
                  : "No records"}
              </span>

              <button
                type="button"
                disabled={auditEvents.length < 100 || loading}
                onClick={() => setOffset(offset + 100)}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {!loading &&
          !error &&
          section === "Security Dashboard" &&
          security && (
            <SecurityDashboard
              data={security}
              days={days}
              onViewLogs={() => navigateSection("Activity Logs")}
            />
          )}

        {!loading &&
          !error &&
          section === "System Monitoring" &&
          systemHealth && (
            <div className="admin-page-content">
              <div className="admin-page-intro">
                <div>
                  <span className="admin-eyebrow">
                    SERVICE HEALTH
                  </span>
                  <h2>System monitoring</h2>
                  <p>
                    Live connectivity checks from the protected admin
                    API.
                  </p>
                </div>
                <span className="admin-period-chip">
                  Checked {formatDate(systemHealth.checked_at)}
                </span>
              </div>

              <div className="admin-metric-grid admin-four-metrics">
                {Object.entries(systemHealth.services).map(
                  ([name, value]) => (
                    <MetricCard
                      key={name}
                      icon="monitor"
                      label={name.toUpperCase()}
                      value={value}
                      note="Connectivity check"
                      tone={value === "healthy" ? "teal" : "red"}
                    />
                  )
                )}
              </div>

              <section className="admin-card admin-note-card">
                <Icon name="lock" size={18} />
                <p>
                  These checks confirm service connectivity only; they
                  do not represent host capacity or storage quota.
                </p>
              </section>
            </div>
          )}

        {!loading && !error && section === "Settings" && (
          <AdminSettingsPage
            admin={admin}
            onOpenAccount={() => navigate("/account")}
          />
        )}

        {!loading && !error && section === "Storage Analytics" && (
          <StorageAnalyticsPage data={storageAnalytics} />
        )}

        {!loading && !error && section === "Security Monitoring" && (
          <SecurityMonitoringPage data={securityEvents} />
        )}

        {!loading && !error && section === "Notifications" && (
          <NotificationsPage data={notifications} />
        )}

        {!loading && !error && section === "Not Found" && (
          <div className="admin-page-content">
            <div className="admin-page-intro">
              <div>
                <span className="admin-eyebrow">SUPER ADMIN</span>
                <h2>Page not found</h2>
                <p>This administrator route is not registered.</p>
              </div>
            </div>
            <button
              className="admin-primary"
              type="button"
              onClick={() => navigate("/admin", { replace: true })}
            >
              Open dashboard
            </button>
          </div>
        )}

        {selectedUser && (
          <div
            className="admin-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setSelectedUser(null);
              }
            }}
          >
            <section
              className="admin-card admin-user-detail"
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-user-detail-title"
            >
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setSelectedUser(null)}
                aria-label="Close user details"
              >
                ×
              </button>

              <span className="admin-eyebrow">ACCOUNT DETAILS</span>
              <h2 id="admin-user-detail-title">
                {selectedUser.full_name || "Name not recorded"}
              </h2>

              <dl>
                <dt>Email</dt>
                <dd>{selectedUser.email}</dd>
                <dt>Role</dt>
                <dd>{selectedUser.role}</dd>
                <dt>Account status</dt>
                <dd>Not tracked by the current user schema</dd>
                <dt>Authentication provider</dt>
                <dd>{selectedUser.auth_provider}</dd>
                <dt>Storage used</dt>
                <dd>{formatBytes(selectedUser.storage_used_bytes)}</dd>
                <dt>Registered</dt>
                <dd>{formatDate(selectedUser.created_at)}</dd>
              </dl>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}


class AdminErrorBoundary extends Component {
  state = { error: false, retry: 0 };

  static getDerivedStateFromError() {
    return { error: true };
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) {
      console.error("Super Admin page render failed:", error, info.componentStack);
    }
  }

  render() {
    if (this.state.error) {
      return <main className="admin-denied"><div><span><Icon name="shield" size={24}/></span><h1>This admin page could not be rendered</h1><p>The page reported a frontend error. Your access controls remain in place.</p><button className="admin-primary" type="button" onClick={() => this.setState((state) => ({ error: false, retry: state.retry + 1 }))}>Retry page</button></div></main>;
    }
    return <div key={this.state.retry}>{this.props.children}</div>;
  }
}

export default function SecureAdminDashboard() {
  const location = useLocation();
  return <AdminErrorBoundary key={location.pathname}><SecureAdminDashboardContent/></AdminErrorBoundary>;
}
