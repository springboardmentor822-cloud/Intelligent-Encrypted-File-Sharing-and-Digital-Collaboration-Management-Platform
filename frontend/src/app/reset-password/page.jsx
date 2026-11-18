"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { Mail, ShieldCheck, ArrowLeft, CheckCircle2, KeyRound, Lock, AlertCircle, Copy, ArrowRight, Check } from "lucide-react";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const urlToken = searchParams.get("token") || "";

  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetSuccess, setResetSuccess] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  useEffect(() => {
    if (urlToken) {
      setToken(urlToken);
      setIsSubmitted(true);
    }
  }, [urlToken]);

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await api.post("/auth/forgot-password", { email });
      if (res.data?.debug_reset_token) {
        setToken(res.data.debug_reset_token);
      }
      setIsSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to process recovery request.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      await api.post("/auth/reset-password", {
        token: token.trim(),
        new_password: newPassword
      });
      setResetSuccess(true);
    } catch (err) {
      setError(err.response?.data?.detail || "Invalid or expired recovery token.");
    } finally {
      setLoading(false);
    }
  };

  const copyTokenToClipboard = () => {
    if (!token) return;
    navigator.clipboard.writeText(token);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 text-slate-800">
      {/* LEFT COLUMN: BRANDING & HIGHLIGHTS */}
      <div className="w-full md:w-1/2 bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 text-white p-8 md:p-14 flex flex-col justify-between">
        {/* Brand Header */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <Link href="/" className="text-xl font-bold tracking-tight text-white">
            TrustShare
          </Link>
        </div>

        {/* Hero Content */}
        <div className="my-10 space-y-6">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight leading-tight">
            Account Recovery <br />
            <span className="text-blue-400">& Identity Protection</span>
          </h1>
          <p className="text-slate-300 text-sm md:text-base leading-relaxed max-w-md">
            Lost access to your vault? Enter your registered email address to receive a secure, Redis-cached reset token.
          </p>

          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-3 text-slate-200 text-sm">
              <CheckCircle2 className="h-5 w-5 text-blue-400 shrink-0" />
              <span>Time-restricted cryptographic recovery tokens in Redis</span>
            </div>
            <div className="flex items-center gap-3 text-slate-200 text-sm">
              <CheckCircle2 className="h-5 w-5 text-blue-400 shrink-0" />
              <span>Bcrypt hash updating with session revocation pass</span>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-400">
          © 2026 TrustShare. All rights reserved.
        </p>
      </div>

      {/* RIGHT COLUMN: RESET FORM */}
      <div className="w-full md:w-1/2 flex items-center justify-center p-6 md:p-14 bg-white">
        <div className="w-full max-w-md space-y-7">
          <div className="text-left">
            <div className="h-12 w-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4 border border-blue-100">
              <KeyRound className="h-6 w-6" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              {resetSuccess ? "Password Reset Complete" : isSubmitted ? "Enter Recovery Token" : "Reset Password"}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {resetSuccess
                ? "Your password has been changed. You can now log in."
                : isSubmitted 
                ? "Enter the recovery token and specify your new password"
                : "Enter your registered email address to receive a recovery pass"}
            </p>
          </div>

          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {resetSuccess ? (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-sm">
                <p className="font-semibold mb-1">Password Successfully Updated!</p>
                <p className="text-xs text-emerald-700">
                  Your vault credentials have been securely refreshed. You can now log into your account with your new password.
                </p>
              </div>

              <Link
                href="/login"
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition shadow-md"
              >
                <span>Proceed to Sign In</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : isSubmitted ? (
            <form onSubmit={handleResetSubmit} className="space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold">Active Recovery Token</span>
                  {token && (
                    <button
                      type="button"
                      onClick={copyTokenToClipboard}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900 cursor-pointer"
                    >
                      {copiedToken ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-600" />
                          <span className="text-emerald-600">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Copy Token</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-blue-700">
                  {urlToken
                    ? "Verified recovery token loaded from secure link."
                    : "Token generated in Redis (valid for 15 mins). Enter your new password below."}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Recovery Token
                </label>
                <input
                  type="text"
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste reset token here..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter at least 8 characters..."
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password..."
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/20 text-sm transition duration-150 disabled:bg-blue-300 cursor-pointer"
              >
                {loading ? "Updating Credentials..." : "Confirm Password Reset"}
              </button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsSubmitted(false);
                    setToken("");
                  }}
                  className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Request a new recovery link instead
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleForgotSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/20 text-sm transition duration-150 disabled:bg-blue-300 cursor-pointer"
              >
                {loading ? "Generating pass..." : "Send Reset Link"}
              </button>
            </form>
          )}

          <div className="pt-2">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-blue-600 transition"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Sign In</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 text-sm">
          Loading recovery portal...
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}