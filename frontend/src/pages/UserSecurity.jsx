// "My Security" for a normal user: about THEIR account and files only (the platform-wide Security Dashboard belongs to admins).
// 1) a security score and what to improve  2) account protection  3) the ten protection layers  4) who can reach my files  5) my recent sign-ins
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, CheckCircle2, Download, FileSearch, Fingerprint, Globe, HardDrive, KeyRound, Link2, Lock, RefreshCcw, ScanLine,
  Settings2, Share2, ShieldCheck, Unlock, Upload, UserCheck, Users,
} from "lucide-react";
import api from "../lib/api";
import { formatStamp, timeAgo } from "../lib/format";
import { useAuth } from "../store/auth";
import Modal from "../components/Modal";
import { Led, PageHeader } from "../components/ui";

// The journey of one file, so a newcomer sees where each protection fits
const JOURNEY = [
  [Upload, "Upload", "over HTTPS"], [ScanLine, "Check", "type + threat scan"], [Lock, "Encrypt", "AES-256-GCM"],
  [HardDrive, "Store", "private storage"], [Share2, "Share", "expiring links"], [Unlock, "Decrypt", "only if allowed"],
];

function Card({ icon: Icon, tone, title, text, status = "Active", onMore }) {
  const badge = status === "Active" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600";
  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone}`}><Icon size={22} /></span>
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${badge}`}>{status}</span>
      </div>
      <h3 className="font-display text-[15px] font-bold leading-snug text-ink-950">{title}</h3>
      <p className="text-[13px] leading-relaxed text-slate-500">{text}</p>
      <button onClick={onMore} className="mt-auto flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">Learn More <ArrowRight size={14} /></button>
    </div>
  );
}


function ScoreRing({ score }) {
  const r = 54, c = 2 * Math.PI * r;
  const color = score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#e5484d";
  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 140 140" className="-rotate-90"><circle cx="70" cy="70" r={r} fill="none" stroke="#e2e9f4" strokeWidth="11" />
        <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * score) / 100} style={{ transition: "stroke-dashoffset 1.2s ease" }} /></svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center"><div className="font-display text-4xl font-extrabold tabular text-ink-950">{score}</div><div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">score</div></div>
    </div>
  );
}

