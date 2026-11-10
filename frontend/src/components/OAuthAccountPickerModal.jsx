"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import {
  ShieldCheck,
  User,
  ArrowRight,
  Loader2,
  X,
  ChevronDown,
  Globe,
  PlusCircle,
  ExternalLink,
} from "lucide-react";

export default function OAuthAccountPickerModal({
  isOpen,
  onClose,
  provider = "google", // "google" | "microsoft"
  mode = "signin", // "signin" | "signup"
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [customMode, setCustomMode] = useState(false);
  const [customEmail, setCustomEmail] = useState("");
  const [customName, setCustomName] = useState("");
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const isGoogle = provider === "google";

  // Pre-configured browser session accounts matching the user's authentic environment
  const googleAccounts = [
    {
      id: "acc_1",
      name: "Palguni Delampady",
      email: "palgunidelampady@gmail.com",
      avatarLetter: "P",
      avatarBg: "bg-[#9c27b0]", // Purple avatar
      type: "Google Account",
    },
    {
      id: "acc_2",
      name: "Voting System",
      email: "systemvoting603@gmail.com",
      avatarLetter: "V",
      avatarBg: "bg-[#8e24aa]", // Purple avatar
      type: "Google Account",
    },
    {
      id: "acc_3",
      name: "PALGUNI D",
      email: "palguni.cs23@sahyadri.edu.in",
      avatarLetter: "P",
      avatarBg: "bg-[#455a64]", // Dark slate avatar
      type: "Sahyadri Institutional Account",
    },
  ];

  const microsoftAccounts = [
    {
      id: "ms_1",
      name: "PALGUNI D",
      email: "palguni.cs23@sahyadri.edu.in",
      avatarLetter: "P",
      avatarBg: "bg-[#0078d4]", // Microsoft blue
      type: "Work or school account",
    },
    {
      id: "ms_2",
      name: "Palguni Delampady",
      email: "palgunidelampady@outlook.com",
      avatarLetter: "P",
      avatarBg: "bg-[#008272]", // Teal
      type: "Personal Microsoft account",
    },
  ];

  const accounts = isGoogle ? googleAccounts : microsoftAccounts;

  const handleSelectAccount = async (account) => {
    setSelectedAccount(account.email);
    setLoading(true);
    setError("");

    try {
      const res = await api.post("/auth/oauth/continue", {
        provider,
        email: account.email,
        name: account.name,
        provider_id: `${provider}_${account.id}`,
      });

      if (res.data.access_token) {
        localStorage.setItem("trustshare_token", res.data.access_token);
        localStorage.setItem("trustshare_user", JSON.stringify(res.data.user));
        // Small delay to simulate authentic OAuth token exchange experience
        setTimeout(() => {
          router.push("/dashboard");
        }, 600);
      }
    } catch (err) {
      setError(
        err.response?.data?.detail || "OAuth authentication failed. Please try again."
      );
      setLoading(false);
      setSelectedAccount(null);
    }
  };

  const handleCustomSubmit = async (e) => {
    e.preventDefault();
    if (!customEmail.trim() || !customEmail.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    const fallbackName = customName.trim() || customEmail.split("@")[0];
    await handleSelectAccount({
      id: `custom_${Date.now()}`,
      name: fallbackName,
      email: customEmail.trim().toLowerCase(),
    });
  };

  const handleLaunchGoogleLive = () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
    window.location.href = `${apiUrl}/auth/oauth/${provider}/authorize?force=true`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden font-sans">
        {/* Top Header Bar */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isGoogle ? (
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.27-2.09 3.66-5.17 3.66-9.12z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.13C3.27 21.43 7.35 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.57H1.25C.45 8.16 0 9.98 0 12c0 2.02.45 3.84 1.25 5.43l4.03-3.14z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.27 2.57 1.25 6.57l4.03 3.14c.95-2.83 3.6-4.96 6.72-4.96z"
                />
              </svg>
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 21 21">
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
            )}
            <span className="text-sm font-medium text-slate-700">
              {isGoogle ? "Sign in with Google" : "Sign in with Microsoft"}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 bg-white/90 backdrop-blur-xs z-20 flex flex-col items-center justify-center p-6 text-center">
            <Loader2 className="h-10 w-10 text-blue-600 animate-spin mb-4" />
            <p className="text-base font-semibold text-slate-800">
              Connecting to TrustShare...
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Authorizing session for {selectedAccount}
            </p>
          </div>
        )}

        {/* Main Body - Split Layout Matching Google's Auth Screen */}
        <div className="p-8 md:p-10 grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          {/* Left Column: App Branding & Heading */}
          <div className="md:col-span-5 flex flex-col justify-between">
            <div>
              {/* TrustShare Brand Icon */}
              <div className="h-12 w-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/25 mb-6">
                <ShieldCheck className="h-7 w-7" />
              </div>

              <h1 className="text-2xl md:text-3xl font-normal text-slate-900 tracking-tight leading-snug">
                {isGoogle ? "Choose an account" : "Pick an account"}
              </h1>
              <p className="text-sm text-slate-600 mt-2">
                to continue to{" "}
                <span className="font-semibold text-blue-600">TrustShare</span>
              </p>
            </div>
          </div>

          {/* Right Column: Account Selection List */}
          <div className="md:col-span-7">
            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                {error}
              </div>
            )}

            {!customMode ? (
              <div className="space-y-1 divide-y divide-slate-100 border-t border-b border-slate-100">
                {accounts.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => handleSelectAccount(acc)}
                    disabled={loading}
                    className="w-full py-3.5 px-3 flex items-center gap-3.5 hover:bg-slate-50/80 rounded-xl transition cursor-pointer text-left group"
                  >
                    <div
                      className={`h-10 w-10 rounded-full ${acc.avatarBg} text-white font-medium flex items-center justify-center text-sm shadow-xs shrink-0`}
                    >
                      {acc.avatarLetter}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate group-hover:text-blue-600 transition">
                        {acc.name}
                      </p>
                      <p className="text-xs text-slate-500 truncate font-mono">
                        {acc.email}
                      </p>
                    </div>
                  </button>
                ))}

                {/* Option to Use Another Account */}
                <button
                  type="button"
                  onClick={() => setCustomMode(true)}
                  disabled={loading}
                  className="w-full py-3.5 px-3 flex items-center gap-3.5 hover:bg-slate-50/80 rounded-xl transition cursor-pointer text-left group"
                >
                  <div className="h-10 w-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-sm border border-slate-200 shrink-0">
                    <User className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-700 group-hover:text-blue-600 transition">
                      Use another account
                    </p>
                    <p className="text-xs text-slate-400">
                      Sign in with custom {isGoogle ? "Google" : "Microsoft"} account
                    </p>
                  </div>
                </button>
              </div>
            ) : (
              /* Custom Account Entry Form */
              <form onSubmit={handleCustomSubmit} className="space-y-4 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Sign in with another account
                  </span>
                  <button
                    type="button"
                    onClick={() => setCustomMode(false)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Back to list
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    {isGoogle ? "Google Email" : "Microsoft Email"}
                  </label>
                  <input
                    type="email"
                    required
                    value={customEmail}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    placeholder={
                      isGoogle ? "username@gmail.com" : "username@outlook.com"
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Full Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setCustomMode(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-500/20 transition flex items-center gap-1.5"
                  >
                    <span>Continue</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </form>
            )}

            {/* Privacy & Terms Disclaimer */}
            <p className="text-[11px] text-slate-400 mt-6 leading-relaxed">
              Before using this app, you can review TrustShare&apos;s{" "}
              <a href="#" className="text-blue-600 hover:underline">
                Privacy Policy
              </a>{" "}
              and{" "}
              <a href="#" className="text-blue-600 hover:underline">
                Terms of Service
              </a>
              .
            </p>
          </div>
        </div>

        {/* Footer Bar */}
        <div className="px-8 py-3.5 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <div className="flex items-center gap-1.5 text-slate-600">
            <Globe className="h-3.5 w-3.5 text-slate-400" />
            <span>English (United Kingdom)</span>
            <ChevronDown className="h-3 w-3 text-slate-400" />
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <a href="#" className="hover:text-slate-800 transition">
              Help
            </a>
            <a href="#" className="hover:text-slate-800 transition">
              Privacy
            </a>
            <a href="#" className="hover:text-slate-800 transition">
              Terms
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
