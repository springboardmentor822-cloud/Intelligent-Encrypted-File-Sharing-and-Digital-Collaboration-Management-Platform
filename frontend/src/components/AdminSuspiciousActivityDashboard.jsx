"use client";

import React, { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Users,
  Calendar,
  Filter,
  RefreshCw,
  Search,
  Lock,
  Clock,
  Eye,
  ChevronDown
} from "lucide-react";

export default function AdminSuspiciousActivityDashboard({ showToast }) {
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [summary, setSummary] = useState(null);
  const [events, setEvents] = useState([]);

  // Filters
  const [searchUser, setSearchUser] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedSeverity, setSelectedSeverity] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [datePreset, setDatePreset] = useState("all"); // 'all', 'today', '7days', '30days', 'custom'
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const fetchSecurityData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();

    const now = new Date();
    if (datePreset === "today") {
      params.append("start_date", now.toISOString().split("T")[0]);
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
    if (selectedType !== "all") {
      params.append("event_type", selectedType);
    }
    if (selectedSeverity !== "all") {
      params.append("severity", selectedSeverity);
    }
    if (selectedStatus !== "all") {
      params.append("status", selectedStatus);
    }

    params.append("limit", "100");

    try {
      const [sumRes, evRes] = await Promise.all([
        api.get("/security-monitoring/summary"),
        api.get(`/security-monitoring/events?${params.toString()}`)
      ]);
      setSummary(sumRes.data);
      setEvents(evRes.data.events || []);
    } catch (err) {
      console.error("Security monitoring error:", err);
      if (showToast) showToast("Failed to load suspicious activity telemetry", "error");
    } finally {
      setLoading(false);
    }
  }, [datePreset, startDate, endDate, searchUser, selectedType, selectedSeverity, selectedStatus, showToast]);

  useEffect(() => {
    fetchSecurityData();
  }, [fetchSecurityData]);

  // Status update (Investigate, Resolve, Dismiss)
  const handleUpdateStatus = async (eventId, newStatus) => {
    try {
      await api.patch(`/security-monitoring/events/${eventId}/status`, { status: newStatus });
      if (showToast) showToast(`Incident status updated to ${newStatus}`, "success");
      fetchSecurityData();
    } catch (err) {
      console.error("Failed to update status:", err);
      if (showToast) showToast("Status update failed", "error");
    }
  };

  // Trigger manual security scan
  const handleTriggerScan = async () => {
    setScanning(true);
    try {
      const res = await api.post("/security-monitoring/trigger-scan");
      if (showToast) {
        showToast(
          `Security scan complete! Scanned ${res.data.logs_scanned} activities (${res.data.new_events_triggered} new events).`,
          "success"
        );
      }
      fetchSecurityData();
    } catch (err) {
      console.error("Trigger scan error:", err);
      if (showToast) showToast("Scan failed", "error");
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* 1. HEADER & SCAN ACTIONS */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-slate-900">Suspicious Activity Detection</h1>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                    REAL-TIME RULE ENGINE
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Automated threat identification, brute-force monitoring & suspicious download alerts
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleTriggerScan}
              disabled={scanning}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${scanning ? "animate-spin text-purple-600" : ""}`} />
              <span>{scanning ? "Scanning Logs..." : "Trigger Security Scan"}</span>
            </button>

            <button
              onClick={fetchSecurityData}
              disabled={loading}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh Incidents</span>
            </button>
          </div>
        </div>

        {/* Active Detection Rules */}
        <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
            <span className="font-bold text-slate-900 block text-[11px]">1. Failed Logins</span>
            <p className="text-[10px] text-slate-500 mt-0.5">&gt; 3 failed attempts in 10 mins</p>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
            <span className="font-bold text-slate-900 block text-[11px]">2. Unauthorized Access</span>
            <p className="text-[10px] text-slate-500 mt-0.5">Repeated attempts on restricted files</p>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
            <span className="font-bold text-slate-900 block text-[11px]">3. Excessive Downloads</span>
            <p className="text-[10px] text-slate-500 mt-0.5">&gt; 5 downloads within 5 mins</p>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
            <span className="font-bold text-slate-900 block text-[11px]">4. Expired Link Hits</span>
            <p className="text-[10px] text-slate-500 mt-0.5">Repeated attempts on expired links</p>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
            <span className="font-bold text-slate-900 block text-[11px]">5. Revoked Link Hits</span>
            <p className="text-[10px] text-slate-500 mt-0.5">Repeated attempts on revoked links</p>
          </div>
        </div>
      </div>

      {/* Core Security Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Security Events */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs text-center">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Security Events</span>
          <p className="text-base font-bold text-slate-900 mt-1">
            {summary?.total_security_events ?? events.length}
          </p>
        </div>

        {/* Failed Login Attempts */}
        <div className="p-4 bg-white rounded-2xl border border-rose-200 shadow-2xs text-center bg-rose-50/30">
          <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block">Failed Logins</span>
          <p className="text-base font-bold text-rose-700 mt-1">
            {summary?.failed_login_attempts ?? 0}
          </p>
        </div>

        {/* Unauthorized Access Attempts */}
        <div className="p-4 bg-white rounded-2xl border border-amber-200 shadow-2xs text-center bg-amber-50/30">
          <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">Unauthorized Access</span>
          <p className="text-base font-bold text-amber-700 mt-1">
            {summary?.unauthorized_access_attempts ?? 0}
          </p>
        </div>

        {/* Suspicious Downloads */}
        <div className="p-4 bg-white rounded-2xl border border-purple-200 shadow-2xs text-center bg-purple-50/30">
          <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider block">Suspicious Downloads</span>
          <p className="text-base font-bold text-purple-700 mt-1">
            {summary?.suspicious_downloads ?? 0}
          </p>
        </div>

        {/* Expired Link Access */}
        <div className="p-4 bg-white rounded-2xl border border-orange-200 shadow-2xs text-center bg-orange-50/30">
          <span className="text-[10px] font-bold text-orange-700 uppercase tracking-wider block">Expired Link Hits</span>
          <p className="text-base font-bold text-orange-700 mt-1">
            {summary?.expired_link_access_attempts ?? 0}
          </p>
        </div>

        {/* Revoked Link Access */}
        <div className="p-4 bg-white rounded-2xl border border-red-200 shadow-2xs text-center bg-red-50/30">
          <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider block">Revoked Link Hits</span>
          <p className="text-base font-bold text-red-700 mt-1">
            {summary?.revoked_link_access_attempts ?? 0}
          </p>
        </div>
      </div>

      {/* Security Event Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 text-xs font-semibold">
          <span className="flex items-center gap-1.5 text-slate-800 font-bold">
            <Filter className="h-4 w-4 text-rose-600" />
            <span>Filter Security Events</span>
          </span>
          <span className="text-slate-400">{events.length} events matching current criteria</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          {/* User Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1">
              <Users className="h-3 w-3 text-slate-400" />
              <span>User / IP</span>
            </label>
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Username or IP..."
                value={searchUser}
                onChange={(e) => setSearchUser(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-2.5 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-500"
              />
            </div>
          </div>

          {/* Event Type Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1">
              <ShieldAlert className="h-3 w-3 text-slate-400" />
              <span>Event Type</span>
            </label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-500"
            >
              <option value="all">All Event Types</option>
              <option value="failed_logins">Multiple Failed Logins</option>
              <option value="unauthorized_access">Unauthorized File Access</option>
              <option value="excessive_downloads">Excessive Downloads Surge</option>
              <option value="expired_link">Expired Link Access</option>
              <option value="revoked_link">Revoked Link Access</option>
            </select>
          </div>

          {/* Severity Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-slate-400" />
              <span>Severity</span>
            </label>
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-500"
            >
              <option value="all">All Severities</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-slate-400" />
              <span>Incident Status</span>
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-500"
            >
              <option value="all">All Statuses</option>
              <option value="Open">Open</option>
              <option value="Investigating">Investigating</option>
              <option value="Resolved">Resolved</option>
              <option value="Dismissed">Dismissed</option>
            </select>
          </div>

          {/* Date Range Preset */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1">
              <Calendar className="h-3 w-3 text-slate-400" />
              <span>Date Window</span>
            </label>
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-500"
            >
              <option value="all">All Time</option>
              <option value="today">Today Only</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
              <option value="custom">Custom Date Range</option>
            </select>
          </div>
        </div>

        {datePreset === "custom" && (
          <div className="pt-2 flex items-center gap-3 text-xs border-t border-slate-100">
            <span className="text-slate-500 font-medium">Custom Range:</span>
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
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 5. SECURITY INCIDENTS MANAGEMENT TABLE */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-rose-600" />
              <span>Recorded Security Incidents & Threat Events</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Live anomaly alerts generated by the suspicious activity detection engine
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200">
              <tr>
                <th className="py-3 px-3">Rule / Description</th>
                <th className="py-3 px-3">User & IP Address</th>
                <th className="py-3 px-3">Target Resource</th>
                <th className="py-3 px-3">Severity</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Date & Time</th>
                <th className="py-3 px-3 text-right">Investigation Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                    <p className="font-semibold text-slate-700 text-sm">No suspicious events recorded</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      No matching brute-force attempts, unauthorized access, or download surges found.
                    </p>
                  </td>
                </tr>
              ) : (
                events.map((ev) => (
                  <tr key={ev.event_id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-3 max-w-xs">
                      <span className="font-bold text-slate-900 block truncate">{ev.rule_name}</span>
                      <p className="text-[11px] text-slate-500 line-clamp-1">{ev.description}</p>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-semibold text-slate-800">{ev.username}</span>
                      <code className="text-[10px] text-slate-400 block font-mono">{ev.ip_address}</code>
                    </td>
                    <td className="py-3 px-3 text-slate-600 truncate max-w-[140px]">
                      {ev.resource_name || ev.resource_id || "-"}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          ev.severity === "Critical"
                            ? "bg-rose-600 text-white"
                            : ev.severity === "High"
                            ? "bg-rose-100 text-rose-800 border border-rose-200"
                            : ev.severity === "Medium"
                            ? "bg-amber-100 text-amber-800 border border-amber-200"
                            : "bg-blue-100 text-blue-800 border border-blue-200"
                        }`}
                      >
                        {ev.severity}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          ev.status === "Open"
                            ? "bg-red-50 text-red-700 border border-red-200"
                            : ev.status === "Investigating"
                            ? "bg-purple-50 text-purple-700 border border-purple-200"
                            : ev.status === "Resolved"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {ev.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-500 whitespace-nowrap text-[11px]">
                      {new Date(ev.date_and_time).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {ev.status === "Open" && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(ev.event_id, "Investigating")}
                            className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-[10px] font-semibold transition cursor-pointer border border-purple-200"
                          >
                            Investigate
                          </button>
                        )}
                        {ev.status !== "Resolved" && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(ev.event_id, "Resolved")}
                            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-semibold transition cursor-pointer border border-emerald-200"
                          >
                            Resolve
                          </button>
                        )}
                        {ev.status !== "Dismissed" && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(ev.event_id, "Dismissed")}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-semibold transition cursor-pointer"
                          >
                            Dismiss
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

