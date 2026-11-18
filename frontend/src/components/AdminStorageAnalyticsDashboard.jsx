"use client";

import React, { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import {
  HardDrive,
  UploadCloud,
  Download,
  Share2,
  PieChart as PieChartIcon,
  BarChart3,
  TrendingUp,
  Filter,
  Calendar,
  Users,
  FileText,
  RefreshCw,
  Clock,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  ChevronDown
} from "lucide-react";

export default function AdminStorageAnalyticsDashboard({ formatBytes, showToast }) {
  const [loading, setLoading] = useState(true);
  const [analyticsData, setAnalyticsData] = useState(null);

  // Interactive Filters
  const [datePreset, setDatePreset] = useState("30"); // '7', '30', '90', 'all', 'custom'
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [fileTypeFilter, setFileTypeFilter] = useState("all");
  const [activityFilter, setActivityFilter] = useState("all");

  // Hover states for interactive charts
  const [hoveredPieIndex, setHoveredPieIndex] = useState(null);
  const [hoveredBarIndex, setHoveredBarIndex] = useState(null);
  const [hoveredDlIndex, setHoveredDlIndex] = useState(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();

    const now = new Date();
    if (datePreset === "7") {
      const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      params.append("start_date", past7.toISOString().split("T")[0]);
      params.append("days", "7");
    } else if (datePreset === "30") {
      const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      params.append("start_date", past30.toISOString().split("T")[0]);
      params.append("days", "30");
    } else if (datePreset === "90") {
      const past90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      params.append("start_date", past90.toISOString().split("T")[0]);
      params.append("days", "90");
    } else if (datePreset === "custom") {
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
    }

    if (selectedUser.trim()) {
      params.append("username", selectedUser.trim());
    }
    if (fileTypeFilter !== "all") {
      params.append("file_type", fileTypeFilter);
    }
    if (activityFilter !== "all") {
      params.append("activity_type", activityFilter);
    }

    try {
      const res = await api.get(`/analytics/dashboard?${params.toString()}`);
      setAnalyticsData(res.data);
    } catch (err) {
      console.error("Storage analytics fetch error:", err);
      if (showToast) showToast("Failed to load storage analytics", "error");
    } finally {
      setLoading(false);
    }
  }, [datePreset, startDate, endDate, selectedUser, fileTypeFilter, activityFilter, showToast]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  if (loading && !analyticsData) {
    return (
      <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
        <RefreshCw className="h-8 w-8 text-blue-600 animate-spin mx-auto mb-3" />
        <p className="font-bold text-slate-700 text-sm">Loading storage analytics & usage data...</p>
        <p className="text-xs text-slate-400 mt-1">Retrieving actual metadata from PostgreSQL and MongoDB...</p>
      </div>
    );
  }

  if (!analyticsData) return null;

  const { storage, user_storage, files, downloads, sharing, charts } = analyticsData;

  // Pie chart calculation helper
  const pieData = charts.user_storage_pie || [];
  const pieSlices = pieData.map((slice, idx) => {
    const angle = (slice.percentage / 100) * 360;
    const startAngle = pieData.slice(0, idx).reduce((acc, curr) => acc + (curr.percentage / 100) * 360, 0);
    return {
      ...slice,
      startAngle,
      endAngle: startAngle + angle
    };
  });

  return (
    <div className="space-y-6">
      {/* Header & Interactive Filters Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                <HardDrive className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Storage Analytics & Usage Monitoring</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Actual stored file sizes, user-wise distribution & multi-axis telemetry
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchAnalytics}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-blue-600" : ""}`} />
              <span>Refresh Analytics</span>
            </button>
          </div>
        </div>

        {/* Filter Controls (Date range, User, File type, Activity type) */}
        <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* 1. Date Range */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1">
              <Calendar className="h-3 w-3 text-slate-400" />
              <span>Date Range</span>
            </label>
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="90">Last 90 Days</option>
              <option value="all">All Time History</option>
              <option value="custom">Custom Date Range</option>
            </select>
          </div>

          {/* 2. User Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1">
              <Users className="h-3 w-3 text-slate-400" />
              <span>User Filter</span>
            </label>
            <input
              type="text"
              placeholder="Username filter..."
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* 3. File Type */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1">
              <FileText className="h-3 w-3 text-slate-400" />
              <span>File Type</span>
            </label>
            <select
              value={fileTypeFilter}
              onChange={(e) => setFileTypeFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All File Types</option>
              <option value="pdf">PDF Documents</option>
              <option value="spreadsheet">Spreadsheets (Excel/CSV)</option>
              <option value="image">Images</option>
              <option value="code">Code / Scripts</option>
              <option value="archive">Archives (Zip/Tar)</option>
              <option value="document">General Documents</option>
            </select>
          </div>

          {/* 4. Activity Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1">
              <Filter className="h-3 w-3 text-slate-400" />
              <span>Activity Type</span>
            </label>
            <select
              value={activityFilter}
              onChange={(e) => setActivityFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Operations</option>
              <option value="upload">Upload Activity</option>
              <option value="download">Download Activity</option>
              <option value="sharing">Sharing Activity</option>
            </select>
          </div>
        </div>

        {datePreset === "custom" && (
          <div className="pt-3 flex items-center gap-3 text-xs border-t border-slate-100 mt-3">
            <span className="text-slate-500 font-medium">Custom Window:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-700 text-xs"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-700 text-xs"
            />
            <button
              onClick={fetchAnalytics}
              className="px-3 py-1 bg-slate-900 text-white rounded-lg text-xs font-semibold"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {/* Core Storage & Sharing Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Storage Used */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Storage Used</span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <HardDrive className="h-4 w-4" />
            </div>
          </div>
          <p className="text-base font-bold text-slate-900">{storage.total_storage_formatted}</p>
          <div className="mt-3 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>Pool Quota ({storage.quota_limit_formatted})</span>
              <span className="font-bold text-blue-600">{storage.used_percentage}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(storage.used_percentage, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Total Files Uploaded */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Uploaded Files</span>
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <UploadCloud className="h-4 w-4" />
            </div>
          </div>
          <p className="text-base font-bold text-slate-900">{files.total_uploaded_files}</p>
          <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
            <span>Avg File Size:</span>
            <span className="font-semibold text-slate-800">{files.average_file_size_formatted}</span>
          </div>
          <div className="mt-1 text-[11px] text-emerald-600 font-semibold">
            {files.encrypted_files_count} files AES-256-GCM encrypted
          </div>
        </div>

        {/* Download Statistics */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Downloads</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <Download className="h-4 w-4" />
            </div>
          </div>
          <p className="text-base font-bold text-slate-900">{downloads.total_downloads}</p>
          <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
            <span>Unique Files:</span>
            <span className="font-semibold text-slate-800">{downloads.unique_files_downloaded}</span>
          </div>
          {downloads.failed_downloads_count > 0 ? (
            <div className="mt-1 text-[11px] text-rose-600 font-semibold">
              {downloads.failed_downloads_count} failed / blocked attempts
            </div>
          ) : (
            <div className="mt-1 text-[11px] text-emerald-600 font-semibold">
              All downloads authorized
            </div>
          )}
        </div>

        {/* File-Sharing Statistics */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Shared Files</span>
            <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
              <Share2 className="h-4 w-4" />
            </div>
          </div>
          <p className="text-base font-bold text-slate-900">{sharing.total_shared_files}</p>
          <div className="flex items-center gap-2 mt-2 text-[11px]">
            <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded">
              {sharing.active_sharing_links} Active
            </span>
            <span className="text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded">
              {sharing.expired_sharing_links} Expired
            </span>
            <span className="text-rose-700 font-semibold bg-rose-50 px-2 py-0.5 rounded">
              {sharing.revoked_sharing_links} Revoked
            </span>
          </div>
        </div>
      </div>

      {/* Storage & File Distribution Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Storage Usage by Users */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <PieChartIcon className="h-4 w-4 text-blue-600" />
                <span>Storage Usage by Users</span>
              </h3>
              <span className="text-[11px] text-slate-400 font-medium">User Distribution</span>
            </div>

            {pieData.length > 0 ? (
              <div className="flex flex-col sm:flex-row items-center justify-around gap-6 py-4">
                {/* SVG Interactive Donut/Pie */}
                <div className="relative w-44 h-44">
                  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    {pieSlices.map((slice, i) => {
                      const strokeDash = `${(slice.percentage / 100) * 251.2} 251.2`;
                      const strokeOffset = -((slice.startAngle / 360) * 251.2);
                      const isHovered = hoveredPieIndex === i;

                      return (
                        <circle
                          key={i}
                          cx="50"
                          cy="50"
                          r="40"
                          fill="transparent"
                          stroke={slice.color}
                          strokeWidth={isHovered ? "16" : "12"}
                          strokeDasharray={strokeDash}
                          strokeDashoffset={strokeOffset}
                          className="transition-all duration-200 cursor-pointer"
                          onMouseEnter={() => setHoveredPieIndex(i)}
                          onMouseLeave={() => setHoveredPieIndex(null)}
                        />
                      );
                    })}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Storage</span>
                    <span className="text-xs font-extrabold text-slate-800">
                      {hoveredPieIndex !== null ? pieData[hoveredPieIndex].label : storage.total_storage_formatted}
                    </span>
                    <span className="text-[10px] text-blue-600 font-semibold">
                      {hoveredPieIndex !== null ? `${pieData[hoveredPieIndex].percentage}%` : "Total"}
                    </span>
                  </div>
                </div>

                {/* Legend list */}
                <div className="space-y-2 text-xs flex-1 max-w-[220px]">
                  {pieData.map((u, i) => (
                    <div
                      key={i}
                      onMouseEnter={() => setHoveredPieIndex(i)}
                      onMouseLeave={() => setHoveredPieIndex(null)}
                      className={`flex items-center justify-between p-1.5 rounded-lg transition cursor-pointer ${
                        hoveredPieIndex === i ? "bg-slate-100 font-bold" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: u.color }} />
                        <span className="truncate text-slate-700">{u.label}</span>
                      </div>
                      <span className="font-mono text-slate-900 shrink-0">{u.formatted} ({u.percentage}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-center py-10 text-xs text-slate-400">No user storage records to display.</p>
            )}
          </div>
          <p className="text-[11px] text-slate-400 text-center border-t border-slate-100 pt-2">
            Proportional representation of physical disk bytes consumed per user account.
          </p>
        </div>

        {/* File Uploads by Date */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-indigo-600" />
                <span>File Uploads by Date</span>
              </h3>
              <span className="text-[11px] text-slate-400 font-medium">Daily Upload Intake</span>
            </div>

            {charts.uploads_by_date_bar && charts.uploads_by_date_bar.length > 0 ? (
              <div className="py-2">
                <div className="h-44 flex items-end gap-2 border-b border-slate-200 pb-2 px-1">
                  {charts.uploads_by_date_bar.map((bar, idx) => {
                    const maxVal = Math.max(...charts.uploads_by_date_bar.map((b) => b.count), 1);
                    const heightPct = Math.max((bar.count / maxVal) * 100, 8);
                    const isHovered = hoveredBarIndex === idx;

                    return (
                      <div
                        key={idx}
                        className="flex-1 flex flex-col items-center gap-1 group relative cursor-pointer"
                        onMouseEnter={() => setHoveredBarIndex(idx)}
                        onMouseLeave={() => setHoveredBarIndex(null)}
                      >
                        {/* Tooltip */}
                        {isHovered && (
                          <div className="absolute -top-12 z-20 px-2 py-1 bg-slate-900 text-white rounded text-[10px] whitespace-nowrap shadow-md">
                            <span className="font-bold">{bar.date}:</span> {bar.count} files ({bar.formatted_size})
                          </div>
                        )}
                        <div
                          className={`w-full rounded-t-md transition-all duration-200 ${
                            isHovered ? "bg-indigo-700" : "bg-indigo-500 hover:bg-indigo-600"
                          }`}
                          style={{ height: `${heightPct}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
                {/* Dates below axis */}
                <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2 font-mono">
                  <span>{charts.uploads_by_date_bar[0]?.date}</span>
                  <span>{charts.uploads_by_date_bar[charts.uploads_by_date_bar.length - 1]?.date}</span>
                </div>
              </div>
            ) : (
              <p className="text-center py-10 text-xs text-slate-400">No upload history in this date window.</p>
            )}
          </div>
          <p className="text-[11px] text-slate-400 text-center border-t border-slate-100 pt-2">
            Timeline graph of incoming file uploads and daily storage volume.
          </p>
        </div>

        {/* File Downloads Over Time */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                <span>File Downloads Over Time</span>
              </h3>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Successful
                </span>
                <span className="flex items-center gap-1 text-rose-700 font-semibold">
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  Failed/Blocked
                </span>
              </div>
            </div>

            {charts.downloads_by_date_chart && charts.downloads_by_date_chart.length > 0 ? (
              <div className="py-2">
                <div className="h-44 flex items-end gap-2 border-b border-slate-200 pb-2 px-1">
                  {charts.downloads_by_date_chart.map((pt, idx) => {
                    const maxVal = Math.max(
                      ...charts.downloads_by_date_chart.map((p) => p.downloads + p.failed),
                      1
                    );
                    const dlHeight = Math.max((pt.downloads / maxVal) * 100, 4);
                    const failHeight = Math.max((pt.failed / maxVal) * 100, 4);
                    const isHovered = hoveredDlIndex === idx;

                    return (
                      <div
                        key={idx}
                        className="flex-1 flex flex-col items-center gap-1 group relative cursor-pointer"
                        onMouseEnter={() => setHoveredDlIndex(idx)}
                        onMouseLeave={() => setHoveredDlIndex(null)}
                      >
                        {isHovered && (
                          <div className="absolute -top-12 z-20 px-2 py-1 bg-slate-900 text-white rounded text-[10px] whitespace-nowrap shadow-md">
                            <span className="font-bold">{pt.date}:</span> {pt.downloads} downloads, {pt.failed} failed
                          </div>
                        )}
                        <div className="w-full flex flex-col gap-0.5 justify-end h-full">
                          {pt.failed > 0 && (
                            <div
                              className="w-full bg-rose-500 rounded-t-sm"
                              style={{ height: `${failHeight}%` }}
                            />
                          )}
                          <div
                            className="w-full bg-emerald-500 hover:bg-emerald-600 rounded-t-sm transition-all"
                            style={{ height: `${dlHeight}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2 font-mono">
                  <span>{charts.downloads_by_date_chart[0]?.date}</span>
                  <span>{charts.downloads_by_date_chart[charts.downloads_by_date_chart.length - 1]?.date}</span>
                </div>
              </div>
            ) : (
              <p className="text-center py-10 text-xs text-slate-400">No download events recorded yet.</p>
            )}
          </div>
          <p className="text-[11px] text-slate-400 text-center border-t border-slate-100 pt-2">
            Multi-series download tracking showing successful file deliveries and blocked attempts.
          </p>
        </div>

        {/* File Sharing Statistics */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Share2 className="h-4 w-4 text-purple-600" />
                <span>File Sharing Statistics</span>
              </h3>
              <span className="text-[11px] text-slate-400 font-medium">Link Status Matrix</span>
            </div>

            <div className="py-4 space-y-4">
              {/* Stacked comparison bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Active vs Expired vs Revoked Links</span>
                  <span className="font-bold text-slate-900">{sharing.total_sharing_links} total links</span>
                </div>
                <div className="h-5 w-full bg-slate-100 rounded-xl overflow-hidden flex shadow-inner">
                  {sharing.total_sharing_links > 0 ? (
                    <>
                      <div
                        className="bg-emerald-500 hover:bg-emerald-600 transition"
                        style={{
                          width: `${(sharing.active_sharing_links / sharing.total_sharing_links) * 100}%`
                        }}
                        title={`Active: ${sharing.active_sharing_links}`}
                      />
                      <div
                        className="bg-amber-500 hover:bg-amber-600 transition"
                        style={{
                          width: `${(sharing.expired_sharing_links / sharing.total_sharing_links) * 100}%`
                        }}
                        title={`Expired: ${sharing.expired_sharing_links}`}
                      />
                      <div
                        className="bg-rose-500 hover:bg-rose-600 transition"
                        style={{
                          width: `${(sharing.revoked_sharing_links / sharing.total_sharing_links) * 100}%`
                        }}
                        title={`Revoked: ${sharing.revoked_sharing_links}`}
                      />
                    </>
                  ) : (
                    <div className="w-full bg-slate-200" />
                  )}
                </div>
              </div>

              {/* 3 Status Cards */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl">
                  <span className="text-[10px] font-bold text-emerald-800 uppercase block">Active</span>
                  <span className="text-base font-bold text-emerald-700">{sharing.active_sharing_links}</span>
                </div>
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl">
                  <span className="text-[10px] font-bold text-amber-800 uppercase block">Expired</span>
                  <span className="text-base font-bold text-amber-700">{sharing.expired_sharing_links}</span>
                </div>
                <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-xl">
                  <span className="text-[10px] font-bold text-rose-800 uppercase block">Revoked</span>
                  <span className="text-base font-bold text-rose-700">{sharing.revoked_sharing_links}</span>
                </div>
              </div>

              {/* Permission Distribution */}
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between text-xs">
                <span className="text-slate-600">Permissions breakdown:</span>
                <div className="flex items-center gap-3 font-semibold">
                  <span className="text-blue-700">{sharing.permission_distribution.download || 0} Download Allowed</span>
                  <span>•</span>
                  <span className="text-purple-700">{sharing.permission_distribution.view || 0} View Only</span>
                </div>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 text-center border-t border-slate-100 pt-2">
            Security governance of shared link lifecycles and download permissions.
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* USER-WISE STORAGE USAGE TABLE */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600" />
              <span>User-Wise Storage Usage</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Calculates how much storage each user occupies (User, Files Uploaded, Storage Used)
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-xl">
            {user_storage.length} Users Tracked
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-100">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3 text-right">Files Uploaded</th>
                <th className="px-4 py-3 text-right">Storage Used</th>
                <th className="px-4 py-3 text-right">% of System Storage</th>
                <th className="px-4 py-3">Storage Allocation Gauge</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {user_storage.map((u, idx) => (
                <tr key={idx} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-bold text-slate-900 flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs uppercase">
                      {u.username.slice(0, 2)}
                    </div>
                    <div>
                      <span>{u.username}</span>
                      <p className="text-[10px] text-slate-400 font-normal">{u.full_name || "User"}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 font-mono text-[11px]">{u.email}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">{u.files_uploaded}</td>
                  <td className="px-4 py-3 text-right font-bold text-blue-700 font-mono">
                    {u.storage_used_formatted}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700">{u.storage_percentage}%</td>
                  <td className="px-4 py-3 w-48">
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 rounded-full"
                        style={{ width: `${Math.min(u.storage_percentage, 100)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Most Frequently Downloaded Files */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Download className="h-4 w-4 text-emerald-600" />
              <span>Most Frequently Downloaded Files</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Ranked list of documents with highest access telemetry
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-100">
              <tr>
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">File Name</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">File Size</th>
                <th className="px-4 py-3 text-right">Download Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {files.most_frequently_downloaded.map((f, i) => (
                <tr key={i} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-bold text-slate-400">#{i + 1}</td>
                  <td className="px-4 py-3 font-bold text-slate-900">{f.file_name}</td>
                  <td className="px-4 py-3 text-slate-600">{f.owner_username || "Unknown"}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-semibold uppercase">
                      {f.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-600">{f.file_size_formatted}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg font-bold">
                      {f.download_count} downloads
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

