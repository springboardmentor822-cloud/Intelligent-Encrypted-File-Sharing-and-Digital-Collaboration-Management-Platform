import { useState } from "react";
import { Link } from "react-router-dom";
import api, { errorMessage } from "../lib/api";
import AuthShell from "./AuthShell";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try { const { data } = await api.post("/auth/forgot-password", { email }); setMsg(data.message); }
    catch (err) { setError(await errorMessage(err)); }
  };

  return (
    <AuthShell title="Forgot password" subtitle="We will email you a reset link (in development it is printed in the backend logs).">
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        {msg && <div className="rounded-lg bg-green-50 p-2 text-sm text-green-700">{msg}</div>}
        <input type="email" required className="input" placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn-primary w-full">Send reset link</button>
        <p className="text-center text-sm"><Link to="/login" className="text-brand-600 hover:underline">Back to login</Link></p>
      </form>
    </AuthShell>
  );
}