// A row in "Account protection": icon, what it is, its state, and an action
function ProtectRow({ icon: Icon, title, text, state, tone, to, action }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-paper-200 p-3.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon size={18} /></span>
      <div className="min-w-0 flex-1"><div className="font-semibold text-ink-950">{title}</div><div className="text-xs text-slate-500">{text}</div></div>
      <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${tone}`}>{state}</span>
      {to && <Link to={to} className="btn-secondary !px-3 !py-1.5 text-xs">{action}</Link>}
    </div>
  );
}

export default function UserSecurity() {
  const { user } = useAuth();
  const [s, setS] = useState(null);          // my protections, live numbers
  const [sd, setSd] = useState(null);        // my recent sign-ins and counts (last 30 days)
  const [shared, setShared] = useState(null);   // what I shared, with whom, and which links
  const [open, setOpen] = useState(null);
  useEffect(() => {
    api.get("/reports/my-security").then((r) => setS(r.data)).catch(() => setS(false));
    api.get("/reports/my-security-dashboard", { params: { days: 30 } }).then((r) => setSd(r.data)).catch(() => setSd(false));
    api.get("/share/by-me").then((r) => setShared(r.data)).catch(() => setShared([]));
  }, []);
  if (s === null) return <p className="py-20 text-center text-slate-500">Loading...</p>;
  if (s === false) return <p className="py-20 text-center text-red-600">Could not load your security status. If you just updated, rebuild the backend (docker compose up -d --build).</p>;

  const versions = Object.entries(s.encryption.key_versions);
  const olderKeys = s.key_rotation.files_on_older > 0;
  const cards = [
    { id: "aes", icon: Lock, tone: "bg-emerald-50 text-emerald-600", title: "AES-256 Encryption",
      text: "All files are encrypted using industry-standard AES-256 encryption before storage.",
      body: <p>Every file is encrypted on the server before it is saved, with its own random 256-bit key. Tampering is detected automatically. Right now <b>{s.encryption.files_encrypted}</b> of your files are sealed with <b>{s.encryption.unique_keys}</b> separate keys.</p> },
    { id: "tls", icon: Globe, tone: "bg-brand-50 text-brand-600", title: "HTTPS/TLS Communication", status: s.transport.https ? "Active" : "Local only",
      text: "All data is transmitted securely using HTTPS/TLS encryption.",
      body: <p>Traffic between your browser and the server is encrypted so passwords and files cannot be read on the way. {s.transport.https ? <>This connection is <b>secured with TLS</b>.</> : <>This connection is <b>{s.transport.scheme}</b> — fine on your own computer, but a live server must use HTTPS.</>}</p> },
    { id: "jwt", icon: KeyRound, tone: "bg-violet-50 text-violet-600", title: "JWT Authentication",
      text: "Secure token-based authentication for protected API access.",
      body: <p>After login you receive a short-lived signed token. Your access token lasts <b>{s.jwt.access_minutes} minutes</b> and your session <b>{s.jwt.refresh_days} days</b>. Logging out cancels it immediately. Two-factor login is <b>{s.jwt.mfa_enabled ? "on" : "off"}</b>. {!s.jwt.mfa_enabled && <Link to="/settings" className="font-semibold text-brand-600 hover:underline">Turn it on</Link>}</p> },
    { id: "oauth", icon: Users, tone: "bg-red-50 text-red-500", title: "OAuth2 Authentication",
      text: "Sign in using your Google or Microsoft account securely.",
      body: <p>Login follows the OAuth2 standard. Password flow is <b>enabled</b>. Google sign-in is <b>{s.oauth2.google_enabled ? "enabled" : "not configured on this server"}</b>.</p> },
    { id: "rbac", icon: UserCheck, tone: "bg-brand-50 text-brand-600", title: "Role-Based Access Control",
      text: "Access and permissions are managed based on your role.",
      body: <p>Your role: <b className="capitalize">{s.rbac.roles.join(", ")}</b>. Upload files: <b>{s.rbac.can_upload ? "yes" : "no"}</b>. Admin tools: <b>{s.rbac.is_admin ? "yes" : "no"}</b>. The server checks your role on every request — hiding a button is never the only lock.</p> },
    { id: "links", icon: Link2, tone: "bg-brand-50 text-brand-600", title: "Temporary Share Links",
      text: "Secure time-limited share links with custom permissions.",
      body: <><p><b>{s.links.active}</b> active of {s.links.total} links you created ({s.links.revoked} revoked).{s.links.next_expiry && <> Next expiry: <b>{formatStamp(s.links.next_expiry)}</b>.</>}</p><Link to="/shared-by-me" className="mt-2 inline-block font-semibold text-brand-600 hover:underline">Manage my links</Link></> },
    { id: "dl", icon: Download, tone: "bg-brand-50 text-brand-600", title: "Download Tracking",
      text: "Track file downloads and access history.",
      body: <><p>Each download is recorded with who, when and from where. In the last 30 days you downloaded <b>{s.downloads.by_me_30d}</b> file(s), and others downloaded your files <b>{s.downloads.of_my_files_30d}</b> time(s).</p><Link to="/file-analytics" className="mt-2 inline-block font-semibold text-brand-600 hover:underline">See download analytics</Link></> },
    { id: "audit", icon: FileSearch, tone: "bg-brand-50 text-brand-600", title: "Audit Logging", status: s.audit.failed_30d > 0 ? "Review" : "Active",
      text: "Maintain detailed logs of all security events and file activities.",
      body: <><p><b>{s.audit.events}</b> events are recorded for you. Denied actions in the last 30 days: <b>{s.audit.failed_30d}</b>.{s.audit.last_login && <> Last login: <b>{formatStamp(s.audit.last_login)}</b> from {s.audit.last_login_ip}.</>}</p><Link to="/activity" className="mt-2 inline-block font-semibold text-brand-600 hover:underline">Open activity logs</Link></> },
    { id: "token", icon: Settings2, tone: "bg-brand-50 text-brand-600", title: "Secure Token Generation",
      text: "Generate secure tokens for file access and sharing.",
      body: <p>Share links and reset links use cryptographically random tokens that cannot be guessed — <b>{s.tokens.link_token_bits} bits</b> of randomness. Only a fingerprint is stored: <b>{s.tokens.stored_as}</b>, so even a database leak cannot reveal a working link.</p> },
    { id: "rot", icon: RefreshCcw, tone: "bg-brand-50 text-brand-600", title: "Key Rotation", status: olderKeys ? "Update pending" : "Active",
      text: "Encryption keys are rotated periodically for enhanced security.",
      body: <p>Master key in use: <b className="font-mono">{s.key_rotation.current_version}</b>. {versions.length ? versions.map(([v, n]) => `${n} file(s) on ${v}`).join(" · ") : "No files yet."} Rotating the master key re-wraps only the small file keys, so files stay readable. {olderKeys && "An administrator can rotate the older ones."}</p> },
  ];

  const current = cards.find((c) => c.id === open);

  // ---- what I shared (exposure) and the checks behind the score
  const rows = shared || [];
  const activeLinks = rows.flatMap((r) => r.links.filter((l) => l.status === "active").map((l) => ({ ...l, file: r.file.original_name })));
  const noPassword = activeLinks.filter((l) => !l.has_password);
  const adminShares = rows.flatMap((r) => r.people.filter((p) => p.level === "admin").map((p) => ({ ...p, file: r.file.original_name })));
  const failed = sd ? sd.metrics.failed_logins : 0;
  const checks = [
    { ok: s.jwt.mfa_enabled, label: s.jwt.mfa_enabled ? "Two-factor login is on" : "Two-factor login is off", fix: ["/settings", "Turn on"] },
    { ok: !olderKeys, label: olderKeys ? `${s.key_rotation.files_on_older} file(s) use an older master key` : "All your files use the newest master key" },
    { ok: noPassword.length === 0, label: noPassword.length ? `${noPassword.length} active share link(s) have no password` : "Every active share link is password-protected", fix: ["/shared-by-me", "Review"] },
    { ok: adminShares.length === 0, label: adminShares.length ? `${adminShares.length} person(s) have admin access to your files` : "Nobody has admin access to your files", fix: ["/shared-by-me", "Review"] },
    { ok: failed === 0, label: failed ? `${failed} failed login(s) on your account in 30 days` : "No failed logins on your account in 30 days", fix: ["/settings", "Change password"] },
  ];
  const score = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><ShieldCheck size={28} /></span>
          <PageHeader title="My Security" subtitle="How your account and your files are protected, and what you can do to make them safer." />
        </div>
        <Link to="/settings" className="btn-secondary"><Fingerprint size={16} /> Two-factor &amp; password</Link>
      </div>

      {/* 1) score + 2) account protection */}
      <div className="grid gap-5 xl:grid-cols-12">
        <div className="card xl:col-span-5">
          <h2 className="font-display text-lg font-bold text-ink-950">Your security score</h2>
          <div className="mt-3 flex items-center gap-5">
            <ScoreRing score={score} />
            <p className="text-sm text-slate-500">{score === 100 ? "Excellent. Everything about your account is locked down." : score >= 60 ? "Good. A few things can still be improved." : "Needs attention. Fix the items below."}</p>
          </div>
          <div className="mt-4 space-y-2.5">
            {checks.map((c) => (
              <div key={c.label} className="flex items-start gap-2.5 text-sm">
                {c.ok ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-500" /> : <AlertTriangle size={18} className="mt-0.5 shrink-0 text-wax-500" />}
                <span className={c.ok ? "flex-1 text-slate-600" : "flex-1 font-medium text-ink-950"}>{c.label}</span>
                {!c.ok && c.fix && <Link to={c.fix[0]} className="shrink-0 text-xs font-semibold text-brand-600 hover:underline">{c.fix[1]}</Link>}
              </div>
            ))}
          </div>
        </div>

        <div className="card xl:col-span-7">
          <h2 className="font-display text-lg font-bold text-ink-950">Account protection</h2>
          <p className="mb-3 text-xs text-slate-500">The things that decide who can get into your account.</p>
          <div className="space-y-2.5">
            <ProtectRow icon={Fingerprint} title="Two-factor login" text="A 6-digit code from your phone after your password." state={s.jwt.mfa_enabled ? "On" : "Off"} tone={s.jwt.mfa_enabled ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-700"} to="/settings" action={s.jwt.mfa_enabled ? "Manage" : "Turn on"} />
            <ProtectRow icon={KeyRound} title="Password" text="Stored only as a one-way hash. Locked for a while after 5 wrong tries." state="Protected" tone="bg-emerald-50 text-emerald-600" to="/settings" action="Change" />
            <ProtectRow icon={Globe} title="Sign-in session" text={`Short-lived token (${s.jwt.access_minutes} min), session ${s.jwt.refresh_days} days. Logging out cancels it.`} state="JWT" tone="bg-brand-50 text-brand-700" />
            <ProtectRow icon={Users} title="Google sign-in (OAuth2)" text="Sign in with a trusted provider instead of a password." state={s.oauth2.google_enabled ? "Available" : "Not set up"} tone={s.oauth2.google_enabled ? "bg-emerald-50 text-emerald-600" : "bg-paper-100 text-slate-500"} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[["Failed logins (30 days)", sd ? sd.metrics.failed_logins : "-", "on your account"], ["Denied to you", sd ? sd.metrics.unauthorized_attempts : "-", "actions not allowed"], ["Attempts on your files", sd ? sd.metrics.attempts_on_my_files : "-", "others were refused"]].map(([l, v, sub]) => (
              <div key={l} className="rounded-2xl bg-paper-100 p-3"><div className="font-display text-2xl font-extrabold tabular text-ink-950">{v}</div><div className="text-xs font-medium text-slate-600">{l}</div><div className="text-[11px] text-slate-400">{sub}</div></div>
            ))}
          </div>
        </div>
      </div>

      {/* 3) the ten protection layers */}
      <div>
        <h2 className="font-display text-xl font-bold text-ink-950">Protection layers</h2>
        <p className="mb-3 text-sm text-slate-500">The ten security measures guarding your files. Click "Learn More" on any card to see what it is doing for you right now.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {cards.map((c) => <Card key={c.id} {...c} onMore={() => setOpen(c.id)} />)}
        </div>
      </div>

      {/* 4) who can reach my files + 5) my recent sign-ins */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card overflow-x-auto">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-lg font-bold text-ink-950">Who can reach your files</h2>
            <Link to="/shared-by-me" className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">Manage <ArrowRight size={14} /></Link></div>
          {shared === null ? <p className="py-6 text-center text-sm text-slate-500">Loading...</p> : rows.length === 0 ? (
            <p className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700">You have not shared anything. Your files are visible only to you.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-paper-100 text-xs text-slate-500"><tr><th className="rounded-l-lg p-2.5 font-medium">File</th><th className="font-medium">People</th><th className="font-medium">Active links</th><th className="rounded-r-lg font-medium">Link safety</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const live = r.links.filter((l) => l.status === "active");
                  const open_ = live.filter((l) => !l.has_password).length;
                  return (
                    <tr key={r.file.id} className="border-b border-paper-200 last:border-0">
                      <td className="max-w-[170px] truncate p-2.5 font-medium text-ink-950">{r.file.original_name}</td>
                      <td className="tabular text-slate-600">{r.people.length}</td><td className="tabular text-slate-600">{live.length}</td>
                      <td>{live.length === 0 ? <span className="text-xs text-slate-400">no live links</span> : open_ ? <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">{open_} without password</span> : <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-600">password set</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="card overflow-x-auto">
          <h2 className="font-display text-lg font-bold text-ink-950">Your recent sign-ins</h2>
          <p className="mb-3 text-xs text-slate-500">Not you? Change your password and turn on two-factor login.</p>
          {sd === null ? <p className="py-6 text-center text-sm text-slate-500">Loading...</p> : sd === false || sd.recent_logins.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No sign-ins to show.</p> : (
            <table className="w-full text-left text-sm">
              <thead className="bg-paper-100 text-xs text-slate-500"><tr><th className="rounded-l-lg p-2.5 font-medium">Result</th><th className="font-medium">Method</th><th className="font-medium">IP address</th><th className="font-medium">Location</th><th className="rounded-r-lg font-medium">When</th></tr></thead>
              <tbody>
                {sd.recent_logins.map((r) => (
                  <tr key={r.id} className="border-b border-paper-200 last:border-0">
                    <td className="p-2.5"><span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${r.status === "success" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>{r.status === "success" ? "Success" : "Failed"}</span></td>
                    <td className="capitalize text-slate-600">{r.method}</td><td className="font-mono text-xs text-slate-600">{r.ip}</td><td className="text-slate-600">{r.location}</td>
                    <td className="whitespace-nowrap text-slate-600" title={formatStamp(r.timestamp)}>{timeAgo(r.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-4 font-display text-lg font-bold text-ink-950">How one file is protected, step by step</h2>
        <div className="flex min-w-[640px] items-center justify-between gap-1">
          {JOURNEY.map(([Icon, name, note], i) => (
            <div key={name} className="flex flex-1 items-center">
              <div className="flex flex-col items-center text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><Icon size={19} /></span>
                <div className="mt-1.5 text-sm font-semibold text-ink-950">{name}</div>
                <div className="text-[11px] text-slate-500">{note}</div>
              </div>
              {i < JOURNEY.length - 1 && <div className="mx-2 mb-6 h-px flex-1 bg-gradient-to-r from-brand-400 to-brand-100" />}
            </div>
          ))}
        </div>
      </div>

      {current && (
        <Modal title={current.title} onClose={() => setOpen(null)}>
          <div className="space-y-3 text-sm leading-relaxed text-slate-600">
            <p className="font-medium text-ink-950">{current.text}</p>
            {current.body}
          </div>
        </Modal>
      )}
    </div>
  );
}
