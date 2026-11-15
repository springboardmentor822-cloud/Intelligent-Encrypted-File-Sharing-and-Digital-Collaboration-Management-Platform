export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return "-";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024, i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}
export const formatDate = (iso) => (iso ? new Date(iso).toLocaleString() : "-");
export const formatDay = (iso) => (iso ? new Date(iso).toLocaleDateString() : "-");

export function timeAgo(iso) {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
}
export const formatNumber = (n) => (n === null || n === undefined ? "-" : Number(n).toLocaleString());
export const toDateInput = (d) => d.toISOString().slice(0, 10); // 2026-10-24
// 22 Oct 2026, 10:30 AM  (the format used in the mockup tables)
export const formatStamp = (iso) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).replace(/\b(am|pm)\b/, (m) => m.toUpperCase()) : "-");
export const extOf = (name) => (name && name.includes(".") ? name.split(".").pop().toUpperCase() : "FILE");
