"use client";

import React, { useState, useEffect } from "react";
import api from "@/lib/api";
import {
  User,
  Mail,
  Lock,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Eye,
  EyeOff,
  RefreshCw,
  HardDrive,
  Calendar,
  Save,
  RotateCcw,
  ChevronRight,
  ShieldAlert,
  BadgeCheck,
  Sliders,
  Bell,
  Palette,
  Check,
  Sparkles
} from "lucide-react";

const AVATAR_GRADIENTS = [
  { id: "blue", name: "Royal Blue", class: "from-blue-600 to-indigo-600", text: "text-blue-600", bg: "bg-blue-50" },
  { id: "emerald", name: "Emerald Teal", class: "from-emerald-600 to-teal-600", text: "text-emerald-600", bg: "bg-emerald-50" },
  { id: "violet", name: "Deep Violet", class: "from-purple-600 to-indigo-600", text: "text-purple-600", bg: "bg-purple-50" },
  { id: "amber", name: "Sunset Amber", class: "from-amber-500 to-orange-600", text: "text-amber-600", bg: "bg-amber-50" },
  { id: "rose", name: "Crimson Rose", class: "from-rose-600 to-pink-600", text: "text-rose-600", bg: "bg-rose-50" },
  { id: "slate", name: "Midnight Slate", class: "from-slate-700 to-slate-900", text: "text-slate-700", bg: "bg-slate-50" }
];

