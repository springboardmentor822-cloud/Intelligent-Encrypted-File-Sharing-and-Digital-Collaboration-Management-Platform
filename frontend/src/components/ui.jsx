// Small reusable UI pieces used by the dashboards.
import { useState } from "react";
import { C } from "../lib/theme";
import { ArrowDown, ArrowUp, CalendarDays, ChevronDown, Lock } from "lucide-react";
import { formatBytes } from "../lib/format";

const AVATAR_COLORS = ["bg-brand-600", "bg-rose-500", "bg-sky-600", "bg-amber-500", "bg-violet-600", "bg-emerald-600"];

export function Avatar({ name = "?", size = 36 }) {
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const color = AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${color}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials}</div>
  );
}

export function Badge({ tone = "slate", children }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700", green: "bg-emerald-100 text-emerald-700", red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-800", teal: "bg-brand-100 text-brand-800", violet: "bg-violet-100 text-violet-700",
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function StatCard({ icon: Icon, label, value, sub, tone = "teal", children }) {
  const tones = { teal: "bg-brand-50 text-brand-600", green: "bg-emerald-50 text-emerald-600", amber: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-600",
    sky: "bg-sky-50 text-sky-700", violet: "bg-violet-50 text-violet-700" };
  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        {Icon && <span className={`rounded-xl p-2 ${tones[tone]}`}><Icon size={18} /></span>}
      </div>
      <div className="font-display text-3xl font-bold tracking-tight">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
      {children}
    </div>
  );
}

