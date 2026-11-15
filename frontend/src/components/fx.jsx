// Eye-catching building blocks used by both dashboards: animated numbers, sparklines, a weekly heatmap,
// a floating shield with orbiting rings, and a staggered "fade up" entrance. No extra libraries needed.
import { useEffect, useRef, useState } from "react";
import { C } from "../lib/theme";
import { Lock, ShieldCheck } from "lucide-react";

// Counts up from 0 to `value` in ~1 second (like a car's odometer)
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString(), duration = 1000 }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const target = Number(value) || 0;
    const start = performance.now(), begin = from.current;
    let raf;
    const step = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);                 // slows down near the end
      setShown(begin + (target - begin) * eased);
      if (t < 1) raf = requestAnimationFrame(step); else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{format(shown)}</>;
}

// Entrance animation: children fade up one after another (delay in milliseconds)
export function Reveal({ delay = 0, className = "", children }) {
  return <div className={`animate-fade-up ${className}`} style={{ animationDelay: `${delay}ms` }}>{children}</div>;
}

// Tiny line + soft fill chart drawn with SVG. data = array of numbers
export function Sparkline({ data = [], color = C.primary, height = 40, id = "spark" }) {
  const w = 120;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => [(i / Math.max(data.length - 1, 1)) * w, height - 4 - (v / max) * (height - 10)]);
  if (pts.length < 2) return <div style={{ height }} />;
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const gid = `${id}-${color.replace("#", "")}`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".35" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L${w},${height} L0,${height} Z`} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// 7 days x 24 hours grid. The darker the square, the more activity at that hour. data = /reports/activity-heatmap
export function Heatmap({ data, color = C.primaryRgb }) {
  if (!data) return <div className="h-40 animate-pulse rounded-2xl bg-paper-100" />;
  const hourLabel = (h) => (h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`);
  return (
    <div>
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="mb-1 ml-9 grid grid-cols-24 gap-[3px] text-[10px] text-slate-400" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
            {Array.from({ length: 24 }).map((_, h) => <span key={h} className="text-center">{h % 3 === 0 ? hourLabel(h) : ""}</span>)}
          </div>
          {data.matrix.map((row, di) => (
            <div key={di} className="mb-[3px] flex items-center gap-2">
              <span className="w-7 text-[11px] font-medium text-slate-500">{data.day_names[di]}</span>
              <div className="grid flex-1 gap-[3px]" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
                {row.map((n, h) => {
                  const t = data.max ? n / data.max : 0;
                  return <span key={h} title={`${data.day_names[di]} ${hourLabel(h)}: ${n} event${n === 1 ? "" : "s"}`}
                    className="aspect-square rounded-[5px] transition hover:scale-125"
                    style={{ background: n ? `rgba(${color},${0.12 + t * 0.88})` : "#eef2f9" }} />;
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>{data.peak ? <>Busiest: <b className="text-ink-950">{data.peak.day} around {hourLabel(data.peak.hour)}</b> ({data.peak.count} events)</> : "No activity yet in this period"}</span>
        <span className="flex items-center gap-1.5">less
          {[0.1, 0.35, 0.6, 0.85, 1].map((t) => <span key={t} className="h-3 w-3 rounded-[4px]" style={{ background: `rgba(${color},${t})` }} />)}more</span>
      </div>
    </div>
  );
}

// Floating shield with slowly rotating dashed rings and glowing satellites (hero artwork)
export function ShieldOrbit({ size = 220, tone = "blue" }) {
  const c = tone === "red" ? "#f2686d" : C.primarySoft;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="absolute inset-0 animate-sweep-slow">
        <svg viewBox="0 0 220 220" className="h-full w-full">
          <circle cx="110" cy="110" r="104" fill="none" stroke={c} strokeOpacity=".35" strokeDasharray="3 9" strokeWidth="1.5" />
          <circle cx="110" cy="6" r="5" fill={c} /><circle cx="214" cy="110" r="3.5" fill="#fff" fillOpacity=".8" />
        </svg>
      </div>
      <div className="absolute inset-[22px] animate-sweep-rev">
        <svg viewBox="0 0 176 176" className="h-full w-full">
          <circle cx="88" cy="88" r="82" fill="none" stroke="#fff" strokeOpacity=".25" strokeDasharray="1 7" strokeWidth="2" strokeLinecap="round" />
          <circle cx="88" cy="6" r="4" fill="#f2686d" /><circle cx="6" cy="88" r="3" fill={c} />
        </svg>
      </div>
      <div className="absolute inset-[52px] animate-floaty">
        <div className="relative flex h-full w-full items-center justify-center rounded-[28px] bg-gradient-to-br from-white/25 to-white/5 shadow-2xl shadow-black/30 ring-1 ring-white/40 backdrop-blur-md">
          <ShieldCheck className="text-white" size={size * 0.28} strokeWidth={1.6} />
          <span className="absolute -bottom-2 -right-2 rounded-full bg-wax-500 p-2 text-white shadow-lg ring-4 ring-white/20"><Lock size={size * 0.07} /></span>
        </div>
      </div>
    </div>
  );
}

// Glass-looking tile used inside dark hero banners
export function GlassStat({ label, children, sub }) {
  return (
    <div className="rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15 backdrop-blur-md">
      <div className="text-[11px] font-medium uppercase tracking-wider text-blue-100/70">{label}</div>
      <div className="font-display text-2xl font-extrabold tabular text-white">{children}</div>
      {sub && <div className="text-xs text-blue-100/60">{sub}</div>}
    </div>
  );
}

// Animated blurred colour blobs behind a hero banner
export function HeroBackdrop() {
  return (
    <>
      <div className="pointer-events-none absolute -left-16 -top-24 h-72 w-72 animate-drift rounded-full bg-brand-400/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 right-10 h-80 w-80 animate-drift rounded-full bg-wax-500/25 blur-3xl" style={{ animationDelay: "-6s" }} />
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-50" />
    </>
  );
}
