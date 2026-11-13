import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Lock, Mail, ShieldCheck } from "lucide-react";
import { errMsg } from "../../api";
import { useAuth } from "../../auth";
import { ErrorBox, Logo, Notice, Spinner } from "../../ui";

/** Separate sign-in for the administrator portal. Standard accounts are refused here and the admin area is not
 *  reachable from the user dashboard at all (the server also rejects non-admin accounts on every admin API). */
export default function AdminLogin() {
  const { login, logout, user } = useAuth(); const nav = useNavigate(); const [sp] = useSearchParams();
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { if (user?.role === "admin") nav("/admin", { replace: true }); }, [user, nav]);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      const u = await login(email.trim(), pw, false);
      if (u.role !== "admin") { await logout(); setErr("This portal is for administrator accounts only. Use the regular sign-in for your account."); return; }
      nav("/admin", { replace: true });
    } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };
  return <div className="grid min-h-screen place-items-center bg-grad-hero p-4">
    <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
      <div className="flex items-center justify-between"><Logo /><span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-lg font-semibold text-red-800 ring-1 ring-red-200"><ShieldCheck className="h-3.5 w-3.5" />Admin portal</span></div>
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-navy-950">Administrator sign-in</h1>
      <p className="mt-1 text-lg text-slate-500">Monitoring, audit logs, reports and security alerts.</p>
      {user && user.role !== "admin" ? <div className="mt-6 space-y-4"><Notice kind="warn">You are signed in as a standard user ({user.email}). Sign out to use an administrator account.</Notice>
        <button className="btn-primary w-full" onClick={() => logout()}>Sign out</button></div> :
      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        {sp.get("expired") && <Notice kind="warn">Your session expired. Please sign in again.</Notice>}
        {sp.get("denied") && <Notice kind="warn">That account does not have administrator access.</Notice>}
        {err && <ErrorBox message={err} />}
        <div><label htmlFor="aemail" className="mb-1.5 block text-lg font-semibold text-slate-700">Admin email</label>
          <div className="relative"><Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="aemail" type="email" autoComplete="username" className="input !pl-10" value={email} onChange={(e) => setEmail(e.target.value)} /></div></div>
        <div><label htmlFor="apw" className="mb-1.5 block text-lg font-semibold text-slate-700">Password</label>
          <div className="relative"><Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="apw" type="password" autoComplete="current-password" className="input !pl-10" value={pw} onChange={(e) => setPw(e.target.value)} /></div></div>
        <button className="btn-primary w-full" disabled={busy || !email || !pw}>{busy ? <Spinner className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}Sign in to admin portal</button>
      </form>}
      <p className="mt-6 text-center text-lg text-slate-500">Not an administrator? <Link to="/login" className="font-semibold text-brand-600 hover:underline">Go to user sign-in</Link></p>
    </div>
  </div>;
}
