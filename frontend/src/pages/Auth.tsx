import { FormEvent, ReactNode, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, FileSpreadsheet, FileText, Image as Img, Lock, Mail, ShieldCheck, Users, Cloud, Loader2 } from "lucide-react";
import { api, errMsg } from "../api";
import { useAuth } from "../auth";
import { ErrorBox, Field, Logo, Notice, Spinner } from "../ui";
import { useFetch } from "../hooks";

function Split({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-grad-soft lg:grid-cols-2 lg:p-8">
      <div className="mx-auto grid w-full max-w-[1400px] overflow-hidden bg-white lg:col-span-2 lg:grid-cols-2 lg:rounded-3xl lg:shadow-2xl">
        <aside className="relative hidden overflow-hidden bg-grad-hero p-10 text-white lg:block" aria-label="About TrustShare">
          <div className="absolute inset-0 bg-grad-mesh opacity-70" />
          <img src="https://images.unsplash.com/photo-1633265486064-086b219458ec?auto=format&fit=crop&w=900&q=80" alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" loading="lazy" />
          <div className="relative">
          <Link to="/"><Logo light size={40} /></Link>
          <h2 className="mt-12 text-5xl font-extrabold leading-tight">Secure<br />File Sharing<br />for a <span className="text-lavender-300">Safer</span><br />Tomorrow</h2>
          <p className="mt-5 max-w-sm text-slate-200">Upload, store, and share your important files with server-side encryption and complete control.</p>
          <ul className="mt-9 space-y-5">{[[Lock, "AES-256 Encrypted Storage", "Your files stay private and protected"], [Users, "Controlled Sharing", "Set permissions, passcodes and expiry"], [ShieldCheck, "Track & Monitor", "Audit logs and activity tracking"]].map(([I, t, d]: any) => <li key={t} className="flex items-center gap-4"><span className="grid h-12 w-12 place-items-center rounded-full bg-white/10 ring-1 ring-white/20"><I className="h-5 w-5" /></span><div><p className="font-semibold">{t}</p><p className="text-sm text-slate-300">{d}</p></div></li>)}</ul>
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 bottom-10 w-[22rem] rotate-[-4deg]">
            <Cloud className="mx-auto -mb-6 h-32 w-32 text-lavender-300/80" fill="currentColor" />
            <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur">{[["Project_Report.pdf", FileText], ["Team_Plan.docx", FileText], ["Budget_Sheet.xlsx", FileSpreadsheet], ["Design_Image.png", Img]].map(([n, I]: any) => <div key={n} className="flex items-center gap-3 border-b border-white/10 py-2 text-sm last:border-0"><I className="h-4 w-4 text-lavender-300" />{n}<Lock className="ml-auto h-3.5 w-3.5 text-slate-300" /></div>)}</div></div>
        </aside>
        <main className="flex items-center justify-center px-6 py-12 sm:px-12"><div className="w-full max-w-md"><Link to="/" className="mb-8 inline-block lg:hidden"><Logo /></Link>{children}</div></main>
      </div>
    </div>
  );
}

const Google = () => <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" /><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" /></svg>;
const Ms = () => <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true"><path fill="#f25022" d="M1 1h9v9H1z" /><path fill="#00a4ef" d="M1 11h9v9H1z" /><path fill="#7fba00" d="M11 1h9v9h-9z" /><path fill="#ffb900" d="M11 11h9v9h-9z" /></svg>;