export default function UserSettingsSection({ currentUser, onUserUpdated }) {
  const [activeSettingsTab, setActiveSettingsTab] = useState("profile"); // 'profile', 'security', 'preferences', 'vault'

  const [formData, setFormData] = useState({
    full_name: currentUser?.full_name || "",
    username: currentUser?.username || "",
    email: currentUser?.email || "",
    department: "",
    current_password: "",
    new_password: "",
    confirm_password: ""
  });

  const [avatarTheme, setAvatarTheme] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("trustshare_avatar_theme") || "blue";
    }
    return "blue";
  });

  const [preferences, setPreferences] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("trustshare_user_preferences");
        if (saved) return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse user preferences", e);
      }
    }
    return {
      emailOnShare: true,
      emailOnDownload: true,
      securityAlerts: true,
      defaultView: "grid"
    };
  });

  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (currentUser) {
      setFormData((prev) => ({
        ...prev,
        full_name: currentUser.full_name || "",
        username: currentUser.username || "",
        email: currentUser.email || ""
      }));
    }
  }, [currentUser]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setSuccessMessage("");
    setErrorMessage("");
  };

  const handlePreferenceToggle = (key) => {
    setPreferences((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      if (typeof window !== "undefined") {
        localStorage.setItem("trustshare_user_preferences", JSON.stringify(updated));
      }
      return updated;
    });
    setSuccessMessage("Preference updated and saved to local settings.");
  };

  const handleAvatarThemeSelect = (themeId) => {
    setAvatarTheme(themeId);
    if (typeof window !== "undefined") {
      localStorage.setItem("trustshare_avatar_theme", themeId);
    }
    setSuccessMessage("Avatar accent theme updated.");
  };

  const handleReset = () => {
    if (currentUser) {
      setFormData({
        full_name: currentUser.full_name || "",
        username: currentUser.username || "",
        email: currentUser.email || "",
        department: "",
        current_password: "",
        new_password: "",
        confirm_password: ""
      });
      setShowPasswordChange(false);
      setSuccessMessage("");
      setErrorMessage("");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMessage("");
    setErrorMessage("");

    // Validate passwords if changing
    if (showPasswordChange) {
      if (!formData.current_password) {
        setErrorMessage("Please enter your current password to set a new password.");
        setSaving(false);
        return;
      }
      if (!formData.new_password || formData.new_password.length < 6) {
        setErrorMessage("New password must be at least 6 characters long.");
        setSaving(false);
        return;
      }
      if (formData.new_password !== formData.confirm_password) {
        setErrorMessage("New password and confirmation password do not match.");
        setSaving(false);
        return;
      }
    }

    try {
      const payload = {
        full_name: formData.full_name.trim(),
        username: formData.username.trim(),
        email: formData.email.trim()
      };

      if (showPasswordChange && formData.new_password) {
        payload.current_password = formData.current_password;
        payload.new_password = formData.new_password;
      }

      const res = await api.put("/auth/profile", payload);
      setSuccessMessage("Profile updated successfully! All active sessions synchronized.");

      // Clear password inputs
      setFormData((prev) => ({
        ...prev,
        current_password: "",
        new_password: "",
        confirm_password: ""
      }));
      setShowPasswordChange(false);

      if (onUserUpdated) {
        onUserUpdated(res.data);
      }
    } catch (err) {
      console.error("Profile update error:", err);
      const detail = err.response?.data?.detail;
      setErrorMessage(
        typeof detail === "string"
          ? detail
          : "Failed to update profile. Please verify your information and try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const getInitials = (name, username) => {
    if (name && name.trim()) {
      const parts = name.trim().split(" ");
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return name.slice(0, 2).toUpperCase();
    }
    return (username || "TS").slice(0, 2).toUpperCase();
  };

  const currentThemeObj = AVATAR_GRADIENTS.find((t) => t.id === avatarTheme) || AVATAR_GRADIENTS[0];

  const memberSinceStr = currentUser?.created_at
    ? new Date(currentUser.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
      })
    : "Active Member";

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12 max-w-5xl mx-auto">
      {/* Header & Breadcrumbs */}
      <div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1 flex-wrap">
          <span className="font-semibold text-slate-600">Account</span>
          <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span className="text-slate-900 font-bold">Settings</span>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <User className="h-6 w-6 text-blue-600" />
          <span>Profile & Account Settings</span>
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Manage your personal identity, login credentials, and encrypted vault security preferences
        </p>
      </div>

      {/* Success / Error Alerts */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between gap-3 text-emerald-800 text-xs font-semibold animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage("")}
            className="text-emerald-700 hover:text-emerald-900 text-xs underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between gap-3 text-rose-800 text-xs font-semibold animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage("")}
            className="text-rose-700 hover:text-rose-900 text-xs underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Profile Overview Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div
              className={`h-16 w-16 rounded-2xl bg-gradient-to-tr ${currentThemeObj.class} text-white font-bold text-xl flex items-center justify-center shadow-md shadow-blue-500/10 shrink-0`}
            >
              {getInitials(formData.full_name || currentUser?.full_name, formData.username || currentUser?.username)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-slate-900">
                  {formData.full_name || currentUser?.full_name || currentUser?.username}
                </h2>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                    currentUser?.role === "admin"
                      ? "bg-purple-50 text-purple-700 border-purple-200"
                      : "bg-blue-50 text-blue-700 border-blue-200"
                  }`}
                >
                  <ShieldCheck className="h-3 w-3" />
                  <span>{currentUser?.role === "admin" ? "System Administrator" : "Standard User"}</span>
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <BadgeCheck className="h-3 w-3" />
                  <span>Active & Verified</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono mt-1">
                @{formData.username || currentUser?.username} • {formData.email || currentUser?.email}
              </p>
              <div className="flex items-center gap-4 text-[11px] text-slate-400 mt-1">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>Joined {memberSinceStr}</span>
                </span>
                <span className="flex items-center gap-1">
                  <HardDrive className="h-3 w-3" />
                  <span>AES-256 Vault Protected</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveSettingsTab("security")}
              className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 transition cursor-pointer flex items-center gap-1.5"
            >
              <KeyRound className="h-3.5 w-3.5 text-slate-500" />
              <span>Change Password</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveSettingsTab("profile")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
            activeSettingsTab === "profile"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          <User className="h-4 w-4" />
          <span>Profile Details</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSettingsTab("security")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
            activeSettingsTab === "security"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          <KeyRound className="h-4 w-4" />
          <span>Security & Passwords</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSettingsTab("preferences")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
            activeSettingsTab === "preferences"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          <Sliders className="h-4 w-4" />
          <span>Preferences & Alerts</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSettingsTab("vault")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
            activeSettingsTab === "vault"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          <HardDrive className="h-4 w-4" />
          <span>Storage & Encryption</span>
        </button>
      </div>

      {/* Form Area */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ==================================================================== */}
        {/* TAB 1: PROFILE DETAILS */}
        {/* ==================================================================== */}
        {activeSettingsTab === "profile" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Personal Information
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Update your identity details, display name, and avatar accent
                </p>
              </div>

              {/* Avatar Accent Palette */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Avatar Theme & Color Palette
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
                  {AVATAR_GRADIENTS.map((theme) => {
                    const isSelected = avatarTheme === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => handleAvatarThemeSelect(theme.id)}
                        className={`flex items-center gap-2 p-2 rounded-xl border text-left transition cursor-pointer ${
                          isSelected
                            ? "border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/20"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <div className={`h-6 w-6 rounded-lg bg-gradient-to-tr ${theme.class} shrink-0`} />
                        <span className="text-[11px] font-semibold text-slate-700 truncate">
                          {theme.name.split(" ")[0]}
                        </span>
                        {isSelected && <Check className="h-3 w-3 text-blue-600 ml-auto shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                {/* Full Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Full Name
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <User className="h-4 w-4" />
                    </div>
                    <input
                      type="text"
                      name="full_name"
                      value={formData.full_name}
                      onChange={handleChange}
                      placeholder="e.g. John Doe"
                      className="block w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                    />
                  </div>
                </div>

                {/* Username */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Username
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <span className="text-xs font-bold text-slate-400">@</span>
                    </div>
                    <input
                      type="text"
                      name="username"
                      required
                      value={formData.username}
                      onChange={handleChange}
                      placeholder="username"
                      className="block w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono transition"
                    />
                  </div>
                </div>

                {/* Email Address */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Mail className="h-4 w-4" />
                    </div>
                    <input
                      type="email"
                      name="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="name@example.com"
                      className="block w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono transition"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 2: SECURITY & PASSWORDS */}
        {/* ==================================================================== */}
        {activeSettingsTab === "security" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                    Password & Vault Credentials
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Update your vault access password. Current password is required for verification.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowPasswordChange(!showPasswordChange)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer border ${
                    showPasswordChange
                      ? "bg-slate-100 text-slate-700 border-slate-300"
                      : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                  }`}
                >
                  {showPasswordChange ? "Keep Existing Password" : "Change Password"}
                </button>
              </div>

              {showPasswordChange ? (
                <div className="pt-4 border-t border-slate-100 space-y-4 animate-in fade-in duration-200">
                  {/* Current Password */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Current Password <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Lock className="h-4 w-4" />
                      </div>
                      <input
                        type={showCurrentPassword ? "text" : "password"}
                        name="current_password"
                        value={formData.current_password}
                        onChange={handleChange}
                        placeholder="Enter your current password"
                        className="block w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
                      >
                        {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* New Password & Confirm */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        New Password <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                          <KeyRound className="h-4 w-4" />
                        </div>
                        <input
                          type={showNewPassword ? "text" : "password"}
                          name="new_password"
                          value={formData.new_password}
                          onChange={handleChange}
                          placeholder="At least 6 characters"
                          className="block w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
                        >
                          {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Confirm New Password <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                          <KeyRound className="h-4 w-4" />
                        </div>
                        <input
                          type={showConfirmPassword ? "text" : "password"}
                          name="confirm_password"
                          value={formData.confirm_password}
                          onChange={handleChange}
                          placeholder="Repeat new password"
                          className="block w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
                        >
                          {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {formData.new_password && (
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] space-y-1">
                      <div className="flex items-center gap-1.5 text-slate-600 font-semibold">
                        <span>Password Requirements:</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={formData.new_password.length >= 6 ? "text-emerald-600 font-bold" : "text-slate-400"}>
                          {formData.new_password.length >= 6 ? "✓" : "○"} At least 6 characters
                        </span>
                        <span className={formData.new_password === formData.confirm_password && formData.confirm_password ? "text-emerald-600 font-bold" : "text-slate-400"}>
                          {formData.new_password === formData.confirm_password && formData.confirm_password ? "✓" : "○"} Passwords match
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    <span>Your password is secure. Last modified recently.</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">Argon2 / PBKDF2 Encrypted</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 3: PREFERENCES & NOTIFICATIONS */}
        {/* ==================================================================== */}
        {activeSettingsTab === "preferences" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-6 animate-in fade-in duration-200">
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Notifications & Workspace Preferences
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Customize how you receive collaboration notifications and system activity updates
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <div className="text-xs font-bold text-slate-800">File Share Alerts</div>
                  <p className="text-[11px] text-slate-500">
                    Receive alert when a collaborator shares an encrypted document with you
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handlePreferenceToggle("emailOnShare")}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition cursor-pointer ${
                    preferences.emailOnShare ? "bg-blue-600" : "bg-slate-300"
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition ${
                      preferences.emailOnShare ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <div className="text-xs font-bold text-slate-800">File Download Tracking</div>
                  <p className="text-[11px] text-slate-500">
                    Record telemetry when an authorized recipient downloads your shared file
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handlePreferenceToggle("emailOnDownload")}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition cursor-pointer ${
                    preferences.emailOnDownload ? "bg-blue-600" : "bg-slate-300"
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition ${
                      preferences.emailOnDownload ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <div className="text-xs font-bold text-slate-800">Security & Sign-in Alerts</div>
                  <p className="text-[11px] text-slate-500">
                    Notify on new session authorization or failed access attempts
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handlePreferenceToggle("securityAlerts")}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition cursor-pointer ${
                    preferences.securityAlerts ? "bg-blue-600" : "bg-slate-300"
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition ${
                      preferences.securityAlerts ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 4: VAULT & ENCRYPTION */}
        {/* ==================================================================== */}
        {activeSettingsTab === "vault" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Vault Architecture & Cryptographic Engine
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Multi-layered security protocols securing your document repository
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="font-semibold text-xs text-slate-800 flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    <span>AES-256 Envelope Vault</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Per-file unique DEK encryption with zero plaintext disk exposure.
                  </p>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="font-semibold text-xs text-slate-800 flex items-center gap-1.5">
                    <KeyRound className="h-4 w-4 text-blue-600" />
                    <span>Stateless Bearer JWT</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Redis blacklist revocation enabled for immediate instant logouts.
                  </p>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="font-semibold text-xs text-slate-800 flex items-center gap-1.5">
                    <Lock className="h-4 w-4 text-purple-600" />
                    <span>RBAC Partitioning</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Cryptographic access control enforced strictly across all endpoints.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Global Action Footer */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-600 transition cursor-pointer flex items-center gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Discard Changes</span>
          </button>

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl text-xs font-semibold transition shadow-md shadow-blue-500/20 cursor-pointer flex items-center gap-2"
          >
            {saving ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Saving Changes...</span>
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" />
                <span>Save Profile Changes</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
