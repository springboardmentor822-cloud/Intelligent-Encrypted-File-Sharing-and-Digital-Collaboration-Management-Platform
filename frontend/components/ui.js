import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  Archive, ChevronLeft, ChevronRight, File as FileGeneric, FileText, Film, Image as ImageIcon, Loader2, X,
} from 'lucide-react';

export function LogoMark({ size = 30 }) {
  return (
    <svg width={size} height={size * 1.12} viewBox="0 0 32 36" aria-hidden="true">
      <path d="M16 1 3 6v10c0 9 5.6 16 13 19 7.4-3 13-10 13-19V6L16 1z" fill="#0b63f3" />
      <path d="M11 23a3.6 3.6 0 0 1 .5-7.2 5.2 5.2 0 0 1 9.9 1.3A3 3 0 0 1 21.4 23H11z" fill="#fff" />
    </svg>
  );
}

export function Logo({ dark = false, subtitle }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="leading-tight">
        <div className={clsx('text-xl font-extrabold tracking-tight', dark ? 'text-white' : 'text-ink')}>
          Trust<span className={dark ? 'text-brand-500' : 'text-brand-600'}>Share</span>
        </div>
        {subtitle && <div className={clsx('text-[11px]', dark ? 'text-slate-400' : 'text-ink-faint')}>{subtitle}</div>}
      </div>
    </div>
  );
}

export const Spinner = ({ className }) => <Loader2 className={clsx('h-5 w-5 animate-spin text-brand-600', className)} aria-label="Loading" />;

export function PageLoader() {
  return <div className="flex min-h-[40vh] items-center justify-center"><Spinner className="h-7 w-7" /></div>;
}

const BADGES = {
  green: 'bg-emerald-50 text-emerald-700', red: 'bg-rose-50 text-rose-700', amber: 'bg-amber-50 text-amber-700',
  blue: 'bg-brand-50 text-brand-700', slate: 'bg-slate-100 text-slate-600', purple: 'bg-violet-50 text-violet-700',
};
export const Badge = ({ tone = 'slate', children, className }) => (
  <span className={clsx('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold', BADGES[tone], className)}>{children}</span>
);

export const STATUS_TONE = { active: 'green', success: 'green', expired: 'amber', revoked: 'red', exhausted: 'amber', failed: 'red',
  high: 'red', critical: 'red', medium: 'amber', low: 'blue', info: 'blue' };
export const StatusBadge = ({ status }) => <Badge tone={STATUS_TONE[status] || 'slate'}>{status[0].toUpperCase() + status.slice(1)}</Badge>;

export function ErrorNote({ children }) {
  if (!children) return null;
  return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{children}</div>;
}

export function EmptyState({ icon: Icon, title, hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon && <div className="mb-3 rounded-2xl bg-brand-50 p-3"><Icon className="h-6 w-6 text-brand-600" /></div>}
      <p className="font-semibold">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-ink-soft">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children, wide = false, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-900/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title}
        className={clsx('flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="btn-ghost !p-1.5" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

/** Small click-away dropdown menu. */
export function Menu({ trigger, children, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div onClick={() => setOpen(false)}
          className={clsx('absolute z-30 mt-1 min-w-[11rem] rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl', align === 'right' ? 'right-0' : 'left-0')}>
          {children}
        </div>
      )}
    </div>
  );
}
export const MenuItem = ({ icon: Icon, danger, children, ...p }) => (
  <button {...p} className={clsx('flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm hover:bg-slate-50', danger ? 'text-rose-600' : 'text-ink')}>
    {Icon && <Icon className="h-4 w-4" />}{children}
  </button>
);

export function Pagination({ page, pageSize, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-ink-soft">
      <span>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}</span>
      <div className="flex gap-1">
        <button className="btn-secondary !p-2" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
        <button className="btn-secondary !p-2" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

export function ProgressBar({ value, tone = 'brand' }) {
  const color = value > 90 ? 'bg-rose-500' : value > 75 ? 'bg-amber-500' : 'bg-brand-600';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className={clsx('h-full rounded-full transition-all', tone === 'brand' ? color : tone)} style={{ width: `${value}%` }} />
    </div>
  );
}

export function Delta({ value }) {
  const up = value >= 0;
  return (
    <span className={clsx('rounded-md px-1.5 py-0.5 text-xs font-bold', up ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>
      {up ? '↑' : '↓'} {Math.abs(value)}%
    </span>
  );
}

export function StatCard({ icon: Icon, tone = 'blue', label, value, sub, delta, invertDelta }) {
  const tones = { blue: 'bg-brand-50 text-brand-600', green: 'bg-emerald-50 text-emerald-600', purple: 'bg-violet-50 text-violet-600',
    rose: 'bg-rose-50 text-rose-600', amber: 'bg-amber-50 text-amber-600' };
  return (
    <div className="card flex items-center gap-4 p-5">
      <div className={clsx('rounded-xl p-3', tones[tone])}><Icon className="h-6 w-6" /></div>
      <div className="min-w-0">
        <div className="text-xs font-medium text-ink-soft">{label}</div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-2xl font-extrabold tracking-tight">{value}</span>
          {delta != null && <Delta value={invertDelta ? -delta : delta} />}
        </div>
        {sub && <div className="text-xs text-ink-faint">{sub}</div>}
      </div>
    </div>
  );
}

const ICONS = { documents: [FileText, 'text-brand-600 bg-brand-50'], images: [ImageIcon, 'text-emerald-600 bg-emerald-50'],
  videos: [Film, 'text-rose-600 bg-rose-50'], others: [Archive, 'text-violet-600 bg-violet-50'] };
const EXT_TONE = { pdf: 'text-rose-600 bg-rose-50', docx: 'text-brand-600 bg-brand-50', doc: 'text-brand-600 bg-brand-50',
  xlsx: 'text-emerald-600 bg-emerald-50', xls: 'text-emerald-600 bg-emerald-50' };
export function FileIcon({ category, name = '' }) {
  const ext = name.split('.').pop().toLowerCase();
  const [Icon, tone] = ICONS[category] || [FileGeneric, 'text-slate-500 bg-slate-100'];
  return <div className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', EXT_TONE[ext] || tone)}><Icon className="h-[18px] w-[18px]" /></div>;
}

export const Table = ({ children }) => <div className="overflow-x-auto"><table className="w-full min-w-[640px]">{children}</table></div>;