function Social() {
  const { data } = useFetch<any>("/auth/oauth/providers"); const [msg, setMsg] = useState("");
  const go = (p: string) => { if (data?.[p]?.configured) window.location.href = `/api/auth/oauth/${p}/login`; else setMsg(`${p === "google" ? "Google" : "Microsoft"} sign-in is not configured on this server. An administrator must set the ${p.toUpperCase()} client ID and secret (see README).`); };
  return <>
    <div className="my-6 flex items-center gap-3 text-xs text-slate-500"><span className="h-px flex-1 bg-slate-200" />or continue with<span className="h-px flex-1 bg-slate-200" /></div>
    <div className="grid grid-cols-2 gap-3"><button type="button" className="btn-secondary !py-3" onClick={() => go("google")}><Google />Google</button><button type="button" className="btn-secondary !py-3" onClick={() => go("microsoft")}><Ms />Microsoft</button></div>
    {msg && <div className="mt-3"><Notice kind="warn">{msg}</Notice></div>}
  </>;
}

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export function Login() {
  const { login, user } = useAuth(); const nav = useNavigate(); const loc: any = useLocation(); const [sp] = useSearchParams();
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [show, setShow] = useState(false); const [remember, setRemember] = useState(false);
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [fe, setFe] = useState<{ email?: string; pw?: string }>({});
  useEffect(() => { if (user) nav(user.role === "admin" ? "/admin" : "/app", { replace: true }); }, [user, nav]);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null);
    const f: any = {}; if (!emailOk(email)) f.email = "Enter a valid email address"; if (!pw) f.pw = "Enter your password"; setFe(f); if (Object.keys(f).length) return;
    setBusy(true);
    try { const u = await login(email.trim(), pw, remember); nav(u.role === "admin" ? "/admin" : (loc.state?.from?.startsWith("/app") ? loc.state.from : "/app"), { replace: true }); }
    catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };
  return <Split>
    <h1 className="text-4xl font-extrabold tracking-tight text-navy-950">Welcome Back</h1><p className="mt-2 text-lg text-slate-500">Sign in to your TrustShare account</p>
    <form onSubmit={submit} noValidate className="mt-8 space-y-5">
      {sp.get("expired") && <Notice kind="warn">Your session expired. Please sign in again.</Notice>}
      {sp.get("error") === "account_exists" && <Notice kind="warn">An account with that email already exists. Sign in with your password instead.</Notice>}
      {err && <ErrorBox message={err} />}
      <Field label="Email Address" htmlFor="email" error={fe.email}><div className="relative"><Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="email" type="email" autoComplete="email" className="input !pl-10" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!fe.email} /></div></Field>
      <Field label="Password" htmlFor="password" error={fe.pw} right={<Link to="/forgot-password" className="text-sm font-medium text-brand-600 hover:underline">Forgot password?</Link>}>
        <div className="relative"><Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="password" type={show ? "text" : "password"} autoComplete="current-password" className="input !pl-10 !pr-11" placeholder="Enter your password" value={pw} onChange={(e) => setPw(e.target.value)} aria-invalid={!!fe.pw} />
          <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={remember} onChange={(e) => setRemember(e.target.checked)} />Remember me <span className="text-xs text-slate-400">(keeps you signed in for 7 days on this device)</span></label>
      <button className="btn-primary w-full !py-3.5 text-base" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : <>Sign In <ArrowRight className="h-4 w-4" /></>}</button>
    </form>
    <Social /><p className="mt-8 text-center text-sm">Don't have an account? <Link to="/signup" className="font-semibold text-brand-600 hover:underline">Sign up</Link></p>
  </Split>;
}

export function Signup() {
  const { login } = useAuth(); const nav = useNavigate();
  const [f, setF] = useState({ full_name: "", email: "", password: "", confirm: "" }); const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [fe, setFe] = useState<Record<string, string>>({});
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null); const x: Record<string, string> = {};
    if (!f.full_name.trim()) x.full_name = "Enter your name"; if (!emailOk(f.email)) x.email = "Enter a valid email address";
    if (f.password.length < 8 || !/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) x.password = "At least 8 characters with letters and numbers";
    if (f.password !== f.confirm) x.confirm = "Passwords do not match"; setFe(x); if (Object.keys(x).length) return;
    setBusy(true);
    try { await api.post("/auth/register", { email: f.email.trim(), password: f.password, full_name: f.full_name.trim() }); await login(f.email.trim(), f.password, false); nav("/app", { replace: true }); }
    catch (z) { setErr(errMsg(z)); } finally { setBusy(false); }
  };
  return <Split>
    <h1 className="text-4xl font-extrabold tracking-tight text-navy-950">Create your account</h1><p className="mt-2 text-lg text-slate-500">Start sharing files securely</p>
    <form onSubmit={submit} noValidate className="mt-8 space-y-4">{err && <ErrorBox message={err} />}
      <Field label="Full name" htmlFor="name" error={fe.full_name}><input id="name" className="input" autoComplete="name" value={f.full_name} onChange={set("full_name")} /></Field>
      <Field label="Email Address" htmlFor="email" error={fe.email}><input id="email" type="email" className="input" autoComplete="email" value={f.email} onChange={set("email")} /></Field>
      <Field label="Password" htmlFor="pw" error={fe.password} hint="At least 8 characters, with letters and numbers"><div className="relative"><input id="pw" type={show ? "text" : "password"} className="input !pr-11" autoComplete="new-password" value={f.password} onChange={set("password")} /><button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></Field>
      <Field label="Confirm password" htmlFor="pw2" error={fe.confirm}><input id="pw2" type={show ? "text" : "password"} className="input" autoComplete="new-password" value={f.confirm} onChange={set("confirm")} /></Field>
      <button className="btn-primary w-full !py-3.5 text-base" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : "Create account"}</button></form>
    <Social /><p className="mt-8 text-center text-sm">Already have an account? <Link to="/login" className="font-semibold text-brand-600 hover:underline">Sign in</Link></p>
  </Split>;
}

