// The browser lands here after Google sign-in: swap the one-time code for real tokens.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { errorMessage } from "../lib/api";
import { isAdmin, useAuth } from "../store/auth";

export default function OAuthCallback() {
  const [params] = useSearchParams();
  const finish = useAuth((s) => s.finishOAuth);
  const navigate = useNavigate();
  const [error, setError] = useState(params.get("error") || "");
  const started = useRef(false); // React StrictMode runs effects twice in development; the code works only once

  useEffect(() => {
    const code = params.get("code");
    if (started.current || error || !code) { if (!code && !error) setError("Missing sign-in code"); return; }
    started.current = true;
    finish(code).then(() => navigate(isAdmin(useAuth.getState().user) ? "/admin" : "/dashboard")).catch(async (e) => setError(await errorMessage(e)));
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="card max-w-sm text-center">
        {error ? (
          <>
            <h1 className="font-display text-xl font-bold">Sign-in did not finish</h1>
            <p className="mt-2 text-sm text-red-600">{error}</p>
            <Link to="/login" className="btn-primary mt-4">Back to login</Link>
          </>
        ) : <p className="text-slate-600">Signing you in...</p>}
      </div>
    </div>
  );
}
