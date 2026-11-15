import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { API_URL, errorMessage } from "../lib/api";
import { isAdmin, useAuth } from "../store/auth";
import AuthShell from "./AuthShell";

export default function Login() {
  const login = useAuth((s) => s.login);
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "", otp: "" });
  const [needOtp, setNeedOtp] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleOn, setGoogleOn] = useState(false);

  // show "Continue with Google" only when the server has it configured
  useEffect(() => { api.get("/auth/oauth/providers").then((r) => setGoogleOn(!!r.data.google)).catch(() => {}); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      await login(form.email, form.password, form.otp);
      // Admin flow from the mentor: admin logs in -> Admin Dashboard -> Security Dashboard
      navigate(isAdmin(useAuth.getState().user) ? "/admin" : "/dashboard");
    } catch (err) {
      const msg = await errorMessage(err);
      if (msg === "otp_required") { setNeedOtp(true); setError("Enter the 6-digit code from your authenticator app."); }
      else setError(msg);
    } finally { setBusy(false); }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Log in to your account">
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        <div><label className="label">Email</label>
          <input type="email" required className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div><label className="label">Password</label>
          <input type="password" required className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
        {needOtp && (
          <div><label className="label">Authentication code (MFA)</label>
            <input inputMode="numeric" maxLength={6} className="input" autoFocus value={form.otp} onChange={(e) => setForm({ ...form, otp: e.target.value })} /></div>
        )}
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Logging in..." : "Log in"}</button>
        {googleOn && (
          <>
            <div className="flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />or<span className="h-px flex-1 bg-slate-200" /></div>
            <a href={`${API_URL}/auth/oauth/google/login`} className="btn-secondary w-full">
              <span className="font-bold text-[#4285F4]">G</span> Continue with Google
            </a>
          </>
        )}
        <div className="flex justify-between text-sm">
          <Link to="/forgot-password" className="text-brand-600 hover:underline">Forgot password?</Link>
          <Link to="/signup" className="text-brand-600 hover:underline">Create account</Link>
        </div>
      </form>
    </AuthShell>
  );
}
