"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, Loader2, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";
import api from "@/lib/api";

function OAuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState("processing"); // 'processing', 'success', 'error'
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    const errorParam = searchParams.get("error");
    const code = searchParams.get("code");
    const provider = searchParams.get("provider");

    if (errorParam) {
      setStatus("error");
      setErrorMessage(decodeURIComponent(errorParam));
      return;
    }

    if (token) {
      try {
        const userObj = {
          id: parseInt(searchParams.get("id") || "0", 10),
          email: searchParams.get("email") || "",
          username: searchParams.get("username") || "",
          full_name: searchParams.get("full_name") || "",
          role: searchParams.get("role") || "user",
          oauth_provider: searchParams.get("oauth_provider") || "oauth",
          is_mfa_enabled: searchParams.get("is_mfa_enabled") === "true",
          is_active: searchParams.get("is_active") !== "false",
          created_at: searchParams.get("created_at") || new Date().toISOString(),
        };

        localStorage.setItem("trustshare_token", token);
        localStorage.setItem("trustshare_user", JSON.stringify(userObj));

        setStatus("success");
        setTimeout(() => {
          router.push("/dashboard");
        }, 800);
      } catch (err) {
        setStatus("error");
        setErrorMessage("Failed to process authenticated user session.");
      }
      return;
    }

    const effectiveProvider = provider || (code && code.startsWith("4/") ? "google" : "microsoft");

    if (code && effectiveProvider) {
      // Direct frontend code exchange
      api
        .get(`/auth/oauth/${effectiveProvider}/callback?code=${code}`)
        .then((res) => {
          const { access_token, user } = res.data;
          localStorage.setItem("trustshare_token", access_token);
          localStorage.setItem("trustshare_user", JSON.stringify(user));
          setStatus("success");
          setTimeout(() => {
            router.push("/dashboard");
          }, 800);
        })
        .catch((err) => {
          setStatus("error");
          setErrorMessage(
            err.response?.data?.detail || "OAuth code verification failed."
          );
        });
      return;
    }

    // If no params given
    setStatus("error");
    setErrorMessage("No OAuth credentials or authorization token found in callback.");
  }, [searchParams, router]);

  return (
    <div className="w-full max-w-md bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200/80 p-8 shadow-xl shadow-slate-900/5 text-center">
      <div className="flex justify-center mb-5">
        <div className="h-12 w-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
          <ShieldCheck className="h-7 w-7 text-white" />
        </div>
      </div>

      {status === "processing" && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-900">
            Completing Secure Sign-In
          </h2>
          <p className="text-xs text-slate-500">
            Verifying digital signatures and creating zero-knowledge vault session...
          </p>
          <div className="py-4 flex items-center justify-center">
            <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
          </div>
        </div>
      )}

      {status === "success" && (
        <div className="space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span>Identity Verified</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            Welcome to TrustShare
          </h2>
          <p className="text-xs text-slate-500">
            Authentication successful! Launching your encrypted vault...
          </p>
        </div>
      )}

      {status === "error" && (
        <div className="space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
            <AlertCircle className="h-3.5 w-3.5 text-rose-600" />
            <span>Authentication Error</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            Sign-In Failed
          </h2>
          <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200 text-left font-mono">
            {errorMessage}
          </p>
          <div className="pt-2">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs shadow-md transition"
            >
              <span>Back to Login</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col justify-between relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-blue-400/10 blur-[130px] rounded-full pointer-events-none -z-10" />

      {/* Header */}
      <nav className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Link href="/" className="inline-flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-900">
            TrustShare
          </span>
        </Link>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <Suspense
          fallback={
            <div className="text-xs text-slate-400">Loading OAuth callback...</div>
          }
        >
          <OAuthCallbackContent />
        </Suspense>
      </div>

      <footer className="py-4 text-center text-[11px] text-slate-400">
        © 2026 TrustShare Collaboration Platform. All rights reserved.
      </footer>
    </div>
  );
}