export function ProgressBar({ pct, height = "h-2", warn = true }) {
  const p = Math.max(0, Math.min(100, pct || 0));
  const color = !warn ? "bg-brand-500" : p >= 90 ? "bg-red-500" : p >= 70 ? "bg-amber-500" : "bg-brand-500";
  return (
    <div className={`${height} w-full overflow-hidden rounded-full bg-slate-100`}>
      <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${p}%` }} />
    </div>
  );
}

// Circular gauge: used storage vs capacity
export function Gauge({ used, capacity, size = 190 }) {
  const pct = capacity ? Math.min(100, (used / capacity) * 100) : 0;
  const r = 70, c = 2 * Math.PI * r;
  const color = pct >= 90 ? "#e5484d" : pct >= 70 ? "#f59e0b" : C.primary;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 180 180" width={size} height={size} className="-rotate-90">
        <circle cx="90" cy="90" r={r} fill="none" stroke="#e2e9f4" strokeWidth="16" />
        <circle cx="90" cy="90" r={r} fill="none" stroke={color} strokeWidth="16" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100} style={{ transition: "stroke-dashoffset 1s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-display text-3xl font-bold">{pct.toFixed(pct < 10 && pct > 0 ? 1 : 0)}%</div>
        <div className="text-xs text-slate-500">of {formatBytes(capacity)}</div>
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1">
      {tabs.map(([key, label, Icon]) => (
        <button key={key} onClick={() => onChange(key)}
          className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition ${
            value === key ? "bg-white text-brand-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
          {Icon && <Icon size={16} />} {label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
   New building blocks that give every page the same "vault" look.
   ------------------------------------------------------------------------------------------------ */

// Page title + subtitle (like the mockups). `children` are the buttons / filters on the right.
export function PageHeader({ title, subtitle, children, dark = false }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className={`font-display text-3xl font-extrabold tracking-tight ${dark ? "text-white" : "text-ink-950"}`}>{title}</h1>
        {subtitle && <p className={`mt-1 max-w-2xl text-sm ${dark ? "text-slate-300" : "text-slate-500"}`}>{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

// The "wax seal": shows that a file is sealed with AES-256 and which master key (version) protects it
export function Seal({ version = "v1", compact = false }) {
  return (
    <span title={`Encrypted with AES-256-GCM. Data key protected by master key ${version}.`}
      className="inline-flex items-center gap-1 rounded-full bg-wax-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-wax-600 ring-1 ring-wax-500/25">
      <Lock size={10} /> {compact ? version : `AES-256 · ${version}`}
    </span>
  );
}

// Small status light: tone = on | warn | off
export function Led({ tone = "on", pulse = false }) {
  const c = { on: "bg-emerald-500", warn: "bg-amber-500", off: "bg-slate-400", bad: "bg-red-500" }[tone];
  return <span className={`inline-block h-2 w-2 rounded-full ${c} ${pulse ? "animate-pulse2" : ""}`} />;
}

export function EmptyState({ icon: Icon, title, text, children }) {
  return (
    <div className="card flex flex-col items-center py-14 text-center">
      {Icon && <span className="mb-3 rounded-2xl bg-paper-100 p-4 text-brand-700"><Icon size={28} /></span>}
      <div className="font-display text-lg font-bold">{title}</div>
      {text && <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

// Pill group: [["7","7 days"],["30","30 days"]] etc.
export function Segmented({ options, value, onChange, dark = false }) {
  return (
    <div className={`inline-flex rounded-xl p-1 ${dark ? "bg-white/5 ring-1 ring-white/10" : "bg-paper-200/70"}`}>
      {options.map(([key, label]) => (
        <button key={key} onClick={() => onChange(key)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            value === key
              ? dark ? "bg-brand-500/20 text-brand-200 ring-1 ring-brand-400/40" : "bg-white text-ink-900 shadow-sm"
              : dark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

const shortDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// Button that looks like the mockup's "Oct 1, 2026 - Oct 22, 2026 v" and opens a small menu.
// onChange receives {days} or {date_from, date_to}.  `range` = {from, to} (dates currently shown) is optional.
export function DateRangeFilter({ value, onChange, range }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(value.date_from || "");
  const [to, setTo] = useState(value.date_to || "");
  const label = range ? `${shortDate(range.from)} - ${shortDate(range.to)}` : value.date_from ? `${shortDate(value.date_from)} - ${shortDate(value.date_to)}` : `Last ${value.days} days`;
  const choose = (v) => { setOpen(false); onChange(v); };
  const active = (d) => !value.date_from && value.days === d;
  return (
    <div className="relative">
      <button className="flex items-center gap-2 rounded-xl border border-paper-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-paper-50"
        onClick={() => setOpen(!open)}>
        <CalendarDays size={16} className="text-slate-500" /> {label} <ChevronDown size={15} className="text-slate-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-paper-200 bg-white p-2 shadow-xl">
            {[7, 30, 90].map((d) => (
              <button key={d} onClick={() => choose({ days: d })}
                className={`block w-full rounded-xl px-3 py-2 text-left text-sm ${active(d) ? "bg-brand-50 font-semibold text-brand-700" : "hover:bg-paper-100"}`}>
                Last {d} days
              </button>
            ))}
            <div className="mt-1 border-t border-paper-200 p-2">
              <div className="mb-1.5 text-xs font-medium text-slate-500">Custom range</div>
              <div className="flex items-center gap-1.5">
                <input type="date" className="input !px-2 !py-1.5 text-xs" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
                <span className="text-slate-400">-</span>
                <input type="date" className="input !px-2 !py-1.5 text-xs" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
              </div>
              <button className="btn-primary mt-2 w-full !py-1.5" disabled={!from || !to} onClick={() => choose({ date_from: from, date_to: to })}>Apply range</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// "↑ 12%" pill. `bad` = true when an increase is bad news (failed logins), so up becomes red.
export function Delta({ value, bad = false }) {
  if (value === null || value === undefined) return <span className="rounded-full bg-paper-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">new</span>;
  const up = value >= 0;
  const good = bad ? !up : up;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${good ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
      {up ? <ArrowUp size={11} /> : <ArrowDown size={11} />}{Math.abs(value)}%
    </span>
  );
}
