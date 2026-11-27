export function formatBytes(bytes, digits = 1) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : digits)} ${units[i]}`;
}

export function formatDate(iso, withTime = false) {
  if (!iso) return '—';
  const d = new Date(iso);
  const opts = { day: 'numeric', month: 'short', year: 'numeric' };
  if (withTime) Object.assign(opts, { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleString(undefined, opts);
}

export function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return formatDate(iso);
}

export function timeUntil(iso) {
  const s = Math.floor((new Date(iso).getTime() - Date.now()) / 1000);
  if (s <= 0) return 'expired';
  if (s < 3600) return `in ${Math.ceil(s / 60)} min`;
  if (s < 86400) return `in ${Math.floor(s / 3600)} hr`;
  return `in ${Math.floor(s / 86400)} d`;
}

export const pct = (a, b) => (b ? Math.min(100, Math.round((a / b) * 100)) : 0);
export const isoDate = (d) => d.toISOString().slice(0, 10);
export const shortDay = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export const ACTION_LABELS = {
  'auth.login': 'Signed in', 'auth.logout': 'Signed out', 'auth.register': 'Created account',
  'auth.password_changed': 'Changed password', 'auth.mfa_enabled': 'Turned on two-factor', 'auth.mfa_disabled': 'Turned off two-factor',
  'file.upload': 'Uploaded', 'file.upload_rejected': 'Upload blocked', 'file.new_version': 'Uploaded new version',
  'file.download': 'Downloaded', 'file.view': 'Viewed', 'file.update': 'Updated', 'file.trash': 'Moved to trash',
  'file.restore': 'Restored', 'file.delete_permanent': 'Deleted permanently',
  'folder.create': 'Created folder', 'folder.update': 'Updated folder', 'folder.delete': 'Deleted folder',
  'share.link_created': 'Created share link', 'share.link_revoked': 'Revoked share link', 'share.link_opened': 'Share link opened',
  'share.link_download': 'Downloaded via share link', 'share.user_shared': 'Shared with a person', 'share.user_revoked': 'Removed a person’s access',
};
export const actionLabel = (a) => ACTION_LABELS[a] || a.replace(/[._]/g, ' ');
