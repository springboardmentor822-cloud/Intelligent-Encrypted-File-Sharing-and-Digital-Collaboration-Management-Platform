import { ReactNode, useEffect, useRef } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Inbox, Loader2, X } from "lucide-react";

export function Logo({ light = false, size = 32 }: { light?: boolean; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <defs><linearGradient id={`lg${light}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5b9bff" /><stop offset="1" stopColor="#8b6bf5" /></linearGradient></defs>
        <path d="M16 1.5l12 4.3v9.4c0 7.2-5.2 12.4-12 15.3C9.2 27.6 4 22.4 4 15.2V5.8z" fill={`url(#lg${light})`} />
        <path d="M11.5 19.5a3.2 3.2 0 0 1-.4-6.3 4.6 4.6 0 0 1 8.9-.9 3.5 3.5 0 0 1 .9 7.2z" fill="#fff" />
      </svg>
      <span className={`text-xl font-bold tracking-tight ${light ? "text-white" : "text-navy-900"}`}>Trust<span className="text-brand-500">Share</span></span>
    </span>
  );
}

export const Spinner = ({ className = "h-5 w-5" }: { className?: string }) => <Loader2 className={`animate-spin ${className}`} aria-hidden="true" />;
export const Loading = ({ label = "Loading…" }: { label?: string }) => <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Spinner />{label}</div>;

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div className="flex-1">{message}</div>{onRetry && <button className="font-semibold underline" onClick={onRetry}>Retry</button>}</div>;
}
export const Notice = ({ kind = "info", children }: { kind?: "info" | "success" | "warn"; children: ReactNode }) => {
  const c = { info: "border-lavender-200 bg-lavender-50 text-lavender-700", success: "border-emerald-200 bg-emerald-50 text-emerald-800", warn: "border-amber-200 bg-amber-50 text-amber-800" }[kind];
  return <div role={kind === "success" ? "status" : undefined} className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${c}`}>{kind === "success" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}<div>{children}</div></div>;
};
export const Empty = ({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) => (
  <div className="flex flex-col items-center justify-center px-4 py-12 text-center text-slate-500">{icon || <Inbox className="mb-3 h-9 w-9 text-slate-300" />}<p className="font-medium text-slate-700">{title}</p>{hint && <p className="mt-1 max-w-sm text-sm">{hint}</p>}</div>
);

export function PageHeader({ title, subtitle, actions, icon }: { title: string; subtitle?: string; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">{icon && <div className="mt-1 grid h-11 w-11 place-items-center rounded-xl bg-grad-brand text-white shadow-sm">{icon}</div>}
        <div><h1 className="text-2xl font-bold tracking-tight text-navy-950">{title}</h1>{subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}</div></div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const TONES: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", red: "bg-red-50 text-red-700 ring-red-600/20", amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
  blue: "bg-lavender-50 text-lavender-700 ring-lavender-500/20", slate: "bg-slate-100 text-slate-600 ring-slate-500/20", orange: "bg-orange-50 text-orange-700 ring-orange-600/20", purple: "bg-violet-50 text-violet-700 ring-violet-600/20",
};
export const Badge = ({ tone = "slate", children }: { tone?: string; children: ReactNode }) => <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONES[tone]}`}>{children}</span>;
export const sevTone = (s: string) => ({ critical: "red", high: "red", medium: "orange", low: "amber", informational: "blue" } as any)[s] || "slate";
export const statusTone = (s: string) => ({ active: "green", success: "green", revoked: "red", failed: "red", expired: "slate", file_deleted: "slate", exhausted: "amber" } as any)[s] || "slate";

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
      <span>{total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}` : "0 results"}</span>
      <div className="flex items-center gap-1">
        <button className="btn-ghost" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
        <span className="px-2">Page {page} / {pages}</span>
        <button className="btn-ghost" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </nav>
  );
}

export type Col<T> = { key: string; header: string; render: (r: T) => ReactNode; className?: string };
export function Table<T>({ cols, rows, empty, rowKey }: { cols: Col<T>[]; rows: T[]; empty?: ReactNode; rowKey: (r: T) => string | number }) {
  const list = rows || [];
  if (!list.length) return <>{empty || <Empty title="Nothing here yet" />}</>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px]">
        <thead className="bg-slate-50/80"><tr>{cols.map((c) => <th key={c.key} scope="col" className={`th ${c.className || ""}`}>{c.header}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">{list.map((r) => <tr key={rowKey(r)} className="hover:bg-slate-50/70">{cols.map((c) => <td key={c.key} className={`td ${c.className || ""}`}>{c.render(r)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey); ref.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); prev?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`card max-h-[90vh] w-full overflow-y-auto p-6 ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">{title}</h2><button className="btn-ghost" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button></div>
        {children}
      </div>
    </div>
  );
}

export function Confirm({ open, title, message, confirmLabel = "Confirm", danger, onConfirm, onClose, busy }: { open: boolean; title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onClose: () => void; busy?: boolean }) {
  return <Modal open={open} onClose={onClose} title={title}><div className="text-sm text-slate-600">{message}</div>
    <div className="mt-6 flex justify-end gap-2"><button className="btn-secondary" onClick={onClose}>Cancel</button><button className={danger ? "btn-danger" : "btn-primary"} disabled={busy} onClick={onConfirm}>{busy && <Spinner className="h-4 w-4" />}{confirmLabel}</button></div></Modal>;
}

export function Field({ label, htmlFor, error, hint, children, right }: { label: string; htmlFor: string; error?: string; hint?: string; children: ReactNode; right?: ReactNode }) {
  return <div><div className="mb-1.5 flex items-center justify-between"><label htmlFor={htmlFor} className="text-sm font-semibold text-slate-800">{label}</label>{right}</div>{children}{hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}{error && <p role="alert" className="mt-1 text-xs font-medium text-red-600">{error}</p>}</div>;
}

export function StatCard({ icon, tint, label, value, sub, change }: { icon: ReactNode; tint: string; label: string; value: ReactNode; sub?: string; change?: number | null }) {
  return (
    <div className="card flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-soft">
      <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${tint}`}>{icon}</div>
      <div className="min-w-0 flex-1"><p className="text-xs font-medium text-slate-500">{label}</p>
        <div className="flex flex-wrap items-center gap-2"><p className="text-2xl font-bold tracking-tight text-navy-950">{value}</p>
          {change != null && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${change >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>{change >= 0 ? "▲" : "▼"} {Math.abs(change)}%</span>}</div>
        {sub && <p className="text-xs text-slate-500">{sub}</p>}</div>
    </div>
  );
}

export function Section({ title, right, children, className = "" }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`card p-5 ${className}`}><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold text-navy-950">{title}</h2>{right}</div>{children}</section>;
}

export function RangeSelect({ r }: { r: ReturnType<typeof import("./hooks").useRange> }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="range">Date range</label>
      <select id="range" className="input !w-auto !py-2" value={r.preset} onChange={(e) => r.choose(e.target.value)}>
        <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="custom">Custom range</option>
      </select>
      {r.preset === "custom" && <>
        <input aria-label="Start date" type="date" className="input !w-auto !py-2" value={r.start} max={r.end} onChange={(e) => r.setStart(e.target.value)} />
        <input aria-label="End date" type="date" className="input !w-auto !py-2" value={r.end} min={r.start} onChange={(e) => r.setEnd(e.target.value)} />
      </>}
    </div>
  );
}
export const SrSummary = ({ children }: { children: ReactNode }) => <p className="sr-only">{children}</p>;
