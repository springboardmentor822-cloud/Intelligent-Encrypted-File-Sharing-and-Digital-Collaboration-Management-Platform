import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, CheckCircle2, FileSpreadsheet, FileText, Image as Img, KeyRound, Lock, Menu, Share2, ShieldCheck, Users, X, Cloud, Fingerprint, Sparkles } from "lucide-react";
import { useState } from "react";
import { Logo } from "../ui";

const HERO_IMG = "https://images.unsplash.com/photo-1614064641938-3bbee52942c7?auto=format&fit=crop&w=1200&q=80";
const TEAM_IMG = "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1000&q=80";

function Preview() {
  const rows = [
  ["Best.pdf", "2.4 MB", "bg-red-50 text-red-600", FileText],
  ["Platform.png", "850 KB", "bg-lavender-50 text-lavender-600", Img],
  ["For.docx", "1.1 MB", "bg-brand-50 text-violet-600", FileText],
  ["File Sharing.xlsx", "720 KB", "bg-violet-50 text-violet-600", FileSpreadsheet]
] as const;
  return (
    <div className="relative mx-auto w-full max-w-lg" aria-hidden="true">
      <div className="absolute -inset-8 rounded-[3rem] bg-grad-mesh blur-2xl" />
      <div className="relative overflow-hidden rounded-[2rem] border border-white/50 shadow-glow">
        <img src={HERO_IMG} alt="" className="h-52 w-full object-cover" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-t from-navy-950/70 via-navy-900/10 to-transparent" />
        <div className="absolute bottom-4 left-5 flex items-center gap-2 text-black"><ShieldCheck className="h-5 w-5" /><span className="text-sm font-semibold">AES-256 encrypted at rest</span></div>
      </div>
      <div className="card relative -mt-10 ml-auto w-[90%] p-4 shadow-soft">
        <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold text-black">Your Files are stored safely.</p><span className="rounded-lg bg-grad-brand px-3 py-1 text-xs font-semibold text-white">+ Upload</span></div>
        <div className="space-y-2">{rows.map(([n, s, c, I]) => <div key={n} className="flex items-center gap-3 rounded-xl bg-slate-50 p-2.5"><span className={`grid h-8 w-8 place-items-center rounded-lg ${c}`}><I className="h-4 w-4" /></span><div className="flex-1"><p className="text-xs font-semibold !text-black">{n}</p><p className="text-[11px] text-slate-500">{s}</p></div><Lock className="h-3.5 w-3.5 text-slate-400" /></div>)}</div>
        <p className="mt-3 text-[11px] text-slate-400">The safest platform you will ever find.</p>
      </div>
    </div>
  );
}

const FEATURES = [
  { icon: Lock, tint: "bg-brand-50 text-brand-600", t: "AES-256 Encryption", d: "Files are encrypted on the server with AES-256-GCM before they reach permanent storage. Each file gets its own key." },
  { icon: Share2, tint: "bg-lavender-50 text-lavender-600", t: "Controlled Sharing", d: "Share by link or with a registered user. Add an optional passcode, choose view or download, set an expiry, and revoke anytime." },
  { icon: BarChart3, tint: "bg-violet-50 text-violet-600", t: "Activity Monitoring", d: "Track downloads, share usage and account activity with an audit trail you can review." },
  { icon: Users, tint: "bg-brand-50 text-brand-700", t: "Role-Based Access", d: "Permissions are enforced on the server. Standard users and administrators see different data." },
  { icon: ShieldCheck, tint: "bg-lavender-100 text-lavender-700", t: "Integrity Checks", d: "Authenticated encryption detects tampered or corrupted files, which are rejected instead of delivered." },
];

