import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api, { errorMessage } from "../lib/api";
import AuthShell from "./AuthShell";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await api.post("/auth/reset-password", { token: params.get("token") || "", new_password: password });
      navigate("/login");
    } catch (err) { setError(await errorMessage(err)); }
  };

  return (
    <AuthShell title="Choose a new password">
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        <input type="password" required minLength={8} className="input" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="btn-primary w-full">Update password</button>
        <p className="text-center text-sm"><Link to="/login" className="text-brand-600 hover:underline">Back to login</Link></p>
      </form>
    </AuthShell>
  );
}
