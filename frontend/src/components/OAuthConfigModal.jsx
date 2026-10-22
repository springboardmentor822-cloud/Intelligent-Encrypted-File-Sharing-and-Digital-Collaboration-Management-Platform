"use client";

import React, { useState } from "react";
import api from "@/lib/api";
import { X, Check, Copy, ExternalLink, ShieldCheck, Key, Loader2, AlertCircle } from "lucide-react";

export default function OAuthConfigModal({
  isOpen,
  onClose,
  initialProvider = "google",
}) {
  const [provider, setProvider] = useState(initialProvider);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [tenantId, setTenantId] = useState("common");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const isGoogle = provider === "google";
  const callbackUri = isGoogle
    ? "http://127.0.0.1:8000/auth/oauth/google/callback"
    : "http://127.0.0.1:8000/auth/oauth/microsoft/callback";

  const handleCopyUri = () => {
    navigator.clipboard.writeText(callbackUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!clientId.trim() || !clientSecret.trim()) {
      setError("Please provide both Client ID and Client Secret.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await api.post("/auth/oauth/configure", {
        provider,
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
        tenant_id: isGoogle ? "common" : tenantId.trim() || "common",
      });

      // Redirect immediately to provider's live website
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
      window.location.href = `${apiUrl}/auth/oauth/${provider}/authorize`;
    } catch (err) {
      setError(
        err.response?.data?.detail || "Failed to update OAuth credentials."
      );
      setLoading(false);
    }
  };

  const handleProceedDirect = () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
    window.location.href = `${apiUrl}/auth/oauth/${provider}/authorize?force=true`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div className="relative w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden font-sans">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
              <Key className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Configure Live OAuth Sign-In
              </h2>
              <p className="text-xs text-slate-500">
                Connect your official Google or Microsoft application
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="px-6 pt-4 flex gap-2 border-b border-slate-100">
          <button
            type="button"
            onClick={() => {
              setProvider("google");
              setError("");
            }}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
              isGoogle
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.27-2.09 3.66-5.17 3.66-9.12z" />
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.13C3.27 21.43 7.35 24 12 24z" />
              <path fill="#FBBC05" d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.57H1.25C.45 8.16 0 9.98 0 12c0 2.02.45 3.84 1.25 5.43l4.03-3.14z" />
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.27 2.57 1.25 6.57l4.03 3.14c.95-2.83 3.6-4.96 6.72-4.96z" />
            </svg>
            <span>Google Cloud OAuth</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setProvider("microsoft");
              setError("");
            }}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
              !isGoogle
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <svg className="h-4 w-4" viewBox="0 0 21 21">
              <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
              <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
              <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
            </svg>
            <span>Microsoft Entra ID</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Guidance Box */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800">
                Authorized Redirect URI:
              </span>
              <a
                href={
                  isGoogle
                    ? "https://console.cloud.google.com/apis/credentials"
                    : "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
                }
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline font-medium"
              >
                <span>Open {isGoogle ? "Google Console" : "Azure Portal"}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="flex items-center justify-between bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-mono text-slate-700">
              <span className="truncate mr-2">{callbackUri}</span>
              <button
                type="button"
                onClick={handleCopyUri}
                className="p-1 hover:text-blue-600 cursor-pointer"
                title="Copy to clipboard"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                {isGoogle ? "Google Client ID" : "Application (Client) ID"}
              </label>
              <input
                type="text"
                required
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder={
                  isGoogle
                    ? "1234567890-abcdef.apps.googleusercontent.com"
                    : "00000000-0000-0000-0000-000000000000"
                }
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                {isGoogle ? "Client Secret" : "Client Secret Value"}
              </label>
              <input
                type="password"
                required
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="••••••••••••••••••••••••"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
              />
            </div>

            {!isGoogle && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Tenant ID (Optional)
                </label>
                <input
                  type="text"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  placeholder="common (or organizations / your-tenant-id)"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                />
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                <span>Save & Continue to {isGoogle ? "Google" : "Microsoft"}</span>
              </button>

              <button
                type="button"
                onClick={handleProceedDirect}
                disabled={loading}
                className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Launch Sign-In Site →
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
