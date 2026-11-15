// Settings: profile, password and two-factor login (MFA with an authenticator app).
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Fingerprint, KeyRound, UserRound } from "lucide-react";
import api, { errorMessage } from "../lib/api";
import { formatDay } from "../lib/format";
import { useAuth } from "../store/auth";
import { Avatar, Badge, PageHeader } from "../components/ui";

function Section({ icon: Icon, title, text, children }) {
  return (
    <div className="card">
      <div className="mb-4 flex items-start gap-3">
        <span className="rounded-xl bg-paper-100 p-2.5 text-brand-700"><Icon size={18} /></span>
        <div><h2 className="font-display text-lg font-bold">{title}</h2>{text && <p className="text-sm text-slate-500">{text}</p>}</div>
      </div>
      {children}
    </div>
  );
}

export default function Settings() {
  const { user, setUser } = useAuth();
  const [setup, setSetup] = useState(null);
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [pw, setPw] = useState({ current: "", next: "" });
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const refreshUser = async () => setUser((await api.get("/auth/me")).data);
  const run = async (fn) => { setError(""); setMsg(""); try { await fn(); } catch (e) { setError(await errorMessage(e)); } };

  const start = () => run(async () => setSetup((await api.post("/auth/mfa/setup")).data));
  const enable = () => run(async () => {
    await api.post("/auth/mfa/enable", { otp });
    setSetup(null); setOtp(""); setMsg("Two-factor login is now on."); await refreshUser();
  });
  const disable = () => run(async () => {
    await api.post("/auth/mfa/disable", { password, otp });
    setPassword(""); setOtp(""); setMsg("Two-factor login turned off."); await refreshUser();
  });
  const changePassword = () => run(async () => {
    await api.post("/auth/change-password", { current_password: pw.current, new_password: pw.next });
    setPw({ current: "", next: "" }); setMsg("Password changed.");
  });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader kicker="11 — Account" title="Settings" subtitle="Your profile, password and two-factor login." />
      {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {msg && <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{msg}</div>}

      <Section icon={UserRound} title="Profile">
        <div className="flex items-center gap-4">
          <Avatar name={user.full_name} size={56} />
          <div>
            <div className="font-display text-lg font-bold">{user.full_name}</div>
            <div className="text-sm text-slate-500">{user.email}</div>
            <div className="mt-1.5 flex items-center gap-2">
              {user.roles.map((r) => <Badge key={r} tone={r === "admin" ? "amber" : "teal"}>{r}</Badge>)}
              <span className="text-xs text-slate-400">Member since {formatDay(user.created_at)}</span>
            </div>
          </div>
        </div>
      </Section>

      <Section icon={KeyRound} title="Change password" text="Use at least 8 characters with a letter and a number.">
        <div className="grid gap-3 sm:grid-cols-2">
          <input type="password" className="input" placeholder="Current password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          <input type="password" className="input" placeholder="New password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
        </div>
        <button className="btn-primary mt-3" disabled={!pw.current || pw.next.length < 8} onClick={changePassword}>Update password</button>
      </Section>

      <Section icon={Fingerprint} title="Two-factor login (TOTP)" text="A 6-digit code from Google or Microsoft Authenticator, asked after your password.">
        <p className="mb-3 text-sm">Status: <b>{user.mfa_enabled ? "On" : "Off"}</b></p>
        {!user.mfa_enabled && !setup && <button className="btn-primary" onClick={start}>Set up two-factor</button>}
        {setup && (
          <div className="space-y-3">
            <p className="text-sm">1. Scan this QR code with your authenticator app.</p>
            <div className="w-fit rounded-xl border border-paper-300 bg-white p-3"><QRCodeSVG value={setup.otpauth_uri} size={160} /></div>
            <p className="text-xs text-slate-500">Or type this key manually: <code className="rounded bg-paper-100 px-1">{setup.secret}</code></p>
            <p className="text-sm">2. Enter the 6-digit code to confirm.</p>
            <div className="flex gap-2">
              <input className="input" maxLength={6} placeholder="123456" value={otp} onChange={(e) => setOtp(e.target.value)} />
              <button className="btn-primary" onClick={enable}>Turn on</button>
            </div>
          </div>
        )}
        {user.mfa_enabled && (
          <div className="space-y-2 border-t border-paper-200 pt-3">
            <p className="text-sm">To turn it off, confirm your password and a current code:</p>
            <input type="password" className="input" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <input className="input" maxLength={6} placeholder="6-digit code" value={otp} onChange={(e) => setOtp(e.target.value)} />
            <button className="btn-danger" onClick={disable}>Turn off two-factor</button>
          </div>
        )}
      </Section>
    </div>
  );
}
