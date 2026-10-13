"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Mail, ShieldCheck, ArrowLeft, CheckCircle2, KeyRound } from "lucide-react";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Submitting password reset for:", email);
    // In later steps, Axios will request the reset token from your FastAPI backend
    setIsSubmitted(true);
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
          <Link href="/" className="text-2xl font-bold tracking-tight text-white">
            TrustShare
          </Link>
        </div>

        {/* Hero Content */}
        <div className="my-10 space-y-6">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight">
            Account Recovery <br />
            <span className="text-blue-400">& Identity Protection</span>
          </h1>
          <p className="text-slate-300 text-sm md:text-base leading-relaxed max-w-md">
            Lost access to your vault? Enter your registered email address to receive a secure, time-limited reset link.
          </p>

          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-3 text-slate-200 text-sm">
              <CheckCircle2 className="h-5 w-5 text-blue-400 shrink-0" />
              <span>Time-restricted cryptographic recovery tokens</span>
            </div>
            <div className="flex items-center gap-3 text-slate-200 text-sm">
              <CheckCircle2 className="h-5 w-5 text-blue-400 shrink-0" />
              <span>Invalidates existing active sessions on password update</span>
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
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">Reset Password</h2>
            <p className="text-sm text-slate-500 mt-1">
              {isSubmitted 
                ? "Check your inbox for recovery instructions"
                : "Enter your registered email address to receive a reset link"}
            </p>
          </div>

          {isSubmitted ? (
            <div className="space-y-6">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-sm">
                <p className="font-semibold mb-1">Recovery link sent!</p>
                <p className="text-xs text-emerald-700">
                  If an account exists for <span className="font-semibold">{email}</span>, you will receive an email with instructions to create a new password.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsSubmitted(false)}
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm transition"
              >
                Send another link
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
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
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/20 text-sm transition duration-150"
              >
                Send Reset Link
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