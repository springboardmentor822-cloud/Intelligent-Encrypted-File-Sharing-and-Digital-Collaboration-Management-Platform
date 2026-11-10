"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import api from "@/lib/api";
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Users,
  Calendar,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  ArrowUp,
  Activity,
  Lock,
  Eye,
  Radio,
  FileText,
  Check,
  X
} from "lucide-react";

export default function AdminSecurityDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateRange, setDateRange] = useState("Oct 17, 2026 - Oct 30, 2026");
  const [activeDays, setActiveDays] = useState(30);
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  // Dropdown states
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isLoginDropdownOpen, setIsLoginDropdownOpen] = useState(false);
  const [isAccessDropdownOpen, setIsAccessDropdownOpen] = useState(false);

  // Filters
  const [loginFilter, setLoginFilter] = useState("Last 30 Days");
  const [accessFilter, setAccessFilter] = useState("Last 30 Days");
  const [loginTableFilter, setLoginTableFilter] = useState("all"); // 'all' or 'failed_only'

  const datePickerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target)) {
        setIsDatePickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchSecurityDashboard = useCallback(async (overrideParams = {}) => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (overrideParams.days !== undefined) {
        params.days = overrideParams.days;
      } else if (activeDays) {
        params.days = activeDays;
      }

      if (overrideParams.startDate !== undefined) {
        if (overrideParams.startDate) params.start_date = overrideParams.startDate;
      } else if (customStartDate) {
        params.start_date = customStartDate;
      }

      if (overrideParams.endDate !== undefined) {
        if (overrideParams.endDate) params.end_date = overrideParams.endDate;
      } else if (customEndDate) {
        params.end_date = customEndDate;
      }

      const res = await api.get("/admin/security-dashboard", { params });
      setData(res.data);
      if (res.data?.date_range) {
        setDateRange(res.data.date_range);
      }
    } catch (err) {
      console.error("Admin Security Dashboard error:", err);
      if (err.response?.status === 403) {
        setError("Access Denied: Administrator role required to view this dashboard.");
      } else {
        setError("Failed to fetch security telemetry.");
      }
    } finally {
      setLoading(false);
    }
  }, [activeDays, customStartDate, customEndDate]);

  useEffect(() => {
    fetchSecurityDashboard();
  }, [fetchSecurityDashboard]);

  const handlePresetSelect = (presetDays) => {
    setActiveDays(presetDays);
    setCustomStartDate("");
    setCustomEndDate("");
    setIsDatePickerOpen(false);
    fetchSecurityDashboard({ days: presetDays, startDate: "", endDate: "" });
  };

  const handleApplyCustomDateRange = () => {
    if (!customStartDate || !customEndDate) return;
    setIsDatePickerOpen(false);
    fetchSecurityDashboard({ startDate: customStartDate, endDate: customEndDate });
  };

  if (loading && !data) {
    return (
      <div className="p-12 flex flex-col items-center justify-center min-h-[500px]">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mb-3" />
        <p className="text-sm font-semibold text-slate-700">Loading Admin Security Telemetry...</p>
        <p className="text-xs text-slate-400 mt-1">Querying authenticated database access audit stream</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-lg mx-auto bg-rose-50 border border-rose-200 rounded-2xl text-center my-12 shadow-xs">
        <ShieldAlert className="h-12 w-12 text-rose-600 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-rose-900">Security Access Error</h3>
        <p className="text-sm text-rose-700 mt-2">{error}</p>
      </div>
    );
  }

  const metrics = data?.metrics || {
    total_logins: 0,
    total_logins_change: 0,
    month_diff: "0 in period",
    successful_logins: 0,
    successful_logins_change: 0,
    success_rate: "0.0% success rate",
    failed_logins: 0,
    failed_logins_change: 0,
    failure_rate: "0.0% failure rate",
    unauthorized_attempts: 0,
    unauthorized_attempts_change: 0,
    unauthorized_note: "Zero incidents",
    security_events: 0,
    security_events_change: 0,
    security_events_note: "Audit telemetry active"
  };

  const rawLoginActivity = data?.login_activity || [];
  const rawAccessAttempts = data?.access_attempts || [];
  const securityEventsDist = data?.security_events_distribution || [];
  const recentLogins = data?.recent_login_activity || [];
  const recentSecurityEvents = data?.recent_security_events || [];
  const failedLoginsAlerts = data?.failed_logins_alerts || [];
  const failedLoginsCount = data?.failed_logins_count ?? metrics.failed_logins;

  const getSliceCount = (filterText) => {
    if (filterText.includes("7")) return 7;
    if (filterText.includes("14")) return 14;
    if (filterText.includes("60")) return 60;
    if (filterText.includes("90")) return 90;
    return 30;
  };

  const loginActivity = rawLoginActivity.slice(-getSliceCount(loginFilter));
  const accessAttempts = rawAccessAttempts.slice(-getSliceCount(accessFilter));

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* Click outside backdrop for small chart dropdowns */}
      {(isLoginDropdownOpen || isAccessDropdownOpen) && (
        <div
          className="fixed inset-0 z-20 cursor-default"
          onClick={() => {
            setIsLoginDropdownOpen(false);
            setIsAccessDropdownOpen(false);
          }}
        />
      )}

      {/* Breadcrumbs & Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1 flex-wrap">
            <span className="font-semibold text-slate-600">Administration</span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="text-slate-900 font-bold">Security Dashboard</span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-purple-600" />
            <span>Security Dashboard</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time audit log telemetry, authentication activity, and threat monitoring
          </p>
        </div>

        {/* Global Date Range Selector Popover */}
        <div className="flex items-center gap-2 relative" ref={datePickerRef}>
          <button
            type="button"
            onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition cursor-pointer"
          >
            <Calendar className="h-4 w-4 text-purple-600" />
            <span>{dateRange}</span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400 ml-1" />
          </button>

          <button
            type="button"
            onClick={() => fetchSecurityDashboard()}
            title="Refresh Security Telemetry"
            className="p-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:text-purple-600 hover:border-purple-200 transition shadow-2xs cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-purple-600" : ""}`} />
          </button>

          {/* Interactive Date Range Popover */}
          {isDatePickerOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 p-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">Select Time Range</span>
                <button
                  type="button"
                  onClick={() => setIsDatePickerOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Quick Preset Buttons */}
              <div className="grid grid-cols-2 gap-1.5 py-3">
                {[
                  { label: "Last 7 Days", days: 7 },
                  { label: "Last 14 Days", days: 14 },
                  { label: "Last 30 Days", days: 30 },
                  { label: "Last 60 Days", days: 60 },
                  { label: "Last 90 Days", days: 90 },
                  { label: "Past Year", days: 365 },
                ].map((preset) => (
                  <button
                    key={preset.days}
                    type="button"
                    onClick={() => handlePresetSelect(preset.days)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold text-left transition flex items-center justify-between cursor-pointer ${
                      activeDays === preset.days && !customStartDate
                        ? "bg-purple-50 text-purple-700 border border-purple-200 font-bold"
                        : "text-slate-600 hover:bg-slate-50 border border-transparent"
                    }`}
                  >
                    <span>{preset.label}</span>
                    {activeDays === preset.days && !customStartDate && (
                      <Check className="h-3 w-3 text-purple-600" />
                    )}
                  </button>
                ))}
              </div>

              {/* Custom Date Range Picker */}
              <div className="pt-3 border-t border-slate-100 space-y-2.5">
                <span className="text-[11px] font-bold text-slate-800 block">Custom Date Range</span>
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] text-slate-500 font-medium block mb-0.5">Start Date</label>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 font-medium block mb-0.5">End Date</label>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!customStartDate || !customEndDate}
                  onClick={handleApplyCustomDateRange}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold rounded-xl transition shadow-xs cursor-pointer disabled:cursor-not-allowed"
                >
                  Apply Custom Range
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Incorrect Logins & Security Threat Telemetry Banner */}
      {failedLoginsAlerts.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 shadow-2xs animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-100 text-rose-700 shrink-0">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-rose-950 flex items-center gap-2 flex-wrap">
                  <span>Security Notification: {failedLoginsCount} Incorrect Login Attempt(s) Logged</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-rose-200 text-rose-800">
                    Threat Alert
                  </span>
                </h3>
                <p className="text-xs text-rose-700 mt-0.5">
                  Real-time authentication telemetry detected invalid credentials or blocked attempts on the system.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setLoginTableFilter("failed_only");
                const el = document.getElementById("recent-logins-section");
                if (el) el.scrollIntoView({ behavior: "smooth" });
              }}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer self-start sm:self-auto shrink-0 flex items-center gap-1.5"
            >
              <span>Inspect Failed Logins</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {failedLoginsAlerts.slice(0, 3).map((alert) => (
              <div key={alert.id} className="p-3 bg-white rounded-xl border border-rose-200/80 text-xs space-y-1 shadow-2xs">
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span>{alert.timestamp}</span>
                  <span className="text-rose-700 font-bold px-1.5 py-0.2 bg-rose-50 rounded border border-rose-200">
                    FAILED AUTH
                  </span>
                </div>
                <p className="font-semibold text-slate-800 truncate">
                  Target Account: <span className="text-rose-900 font-mono">@{alert.username}</span>
                </p>
                <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                  <span>IP: {alert.ip_address}</span>
                  {alert.reason && (
                    <span className="text-rose-600 text-[10px] truncate max-w-[140px]" title={alert.reason}>
                      {alert.reason}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top 5 Metrics Strip - Authentic Production SaaS Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
        {/* Card 1: Total Logins */}
        <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            <span>Total Logins</span>
            <Users className="h-4 w-4 text-blue-600" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-slate-900">
              {metrics.total_logins.toLocaleString()}
            </span>
            <span className="text-xs text-slate-500 font-medium">
              total sessions
            </span>
          </div>
        </div>

        {/* Card 2: Successful Logins */}
        <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            <span>Successful Logins</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-slate-900">
              {metrics.successful_logins.toLocaleString()}
            </span>
            <span className="text-xs text-emerald-600 font-semibold">
              {metrics.success_rate}
            </span>
          </div>
        </div>

        {/* Card 3: Failed Logins */}
        <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            <span>Failed Logins</span>
            <XCircle className="h-4 w-4 text-rose-600" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-slate-900">
              {metrics.failed_logins.toLocaleString()}
            </span>
            <span className="text-xs text-rose-600 font-semibold">
              {metrics.failure_rate}
            </span>
          </div>
        </div>

        {/* Card 4: Unauthorized Attempts */}
        <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            <span>Unauthorized</span>
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-slate-900">
              {metrics.unauthorized_attempts.toLocaleString()}
            </span>
            <span className="text-xs text-amber-600 font-semibold">
              {metrics.unauthorized_note}
            </span>
          </div>
        </div>

        {/* Card 5: Security Events */}
        <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            <span>Security Events</span>
            <ShieldAlert className="h-4 w-4 text-purple-600" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-slate-900">
              {metrics.security_events.toLocaleString()}
            </span>
            <span className="text-xs text-slate-500 font-medium">
              audit events logged
            </span>
          </div>
        </div>
      </div>

      {/* 3 Analytics Charts Row: Login Activity, Access Attempts, Security Events */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Chart 1: Login Activity (Area/Line) - 5 cols */}
        <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between relative">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900">Login Activity</h3>

            {/* Interactive Login Filter Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsLoginDropdownOpen(!isLoginDropdownOpen)}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition cursor-pointer"
              >
                <span>{loginFilter}</span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>

              {isLoginDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-36 bg-white rounded-xl shadow-lg border border-slate-200 z-30 py-1 animate-in fade-in zoom-in-95 duration-100">
                  {["Last 7 Days", "Last 14 Days", "Last 30 Days", "Last 60 Days"].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        setLoginFilter(opt);
                        setIsLoginDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs font-medium transition flex items-center justify-between cursor-pointer ${
                        loginFilter === opt ? "bg-purple-50 text-purple-700 font-semibold" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span>{opt}</span>
                      {loginFilter === opt && <Check className="h-3 w-3 text-purple-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* SVG Line / Area */}
          <div className="relative pt-2">
            {(() => {
              const maxLogins = Math.max(5, ...loginActivity.map((l) => Math.max(l.successful, l.failed)));
              const n = loginActivity.length;
              const getX = (i) => (n > 1 ? (i / (n - 1)) * 400 : 200);
              const getY = (val) => 140 - ((val || 0) / maxLogins) * 125;

              const makePath = (key) =>
                loginActivity
                  .map((l, i) => `${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)},${getY(l[key]).toFixed(1)}`)
                  .join(" ");

              return (
                <>
                  <div className="absolute left-0 top-0 bottom-6 flex flex-col justify-between text-[10px] text-slate-400 font-mono">
                    <span>{maxLogins}</span>
                    <span>{Math.round(maxLogins * 0.75)}</span>
                    <span>{Math.round(maxLogins * 0.5)}</span>
                    <span>{Math.round(maxLogins * 0.25)}</span>
                    <span>0</span>
                  </div>

                  <div className="ml-7 h-44 relative border-b border-slate-200 pb-1">
                    <svg className="w-full h-full overflow-visible" viewBox="0 0 400 150" preserveAspectRatio="none">
                      <line x1="0" y1="0" x2="400" y2="0" stroke="#F8FAFC" strokeWidth="1" />
                      <line x1="0" y1="37" x2="400" y2="37" stroke="#F8FAFC" strokeWidth="1" />
                      <line x1="0" y1="75" x2="400" y2="75" stroke="#F8FAFC" strokeWidth="1" />
                      <line x1="0" y1="112" x2="400" y2="112" stroke="#F8FAFC" strokeWidth="1" />

                      {loginActivity.length > 0 && (
                        <>
                          <path d={makePath("successful")} fill="none" stroke="#10B981" strokeWidth="2.5" />
                          <path d={makePath("failed")} fill="none" stroke="#EF4444" strokeWidth="2.5" />
                        </>
                      )}
                    </svg>
                  </div>
                </>
              );
            })()}

            {/* Dynamic X Axis Labels */}
            {loginActivity.length > 0 && (
              <div className="ml-7 flex justify-between text-[10px] text-slate-400 pt-1 font-mono">
                <span>{loginActivity[0]?.date || ""}</span>
                <span>{loginActivity[Math.floor(loginActivity.length / 3)]?.date || ""}</span>
                <span>{loginActivity[Math.floor((loginActivity.length * 2) / 3)]?.date || ""}</span>
                <span>{loginActivity[loginActivity.length - 1]?.date || ""}</span>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-5 pt-3 text-xs font-medium text-slate-600">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#10B981]" />
              <span>Successful Logins</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#EF4444]" />
              <span>Failed Logins</span>
            </div>
          </div>
        </div>

        {/* Chart 2: Access Attempts (Bar) - 4 cols */}
        <div className="lg:col-span-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between relative">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900">Access Attempts</h3>

            {/* Interactive Access Filter Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsAccessDropdownOpen(!isAccessDropdownOpen)}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition cursor-pointer"
              >
                <span>{accessFilter}</span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>

              {isAccessDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-36 bg-white rounded-xl shadow-lg border border-slate-200 z-30 py-1 animate-in fade-in zoom-in-95 duration-100">
                  {["Last 7 Days", "Last 14 Days", "Last 30 Days", "Last 60 Days"].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        setAccessFilter(opt);
                        setIsAccessDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs font-medium transition flex items-center justify-between cursor-pointer ${
                        accessFilter === opt ? "bg-purple-50 text-purple-700 font-semibold" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span>{opt}</span>
                      {accessFilter === opt && <Check className="h-3 w-3 text-purple-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="relative pt-2">
            {(() => {
              const maxAccess = Math.max(5, ...accessAttempts.map((a) => Math.max(a.unauthorized, a.blocked)));
              return (
                <>
                  <div className="absolute left-0 top-0 bottom-6 flex flex-col justify-between text-[10px] text-slate-400 font-mono">
                    <span>{maxAccess}</span>
                    <span>{Math.round(maxAccess * 0.75)}</span>
                    <span>{Math.round(maxAccess * 0.5)}</span>
                    <span>{Math.round(maxAccess * 0.25)}</span>
                    <span>0</span>
                  </div>

                  <div className="ml-6 h-44 flex items-end justify-between gap-1 border-b border-slate-200 pb-1">
                    {accessAttempts.map((item, idx) => {
                      const hUnauth = (item.unauthorized / maxAccess) * 100;
                      const hBlocked = (item.blocked / maxAccess) * 100;
                      return (
                        <div key={idx} className="flex-1 flex items-end justify-center gap-0.5 h-full group relative">
                          <div
                            className="w-1 rounded-t bg-[#EF4444]"
                            style={{ height: `${hUnauth}%` }}
                            title={`${item.date} Unauthorized: ${item.unauthorized}`}
                          />
                          <div
                            className="w-1 rounded-t bg-[#3B82F6]"
                            style={{ height: `${hBlocked}%` }}
                            title={`${item.date} Blocked: ${item.blocked}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}

            {/* Dynamic X Axis Labels */}
            {accessAttempts.length > 0 && (
              <div className="ml-6 flex justify-between text-[10px] text-slate-400 pt-1 font-mono">
                <span>{accessAttempts[0]?.date || ""}</span>
                <span>{accessAttempts[Math.floor(accessAttempts.length / 3)]?.date || ""}</span>
                <span>{accessAttempts[Math.floor((accessAttempts.length * 2) / 3)]?.date || ""}</span>
                <span>{accessAttempts[accessAttempts.length - 1]?.date || ""}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-4 pt-3 text-xs font-medium text-slate-600">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#EF4444]" />
              <span>Unauthorized</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#3B82F6]" />
              <span>Blocked</span>
            </div>
          </div>
        </div>

        {/* Chart 3: Security Events Donut - 3 cols */}
        <div className="lg:col-span-3 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <h3 className="text-sm font-bold text-slate-900 mb-2">Security Events</h3>

          <div className="relative flex items-center justify-center my-1">
            <svg className="w-36 h-36 -rotate-90 transform" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="38" fill="transparent" stroke="#F1F5F9" strokeWidth="13" />
              {/* Dynamic segments based on securityEventsDist */}
              {(() => {
                const circ = 238.76;
                let cumulative = 0;
                return securityEventsDist.map((cat, idx) => {
                  const pct = Math.max(0, Math.min(100, cat.percentage || 0));
                  const dash = (pct / 100) * circ;
                  const space = circ - dash;
                  const offset = -cumulative;
                  cumulative += dash;
                  if (dash <= 0) return null;
                  return (
                    <circle
                      key={idx}
                      cx="50"
                      cy="50"
                      r="38"
                      fill="transparent"
                      stroke={cat.color || "#3B82F6"}
                      strokeWidth="13"
                      strokeDasharray={`${dash.toFixed(2)} ${space.toFixed(2)}`}
                      strokeDashoffset={offset.toFixed(2)}
                    />
                  );
                });
              })()}
            </svg>
            <div className="absolute text-center px-1">
              <span className="text-xl font-bold text-slate-900 block leading-tight">
                {metrics.security_events.toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                events
              </span>
            </div>
          </div>

          <div className="space-y-1.5 pt-2">
            {securityEventsDist.slice(0, 4).map((cat, idx) => (
              <div key={idx} className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                  <span className="text-slate-600 truncate">{cat.category}</span>
                </div>
                <span className="font-semibold text-slate-900 font-mono shrink-0 ml-1">
                  {cat.percentage}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tables Section: Recent Login Activity & Security Audit Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Table 1: Recent Logins */}
        <div id="recent-logins-section" className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Recent Login Activity</h3>
              <p className="text-[11px] text-slate-400">Authentication audit stream</p>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px] font-semibold self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setLoginTableFilter("all")}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                  loginTableFilter === "all" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                All ({recentLogins.length})
              </button>
              <button
                type="button"
                onClick={() => setLoginTableFilter("failed_only")}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                  loginTableFilter === "failed_only"
                    ? "bg-rose-600 text-white shadow-2xs font-bold"
                    : "text-rose-600 hover:text-rose-800"
                }`}
              >
                <ShieldAlert className="h-3 w-3" />
                <span>Incorrect Logins Only ({recentLogins.filter((r) => r.status === "Failed").length || failedLoginsAlerts.length})</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-100">
                <tr>
                  <th className="py-2.5 px-3.5">User</th>
                  <th className="py-2.5 px-3.5">Status</th>
                  <th className="py-2.5 px-3.5">IP Address</th>
                  <th className="py-2.5 px-3.5">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(() => {
                  const displayedLogins =
                    loginTableFilter === "failed_only"
                      ? recentLogins.some((r) => r.status === "Failed")
                        ? recentLogins.filter((r) => r.status === "Failed")
                        : failedLoginsAlerts.map((a) => ({
                            user: a.username,
                            status: "Failed",
                            ip: a.ip_address,
                            timestamp: a.timestamp
                          }))
                      : recentLogins;

                  if (displayedLogins.length === 0) {
                    return (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-slate-400 font-medium">
                          {loginTableFilter === "failed_only"
                            ? "Zero incorrect login attempts detected in this period."
                            : "No recent login activity found."}
                        </td>
                      </tr>
                    );
                  }

                  return displayedLogins.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60 transition">
                      <td className="py-2.5 px-3.5 font-medium text-slate-900">
                        {row.user || row.username || "Unknown User"}
                      </td>
                      <td className="py-2.5 px-3.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            row.status === "Success"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-rose-50 text-rose-700 border border-rose-200"
                          }`}
                        >
                          {row.status === "Success" ? "Success" : "Failed / Incorrect"}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 font-mono text-slate-500">
                        {row.ip}
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-500 font-mono whitespace-nowrap">
                        {row.timestamp}
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* Table 2: Recent Security Events */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Recent Security Audit Events</h3>
            <span className="text-xs font-semibold text-slate-400">{recentSecurityEvents.length} events</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-100">
                <tr>
                  <th className="py-2.5 px-3.5">Event</th>
                  <th className="py-2.5 px-3.5">Severity</th>
                  <th className="py-2.5 px-3.5">User</th>
                  <th className="py-2.5 px-3.5">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentSecurityEvents.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-400 font-medium">
                      Zero security events recorded in this period
                    </td>
                  </tr>
                ) : (
                  recentSecurityEvents.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60 transition">
                      <td className="py-2.5 px-3.5 font-medium text-slate-900 truncate max-w-[150px]">
                        {row.title || row.event || "Security Event"}
                      </td>
                      <td className="py-2.5 px-3.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            row.severity === "High"
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : row.severity === "Medium"
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-blue-50 text-blue-700 border border-blue-200"
                          }`}
                        >
                          {row.severity}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-600 font-medium truncate max-w-[100px]">
                        {row.user || row.username || "System"}
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-500 font-mono whitespace-nowrap">
                        {row.timestamp}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
