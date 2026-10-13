"use client";

import React, { useState } from "react";
import { Lock, Mail, ShieldCheck, Eye, EyeOff, FileText, CheckCircle2 } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Submitting login payload:", { email, password, rememberMe });
    // In later steps, Axios will send this to your FastAPI backend
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 text-slate-800">
      {/* LEFT COLUMN: BRANDING & SYSTEM FEATURES */}
      <div className="w-full md:w-1/2 bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 text-white p-8 md:p-14 flex flex-col justify-between">
        {/* Brand Header */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-white">TrustShare</span>
        </div>

        {/* Hero Content */}
        <div className="my-10 space-y-6">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight">
            Secure File Sharing <br />
            for a <span className="text-blue-400">Safer Tomorrow</span>
          </h1>
          <p className="text-slate-300 text-sm md:text-base leading-relaxed max-w-md">
            Enterprise-grade digital collaboration equipped with zero-knowledge encryption, 
            fine-grained access controls, and real-time activity auditing.
          </p>

          {/* Feature Highlights */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-3 text-slate-200 text-sm">
              <CheckCircle2 className="h-5 w-5 text-blue-400 shrink-0" />
              <span>AES-256 server & storage encryption</span>
            </div>
            <div className="flex items-center gap-3 text-slate-200 text-sm">
              <CheckCircle2 className="h-5 w-5 text-blue-400 shrink-0" />
              <span>Granular Role-Based Access Control (RBAC)</span>
            </div>
            <div className="flex items-center gap-3 text-slate-200 text-sm">
              <CheckCircle2 className="h-5 w-5 text-blue-400 shrink-0" />
              <span>Multi-database audit trails & session management</span>
            </div>
          </div>

          {/* Secure File Card Preview */}
          <div className="mt-8 p-5 bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl max-w-md shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-blue-500/30 rounded-lg">
                <FileText className="h-5 w-5 text-blue-300" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Q3_Security_Audit.pdf</p>
                <p className="text-xs text-slate-400">Encrypted Document • 2.4 MB</p>
              </div>
            </div>
            <div className="w-full bg-slate-700/60 rounded-full h-2">
              <div className="bg-blue-400 h-2 rounded-full w-full"></div>
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <p className="text-xs text-slate-400">
          © 2026 TrustShare. All rights reserved.
        </p>
      </div>

      {/* RIGHT COLUMN: LOGIN FORM */}
      <div className="w-full md:w-1/2 flex items-center justify-center p-6 md:p-14 bg-white">
        <div className="w-full max-w-md space-y-7">
          {/* Header */}
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">Welcome Back</h2>
            <p className="text-sm text-slate-500 mt-1">Sign in to your TrustShare account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Field */}
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

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-slate-700">
                  Password
                </label>
                <a href="/reset-password" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-11 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center">
              <input
                id="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded cursor-pointer"
              />
              <label htmlFor="remember-me" className="ml-2 block text-xs font-medium text-slate-600 cursor-pointer">
                Remember me for 30 days
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/20 text-sm transition duration-150"
            >
              Sign In
            </button>
          </form>

          {/* Social Sign In Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-slate-400 font-medium">Or continue with</span>
            </div>
          </div>

          {/* Social Logins */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className="flex items-center justify-center gap-2 py-2 px-4 border border-slate-200 rounded-xl hover:bg-slate-50 text-xs font-semibold text-slate-700 transition"
            >
              <span className="text-red-500 font-bold">G</span> Google
            </button>
            <button
              type="button"
              className="flex items-center justify-center gap-2 py-2 px-4 border border-slate-200 rounded-xl hover:bg-slate-50 text-xs font-semibold text-slate-700 transition"
            >
              <span className="text-blue-500 font-bold">⊞</span> Microsoft
            </button>
          </div>

          {/* Sign Up Link */}
          <p className="text-center text-xs text-slate-500">
            Don't have an account?{" "}
            <a href="/register" className="font-semibold text-blue-600 hover:text-blue-700">
              Create an account
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}