import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { errorMessage } from "../lib/api";
import { useAuth } from "../store/auth";
import AuthShell from "./AuthShell";

export default function Signup() {
  const login = useAuth((s) => s.login);
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);   // the admin must approve this account before it can log in

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const { data } = await api.post("/auth/register", form);
      if (data.approval_status === "pending") { setPending(true); return; }
      await login(form.email, form.password);
      navigate(useAuth.getState().user?.roles.includes("admin") ? "/admin" : "/dashboard");
    } catch (err) { setError(await errorMessage(err)); }
    finally { setBusy(false); }
  };

  if (pending) {
    return (
      <AuthShell title="Request received" subtitle="An administrator must approve your account">
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-3xl">⏳</div>
          <p className="text-sm text-slate-600">Thank you, <b>{form.full_name}</b>. Your account <b>{form.email}</b> was created and is waiting for approval. You will get an e-mail when you are let in, and you can then log in.</p>
          <Link to="/" className="btn-secondary w-full">Back to the home page</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create your account" subtitle="Start sharing files securely">
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        <div><label className="label">Full name</label>
          <input required minLength={2} className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
        <div><label className="label">Email</label>
          <input type="email" required className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div><label className="label">Password</label>
          <input type="password" required minLength={8} className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <p className="mt-1 text-xs text-slate-500">At least 8 characters with a letter and a number.</p></div>
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Creating..." : "Sign up"}</button>
        <p className="text-center text-sm">Already have an account? <Link to="/login" className="text-brand-600 hover:underline">Log in</Link></p>
      </form>
    </AuthShell>
  );
}
