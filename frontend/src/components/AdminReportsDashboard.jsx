"use client";

import React, { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import {
  FileText,
  Download,
  UploadCloud,
  Share2,
  ShieldAlert,
  AlertTriangle,
  Users,
  Calendar,
  Filter,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  FileCode,
  Image as ImageIcon,
  Archive,
  Clock,
  Lock,
  ChevronRight,
  ExternalLink,
  ChevronDown
} from "lucide-react";

export default function AdminReportsDashboard({ formatBytes, showToast }) {
  // Current active report category
  const [activeReportTab, setActiveReportTab] = useState("overview"); // 'overview', 'uploads', 'downloads', 'shares', 'users', 'security'

  // Loading & Error States
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Filter States
  const [datePreset, setDatePreset] = useState("all"); // 'all', 'today', '7days', '30days', 'custom'
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searchUser, setSearchUser] = useState("");
  const [searchFile, setSearchFile] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Report Data States
  const [summaryData, setSummaryData] = useState(null);
  const [uploadReport, setUploadReport] = useState(null);
  const [downloadReport, setDownloadReport] = useState(null);
  const [sharingReport, setSharingReport] = useState(null);
  const [userActivityReport, setUserActivityReport] = useState(null);
  const [securityReport, setSecurityReport] = useState(null);

  // Helper to build query parameters string
  const buildQueryParams = useCallback(() => {
    const params = new URLSearchParams();

    // Date range handling
    const now = new Date();
    if (datePreset === "today") {
      const todayStr = now.toISOString().split("T")[0];
      params.append("start_date", todayStr);
    } else if (datePreset === "7days") {
      const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      params.append("start_date", past7.toISOString().split("T")[0]);
    } else if (datePreset === "30days") {
      const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      params.append("start_date", past30.toISOString().split("T")[0]);
    } else if (datePreset === "custom") {
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
    }

    if (searchUser.trim()) {
      params.append("username", searchUser.trim());
    }
    if (searchFile.trim()) {
      params.append("file_name", searchFile.trim());
    }
    if (statusFilter !== "all") {
      params.append("status", statusFilter);
    }

    params.append("limit", "100");
    return params.toString();
  }, [datePreset, startDate, endDate, searchUser, searchFile, statusFilter]);

  // Fetch report data based on active tab
  const fetchReportData = useCallback(async () => {
    setLoading(true);
    const queryString = buildQueryParams();
    try {
      if (activeReportTab === "overview") {
        const res = await api.get(`/reports/summary?${queryString}`);
        setSummaryData(res.data);
      } else if (activeReportTab === "uploads") {
        const res = await api.get(`/reports/uploads?${queryString}`);
        setUploadReport(res.data);
      } else if (activeReportTab === "downloads") {
        const res = await api.get(`/reports/downloads?${queryString}`);
        setDownloadReport(res.data);
      } else if (activeReportTab === "shares") {
        const res = await api.get(`/reports/shares?${queryString}`);
        setSharingReport(res.data);
      } else if (activeReportTab === "users") {
        const res = await api.get(`/reports/user-activity?${queryString}`);
        setUserActivityReport(res.data);
      } else if (activeReportTab === "security") {
        const res = await api.get(`/reports/security?${queryString}`);
        setSecurityReport(res.data);
      }
    } catch (err) {
      console.error("Failed to load report data:", err);
      if (showToast) showToast("Failed to load report data", "error");
    } finally {
      setLoading(false);
    }
  }, [activeReportTab, buildQueryParams, showToast]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  // Export report as CSV
  const handleExport = async (category, format = "csv") => {
    setExporting(true);
    try {
      const queryString = buildQueryParams();
      const res = await api.get(`/reports/export?category=${category}&export_format=${format}&${queryString}`, {
        responseType: format === "csv" ? "blob" : "json"
      });

      if (format === "csv") {
        const blob = new Blob([res.data], { type: "text/csv;charset=utf-8;" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `trustshare_${category}_report.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `trustshare_${category}_report.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
      if (showToast) showToast(`Exported ${category} report (${format.toUpperCase()}) successfully!`, "success");
    } catch (err) {
      console.error("Export error:", err);
      if (showToast) showToast("Export failed", "error");
    } finally {
      setExporting(false);
    }
  };

  // Helper for file type icons
  const getFileTypeIcon = (type) => {
    switch (type) {
      case "PDF Document":
        return <FileText className="h-4 w-4 text-rose-500" />;
      case "Spreadsheet":
        return <FileSpreadsheet className="h-4 w-4 text-emerald-500" />;
      case "Image":
        return <ImageIcon className="h-4 w-4 text-blue-500" />;
      case "Archive":
        return <Archive className="h-4 w-4 text-amber-500" />;
      case "Code / Script":
        return <FileCode className="h-4 w-4 text-purple-500" />;
      default:
        return <FileText className="h-4 w-4 text-slate-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* 1. REPORT SUITE HEADER & ACTIONS */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">File Activity & Security Reports</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Comprehensive audit telemetry, upload/download analytics & security reports
                </p>
              </div>
            </div>
          </div>

          {/* Export & Refresh Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={fetchReportData}
              disabled={loading}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-blue-600" : ""}`} />
              <span>Refresh</span>
            </button>

            <button
              onClick={() => handleExport(activeReportTab === "overview" ? "uploads" : activeReportTab, "csv")}
              disabled={exporting}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow-xs"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{exporting ? "Exporting..." : "Export CSV"}</span>
            </button>

            <button
              onClick={() => handleExport(activeReportTab === "overview" ? "uploads" : activeReportTab, "json")}
              disabled={exporting}
              className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition cursor-pointer"
            >
              JSON
            </button>
          </div>
        </div>

        {/* Granular Report Filters */}
        <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Date Presets */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1">
              <Calendar className="h-3 w-3 text-slate-400" />
              <span>Date Range</span>
            </label>
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Time</option>
              <option value="today">Today Only</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
              <option value="custom">Custom Date Range</option>
            </select>
          </div>

          {/* User Search */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1">
              <Users className="h-3 w-3 text-slate-400" />
              <span>Filter by User</span>
            </label>
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Username or email..."
                value={searchUser}
                onChange={(e) => setSearchUser(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-2.5 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* File Name Search */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1">
              <FileText className="h-3 w-3 text-slate-400" />
              <span>Filter by File</span>
            </label>
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Filename pattern..."
                value={searchFile}
                onChange={(e) => setSearchFile(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-2.5 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Operation Status */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1">
              <Filter className="h-3 w-3 text-slate-400" />
              <span>Status</span>
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="successful">Successful</option>
              <option value="failed">Failed / Blocked</option>
              <option value="active">Active (Shares)</option>
              <option value="expired">Expired (Shares)</option>
              <option value="revoked">Revoked (Shares)</option>
            </select>
          </div>

          {/* Apply Filter Button */}
          <div className="flex items-end">
            <button
              type="button"
              onClick={fetchReportData}
              className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
            >
              <Filter className="h-3.5 w-3.5" />
              <span>Apply Filters</span>
            </button>
          </div>
        </div>

        {/* Custom Date Inputs if selected */}
        {datePreset === "custom" && (
          <div className="pt-3 flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">Start:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-700 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">End:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-700 text-xs"
              />
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 3. REPORT CATEGORY NAVIGATION TABS */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveReportTab("overview")}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-2 shrink-0 ${
            activeReportTab === "overview"
              ? "bg-slate-900 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          <span>Overview Summary</span>
        </button>

        <button
          onClick={() => setActiveReportTab("uploads")}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-2 shrink-0 ${
            activeReportTab === "uploads"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          <UploadCloud className="h-3.5 w-3.5" />
          <span>Upload Reports</span>
        </button>

        <button
          onClick={() => setActiveReportTab("downloads")}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-2 shrink-0 ${
            activeReportTab === "downloads"
              ? "bg-emerald-600 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          <Download className="h-3.5 w-3.5" />
          <span>Download Reports</span>
        </button>

        <button
          onClick={() => setActiveReportTab("shares")}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-2 shrink-0 ${
            activeReportTab === "shares"
              ? "bg-indigo-600 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          <Share2 className="h-3.5 w-3.5" />
          <span>Sharing Reports</span>
        </button>

        <button
          onClick={() => setActiveReportTab("users")}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-2 shrink-0 ${
            activeReportTab === "users"
              ? "bg-purple-600 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          <span>User Activity Reports</span>
        </button>

        <button
          onClick={() => setActiveReportTab("security")}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-2 shrink-0 ${
            activeReportTab === "security"
              ? "bg-rose-600 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          <span>Security Reports</span>
        </button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* TAB 1: OVERVIEW SUMMARY */}
      {/* ------------------------------------------------------------------ */}
      {activeReportTab === "overview" && summaryData && (
        <div className="space-y-6">
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Uploads</span>
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                  <UploadCloud className="h-4 w-4" />
                </div>
              </div>
              <p className="text-base font-bold text-slate-900">{summaryData.metrics.total_uploads}</p>
              <p className="text-xs text-slate-500 mt-1">
                Volume: {formatBytes ? formatBytes(summaryData.metrics.total_upload_bytes) : `${summaryData.metrics.total_upload_bytes} B`}
              </p>
            </div>

            <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Downloads</span>
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                  <Download className="h-4 w-4" />
                </div>
              </div>
              <p className="text-base font-bold text-slate-900">{summaryData.metrics.total_downloads}</p>
              <p className="text-xs text-rose-600 mt-1 font-semibold">
                {summaryData.metrics.failed_downloads} failed / blocked attempts
              </p>
            </div>

            <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">File Shares</span>
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <Share2 className="h-4 w-4" />
                </div>
              </div>
              <p className="text-base font-bold text-slate-900">{summaryData.metrics.total_shares}</p>
              <div className="flex items-center gap-2 mt-1 text-[11px]">
                <span className="text-emerald-700 font-semibold">{summaryData.metrics.active_shares} Active</span>
                <span>•</span>
                <span className="text-amber-700 font-semibold">{summaryData.metrics.expired_shares} Expired</span>
                <span>•</span>
                <span className="text-rose-700 font-semibold">{summaryData.metrics.revoked_shares} Revoked</span>
              </div>
            </div>

            <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Security Incidents</span>
                <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
                  <ShieldAlert className="h-4 w-4" />
                </div>
              </div>
              <p className="text-base font-bold text-slate-900">{summaryData.metrics.total_security_incidents}</p>
              <p className="text-xs text-rose-600 mt-1 font-semibold">
                {summaryData.metrics.security_alerts} security alerts triggered
              </p>
            </div>
          </div>

          {/* Quick Tables: Top Uploaders & Most Downloaded Files */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Uploaders */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-600" />
                  <span>Top Uploaders</span>
                </h3>
                <button
                  onClick={() => setActiveReportTab("uploads")}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <span>View All</span>
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
              <div className="space-y-2">
                {summaryData.top_uploaders.length > 0 ? (
                  summaryData.top_uploaders.map((u, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                      <div>
                        <span className="font-bold text-slate-900">{u.username}</span>
                        <p className="text-[11px] text-slate-400">{u.full_name || "User"}</p>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-blue-700">{u.file_count} files</span>
                        <p className="text-[10px] text-slate-400 font-mono">
                          {formatBytes ? formatBytes(u.total_bytes) : `${u.total_bytes} B`}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center py-6 text-xs text-slate-400">No uploaders found for current filter.</p>
                )}
              </div>
            </div>

            {/* Most Downloaded Files */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Download className="h-4 w-4 text-emerald-600" />
                  <span>Most Downloaded Files</span>
                </h3>
                <button
                  onClick={() => setActiveReportTab("downloads")}
                  className="text-xs text-emerald-600 hover:text-emerald-800 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <span>View All</span>
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
              <div className="space-y-2">
                {summaryData.most_downloaded_files.length > 0 ? (
                  summaryData.most_downloaded_files.map((f, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                      <div className="truncate max-w-[240px]">
                        <span className="font-bold text-slate-900 block truncate">{f.file_name}</span>
                        <p className="text-[11px] text-slate-400">Owner: {f.owner_username || "Unknown"}</p>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-emerald-700 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200">
                          {f.download_count} downloads
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center py-6 text-xs text-slate-400">No downloaded files recorded yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: File Upload Reports */}
      {activeReportTab === "uploads" && uploadReport && (
        <div className="space-y-6">
          {/* Top Summary Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-white rounded-2xl border border-slate-200">
              <span className="text-xs font-bold text-slate-400 uppercase">Total Files Uploaded</span>
              <p className="text-base font-bold text-slate-900 mt-1">{uploadReport.total_files_uploaded}</p>
            </div>
            <div className="p-4 bg-white rounded-2xl border border-slate-200">
              <span className="text-xs font-bold text-slate-400 uppercase">Total Storage Ingested</span>
              <p className="text-base font-bold text-slate-900 mt-1">
                {formatBytes ? formatBytes(uploadReport.total_bytes_uploaded) : `${uploadReport.total_bytes_uploaded} B`}
              </p>
            </div>
            <div className="p-4 bg-white rounded-2xl border border-slate-200">
              <span className="text-xs font-bold text-slate-400 uppercase">Upload Success Rate</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-base font-bold text-emerald-600">
                  {uploadReport.upload_status_breakdown.successful}
                </span>
                <span className="text-xs text-slate-400">successful</span>
                {uploadReport.upload_status_breakdown.failed > 0 && (
                  <span className="text-xs font-bold text-rose-600 ml-2">
                    ({uploadReport.upload_status_breakdown.failed} failed)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* File Type Distribution */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
            <h3 className="font-bold text-slate-900 text-sm mb-3">File Type Breakdown</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {uploadReport.file_type_distribution.map((t, idx) => (
                <div key={idx} className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center">
                  <div className="flex justify-center mb-1.5">{getFileTypeIcon(t.file_type)}</div>
                  <span className="text-xs font-bold text-slate-800 block truncate">{t.file_type}</span>
                  <span className="text-sm font-extrabold text-blue-600">{t.count}</span>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {formatBytes ? formatBytes(t.total_bytes) : `${t.total_bytes} B`}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Files Uploaded by Each User Table */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
            <h3 className="font-bold text-slate-900 text-sm mb-3">Files Uploaded by User</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Full Name</th>
                    <th className="px-4 py-3 text-right">Files Uploaded</th>
                    <th className="px-4 py-3 text-right">Total Storage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {uploadReport.files_by_user.map((u, i) => (
                    <tr key={i} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-bold text-slate-900">{u.username}</td>
                      <td className="px-4 py-3 text-slate-600">{u.full_name || "-"}</td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-600">{u.file_count}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">
                        {formatBytes ? formatBytes(u.total_bytes) : `${u.total_bytes} B`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Chronological Upload Records Table */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
            <h3 className="font-bold text-slate-900 text-sm mb-3">Recent Upload Events</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3">File Name</th>
                    <th className="px-4 py-3">Uploader</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Size</th>
                    <th className="px-4 py-3">Encryption</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Upload Date & Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {uploadReport.records.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-bold text-slate-900">{r.file_name}</td>
                      <td className="px-4 py-3 text-slate-600">{r.owner_username || "Unknown"}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[10px] font-semibold">
                          {r.file_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600">
                        {formatBytes ? formatBytes(r.file_size) : `${r.file_size} B`}
                      </td>
                      <td className="px-4 py-3">
                        {r.is_encrypted ? (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-[10px] font-bold">
                            AES-256-GCM
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md text-[10px]">
                            Plaintext
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {r.upload_status === "successful" ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                            Success
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-700 font-semibold">
                            <XCircle className="h-3.5 w-3.5 text-rose-500" />
                            Failed
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-500">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab: File Download Reports */}
      {activeReportTab === "downloads" && downloadReport && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-white rounded-2xl border border-slate-200">
              <span className="text-xs font-bold text-slate-400 uppercase">Total Successful Downloads</span>
              <p className="text-base font-bold text-slate-900 mt-1">{downloadReport.total_downloads}</p>
            </div>
            <div className="p-4 bg-white rounded-2xl border border-slate-200">
              <span className="text-xs font-bold text-slate-400 uppercase">Failed Download Attempts</span>
              <p className="text-base font-bold text-rose-600 mt-1">{downloadReport.failed_downloads_count}</p>
            </div>
            <div className="p-4 bg-white rounded-2xl border border-slate-200">
              <span className="text-xs font-bold text-slate-400 uppercase">Download Consumers</span>
              <p className="text-base font-bold text-blue-600 mt-1">{downloadReport.downloads_by_user.length} users</p>
            </div>
          </div>

          {/* Most Downloaded Files Leaderboard */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
            <h3 className="font-bold text-slate-900 text-sm mb-3">Most Downloaded Files Leaderboard</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3">Rank</th>
                    <th className="px-4 py-3">File Name</th>
                    <th className="px-4 py-3">Owner</th>
                    <th className="px-4 py-3 text-right">Downloads Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {downloadReport.most_downloaded_files.map((f, i) => (
                    <tr key={i} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-bold text-slate-400">#{i + 1}</td>
                      <td className="px-4 py-3 font-bold text-slate-900">{f.file_name}</td>
                      <td className="px-4 py-3 text-slate-600">{f.owner_username || "Unknown"}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 font-bold rounded-lg border border-emerald-200">
                          {f.download_count} downloads
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Downloads by Each User */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
            <h3 className="font-bold text-slate-900 text-sm mb-3">Downloads by User</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {downloadReport.downloads_by_user.map((u, i) => (
                <div key={i} className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">{u.username}</span>
                  <span className="font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    {u.download_count} dl
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Failed Download Attempts Analysis */}
          {downloadReport.failed_downloads.length > 0 && (
            <div className="bg-white rounded-2xl border border-rose-200 p-5 shadow-2xs">
              <h3 className="font-bold text-rose-900 text-sm mb-3 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                <span>Failed Download Attempts (Blocked Access)</span>
              </h3>
              <div className="space-y-2">
                {downloadReport.failed_downloads.map((f, i) => (
                  <div key={i} className="p-3 bg-rose-50/70 border border-rose-200/60 rounded-xl text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-rose-900">{f.file_name || "File Download Request"}</span>
                      <span className="font-mono text-[10px] text-slate-500">
                        {new Date(f.date_and_time).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-700">
                      <span>Requester: <b>{f.username}</b></span> • <span>IP: <code className="font-mono">{f.ip_address || "127.0.0.1"}</code></span>
                    </div>
                    {f.failure_reason && (
                      <p className="text-[11px] text-rose-700 italic">Reason: {f.failure_reason}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: File Sharing Reports */}
      {activeReportTab === "shares" && sharingReport && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-white rounded-2xl border border-slate-200">
              <span className="text-xs font-bold text-slate-400 uppercase">Distinct Files Shared</span>
              <p className="text-base font-bold text-slate-900 mt-1">{sharingReport.total_files_shared}</p>
            </div>
            <div className="p-4 bg-white rounded-2xl border border-slate-200">
              <span className="text-xs font-bold text-slate-400 uppercase">Active Links</span>
              <p className="text-base font-bold text-emerald-600 mt-1">{sharingReport.active_links_count}</p>
            </div>
            <div className="p-4 bg-white rounded-2xl border border-slate-200">
              <span className="text-xs font-bold text-slate-400 uppercase">Expired Links</span>
              <p className="text-base font-bold text-amber-600 mt-1">{sharingReport.expired_links_count}</p>
            </div>
            <div className="p-4 bg-white rounded-2xl border border-slate-200">
              <span className="text-xs font-bold text-slate-400 uppercase">Revoked Links</span>
              <p className="text-base font-bold text-rose-600 mt-1">{sharingReport.revoked_links_count}</p>
            </div>
          </div>

          {/* Sharing Links Table */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
            <h3 className="font-bold text-slate-900 text-sm mb-3">All Sharing Links</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3">File Name</th>
                    <th className="px-4 py-3">Owner</th>
                    <th className="px-4 py-3">Recipient</th>
                    <th className="px-4 py-3">Permission</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Downloads</th>
                    <th className="px-4 py-3">Created At</th>
                    <th className="px-4 py-3">Expires At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sharingReport.records.map((s, i) => (
                    <tr key={i} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-bold text-slate-900">{s.file_name}</td>
                      <td className="px-4 py-3 text-slate-600">{s.owner_username}</td>
                      <td className="px-4 py-3 text-slate-600">{s.recipient_email || "Public Link"}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                          {s.permission}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {s.status === "active" && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            Active
                          </span>
                        )}
                        {s.status === "expired" && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                            Expired
                          </span>
                        )}
                        {s.status === "revoked" && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                            Revoked
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">
                        {s.downloads_count} {s.max_downloads ? `/ ${s.max_downloads}` : ""}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-500">{new Date(s.created_at).toLocaleString()}</td>
                      <td className="px-4 py-3 font-mono text-slate-500">
                        {s.expires_at ? new Date(s.expires_at).toLocaleString() : "Never"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab: User Activity Reports */}
      {activeReportTab === "users" && userActivityReport && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-white rounded-2xl border border-slate-200">
              <span className="text-xs font-bold text-slate-400 uppercase">Total Registered Users</span>
              <p className="text-base font-bold text-slate-900 mt-1">{userActivityReport.total_users}</p>
            </div>
            <div className="p-4 bg-white rounded-2xl border border-slate-200">
              <span className="text-xs font-bold text-slate-400 uppercase">Active Users Tracked</span>
              <p className="text-base font-bold text-blue-600 mt-1">{userActivityReport.active_users_count}</p>
            </div>
          </div>

          {/* User Activity Matrix Table */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
            <h3 className="font-bold text-slate-900 text-sm mb-3">User Activity Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3">Username</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3 text-right">Logins</th>
                    <th className="px-4 py-3 text-right">Uploads</th>
                    <th className="px-4 py-3 text-right">Downloads</th>
                    <th className="px-4 py-3 text-right">Shares</th>
                    <th className="px-4 py-3 text-right">Failed Actions</th>
                    <th className="px-4 py-3">Last Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {userActivityReport.user_summaries.map((u, i) => (
                    <tr key={i} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-bold text-slate-900">{u.username}</td>
                      <td className="px-4 py-3 text-slate-600">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          u.role === "admin" ? "bg-purple-100 text-purple-800" : "bg-slate-100 text-slate-700"
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">{u.login_count}</td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-600">{u.upload_count}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600">{u.download_count}</td>
                      <td className="px-4 py-3 text-right font-semibold text-indigo-600">{u.share_count}</td>
                      <td className="px-4 py-3 text-right font-semibold text-rose-600">{u.failed_actions_count}</td>
                      <td className="px-4 py-3 font-mono text-slate-500">
                        {u.last_active ? new Date(u.last_active).toLocaleString() : "Never"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Security Reports */}
      {activeReportTab === "security" && securityReport && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3 bg-white border border-slate-200 rounded-xl text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Failed Logins</span>
              <span className="text-xl font-bold text-rose-600">{securityReport.failed_logins_count}</span>
            </div>
            <div className="p-3 bg-white border border-slate-200 rounded-xl text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Unauthorized</span>
              <span className="text-xl font-bold text-rose-600">{securityReport.unauthorized_access_count}</span>
            </div>
            <div className="p-3 bg-white border border-slate-200 rounded-xl text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Suspicious DL</span>
              <span className="text-xl font-bold text-rose-600">{securityReport.suspicious_downloads_count}</span>
            </div>
            <div className="p-3 bg-white border border-slate-200 rounded-xl text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Expired Link Hits</span>
              <span className="text-xl font-bold text-amber-600">{securityReport.expired_link_access_count}</span>
            </div>
            <div className="p-3 bg-white border border-slate-200 rounded-xl text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Revoked Link Hits</span>
              <span className="text-xl font-bold text-rose-600">{securityReport.revoked_link_access_count}</span>
            </div>
            <div className="p-3 bg-white border border-slate-200 rounded-xl text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Alerts Triggered</span>
              <span className="text-xl font-bold text-purple-600">{securityReport.security_alerts_generated}</span>
            </div>
          </div>

          {/* Security Incidents Table */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
            <h3 className="font-bold text-slate-900 text-sm mb-3">Recorded Security Incidents</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3">Incident Type</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">User / Target</th>
                    <th className="px-4 py-3">IP Address</th>
                    <th className="px-4 py-3">Severity</th>
                    <th className="px-4 py-3">Date & Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {securityReport.incidents.map((inc, i) => (
                    <tr key={i} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded font-bold uppercase text-[10px] bg-rose-100 text-rose-800">
                          {inc.incident_type.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-800 max-w-xs">{inc.description}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{inc.username || inc.target_resource || "Unknown"}</td>
                      <td className="px-4 py-3 font-mono text-slate-500">{inc.ip_address}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          inc.severity === "critical"
                            ? "bg-rose-600 text-white"
                            : inc.severity === "high"
                            ? "bg-rose-100 text-rose-700"
                            : "bg-amber-100 text-amber-800"
                        }`}>
                          {inc.severity.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-500">
                        {new Date(inc.date_and_time).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