export function Forgot() {
  const [email, setEmail] = useState(""); const [done, setDone] = useState<any>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => { e.preventDefault(); setErr(null); if (!emailOk(email)) return setErr("Enter a valid email address"); setBusy(true);
    try { setDone((await api.post("/auth/forgot-password", { email })).data); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); } };
  return <Split><h1 className="text-3xl font-extrabold text-navy-950">Forgot password?</h1><p className="mt-2 text-slate-500">Enter your email and we'll start a reset.</p>
    {done ? <div className="mt-6 space-y-3"><Notice kind="success">{done.message}</Notice>
      {done.dev_reset_token && <Notice kind="warn">Development mode: no email provider is configured, so the reset link is shown here. <Link className="font-semibold underline" to={`/reset-password?token=${done.dev_reset_token}`}>Open reset page</Link></Notice>}</div>
      : <form onSubmit={submit} noValidate className="mt-6 space-y-4">{err && <ErrorBox message={err} />}<Field label="Email Address" htmlFor="email"><input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></Field><button className="btn-primary w-full !py-3" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : "Send reset link"}</button></form>}
    <p className="mt-8 text-center text-sm"><Link to="/login" className="font-semibold text-brand-600 hover:underline">Back to sign in</Link></p></Split>;
}

export function Reset() {
  const [sp] = useSearchParams(); const [pw, setPw] = useState(""); const [err, setErr] = useState<string | null>(null); const [ok, setOk] = useState(false); const [busy, setBusy] = useState(false);
  const token = sp.get("token") || "";
  const submit = async (e: FormEvent) => { e.preventDefault(); setErr(null); setBusy(true); try { await api.post("/auth/reset-password", { token, password: pw }); setOk(true); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); } };
  return <Split><h1 className="text-3xl font-extrabold text-navy-950">Reset password</h1>
    {!token ? <div className="mt-6"><ErrorBox message="This reset link is missing its token." /></div> : ok ? <div className="mt-6 space-y-4"><Notice kind="success">Password updated.</Notice><Link to="/login" className="btn-primary w-full">Sign in</Link></div>
      : <form onSubmit={submit} className="mt-6 space-y-4">{err && <ErrorBox message={err} />}<Field label="New password" htmlFor="pw" hint="At least 8 characters, with letters and numbers"><input id="pw" type="password" autoComplete="new-password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} /></Field><button className="btn-primary w-full !py-3" disabled={busy || !pw}>{busy ? <Spinner className="h-4 w-4" /> : "Update password"}</button></form>}</Split>;
}

export function VerifyEmail() {
  const [sp] = useSearchParams(); const [state, setState] = useState<"busy" | "ok" | string>("busy");
  useEffect(() => { api.post("/auth/verify-email", { token: sp.get("token") || "" }).then(() => setState("ok")).catch((e) => setState(errMsg(e))); }, [sp]);
  return <Split><h1 className="text-3xl font-extrabold text-navy-950">Email verification</h1><div className="mt-6">{state === "busy" ? <Loader2 className="animate-spin" /> : state === "ok" ? <Notice kind="success">Your email is verified.</Notice> : <ErrorBox message={state} />}</div><Link to="/login" className="btn-secondary mt-6 w-full">Continue</Link></Split>;
}

export function OAuthComplete() {
  const { setToken } = useAuth(); const nav = useNavigate();
  useEffect(() => {
    const t = new URLSearchParams(location.hash.slice(1)).get("token"); history.replaceState(null, "", location.pathname);
    if (t) setToken(t).then(() => nav("/app", { replace: true })); else nav("/login?error=oauth", { replace: true });
  }, []);  // eslint-disable-line
  return <div className="grid min-h-screen place-items-center"><Spinner className="h-8 w-8" /></div>;
}
