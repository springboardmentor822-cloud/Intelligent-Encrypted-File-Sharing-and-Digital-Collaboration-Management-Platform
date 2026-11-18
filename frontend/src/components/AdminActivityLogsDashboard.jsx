"use client";

import React, { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import {
  Activity,
  Search,
  Filter,
  RefreshCw,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  UploadCloud,
  Download,
  Share2,
  LogIn,
  LogOut,
  ShieldAlert,
  Key,
  Clock,
  User as UserIcon,
  ChevronLeft,
  ChevronRight,
  ExternalLink
} from "lucide-react";

export default function AdminActivityLogsDashboard({ showToast }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [activities, setActivities] = useState([]);
  const [totalActivities, setTotalActivities] = useState(0);

  // Activity Filters
  const [search, setSearch] = useState("");
  const [activityType, setActivityType] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [datePreset, setDatePreset] = useState("30days"); // 'today', '7days', '30days', 'all'
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Selected Activity Detail Modal
  const [selectedActivity, setSelectedActivity] = useState(null);

  // Fetch summary statistics
  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get("/activity-monitoring/stats");
      setStats(res.data);
    } catch (err) {
      console.error("Failed to load activity monitoring stats:", err);
    }
  }, []);

  // Fetch paginated & filtered activity list
  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("page", page.toString());
      params.append("page_size", pageSize.toString());

      if (search.trim()) params.append("search", search.trim());
      if (activityType !== "all") params.append("activity_type", activityType);
      if (statusFilter !== "all") params.append("status", statusFilter);

      const now = new Date();
      if (datePreset === "today") {
        params.append("start_date", now.toISOString().split("T")[0]);
      } else if (datePreset === "7days") {
        const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        params.append("start_date", past7.toISOString().split("T")[0]);
      } else if (datePreset === "30days") {
        const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        params.append("start_date", past30.toISOString().split("T")[0]);
      }

      const res = await api.get(`/activity-monitoring/activities?${params.toString()}`);
      setActivities(res.data.activities || []);
      setTotalActivities(res.data.total || 0);
    } catch (err) {
      console.error("Failed to load activities:", err);
      if (showToast) showToast("Failed to fetch activity records.", "error");
    } finally {
      setLoading(false);
    }
  }, [page, search, activityType, statusFilter, datePreset, showToast]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  const handleRefresh = () => {
    fetchStats();
    fetchActivities();
    if (showToast) showToast("Activity logs refreshed", "success");
  };

  const getActivityBadge = (type) => {
    switch (type?.toLowerCase()) {
      case "login":
        return {
          icon: <LogIn className="h-3 w-3 text-blue-600" />,
          bg: "bg-blue-50 text-blue-700 border-blue-200",
          label: "Login"
        };
      case "logout":
        return {
          icon: <LogOut className="h-3 w-3 text-slate-600" />,
          bg: "bg-slate-50 text-slate-700 border-slate-200",
          label: "Logout"
        };
      case "upload":
        return {
          icon: <UploadCloud className="h-3 w-3 text-emerald-600" />,
          bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
          label: "Upload"
        };
      case "download":
        return {
          icon: <Download className="h-3 w-3 text-cyan-600" />,
          bg: "bg-cyan-50 text-cyan-700 border-cyan-200",
          label: "Download"
        };
      case "share_create":
      case "share":
        return {
          icon: <Share2 className="h-3 w-3 text-purple-600" />,
          bg: "bg-purple-50 text-purple-700 border-purple-200",
          label: "Share Create"
        };
      case "share_revoke":
        return {
          icon: <Share2 className="h-3 w-3 text-amber-600" />,
          bg: "bg-amber-50 text-amber-700 border-amber-200",
          label: "Share Revoke"
        };
      case "unauthorized_access":
        return {
          icon: <ShieldAlert className="h-3 w-3 text-rose-600" />,
          bg: "bg-rose-50 text-rose-700 border-rose-200",
          label: "Unauthorized"
        };
      case "password_change":
      case "password_update":
        return {
          icon: <Key className="h-3 w-3 text-indigo-600" />,
          bg: "bg-indigo-50 text-indigo-700 border-indigo-200",
          label: "Password"
        };
      default:
        return {
          icon: <Activity className="h-3 w-3 text-slate-600" />,
          bg: "bg-slate-50 text-slate-700 border-slate-200",
          label: type || "General"
        };
    }
  };

  const totalPages = Math.ceil(totalActivities / pageSize) || 1;

  return (
    <div className="p-6 md:p-8 space-y-6 flex-1 overflow-y-auto bg-slate-50 min-h-screen">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-cyan-600 text-white rounded-xl shadow-sm">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Activity Logs
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time activity monitoring stream tracking user interactions, file operations, authentication, and security events
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-xs rounded-xl shadow-2xs transition cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-cyan-600" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Total Monitored Activities
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-base font-bold text-slate-900">
              {stats?.total_activities ?? totalActivities}
            </span>
            <span className="text-[11px] text-slate-500 font-medium">events recorded</span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Successful Operations
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-base font-bold text-emerald-600">
              {stats?.successful_activities ?? 0}
            </span>
            <span className="text-[11px] text-emerald-600/80 font-medium">processed</span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Failed / Blocked Events
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-base font-bold text-rose-600">
              {stats?.failed_activities ?? 0}
            </span>
            <span className="text-[11px] text-rose-600/80 font-medium">anomalies</span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Target Operation Breakdown
            </span>
            <span className="text-[9px] text-slate-400 font-normal">Event Categories</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium text-[11px] flex items-center gap-1">
              <span>🔑</span>
              <span>Logins:</span>
              <strong className="font-bold text-slate-900">{stats?.activities_by_type?.login || 0}</strong>
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium text-[11px] flex items-center gap-1">
              <span>📤</span>
              <span>Uploads:</span>
              <strong className="font-bold text-slate-900">{stats?.activities_by_type?.upload || 0}</strong>
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium text-[11px] flex items-center gap-1">
              <span>📥</span>
              <span>Downloads:</span>
              <strong className="font-bold text-slate-900">{stats?.activities_by_type?.download || 0}</strong>
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium text-[11px] flex items-center gap-1">
              <span>🔗</span>
              <span>Shares:</span>
              <strong className="font-bold text-slate-900">{stats?.activities_by_type?.share_create || 0}</strong>
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
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by username, action, filename, or IP..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition"
            />
          </div>

          {/* Granular Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Activity Type Dropdown */}
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={activityType}
                onChange={(e) => {
                  setActivityType(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer"
              >
                <option value="all">All Activity Types</option>
                <option value="login">Login Events</option>
                <option value="logout">Logout Events</option>
                <option value="upload">File Uploads</option>
                <option value="download">File Downloads</option>
                <option value="share_create">Sharing Created</option>
                <option value="share_revoke">Sharing Revoked</option>
                <option value="unauthorized_access">Unauthorized Access</option>
                <option value="password_update">Password Changes</option>
              </select>
            </div>

            {/* Status Dropdown */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="successful">Successful Only</option>
              <option value="failed">Failed / Blocked Only</option>
            </select>

            {/* Date Range Preset */}
            <select
              value={datePreset}
              onChange={(e) => {
                setDatePreset(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer"
            >
              <option value="today">Today</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
              <option value="all">All Time</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Activity Stream Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-cyan-600" />
            <h2 className="text-sm font-bold text-slate-900">
              Live Activity Stream ({totalActivities} Total)
            </h2>
          </div>
          <span className="text-[11px] text-slate-400">
            Page {page} of {totalPages}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Activity Type</th>
                <th className="py-3 px-4">Resource / File</th>
                <th className="py-3 px-4">Client IP</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-slate-400">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-cyan-600" />
                    <span>Loading real-time activity stream...</span>
                  </td>
                </tr>
              ) : activities.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-slate-400">
                    <Activity className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600">No activity records match your criteria.</p>
                    <p className="text-xs text-slate-400 mt-1">Try resetting search filters or time range.</p>
                  </td>
                </tr>
              ) : (
                activities.map((act) => {
                  const badge = getActivityBadge(act.activity_type);
                  const isSuccess =
                    act.status?.toLowerCase() === "successful" ||
                    act.status?.toLowerCase() === "success";

                  return (
                    <tr key={act.activity_id} className="hover:bg-slate-50/70 transition">
                      {/* Date & Time */}
                      <td className="py-3.5 px-4 font-mono text-slate-700 whitespace-nowrap">
                        {act.timestamp
                          ? new Date(act.timestamp).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                              hour12: false
                            })
                          : "N/A"}
                      </td>

                      {/* User */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-[10px]">
                            {act.username ? act.username.slice(0, 2).toUpperCase() : "U"}
                          </div>
                          <div>
                            <span className="font-semibold text-slate-900 block">
                              {act.username || "System / Guest"}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              UID: {act.user_id || "N/A"}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Activity Type */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${badge.bg}`}
                        >
                          {badge.icon}
                          <span>{badge.label}</span>
                        </span>
                      </td>

                      {/* Resource / File */}
                      <td className="py-3.5 px-4 max-w-[200px] truncate">
                        {act.file_name ? (
                          <div className="flex items-center gap-1.5" title={act.file_name}>
                            <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="font-medium text-slate-800 truncate">
                              {act.file_name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs italic">N/A</span>
                        )}
                      </td>

                      {/* Client IP Address */}
                      <td className="py-3.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                        {act.ip_address || "127.0.0.1"}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {isSuccess ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-bold text-[11px] bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>Successful</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-600 font-bold text-[11px] bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                            <XCircle className="h-3 w-3" />
                            <span>Failed</span>
                          </span>
                        )}
                      </td>

                      {/* Details View */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => setSelectedActivity(act)}
                          className="px-2.5 py-1 text-cyan-600 hover:text-cyan-800 hover:bg-cyan-50 rounded-lg font-semibold text-xs transition cursor-pointer"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Showing {activities.length} of {totalActivities} records
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-semibold text-slate-700 px-2">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Activity Details Modal */}
      {selectedActivity && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-cyan-600" />
                <h3 className="font-bold text-sm text-slate-900">Activity Telemetry Detail</h3>
              </div>
              <button
                onClick={() => setSelectedActivity(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs text-slate-700">
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200/70">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Activity ID</span>
                  <p className="font-mono text-slate-800">{selectedActivity.activity_id}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Timestamp</span>
                  <p className="text-slate-800">{new Date(selectedActivity.timestamp).toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">User</span>
                  <p className="font-semibold text-slate-900">
                    {selectedActivity.username} (ID: {selectedActivity.user_id})
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Status</span>
                  <p className="font-semibold">
                    {selectedActivity.status?.toUpperCase()}
                  </p>
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Client Details</span>
                <p className="text-slate-800 mt-0.5">IP Address: {selectedActivity.ip_address}</p>
                <p className="text-slate-500 text-[11px] mt-0.5 break-all">
                  Device: {selectedActivity.device_info || "Standard Browser"}
                </p>
              </div>

              {selectedActivity.file_name && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Target Resource</span>
                  <p className="text-slate-800 font-semibold">{selectedActivity.file_name}</p>
                  <p className="text-slate-500 font-mono text-[10px]">ID: {selectedActivity.file_id}</p>
                </div>
              )}

              {selectedActivity.details && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Additional Payload Metadata</span>
                  <pre className="mt-1 p-2.5 bg-slate-900 text-slate-100 rounded-xl font-mono text-[11px] overflow-x-auto">
                    {JSON.stringify(selectedActivity.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedActivity(null)}
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

