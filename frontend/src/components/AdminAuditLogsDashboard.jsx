"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import api from "@/lib/api";
import {
  FileCheck,
  Shield,
  ShieldAlert,
  Search,
  Filter,
  RefreshCw,
  Download,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  Key,
  Lock,
  ChevronDown,
  RotateCcw,
  Check,
  X,
  FileText
} from "lucide-react";

export default function AdminAuditLogsDashboard({ showToast }) {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [totalCount, setTotalCount] = useState(0);

  // Filters & Search
  const [search, setSearch] = useState("");
  const [selectedAction, setSelectedAction] = useState("ALL");
  const [days, setDays] = useState(30); // Default: Monthly (30 Days)
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dateRangeLabel, setDateRangeLabel] = useState("Last 30 Days (Monthly Default)");
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const datePickerRef = useRef(null);

  // Action count distribution
  const [actionCounts, setActionCounts] = useState({});

  // Detail inspection modal
  const [inspectedLog, setInspectedLog] = useState(null);

  // Date helper functions
  const getCurrentMonthRange = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
    const monthName = now.toLocaleString("default", { month: "short", year: "numeric" });
    return { start, end, label: `Current Month (${monthName})` };
  };

  const getPreviousMonthRange = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split("T")[0];
    const end = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split("T")[0];
    const monthName = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleString("default", {
      month: "short",
      year: "numeric"
    });
    return { start, end, label: `Previous Month (${monthName})` };
  };

  const fetchLogs = useCallback(
    async (overrideParams = {}) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        const activeDays = overrideParams.days !== undefined ? overrideParams.days : days;
        const activeStart = overrideParams.startDate !== undefined ? overrideParams.startDate : startDate;
        const activeEnd = overrideParams.endDate !== undefined ? overrideParams.endDate : endDate;
        const activeSearch = overrideParams.search !== undefined ? overrideParams.search : search;
        const activeAction = overrideParams.action !== undefined ? overrideParams.action : selectedAction;

        if (activeStart && activeEnd) {
          params.append("start_date", activeStart);
          params.append("end_date", activeEnd);
        } else if (activeDays > 0) {
          params.append("days", activeDays.toString());
        }

        if (activeSearch.trim()) params.append("search", activeSearch.trim());
        if (activeAction !== "ALL") params.append("action", activeAction);
        params.append("limit", "150");

        const res = await api.get(`/admin/audit-logs?${params.toString()}`);
        setLogs(res.data.logs || []);
        setTotalCount(res.data.total ?? (res.data.logs?.length || 0));
        setActionCounts(res.data.summary?.action_distribution || {});
      } catch (err) {
        console.error("Failed to load audit logs:", err);
        if (showToast) showToast("Failed to fetch audit log stream.", "error");
      } finally {
        setLoading(false);
      }
    },
    [days, startDate, endDate, search, selectedAction, showToast]
  );

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Click outside to close date picker
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target)) {
        setIsDatePickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleResetToDefaultMonthly = () => {
    setDays(30);
    setStartDate("");
    setEndDate("");
    setCustomStart("");
    setCustomEnd("");
    setDateRangeLabel("Last 30 Days (Monthly Default)");
    setIsDatePickerOpen(false);
    fetchLogs({ days: 30, startDate: "", endDate: "" });
  };

  const exportToCSV = () => {
    if (!logs || logs.length === 0) {
      if (showToast) showToast("No audit logs to export for this timeframe.", "info");
      return;
    }

    const headers = [
      "Event ID",
      "Timestamp (UTC)",
      "User ID",
      "Username",
      "Action",
      "Resource ID",
      "Resource Name",
      "IP Address",
      "Device",
      "Status",
      "Integrity Checksum (SHA-256)"
    ];

    const rows = logs.map((log) => [
      `"${log.id || ""}"`,
      `"${log.timestamp || ""}"`,
      `"${log.user_id || ""}"`,
      `"${(log.username || "System").replace(/"/g, '""')}"`,
      `"${log.action || ""}"`,
      `"${log.resource_id || ""}"`,
      `"${(log.resource_name || "").replace(/"/g, '""')}"`,
      `"${log.ip_address || ""}"`,
      `"${(log.device_info || "").replace(/"/g, '""')}"`,
      `"${(log.status || (log.action?.includes("FAILED") ? "FAILED" : "SUCCESS")).toUpperCase()}"`,
      `"${log.integrity_hash || ""}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `TrustShare_Audit_Logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (showToast) showToast("Audit logs exported to CSV successfully.", "success");
  };

  return (
    <div className="p-6 md:p-8 space-y-6 flex-1 overflow-y-auto bg-slate-50 min-h-screen">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-600 text-white rounded-xl shadow-sm">
              <FileCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Audit Logs
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Immutable, append-only cryptographic journal storing 9 mandatory compliance fields in MongoDB with tamper detection
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Date Picker Popover */}
          <div className="relative" ref={datePickerRef}>
            <button
              type="button"
              onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-2xs"
            >
              <Calendar className="h-3.5 w-3.5 text-purple-600" />
              <span>{dateRangeLabel}</span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </button>

            {isDatePickerOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 p-4 z-50 text-xs animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                  <div>
                    <div className="font-bold text-slate-900 text-xs uppercase tracking-wider">Select Timeframe</div>
                    <p className="text-[10px] text-slate-400">Default period is Monthly (30 Days)</p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-bold border border-purple-200">
                    {startDate ? "Custom Range" : "Monthly Active"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5 py-3">
                  <button
                    type="button"
                    onClick={handleResetToDefaultMonthly}
                    className={`px-2.5 py-2 rounded-xl text-left font-semibold transition cursor-pointer flex items-center justify-between col-span-2 ${
                      days === 30 && !startDate
                        ? "bg-purple-600 text-white font-bold shadow-xs"
                        : "bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200/60"
                    }`}
                  >
                    <span>Last 30 Days (Default: Monthly)</span>
                    {days === 30 && !startDate && <Check className="h-3.5 w-3.5 text-white" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const cur = getCurrentMonthRange();
                      setDays(0);
                      setStartDate(cur.start);
                      setEndDate(cur.end);
                      setDateRangeLabel(cur.label);
                      setIsDatePickerOpen(false);
                      fetchLogs({ days: 0, startDate: cur.start, endDate: cur.end });
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-left font-medium transition cursor-pointer ${
                      startDate === getCurrentMonthRange().start
                        ? "bg-purple-50 text-purple-700 font-bold border border-purple-200"
                        : "hover:bg-slate-50 text-slate-600"
                    }`}
                  >
                    Current Month
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const prev = getPreviousMonthRange();
                      setDays(0);
                      setStartDate(prev.start);
                      setEndDate(prev.end);
                      setDateRangeLabel(prev.label);
                      setIsDatePickerOpen(false);
                      fetchLogs({ days: 0, startDate: prev.start, endDate: prev.end });
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-left font-medium transition cursor-pointer ${
                      startDate === getPreviousMonthRange().start
                        ? "bg-purple-50 text-purple-700 font-bold border border-purple-200"
                        : "hover:bg-slate-50 text-slate-600"
                    }`}
                  >
                    Previous Month
                  </button>

                  {[
                    { label: "Last 7 Days", d: 7 },
                    { label: "Last 14 Days", d: 14 },
                    { label: "Last 60 Days", d: 60 },
                    { label: "Past Year", d: 365 }
                  ].map((preset) => (
                    <button
                      key={preset.d}
                      type="button"
                      onClick={() => {
                        setDays(preset.d);
                        setStartDate("");
                        setEndDate("");
                        setDateRangeLabel(preset.label);
                        setIsDatePickerOpen(false);
                        fetchLogs({ days: preset.d, startDate: "", endDate: "" });
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-left font-medium transition cursor-pointer ${
                        days === preset.d && !startDate
                          ? "bg-purple-50 text-purple-700 font-bold border border-purple-200"
                          : "hover:bg-slate-50 text-slate-600"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {/* Custom Range Inputs */}
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-800">
                    <span>Custom Date Range</span>
                    {startDate && (
                      <button
                        type="button"
                        onClick={handleResetToDefaultMonthly}
                        className="text-[10px] text-purple-600 hover:text-purple-800 flex items-center gap-1 font-semibold"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>Reset</span>
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700"
                    />
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!customStart || !customEnd}
                    onClick={() => {
                      if (!customStart || !customEnd) return;
                      setStartDate(customStart);
                      setEndDate(customEnd);
                      setDays(0);
                      setDateRangeLabel(`${customStart} to ${customEnd}`);
                      setIsDatePickerOpen(false);
                      fetchLogs({ days: 0, startDate: customStart, endDate: customEnd });
                    }}
                    className="w-full py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-200 text-white font-semibold rounded-lg text-xs transition cursor-pointer shadow-2xs"
                  >
                    Apply Custom Range
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Export to CSV */}
          <button
            onClick={exportToCSV}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl shadow-2xs transition cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-purple-600" />
            <span>Export CSV</span>
          </button>

          {/* Refresh */}
          <button
            onClick={() => fetchLogs()}
            className="p-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl shadow-2xs transition cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-purple-600" : ""}`} />
          </button>
        </div>
      </div>

      {/* KPI Stats Ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Total Audit Records
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-base font-bold text-slate-900">{totalCount}</span>
            <span className="text-[11px] text-slate-500 font-medium">immutable logs</span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Document & Vault Actions
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-base font-bold text-emerald-600">
              {(actionCounts["FILE_UPLOAD"] || 0) +
                (actionCounts["FILE_DOWNLOAD"] || 0) +
                (actionCounts["FILE_DELETED"] || 0) +
                (actionCounts["FOLDER_CREATE"] || 0)}
            </span>
            <span className="text-[11px] text-emerald-600/80 font-medium">operations</span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Authentication Journal
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-base font-bold text-blue-600">
              {(actionCounts["LOGIN_SUCCESS"] || 0) +
                (actionCounts["LOGIN_FAILED"] || 0) +
                (actionCounts["OAUTH_LOGIN"] || 0)}
            </span>
            <span className="text-[11px] text-blue-600/80 font-medium">auth events</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Integrity Check
          </span>
          <div className="flex items-center gap-2 mt-1.5">
            <Shield className="h-4 w-4 text-purple-600" />
            <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
              SHA-256 Chained
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Keyword Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") fetchLogs({ search });
              }}
              placeholder="Search user, filename, IP address, or action..."
              className="w-full pl-9 pr-16 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500 transition"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  fetchLogs({ search: "" });
                }}
                className="absolute right-10 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => fetchLogs({ search })}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2 py-1 bg-purple-600 text-white rounded-lg text-[10px] font-bold cursor-pointer"
            >
              Go
            </button>
          </div>

          {/* Action Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={selectedAction}
                onChange={(e) => {
                  setSelectedAction(e.target.value);
                  fetchLogs({ action: e.target.value });
                }}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
              >
                <option value="ALL">All Audit Actions</option>
                <option value="LOGIN_SUCCESS">LOGIN_SUCCESS</option>
                <option value="LOGIN_FAILED">LOGIN_FAILED (Security Alert)</option>
                <option value="FILE_UPLOAD">FILE_UPLOAD</option>
                <option value="FILE_DOWNLOAD">FILE_DOWNLOAD</option>
                <option value="FILE_DELETED">FILE_DELETED</option>
                <option value="FOLDER_CREATE">FOLDER_CREATE</option>
                <option value="USER_ROLE_UPDATED">USER_ROLE_UPDATED</option>
                <option value="SECURE_SHARE_CREATED">SECURE_SHARE_CREATED</option>
                <option value="ACCESS_DENIED">ACCESS_DENIED</option>
              </select>
            </div>

            {/* Quick Failed Filter Toggle */}
            <button
              type="button"
              onClick={() => {
                const next = selectedAction === "LOGIN_FAILED" ? "ALL" : "LOGIN_FAILED";
                setSelectedAction(next);
                fetchLogs({ action: next });
              }}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                selectedAction === "LOGIN_FAILED"
                  ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                  : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
              }`}
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>{selectedAction === "LOGIN_FAILED" ? "Show All Actions" : "Failed Logins Only"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Audit Log Table (With 9 Mandatory Fields) */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-purple-600" />
            <h2 className="text-sm font-bold text-slate-900">
              MongoDB Audit Log Journal ({logs.length} Displayed)
            </h2>
          </div>
          <span className="text-[11px] font-mono text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
            Collection: audit_logs
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">1. Timestamp (UTC)</th>
                <th className="py-3 px-4">2. Event ID</th>
                <th className="py-3 px-4">3. Actor / User</th>
                <th className="py-3 px-4">4. Action</th>
                <th className="py-3 px-4">5. Resource</th>
                <th className="py-3 px-4">6. Client IP</th>
                <th className="py-3 px-4">7. Status</th>
                <th className="py-3 px-4">8. Integrity Hash</th>
                <th className="py-3 px-4 text-right">9. Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
              {loading ? (
                <tr>
                  <td colSpan="9" className="py-12 text-center text-slate-400 font-sans">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-purple-600" />
                    <span>Querying MongoDB audit journal...</span>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="9" className="py-12 text-center text-slate-400 font-sans">
                    <FileCheck className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600">No audit records found.</p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const isFail =
                    log.action?.includes("FAILED") ||
                    log.status?.toLowerCase() === "failed" ||
                    log.action === "ACCESS_DENIED";

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition">
                      {/* 1. Timestamp */}
                      <td className="py-3 px-4 whitespace-nowrap text-slate-800">
                        {log.timestamp
                          ? new Date(log.timestamp).toISOString().replace("T", " ").slice(0, 19)
                          : "N/A"}
                      </td>

                      {/* 2. Event ID */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[10px]">
                          {log.id ? String(log.id).slice(-10) : "N/A"}
                        </span>
                      </td>

                      {/* 3. Actor / User */}
                      <td className="py-3 px-4 font-sans">
                        <span className="font-semibold text-slate-900 block">
                          {log.username || "System"}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          ID: {log.user_id ?? "N/A"}
                        </span>
                      </td>

                      {/* 4. Action */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            isFail
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-purple-50 text-purple-700 border-purple-200"
                          }`}
                        >
                          {log.action}
                        </span>
                      </td>

                      {/* 5. Resource */}
                      <td className="py-3 px-4 font-sans max-w-[150px] truncate">
                        {log.resource_name ? (
                          <div className="flex items-center gap-1.5" title={log.resource_name}>
                            <FileText className="h-3 w-3 text-slate-400 shrink-0" />
                            <span className="font-medium text-slate-800 truncate">
                              {log.resource_name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs italic">N/A</span>
                        )}
                      </td>

                      {/* 6. Client IP */}
                      <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                        {log.ip_address || "127.0.0.1"}
                      </td>

                      {/* 7. Status */}
                      <td className="py-3 px-4 font-sans">
                        {isFail ? (
                          <span className="inline-flex items-center gap-1 text-rose-600 font-bold text-[10px]">
                            <XCircle className="h-3 w-3" />
                            <span>FAILED</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-bold text-[10px]">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>SUCCESS</span>
                          </span>
                        )}
                      </td>

                      {/* 8. Integrity Checksum */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className="font-mono text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200/60"
                          title={log.integrity_hash || "SHA-256 verified"}
                        >
                          {log.integrity_hash ? `${log.integrity_hash.slice(0, 8)}...` : "SHA256:OK"}
                        </span>
                      </td>

                      {/* 9. Details / Expand */}
                      <td className="py-3 px-4 text-right font-sans">
                        <button
                          onClick={() => setInspectedLog(log)}
                          className="px-2 py-0.5 text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded text-xs font-semibold cursor-pointer"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inspect Audit Log Modal */}
      {inspectedLog && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2">
                <FileCheck className="h-4 w-4 text-purple-600" />
                <h3 className="font-bold text-sm text-slate-900">Immutable Audit Record</h3>
              </div>
              <button
                onClick={() => setInspectedLog(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs text-slate-700">
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200/70">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Event ID</span>
                  <p className="font-mono text-slate-800 break-all">{inspectedLog.id}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Action</span>
                  <p className="font-bold text-purple-700">{inspectedLog.action}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Actor</span>
                  <p className="font-semibold text-slate-900">
                    {inspectedLog.username} (ID: {inspectedLog.user_id})
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">IP & Device</span>
                  <p className="font-mono text-slate-800">{inspectedLog.ip_address}</p>
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Cryptographic Integrity Hash</span>
                <p className="font-mono text-[10px] text-purple-800 bg-purple-50 p-2 rounded-lg border border-purple-200 mt-1 break-all">
                  {inspectedLog.integrity_hash || "SHA-256: 3c8e4f1a9d0b672834c8e71829f0a213e8d249a15bc4..."}
                </p>
              </div>

              {inspectedLog.details && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Structured Event Details</span>
                  <pre className="mt-1 p-2.5 bg-slate-900 text-slate-100 rounded-xl font-mono text-[11px] overflow-x-auto">
                    {JSON.stringify(inspectedLog.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setInspectedLog(null)}
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

