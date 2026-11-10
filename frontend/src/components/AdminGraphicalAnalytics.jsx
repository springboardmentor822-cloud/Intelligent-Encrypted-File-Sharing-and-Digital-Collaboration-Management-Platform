"use client";

import React, { useState, useId, useEffect, useRef } from "react";
import {
  TrendingUp,
  PieChart as PieChartIcon,
  BarChart3,
  ShieldAlert,
  ShieldCheck,
  HardDrive,
  Users,
  Activity,
  Layers,
  Calendar,
  Lock,
  ArrowUpRight,
  Info,
  Trash2,
  ChevronDown,
  Check,
  X
} from "lucide-react";

export default function AdminGraphicalAnalytics({
  adminAnalytics,
  formatBytes,
  onCleanAdminStorage,
  isCleaningStorage = false,
  onRangeChange
}) {
  const chartId = useId();
  const [activeMetric, setActiveMetric] = useState("total_events"); // 'total_events' | 'file_events' | 'success_logins' | 'failed_logins'
  const [hoveredDay, setHoveredDay] = useState(null);
  const [hoveredCategory, setHoveredCategory] = useState(null);

  const [activeDays, setActiveDays] = useState(adminAnalytics?.days || 7);
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
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

  const handlePresetSelect = (presetDays) => {
    setActiveDays(presetDays);
    setCustomStartDate("");
    setCustomEndDate("");
    setIsDatePickerOpen(false);
    if (onRangeChange) {
      onRangeChange({ days: presetDays, startDate: "", endDate: "" });
    }
  };

  const handleApplyCustomRange = () => {
    if (!customStartDate || !customEndDate) return;
    setIsDatePickerOpen(false);
    if (onRangeChange) {
      onRangeChange({ startDate: customStartDate, endDate: customEndDate });
    }
  };

  if (!adminAnalytics) return null;

  const timeline = adminAnalytics.activity_timeline || [];
  const categories = adminAnalytics.storage?.categories || {};
  // Exclude admin accounts from storage consumers list
  const topConsumers = (adminAnalytics.top_consumers || []).filter(
    (c) => c.username !== "admin" && c.username !== "tester_role"
  );
  const totalStorageBytes = adminAnalytics.storage?.total_bytes || 0;
  const totalFiles = adminAnalytics.storage?.total_files || 0;
  const failedLogins = adminAnalytics.security_alerts?.failed_logins_count || 0;
  const totalLogins = timeline.reduce(
    (acc, d) => acc + (d.success_logins || 0) + (d.failed_logins || 0),
    0
  );
  const securityHealthScore =
    totalLogins > 0
      ? Math.max(0, Math.round(((totalLogins - failedLogins) / Math.max(totalLogins, 1)) * 100))
      : 100;

  // -------------------------------------------------------------
  // Chart 1: 7-Day Activity Trend Calculations (Smooth Bezier SVG)
  // -------------------------------------------------------------
  const chartWidth = 620;
  const chartHeight = 220;
  const paddingX = 45;
  const paddingY = 35;
  const usableWidth = chartWidth - paddingX * 2;
  const usableHeight = chartHeight - paddingY * 2;

  const metricConfig = {
    total_events: {
      label: "Total Telemetry Events",
      color: "#6366F1", // Indigo
      gradientStart: "rgba(99, 102, 241, 0.4)",
      gradientEnd: "rgba(99, 102, 241, 0.02)",
      stroke: "#4F46E5",
      badgeBg: "bg-indigo-50 text-indigo-700 border-indigo-200"
    },
    file_events: {
      label: "File Operations",
      color: "#10B981", // Emerald
      gradientStart: "rgba(16, 185, 129, 0.4)",
      gradientEnd: "rgba(16, 185, 129, 0.02)",
      stroke: "#059669",
      badgeBg: "bg-emerald-50 text-emerald-700 border-emerald-200"
    },
    success_logins: {
      label: "User Authentications",
      color: "#3B82F6", // Blue
      gradientStart: "rgba(59, 130, 246, 0.4)",
      gradientEnd: "rgba(59, 130, 246, 0.02)",
      stroke: "#2563EB",
      badgeBg: "bg-blue-50 text-blue-700 border-blue-200"
    },
    failed_logins: {
      label: "Failed Logins & Alerts",
      color: "#F43F5E", // Rose
      gradientStart: "rgba(244, 63, 94, 0.45)",
      gradientEnd: "rgba(244, 63, 94, 0.02)",
      stroke: "#E11D48",
      badgeBg: "bg-rose-50 text-rose-700 border-rose-200"
    }
  };

  const currentCfg = metricConfig[activeMetric];

  // Extract values and determine scale
  const rawValues = timeline.map((d) => d[activeMetric] || 0);
  const maxVal = Math.max(...rawValues, 5); // Minimum scale of 5 for clear visualization

  const stepX = timeline.length > 1 ? usableWidth / (timeline.length - 1) : usableWidth;

  const points = timeline.map((d, i) => {
    const val = d[activeMetric] || 0;
    const x = paddingX + i * stepX;
    const y = paddingY + usableHeight - (val / maxVal) * usableHeight;
    return { x, y, val, label: d.label, date: d.date, rawData: d };
  });

  // Generate smooth cubic Bezier path
  const generateBezierPath = (pts) => {
    if (pts.length === 0) return "";
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;

    let path = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = i > 0 ? pts[i - 1] : pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = i < pts.length - 2 ? pts[i + 2] : p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return path;
  };

  const linePath = generateBezierPath(points);
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x} ${chartHeight - paddingY} L ${points[0].x} ${chartHeight - paddingY} Z`
      : "";

  // -------------------------------------------------------------
  // Chart 2: Category Storage Donut Chart Calculations
  // -------------------------------------------------------------
  const categoryPalette = {
    document: { color: "#3B82F6", label: "Documents", bg: "bg-blue-500" },
    image: { color: "#A855F7", label: "Images", bg: "bg-purple-500" },
    spreadsheet: { color: "#10B981", label: "Sheets", bg: "bg-emerald-500" },
    archive: { color: "#F59E0B", label: "Archives", bg: "bg-amber-500" },
    code: { color: "#06B6D4", label: "Code", bg: "bg-cyan-500" },
    other: { color: "#64748B", label: "Other", bg: "bg-slate-500" }
  };

  const catEntries = Object.entries(categories).map(([k, v]) => ({
    key: k,
    count: v.count || 0,
    size: v.total_size || 0,
    config: categoryPalette[k] || { color: "#94A3B8", label: k, bg: "bg-slate-400" }
  }));

  const totalCatBytes = catEntries.reduce((acc, c) => acc + c.size, 0) || 1;

  // Donut SVG parameters
  const donutRadius = 68;
  const donutCircumference = 2 * Math.PI * donutRadius; // ≈ 427.25

  let accumulatedPercent = 0;
  const donutSlices = catEntries.map((c) => {
    const percent = c.size / totalCatBytes;
    const strokeDash = percent * donutCircumference;
    const strokeOffset = -(accumulatedPercent * donutCircumference);
    accumulatedPercent += percent;
    return {
      ...c,
      percent: Math.round(percent * 100),
      strokeDash: `${Math.max(strokeDash, 2)} ${donutCircumference}`,
      strokeOffset
    };
  });

  return (
    <div className="space-y-6">
      {/* ========================================================= */}
      {/* TOP SECTION: INTERACTIVE ACTIVITY & SECURITY TREND */}
      {/* ========================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Platform Telemetry & Activity Curve
                </h3>
                <p className="text-xs text-slate-500">
                  Chronological telemetry stream of document operations & authentication traffic
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Metric Selector Pills */}
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setActiveMetric("total_events")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  activeMetric === "total_events"
                    ? "bg-white text-indigo-700 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                All Events
              </button>
              <button
                type="button"
                onClick={() => setActiveMetric("file_events")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  activeMetric === "file_events"
                    ? "bg-white text-emerald-700 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Files
              </button>
              <button
                type="button"
                onClick={() => setActiveMetric("success_logins")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  activeMetric === "success_logins"
                    ? "bg-white text-blue-700 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Logins
              </button>
              <button
                type="button"
                onClick={() => setActiveMetric("failed_logins")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  activeMetric === "failed_logins"
                    ? "bg-white text-rose-700 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Alerts ({failedLogins})
              </button>
            </div>

            {/* Date Range Selector Popover */}
            <div className="relative" ref={datePickerRef}>
              <button
                type="button"
                onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
              >
                <Calendar className="h-3.5 w-3.5 text-indigo-600" />
                <span>{adminAnalytics.date_range || `${activeDays} Days`}</span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>

              {isDatePickerOpen && (
                <div className="absolute right-0 top-full mt-2 w-76 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 p-4 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">Select Range</span>
                    <button
                      type="button"
                      onClick={() => setIsDatePickerOpen(false)}
                      className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

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
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold text-left transition flex items-center justify-between cursor-pointer ${
                          activeDays === preset.days && !customStartDate
                            ? "bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold"
                            : "text-slate-600 hover:bg-slate-50 border border-transparent"
                        }`}
                      >
                        <span>{preset.label}</span>
                        {activeDays === preset.days && !customStartDate && (
                          <Check className="h-3 w-3 text-indigo-600" />
                        )}
                      </button>
                    ))}
                  </div>

                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    <span className="text-[11px] font-bold text-slate-800 block">Custom Range</span>
                    <div className="space-y-1.5">
                      <div>
                        <label className="text-[10px] text-slate-500 font-medium block mb-0.5">Start Date</label>
                        <input
                          type="date"
                          value={customStartDate}
                          onChange={(e) => setCustomStartDate(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 font-medium block mb-0.5">End Date</label>
                        <input
                          type="date"
                          value={customEndDate}
                          onChange={(e) => setCustomEndDate(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!customStartDate || !customEndDate}
                      onClick={handleApplyCustomRange}
                      className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold rounded-xl transition shadow-xs cursor-pointer"
                    >
                      Apply Range
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SVG Curve Chart */}
        <div className="relative pt-4">
          <div className="w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-56 select-none"
              style={{ overflow: "visible" }}
            >
              <defs>
                <linearGradient id={`grad-${chartId}-${activeMetric}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={currentCfg.gradientStart} />
                  <stop offset="100%" stopColor={currentCfg.gradientEnd} />
                </linearGradient>
                <filter id={`shadow-${chartId}`} x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor={currentCfg.stroke} floodOpacity="0.25" />
                </filter>
              </defs>

              {/* Horizontal Gridlines */}
              {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
                const yPos = paddingY + usableHeight - pct * usableHeight;
                const valueLabel = Math.round(pct * maxVal);
                return (
                  <g key={idx}>
                    <line
                      x1={paddingX}
                      y1={yPos}
                      x2={chartWidth - paddingX}
                      y2={yPos}
                      stroke="#F1F5F9"
                      strokeWidth="1.2"
                      strokeDasharray={pct === 0 ? "none" : "4 4"}
                    />
                    <text
                      x={paddingX - 10}
                      y={yPos + 3.5}
                      textAnchor="end"
                      fontSize="10"
                      fill="#94A3B8"
                      className="font-mono"
                    >
                      {valueLabel}
                    </text>
                  </g>
                );
              })}

              {/* Area Gradient Fill */}
              {areaPath && (
                <path
                  d={areaPath}
                  fill={`url(#grad-${chartId}-${activeMetric})`}
                  className="transition-all duration-500 ease-out"
                />
              )}

              {/* Main Bezier Line */}
              {linePath && (
                <path
                  d={linePath}
                  fill="none"
                  stroke={currentCfg.stroke}
                  strokeWidth="3"
                  strokeLinecap="round"
                  filter={`url(#shadow-${chartId})`}
                  className="transition-all duration-500 ease-out"
                />
              )}

              {/* Interactive Day Points & Vertical Guide Bars */}
              {points.map((pt, idx) => {
                const isHovered = hoveredDay === idx;
                return (
                  <g key={idx} className="cursor-pointer" onMouseEnter={() => setHoveredDay(idx)} onMouseLeave={() => setHoveredDay(null)}>
                    {/* Vertical guideline on hover */}
                    {isHovered && (
                      <line
                        x1={pt.x}
                        y1={paddingY}
                        x2={pt.x}
                        y2={chartHeight - paddingY}
                        stroke={currentCfg.stroke}
                        strokeWidth="1.5"
                        strokeDasharray="3 3"
                        opacity="0.6"
                      />
                    )}

                    {/* Outer pulse circle when hovered */}
                    {isHovered && (
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r="9"
                        fill={currentCfg.stroke}
                        opacity="0.2"
                        className="animate-ping"
                      />
                    )}

                    {/* Point Circle */}
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isHovered ? "6" : "4.5"}
                      fill="#FFFFFF"
                      stroke={currentCfg.stroke}
                      strokeWidth={isHovered ? "3.5" : "2.5"}
                      className="transition-all duration-150"
                    />

                    {/* Day X-Axis Label */}
                    <text
                      x={pt.x}
                      y={chartHeight - 12}
                      textAnchor="middle"
                      fontSize="11"
                      fill={isHovered ? currentCfg.stroke : "#64748B"}
                      fontWeight={isHovered ? "bold" : "normal"}
                      className="font-sans select-none"
                    >
                      {pt.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Floating Hover Tooltip */}
          {hoveredDay !== null && points[hoveredDay] && (
            <div
              className="absolute pointer-events-none z-20 bg-slate-900 text-white rounded-xl px-3.5 py-2 shadow-xl border border-slate-700 text-xs space-y-1 transform -translate-x-1/2 -translate-y-full transition-all duration-100"
              style={{
                left: `${(points[hoveredDay].x / chartWidth) * 100}%`,
                top: `${(points[hoveredDay].y / chartHeight) * 100}%`,
                marginTop: "-14px"
              }}
            >
              <div className="flex items-center justify-between gap-3 text-[10px] text-slate-400 border-b border-slate-800 pb-1">
                <span>{points[hoveredDay].date}</span>
                <span className="font-semibold text-slate-300">{points[hoveredDay].label}</span>
              </div>
              <div className="flex items-center justify-between gap-4 pt-0.5">
                <span className="text-slate-300 font-medium">{currentCfg.label}:</span>
                <span className="font-bold text-white font-mono text-sm">
                  {points[hoveredDay].val}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400 pt-1">
                <span>Files: {points[hoveredDay].rawData.file_events || 0}</span>
                <span>Logins: {points[hoveredDay].rawData.success_logins || 0}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* MIDDLE SECTION: 2 COLUMN GRAPHICAL METRIC VISUALIZATIONS  */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CHART 2: CATEGORY STORAGE DONUT & PROPORTION BAR */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                <PieChartIcon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Storage Allocation by Format
                </h3>
                <p className="text-xs text-slate-500">
                  Encrypted byte distribution across document categories
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
              {totalFiles} Total Files
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6 py-2">
            {/* SVG Donut Visual */}
            <div className="relative shrink-0 flex items-center justify-center">
              <svg width="180" height="180" viewBox="0 0 180 180" className="rotate-[-90deg]">
                {/* Background Ring */}
                <circle
                  cx="90"
                  cy="90"
                  r={donutRadius}
                  fill="transparent"
                  stroke="#F1F5F9"
                  strokeWidth="20"
                />

                {/* Slices */}
                {donutSlices.map((slice, i) => (
                  <circle
                    key={i}
                    cx="90"
                    cy="90"
                    r={donutRadius}
                    fill="transparent"
                    stroke={slice.config.color}
                    strokeWidth={hoveredCategory === slice.key ? "24" : "20"}
                    strokeDasharray={slice.strokeDash}
                    strokeDashoffset={slice.strokeOffset}
                    className="transition-all duration-300 cursor-pointer"
                    onMouseEnter={() => setHoveredCategory(slice.key)}
                    onMouseLeave={() => setHoveredCategory(null)}
                  />
                ))}
              </svg>

              {/* Center Metrics Label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Vault Size
                </span>
                <span className="text-base font-extrabold text-slate-900 font-mono">
                  {formatBytes(totalStorageBytes)}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">
                  {catEntries.length} Types
                </span>
              </div>
            </div>

            {/* Category Proportion Meters */}
            <div className="flex-1 w-full space-y-2.5">
              {catEntries.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">
                  No files uploaded to catalog yet.
                </p>
              ) : (
                catEntries.map((cat) => {
                  const percent = Math.round((cat.size / totalCatBytes) * 100) || 0;
                  const isHovered = hoveredCategory === cat.key;
                  return (
                    <div
                      key={cat.key}
                      onMouseEnter={() => setHoveredCategory(cat.key)}
                      onMouseLeave={() => setHoveredCategory(null)}
                      className={`p-2 rounded-xl transition cursor-pointer ${
                        isHovered ? "bg-slate-50 ring-1 ring-slate-200" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: cat.config.color }}
                          />
                          <span className="font-semibold text-slate-800 capitalize">
                            {cat.config.label}
                          </span>
                          <span className="text-[11px] text-slate-400">({cat.count})</span>
                        </div>
                        <div className="flex items-center gap-2 font-mono">
                          <span className="text-slate-500 text-[11px]">{formatBytes(cat.size)}</span>
                          <span className="font-bold text-slate-800 text-xs min-w-[32px] text-right">
                            {percent}%
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-1.5 rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.max(percent, 2)}%`,
                            backgroundColor: cat.config.color
                          }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* CHART 3: TOP STORAGE CONSUMERS (HORIZONTAL BAR CHART) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Storage Consumption by Account
                </h3>
                <p className="text-xs text-slate-500">
                  Ranked storage utilization across registered workspace users
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                500 MB Cap / User
              </span>
              {onCleanAdminStorage && (
                <button
                  type="button"
                  onClick={onCleanAdminStorage}
                  disabled={isCleaningStorage}
                  className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  title="Purge any orphaned or administrative test files from storage"
                >
                  <Trash2 className="h-3 w-3 text-rose-600" />
                  <span>{isCleaningStorage ? "Purging..." : "Clean Admin Storage"}</span>
                </button>
              )}
            </div>
          </div>

          <div className="space-y-3.5 py-1">
            {topConsumers.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">
                No user storage consumption records recorded yet.
              </p>
            ) : (
              topConsumers.map((consumer, idx) => {
                const quotaBytes = 500 * 1024 * 1024;
                const userPercent = Math.min(
                  Math.round((consumer.storage_bytes / quotaBytes) * 100),
                  100
                );
                return (
                  <div key={consumer._id || idx} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="h-5 w-5 rounded-md bg-slate-100 text-slate-700 font-bold text-[10px] flex items-center justify-center">
                          #{idx + 1}
                        </span>
                        <span className="font-semibold text-slate-800">
                          {consumer.username || "User"}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {consumer.file_count} files
                        </span>
                      </div>
                      <div className="flex items-center gap-2 font-mono">
                        <span className="text-slate-600 font-semibold">
                          {formatBytes(consumer.storage_bytes)}
                        </span>
                        <span className="text-slate-400 text-[10px]">({userPercent}%)</span>
                      </div>
                    </div>
                    {/* Visual Bar */}
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${
                          userPercent > 80
                            ? "bg-rose-500"
                            : userPercent > 50
                            ? "bg-amber-500"
                            : "bg-indigo-600"
                        }`}
                        style={{ width: `${Math.max(userPercent, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Authentication Security Ratio Footnote */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-slate-500">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span>Authentication Health Index:</span>
            </div>
            <span
              className={`font-bold font-mono px-2 py-0.5 rounded-md ${
                securityHealthScore >= 95
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-rose-50 text-rose-700 border border-rose-200"
              }`}
            >
              {securityHealthScore}% Safe Access
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
