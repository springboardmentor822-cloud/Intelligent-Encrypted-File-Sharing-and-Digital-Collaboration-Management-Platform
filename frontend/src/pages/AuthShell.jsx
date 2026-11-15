import { Link } from "react-router-dom";
import { ArrowLeft, Lock, ScrollText, ShieldCheck, Timer } from "lucide-react";

const POINTS = [
  [Lock, "Encrypted before it is stored", "Every file gets its own AES-256 key."],
  [Timer, "Links that expire", "Limit by time, downloads or password."],
  [ScrollText, "Everything is logged", "A complete audit trail for admins."],
];

export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="bg-grid relative hidden flex-col justify-between overflow-hidden bg-ink-900 p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-brand-500/25 blur-[100px]" />
        <Link to="/" className="relative flex items-center gap-2 font-display text-2xl font-bold">
          <span className="rounded-lg bg-brand-500 p-1.5 text-ink-950"><ShieldCheck size={20} /></span> TrustShare
        </Link>
        <div className="relative">
          <h2 className="h-display text-4xl font-extrabold leading-tight">
            Your files,<br />behind <span className="text-brand-300">your</span> lock.
          </h2>
          <div className="mt-8 space-y-5">
            {POINTS.map(([Icon, t, d]) => (
              <div key={t} className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/30"><Icon size={18} /></span>
                <div><div className="font-medium">{t}</div><div className="text-sm text-slate-400">{d}</div></div>
              </div>
            ))}
          </div>
        </div>
        <p className="relative break-all font-mono text-[11px] leading-relaxed text-brand-300/40">
          9f3a7c1e5b2d84a06c91ef37d2b8a45c0e6f19d3a7b82c4e5f01a9d6b3c78e24f5a1c0d9e8b7a6f5e4d3c2b1a09f8e7d6c5b4a39281706f5e
        </p>
      </div>

      <div className="flex items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-6 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700"><ArrowLeft size={14} /> Back to home</Link>
          <div className="card p-7">
            <h2 className="font-display text-2xl font-bold tracking-tight">{title}</h2>
            {subtitle && <p className="mb-5 mt-1 text-sm text-slate-500">{subtitle}</p>}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
