// The public home page. Concept: "the vault door". A falling-cipher backdrop, a live encryption lab that runs in the
// visitor's own browser (Web Crypto, real AES-256-GCM), two doors (user / admin), and the features as a bento grid.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity, ArrowRight, BarChart3, BellRing, ChevronDown, Crosshair, Database, Eye, FileLock2, Gauge, KeyRound, Link2, Lock, Radar,
  ScrollText, ShieldAlert, ShieldCheck, Sparkles, UserCheck, Users, Zap,
} from "lucide-react";
import { useAuth } from "../store/auth";
import ThemePicker from "../components/ThemePicker";
import { ShieldOrbit } from "../components/fx";

/* ---------- scroll reveal ---------- */
function Reveal({ children, className = "", delay = 0 }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { el.classList.add("in"); io.disconnect(); } }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
}

/* ---------- falling hexadecimal "cipher rain" behind the hero (light on the CPU: ~16 frames per second) ---------- */
function CipherRain() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    const root = getComputedStyle(document.documentElement);
    const rgb = (name) => root.getPropertyValue(name).trim().split(/\s+/).join(",");
    const trail = `rgba(${rgb("--ink-950")},.16)`, ink = rgb("--brand-300");
    let w = 0, h = 0, cols = 0, drops = [], raf = 0, last = 0;
    const resize = () => { w = canvas.width = canvas.offsetWidth; h = canvas.height = canvas.offsetHeight; cols = Math.floor(w / 20); drops = Array.from({ length: cols }, () => Math.random() * (h / 20)); };
    resize();
    window.addEventListener("resize", resize);
    const draw = (t) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 62) return;
      last = t;
      ctx.fillStyle = trail; ctx.fillRect(0, 0, w, h);
      ctx.font = "15px 'JetBrains Mono', monospace";
      for (let i = 0; i < cols; i++) {
        ctx.fillStyle = `rgba(${ink},${0.15 + Math.random() * 0.55})`;
        ctx.fillText("0123456789abcdef"[Math.floor(Math.random() * 16)], i * 20, drops[i] * 20);
        if (drops[i] * 20 > h && Math.random() > 0.975) drops[i] = 0;
        drops[i] += 1;
      }
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { ctx.fillStyle = trail; ctx.fillRect(0, 0, w, h); } else raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full opacity-70" />;
}

/* ---------- the encryption lab: real AES-256-GCM in YOUR browser ---------- */
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
const enc = new TextEncoder(), dec = new TextDecoder();

function CryptoLab() {
  const [text, setText] = useState("Salary_Report_2026: CONFIDENTIAL");
  const [state, setState] = useState(null);       // { key, keyHex, ivHex, cipher: Uint8Array }
  const [tampered, setTampered] = useState(false);
  const [out, setOut] = useState(null);           // { ok, text }
  const supported = typeof window !== "undefined" && window.crypto && window.crypto.subtle;

  const encrypt = async () => {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text)));
    setState({ key, iv, keyHex: hex(new Uint8Array(await crypto.subtle.exportKey("raw", key))), ivHex: hex(iv), cipher });
    setTampered(false); setOut(null);
  };
  const tamper = () => {
    if (!state) return;
    const c = new Uint8Array(state.cipher); c[2] ^= 1;   // flip ONE bit
    setState({ ...state, cipher: c }); setTampered(true); setOut(null);
  };
  const decrypt = async () => {
    try {
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: state.iv }, state.key, state.cipher);
      setOut({ ok: true, text: dec.decode(plain) });
    } catch { setOut({ ok: false }); }
  };
  const body = state ? hex(state.cipher.slice(0, -16)) : "", tag = state ? hex(state.cipher.slice(-16)) : "";

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl sm:p-7">
      {!supported && <p className="mb-3 rounded-xl bg-amber-400/10 p-3 text-sm text-amber-200">Your browser blocks the Web Crypto API on this address. Open the site on http://localhost to try it.</p>}
      <label className="font-mono text-[11px] uppercase tracking-[0.2em] text-brand-200/70">1 · Type something secret</label>
      <input value={text} onChange={(e) => setText(e.target.value)} maxLength={80}
        className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 font-mono text-sm text-white outline-none focus:border-brand-300" />
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={encrypt} disabled={!supported || !text} className="btn bg-brand-500 text-white hover:bg-brand-400"><Lock size={15} /> Encrypt (AES-256-GCM)</button>
        <button onClick={tamper} disabled={!state} className="btn border border-white/20 text-white hover:bg-white/10"><Zap size={15} /> Flip one bit</button>
        <button onClick={decrypt} disabled={!state} className="btn border border-white/20 text-white hover:bg-white/10"><KeyRound size={15} /> Decrypt</button>
      </div>
      <div className="mt-4 space-y-2 font-mono text-xs">
        <Row label="256-bit key" value={state?.keyHex} tone="text-emerald-300" hint="random, new for every file" />
        <Row label="nonce" value={state?.ivHex} tone="text-sky-300" hint="never reused" />
        <Row label="ciphertext" value={body} tone="text-brand-200" hint="what gets stored" />
        <Row label="auth tag" value={tag} tone={tampered ? "text-red-300" : "text-amber-300"} hint="detects any change" />
      </div>
      {out && (
        <div className={`mt-4 rounded-xl p-3.5 text-sm ${out.ok ? "bg-emerald-400/10 text-emerald-200" : "bg-red-500/15 text-red-200"}`}>
          {out.ok ? <>Decrypted: <b className="font-mono">{out.text}</b></> : <><b>Authentication failed.</b> One flipped bit and the whole file is refused. Nothing is returned. This is exactly what TrustShare's server does.</>}
        </div>
      )}
      {!state && <p className="mt-4 text-xs text-slate-400">Everything here runs inside your browser. Nothing is sent anywhere.</p>}
    </div>
  );
}

