import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, KeyRound, Lock, LogOut, ShieldCheck, Timer } from "lucide-react";
import { adminVisit, api, errMsg, fmtDate } from "../api";
import { useFetch } from "../hooks";
import { Badge, ErrorBox, Notice, Spinner } from "../ui";

/**
 * Admin Visit — the password gate between a normal user dashboard and the admin panel.
 * Any signed-in account can open this page; only someone who knows the admin password gets in.
 * A correct password returns a short-lived grant that the API requires on every /admin call.
 */
export default function AdminVisit() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const st = useFetch<any>("/admin-visit/status");
  const unlocked = ok || !!st.data?.unlocked;

  useEffect(() => { if (sp.get("expired")) setErr("Your admin visit expired. Enter the password again."); }, [sp]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const r = await api.post("/admin-visit/unlock", { password: pw });
      adminVisit.set(r.data.admin_token); setOk(true); setPw("");
      nav("/admin");
    } catch (e: any) {
      setErr(errMsg(e)); setPw("");
    } finally { setBusy(false); }
  };

  const exit = async () => {
    try { await api.post("/admin-visit/lock"); } catch { /* grant may already be gone */ }
    adminVisit.clear(); setOk(false); st.reload();
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="overflow-hidden rounded-3xl bg-grad-hero p-8 text-white shadow-glow">
        <div className="flex items-start gap-5">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25">
            <Lock className="h-8 w-8" />
          </div>
          <div>
            <p className="text-base font-semibold uppercase tracking-[0.2em] text-lavender-200">Restricted area</p>
            <h1 className="mt-1 text-3xl font-extrabold">Admin Visit</h1>
            <p className="mt-2 max-w-xl text-base text-slate-200">
              The admin panel is password protected. Enter the administrator password to continue. Your visit is
              time-limited, tied to your account, and recorded in the audit log.
            </p>
          </div>
        </div>
      </div>

      <div className="card mt-6 p-6">
        {st.error ? <ErrorBox message={st.error} onRetry={st.reload} /> : !st.data ? <Spinner /> : unlocked ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><ShieldCheck className="h-6 w-6" /></span>
              <div>
                <p className="font-bold text-navy-900">Admin visit active</p>
                <p className="text-base text-slate-500">
                  {st.data.expires_at ? <>Expires {fmtDate(st.data.expires_at)}</> : "Session valid"} ·{" "}
                  <Badge tone="purple">{st.data.is_admin_role ? "Administrator account" : "Elevated visit"}</Badge>
                </p>
              </div>
            </div>
            <Notice kind="info">
              You are inside an elevated session. Every action you take in the admin panel is attributed to your
              account in the audit trail.
            </Notice>
            <div className="flex flex-wrap gap-3">
              <button className="btn-primary" onClick={() => nav("/admin")}>Open admin panel <ArrowRight className="h-4 w-4" /></button>
              <button className="btn-secondary" onClick={exit}><LogOut className="h-4 w-4" />End admin visit</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-lavender-50 text-lavender-600"><KeyRound className="h-6 w-6" /></span>
              <div>
                <p className="font-bold text-navy-900">Enter the admin password</p>
                <p className="text-base text-slate-500">Only administrators know this password.</p>
              </div>
            </div>
            {err && <Notice kind="warn">{err}</Notice>}
            <div>
              <label htmlFor="admin-pw" className="mb-1.5 block text-base font-semibold text-slate-700">Admin password</label>
              <input id="admin-pw" type="password" className="input" autoComplete="off" autoFocus value={pw}
                     onChange={(e) => setPw(e.target.value)} placeholder="Enter admin password" required />
              <p className="mt-1.5 flex items-center gap-1.5 text-base text-slate-500">
                <Timer className="h-3.5 w-3.5" />Access lasts {st.data.session_minutes} minutes, then you must re-enter it.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="btn-primary" disabled={busy || !pw}>{busy ? <Spinner className="h-4 w-4" /> : <Lock className="h-4 w-4" />}Unlock admin panel</button>
              <button type="button" className="btn-secondary" onClick={() => nav("/app")}>Back to my dashboard</button>
            </div>
            <p className="text-base text-slate-500">
              Wrong passwords are rate-limited and raise a critical alert in the Security Dashboard.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
