// Icon + colour + label for each notification type (used by the bell and the history page).
import { Bell, Clock, Download, Megaphone, Share2, ShieldAlert, UserPlus } from "lucide-react";

export const TYPE_META = {
  file_shared: { label: "File shared", icon: Share2, tone: "bg-violet-50 text-violet-600" },
  file_downloaded: { label: "File downloaded", icon: Download, tone: "bg-emerald-50 text-emerald-600" },
  security_alert: { label: "Security alert", icon: ShieldAlert, tone: "bg-red-50 text-red-500" },
  link_expiring: { label: "Link expiry", icon: Clock, tone: "bg-amber-50 text-amber-600" },
  access_request: { label: "Access request", icon: UserPlus, tone: "bg-amber-50 text-amber-600" },
  announcement: { label: "Announcement", icon: Megaphone, tone: "bg-brand-50 text-brand-600" },
  system: { label: "System", icon: Bell, tone: "bg-paper-100 text-slate-500" },
};

export function NotifIcon({ type, size = 36 }) {
  const m = TYPE_META[type] || TYPE_META.system;
  const Icon = m.icon;
  return <span className={`flex shrink-0 items-center justify-center rounded-xl ${m.tone}`} style={{ width: size, height: size }}><Icon size={size * 0.48} /></span>;
}
