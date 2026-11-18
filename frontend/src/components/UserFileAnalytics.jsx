"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import api from "@/lib/api";
import {
  Database,
  UploadCloud,
  Download,
  Share2,
  Calendar,
  ChevronDown,
  ArrowUpRight,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Film,
  File,
  CheckCircle2,
  Clock,
  User,
  RefreshCw,
  Sparkles,
  ArrowUp,
  Layers,
  BarChart3,
  TrendingUp,
  HardDrive,
  ChevronRight,
  ShieldCheck,
  Check,
  X
} from "lucide-react";

export default function UserFileAnalytics({ currentUser }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState("Oct 17, 2026 - Oct 30, 2026");
  const [activeDays, setActiveDays] = useState(30);
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  // Dropdown states
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isStorageDropdownOpen, setIsStorageDropdownOpen] = useState(false);
  const [isUploadDropdownOpen, setIsUploadDropdownOpen] = useState(false);
  const [isDownloadDropdownOpen, setIsDownloadDropdownOpen] = useState(false);
  const [isSharingDropdownOpen, setIsSharingDropdownOpen] = useState(false);

  // Filter selections
  const [storageTypeFilter, setStorageTypeFilter] = useState("By File Type");
  const [activeBreakdownKey, setActiveBreakdownKey] = useState("type"); // 'type' | 'category' | 'size'
  const [uploadFilter, setUploadFilter] = useState("Last 30 Days");
  const [downloadFilter, setDownloadFilter] = useState("Last 30 Days");
  const [sharingFilter, setSharingFilter] = useState("Last 30 Days");

  const datePickerRef = useRef(null);

  // Close open dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target)) {
        setIsDatePickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchAnalytics = useCallback(async (overrideParams = {}) => {
    setLoading(true);
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

      params.storage_view = overrideParams.storageView || activeBreakdownKey;

      const res = await api.get("/files/analytics", { params });
      setData(res.data);
      if (res.data?.date_range) {
        setDateRange(res.data.date_range);
      }
    } catch (err) {
      console.error("Failed to load file analytics:", err);
    } finally {
      setLoading(false);
    }
  }, [activeDays, customStartDate, customEndDate, activeBreakdownKey]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handlePresetSelect = (presetDays, label) => {
    setActiveDays(presetDays);
    setCustomStartDate("");
    setCustomEndDate("");
    setIsDatePickerOpen(false);
    fetchAnalytics({ days: presetDays, startDate: "", endDate: "" });
  };

  const handleApplyCustomDateRange = () => {
    if (!customStartDate || !customEndDate) return;
    setIsDatePickerOpen(false);
    fetchAnalytics({ startDate: customStartDate, endDate: customEndDate });
  };

  const getFileBadge = (type) => {
    const t = (type || "").toUpperCase();
    if (t === "PDF") {
      return (
        <div className="h-8 w-8 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center font-bold text-[10px] shrink-0">
          PDF
        </div>
      );
    }
    if (t === "DOCX" || t === "DOC") {
      return (
        <div className="h-8 w-8 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center font-bold text-[10px] shrink-0">
          DOCX
        </div>
      );
    }
    if (t === "XLSX" || t === "XLS" || t === "CSV") {
      return (
        <div className="h-8 w-8 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center font-bold text-[10px] shrink-0">
          XLSX
        </div>
      );
    }
    if (t === "PNG" || t === "JPG" || t === "JPEG" || t === "WEBP") {
      return (
        <div className="h-8 w-8 rounded-lg bg-purple-50 border border-purple-200 text-purple-600 flex items-center justify-center font-bold text-[10px] shrink-0">
          IMG
        </div>
      );
    }
    return (
      <div className="h-8 w-8 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center font-bold text-[10px] shrink-0">
        {t || "FILE"}
      </div>
    );
  };

  if (loading && !data) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[500px]">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm font-medium text-slate-700">Loading file analytics and storage telemetry...</p>
        </div>
      </div>
    );
  }

  const summary = data?.summary || {
    total_storage_used: "0 B",
    total_storage_limit: "500 MB",
    storage_percentage: 0,
    storage_change: 0,
    total_uploads: 0,
    uploads_change: 0,
    total_downloads: 0,
    downloads_change: 0,
    total_shares: 0,
    shares_change: 0
  };

  // Determine active breakdown based on dropdown
  const activeBreakdown =
    activeBreakdownKey === "category"
      ? (data?.storage_breakdown_by_category && data.storage_breakdown_by_category.length > 0
          ? data.storage_breakdown_by_category
          : data?.storage_breakdown || [])
      : activeBreakdownKey === "size"
      ? (data?.storage_breakdown_by_size && data.storage_breakdown_by_size.length > 0
          ? data.storage_breakdown_by_size
          : data?.storage_breakdown || [])
      : (data?.storage_breakdown_by_type && data.storage_breakdown_by_type.length > 0
          ? data.storage_breakdown_by_type
          : data?.storage_breakdown || [
              { name: "Documents", size_str: "0 B", percentage: 0, color: "#3B82F6" },
              { name: "Images", size_str: "0 B", percentage: 0, color: "#06B6D4" },
              { name: "Videos", size_str: "0 B", percentage: 0, color: "#EC4899" },
              { name: "Others", size_str: "0 B", percentage: 0, color: "#8B5CF6" }
            ]);

  const rawUploadReports = data?.upload_reports || [];
  const rawDownloadAnalytics = data?.download_analytics || [];
  const rawSharingReports = data?.sharing_reports || [];
  const recentUploads = data?.recent_uploads || [];
  const recentDownloads = data?.recent_downloads || [];

  // Slice reports based on respective dropdown selections
  const getSliceCount = (filterText) => {
    if (filterText.includes("7")) return 7;
    if (filterText.includes("14")) return 14;
    if (filterText.includes("60")) return 60;
    if (filterText.includes("90")) return 90;
    return 30;
  };

  const uploadReports = rawUploadReports.slice(-getSliceCount(uploadFilter));
  const downloadAnalytics = rawDownloadAnalytics.slice(-getSliceCount(downloadFilter));
  const sharingReports = rawSharingReports.slice(-getSliceCount(sharingFilter));

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* Click outside backdrop for small chart dropdowns */}
      {(isStorageDropdownOpen || isUploadDropdownOpen || isDownloadDropdownOpen || isSharingDropdownOpen) && (
        <div
          className="fixed inset-0 z-20 cursor-default"
          onClick={() => {
            setIsStorageDropdownOpen(false);
            setIsUploadDropdownOpen(false);
            setIsDownloadDropdownOpen(false);
            setIsSharingDropdownOpen(false);
          }}
        />
      )}

      {/* Breadcrumbs & Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1 flex-wrap">
            <span className="font-semibold text-slate-600">Analytics</span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="text-slate-900 font-bold">File Analytics</span>
          </div>

          <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-blue-600" />
            <span>File Analytics</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Operational telemetry for personal storage, upload volume, download events and active sharing links
          </p>
        </div>

        {/* Global Date Range Selector Popover */}
        <div className="flex items-center gap-2 relative" ref={datePickerRef}>
          <button
            type="button"
            onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition cursor-pointer"
          >
            <Calendar className="h-3.5 w-3.5 text-blue-600" />
            <span>{dateRange}</span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400 ml-1" />
          </button>

          <button
            type="button"
            onClick={() => fetchAnalytics()}
            title="Refresh File Analytics"
            className="p-1.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:text-blue-600 hover:border-blue-200 transition shadow-2xs cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-blue-600" : ""}`} />
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
                    onClick={() => handlePresetSelect(preset.days, preset.label)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold text-left transition flex items-center justify-between cursor-pointer ${
                      activeDays === preset.days && !customStartDate
                        ? "bg-blue-50 text-blue-700 border border-blue-200 font-bold"
                        : "text-slate-600 hover:bg-slate-50 border border-transparent"
                    }`}
                  >
                    <span>{preset.label}</span>
                    {activeDays === preset.days && !customStartDate && (
                      <Check className="h-3 w-3 text-blue-600" />
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
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 font-medium block mb-0.5">End Date</label>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!customStartDate || !customEndDate}
                  onClick={handleApplyCustomDateRange}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold rounded-xl transition shadow-xs cursor-pointer disabled:cursor-not-allowed"
                >
                  Apply Custom Range
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top 5 Metrics Strip - Authentic Production SaaS Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
        {/* Card 1: Storage Used */}
        <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            <span>Storage Used</span>
            <Database className="h-3.5 w-3.5 text-blue-600" />
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-base font-bold text-slate-900">
              {summary.total_storage_used}
            </span>
            <span className="text-[11px] text-slate-500 font-medium">
              / {summary.total_storage_limit} ({summary.storage_percentage}%)
            </span>
          </div>
        </div>

        {/* Card 2: Total Uploads */}
        <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            <span>Total Uploads</span>
            <UploadCloud className="h-3.5 w-3.5 text-emerald-600" />
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-base font-bold text-slate-900">
              {summary.total_uploads}
            </span>
            <span className="text-[11px] text-slate-500 font-medium">
              files stored
            </span>
          </div>
        </div>

        {/* Card 3: Total Downloads */}
        <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            <span>Total Downloads</span>
            <Download className="h-3.5 w-3.5 text-purple-600" />
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-base font-bold text-slate-900">
              {summary.total_downloads}
            </span>
            <span className="text-[11px] text-slate-500 font-medium">
              retrievals logged
            </span>
          </div>
        </div>

        {/* Card 4: Shared Documents */}
        <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            <span>Shared Documents</span>
            <Share2 className="h-3.5 w-3.5 text-sky-600" />
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-base font-bold text-slate-900">
              {summary.total_shares}
            </span>
            <span className="text-[11px] text-slate-500 font-medium">
              active shares
            </span>
          </div>
        </div>

        {/* Card 5: Security Status */}
        <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            <span>Security Status</span>
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-base font-bold text-slate-900">
              100%
            </span>
            <span className="text-[11px] text-emerald-600 font-semibold">
              AES-256-GCM Vault
            </span>
          </div>
        </div>
      </div>

      {/* Row 1 Charts: Storage Usage Statistics (Donut) & File Upload Reports (Stacked Bar) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Storage Usage Statistics */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between relative">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900">
              Storage Usage Statistics
            </h3>

            {/* Interactive Storage View Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsStorageDropdownOpen(!isStorageDropdownOpen)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition cursor-pointer"
              >
                <span>{storageTypeFilter}</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>

              {isStorageDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-44 bg-white rounded-xl shadow-lg border border-slate-200 z-30 py-1 animate-in fade-in zoom-in-95 duration-100">
                  {[
                    { key: "type", label: "By File Type" },
                    { key: "category", label: "By Category" },
                    { key: "size", label: "By File Size" }
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => {
                        setActiveBreakdownKey(opt.key);
                        setStorageTypeFilter(opt.label);
                        setIsStorageDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-2 text-xs font-medium transition flex items-center justify-between cursor-pointer ${
                        activeBreakdownKey === opt.key
                          ? "bg-blue-50 text-blue-700 font-semibold"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span>{opt.label}</span>
                      {activeBreakdownKey === opt.key && <Check className="h-3.5 w-3.5 text-blue-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-around py-4 gap-6">
            {/* Donut SVG */}
            <div className="relative flex items-center justify-center">
              <svg className="w-44 h-44 -rotate-90 transform" viewBox="0 0 100 100">
                {/* Background Ring */}
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  fill="transparent"
                  stroke="#F1F5F9"
                  strokeWidth="14"
                />
                {/* Dynamic segments based on activeBreakdown */}
                {(() => {
                  const circ = 238.76;
                  const segments = activeBreakdown.map((item, idx) => {
                    const pct = Math.max(0, Math.min(100, item.percentage || 0));
                    const dash = (pct / 100) * circ;
                    const space = circ - dash;
                    const priorDashes = activeBreakdown
                      .slice(0, idx)
                      .reduce((acc, curr) => acc + (Math.max(0, Math.min(100, curr.percentage || 0)) / 100) * circ, 0);
                    const offset = -priorDashes;
                    return { item, dash, space, offset };
                  });

                  return segments.map((seg, idx) => {
                    if (seg.dash <= 0) return null;
                    return (
                      <circle
                        key={idx}
                        cx="50"
                        cy="50"
                        r="38"
                        fill="transparent"
                        stroke={seg.item.color || "#3B82F6"}
                        strokeWidth="14"
                        strokeDasharray={`${seg.dash.toFixed(2)} ${seg.space.toFixed(2)}`}
                        strokeDashoffset={seg.offset.toFixed(2)}
                      />
                    );
                  });
                })()}
              </svg>
              {/* Inner Donut Text */}
              <div className="absolute text-center px-2">
                <span className="text-lg font-bold text-slate-900 block leading-tight">
                  {summary.total_storage_used}
                </span>
                <span className="text-[11px] text-slate-400 font-medium">
                  of {summary.total_storage_limit}
                </span>
              </div>
            </div>

            {/* Legend & Breakdown */}
            <div className="space-y-3 min-w-[200px]">
              {activeBreakdown.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-slate-600 font-medium">{item.name}</span>
                  </div>
                  <span className="font-semibold text-slate-900 font-mono">
                    {item.size_str} ({item.percentage}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Chart 2: File Upload Reports (Stacked Bars) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between relative">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900">
              File Upload Reports
            </h3>

            {/* Interactive Uploads Filter Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsUploadDropdownOpen(!isUploadDropdownOpen)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition cursor-pointer"
              >
                <span>{uploadFilter}</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>

              {isUploadDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-36 bg-white rounded-xl shadow-lg border border-slate-200 z-30 py-1 animate-in fade-in zoom-in-95 duration-100">
                  {["Last 7 Days", "Last 14 Days", "Last 30 Days", "Last 60 Days", "Last 90 Days"].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        setUploadFilter(opt);
                        setIsUploadDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-1.5 text-xs font-medium transition flex items-center justify-between cursor-pointer ${
                        uploadFilter === opt ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span>{opt}</span>
                      {uploadFilter === opt && <Check className="h-3 w-3 text-blue-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* SVG Stacked Bar Chart */}
          <div className="relative pt-2">
            {(() => {
              const maxUpload = Math.max(5, ...uploadReports.map((i) => i.documents + i.images + i.videos + i.others));
              return (
                <>
                  <div className="absolute left-0 top-0 bottom-6 flex flex-col justify-between text-[10px] text-slate-400 font-mono">
                    <span>{maxUpload}</span>
                    <span>{Math.round(maxUpload * 0.75)}</span>
                    <span>{Math.round(maxUpload * 0.5)}</span>
                    <span>{Math.round(maxUpload * 0.25)}</span>
                    <span>0</span>
                  </div>

                  <div className="ml-7 h-48 flex items-end justify-between gap-1 border-b border-slate-200 pb-1">
                    {uploadReports.length === 0 ? (
                      <div className="w-full h-full flex items-center justify-center text-xs text-slate-400 font-medium">
                        No upload activity logged in this period
                      </div>
                    ) : (
                      uploadReports.map((item, idx) => {
                        const total = item.documents + item.images + item.videos + item.others;
                        const hDoc = (item.documents / maxUpload) * 100;
                        const hImg = (item.images / maxUpload) * 100;
                        const hVid = (item.videos / maxUpload) * 100;
                        const hOth = (item.others / maxUpload) * 100;

                        return (
                          <div
                            key={idx}
                            className="flex-1 flex flex-col justify-end items-center h-full group relative"
                          >
                            {/* Clean Tooltip */}
                            <div className="absolute -top-12 z-20 hidden group-hover:flex flex-col items-center bg-slate-900 text-white text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap pointer-events-none">
                              <span>{item.date}: {total} files</span>
                              <span className="text-[8px] text-slate-300">
                                Doc:{item.documents} Img:{item.images} Vid:{item.videos}
                              </span>
                            </div>

                            <div className="w-full max-w-[10px] rounded-t overflow-hidden flex flex-col-reverse transition-all duration-300 group-hover:opacity-90">
                              <div style={{ height: `${hDoc}%`, backgroundColor: "#3B82F6" }} />
                              <div style={{ height: `${hImg}%`, backgroundColor: "#06B6D4" }} />
                              <div style={{ height: `${hVid}%`, backgroundColor: "#EC4899" }} />
                              <div style={{ height: `${hOth}%`, backgroundColor: "#8B5CF6" }} />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              );
            })()}

            {/* Dynamic X Axis Labels */}
            {uploadReports.length > 0 && (
              <div className="ml-7 flex justify-between text-[10px] text-slate-400 pt-1 font-mono">
                <span>{uploadReports[0]?.date || ""}</span>
                <span>{uploadReports[Math.floor(uploadReports.length / 3)]?.date || ""}</span>
                <span>{uploadReports[Math.floor((uploadReports.length * 2) / 3)]?.date || ""}</span>
                <span>{uploadReports[uploadReports.length - 1]?.date || ""}</span>
              </div>
            )}
          </div>

          {/* Bottom Legend */}
          <div className="flex items-center justify-center gap-5 pt-4 text-xs font-medium text-slate-600">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#3B82F6]" />
              <span>Documents</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#06B6D4]" />
              <span>Images</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#EC4899]" />
              <span>Videos</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#8B5CF6]" />
              <span>Others</span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2 Charts: Download Analytics (Multi-line) & Sharing Activity Reports (Bars) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 3: Download Analytics (Line Chart) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between relative">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900">
              Download Analytics
            </h3>

            {/* Interactive Download Filter Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsDownloadDropdownOpen(!isDownloadDropdownOpen)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition cursor-pointer"
              >
                <span>{downloadFilter}</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>

              {isDownloadDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-36 bg-white rounded-xl shadow-lg border border-slate-200 z-30 py-1 animate-in fade-in zoom-in-95 duration-100">
                  {["Last 7 Days", "Last 14 Days", "Last 30 Days", "Last 60 Days", "Last 90 Days"].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        setDownloadFilter(opt);
                        setIsDownloadDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-1.5 text-xs font-medium transition flex items-center justify-between cursor-pointer ${
                        downloadFilter === opt ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span>{opt}</span>
                      {downloadFilter === opt && <Check className="h-3 w-3 text-blue-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* SVG Line Chart */}
          <div className="relative pt-2">
            {(() => {
              const maxDl = Math.max(5, ...downloadAnalytics.map((d) => Math.max(d.total_downloads, d.unique_users, d.shared_downloads)));
              const n = downloadAnalytics.length;
              const getX = (i) => (n > 1 ? (i / (n - 1)) * 500 : 250);
              const getY = (val) => 175 - ((val || 0) / maxDl) * 155;

              const makePath = (key) =>
                downloadAnalytics
                  .map((d, i) => `${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)},${getY(d[key]).toFixed(1)}`)
                  .join(" ");

              return (
                <>
                  <div className="absolute left-0 top-0 bottom-6 flex flex-col justify-between text-[10px] text-slate-400 font-mono">
                    <span>{maxDl}</span>
                    <span>{Math.round(maxDl * 0.75)}</span>
                    <span>{Math.round(maxDl * 0.5)}</span>
                    <span>{Math.round(maxDl * 0.25)}</span>
                    <span>0</span>
                  </div>

                  <div className="ml-7 h-48 relative border-b border-slate-200 pb-1">
                    <svg className="w-full h-full overflow-visible" viewBox="0 0 500 180" preserveAspectRatio="none">
                      <line x1="0" y1="0" x2="500" y2="0" stroke="#F1F5F9" strokeWidth="1" />
                      <line x1="0" y1="45" x2="500" y2="45" stroke="#F1F5F9" strokeWidth="1" />
                      <line x1="0" y1="90" x2="500" y2="90" stroke="#F1F5F9" strokeWidth="1" />
                      <line x1="0" y1="135" x2="500" y2="135" stroke="#F1F5F9" strokeWidth="1" />
                      <line x1="0" y1="180" x2="500" y2="180" stroke="#E2E8F0" strokeWidth="1" />

                      {downloadAnalytics.length > 0 && (
                        <>
                          <path d={makePath("total_downloads")} fill="none" stroke="#3B82F6" strokeWidth="2.5" />
                          <path d={makePath("unique_users")} fill="none" stroke="#10B981" strokeWidth="2.5" />
                          <path d={makePath("shared_downloads")} fill="none" stroke="#EC4899" strokeWidth="2.5" />
                        </>
                      )}
                    </svg>
                  </div>
                </>
              );
            })()}

            {/* Dynamic X Axis Labels */}
            {downloadAnalytics.length > 0 && (
              <div className="ml-7 flex justify-between text-[10px] text-slate-400 pt-1 font-mono">
                <span>{downloadAnalytics[0]?.date || ""}</span>
                <span>{downloadAnalytics[Math.floor(downloadAnalytics.length / 3)]?.date || ""}</span>
                <span>{downloadAnalytics[Math.floor((downloadAnalytics.length * 2) / 3)]?.date || ""}</span>
                <span>{downloadAnalytics[downloadAnalytics.length - 1]?.date || ""}</span>
              </div>
            )}
          </div>

          {/* Bottom Legend */}
          <div className="flex items-center justify-center gap-6 pt-4 text-xs font-medium text-slate-600">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#3B82F6]" />
              <span>Total Downloads</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#10B981]" />
              <span>Unique Users</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#EC4899]" />
              <span>Shared Files Downloads</span>
            </div>
          </div>
        </div>

        {/* Chart 4: Sharing Activity Reports (Bar Chart) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between relative">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900">
              Sharing Activity Reports
            </h3>

            {/* Interactive Sharing Filter Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsSharingDropdownOpen(!isSharingDropdownOpen)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition cursor-pointer"
              >
                <span>{sharingFilter}</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>

              {isSharingDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-36 bg-white rounded-xl shadow-lg border border-slate-200 z-30 py-1 animate-in fade-in zoom-in-95 duration-100">
                  {["Last 7 Days", "Last 14 Days", "Last 30 Days", "Last 60 Days", "Last 90 Days"].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        setSharingFilter(opt);
                        setIsSharingDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-1.5 text-xs font-medium transition flex items-center justify-between cursor-pointer ${
                        sharingFilter === opt ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span>{opt}</span>
                      {sharingFilter === opt && <Check className="h-3 w-3 text-blue-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* SVG Grouped Bars */}
          <div className="relative pt-2">
            {(() => {
              const maxShare = Math.max(5, ...sharingReports.map((s) => Math.max(s.direct_share, s.link_share, s.internal_share)));
              return (
                <>
                  <div className="absolute left-0 top-0 bottom-6 flex flex-col justify-between text-[10px] text-slate-400 font-mono">
                    <span>{maxShare}</span>
                    <span>{Math.round(maxShare * 0.75)}</span>
                    <span>{Math.round(maxShare * 0.5)}</span>
                    <span>{Math.round(maxShare * 0.25)}</span>
                    <span>0</span>
                  </div>

                  <div className="ml-7 h-48 flex items-end justify-between gap-1 border-b border-slate-200 pb-1">
                    {sharingReports.length === 0 ? (
                      <div className="w-full h-full flex items-center justify-center text-xs text-slate-400 font-medium">
                        No sharing activity recorded in this period
                      </div>
                    ) : (
                      sharingReports.map((item, idx) => {
                        const hDirect = (item.direct_share / maxShare) * 100;
                        const hLink = (item.link_share / maxShare) * 100;
                        const hInternal = (item.internal_share / maxShare) * 100;

                        return (
                          <div
                            key={idx}
                            className="flex-1 flex items-end justify-center gap-0.5 h-full group relative"
                          >
                            {/* Tooltip */}
                            <div className="absolute -top-10 z-20 hidden group-hover:flex flex-col items-center bg-slate-900 text-white text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap pointer-events-none">
                              <span>{item.date}</span>
                              <span className="text-[8px] text-slate-300">
                                Direct:{item.direct_share} Link:{item.link_share} Int:{item.internal_share}
                              </span>
                            </div>

                            <div
                              className="w-1.5 rounded-t bg-[#3B82F6] transition-all group-hover:opacity-90"
                              style={{ height: `${hDirect}%` }}
                            />
                            <div
                              className="w-1.5 rounded-t bg-[#10B981] transition-all group-hover:opacity-90"
                              style={{ height: `${hLink}%` }}
                            />
                            <div
                              className="w-1.5 rounded-t bg-[#8B5CF6] transition-all group-hover:opacity-90"
                              style={{ height: `${hInternal}%` }}
                            />
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              );
            })()}

            {/* Dynamic X Axis Labels */}
            {sharingReports.length > 0 && (
              <div className="ml-7 flex justify-between text-[10px] text-slate-400 pt-1 font-mono">
                <span>{sharingReports[0]?.date || ""}</span>
                <span>{sharingReports[Math.floor(sharingReports.length / 3)]?.date || ""}</span>
                <span>{sharingReports[Math.floor((sharingReports.length * 2) / 3)]?.date || ""}</span>
                <span>{sharingReports[sharingReports.length - 1]?.date || ""}</span>
              </div>
            )}
          </div>

          {/* Bottom Legend */}
          <div className="flex items-center justify-center gap-6 pt-4 text-xs font-medium text-slate-600">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#3B82F6]" />
              <span>Direct Share</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#10B981]" />
              <span>Link Share</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#8B5CF6]" />
              <span>Internal Share</span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3 Tables: Recent Uploads & Recent Downloads */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Table 1: Recent Uploads */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">Recent Uploads</h3>
            <span className="text-xs font-semibold text-slate-400">
              {recentUploads.length} files logged
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">File Name</th>
                  <th className="py-3 px-4">Size</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Date & Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentUploads.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400 font-medium">
                      No uploaded files yet. Files you upload to your vault will appear here.
                    </td>
                  </tr>
                ) : (
                  recentUploads.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60 transition">
                      <td className="py-3.5 px-4 font-medium text-slate-900 flex items-center gap-2.5">
                        {getFileBadge(row.type)}
                        <span className="truncate max-w-[140px] sm:max-w-[180px]">
                          {row.name}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-mono">
                        {row.size}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 font-medium">
                        {row.type}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 font-mono whitespace-nowrap">
                        {row.date}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Table 2: Recent Downloads */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">Recent Downloads</h3>
            <span className="text-xs font-semibold text-slate-400">
              {recentDownloads.length} events logged
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">File Name</th>
                  <th className="py-3 px-4">Downloaded By</th>
                  <th className="py-3 px-4">Size</th>
                  <th className="py-3 px-4">Date & Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentDownloads.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400 font-medium">
                      No downloads recorded yet. When your shared files are downloaded, events will appear here.
                    </td>
                  </tr>
                ) : (
                  recentDownloads.map((row, idx) => {
                    const ext = (row.name || "").split(".").pop();
                    return (
                      <tr key={idx} className="hover:bg-slate-50/60 transition">
                        <td className="py-3.5 px-4 font-medium text-slate-900 flex items-center gap-2.5">
                          {getFileBadge(ext)}
                          <span className="truncate max-w-[130px] sm:max-w-[170px]">
                            {row.name}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-700 font-medium whitespace-nowrap">
                          {row.downloaded_by}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 font-mono">
                          {row.size}
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 font-mono whitespace-nowrap">
                          {row.date}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