export default function Landing() {
  const [open, setOpen] = useState(false);
  const links = [["Home", "#home"], ["Features", "#features"], ["How It Works", "#how"], ["Pricing", "#pricing"], ["About", "#about"]];
  return (
    <div id="home" className="bg-white">
      <header className="sticky top-0 z-30 border-b border-white/40 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" aria-label="TrustShare home"><Logo /></Link>
          <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">{links.map(([l, h], i) => <a key={l} href={h} className={`text-sm font-medium ${i === 0 ? "border-b-2 border-lavender-500 pb-1 text-lavender-700" : "text-slate-600 hover:text-lavender-700"}`}>{l}</a>)}</nav>
          <div className="hidden items-center gap-3 md:flex"><Link to="/login" className="btn-secondary">Sign In</Link><Link to="/signup" className="btn-primary">Get Started</Link></div>
          <button className="btn-ghost md:hidden" aria-label="Menu" onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
        </div>
        {open && <div className="space-y-1 border-t border-slate-100 px-4 py-3 md:hidden">{links.map(([l, h]) => <a key={l} href={h} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm font-medium hover:bg-lavender-50">{l}</a>)}<div className="flex gap-2 pt-2"><Link to="/login" className="btn-secondary flex-1">Sign In</Link><Link to="/signup" className="btn-primary flex-1">Get Started</Link></div></div>}
      </header>

      <section className="relative overflow-hidden bg-grad-hero text-white">
        <div className="absolute inset-0 bg-grad-mesh opacity-70" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div className="animate-fadein">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-lavender-100 ring-1 ring-white/20 backdrop-blur"><Sparkles className="h-3 w-3" />Secure · Private · Reliable</span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">Share Everything.<span className="bg-gradient-to-r from-lavender-200 via-white to-brand-200 bg-clip-text text-transparent">Expose Nothing.</span></h1>
            <p className="mt-5 max-w-xl text-lg text-slate-200">Every file gets its own encryption key. Every link can expire, ask for a passcode, or be revoked in one click. Every action leaves a trail..</p>
            <div className="mt-8 flex flex-wrap gap-3"><Link to="/signup" className="btn !bg-white !px-7 !py-3.5 text-base !text-navy-900 hover:!bg-lavender-50">Get Started <ArrowRight className="h-4 w-4" /></Link><a href="#how" className="btn !px-7 !py-3.5 text-base !border !border-white/30 !bg-white/10 !text-white hover:!bg-white/20">See how it works</a></div>
            <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-200">{["AES-256 Encrypted Storage", "Passcode-Protected Links", "Audit Logs"].map((x) => <li key={x} className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-lavender-300" />{x}</li>)}</ul>
          </div>
          <Preview />
        </div>
      </section>

      <section aria-label="Highlights" className="mx-auto -mt-8 max-w-6xl px-4 sm:px-6">
        <div className="card-glass grid divide-y divide-slate-100 p-2 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
          {[[ShieldCheck, "AES-256-GCM", "Authenticated encryption"], [KeyRound, "Per-file keys", "Wrapped by a master key"], [Fingerprint, "Hashed tokens", "Share tokens never stored raw"], [BarChart3, "Audit trail", "Hash-chained activity log"]].map(([I, a, b]: any) => (
            <div key={a} className="flex items-center gap-4 p-5"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-grad-brand text-white"><I className="h-6 w-6" /></span><div><p className="text-lg font-bold">{a}</p><p className="text-sm text-slate-500">{b}</p></div></div>))}
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6">
        <div className="text-center"><span className="rounded-full bg-lavender-50 px-3 py-1 text-xs font-bold tracking-wider text-lavender-700">WHY TRUSTSHARE</span>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">Powerful Features for <span className="gradient-text">Secure Collaboration</span></h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-600">Everything you need to manage, protect, and share your files in one place.</p></div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{FEATURES.map(({ icon: I, tint, t, d }) => <div key={t} className="card p-5 transition hover:-translate-y-1 hover:shadow-soft"><span className={`grid h-12 w-12 place-items-center rounded-xl ${tint}`}><I className="h-6 w-6" /></span><h3 className="mt-4 font-bold">{t}</h3><p className="mt-2 text-sm leading-relaxed text-slate-600">{d}</p></div>)}</div>
      </section>

      <section id="how" className="scroll-mt-20 bg-grad-soft py-20"><div className="mx-auto max-w-7xl px-4 sm:px-6">
        <h2 className="text-center text-3xl font-extrabold tracking-tight">How It Works</h2>
        <ol className="mt-12 grid gap-6 md:grid-cols-4">{["Upload", "Encrypt", "Share", "Monitor"].map((t, i) => <li key={t} className="card p-6"><span className="grid h-9 w-9 place-items-center rounded-full bg-grad-brand text-sm font-bold text-white">{i + 1}</span><h3 className="mt-4 font-bold">{t}</h3><p className="mt-1 text-sm text-slate-600">{["Choose a file. The server checks its type and size.", "The backend encrypts it with a unique AES-256 key before storing it.", "Create a link or share with a user. Add a passcode, permissions and an expiry.", "See downloads and activity, and revoke access whenever you like."][i]}</p></li>)}</ol></div></section>

      <section id="pricing" className="scroll-mt-20 mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
        <h2 className="text-3xl font-extrabold tracking-tight">Pricing</h2>
        <p className="mt-3 text-slate-600">TrustShare is currently a project build with no paid plans. Each account receives a storage quota set by the administrator (1 GB by default).</p>
        <Link to="/signup" className="btn-primary mt-6">Create an account</Link></section>

      <section id="about" className="scroll-mt-20 bg-navy-950 py-16 text-white"><div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2">
        <div><h2 className="text-2xl font-bold">About</h2><p className="mt-3 text-slate-300">TrustShare is a secure file-sharing and document-management application built with Python, React, FastAPI and AES-256-GCM envelope encryption. It ensures 100% data privacy and compliance.</p></div>
        <img src={TEAM_IMG} alt="Team collaborating" className="h-56 w-full rounded-2xl object-cover ring-1 ring-white/20" loading="lazy" />
      </div></section>

      <footer className="border-t border-slate-100 py-8"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 text-sm text-slate-500 sm:px-6"><Logo size={24} /><nav aria-label="Footer" className="flex gap-5">{links.map(([l, h]) => <a key={l} href={h} className="hover:text-lavender-700">{l}</a>)}<Link to="/login" className="hover:text-lavender-700">Sign In</Link></nav><p>© {new Date().getFullYear()} TrustShare</p></div></footer>
    </div>
  );
}