function Row({ label, value, tone, hint }) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-black/25 px-3 py-2">
      <span className="w-24 shrink-0 text-slate-400">{label}</span>
      <span className={`min-w-0 flex-1 break-all ${tone}`}>{value || <span className="text-slate-600">press Encrypt...</span>}</span>
      <span className="hidden shrink-0 text-slate-500 lg:block">{hint}</span>
    </div>
  );
}

/* ---------- small pieces ---------- */
function Door({ tone, icon: Icon, title, who, bullets, to, cta }) {
  return (
    <div className={`group relative overflow-hidden rounded-[28px] border border-white/10 p-7 transition duration-300 hover:-translate-y-1.5 ${tone}`}>
      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl transition group-hover:scale-150" />
      <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/25"><Icon size={22} /></span>
      <div className="relative mt-4 font-mono text-[11px] uppercase tracking-[0.2em] text-white/60">{who}</div>
      <h3 className="relative font-display text-2xl font-bold text-white">{title}</h3>
      <ul className="relative mt-4 space-y-2 text-sm text-white/85">{bullets.map((b) => <li key={b} className="flex gap-2"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-white/70" />{b}</li>)}</ul>
      <Link to={to} className="relative mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-ink-900 transition group-hover:gap-3">{cta} <ArrowRight size={16} /></Link>
    </div>
  );
}

function Tile({ icon: Icon, title, text, className = "", accent = "text-brand-600 bg-brand-50" }) {
  return (
    <div className={`card group transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-brand-600/10 ${className}`}>
      <span className={`flex h-11 w-11 items-center justify-center rounded-2xl transition group-hover:scale-110 group-hover:rotate-3 ${accent}`}><Icon size={20} /></span>
      <h3 className="mt-3 font-display text-lg font-bold text-ink-950">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">{text}</p>
    </div>
  );
}

const STEPS = [
  [FileLock2, "Upload", "checked for type, size and disguised files"], [Lock, "Encrypt", "AES-256-GCM, a fresh key per file"], [Database, "Store", "only unreadable bytes are saved"],
  [Link2, "Share", "people or expiring links, you decide"], [Eye, "Watch", "every action is written to the audit log"], [ShieldAlert, "Respond", "rules alert, notify and can block attackers"],
];
const FAQ = [
  ["Can the administrator read my files?", "No. Administrators manage accounts and see file names, sizes and who touched what. Decryption needs the server's master key and happens only for an authorized download."],
  ["What if the database or storage is stolen?", "The thief gets encrypted bytes and wrapped keys. Without the master key (which lives only in the server's environment) they are useless."],
  ["Who decides who gets in?", "The administrator. New accounts can require approval, suspicious IP addresses can be blocked (by hand or automatically), and every decision is logged."],
  ["What is a tripwire file?", "A trap. An admin marks a decoy file; nobody has a reason to open it, so any access raises a critical alert and tells you whose account or link did it."],
  ["How much storage is there?", "1 GB for the platform and for each user. The admin dashboard shows usage per user, growth, and warns before it fills up."],
];

export default function Landing() {
  const user = useAuth((s) => s.user);
  const cta = user ? { to: "/dashboard", label: "Open my vault" } : { to: "/signup", label: "Create a free account" };
  const [open, setOpen] = useState(0);

  return (
    <div className="bg-ink-950 text-white">
      {/* ---------------- navigation ---------------- */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-ink-950/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5">
          <Link to="/" className="flex items-center gap-2.5 font-display text-xl font-bold">
            <span className="relative rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 p-2"><ShieldCheck size={18} /><span className="absolute -bottom-1 -right-1 rounded-full bg-wax-500 p-0.5 ring-2 ring-ink-950"><Lock size={8} /></span></span>
            TrustShare
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-slate-300 md:flex">
            {[["#lab", "Try it"], ["#doors", "User & Admin"], ["#flow", "How it works"], ["#features", "Features"], ["#faq", "FAQ"]].map(([h, l]) => <a key={h} href={h} className="transition hover:text-white">{l}</a>)}
          </nav>
          <div className="flex items-center gap-2">
            <div className="hidden sm:block"><ThemePicker /></div>
            {!user && <Link to="/login" className="rounded-xl px-3 py-2 text-sm text-slate-200 hover:text-white">Log in</Link>}
            <Link to={cta.to} className="rounded-xl bg-gradient-to-r from-brand-500 to-wax-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:-translate-y-px">{user ? "Open vault" : "Get started"}</Link>
          </div>
        </div>
      </header>

      {/* ---------------- hero ---------------- */}
      <section className="relative isolate overflow-hidden pt-28">
        <div className="control-room absolute inset-0 -z-20" />
        <div className="absolute inset-0 -z-10"><CipherRain /></div>
        <div className="absolute inset-x-0 bottom-0 -z-10 h-48 bg-gradient-to-t from-ink-950 to-transparent" />
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 pb-28 pt-10 lg:grid-cols-[1.15fr_.85fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-medium ring-1 ring-white/20 backdrop-blur"><Sparkles size={14} className="text-brand-300" /> Encrypted. Monitored. Under your control.</span>
            <h1 className="mt-5 font-display text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
              Files only the <span className="bg-gradient-to-r from-brand-300 via-white to-wax-400 bg-clip-text text-transparent">right people</span> can open.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-blue-100/80">
              TrustShare seals every file with its own AES-256 key, shares it with exact permissions and expiry, and gives administrators a live control room: who is active, who is attacking, and who gets let in.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={cta.to} className="group inline-flex items-center gap-2 rounded-2xl bg-white px-7 py-3.5 font-semibold text-ink-900 shadow-xl shadow-black/30 transition hover:-translate-y-0.5">{cta.label} <ArrowRight size={18} className="transition group-hover:translate-x-1" /></Link>
              <a href="#lab" className="inline-flex items-center gap-2 rounded-2xl border border-white/25 px-7 py-3.5 font-medium text-white backdrop-blur transition hover:bg-white/10">Break the encryption yourself</a>
            </div>
            <div className="mt-10 grid max-w-xl grid-cols-2 gap-4 sm:grid-cols-4">
              {[["AES-256", "per-file keys"], ["13", "detection rules"], ["1 GB", "storage"], ["0", "readable bytes at rest"]].map(([a, b]) => (
                <div key={b}><div className="font-display text-2xl font-extrabold">{a}</div><div className="text-xs text-blue-100/60">{b}</div></div>
              ))}
            </div>
          </div>
          <div className="hidden justify-center lg:flex"><ShieldOrbit size={360} /></div>
        </div>
      </section>

      {/* ---------------- encryption lab ---------------- */}
      <section id="lab" className="relative px-5 py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2">
          <Reveal>
            <div className="font-mono text-xs uppercase tracking-[0.2em] text-brand-300">The lab</div>
            <h2 className="mt-2 font-display text-4xl font-extrabold leading-tight">Don't trust us. Break it.</h2>
            <p className="mt-4 text-blue-100/75">This is the same cipher the server uses (AES-256-GCM), running in <i>your</i> browser. Encrypt a message, then flip a single bit of the result and try to decrypt: the authentication tag notices and the whole message is refused. That is how TrustShare detects tampering with stored files.</p>
            <ul className="mt-6 space-y-3 text-sm text-blue-100/80">
              {["A new random 256-bit key for every file", "A unique nonce for every encryption", "Wrapped by a master key; users never see any key"].map((t) => <li key={t} className="flex gap-2.5"><ShieldCheck size={18} className="shrink-0 text-emerald-300" />{t}</li>)}
            </ul>
          </Reveal>
          <Reveal delay={120}><CryptoLab /></Reveal>
        </div>
      </section>

      {/* ---------------- two doors ---------------- */}
      <section id="doors" className="bg-gradient-to-b from-ink-950 via-ink-900 to-ink-950 px-5 py-24">
        <div className="mx-auto max-w-7xl">
          <Reveal className="text-center">
            <div className="font-mono text-xs uppercase tracking-[0.2em] text-brand-300">Two separate worlds</div>
            <h2 className="mt-2 font-display text-4xl font-extrabold">One door for users. One for administrators.</h2>
            <p className="mx-auto mt-3 max-w-2xl text-blue-100/70">Different dashboards, different menus, and a hard rule enforced on the server: a normal user can never open the admin panel, even by typing its address.</p>
          </Reveal>
          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            <Reveal><Door tone="bg-gradient-to-br from-brand-600 to-brand-800" icon={Users} who="User panel" title="Your private vault"
              bullets={["Upload, encrypt and organise files", "Share with people or expiring, revocable links", "Notifications, favorites, trash and personal analytics", "My Security: your logins and denied access"]} to="/signup" cta="Create an account" /></Reveal>
            <Reveal delay={120}><Door tone="bg-gradient-to-br from-wax-600 to-ink-800" icon={Radar} who="Admin panel" title="The control room"
              bullets={["Security Dashboard with live analytics and threat monitor", "Access control: approve accounts, block IPs, tripwire files", "See every user's activity, every audit record, every report", "Storage analytics, detection rules and alerts you can tune"]} to="/login" cta="Admin log in" /></Reveal>
          </div>
        </div>
      </section>

      {/* ---------------- pipeline ---------------- */}
      <section id="flow" className="px-5 py-24">
        <div className="mx-auto max-w-7xl">
          <Reveal className="text-center">
            <div className="font-mono text-xs uppercase tracking-[0.2em] text-brand-300">How it works</div>
            <h2 className="mt-2 font-display text-4xl font-extrabold">From upload to alert, in six steps</h2>
          </Reveal>
          <div className="relative mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <div className="absolute left-[8%] right-[8%] top-9 hidden h-px bg-gradient-to-r from-transparent via-brand-300/60 to-transparent lg:block" />
            {STEPS.map(([Icon, t, d], i) => (
              <Reveal key={t} delay={i * 90}>
                <div className="relative text-center">
                  <span className="relative mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-3xl bg-white/[0.06] text-brand-200 ring-1 ring-white/15 backdrop-blur"><Icon size={28} /><span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 font-mono text-[11px] font-bold">{i + 1}</span></span>
                  <div className="mt-3 font-display text-lg font-bold">{t}</div>
                  <div className="mt-1 px-2 text-xs text-blue-100/60">{d}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- features bento (light panel on the dark page) ---------------- */}
      <section id="features" className="canvas-aurora px-5 py-24 text-slate-800">
        <div className="mx-auto max-w-7xl">
          <Reveal className="text-center">
            <div className="font-mono text-xs uppercase tracking-[0.2em] text-brand-600">Features</div>
            <h2 className="mt-2 font-display text-4xl font-extrabold text-ink-950">Built to be trusted, built to be watched</h2>
          </Reveal>
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Reveal className="lg:col-span-2"><Tile icon={Lock} title="Envelope encryption" text="Every file is sealed with AES-256-GCM using its own key. The keys are wrapped by a master key that can be rotated without re-encrypting a single file." className="h-full" /></Reveal>
            <Reveal delay={80}><Tile icon={Link2} title="Links that expire" text="Time-limited, download-limited, password-protected, revocable, and dead the moment the file is trashed." accent="text-violet-600 bg-violet-50" className="h-full" /></Reveal>
            <Reveal delay={160}><Tile icon={UserCheck} title="Approval gate" text="Admins can require approval for every new account and decide who gets in." accent="text-emerald-600 bg-emerald-50" className="h-full" /></Reveal>
            <Reveal><Tile icon={Crosshair} title="Tripwire files" text="Plant a decoy file. The moment anyone opens it, a critical alert fires." accent="text-red-600 bg-red-50" className="h-full" /></Reveal>
            <Reveal delay={80}><Tile icon={ShieldAlert} title="Detect and auto-block" text="Thirteen editable rules watch logins, downloads, links and admin areas, and can shut an attacking IP out automatically." accent="text-amber-600 bg-amber-50" className="h-full" /></Reveal>
            <Reveal delay={160} className="lg:col-span-2"><Tile icon={ScrollText} title="A permanent audit trail" text="Every login, upload, download, share, denial and admin decision is recorded with who, what, when and from where. Read-only: nobody can edit history. Filter it, export it, investigate with it." accent="text-sky-600 bg-sky-50" className="h-full" /></Reveal>
            <Reveal><Tile icon={BarChart3} title="Real analytics" text="Storage per user, uploads, downloads and sharing over time. Every number from real records." accent="text-brand-600 bg-brand-50" className="h-full" /></Reveal>
            <Reveal delay={80}><Tile icon={Gauge} title="1 GB, watched" text="Usage gauges, a days-until-full forecast, and alerts at 80% and 95%." accent="text-emerald-600 bg-emerald-50" className="h-full" /></Reveal>
            <Reveal delay={160}><Tile icon={BellRing} title="Live notifications" text="Bell, history, e-mail and instant pop-ups for admins when something looks wrong." accent="text-violet-600 bg-violet-50" className="h-full" /></Reveal>
            <Reveal delay={240}><Tile icon={Activity} title="Live activity" text="Admins watch every user's activity stream in real time." accent="text-red-600 bg-red-50" className="h-full" /></Reveal>
          </div>
        </div>
      </section>

      {/* ---------------- FAQ ---------------- */}
      <section id="faq" className="px-5 py-24">
        <div className="mx-auto max-w-3xl">
          <Reveal className="text-center"><h2 className="font-display text-4xl font-extrabold">Questions people ask</h2></Reveal>
          <div className="mt-10 space-y-3">
            {FAQ.map(([q, a], i) => (
              <Reveal key={q} delay={i * 60}>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur">
                  <button className="flex w-full items-center justify-between gap-4 p-5 text-left font-semibold" onClick={() => setOpen(open === i ? -1 : i)}>{q}<ChevronDown size={18} className={`shrink-0 text-brand-300 transition ${open === i ? "rotate-180" : ""}`} /></button>
                  {open === i && <p className="px-5 pb-5 text-sm leading-relaxed text-blue-100/75">{a}</p>}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- final call ---------------- */}
      <section className="px-5 pb-24">
        <div className="control-room relative mx-auto max-w-5xl overflow-hidden rounded-[36px] p-12 text-center ring-1 ring-white/15">
          <div className="bg-grid absolute inset-0 opacity-40" />
          <h2 className="relative font-display text-4xl font-extrabold sm:text-5xl">Lock it. Share it. Watch it.</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-blue-100/80">Create your vault in a minute. Administrators: log in to open the control room.</p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <Link to={cta.to} className="rounded-2xl bg-white px-8 py-3.5 font-semibold text-ink-900 shadow-xl transition hover:-translate-y-0.5">{cta.label}</Link>
            {!user && <Link to="/login" className="rounded-2xl border border-white/30 px-8 py-3.5 font-medium transition hover:bg-white/10">Log in</Link>}
          </div>
        </div>
        <p className="mt-10 text-center text-xs text-blue-100/40">TrustShare · secure file sharing · student project built with React, FastAPI, PostgreSQL, MongoDB and Redis</p>
      </section>
    </div>
  );
}
