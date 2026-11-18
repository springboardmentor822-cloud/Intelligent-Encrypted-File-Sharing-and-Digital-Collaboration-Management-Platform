"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import AdminGraphicalAnalytics from "@/components/AdminGraphicalAnalytics";
import UserFileAnalytics from "@/components/UserFileAnalytics";
import AdminSecurityDashboard from "@/components/AdminSecurityDashboard";
import AdminSystemMonitoring from "@/components/AdminSystemMonitoring";
import AdminReportsDashboard from "@/components/AdminReportsDashboard";
import AdminStorageAnalyticsDashboard from "@/components/AdminStorageAnalyticsDashboard";
import AdminSuspiciousActivityDashboard from "@/components/AdminSuspiciousActivityDashboard";
import AdminActivityLogsDashboard from "@/components/AdminActivityLogsDashboard";
import AdminAuditLogsDashboard from "@/components/AdminAuditLogsDashboard";
import UserSecuritySection from "@/components/UserSecuritySection";
import UserSettingsSection from "@/components/UserSettingsSection";
import {
  FileCheck,
  ShieldCheck,
  Shield,
  Search,
  UploadCloud,
  FileText,
  Clock,
  Trash2,
  Share2,
  HardDrive,
  LogOut,
  Bell,
  MoreVertical,
  Download,
  Lock,
  Unlock,
  Plus,
  User,
  Folder,
  FolderPlus,
  FolderArchive,
  Grid,
  List,
  Star,
  Check,
  Copy,
  X,
  Eye,
  EyeOff,
  RefreshCw,
  Activity,
  Database,
  Server,
  KeyRound,
  Users,
  ChevronRight,
  AlertTriangle,
  FileSpreadsheet,
  FileCode,
  Image as ImageIcon,
  Archive,
  ArrowUpRight,
  ShieldAlert,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Sparkles,
  Settings as SettingsIcon,
  BarChart3,
  Calendar,
  ChevronDown,
  Filter,
  RotateCcw,
  Sun,
  Moon
} from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();

  // Authentication & Profile State
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  // Navigation & View State
  const [activeTab, setActiveTab] = useState("my-vault"); // 'my-vault', 'starred', 'recent', 'shared', 'admin-analytics', 'user-activity'
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([{ id: null, name: "My Vault" }]);
  const [viewMode, setViewMode] = useState("grid"); // 'grid' or 'list'
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all"); // 'all', 'document', 'spreadsheet', 'image', 'archive', 'code'
  const [sortBy, setSortBy] = useState("date_desc");

  // Vault Items & Storage State
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [currentFolderDetails, setCurrentFolderDetails] = useState(null);
  const [userStorageBytes, setUserStorageBytes] = useState(0);
  const [userTotalFiles, setUserTotalFiles] = useState(0);
  const [userSharedFilesCount, setUserSharedFilesCount] = useState(0);
  const [userStorageQuotaBytes, setUserStorageQuotaBytes] = useState(500 * 1024 * 1024);
  const [userRemainingBytes, setUserRemainingBytes] = useState(500 * 1024 * 1024);
  const [userQuotaMb, setUserQuotaMb] = useState(500);

  // Security Alerts & Failed Login Notifications
  const [securityAlerts, setSecurityAlerts] = useState({ count: 0, list: [] });
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [notificationsList, setNotificationsList] = useState([]);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  // Theme State (Light / Dark Mode with Persistence)
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("trustshare_theme");
      const prefersDark = typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
      let initial = stored || (prefersDark ? "dark" : "light");
      if (initial === "system") {
        initial = prefersDark ? "dark" : "light";
      }
      setTheme(initial);
      if (initial === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    } catch (e) {
      console.error("Theme load error:", e);
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("trustshare_theme", next);
      if (next === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      showToast(`Switched to ${next === "dark" ? "Dark" : "Light"} theme`, "info");
    } catch (e) {
      console.error("Theme toggle error:", e);
    }
  };

  // Seen tracking for badges (alerts, files, shared, users, security, analytics)
  const [seenBadges, setSeenBadges] = useState({
    alerts: false,
    files: false,
    shared: false,
    users: false,
    security: false,
    analytics: false
  });

  useEffect(() => {
    try {
      const stored = localStorage.getItem("trustshare_seen_badges");
      if (stored) {
        setSeenBadges((prev) => ({ ...prev, ...JSON.parse(stored) }));
      }
    } catch {}
  }, []);

  const markBadgeSeen = useCallback((key) => {
    setSeenBadges((prev) => {
      if (prev[key]) return prev;
      const updated = { ...prev, [key]: true };
      try {
        localStorage.setItem("trustshare_seen_badges", JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  // Upload Modals & Drag State
  const [isDragging, setIsDragging] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [uploadFilesList, setUploadFilesList] = useState([]);
  const [uploadPassword, setUploadPassword] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderPassword, setNewFolderPassword] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  // Hidden File Inputs
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  // Password Unlock & Management Modals
  const [passwordModal, setPasswordModal] = useState({
    isOpen: false,
    item: null,
    actionType: "open", // 'open', 'download', 'download-folder'
    enteredPassword: "",
    error: ""
  });

  const [managePasswordModal, setManagePasswordModal] = useState({
    isOpen: false,
    item: null,
    password: "",
    action: "set", // 'set' or 'remove'
    message: "",
    error: ""
  });

  // Share & Rename Modals
  const [shareModalItem, setShareModalItem] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [renameModal, setRenameModal] = useState({ isOpen: false, item: null, newName: "" });

  // Encrypted Secure Sharing Configuration State
  const [shareConfig, setShareConfig] = useState({
    permission: "download", // "view" or "download"
    hasGuestPassword: true,
    guestPassword: "",
    expirationPreset: "24h", // "1h", "24h", "7d", "30d", "never", "custom"
    customExpiresAt: "",
    maxDownloads: "", // number or empty
    existingShares: [],
    loadingShares: false,
    creatingShare: false,
    createdShareUrl: "",
    error: ""
  });
  const [showShareGuestPassword, setShowShareGuestPassword] = useState(false);

  const generateRandomGuestPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let rand = "";
    for (let i = 0; i < 4; i++) rand += chars.charAt(Math.floor(Math.random() * chars.length));
    const num = Math.floor(1000 + Math.random() * 9000);
    const pass = `Guest-${num}-${rand}`;
    setShareConfig((prev) => ({ ...prev, guestPassword: pass, hasGuestPassword: true }));
  };

  const openShareModal = async (item) => {
    setShareModalItem(item);
    setCopiedLink(false);
    setShareConfig({
      permission: "download",
      hasGuestPassword: true,
      guestPassword: "",
      expirationPreset: "24h",
      customExpiresAt: "",
      maxDownloads: "",
      existingShares: [],
      loadingShares: true,
      creatingShare: false,
      createdShareUrl: "",
      error: ""
    });

    try {
      const res = await api.get(`/files/${item.id}/shares`);
      setShareConfig((prev) => ({
        ...prev,
        existingShares: res.data.shares || [],
        loadingShares: false
      }));
    } catch (err) {
      console.warn("Failed to load existing shares:", err);
      setShareConfig((prev) => ({ ...prev, loadingShares: false }));
    }
  };

  const handleCreateShareLink = async () => {
    if (!shareModalItem) return;
    setShareConfig((prev) => ({ ...prev, creatingShare: true, error: "" }));

    try {
      const payload = {
        permission: shareConfig.permission,
        guest_password:
          shareConfig.hasGuestPassword && shareConfig.guestPassword.trim()
            ? shareConfig.guestPassword.trim()
            : null,
        expiration_preset: shareConfig.expirationPreset,
        custom_expires_at:
          shareConfig.expirationPreset === "custom" && shareConfig.customExpiresAt
            ? shareConfig.customExpiresAt
            : null,
        max_downloads: shareConfig.maxDownloads ? parseInt(shareConfig.maxDownloads, 10) : null
      };

      const res = await api.post(`/files/${shareModalItem.id}/share`, payload);
      const fullUrl = `${typeof window !== "undefined" ? window.location.origin : ""}${res.data.share_url}`;

      setShareConfig((prev) => ({
        ...prev,
        createdShareUrl: fullUrl,
        existingShares: [res.data, ...prev.existingShares],
        creatingShare: false
      }));

      showToast("Secure share link generated successfully!", "success");
      fetchItems();
    } catch (err) {
      const detail = err.response?.data?.detail || "Failed to generate share link.";
      setShareConfig((prev) => ({ ...prev, creatingShare: false, error: detail }));
      showToast(detail, "error");
    }
  };

  const handleRevokeShare = async (shareId) => {
    try {
      await api.delete(`/files/shares/${shareId}`);
      setShareConfig((prev) => ({
        ...prev,
        existingShares: prev.existingShares.map((s) =>
          s.id === shareId ? { ...s, is_active: false, is_revoked: true } : s
        )
      }));
      showToast("Share link revoked immediately. Guest access terminated.", "success");
      fetchItems();
    } catch (err) {
      showToast("Failed to revoke share link.", "error");
    }
  };

  const handleDeleteSharePermanent = async (shareId) => {
    try {
      await api.delete(`/files/shares/${shareId}?permanent=true`);
      setShareConfig((prev) => ({
        ...prev,
        existingShares: prev.existingShares.filter((s) => s.id !== shareId)
      }));
      showToast("Share record permanently deleted.", "success");
      fetchItems();
    } catch (err) {
      showToast("Failed to delete share record.", "error");
    }
  };

  // Password Visibility Toggle States for Modals
  const [showUploadPassword, setShowUploadPassword] = useState(false);
  const [showNewFolderPassword, setShowNewFolderPassword] = useState(false);
  const [showUnlockPassword, setShowUnlockPassword] = useState(false);
  const [showManagePassword, setShowManagePassword] = useState(false);

  // User Personal Activity Log State
  const [userLogs, setUserLogs] = useState([]);
  const [loadingUserLogs, setLoadingUserLogs] = useState(false);
  const [userLogsDays, setUserLogsDays] = useState(30); // Default to a month (30 days)
  const [userLogsStartDate, setUserLogsStartDate] = useState("");
  const [userLogsEndDate, setUserLogsEndDate] = useState("");
  const [userLogsDateRangeLabel, setUserLogsDateRangeLabel] = useState("Last 30 Days (Default: Month)");
  const [userLogsActionFilter, setUserLogsActionFilter] = useState("ALL");
  const [isUserLogsDatePickerOpen, setIsUserLogsDatePickerOpen] = useState(false);
  const [userLogsCustomStart, setUserLogsCustomStart] = useState("");
  const [userLogsCustomEnd, setUserLogsCustomEnd] = useState("");
  const userLogsDatePickerRef = useRef(null);

  // Admin Logs Date Filter State
  const [adminLogsDays, setAdminLogsDays] = useState(30); // Default to a month (30 days)
  const [adminLogsStartDate, setAdminLogsStartDate] = useState("");
  const [adminLogsEndDate, setAdminLogsEndDate] = useState("");
  const [adminLogsDateRangeLabel, setAdminLogsDateRangeLabel] = useState("Last 30 Days (Default: Monthly)");
  const [isAdminLogsDatePickerOpen, setIsAdminLogsDatePickerOpen] = useState(false);
  const [adminLogsCustomStart, setAdminLogsCustomStart] = useState("");
  const [adminLogsCustomEnd, setAdminLogsCustomEnd] = useState("");
  const [adminLogsSearch, setAdminLogsSearch] = useState("");
  const [loadingAdminLogs, setLoadingAdminLogs] = useState(false);
  const [adminLogsTotal, setAdminLogsTotal] = useState(0);
  const [adminLogsActionCounts, setAdminLogsActionCounts] = useState({});
  const adminLogsDatePickerRef = useRef(null);

  // Notifications Toast
  const [toastMessage, setToastMessage] = useState(null);

  // Admin Analytics & Moderation State
  const [adminAnalytics, setAdminAnalytics] = useState(null);
  const [adminDays, setAdminDays] = useState(7);
  const [adminStartDate, setAdminStartDate] = useState("");
  const [adminEndDate, setAdminEndDate] = useState("");
  const [adminLogs, setAdminLogs] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminSubTab, setAdminSubTab] = useState("overview"); // 'overview', 'users', 'logs'
  const [logFilterAction, setLogFilterAction] = useState("ALL");
  const [logSearchUser, setLogSearchUser] = useState("");
  const [loadingAdmin, setLoadingAdmin] = useState(false);

  const showToast = (msg, type = "success") => {
    setToastMessage({ text: msg, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Check Auth on Mount
  useEffect(() => {
    const storedToken = localStorage.getItem("trustshare_token");
    const storedUser = localStorage.getItem("trustshare_user");

    if (!storedToken || !storedUser) {
      window.location.href = "/login";
      return;
    }

    try {
      const parsedUser = JSON.parse(storedUser);
      setToken(storedToken);
      setUser(parsedUser);
      if (parsedUser.role === "admin") {
        setActiveTab("admin-analytics");
        setAdminSubTab("overview");
      } else {
        setActiveTab("my-vault");
      }
    } catch {
      window.location.href = "/login";
    }
  }, []);

  // Handle clicks outside date pickers
  useEffect(() => {
    function handleClickOutside(event) {
      if (userLogsDatePickerRef.current && !userLogsDatePickerRef.current.contains(event.target)) {
        setIsUserLogsDatePickerOpen(false);
      }
      if (adminLogsDatePickerRef.current && !adminLogsDatePickerRef.current.contains(event.target)) {
        setIsAdminLogsDatePickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch Items from Backend
  const fetchItems = useCallback(async () => {
    if (!token) return;
    setLoadingItems(true);

    try {
      let filterParam = "all";
      if (activeTab === "starred" || activeTab === "favorites") filterParam = "starred";
      if (activeTab === "recent") filterParam = "recent";
      if (activeTab === "shared" || activeTab === "shared-by-me" || activeTab === "shared-with-me") filterParam = "shared";
      if (activeTab === "trash") filterParam = "trash";

      const params = {
        folder_id: ((activeTab === "my-vault" || activeTab === "my-files") && currentFolderId) ? currentFolderId : undefined,
        filter_type: filterParam,
        category: categoryFilter !== "all" ? categoryFilter : undefined,
        search: searchQuery.trim() || undefined,
        sort_by: sortBy
      };

      const res = await api.get("/files", { params });
      setItems(res.data.items || []);
      setCurrentFolderDetails(res.data.current_folder);
      if (res.data.breadcrumbs) {
        setBreadcrumbs(res.data.breadcrumbs);
      }
      setUserStorageBytes(res.data.user_storage_bytes || 0);
      setUserTotalFiles(res.data.user_total_files || 0);
      setUserSharedFilesCount(res.data.user_shared_files_count || 0);
      if (res.data.user_storage_quota_bytes) {
        setUserStorageQuotaBytes(res.data.user_storage_quota_bytes);
      }
      if (res.data.user_remaining_bytes !== undefined) {
        setUserRemainingBytes(res.data.user_remaining_bytes);
      }
      if (res.data.user_quota_mb) {
        setUserQuotaMb(res.data.user_quota_mb);
      }
      if (["my-vault", "my-files", "file-analytics"].includes(activeTab)) {
        markBadgeSeen("files");
      }
    } catch (err) {
      console.error("Failed to load files:", err);
      showToast("Unable to load files.", "error");
    } finally {
      setLoadingItems(false);
    }
  }, [token, activeTab, currentFolderId, categoryFilter, searchQuery, sortBy, markBadgeSeen]);

  // Fetch User Personal Activity Logs
  const fetchUserLogs = useCallback(async (overrideParams = {}) => {
    if (!token) return;
    setLoadingUserLogs(true);
    try {
      const params = { limit: 100 };
      const d = overrideParams.days !== undefined ? overrideParams.days : userLogsDays;
      if (d) params.days = d;

      const s = overrideParams.startDate !== undefined ? overrideParams.startDate : userLogsStartDate;
      const e = overrideParams.endDate !== undefined ? overrideParams.endDate : userLogsEndDate;
      if (s) params.start_date = s;
      if (e) params.end_date = e;

      const act = overrideParams.action !== undefined ? overrideParams.action : userLogsActionFilter;
      if (act && act !== "ALL") params.action = act;

      const res = await api.get("/files/activity-logs", { params });
      setUserLogs(res.data.logs || []);
      if (res.data?.date_range) {
        setUserLogsDateRangeLabel(res.data.date_range);
      }
    } catch (err) {
      console.error("Failed to load user activity logs:", err);
      showToast("Failed to load activity logs.", "error");
    } finally {
      setLoadingUserLogs(false);
    }
  }, [token, userLogsDays, userLogsStartDate, userLogsEndDate, userLogsActionFilter]);

  // Fetch Security Alerts & Incorrect Logins for Admins
  const fetchSecurityAlerts = useCallback(async () => {
    if (!token || !user || user.role !== "admin") return;
    try {
      const res = await api.get("/admin/security-alerts");
      setSecurityAlerts({
        count: res.data.total || 0,
        list: res.data.alerts || []
      });
      if (activeTab === "admin-security-dashboard") {
        markBadgeSeen("alerts");
      }
    } catch (err) {
      if (err.response?.status !== 403) {
        console.warn("Failed to fetch security alerts:", err);
      }
    }
  }, [token, user, activeTab, markBadgeSeen]);

  // Load items whenever relevant filters change
  useEffect(() => {
    const isSpecialTab = [
      "admin-security-dashboard",
      "admin-reports",
      "admin-storage",
      "admin-suspicious-activity",
      "admin-activity-logs",
      "admin-audit-logs",
      "system-monitoring",
      "admin-analytics",
      "admin-overview",
      "admin-users",
      "admin-logs",
      "user-activity",
      "file-analytics",
      "user-security",
      "settings"
    ].includes(activeTab);

    if (!isSpecialTab) {
      fetchItems();
    } else if (activeTab === "user-activity") {
      fetchUserLogs();
    }
  }, [fetchItems, fetchUserLogs, activeTab]);

  // Fetch security alerts on mount or admin check
  useEffect(() => {
    if (user?.role === "admin" && token) {
      fetchSecurityAlerts();
    }
  }, [user, token, fetchSecurityAlerts]);

  // Fetch Notifications & Security Alerts for All Users
  const fetchNotifications = useCallback(async () => {
    if (!token) return;
    try {
      setLoadingNotifications(true);
      const res = await api.get("/notifications");
      setNotificationsList(res.data?.notifications || []);
      setUnreadNotificationsCount(res.data?.unread_count || 0);
    } catch (err) {
      console.warn("Failed to load notifications:", err);
    } finally {
      setLoadingNotifications(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 15000);
      return () => clearInterval(interval);
    }
  }, [token, fetchNotifications]);

  const handleMarkNotificationRead = async (notifId = null, markAll = false) => {
    try {
      await api.post("/notifications/mark-read", {
        notification_ids: notifId ? [notifId] : null,
        mark_all: markAll
      });
      fetchNotifications();
    } catch (err) {
      console.warn("Mark read failed:", err);
    }
  };

  const handleClearNotifications = async () => {
    try {
      await api.delete("/notifications");
      setNotificationsList([]);
      setUnreadNotificationsCount(0);
      showToast("Notification history cleared.", "success");
    } catch (err) {
      console.warn("Clear failed:", err);
    }
  };

  // Auto-dismiss badges once user/admin visits the corresponding section
  useEffect(() => {
    if (activeTab === "admin-security-dashboard") {
      markBadgeSeen("alerts");
    } else if (activeTab === "my-vault" || activeTab === "my-files" || activeTab === "file-analytics") {
      markBadgeSeen("files");
    } else if (activeTab === "shared" || activeTab === "shared-with-me" || activeTab === "shared-by-me") {
      markBadgeSeen("shared");
    } else if (activeTab === "user-security") {
      markBadgeSeen("security");
    }
    if (activeTab === "file-analytics") {
      markBadgeSeen("analytics");
    }
  }, [activeTab, markBadgeSeen]);

  useEffect(() => {
    if (activeTab === "admin-analytics" && adminSubTab === "users") {
      markBadgeSeen("users");
    }
  }, [activeTab, adminSubTab, markBadgeSeen]);

  // Date Helper Functions for Admin Audit Logs
  const getCurrentMonthRange = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const monthName = now.toLocaleString("default", { month: "short" });
    return {
      start: `${year}-${month}-01`,
      end: `${year}-${month}-${day}`,
      label: `Current Month (${monthName} 1 - ${now.getDate()})`
    };
  };

  const getPreviousMonthRange = () => {
    const now = new Date();
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const year = prevDate.getFullYear();
    const month = String(prevDate.getMonth() + 1).padStart(2, "0");
    const lastDay = new Date(year, prevDate.getMonth() + 1, 0).getDate();
    const monthName = prevDate.toLocaleString("default", { month: "short" });
    return {
      start: `${year}-${month}-01`,
      end: `${year}-${month}-${String(lastDay).padStart(2, "0")}`,
      label: `Previous Month (${monthName} 1 - ${lastDay})`
    };
  };

  const handleResetAdminLogsToDefaultMonthly = () => {
    setAdminLogsDays(30);
    setAdminLogsStartDate("");
    setAdminLogsEndDate("");
    setAdminLogsCustomStart("");
    setAdminLogsCustomEnd("");
    setAdminLogsDateRangeLabel("Last 30 Days (Default: Monthly)");
    setIsAdminLogsDatePickerOpen(false);
    fetchAdminLogs({ days: 30, startDate: "", endDate: "" });
  };

  const exportAdminLogsToCSV = () => {
    if (!adminLogs || adminLogs.length === 0) {
      showToast("No audit logs to export for this period.", "info");
      return;
    }
    const headers = ["Timestamp", "User", "Action", "Target / Resource", "IP Address", "Details / Reason"];
    const rows = adminLogs.map((log) => [
      `"${log.timestamp}"`,
      `"${log.username || "Anonymous"}"`,
      `"${log.action}"`,
      `"${(log.resource_name || "").replace(/"/g, '""')}"`,
      `"${log.ip_address || "127.0.0.1"}"`,
      `"${(log.details?.reason || (log.details ? JSON.stringify(log.details) : "")).replace(/"/g, '""')}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const fileSuffix = adminLogsStartDate ? `${adminLogsStartDate}_to_${adminLogsEndDate}` : "monthly_default";
    link.setAttribute("download", `admin_audit_logs_${fileSuffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Audit logs exported to CSV.", "success");
  };

  // Fetch Admin Audit Logs independently with custom date-wise or default monthly filtering
  const fetchAdminLogs = useCallback(async (overrideParams = {}) => {
    if (!token || !user || user.role !== "admin") return;
    setLoadingAdminLogs(true);
    try {
      const d = overrideParams.days !== undefined ? overrideParams.days : adminLogsDays;
      const s = overrideParams.startDate !== undefined ? overrideParams.startDate : adminLogsStartDate;
      const e = overrideParams.endDate !== undefined ? overrideParams.endDate : adminLogsEndDate;
      const act = overrideParams.action !== undefined ? overrideParams.action : logFilterAction;
      const q = overrideParams.search !== undefined ? overrideParams.search : adminLogsSearch;

      const params = {
        limit: 150
      };
      if (s || e) {
        if (s) params.start_date = s;
        if (e) params.end_date = e;
      } else if (d) {
        params.days = d;
      } else {
        params.days = 30; // Default Monthly
      }
      if (act && act !== "ALL") params.action = act;
      if (q && q.trim()) params.search = q.trim();

      const res = await api.get("/admin/audit-logs", { params });
      setAdminLogs(res.data.logs || []);
      setAdminLogsTotal(res.data.total || 0);
      if (res.data?.action_counts) {
        setAdminLogsActionCounts(res.data.action_counts);
      }
      if (res.data?.date_range) {
        setAdminLogsDateRangeLabel(res.data.date_range);
      }
    } catch (err) {
      console.error("Admin audit logs fetch error:", err);
      showToast("Failed to load audit logs stream.", "error");
    } finally {
      setLoadingAdminLogs(false);
    }
  }, [token, user, adminLogsDays, adminLogsStartDate, adminLogsEndDate, logFilterAction, adminLogsSearch]);

  // Fetch Admin Analytics
  const fetchAdminData = useCallback(async (overrideParams = {}) => {
    if (!token || !user || user.role !== "admin") {
      setActiveTab("my-vault");
      return;
    }
    setLoadingAdmin(true);

    const targetDays = overrideParams.days !== undefined ? overrideParams.days : adminDays;
    const targetStart = overrideParams.startDate !== undefined ? overrideParams.startDate : adminStartDate;
    const targetEnd = overrideParams.endDate !== undefined ? overrideParams.endDate : adminEndDate;

    if (overrideParams.days !== undefined) setAdminDays(overrideParams.days);
    if (overrideParams.startDate !== undefined) setAdminStartDate(overrideParams.startDate);
    if (overrideParams.endDate !== undefined) setAdminEndDate(overrideParams.endDate);

    try {
      const analyticsParams = {};
      if (targetDays) analyticsParams.days = targetDays;
      if (targetStart) analyticsParams.start_date = targetStart;
      if (targetEnd) analyticsParams.end_date = targetEnd;

      const [analyticsRes, usersRes] = await Promise.all([
        api.get("/admin/analytics", { params: analyticsParams }),
        api.get("/admin/users")
      ]);

      setAdminAnalytics(analyticsRes.data);
      if (analyticsRes.data?.security_alerts) {
        setSecurityAlerts({
          count: analyticsRes.data.security_alerts.failed_logins_count || 0,
          list: analyticsRes.data.security_alerts.recent_failed_logins || []
        });
        if (activeTab === "admin-security-dashboard") {
          markBadgeSeen("alerts");
        }
      }
      setAdminUsers(usersRes.data.users || []);
      fetchAdminLogs();
    } catch (err) {
      if (err.response?.status === 403) {
        console.warn("Current user does not have admin privileges; switching to vault.");
        setActiveTab("my-vault");
      } else {
        console.error("Admin data fetch error:", err);
        showToast("Failed to load admin analytics.", "error");
      }
    } finally {
      setLoadingAdmin(false);
    }
  }, [token, user, adminDays, adminStartDate, adminEndDate, fetchAdminLogs, activeTab, markBadgeSeen]);

  useEffect(() => {
    if (activeTab === "admin-analytics") {
      fetchAdminData();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "admin-analytics" && adminSubTab === "logs") {
      fetchAdminLogs();
    }
  }, [activeTab, adminSubTab, logFilterAction]);

  const [isCleaningAdminStorage, setIsCleaningAdminStorage] = useState(false);

  // Clean and purge admin storage
  const handleCleanAdminStorage = async () => {
    if (!window.confirm("Clean admin storage? This will permanently purge any files or folders belonging to administrators.")) {
      return;
    }
    setIsCleaningAdminStorage(true);
    try {
      const res = await api.post("/admin/clean-storage");
      showToast(res.data?.message || "Admin storage purged successfully.", "success");
      await fetchAdminData();
    } catch (err) {
      console.error("Clean admin storage error:", err);
      showToast(err.response?.data?.detail || "Failed to clean admin storage.", "error");
    } finally {
      setIsCleaningAdminStorage(false);
    }
  };

  // Format bytes helper
  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  // Sign out (Both User and Admin)
  const handleLogout = async () => {
    try {
      await Promise.race([
        api.post("/auth/logout"),
        new Promise((_, reject) => setTimeout(() => reject("timeout"), 1200))
      ]);
    } catch (err) {
      console.warn("Logout notification error/timeout:", err);
    } finally {
      localStorage.removeItem("trustshare_token");
      localStorage.removeItem("trustshare_user");
      localStorage.removeItem("access_token");
      localStorage.removeItem("user");
      sessionStorage.clear();
      setUser(null);
      setToken(null);
      setActiveTab("my-vault");
      window.location.replace("/login");
    }
  };

  // Folder navigation click handler
  const handleItemClick = (item) => {
    if (item.is_folder) {
      if (item.is_password_protected) {
        // Open password prompt modal
        setPasswordModal({
          isOpen: true,
          item,
          actionType: "open",
          enteredPassword: "",
          error: ""
        });
      } else {
        // Navigate inside folder
        setCurrentFolderId(item.id);
      }
    }
  };

  // Handle Password Unlock
  const handleVerifyPassword = async (e) => {
    e.preventDefault();
    const { item, actionType, enteredPassword } = passwordModal;

    try {
      const res = await api.post(`/files/${item.id}/verify-password`, {
        password: enteredPassword
      });

      if (res.data.valid) {
        setPasswordModal({ isOpen: false, item: null, actionType: "open", enteredPassword: "", error: "" });

        if (actionType === "open") {
          setCurrentFolderId(item.id);
        } else if (actionType === "download") {
          triggerFileDownload(item, enteredPassword);
        } else if (actionType === "download-folder") {
          triggerFolderDownload(item, enteredPassword);
        }
      }
    } catch (err) {
      setPasswordModal(prev => ({
        ...prev,
        error: err.response?.data?.detail || "Incorrect password. Access denied."
      }));
      fetchUserLogs();
    }
  };

  // Trigger direct file download
  const triggerFileDownload = async (item, password = "") => {
    try {
      const url = `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/files/${item.id}/download${
        password ? `?password=${encodeURIComponent(password)}` : ""
      }`;

      // Fetch with auth header
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          // Password required or incorrect
          setPasswordModal({
            isOpen: true,
            item,
            actionType: "download",
            enteredPassword: "",
            error: password ? "Incorrect password. Access denied." : "Password required to download this asset."
          });
          fetchUserLogs();
          return;
        }
        const errJson = await response.json().catch(() => ({}));
        showToast(errJson.detail || "Download failed. Check file permissions.", "error");
        return;
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = item.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
      showToast(`Downloaded '${item.name}'`);
    } catch (err) {
      console.error("Download error:", err);
      showToast("Download failed. Check file permissions.", "error");
    }
  };

  // Trigger folder ZIP download
  const triggerFolderDownload = async (item, password = "") => {
    try {
      const url = `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/files/${item.id}/download-folder${
        password ? `?password=${encodeURIComponent(password)}` : ""
      }`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setPasswordModal({
            isOpen: true,
            item,
            actionType: "download-folder",
            enteredPassword: "",
            error: password ? "Incorrect folder password. Access denied." : "Password required to download this folder."
          });
          fetchUserLogs();
          return;
        }
        const errJson = await response.json().catch(() => ({}));
        showToast(errJson.detail || "Folder download failed. Check permissions.", "error");
        return;
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `${item.name}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
      showToast(`Downloaded folder ZIP '${item.name}.zip'`);
    } catch (err) {
      console.error("Folder download error:", err);
      showToast("Failed to download folder as ZIP.", "error");
    }
  };

  // Create new folder
  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      await api.post("/files/folder", {
        name: newFolderName.trim(),
        parent_folder_id: currentFolderId,
        password: newFolderPassword.trim() || undefined
      });
      showToast(`Created folder '${newFolderName}'`);
      setNewFolderName("");
      setNewFolderPassword("");
      setShowFolderModal(false);
      fetchItems();
    } catch (err) {
      showToast(err.response?.data?.detail || "Failed to create folder", "error");
    }
  };

  // Handle File Upload (Multiple Files)
  const handleUploadFiles = async (e) => {
    e.preventDefault();
    if (!uploadFilesList || uploadFilesList.length === 0) return;

    // Validate 500 MB maximum per file
    const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024;
    for (let i = 0; i < uploadFilesList.length; i++) {
      if (uploadFilesList[i].size > MAX_FILE_SIZE_BYTES) {
        setUploadError(`File '${uploadFilesList[i].name}' exceeds the 500 MB maximum allowable size limit.`);
        return;
      }
    }

    const formData = new FormData();
    for (let i = 0; i < uploadFilesList.length; i++) {
      formData.append("files", uploadFilesList[i]);
    }
    if (currentFolderId) {
      formData.append("parent_folder_id", currentFolderId);
    }
    if (uploadPassword.trim()) {
      formData.append("password", uploadPassword.trim());
    }

    setIsUploading(true);
    setUploadError("");
    setUploadProgress(10);

    try {
      await api.post("/files/upload", formData, {
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percent);
          }
        }
      });

      showToast(`Successfully uploaded ${uploadFilesList.length} file(s)!`);
      setUploadFilesList([]);
      setUploadPassword("");
      setShowUploadModal(false);
      fetchItems();
    } catch (err) {
      setUploadError(err.response?.data?.detail || "Upload failed. Check file types and sizes.");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Handle Folder Upload (Webkit Directory Tree)
  const handleFolderUploadChange = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
      // webkitRelativePath contains e.g. "MyProject/sub/file.txt"
      formData.append("relative_paths", files[i].webkitRelativePath || files[i].name);
    }
    if (currentFolderId) {
      formData.append("parent_folder_id", currentFolderId);
    }

    setIsUploading(true);
    setUploadProgress(20);

    try {
      const res = await api.post("/files/upload-folder", formData);
      showToast(`Uploaded folder: ${res.data.files_uploaded} files structured into folders!`);
      fetchItems();
    } catch (err) {
      showToast(err.response?.data?.detail || "Folder upload failed.", "error");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (folderInputRef.current) folderInputRef.current.value = "";
    }
  };

  // Drag and drop event handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    if (user?.role === "admin") return;
    if (activeTab === "trash" || activeTab === "shared-with-me" || activeTab === "shared") {
      return;
    }
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (user?.role === "admin") {
      showToast("Administrators have oversight and audit access; file uploads are performed by user accounts.", "info");
      return;
    }
    if (activeTab === "trash") {
      showToast("Cannot upload files into Trash. Switch to My Vault to upload files.", "error");
      return;
    }
    if (activeTab === "shared-with-me") {
      showToast("Cannot upload files into Shared with Me. Files shared by collaborators will appear here automatically.", "error");
      return;
    }
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      setUploadFilesList(droppedFiles);
      setShowUploadModal(true);
    }
  };

  // Toggle Star
  const handleToggleStar = async (item) => {
    try {
      await api.patch(`/files/${item.id}`, { is_starred: !item.is_starred });
      fetchItems();
      showToast(item.is_starred ? "Removed from Starred" : "Added to Starred");
    } catch {
      showToast("Failed to update favorite status", "error");
    }
  };

  // Delete Item
  const handleTrashItem = async (item) => {
    if (!confirm(`Are you sure you want to delete '${item.name}'?`)) return;
    try {
      await api.delete(`/files/${item.id}?permanent=true`);
      fetchItems();
      showToast(`'${item.name}' deleted.`);
    } catch {
      showToast("Failed to delete item", "error");
    }
  };

  // Restore from Trash
  const handleRestoreItem = async (item) => {
    try {
      await api.patch(`/files/${item.id}`, { is_trashed: false });
      fetchItems();
      showToast(`Restored '${item.name}'`);
    } catch {
      showToast("Failed to restore item", "error");
    }
  };

  // Permanent Delete
  const handlePermanentDelete = async (item) => {
    if (!confirm(`Are you sure you want to permanently delete '${item.name}'? This cannot be undone.`)) return;

    try {
      await api.delete(`/files/${item.id}?permanent=true`);
      fetchItems();
      showToast(`Permanently deleted '${item.name}'`);
    } catch {
      showToast("Failed to permanently delete item", "error");
    }
  };

  // Rename item
  const handleRenameSubmit = async (e) => {
    e.preventDefault();
    if (!renameModal.newName.trim()) return;

    try {
      await api.patch(`/files/${renameModal.item.id}`, { name: renameModal.newName.trim() });
      showToast("Renamed successfully.");
      setRenameModal({ isOpen: false, item: null, newName: "" });
      fetchItems();
    } catch {
      showToast("Failed to rename item", "error");
    }
  };

  // Update item password (set or remove)
  const handleManagePasswordSubmit = async (e) => {
    e.preventDefault();
    const { item, password, action } = managePasswordModal;

    try {
      await api.post(`/files/${item.id}/password`, {
        password: password.trim(),
        action
      });
      showToast(action === "remove" ? "Password removed." : "Password set successfully!");
      setManagePasswordModal({ isOpen: false, item: null, password: "", action: "set", message: "", error: "" });
      fetchItems();
    } catch (err) {
      setManagePasswordModal(prev => ({
        ...prev,
        error: err.response?.data?.detail || "Failed to update password."
      }));
    }
  };

  // Admin: Update user role
  const handleAdminChangeUserRole = async (userId, newRole) => {
    try {
      await api.patch(`/admin/users/${userId}/role`, { role: newRole });
      showToast("User role updated successfully.");
      fetchAdminData();
    } catch (err) {
      showToast(err.response?.data?.detail || "Failed to update role.", "error");
    }
  };

  // Admin: Update user status
  const handleAdminChangeUserStatus = async (userId, newStatus) => {
    try {
      await api.patch(`/admin/users/${userId}/status`, { is_active: newStatus });
      showToast(newStatus ? "Account activated." : "Account deactivated.");
      fetchAdminData();
    } catch (err) {
      showToast(err.response?.data?.detail || "Failed to update user status.", "error");
    }
  };



  // File Icon Helper
  const getFileIcon = (item) => {
    if (item.is_folder) {
      return <Folder className="h-7 w-7 text-amber-500 fill-amber-500/20" />;
    }
    const cat = item.category || "";
    if (cat === "spreadsheet") {
      return <FileSpreadsheet className="h-7 w-7 text-emerald-600" />;
    }
    if (cat === "image") {
      return <ImageIcon className="h-7 w-7 text-purple-600" />;
    }
    if (cat === "code") {
      return <FileCode className="h-7 w-7 text-indigo-600" />;
    }
    if (cat === "archive") {
      return <Archive className="h-7 w-7 text-orange-600" />;
    }
    return <FileText className="h-7 w-7 text-blue-600" />;
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600 text-sm">
        <div className="flex items-center gap-3">
          <RefreshCw className="h-5 w-5 animate-spin text-blue-600" />
          <span>Verifying encrypted session passes...</span>
        </div>
      </div>
    );
  }

  const avatarLetter = (user.full_name || user.username || "U").charAt(0).toUpperCase();
  const storageCapBytes = 500 * 1024 * 1024;
  const storagePercent = Math.min(Math.round((userStorageBytes / storageCapBytes) * 100), 100);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="h-screen w-full overflow-hidden bg-slate-50 flex flex-col md:flex-row text-slate-800 font-sans relative"
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 text-xs font-semibold animate-in fade-in slide-in-from-bottom-5 border ${
            toastMessage.type === "error"
              ? "bg-rose-900 text-rose-50 border-rose-700"
              : "bg-slate-900 text-white border-slate-700"
          }`}
        >
          {toastMessage.type === "error" ? (
            <AlertCircle className="h-4 w-4 text-rose-400" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Global Drag Drop Backdrop */}
      {isDragging && user?.role !== "admin" && (
        <div className="fixed inset-0 z-50 bg-blue-600/20 backdrop-blur-xs border-4 border-dashed border-blue-500 rounded-2xl m-4 flex flex-col items-center justify-center pointer-events-none">
          <UploadCloud className="h-16 w-16 text-blue-600 animate-bounce mb-3" />
          <h2 className="text-xl font-bold text-blue-900">Drop files anywhere to upload</h2>
          <p className="text-sm text-blue-700">Encrypted and placed in current workspace folder</p>
        </div>
      )}

      {/* Hidden File & Folder Inputs */}
      <input
        type="file"
        multiple
        ref={fileInputRef}
        onChange={(e) => {
          if (e.target.files?.length) {
            setUploadFilesList(e.target.files);
            setShowUploadModal(true);
          }
        }}
        className="hidden"
      />
      <input
        type="file"
        webkitdirectory="true"
        directory="true"
        multiple
        ref={folderInputRef}
        onChange={handleFolderUploadChange}
        className="hidden"
      />

      {/* ==================================================================== */}
      {/* SIDEBAR NAVIGATION */}
      {/* ==================================================================== */}
      <aside className="w-full md:w-60 bg-slate-900 text-slate-300 flex flex-col justify-between p-3.5 pb-6 border-r border-slate-800 shrink-0 h-full overflow-y-auto z-20">
        <div>
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-2.5 mb-4 px-1.5 group">
            <div className="h-8 w-8 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
              <ShieldCheck className="h-4.5 w-4.5" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold tracking-tight text-white leading-tight">
                TrustShare
              </span>
              <span className="text-[9px] uppercase font-semibold text-emerald-400 tracking-wider flex items-center gap-1.5 mt-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                AES-256 Vault Online
              </span>
            </div>
          </Link>

          {/* Nav Links */}
          <nav className="space-y-0.5 text-xs font-medium">
            {user.role === "admin" ? (
              <>
                <div className="px-3 mb-2 flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    ADMIN PANEL
                  </span>
                </div>

                {/* 1. Dashboard */}
                <button
                  onClick={() => {
                    setActiveTab("admin-analytics");
                    setAdminSubTab("overview");
                  }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-xs ${
                    activeTab === "admin-analytics" && adminSubTab === "overview"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "hover:bg-slate-800 text-slate-300 hover:text-white"
                  }`}
                >
                  <Grid className="h-3.5 w-3.5 text-slate-400" />
                  <span>Dashboard</span>
                </button>

                {/* 2. User Management */}
                <button
                  onClick={() => {
                    setActiveTab("admin-analytics");
                    setAdminSubTab("users");
                    markBadgeSeen("users");
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition cursor-pointer text-xs ${
                    activeTab === "admin-analytics" && adminSubTab === "users"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "hover:bg-slate-800 text-slate-300 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Users className="h-3.5 w-3.5 text-slate-400" />
                    <span>User Management</span>
                  </div>
                  {!seenBadges.users && adminUsers.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">
                      {adminUsers.length}
                    </span>
                  )}
                </button>

                {/* 3. File Management */}
                <button
                  onClick={() => {
                    setActiveTab("my-vault");
                    setCurrentFolderId(null);
                    markBadgeSeen("files");
                  }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-xs ${
                    activeTab === "my-vault"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "hover:bg-slate-800 text-slate-300 hover:text-white"
                  }`}
                >
                  <Folder className="h-3.5 w-3.5 text-slate-400" />
                  <span>File Management</span>
                </button>

                {/* Activity Logs */}
                <button
                  onClick={() => {
                    setActiveTab("admin-activity-logs");
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition cursor-pointer text-xs ${
                    activeTab === "admin-activity-logs"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "hover:bg-slate-800 text-slate-300 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Activity className="h-3.5 w-3.5 text-cyan-400" />
                    <span>Activity Logs</span>
                  </div>
                </button>

                {/* Audit Logs */}
                <button
                  onClick={() => {
                    setActiveTab("admin-audit-logs");
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition cursor-pointer text-xs ${
                    activeTab === "admin-audit-logs"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "hover:bg-slate-800 text-slate-300 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <FileCheck className="h-3.5 w-3.5 text-purple-400" />
                    <span>Audit Logs</span>
                  </div>
                </button>

                {/* Reports */}
                <button
                  onClick={() => {
                    setActiveTab("admin-reports");
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition cursor-pointer text-xs ${
                    activeTab === "admin-reports"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "hover:bg-slate-800 text-slate-300 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <FileText className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Reports</span>
                  </div>
                </button>

                {/* Storage Analytics */}
                <button
                  onClick={() => {
                    setActiveTab("admin-storage");
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition cursor-pointer text-xs ${
                    activeTab === "admin-storage"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "hover:bg-slate-800 text-slate-300 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <HardDrive className="h-3.5 w-3.5 text-blue-400" />
                    <span>Storage Analytics</span>
                  </div>
                </button>

                {/* Security Monitoring */}
                <button
                  onClick={() => {
                    setActiveTab("admin-suspicious-activity");
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition cursor-pointer text-xs ${
                    activeTab === "admin-suspicious-activity"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "hover:bg-slate-800 text-slate-300 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
                    <span>Security Monitoring</span>
                  </div>
                </button>

                {/* 9. System Monitoring */}
                <button
                  onClick={() => {
                    setActiveTab("system-monitoring");
                  }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-xs ${
                    activeTab === "system-monitoring"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "hover:bg-slate-800 text-slate-300 hover:text-white"
                  }`}
                >
                  <Server className="h-3.5 w-3.5 text-slate-400" />
                  <span>System Monitoring</span>
                </button>

                {/* 10. Settings */}
                <button
                  onClick={() => setActiveTab("settings")}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-xs ${
                    activeTab === "settings"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "hover:bg-slate-800 text-slate-300 hover:text-white"
                  }`}
                >
                  <SettingsIcon className="h-3.5 w-3.5 text-slate-400" />
                  <span>Settings</span>
                </button>
              </>
            ) : (
              <>
                <div className="px-3 mb-2 flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    USER PANEL
                  </span>
                </div>

                {/* 1. My Vault */}
                <button
                  onClick={() => {
                    setActiveTab("my-vault");
                    setCurrentFolderId(null);
                  }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-xs ${
                    activeTab === "my-vault" || activeTab === "my-files"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "hover:bg-slate-800 text-slate-300 hover:text-white"
                  }`}
                >
                  <Folder className="h-3.5 w-3.5 text-slate-400" />
                  <span>My Vault</span>
                </button>

                {/* 2. Shared with Me */}
                <button
                  onClick={() => {
                    setActiveTab("shared-with-me");
                    setCurrentFolderId(null);
                  }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-xs ${
                    activeTab === "shared-with-me"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "hover:bg-slate-800 text-slate-300 hover:text-white"
                  }`}
                >
                  <Users className="h-3.5 w-3.5 text-slate-400" />
                  <span>Shared with Me</span>
                </button>

                {/* 3. Shared by Me */}
                <button
                  onClick={() => {
                    setActiveTab("shared");
                    setCurrentFolderId(null);
                  }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-xs ${
                    activeTab === "shared"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "hover:bg-slate-800 text-slate-300 hover:text-white"
                  }`}
                >
                  <Share2 className="h-3.5 w-3.5 text-sky-400" />
                  <span>Shared by Me</span>
                </button>

                {/* 4. Recent */}
                <button
                  onClick={() => {
                    setActiveTab("recent");
                    setCurrentFolderId(null);
                  }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-xs ${
                    activeTab === "recent"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "hover:bg-slate-800 text-slate-300 hover:text-white"
                  }`}
                >
                  <Clock className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Recent</span>
                </button>

                {/* 5. Favorites */}
                <button
                  onClick={() => {
                    setActiveTab("starred");
                    setCurrentFolderId(null);
                  }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-xs ${
                    activeTab === "starred"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "hover:bg-slate-800 text-slate-300 hover:text-white"
                  }`}
                >
                  <Star className="h-3.5 w-3.5 text-amber-400" />
                  <span>Favorites</span>
                </button>

                {/* 6. File Analytics */}
                <button
                  onClick={() => {
                    setActiveTab("file-analytics");
                  }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-xs ${
                    activeTab === "file-analytics"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "hover:bg-slate-800 text-slate-300 hover:text-white"
                  }`}
                >
                  <BarChart3 className="h-3.5 w-3.5 text-blue-300" />
                  <span>File Analytics</span>
                </button>

                {/* 7. Activity Logs */}
                <button
                  onClick={() => setActiveTab("user-activity")}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-xs ${
                    activeTab === "user-activity"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "hover:bg-slate-800 text-slate-300 hover:text-white"
                  }`}
                >
                  <Activity className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Activity Logs</span>
                </button>

                {/* 8. Security */}
                <button
                  onClick={() => {
                    setActiveTab("user-security");
                  }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-xs ${
                    activeTab === "user-security"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "hover:bg-slate-800 text-slate-300 hover:text-white"
                  }`}
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Security</span>
                </button>

                {/* 9. Settings */}
                <button
                  onClick={() => setActiveTab("settings")}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-xs ${
                    activeTab === "settings"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "hover:bg-slate-800 text-slate-300 hover:text-white"
                  }`}
                >
                  <SettingsIcon className="h-3.5 w-3.5 text-slate-400" />
                  <span>Settings</span>
                </button>
              </>
            )}
          </nav>
        </div>

        {/* Bottom Storage Widget & Sign Out */}
        <div className="space-y-4 pt-4 border-t border-slate-800">
          {user.role === "admin" ? (
            /* Admin Storage Usage Widget (100% Dynamic from live backend telemetry) */
            <div className="p-3.5 bg-slate-800/80 rounded-2xl border border-slate-700/60 text-xs">
              <div className="flex items-center gap-2 text-slate-300 font-medium mb-1.5">
                <HardDrive className="h-3.5 w-3.5 text-blue-400" />
                <span className="font-semibold">Storage Usage</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden my-2">
                <div
                  className="h-2 rounded-full bg-blue-500 transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(
                        adminAnalytics?.storage?.total_bytes ? 1 : 0,
                        Math.round(((adminAnalytics?.storage?.total_bytes || 0) / (500 * 1024 * 1024)) * 100)
                      )
                    )}%`
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="font-mono">
                  {formatBytes(adminAnalytics?.storage?.total_bytes || 0)} / 500 MB
                </span>
                <span className="font-semibold text-slate-300">
                  {Math.min(
                    100,
                    Math.round(((adminAnalytics?.storage?.total_bytes || 0) / (500 * 1024 * 1024)) * 100)
                  )}%
                </span>
              </div>
            </div>
          ) : (
            /* Regular User Storage Widget (100% Dynamic from real user quota) */
            <div className="p-3.5 bg-slate-800/80 rounded-2xl border border-slate-700/60 text-xs">
              <div className="flex items-center gap-3">
                {/* Dynamic Circular Gauge */}
                <div className="relative w-11 h-11 flex items-center justify-center shrink-0">
                  <svg className="w-11 h-11 -rotate-90 transform" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15.915" fill="none" stroke="#334155" strokeWidth="3.5" />
                    <circle
                      cx="18"
                      cy="18"
                      r="15.915"
                      fill="none"
                      stroke="#3B82F6"
                      strokeWidth="3.5"
                      strokeDasharray={`${Math.min(100, storagePercent || 0)}, 100`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute text-[10px] font-bold text-white">
                    {storagePercent}%
                  </span>
                </div>
                <div>
                  <p className="text-xs font-bold text-white leading-tight">
                    {formatBytes(userStorageBytes)} / 500 MB
                  </p>
                  <p className="text-[10px] text-slate-400">Used Storage</p>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-rose-400 px-2 py-1.5 rounded-lg hover:bg-slate-800/50 transition cursor-pointer mb-2"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ==================================================================== */}
      {/* MAIN CONTENT AREA */}
      {/* ==================================================================== */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Header */}
        <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-4 sticky top-0 z-10 shrink-0">
          {/* Search Box */}
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files and folders in vault..."
              className="w-full pl-9 pr-4 py-1.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
            />
          </div>

          {/* User Profile, Storage Pill & Security Notifications Bell */}
          <div className="flex items-center gap-3">
            {/* Storage Remaining Pill or Admin Telemetry Status */}
            {user.role === "admin" ? (
              <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-800 font-medium">
                <Activity className="h-3.5 w-3.5 text-purple-600" />
                <span className="font-semibold">System Analytics</span>
                <span className="text-purple-300">•</span>
                <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  Telemetry Active
                </span>
              </div>
            ) : (
              <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700">
                <HardDrive className="h-3.5 w-3.5 text-blue-600" />
                <span className="text-slate-500">Vault:</span>
                <span className="font-semibold text-slate-800">
                  {formatBytes(userStorageBytes)} of 500 MB
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  {formatBytes(userRemainingBytes)} Free
                </span>
              </div>
            )}

            {/* Notifications & Security Alerts (All Users) */}
            {user && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowNotificationsModal(true);
                    fetchNotifications();
                    markBadgeSeen("alerts");
                  }}
                  title="Notifications & Activity Alerts"
                  className="relative p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer border border-slate-200"
                >
                  <Bell className="h-4 w-4" />
                  {unreadNotificationsCount > 0 ? (
                    <span className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                      {unreadNotificationsCount}
                    </span>
                  ) : (!seenBadges.alerts && securityAlerts.count > 0) ? (
                    <span className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 bg-rose-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                      {securityAlerts.count}
                    </span>
                  ) : null}
                </button>
              </div>
            )}

            <button
              onClick={() => {
                fetchItems();
                if (user.role === "admin") fetchSecurityAlerts();
              }}
              title="Refresh Vault Data"
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
            </button>

            {/* Theme Toggle (Light / Dark Mode) */}
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === "dark" ? "Switch to Light Theme" : "Switch to Dark Theme"}
              className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer border border-slate-200"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4 text-amber-500" />
              ) : (
                <Moon className="h-4 w-4 text-slate-600" />
              )}
            </button>

            <div className="h-8 w-px bg-slate-200" />

            <div
              onClick={() => setActiveTab("settings")}
              className="flex items-center gap-3 cursor-pointer p-1 rounded-xl hover:bg-slate-100 transition"
              title="View and Edit Profile Settings"
            >
              <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center border border-blue-200 shadow-2xs">
                {avatarLetter}
              </div>
              <div className="hidden sm:block text-left text-xs leading-tight">
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold text-slate-800">{user.full_name || user.username}</p>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded font-semibold uppercase ${
                      user.role === "admin"
                        ? "bg-purple-100 text-purple-700 border border-purple-200"
                        : "bg-blue-100 text-blue-700 border border-blue-200"
                    }`}
                  >
                    {user.role}
                  </span>
                </div>
                <p className="text-slate-400 font-mono text-[11px]">{user.email}</p>
              </div>
            </div>

            <div className="h-8 w-px bg-slate-200" />

            {/* Direct Header Sign Out Button (Always visible for User & Admin) */}
            <button
              type="button"
              onClick={handleLogout}
              title="Sign Out of TrustShare"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-200 hover:border-rose-600 transition cursor-pointer shadow-2xs"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </header>

        {/* ================================================================== */}
        {/* VIEW 0A: REGULAR USER FILE ANALYTICS (Matches Image 1) */}
        {/* ================================================================== */}
        {activeTab === "file-analytics" && (
          <main className="p-6 md:p-8 space-y-6 flex-1 overflow-y-auto">
            <UserFileAnalytics currentUser={user} />
          </main>
        )}

        {/* ================================================================== */}
        {/* VIEW 0B: USER SECURITY SECTION (Matches Image 2 bottom) */}
        {/* ================================================================== */}
        {activeTab === "user-security" && (
          <main className="p-6 md:p-8 space-y-6 flex-1 overflow-y-auto">
            <UserSecuritySection />
          </main>
        )}

        {/* ================================================================== */}
        {/* VIEW 0C: ADMIN SECURITY DASHBOARD (Strict RBAC - Matches Image 2 top) */}
        {/* ================================================================== */}
        {activeTab === "admin-security-dashboard" && (
          <main className="p-6 md:p-8 space-y-6 flex-1 overflow-y-auto">
            {user?.role !== "admin" ? (
              <div className="p-8 max-w-lg mx-auto bg-rose-50 border border-rose-200 rounded-2xl text-center my-12 shadow-xs">
                <ShieldAlert className="h-12 w-12 text-rose-600 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-rose-900">403 Forbidden - Access Denied</h3>
                <p className="text-sm text-rose-700 mt-2">
                  Administrator privileges are strictly required. Standard users cannot view the admin security telemetry dashboard.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("file-analytics")}
                  className="mt-4 px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-semibold hover:bg-rose-700 transition cursor-pointer"
                >
                  Return to File Analytics
                </button>
              </div>
            ) : (
              <AdminSecurityDashboard />
            )}
          </main>
        )}

        {/* ================================================================== */}
        {/* VIEW 0E: ADMIN SYSTEM MONITORING (Live Infrastructure Telemetry) */}
        {/* ================================================================== */}
        {activeTab === "system-monitoring" && (
          <main className="p-6 md:p-8 space-y-6 flex-1 overflow-y-auto bg-slate-50">
            {user?.role !== "admin" ? (
              <div className="p-8 max-w-lg mx-auto bg-rose-50 border border-rose-200 rounded-2xl text-center my-12 shadow-xs">
                <ShieldAlert className="h-12 w-12 text-rose-600 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-rose-900">403 Forbidden - Access Denied</h3>
                <p className="text-sm text-rose-700 mt-2">
                  Administrator privileges are strictly required. Standard users cannot view the system monitoring telemetry dashboard.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("file-analytics")}
                  className="mt-4 px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-semibold hover:bg-rose-700 transition cursor-pointer"
                >
                  Return to File Analytics
                </button>
              </div>
            ) : (
              <AdminSystemMonitoring
                currentUser={user}
                onNavigate={(tab) => setActiveTab(tab)}
              />
            )}
          </main>
        )}

        {/* Activity Logs & Monitoring Stream */}
        {activeTab === "admin-activity-logs" && (
          <main className="flex-1 flex flex-col overflow-hidden">
            {user?.role !== "admin" ? (
              <div className="p-8 max-w-lg mx-auto bg-rose-50 border border-rose-200 rounded-2xl text-center my-12 shadow-xs">
                <ShieldAlert className="h-12 w-12 text-rose-600 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-rose-900">403 Forbidden - Access Denied</h3>
                <p className="text-sm text-rose-700 mt-2">
                  Administrator privileges are strictly required to view the real-time activity monitoring stream.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("my-vault")}
                  className="mt-4 px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-semibold hover:bg-rose-700 transition cursor-pointer"
                >
                  Return to Vault
                </button>
              </div>
            ) : (
              <AdminActivityLogsDashboard showToast={showToast} />
            )}
          </main>
        )}

        {/* Audit Logs & Compliance Journal */}
        {activeTab === "admin-audit-logs" && (
          <main className="flex-1 flex flex-col overflow-hidden">
            {user?.role !== "admin" ? (
              <div className="p-8 max-w-lg mx-auto bg-rose-50 border border-rose-200 rounded-2xl text-center my-12 shadow-xs">
                <ShieldAlert className="h-12 w-12 text-rose-600 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-rose-900">403 Forbidden - Access Denied</h3>
                <p className="text-sm text-rose-700 mt-2">
                  Administrator privileges are strictly required to view the cryptographic audit logs journal.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("my-vault")}
                  className="mt-4 px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-semibold hover:bg-rose-700 transition cursor-pointer"
                >
                  Return to Vault
                </button>
              </div>
            ) : (
              <AdminAuditLogsDashboard showToast={showToast} />
            )}
          </main>
        )}

        {/* File Activity & Security Reports */}
        {activeTab === "admin-reports" && (
          <main className="p-6 md:p-8 space-y-6 flex-1 overflow-y-auto bg-slate-50">
            {user?.role !== "admin" ? (
              <div className="p-8 max-w-lg mx-auto bg-rose-50 border border-rose-200 rounded-2xl text-center my-12 shadow-xs">
                <ShieldAlert className="h-12 w-12 text-rose-600 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-rose-900">403 Forbidden - Access Denied</h3>
                <p className="text-sm text-rose-700 mt-2">
                  Administrator privileges are strictly required to view and export file activity & security reports.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("my-vault")}
                  className="mt-4 px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-semibold hover:bg-rose-700 transition cursor-pointer"
                >
                  Return to Vault
                </button>
              </div>
            ) : (
              <AdminReportsDashboard
                formatBytes={formatBytes}
                showToast={showToast}
              />
            )}
          </main>
        )}

        {/* Storage Analytics & Monitoring */}
        {activeTab === "admin-storage" && (
          <main className="p-6 md:p-8 space-y-6 flex-1 overflow-y-auto bg-slate-50">
            {user?.role !== "admin" ? (
              <div className="p-8 max-w-lg mx-auto bg-rose-50 border border-rose-200 rounded-2xl text-center my-12 shadow-xs">
                <ShieldAlert className="h-12 w-12 text-rose-600 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-rose-900">403 Forbidden - Access Denied</h3>
                <p className="text-sm text-rose-700 mt-2">
                  Administrator privileges are strictly required to view the storage analytics dashboard.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("my-vault")}
                  className="mt-4 px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-semibold hover:bg-rose-700 transition cursor-pointer"
                >
                  Return to Vault
                </button>
              </div>
            ) : (
              <AdminStorageAnalyticsDashboard
                formatBytes={formatBytes}
                showToast={showToast}
              />
            )}
          </main>
        )}

        {/* Suspicious Activity Detection & Incident Monitor */}
        {activeTab === "admin-suspicious-activity" && (
          <main className="p-6 md:p-8 space-y-6 flex-1 overflow-y-auto bg-slate-50">
            {user?.role !== "admin" ? (
              <div className="p-8 max-w-lg mx-auto bg-rose-50 border border-rose-200 rounded-2xl text-center my-12 shadow-xs">
                <ShieldAlert className="h-12 w-12 text-rose-600 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-rose-900">403 Forbidden - Access Denied</h3>
                <p className="text-sm text-rose-700 mt-2">
                  Administrator privileges are strictly required to view suspicious activity detection and threat monitoring.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("my-vault")}
                  className="mt-4 px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-semibold hover:bg-rose-700 transition cursor-pointer"
                >
                  Return to Vault
                </button>
              </div>
            ) : (
              <AdminSuspiciousActivityDashboard
                showToast={showToast}
              />
            )}
          </main>
        )}

        {/* ================================================================== */}
        {/* VIEW 0D: USER SETTINGS & PROFILE EDIT */}
        {/* ================================================================== */}
        {activeTab === "settings" && (
          <main className="p-6 md:p-8 space-y-6 flex-1 overflow-y-auto">
            <UserSettingsSection
              currentUser={user}
              onUserUpdated={(updatedUser) => {
                setUser(updatedUser);
                try {
                  localStorage.setItem("user", JSON.stringify(updatedUser));
                } catch (e) {
                  console.error("Failed to update user in localStorage", e);
                }
              }}
              onThemeUpdated={(newTheme) => setTheme(newTheme)}
            />
          </main>
        )}

        {/* ================================================================== */}
        {/* VIEW 1: ADMIN ANALYTICS & DASHBOARD (Only for Admin tab) */}
        {/* ================================================================== */}
        {activeTab === "admin-analytics" && (
          <main className="p-6 md:p-8 space-y-6 flex-1 overflow-y-auto bg-slate-50">
            {/* Clean Admin Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                  <Activity className="h-5 w-5 text-purple-600" />
                  <span>Admin Analytics</span>
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time system telemetry, active users, and security audit logs
                </p>
              </div>

              {/* Sub-nav Pills */}
              <div className="flex items-center gap-1.5 p-1 bg-white border border-slate-200 rounded-xl shadow-2xs">
                <button
                  type="button"
                  onClick={() => setAdminSubTab("overview")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    adminSubTab === "overview"
                      ? "bg-purple-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  Overview
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("system-monitoring")}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
                >
                  System Monitoring
                </button>
                <button
                  type="button"
                  onClick={() => setAdminSubTab("users")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    adminSubTab === "users"
                      ? "bg-purple-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  User RBAC ({adminUsers.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdminSubTab("logs");
                    fetchAdminLogs();
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    adminSubTab === "logs"
                      ? "bg-purple-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  Audit Logs ({adminLogsTotal || adminAnalytics?.total_audit_events || 0})
                </button>
              </div>
            </div>

            {loadingAdmin && !adminAnalytics ? (
              <div className="p-12 text-center text-slate-400 text-sm">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-indigo-600" />
                Aggregating system statistics...
              </div>
            ) : adminAnalytics ? (
              <>
                {/* SUBTAB: OVERVIEW */}
                {adminSubTab === "overview" && (
                  <div className="space-y-6">
                    {/* 4 Metric Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Total Users */}
                      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Registered Accounts
                          </span>
                          <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                            <Users className="h-4 w-4" />
                          </div>
                        </div>
                        <p className="text-lg font-bold text-slate-900">{adminAnalytics.users.total}</p>
                        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                          <span className="text-emerald-600 font-semibold">{adminAnalytics.users.active} Active</span>
                          <span>•</span>
                          <span className="font-mono">
                            Admin: {adminAnalytics.users.roles.admin} | User: {adminAnalytics.users.roles.user}
                          </span>
                        </div>
                      </div>

                      {/* Storage Used */}
                      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Total System Storage
                          </span>
                          <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                            <HardDrive className="h-4 w-4" />
                          </div>
                        </div>
                        <p className="text-lg font-bold text-slate-900">
                          {formatBytes(adminAnalytics.storage.total_bytes)}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          {adminAnalytics.storage.total_files} files across {adminAnalytics.storage.total_folders} folders
                        </p>
                      </div>

                      {/* Password Protected Assets */}
                      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Protected Assets
                          </span>
                          <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                            <Lock className="h-4 w-4" />
                          </div>
                        </div>
                        <p className="text-lg font-bold text-slate-900">
                          {adminAnalytics.storage.password_protected_files}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          Locked with bcrypt cryptographic password
                        </p>
                      </div>

                      {/* Audit Events */}
                      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            MongoDB Telemetry
                          </span>
                          <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
                            <Activity className="h-4 w-4" />
                          </div>
                        </div>
                        <p className="text-lg font-bold text-slate-900">
                          {adminAnalytics.total_audit_events}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          Logged security & document actions
                        </p>
                      </div>
                    </div>

                    {/* Graphical Analytics Suite: Interactive Activity Curves, Category Donut & User Storage Bars */}
                    <AdminGraphicalAnalytics
                      adminAnalytics={adminAnalytics}
                      formatBytes={formatBytes}
                      onCleanAdminStorage={handleCleanAdminStorage}
                      isCleaningStorage={isCleaningAdminStorage}
                      onRangeChange={(range) => fetchAdminData(range)}
                    />

                    {/* Infrastructure Health Status */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                          <Server className="h-4 w-4 text-indigo-600" />
                          <span>Connected Infrastructure Status</span>
                        </h2>
                        <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                          All Services Operational
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                          <div className="flex items-center gap-2 mb-2 font-bold text-slate-700">
                            <Database className="h-4 w-4 text-blue-600" />
                            <span>PostgreSQL (Relational)</span>
                          </div>
                          <p className="text-slate-500">Status: <span className="font-semibold text-emerald-700 uppercase">{adminAnalytics.infrastructure.postgres.status}</span></p>
                          <p className="text-slate-500 mt-1">Users Stored: {adminAnalytics.users.total}</p>
                          <p className="text-[10px] text-slate-400 mt-1 font-mono">Port 5433 • Docker</p>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                          <div className="flex items-center gap-2 mb-2 font-bold text-slate-700">
                            <Database className="h-4 w-4 text-emerald-600" />
                            <span>MongoDB (Document)</span>
                          </div>
                          <p className="text-slate-500">Status: <span className="font-semibold text-emerald-700 uppercase">{adminAnalytics.infrastructure.mongodb.status}</span></p>
                          <p className="text-slate-500 mt-1">Audit Events: {adminAnalytics.total_audit_events}</p>
                          <p className="text-[10px] text-slate-400 mt-1 font-mono">Port 27018 • Docker</p>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                          <div className="flex items-center gap-2 mb-2 font-bold text-slate-700">
                            <KeyRound className="h-4 w-4 text-rose-600" />
                            <span>Redis (Cache & RateLimit)</span>
                          </div>
                          <p className="text-slate-500">Status: <span className="font-semibold text-emerald-700 uppercase">{adminAnalytics.infrastructure.redis.status}</span></p>
                          <p className="text-slate-500 mt-1">Memory: {adminAnalytics.redis_metrics?.used_memory_human || "Active"}</p>
                          <p className="text-[10px] text-slate-400 mt-1 font-mono">Port 6379 • Docker</p>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                          <div className="flex items-center gap-2 mb-2 font-bold text-slate-700">
                            <HardDrive className="h-4 w-4 text-purple-600" />
                            <span>Local Vault Storage</span>
                          </div>
                          <p className="text-slate-500">Status: <span className="font-semibold text-emerald-700 uppercase">{adminAnalytics.infrastructure.storage.status}</span></p>
                          <p className="text-slate-500 mt-1">Disk Files: {adminAnalytics.storage.disk_files_count}</p>
                          <p className="text-[10px] text-slate-400 mt-1 font-mono">backend/storage/uploads</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* SUBTAB: USERS RBAC MANAGEMENT */}
                {adminSubTab === "users" && (
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                    <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-bold text-slate-900">Registered Users & Role-Based Access</h2>
                        <p className="text-xs text-slate-500">Manage user authorization roles (Admin, User) and account activation</p>
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                        {adminUsers.length} Total Users
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                          <tr>
                            <th className="px-5 py-3.5">User</th>
                            <th className="px-5 py-3.5">Email</th>
                            <th className="px-5 py-3.5">Role (RBAC)</th>
                            <th className="px-5 py-3.5">Status</th>
                            <th className="px-5 py-3.5">Files & Storage</th>
                            <th className="px-5 py-3.5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {adminUsers.map((u) => (
                            <tr key={u.id} className="hover:bg-slate-50/70 transition">
                              <td className="px-5 py-3.5 font-semibold text-slate-800 flex items-center gap-2.5">
                                <div className="h-7 w-7 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-[11px]">
                                  {u.username.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <p>{u.full_name || u.username}</p>
                                  <p className="text-[10px] text-slate-400 font-mono">@{u.username}</p>
                                </div>
                              </td>
                              <td className="px-5 py-3.5 text-slate-600 font-mono">{u.email}</td>
                              <td className="px-5 py-3.5">
                                {u.role === "admin" ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                                    <ShieldCheck className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                                    <span>Sole System Admin</span>
                                  </span>
                                ) : (
                                  <select
                                    value={u.role}
                                    onChange={(e) => handleAdminChangeUserRole(u.id, e.target.value)}
                                    className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-600 cursor-pointer"
                                  >
                                    <option value="user">User</option>
                                    <option
                                      value="admin"
                                      disabled={adminUsers.some((other) => other.role === "admin" && other.id !== u.id)}
                                    >
                                      Admin (Policy: Max 1 Admin)
                                    </option>
                                  </select>
                                )}
                              </td>
                              <td className="px-5 py-3.5">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                    u.is_active
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      : "bg-rose-50 text-rose-700 border border-rose-200"
                                  }`}
                                >
                                  {u.is_active ? "Active" : "Suspended"}
                                </span>
                              </td>
                              <td className="px-5 py-3.5 font-mono text-slate-600">
                                {u.files_count} files ({formatBytes(u.storage_bytes)})
                              </td>
                              <td className="px-5 py-3.5 text-right">
                                {u.id !== user.id && (
                                  <button
                                    onClick={() => handleAdminChangeUserStatus(u.id, !u.is_active)}
                                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                                      u.is_active
                                        ? "text-rose-600 hover:bg-rose-50"
                                        : "text-emerald-600 hover:bg-emerald-50"
                                    }`}
                                  >
                                    {u.is_active ? "Deactivate" : "Activate"}
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* SUBTAB: AUDIT LOGS STREAM */}
                {adminSubTab === "logs" && (
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs space-y-0">
                    {/* Header: Title, Telemetry Description & Global Controls */}
                    <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-purple-50 text-purple-700 rounded-lg">
                            <Activity className="h-4 w-4" />
                          </div>
                          <h2 className="text-base font-bold text-slate-900">Live MongoDB Security & Document Audit Logs</h2>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Immutable append-only audit journal recording document access, file operations, cryptographic activities, and authorization events.
                        </p>
                      </div>

                      {/* Header Actions: Date Picker, Export, Refresh */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Admin Logs Date Picker Popover */}
                        <div className="relative" ref={adminLogsDatePickerRef}>
                          <button
                            type="button"
                            onClick={() => setIsAdminLogsDatePickerOpen(!isAdminLogsDatePickerOpen)}
                            className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer shadow-2xs"
                          >
                            <Calendar className="h-3.5 w-3.5 text-purple-600" />
                            <span>{adminLogsDateRangeLabel}</span>
                            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                          </button>

                          {isAdminLogsDatePickerOpen && (
                            <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 p-4 z-50 text-xs animate-in fade-in zoom-in-95 duration-150">
                              <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                                <div>
                                  <div className="font-bold text-slate-900 text-xs uppercase tracking-wider">Select Timeframe</div>
                                  <p className="text-[10px] text-slate-400">Default period is Monthly (30 Days)</p>
                                </div>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-bold border border-purple-200">
                                  {adminLogsStartDate ? "Custom Active" : "Monthly Active"}
                                </span>
                              </div>

                              {/* Presets Grid */}
                              <div className="grid grid-cols-2 gap-1.5 py-3">
                                <button
                                  type="button"
                                  onClick={handleResetAdminLogsToDefaultMonthly}
                                  className={`px-2.5 py-2 rounded-xl text-left font-semibold transition cursor-pointer flex items-center justify-between col-span-2 ${
                                    adminLogsDays === 30 && !adminLogsStartDate
                                      ? "bg-purple-600 text-white font-bold shadow-xs"
                                      : "bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200/60"
                                  }`}
                                >
                                  <span>Last 30 Days (Default: Monthly)</span>
                                  {adminLogsDays === 30 && !adminLogsStartDate && (
                                    <Check className="h-3.5 w-3.5 text-white" />
                                  )}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    const cur = getCurrentMonthRange();
                                    setAdminLogsDays(0);
                                    setAdminLogsStartDate(cur.start);
                                    setAdminLogsEndDate(cur.end);
                                    setAdminLogsDateRangeLabel(cur.label);
                                    setIsAdminLogsDatePickerOpen(false);
                                    fetchAdminLogs({ days: 0, startDate: cur.start, endDate: cur.end });
                                  }}
                                  className={`px-2.5 py-1.5 rounded-lg text-left font-medium transition cursor-pointer ${
                                    adminLogsStartDate === getCurrentMonthRange().start
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
                                    setAdminLogsDays(0);
                                    setAdminLogsStartDate(prev.start);
                                    setAdminLogsEndDate(prev.end);
                                    setAdminLogsDateRangeLabel(prev.label);
                                    setIsAdminLogsDatePickerOpen(false);
                                    fetchAdminLogs({ days: 0, startDate: prev.start, endDate: prev.end });
                                  }}
                                  className={`px-2.5 py-1.5 rounded-lg text-left font-medium transition cursor-pointer ${
                                    adminLogsStartDate === getPreviousMonthRange().start
                                      ? "bg-purple-50 text-purple-700 font-bold border border-purple-200"
                                      : "hover:bg-slate-50 text-slate-600"
                                  }`}
                                >
                                  Previous Month
                                </button>

                                {[
                                  { label: "Last 7 Days", days: 7 },
                                  { label: "Last 14 Days", days: 14 },
                                  { label: "Last 60 Days", days: 60 },
                                  { label: "Last 90 Days", days: 90 },
                                  { label: "Past Year", days: 365 },
                                ].map((preset) => (
                                  <button
                                    key={preset.days}
                                    type="button"
                                    onClick={() => {
                                      setAdminLogsDays(preset.days);
                                      setAdminLogsStartDate("");
                                      setAdminLogsEndDate("");
                                      setAdminLogsDateRangeLabel(preset.label);
                                      setIsAdminLogsDatePickerOpen(false);
                                      fetchAdminLogs({ days: preset.days, startDate: "", endDate: "" });
                                    }}
                                    className={`px-2.5 py-1.5 rounded-lg text-left font-medium transition cursor-pointer ${
                                      adminLogsDays === preset.days && !adminLogsStartDate
                                        ? "bg-purple-50 text-purple-700 font-bold border border-purple-200"
                                        : "hover:bg-slate-50 text-slate-600"
                                    }`}
                                  >
                                    {preset.label}
                                  </button>
                                ))}
                              </div>

                              {/* Custom Date Range Section */}
                              <div className="pt-3 border-t border-slate-100">
                                <div className="font-semibold text-slate-800 mb-2 text-[11px] uppercase tracking-wider flex items-center justify-between">
                                  <span>Custom Date Range</span>
                                  {adminLogsStartDate && (
                                    <button
                                      type="button"
                                      onClick={handleResetAdminLogsToDefaultMonthly}
                                      className="text-[10px] text-purple-600 hover:text-purple-800 flex items-center gap-1 font-semibold"
                                    >
                                      <RotateCcw className="h-3 w-3" />
                                      <span>Reset to Monthly</span>
                                    </button>
                                  )}
                                </div>
                                <div className="space-y-2">
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="block text-[10px] text-slate-400 mb-0.5">Start Date</label>
                                      <input
                                        type="date"
                                        value={adminLogsCustomStart}
                                        onChange={(e) => setAdminLogsCustomStart(e.target.value)}
                                        className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 focus:outline-none focus:ring-1 focus:ring-purple-500"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[10px] text-slate-400 mb-0.5">End Date</label>
                                      <input
                                        type="date"
                                        value={adminLogsCustomEnd}
                                        onChange={(e) => setAdminLogsCustomEnd(e.target.value)}
                                        className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 focus:outline-none focus:ring-1 focus:ring-purple-500"
                                      />
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 pt-1">
                                    <button
                                      type="button"
                                      disabled={!adminLogsCustomStart || !adminLogsCustomEnd}
                                      onClick={() => {
                                        if (!adminLogsCustomStart || !adminLogsCustomEnd) {
                                          showToast("Please choose both Start Date and End Date.", "error");
                                          return;
                                        }
                                        if (adminLogsCustomStart > adminLogsCustomEnd) {
                                          showToast("Start Date cannot be after End Date.", "error");
                                          return;
                                        }
                                        setAdminLogsStartDate(adminLogsCustomStart);
                                        setAdminLogsEndDate(adminLogsCustomEnd);
                                        setAdminLogsDays(0);
                                        setAdminLogsDateRangeLabel(`${adminLogsCustomStart} to ${adminLogsCustomEnd}`);
                                        setIsAdminLogsDatePickerOpen(false);
                                        fetchAdminLogs({ days: 0, startDate: adminLogsCustomStart, endDate: adminLogsCustomEnd });
                                      }}
                                      className="flex-1 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold rounded-lg transition cursor-pointer text-xs shadow-2xs text-center"
                                    >
                                      Apply Custom Range
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleResetAdminLogsToDefaultMonthly}
                                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition cursor-pointer text-xs"
                                    >
                                      Reset
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Export to CSV Button */}
                        <button
                          type="button"
                          onClick={exportAdminLogsToCSV}
                          title="Export currently filtered audit logs to CSV"
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-700 transition cursor-pointer shadow-2xs"
                        >
                          <Download className="h-3.5 w-3.5 text-slate-500" />
                          <span>Export CSV</span>
                        </button>

                        {/* Refresh Button */}
                        <button
                          type="button"
                          onClick={() => fetchAdminLogs()}
                          className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-purple-600 transition cursor-pointer shadow-2xs"
                          title="Refresh Audit Logs"
                        >
                          <RefreshCw className={`h-4 w-4 ${loadingAdminLogs ? "animate-spin text-purple-600" : ""}`} />
                        </button>
                      </div>
                    </div>

                    {/* Summary Metric Ribbon for the Selected Timeframe */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-5 bg-slate-50/70 border-b border-slate-100">
                      <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Total Telemetry Events
                        </span>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="text-base font-bold text-slate-900">{adminLogsTotal || adminLogs.length}</span>
                          <span className="text-[11px] text-slate-500 font-medium">in window</span>
                        </div>
                      </div>

                      <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Document & File Actions
                        </span>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="text-base font-bold text-slate-900">
                            {(adminLogsActionCounts["FILE_UPLOAD"] || 0) +
                              (adminLogsActionCounts["FILE_DOWNLOAD"] || 0) +
                              (adminLogsActionCounts["FILE_DELETED"] || 0) +
                              (adminLogsActionCounts["FOLDER_CREATE"] || 0)}
                          </span>
                          <span className="text-[11px] text-emerald-600 font-medium">Vault Activities</span>
                        </div>
                      </div>

                      <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Authentication Events
                        </span>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="text-base font-bold text-slate-900">
                            {(adminLogsActionCounts["LOGIN_SUCCESS"] || 0) +
                              (adminLogsActionCounts["LOGIN_FAILED"] || 0) +
                              (adminLogsActionCounts["OAUTH_LOGIN"] || 0)}
                          </span>
                          <span className="text-[11px] text-blue-600 font-medium">Logins Logged</span>
                        </div>
                      </div>

                      <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Filter Timeframe
                        </span>
                        <div className="flex items-center gap-1.5 mt-1 truncate">
                          {adminLogsStartDate ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                              Custom Range
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              Monthly (Default)
                            </span>
                          )}
                          <span className="text-[11px] text-slate-500 truncate" title={adminLogsDateRangeLabel}>
                            {adminLogsDateRangeLabel}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Secondary Filter & Search Toolbar */}
                    <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white">
                      {/* Search Bar */}
                      <div className="relative flex-1 max-w-md">
                        <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={adminLogsSearch}
                          onChange={(e) => setAdminLogsSearch(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              fetchAdminLogs({ search: adminLogsSearch });
                            }
                          }}
                          placeholder="Search username, filename, IP address, action..."
                          className="w-full pl-9 pr-20 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:bg-white transition"
                        />
                        {adminLogsSearch && (
                          <button
                            type="button"
                            onClick={() => {
                              setAdminLogsSearch("");
                              fetchAdminLogs({ search: "" });
                            }}
                            className="absolute right-12 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => fetchAdminLogs({ search: adminLogsSearch })}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-[10px] font-bold transition cursor-pointer"
                        >
                          Search
                        </button>
                      </div>

                      {/* Action Filter & Failed Logins Toggle */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Action Dropdown */}
                        <div className="flex items-center gap-1.5">
                          <Filter className="h-3.5 w-3.5 text-slate-400" />
                          <select
                            value={logFilterAction}
                            onChange={(e) => {
                              const val = e.target.value;
                              setLogFilterAction(val);
                              fetchAdminLogs({ action: val });
                            }}
                            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
                          >
                            <option value="ALL">All Event Types</option>
                            <option value="LOGIN_SUCCESS">LOGIN_SUCCESS (Authentication)</option>
                            <option value="LOGIN_FAILED">LOGIN_FAILED (Security Alert)</option>
                            <option value="FILE_UPLOAD">FILE_UPLOAD (Encryption)</option>
                            <option value="FILE_DOWNLOAD">FILE_DOWNLOAD (Decryption)</option>
                            <option value="FILE_DELETED">FILE_DELETED (Removal)</option>
                            <option value="FOLDER_CREATE">FOLDER_CREATE (Hierarchy)</option>
                            <option value="USER_PROFILE_UPDATED">USER_PROFILE_UPDATED (Account)</option>
                            <option value="USER_ROLE_UPDATED">USER_ROLE_UPDATED (RBAC)</option>
                            <option value="ADMIN_STORAGE_CLEANED">ADMIN_STORAGE_CLEANED (Maintenance)</option>
                          </select>
                        </div>

                        {/* Quick Failed Logins Only Button */}
                        <button
                          type="button"
                          onClick={() => {
                            const nextAction = logFilterAction === "LOGIN_FAILED" ? "ALL" : "LOGIN_FAILED";
                            setLogFilterAction(nextAction);
                            fetchAdminLogs({ action: nextAction });
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                            logFilterAction === "LOGIN_FAILED"
                              ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                              : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                          }`}
                        >
                          <ShieldAlert className="h-3.5 w-3.5" />
                          <span>{logFilterAction === "LOGIN_FAILED" ? "Show All Actions" : "Failed Logins Only"}</span>
                        </button>

                        {/* Reset to Monthly if Custom Range is Active */}
                        {adminLogsStartDate && (
                          <button
                            type="button"
                            onClick={handleResetAdminLogsToDefaultMonthly}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 transition cursor-pointer flex items-center gap-1"
                            title="Reset back to default monthly view"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>Monthly Default</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Table View */}
                    <div className="overflow-x-auto relative min-h-[250px]">
                      {loadingAdminLogs && (
                        <div className="absolute inset-0 bg-white/70 backdrop-blur-2xs flex items-center justify-center z-10">
                          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white shadow-md border border-slate-200 text-xs font-bold text-slate-700">
                            <RefreshCw className="h-4 w-4 animate-spin text-purple-600" />
                            <span>Filtering MongoDB Audit Records...</span>
                          </div>
                        </div>
                      )}

                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                          <tr>
                            <th className="px-5 py-3">Timestamp (UTC / Local)</th>
                            <th className="px-5 py-3">User / Actor</th>
                            <th className="px-5 py-3">Action Type</th>
                            <th className="px-5 py-3">Target Asset / Details</th>
                            <th className="px-5 py-3">Client IP Address</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {adminLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-slate-50/80 transition">
                              <td className="px-5 py-3.5 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                                <div>{new Date(log.timestamp).toLocaleString()}</div>
                                <div className="text-[10px] text-slate-400 font-normal">
                                  {log.timestamp ? log.timestamp.split("T")[0] : ""}
                                </div>
                              </td>
                              <td className="px-5 py-3.5 font-semibold text-slate-800">
                                <div className="flex items-center gap-2">
                                  <div className="h-6 w-6 rounded-full bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center text-[10px] font-bold">
                                    {(log.username || "S").charAt(0).toUpperCase()}
                                  </div>
                                  <span>{log.username || "System"}</span>
                                </div>
                              </td>
                              <td className="px-5 py-3.5">
                                <span
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold border ${
                                    log.action.includes("DELETE") || log.action.includes("FAILED")
                                      ? "bg-rose-50 text-rose-700 border-rose-200"
                                      : log.action.includes("UPLOAD") || log.action.includes("SUCCESS")
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      : log.action.includes("PASSWORD") || log.action.includes("ROLE")
                                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                                      : "bg-blue-50 text-blue-700 border border-blue-200"
                                  }`}
                                >
                                  {log.action.includes("FAILED") && <ShieldAlert className="h-3 w-3 text-rose-600" />}
                                  {log.action}
                                </span>
                              </td>
                              <td className="px-5 py-3.5 font-medium text-slate-700 max-w-xs truncate">
                                {log.details?.reason ? (
                                  <span className="text-rose-700 italic">
                                    {log.details.reason}
                                  </span>
                                ) : (
                                  log.resource_name || "-"
                                )}
                              </td>
                              <td className="px-5 py-3.5 text-slate-500 font-mono text-[11px]">
                                {log.ip_address || "127.0.0.1"}
                              </td>
                            </tr>
                          ))}
                          {adminLogs.length === 0 && !loadingAdminLogs && (
                            <tr>
                              <td colSpan="5" className="text-center py-12 text-slate-400">
                                <Activity className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                                <p className="font-semibold text-slate-700 text-sm">No audit records found in this timeframe</p>
                                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                                  There are no logged activities matching the selected timeframe ({adminLogsDateRangeLabel}). Try switching back to the default monthly view or broadening the date filter.
                                </p>
                                <button
                                  type="button"
                                  onClick={handleResetAdminLogsToDefaultMonthly}
                                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer shadow-xs"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  <span>Reset to Default Monthly (Last 30 Days)</span>
                                </button>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Table Footer: Total Count & Pagination Indicator */}
                    <div className="p-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                      <div>
                        Showing <span className="font-bold text-slate-700">{adminLogs.length}</span> of{" "}
                        <span className="font-bold text-slate-700">{adminLogsTotal || adminLogs.length}</span> records
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-slate-400">
                          Telemetry: MongoDB activity_logs
                        </span>
                      </div>
                    </div>
                  </div>
                )}


              </>
            ) : null}
          </main>
        )}

        {/* ================================================================== */}
        {/* VIEW 2: GOOGLE DRIVE-STYLE USER VAULT (Default Vault View) */}
        {/* ================================================================== */}
        {![
          "admin-analytics",
          "admin-security-dashboard",
          "admin-reports",
          "admin-storage",
          "admin-suspicious-activity",
          "admin-activity-logs",
          "admin-audit-logs",
          "system-monitoring",
          "settings",
          "file-analytics",
          "user-security",
          "user-activity"
        ].includes(activeTab) && (
          <main className="p-6 md:p-8 space-y-6 flex-1 overflow-y-auto">
            {/* Action Row & Breadcrumbs */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                {/* Breadcrumbs Path Navigation */}
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1 flex-wrap">
                  {breadcrumbs.map((crumb, idx) => (
                    <React.Fragment key={crumb.id || "root"}>
                      {idx > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
                      <button
                        onClick={() => setCurrentFolderId(crumb.id)}
                        className={`hover:text-blue-600 transition font-medium cursor-pointer ${
                          idx === breadcrumbs.length - 1 ? "text-slate-900 font-bold" : ""
                        }`}
                      >
                        {crumb.name}
                      </button>
                    </React.Fragment>
                  ))}
                </div>

                <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                  <span>
                    {activeTab === "starred" || activeTab === "favorites"
                      ? "Favorites & Starred"
                      : activeTab === "recent"
                      ? "Recent Uploads"
                      : activeTab === "shared"
                      ? "Shared by Me"
                      : activeTab === "shared-with-me"
                      ? "Shared with Me"
                      : activeTab === "trash"
                      ? "Trash & Deleted Items"
                      : activeTab === "my-files"
                      ? "My Files"
                      : currentFolderDetails
                      ? currentFolderDetails.name
                      : user?.role === "admin"
                      ? "File Management"
                      : "My Vault"}
                  </span>
                  {currentFolderDetails?.is_password_protected && (
                    <span className="p-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200" title="Password Protected Folder">
                      <Lock className="h-4 w-4" />
                    </span>
                  )}
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  {activeTab === "starred" || activeTab === "favorites"
                    ? "Your favorited and bookmarked assets for instant access"
                    : activeTab === "recent"
                    ? "Chronological view of files uploaded recently across your workspace"
                    : activeTab === "shared"
                    ? "Files you have shared with collaborators and guests"
                    : activeTab === "shared-with-me"
                    ? "Encrypted files and folders shared with you by other team members"
                    : activeTab === "trash"
                    ? "Items in trash can be restored or permanently expunged"
                    : activeTab === "my-files"
                    ? "Complete enterprise file explorer with folder hierarchies and AES-256 protection"
                    : user?.role === "admin"
                    ? "Private Admin Vault: Zero-Knowledge policy ensures administrators cannot access regular users' private files."
                    : "Google Drive-style encrypted document vault with folder-wise hierarchy & password permissions"}
                </p>
              </div>

              {/* Contextual Action Buttons */}
              <div className="flex items-center gap-2">
                {(activeTab === "my-vault" || activeTab === "my-files") && user?.role !== "admin" && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowFolderModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 shadow-2xs transition cursor-pointer"
                    >
                      <FolderPlus className="h-4 w-4 text-amber-500" />
                      <span>New Folder</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => folderInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 shadow-2xs transition cursor-pointer"
                      title="Upload entire folder from device"
                    >
                      <FolderArchive className="h-4 w-4 text-indigo-600" />
                      <span>Upload Folder</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowUploadModal(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-semibold rounded-xl shadow-md shadow-blue-500/20 transition cursor-pointer"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Upload Files</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Dynamic Real Vault Metrics Strip (With Shared Documents Count) */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
              {/* Card 1: Real Total Files */}
              <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <span>Vault Assets</span>
                  <FileText className="h-4 w-4 text-blue-600" />
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-base font-bold text-slate-900">
                    {userTotalFiles || items.filter((i) => !i.is_folder).length}
                  </span>
                  <span className="text-xs text-slate-500">
                    files ({items.filter((i) => i.is_folder).length} folders)
                  </span>
                </div>
              </div>

              {/* Card 2: Real Storage Used */}
              <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <span>Storage Used</span>
                  <HardDrive className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-base font-bold text-slate-900">
                    {formatBytes(userStorageBytes)}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    / 500 MB ({storagePercent}%)
                  </span>
                </div>
              </div>

              {/* Card 3: Real Shared Documents Count */}
              <button
                type="button"
                onClick={() => {
                  setActiveTab("shared");
                  setCurrentFolderId(null);
                }}
                className={`p-3.5 bg-white rounded-xl border text-left transition cursor-pointer ${
                  activeTab === "shared"
                    ? "border-sky-500 ring-2 ring-sky-500/20 bg-sky-50/40"
                    : "border-slate-200 hover:border-sky-300 hover:bg-sky-50/20 shadow-2xs"
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <span>Shared Documents</span>
                  <Share2 className="h-4 w-4 text-sky-500" />
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-base font-bold text-sky-600">
                    {userSharedFilesCount}
                  </span>
                  <span className="text-xs text-sky-700 font-medium">Active Secure Shares</span>
                </div>
              </button>

              {/* Card 4: Real Protected Assets */}
              <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <span>Protected</span>
                  <Lock className="h-4 w-4 text-amber-600" />
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-base font-bold text-slate-900">
                    {items.filter((i) => i.is_password_protected).length}
                  </span>
                  <span className="text-xs text-amber-700 font-medium">Locked Assets</span>
                </div>
              </div>

              {/* Card 5: Real Starred Assets */}
              <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <span>Starred</span>
                  <Star className="h-4 w-4 text-amber-500 fill-amber-500/20" />
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-base font-bold text-slate-900">
                    {items.filter((i) => i.is_starred).length}
                  </span>
                  <span className="text-xs text-slate-500">Favorites</span>
                </div>
              </div>
            </div>

            {/* Category Filter Pills & View Toggles */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs">
                {[
                  { id: "all", label: "All Items" },
                  { id: "document", label: "Documents" },
                  { id: "spreadsheet", label: "Spreadsheets" },
                  { id: "image", label: "Images" },
                  { id: "archive", label: "Archives" },
                  { id: "code", label: "Code & Scripts" }
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setCategoryFilter(cat.id)}
                    className={`px-3 py-1.5 rounded-full font-medium transition cursor-pointer whitespace-nowrap ${
                      categoryFilter === cat.id
                        ? "bg-slate-900 text-white shadow-2xs font-semibold"
                        : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* View Mode & Sort Dropdown */}
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-600"
                >
                  <option value="date_desc">Newest First</option>
                  <option value="date_asc">Oldest First</option>
                  <option value="name_asc">Name (A-Z)</option>
                  <option value="size_desc">File Size (Largest)</option>
                </select>

                <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`p-1.5 rounded-lg transition ${
                      viewMode === "grid" ? "bg-slate-100 text-blue-600 font-bold" : "text-slate-400 hover:text-slate-700"
                    }`}
                  >
                    <Grid className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={`p-1.5 rounded-lg transition ${
                      viewMode === "list" ? "bg-slate-100 text-blue-600 font-bold" : "text-slate-400 hover:text-slate-700"
                    }`}
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Back to Parent Folder Button if inside a folder */}
            {currentFolderId && (
              <button
                onClick={() => {
                  const parentCrumb = breadcrumbs[breadcrumbs.length - 2];
                  setCurrentFolderId(parentCrumb ? parentCrumb.id : null);
                }}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 rounded-xl border border-slate-200 transition cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to parent directory</span>
              </button>
            )}

            {/* Loading State */}
            {loadingItems ? (
              <div className="py-16 text-center text-slate-400 text-xs">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-600" />
                Retrieving vault files...
              </div>
            ) : items.length === 0 ? (
              /* Contextual Empty State */
              activeTab === "starred" ? (
                <div className="border border-slate-200 rounded-2xl p-12 text-center bg-white/70 shadow-2xs">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-amber-50 flex items-center justify-center">
                    <Star className="h-7 w-7 text-amber-400" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-800">
                    No starred assets yet
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    Star files and folders in your vault to bookmark them here for instant access.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("my-vault")}
                    className="mt-4 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-200 transition cursor-pointer"
                  >
                    Go to My Vault
                  </button>
                </div>
              ) : activeTab === "recent" ? (
                <div className="border border-slate-200 rounded-2xl p-12 text-center bg-white/70 shadow-2xs">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-emerald-50 flex items-center justify-center">
                    <Clock className="h-7 w-7 text-emerald-500" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-800">
                    No recent files found
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    Recently uploaded files will appear here in chronological order.
                  </p>
                </div>
              ) : activeTab === "shared" ? (
                <div className="border border-slate-200 rounded-2xl p-12 text-center bg-white/70 shadow-2xs">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-sky-50 flex items-center justify-center">
                    <Share2 className="h-7 w-7 text-sky-500" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-800">
                    No files shared by you yet
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    Share files securely with collaborators and guests using the share button on any vault file.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("my-vault")}
                    className="mt-4 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-200 transition cursor-pointer"
                  >
                    Go to My Vault
                  </button>
                </div>
              ) : activeTab === "shared-with-me" ? (
                <div className="border border-slate-200 rounded-2xl p-12 text-center bg-white/70 shadow-2xs">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-blue-50 flex items-center justify-center">
                    <Users className="h-7 w-7 text-blue-500" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-800">
                    No files shared with you yet
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    Encrypted files and folders shared with you by other team members will appear here automatically.
                  </p>
                </div>
              ) : activeTab === "trash" ? (
                <div className="border border-slate-200 rounded-2xl p-12 text-center bg-white/70 shadow-2xs">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-rose-50 flex items-center justify-center">
                    <Trash2 className="h-7 w-7 text-rose-500" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-800">
                    Trash is empty
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    Items you delete from your vault will appear here. You can restore them or permanently expunge them.
                  </p>
                </div>
              ) : user?.role === "admin" ? (
                /* Admin File Governance Empty State (No Upload Button) */
                <div className="border border-slate-200 rounded-2xl p-12 text-center bg-white shadow-2xs">
                  <Folder className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-base font-semibold text-slate-800">
                    No Administrative Files
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    In compliance with TrustShare&apos;s zero-knowledge security architecture, standard user files are strictly encrypted and private to their respective owners. File uploads are performed by regular users.
                  </p>
                </div>
              ) : (
                /* Empty Dropzone State ONLY for Standard Users */
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center hover:border-blue-400 bg-white/60 transition cursor-pointer"
                >
                  <UploadCloud className="h-12 w-12 text-blue-500 mx-auto mb-3" />
                  <h3 className="text-base font-semibold text-slate-800">
                    This workspace folder is empty
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    Drag & drop files or folders here, or click to browse files from your device.
                  </p>
                  <button
                    type="button"
                    className="mt-4 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-xs font-semibold hover:bg-blue-100 transition cursor-pointer"
                  >
                    Choose Files to Upload
                  </button>
                </div>
              )
            ) : viewMode === "grid" ? (
              /* ================= GRID VIEW ================= */
              <div className="space-y-6">
                {/* Folders Section */}
                {items.some((i) => i.is_folder) && (
                  <div>
                    <h2 className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-3">
                      Folders
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {items
                        .filter((i) => i.is_folder)
                        .map((folder) => (
                          <div
                            key={folder.id}
                            className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md hover:border-blue-300 transition group flex flex-col justify-between"
                          >
                            <div
                              onClick={() => handleItemClick(folder)}
                              className="flex items-center gap-3 cursor-pointer"
                            >
                              <div className="p-2.5 rounded-xl bg-amber-50">
                                <Folder className="h-6 w-6 text-amber-500 fill-amber-500/20" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-sm text-slate-800 truncate group-hover:text-blue-600 transition">
                                  {folder.name}
                                </p>
                                <p className="text-[11px] text-slate-400">
                                  {folder.is_password_protected ? "Password Protected" : "Folder"}
                                </p>
                              </div>
                            </div>

                            {/* Actions Footer */}
                            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleStar(folder);
                                  }}
                                  className={`p-1 rounded hover:bg-slate-100 transition cursor-pointer ${
                                    folder.is_starred ? "text-amber-400 fill-amber-400" : "text-slate-300 hover:text-slate-500"
                                  }`}
                                  title={folder.is_starred ? "Remove from Starred" : "Add to Starred"}
                                >
                                  <Star className="h-4 w-4" />
                                </button>
                                {folder.is_password_protected && (
                                  <span className="p-1 rounded bg-amber-50 text-amber-700" title="Password Protected">
                                    <Lock className="h-3 w-3" />
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => triggerFolderDownload(folder)}
                                  title="Download Folder as ZIP"
                                  className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded transition cursor-pointer"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setManagePasswordModal({
                                      isOpen: true,
                                      item: folder,
                                      password: "",
                                      action: folder.is_password_protected ? "remove" : "set",
                                      message: "",
                                      error: ""
                                    })
                                  }
                                  title="Manage Password"
                                  className="p-1 text-slate-400 hover:text-amber-600 hover:bg-slate-100 rounded transition cursor-pointer"
                                >
                                  <KeyRound className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRenameModal({ isOpen: true, item: folder, newName: folder.name })}
                                  title="Rename Folder"
                                  className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition cursor-pointer"
                                >
                                  <MoreVertical className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handlePermanentDelete(folder)}
                                  title="Delete Folder"
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded transition cursor-pointer"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Files Section */}
                {items.some((i) => !i.is_folder) && (
                  <div>
                    <h2 className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-3">
                      Files
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {items
                        .filter((i) => !i.is_folder)
                        .map((file) => (
                          <div
                            key={file.id}
                            className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md hover:border-blue-300 transition flex flex-col justify-between group"
                          >
                            <div>
                              <div className="flex items-start justify-between mb-3">
                                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                  {getFileIcon(file)}
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleToggleStar(file)}
                                    className={`p-1 rounded hover:bg-slate-100 transition cursor-pointer ${
                                      file.is_starred ? "text-amber-400 fill-amber-400" : "text-slate-300 hover:text-slate-500"
                                    }`}
                                  >
                                    <Star className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>

                              <p
                                className="font-semibold text-sm text-slate-800 truncate group-hover:text-blue-600 transition"
                                title={file.name}
                              >
                                {file.name}
                              </p>
                              <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 font-mono">
                                <span>{formatBytes(file.file_size)}</span>
                                <span>•</span>
                                <span>{new Date(file.created_at).toLocaleDateString()}</span>
                              </div>
                            </div>

                            {/* Footer Badges & Actions */}
                            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                {file.is_shared && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
                                    <Share2 className="h-2.5 w-2.5" />
                                    <span>Shared</span>
                                  </span>
                                )}
                                {file.is_password_protected ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                    <Lock className="h-2.5 w-2.5" />
                                    <span>Locked</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                                    <ShieldCheck className="h-2.5 w-2.5" />
                                    <span>AES-256</span>
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => triggerFileDownload(file)}
                                  title="Download"
                                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                                >
                                  <Download className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => openShareModal(file)}
                                  title="Share Link"
                                  className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                                >
                                  <Share2 className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() =>
                                    setManagePasswordModal({
                                      isOpen: true,
                                      item: file,
                                      password: "",
                                      action: file.is_password_protected ? "remove" : "set",
                                      message: "",
                                      error: ""
                                    })
                                  }
                                  title="Password Protection"
                                  className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                                >
                                  <KeyRound className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handlePermanentDelete(file)}
                                  title="Delete File"
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ================= LIST / TABLE VIEW ================= */
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                      <tr>
                        <th className="w-10 px-3 py-3.5 text-center"></th>
                        <th className="px-5 py-3.5">Name</th>
                        <th className="px-5 py-3.5">Size</th>
                        <th className="px-5 py-3.5">Security</th>
                        <th className="px-5 py-3.5">Upload Date</th>
                        <th className="px-5 py-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {items.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/70 transition">
                          <td className="w-10 px-3 py-3.5 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleStar(item);
                              }}
                              className={`p-1 rounded hover:bg-slate-100 transition cursor-pointer ${
                                item.is_starred ? "text-amber-400 fill-amber-400" : "text-slate-300 hover:text-slate-500"
                              }`}
                              title={item.is_starred ? "Remove from Starred" : "Add to Starred"}
                            >
                              <Star className="h-4 w-4" />
                            </button>
                          </td>
                          <td className="px-5 py-3.5 font-semibold text-slate-800 flex items-center gap-2.5">
                            {getFileIcon(item)}
                            <button
                              onClick={() => handleItemClick(item)}
                              className={`truncate max-w-md text-left hover:text-blue-600 transition cursor-pointer ${
                                item.is_folder ? "font-bold" : ""
                              }`}
                            >
                              {item.name}
                            </button>
                          </td>
                          <td className="px-5 py-3.5 text-slate-500 font-mono">
                            {item.is_folder ? "-" : formatBytes(item.file_size)}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {item.is_shared && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
                                  <Share2 className="h-3 w-3" />
                                  <span>Shared</span>
                                </span>
                              )}
                              {item.is_password_protected ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                  <Lock className="h-3 w-3" />
                                  <span>Locked</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                                  <ShieldCheck className="h-3 w-3" />
                                  <span>AES-256</span>
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-slate-400 font-mono text-[11px]">
                            {new Date(item.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="inline-flex items-center gap-2">
                              {!item.is_folder && (
                                <button
                                  onClick={() => openShareModal(item)}
                                  title="Secure Share Link"
                                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-sky-600 transition cursor-pointer"
                                >
                                  <Share2 className="h-4 w-4" />
                                </button>
                              )}
                              <button
                                onClick={() => (item.is_folder ? triggerFolderDownload(item) : triggerFileDownload(item))}
                                title="Download"
                                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-blue-600 transition cursor-pointer"
                              >
                                <Download className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() =>
                                  setManagePasswordModal({
                                    isOpen: true,
                                    item,
                                    password: "",
                                    action: item.is_password_protected ? "remove" : "set",
                                    message: "",
                                    error: ""
                                  })
                                }
                                title="Password Protection"
                                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-amber-600 transition cursor-pointer"
                              >
                                <KeyRound className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setRenameModal({ isOpen: true, item, newName: item.name })}
                                title="Rename"
                                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition cursor-pointer"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handlePermanentDelete(item)}
                                title="Delete"
                                className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-500 hover:text-rose-600 transition cursor-pointer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </main>
        )}

        {/* ================================================================== */}
        {/* VIEW 3: USER PERSONAL ACTIVITY LOG VIEW */}
        {/* ================================================================== */}
        {activeTab === "user-activity" && (
          <main className="p-6 md:p-8 space-y-6 flex-1 overflow-y-auto">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                  <Activity className="h-6 w-6 text-cyan-600" />
                  <span>Activity Log</span>
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time chronological audit trail of your file uploads, downloads, deletions, and security events
                </p>
              </div>

              {/* Controls: Date Range Popover, Action Filter, Refresh */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Date Range Picker Popover */}
                <div className="relative" ref={userLogsDatePickerRef}>
                  <button
                    type="button"
                    onClick={() => setIsUserLogsDatePickerOpen(!isUserLogsDatePickerOpen)}
                    className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-2xs"
                  >
                    <Calendar className="h-3.5 w-3.5 text-slate-500" />
                    <span>{userLogsDateRangeLabel}</span>
                    <ChevronDown className="h-3 w-3 text-slate-400" />
                  </button>

                  {isUserLogsDatePickerOpen && (
                    <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 p-4 z-50 text-xs">
                      <div className="font-bold text-slate-900 mb-2">Select Activity Period</div>
                      <div className="grid grid-cols-2 gap-1.5 mb-3">
                        {[
                          { label: "Last 7 Days", days: 7 },
                          { label: "Last 14 Days", days: 14 },
                          { label: "Last 30 Days (Default: Month)", days: 30 },
                          { label: "Last 60 Days", days: 60 },
                          { label: "Last 90 Days", days: 90 },
                          { label: "Past Year", days: 365 },
                        ].map((preset) => (
                          <button
                            key={preset.days}
                            type="button"
                            onClick={() => {
                              setUserLogsDays(preset.days);
                              setUserLogsStartDate("");
                              setUserLogsEndDate("");
                              setUserLogsDateRangeLabel(preset.label);
                              setIsUserLogsDatePickerOpen(false);
                              fetchUserLogs({ days: preset.days, startDate: "", endDate: "" });
                            }}
                            className={`px-2.5 py-1.5 rounded-lg text-left font-medium transition cursor-pointer ${
                              userLogsDays === preset.days && !userLogsStartDate
                                ? "bg-cyan-50 text-cyan-700 font-bold border border-cyan-200"
                                : "hover:bg-slate-50 text-slate-600"
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>

                      <div className="pt-3 border-t border-slate-100">
                        <div className="font-semibold text-slate-700 mb-2 text-[11px] uppercase tracking-wider">
                          Custom Date Range
                        </div>
                        <div className="space-y-2">
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">Start Date</label>
                            <input
                              type="date"
                              value={userLogsCustomStart}
                              onChange={(e) => setUserLogsCustomStart(e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">End Date</label>
                            <input
                              type="date"
                              value={userLogsCustomEnd}
                              onChange={(e) => setUserLogsCustomEnd(e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                            />
                          </div>
                          <button
                            type="button"
                            disabled={!userLogsCustomStart || !userLogsCustomEnd}
                            onClick={() => {
                              if (!userLogsCustomStart || !userLogsCustomEnd) return;
                              setUserLogsStartDate(userLogsCustomStart);
                              setUserLogsEndDate(userLogsCustomEnd);
                              setUserLogsDays(0);
                              setUserLogsDateRangeLabel(`${userLogsCustomStart} to ${userLogsCustomEnd}`);
                              setIsUserLogsDatePickerOpen(false);
                              fetchUserLogs({ startDate: userLogsCustomStart, endDate: userLogsCustomEnd });
                            }}
                            className="w-full py-1.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold rounded-lg transition cursor-pointer text-xs shadow-2xs mt-1"
                          >
                            Apply Custom Range
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Filter by Action */}
                <select
                  value={userLogsActionFilter}
                  onChange={(e) => {
                    const act = e.target.value;
                    setUserLogsActionFilter(act);
                    fetchUserLogs({ action: act });
                  }}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-500 shadow-2xs cursor-pointer"
                >
                  <option value="ALL">All Actions</option>
                  <option value="FILE_UPLOAD">File Uploads</option>
                  <option value="FILE_DOWNLOAD">File Downloads</option>
                  <option value="FILE_DELETE">File Deletions</option>
                  <option value="PASSWORD_SET">Password Protected</option>
                  <option value="PASSWORD_REMOVED">Password Removed</option>
                  <option value="LOGIN_SUCCESS">Login Success</option>
                  <option value="USER_PROFILE_UPDATED">Profile Updates</option>
                </select>

                {/* Refresh Button */}
                <button
                  type="button"
                  onClick={() => fetchUserLogs()}
                  disabled={loadingUserLogs}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 shadow-2xs transition cursor-pointer"
                  title="Refresh Log"
                >
                  <RefreshCw className={`h-3.5 w-3.5 text-slate-600 ${loadingUserLogs ? "animate-spin" : ""}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Recent Telemetry Events
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-700 font-mono font-medium border border-cyan-200">
                    {userLogsDateRangeLabel}
                  </span>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {userLogs.length} Events Logged
                </span>
              </div>

              {loadingUserLogs ? (
                <div className="p-12 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="h-5 w-5 animate-spin text-blue-600" />
                  <span>Loading your activity history...</span>
                </div>
              ) : userLogs.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-500">
                  No activity events recorded yet. Upload or interact with files to generate audit telemetry.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-5 py-3.5">Timestamp</th>
                        <th className="px-5 py-3.5">Action</th>
                        <th className="px-5 py-3.5">Target Resource</th>
                        <th className="px-5 py-3.5">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {userLogs.map((log) => {
                        const renderCleanDetails = (details) => {
                          if (!details || typeof details !== "object" || Object.keys(details).length === 0) {
                            return <span className="text-slate-400">—</span>;
                          }
                          if (details.error || details.reason) {
                            return (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-medium text-[11px]">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"></span>
                                {details.error || details.reason}
                              </span>
                            );
                          }
                          const tags = [];
                          if (details.size_bytes !== undefined && details.size_bytes !== null) {
                            const b = details.size_bytes;
                            const sizeStr = b >= 1024 * 1024 ? `${(b / (1024 * 1024)).toFixed(1)} MB` : b >= 1024 ? `${(b / 1024).toFixed(1)} KB` : `${b} B`;
                            tags.push(`Size: ${sizeStr}`);
                          }
                          if (details.is_password_protected) {
                            tags.push("Password Protected");
                          }
                          if (details.role) {
                            tags.push(`Role: ${details.role.charAt(0).toUpperCase() + details.role.slice(1)}`);
                          }
                          if (details.category) {
                            tags.push(`Category: ${details.category}`);
                          }
                          if (details.permission) {
                            tags.push(`Permission: ${details.permission}`);
                          }
                          if (tags.length > 0) {
                            return (
                              <div className="flex flex-wrap items-center gap-1.5">
                                {tags.map((tag, tIdx) => (
                                  <span key={tIdx} className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium border border-slate-200">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            );
                          }
                          return <span className="text-slate-400">—</span>;
                        };

                        return (
                          <tr key={log.id || log._id} className="hover:bg-slate-50/70 transition">
                            <td className="px-5 py-3.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                              {new Date(log.timestamp).toLocaleString()}
                            </td>
                            <td className="px-5 py-3.5">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                  log.action.includes("FAILED") || log.action.includes("ALERT")
                                    ? "bg-rose-50 text-rose-700 border border-rose-200"
                                    : log.action.includes("UPLOAD")
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : log.action.includes("DOWNLOAD")
                                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                                    : log.action.includes("DELETE") || log.action.includes("TRASH")
                                    ? "bg-rose-50 text-rose-700 border border-rose-200"
                                    : log.action.includes("PASSWORD")
                                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                                    : "bg-slate-100 text-slate-700 border border-slate-200"
                                }`}
                              >
                                {log.action}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 font-medium text-slate-800">
                              {log.resource_name || log.resource_id || "-"}
                            </td>
                            <td className="px-5 py-3.5 text-xs text-slate-600">
                              {renderCleanDetails(log.details)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </main>
        )}
      </div>

      {/* ==================================================================== */}
      {/* MODAL 1: FILE UPLOAD MODAL */}
      {/* ==================================================================== */}
      {showUploadModal && user?.role !== "admin" && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <UploadCloud className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Upload to Workspace Vault</h3>
                  <p className="text-xs text-slate-500">Destination: {currentFolderDetails?.name || "Root Vault"}</p>
                </div>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Storage Quota Remaining Banner */}
            <div className="mb-4 p-3 bg-blue-50/80 border border-blue-200/80 rounded-xl text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-blue-600" />
                <span className="text-slate-600 font-medium">Vault Capacity Quota:</span>
                <span className="font-bold text-slate-900">500 MB</span>
              </div>
              <span className="font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md border border-emerald-200">
                {formatBytes(userRemainingBytes)} Free
              </span>
            </div>

            {uploadError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            <form onSubmit={handleUploadFiles} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Choose Files (Multi-Select Supported)
                  </label>
                  <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    Max: 500 MB per file
                  </span>
                </div>
                <input
                  type="file"
                  multiple
                  onChange={(e) => setUploadFilesList(e.target.files)}
                  className="block w-full text-xs text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer border border-slate-200 rounded-xl p-2"
                />
                {uploadFilesList && uploadFilesList.length > 0 && (() => {
                  const totalBatchBytes = Array.from(uploadFilesList).reduce((acc, f) => acc + (f.size || 0), 0);
                  const isExceeding = totalBatchBytes > userRemainingBytes;
                  const hasOver500MB = Array.from(uploadFilesList).some(f => (f.size || 0) > 500 * 1024 * 1024);
                  return (
                    <div className="mt-2 text-[11px] flex items-center justify-between">
                      <span className="text-slate-600 font-medium">
                        {uploadFilesList.length} file(s) selected ({formatBytes(totalBatchBytes)})
                      </span>
                      {hasOver500MB ? (
                        <span className="text-rose-600 font-bold flex items-center gap-1">
                          <AlertCircle className="h-3.5 w-3.5" />
                          File exceeds 500 MB limit!
                        </span>
                      ) : isExceeding ? (
                        <span className="text-rose-600 font-bold flex items-center gap-1">
                          <AlertCircle className="h-3.5 w-3.5" />
                          Exceeds available storage!
                        </span>
                      ) : (
                        <span className="text-emerald-600 font-semibold flex items-center gap-1">
                          <Check className="h-3.5 w-3.5" />
                          Within 500 MB limit
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Password Protection for Upload */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-amber-600" />
                  <span className="text-xs font-bold text-slate-800">Password Protect Asset (Optional)</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Encrypt access with a password. Anyone downloading will be required to unlock it first.
                </p>
                <div className="relative">
                  <input
                    type={showUploadPassword ? "text" : "password"}
                    value={uploadPassword}
                    onChange={(e) => setUploadPassword(e.target.value)}
                    placeholder="Set an access password..."
                    className="w-full pl-3 pr-10 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowUploadPassword(!showUploadPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
                    aria-label={showUploadPassword ? "Hide password" : "Show password"}
                  >
                    {showUploadPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {isUploading && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>Uploading and hashing...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    isUploading ||
                    !uploadFilesList?.length ||
                    (uploadFilesList &&
                      (Array.from(uploadFilesList).reduce((acc, f) => acc + (f.size || 0), 0) > userRemainingBytes ||
                       Array.from(uploadFilesList).some(f => (f.size || 0) > 500 * 1024 * 1024)))
                  }
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-300 text-white text-xs font-semibold rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5"
                >
                  {isUploading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
                  <span>{isUploading ? "Uploading..." : "Start Upload"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 2: CREATE FOLDER MODAL */}
      {/* ==================================================================== */}
      {showFolderModal && user?.role !== "admin" && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                  <FolderPlus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Create New Folder</h3>
                  <p className="text-xs text-slate-500">In: {currentFolderDetails?.name || "Root Vault"}</p>
                </div>
              </div>
              <button
                onClick={() => setShowFolderModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateFolder} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Folder Name
                </label>
                <input
                  type="text"
                  required
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g. Q4_Financial_Reports"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>

              {/* Password Protection */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-amber-600" />
                  <span className="text-xs font-bold text-slate-800">Folder Password Lock (Optional)</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Lock this entire folder hierarchy with an access password.
                </p>
                <div className="relative">
                  <input
                    type={showNewFolderPassword ? "text" : "password"}
                    value={newFolderPassword}
                    onChange={(e) => setNewFolderPassword(e.target.value)}
                    placeholder="Set folder password..."
                    className="w-full pl-3 pr-10 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewFolderPassword(!showNewFolderPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
                    aria-label={showNewFolderPassword ? "Hide password" : "Show password"}
                  >
                    {showNewFolderPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowFolderModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-semibold rounded-xl shadow-md transition cursor-pointer"
                >
                  Create Folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 3: PASSWORD UNLOCK PROMPT MODAL */}
      {/* ==================================================================== */}
      {passwordModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200">
            <div className="text-center mb-4">
              <div className="h-12 w-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3 shadow-xs">
                <Lock className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-slate-900 text-base">Enter Access Password</h3>
              <p className="text-xs text-slate-500 mt-1">
                &apos;{passwordModal.item?.name}&apos; is password protected.
              </p>
            </div>

            {passwordModal.error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{passwordModal.error}</span>
              </div>
            )}

            <form onSubmit={handleVerifyPassword} className="space-y-4">
              <div className="relative">
                <input
                  type={showUnlockPassword ? "text" : "password"}
                  autoFocus
                  required
                  value={passwordModal.enteredPassword}
                  onChange={(e) => setPasswordModal({ ...passwordModal, enteredPassword: e.target.value })}
                  placeholder="Enter password..."
                  className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowUnlockPassword(!showUnlockPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
                  aria-label={showUnlockPassword ? "Hide password" : "Show password"}
                >
                  {showUnlockPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPasswordModal({ isOpen: false, item: null, actionType: "open", enteredPassword: "", error: "" })}
                  className="flex-1 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-semibold rounded-xl shadow-md transition cursor-pointer"
                >
                  Unlock Access
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 4: MANAGE ITEM PASSWORD (SET OR REMOVE) */}
      {/* ==================================================================== */}
      {managePasswordModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Security Settings</h3>
                  <p className="text-xs text-slate-500 truncate max-w-[180px]">{managePasswordModal.item?.name}</p>
                </div>
              </div>
              <button
                onClick={() => setManagePasswordModal({ isOpen: false, item: null, password: "", action: "set", message: "", error: "" })}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {managePasswordModal.error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                {managePasswordModal.error}
              </div>
            )}

            <form onSubmit={handleManagePasswordSubmit} className="space-y-4">
              <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setManagePasswordModal({ ...managePasswordModal, action: "set" })}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                    managePasswordModal.action === "set" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500"
                  }`}
                >
                  Set Password
                </button>
                {managePasswordModal.item?.is_password_protected && (
                  <button
                    type="button"
                    onClick={() => setManagePasswordModal({ ...managePasswordModal, action: "remove" })}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                      managePasswordModal.action === "remove" ? "bg-white text-rose-700 shadow-2xs" : "text-slate-500"
                    }`}
                  >
                    Remove Lock
                  </button>
                )}
              </div>

              {managePasswordModal.action === "set" ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    {managePasswordModal.item?.is_password_protected ? "New Password" : "Set Access Password"}
                  </label>
                  <div className="relative">
                    <input
                      type={showManagePassword ? "text" : "password"}
                      required
                      value={managePasswordModal.password}
                      onChange={(e) => setManagePasswordModal({ ...managePasswordModal, password: e.target.value })}
                      placeholder="Enter security password..."
                      className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowManagePassword(!showManagePassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
                      aria-label={showManagePassword ? "Hide password" : "Show password"}
                    >
                      {showManagePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800">
                  Removing password protection will make this item accessible without credential verification.
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setManagePasswordModal({ isOpen: false, item: null, password: "", action: "set", message: "", error: "" })}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-semibold rounded-xl shadow-md transition cursor-pointer"
                >
                  {managePasswordModal.action === "remove" ? "Confirm Removal" : "Save Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 5: RENAME ITEM */}
      {/* ==================================================================== */}
      {renameModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="font-bold text-slate-900 mb-1">Rename Item</h3>
            <p className="text-xs text-slate-500 mb-4">Enter a new name for this asset.</p>

            <form onSubmit={handleRenameSubmit} className="space-y-4">
              <input
                type="text"
                required
                value={renameModal.newName}
                onChange={(e) => setRenameModal({ ...renameModal, newName: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenameModal({ isOpen: false, item: null, newName: "" })}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-md transition cursor-pointer"
                >
                  Rename
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Encrypted Secure Sharing Modal */}
      {shareModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 my-8 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100">
                  <Share2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Secure Document Sharing</h3>
                  <p className="text-xs text-slate-500">AES-256 Envelope Encryption & Guest Passcode Gateway</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShareModalItem(null);
                  setCopiedLink(false);
                }}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable Modal Content */}
            <div className="overflow-y-auto flex-1 pr-1 py-3 space-y-4">
              {/* Asset Snapshot Card */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  {getFileIcon(shareModalItem)}
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 text-xs truncate max-w-xs">{shareModalItem.name}</p>
                    <p className="text-[11px] text-slate-400 font-mono">
                      {shareModalItem.is_folder ? "Folder" : formatBytes(shareModalItem.file_size)}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 shrink-0">
                  AES-256-GCM Zero Plaintext
                </span>
              </div>

              {/* Share URL Generated Alert */}
              {shareConfig.createdShareUrl && (
                <div className="p-4 bg-sky-50 rounded-xl border border-sky-200 space-y-2 animate-in fade-in">
                  <div className="flex items-center justify-between text-xs font-semibold text-sky-900">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-sky-600" />
                      Active Secure Link Ready
                    </span>
                    <a
                      href={shareConfig.createdShareUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-600 hover:text-sky-800 flex items-center gap-1 text-[11px] font-bold"
                    >
                      <span>Open Guest Portal</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>

                  <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-sky-200">
                    <input
                      type="text"
                      readOnly
                      value={shareConfig.createdShareUrl}
                      className="bg-transparent text-xs text-slate-700 w-full focus:outline-none font-mono select-all"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(shareConfig.createdShareUrl);
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2000);
                      }}
                      className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-md text-xs font-semibold flex items-center gap-1 transition cursor-pointer shrink-0"
                    >
                      {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedLink ? "Copied!" : "Copy"}</span>
                    </button>
                  </div>

                  {shareConfig.hasGuestPassword && shareConfig.guestPassword && (
                    <div className="text-[11px] text-sky-800 bg-sky-100/60 p-2 rounded-lg flex items-center justify-between">
                      <span>Guest Access Passcode: <strong className="font-mono">{shareConfig.guestPassword}</strong></span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(shareConfig.guestPassword);
                          showToast("Guest passcode copied to clipboard!", "success");
                        }}
                        className="text-sky-700 hover:text-sky-900 underline text-[10px] cursor-pointer"
                      >
                        Copy Passcode
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Configuration Form */}
              <div className="space-y-4 pt-1">
                {/* 1. Permissions Selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    1. Access Permission
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setShareConfig((prev) => ({ ...prev, permission: "download" }))}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                        shareConfig.permission === "download"
                          ? "border-blue-600 bg-blue-50/50 ring-1 ring-blue-600"
                          : "border-slate-200 hover:border-slate-300 bg-white"
                      }`}
                    >
                      <div className="flex items-center gap-2 font-bold text-xs text-slate-800">
                        <Download className="h-3.5 w-3.5 text-blue-600" />
                        <span>Download & View</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">Guest can preview and download decrypted file.</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShareConfig((prev) => ({ ...prev, permission: "view" }))}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                        shareConfig.permission === "view"
                          ? "border-blue-600 bg-blue-50/50 ring-1 ring-blue-600"
                          : "border-slate-200 hover:border-slate-300 bg-white"
                      }`}
                    >
                      <div className="flex items-center gap-2 font-bold text-xs text-slate-800">
                        <Eye className="h-3.5 w-3.5 text-amber-600" />
                        <span>View-Only (Restricted)</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">Guest can only view in browser; downloads blocked.</p>
                    </button>
                  </div>
                </div>

                {/* 2. GUEST PASSWORD PROTECTION (CORE FEATURE) */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2.5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="enableGuestPassword"
                        checked={shareConfig.hasGuestPassword}
                        onChange={(e) =>
                          setShareConfig((prev) => ({ ...prev, hasGuestPassword: e.target.checked }))
                        }
                        className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                      />
                      <label htmlFor="enableGuestPassword" className="text-xs font-bold text-slate-800 cursor-pointer flex items-center gap-1.5">
                        <Lock className="h-3.5 w-3.5 text-amber-600" />
                        <span>Enforce Guest Access Password</span>
                      </label>
                    </div>

                    {shareConfig.hasGuestPassword && (
                      <button
                        type="button"
                        onClick={generateRandomGuestPassword}
                        className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer flex items-center gap-1.5"
                      >
                        <KeyRound className="h-3 w-3" />
                        <span>Generate Code</span>
                      </button>
                    )}
                  </div>

                  <div className="text-[11px] text-slate-500 leading-relaxed bg-white p-2.5 rounded-lg border border-slate-200">
                    <strong className="text-slate-700 block mb-0.5">Original Password Isolation Protection:</strong>
                    Guests can only access this document if they have this guest password. Your master vault password is completely isolated and cannot be used by guests, keeping your account and other files 100% private.
                  </div>

                  {shareConfig.hasGuestPassword && (
                    <div className="relative">
                      <input
                        type={showShareGuestPassword ? "text" : "password"}
                        value={shareConfig.guestPassword}
                        onChange={(e) =>
                          setShareConfig((prev) => ({ ...prev, guestPassword: e.target.value }))
                        }
                        placeholder="Enter or generate guest passcode..."
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowShareGuestPassword(!showShareGuestPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-medium cursor-pointer"
                      >
                        {showShareGuestPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  )}
                </div>

                {/* 3. Link Expiration & Quotas */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-slate-500" />
                      <span>Link Expiration</span>
                    </label>
                    <select
                      value={shareConfig.expirationPreset}
                      onChange={(e) =>
                        setShareConfig((prev) => ({ ...prev, expirationPreset: e.target.value }))
                      }
                      className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="1h">1 Hour (High Security)</option>
                      <option value="24h">24 Hours (Recommended)</option>
                      <option value="7d">7 Days</option>
                      <option value="30d">30 Days</option>
                      <option value="custom">Custom Date & Time</option>
                      <option value="never">Never (Indefinite)</option>
                    </select>

                    {shareConfig.expirationPreset === "custom" && (
                      <input
                        type="datetime-local"
                        value={shareConfig.customExpiresAt}
                        onChange={(e) =>
                          setShareConfig((prev) => ({ ...prev, customExpiresAt: e.target.value }))
                        }
                        className="w-full mt-2 px-2 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Download className="h-3.5 w-3.5 text-slate-500" />
                      <span>Max Downloads Quota</span>
                    </label>
                    <select
                      value={shareConfig.maxDownloads}
                      onChange={(e) =>
                        setShareConfig((prev) => ({ ...prev, maxDownloads: e.target.value }))
                      }
                      className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="">Unlimited Downloads</option>
                      <option value="1">1 Download (Burn After Read)</option>
                      <option value="5">5 Downloads Limit</option>
                      <option value="10">10 Downloads Limit</option>
                    </select>
                  </div>
                </div>

                {shareConfig.error && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />
                    <span>{shareConfig.error}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleCreateShareLink}
                  disabled={shareConfig.creatingShare}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-blue-500/20 disabled:opacity-50"
                >
                  {shareConfig.creatingShare ? (
                    <>
                      <div className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full"></div>
                      <span>Encrypting & Generating Link...</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="h-4 w-4" />
                      <span>Generate Secure Share Link</span>
                    </>
                  )}
                </button>
              </div>

              {/* Active Shares List for this item */}
              {(() => {
                const activeShares = (shareConfig.existingShares || []).filter(
                  (s) => s.is_active !== false && !s.is_expired && !s.is_exhausted
                );
                const inactiveShares = (shareConfig.existingShares || []).filter(
                  (s) => s.is_active === false || s.is_expired || s.is_exhausted
                );

                if (shareConfig.existingShares.length === 0) return null;

                return (
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                    {/* Active Links Section */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                        <span>Active Share Links ({activeShares.length})</span>
                        <span className="text-[10px] text-slate-400 font-normal">Active Guest Access Grants</span>
                      </div>

                      {activeShares.length === 0 ? (
                        <p className="text-[11px] text-slate-400 italic py-1">
                          No active share links. Generate a new link above to share this file.
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                          {activeShares.map((s) => (
                            <div
                              key={s.id}
                              className="p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between text-xs"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 font-mono text-[11px] text-slate-800 dark:text-slate-200">
                                  <span className="truncate max-w-[180px]">{s.share_url}</span>
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 text-[9px] font-bold">
                                    Active
                                  </span>
                                  {s.has_guest_password && (
                                    <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 text-[9px] font-bold">
                                      Guest Passcode
                                    </span>
                                  )}
                                  <span className="px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[9px] capitalize">
                                    {s.permission}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2">
                                  <span>Downloads: {s.downloads_count}{s.max_downloads ? `/${s.max_downloads}` : ""}</span>
                                  <span>•</span>
                                  <span>{s.expires_at ? `Expires ${new Date(s.expires_at).toLocaleDateString()}` : "No expiry"}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0 ml-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const full = `${window.location.origin}${s.share_url}`;
                                    navigator.clipboard.writeText(full);
                                    showToast("Share link copied to clipboard!", "success");
                                  }}
                                  className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition cursor-pointer"
                                  title="Copy Link"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRevokeShare(s.id)}
                                  className="px-2 py-1 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 rounded text-[10px] font-bold transition cursor-pointer"
                                >
                                  Revoke
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Revoked & Inactive Links Section */}
                    {inactiveShares.length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                          <span>Revoked & Inactive Links ({inactiveShares.length})</span>
                          <span className="text-[10px] text-slate-400 font-normal">Access Terminated</span>
                        </div>
                        <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                          {inactiveShares.map((s) => (
                            <div
                              key={s.id}
                              className="p-2 bg-slate-100/60 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-lg flex items-center justify-between text-xs opacity-75"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 font-mono text-[11px] text-slate-500 line-through">
                                  <span className="truncate max-w-[180px]">{s.share_url}</span>
                                  <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400 text-[9px] font-bold no-underline">
                                    {!s.is_active ? "Revoked" : s.is_expired ? "Expired" : "Exhausted"}
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteSharePermanent(s.id)}
                                title="Delete link record completely"
                                className="px-2 py-0.5 bg-slate-200 hover:bg-rose-100 dark:bg-slate-800 dark:hover:bg-rose-950/60 text-slate-600 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 rounded text-[10px] font-medium transition cursor-pointer"
                              >
                                Clear
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Notifications & Security Alerts Modal */}
      {showNotificationsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl relative">
                  <Bell className="h-5 w-5" />
                  {unreadNotificationsCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-3.5 w-3.5 bg-rose-500 rounded-full border-2 border-white" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 text-base">Notifications & Security Alerts</h3>
                    {unreadNotificationsCount > 0 && (
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 rounded-full">
                        {unreadNotificationsCount} unread
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    File sharing, download activities, link expirations & security events
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={fetchNotifications}
                  title="Refresh Notifications"
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer transition"
                >
                  <RefreshCw className={`h-4 w-4 ${loadingNotifications ? "animate-spin text-blue-600" : ""}`} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNotificationsModal(false);
                    markBadgeSeen("alerts");
                  }}
                  className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg cursor-pointer transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Quick Actions Bar */}
            <div className="py-2.5 px-1 flex items-center justify-between text-xs border-b border-slate-100 text-slate-500">
              <span>{notificationsList.length} total event{notificationsList.length === 1 ? "" : "s"}</span>
              <div className="flex items-center gap-3">
                {unreadNotificationsCount > 0 && (
                  <button
                    type="button"
                    onClick={() => handleMarkNotificationRead(null, true)}
                    className="text-blue-600 hover:text-blue-800 font-semibold cursor-pointer transition flex items-center gap-1"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Mark all read
                  </button>
                )}
                {notificationsList.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearNotifications}
                    className="text-slate-500 hover:text-rose-600 font-semibold cursor-pointer transition flex items-center gap-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Clear all
                  </button>
                )}
              </div>
            </div>

            <div className="my-3 max-h-96 overflow-y-auto space-y-2.5 pr-1">
              {notificationsList.length > 0 ? (
                notificationsList.map((notif) => {
                  const isUnread = !notif.is_read;
                  const type = notif.notification_type || "system";
                  
                  // Style & Icon mapping
                  let icon = <Bell className="h-4 w-4 text-blue-600" />;
                  let badgeBg = "bg-blue-50 text-blue-700 border-blue-200";
                  let itemBorder = isUnread ? "border-blue-200 bg-blue-50/30" : "border-slate-200/80 bg-white";

                  if (type === "security_alert") {
                    icon = <ShieldAlert className="h-4 w-4 text-rose-600" />;
                    badgeBg = "bg-rose-50 text-rose-700 border-rose-200";
                    itemBorder = isUnread ? "border-rose-300 bg-rose-50/40" : "border-rose-100 bg-white";
                  } else if (type === "file_share") {
                    icon = <Share2 className="h-4 w-4 text-indigo-600" />;
                    badgeBg = "bg-indigo-50 text-indigo-700 border-indigo-200";
                    itemBorder = isUnread ? "border-indigo-200 bg-indigo-50/30" : "border-slate-200/80 bg-white";
                  } else if (type === "file_download") {
                    icon = <Download className="h-4 w-4 text-emerald-600" />;
                    badgeBg = "bg-emerald-50 text-emerald-700 border-emerald-200";
                    itemBorder = isUnread ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200/80 bg-white";
                  } else if (type === "link_expiration") {
                    icon = <Clock className="h-4 w-4 text-amber-600" />;
                    badgeBg = "bg-amber-50 text-amber-700 border-amber-200";
                    itemBorder = isUnread ? "border-amber-200 bg-amber-50/30" : "border-slate-200/80 bg-white";
                  }

                  const notifId = notif.notification_id || notif._id || notif.id;

                  return (
                    <div
                      key={notifId || Math.random()}
                      className={`p-3.5 border rounded-xl text-xs space-y-1.5 transition ${itemBorder}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-white shadow-xs border border-slate-100">
                            {icon}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block">
                              {notif.notification_title || "Notification"}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400">
                              {new Date(notif.created_at || notif.date_and_time || Date.now()).toLocaleString()}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-md border ${badgeBg}`}>
                            {type.replace("_", " ").toUpperCase()}
                          </span>
                          {isUnread && (
                            <button
                              type="button"
                              onClick={() => handleMarkNotificationRead(notifId)}
                              title="Mark as read"
                              className="p-1 hover:bg-slate-200/70 text-slate-400 hover:text-blue-600 rounded cursor-pointer transition"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <p className="text-[12px] text-slate-700 pt-0.5 leading-relaxed">
                        {notif.notification_message}
                      </p>

                      {/* Optional Target Link */}
                      {notif.target_url && (
                        <div className="pt-1">
                          <a
                            href={notif.target_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 underline"
                          >
                            <span>Open Link</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : securityAlerts.list.length > 0 ? (
                // Fallback to legacy securityAlerts list if present
                securityAlerts.list.map((alert) => (
                  <div
                    key={alert.id}
                    className="p-3.5 bg-rose-50/70 border border-rose-200/80 rounded-xl text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-rose-900 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                        Incorrect Login Attempt
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">
                        {new Date(alert.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-700 pt-1">
                      <div>
                        <span className="text-slate-500">Attempted Target:</span>{" "}
                        <span className="font-semibold text-slate-900">{alert.username || "Unknown"}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Client IP:</span>{" "}
                        <span className="font-mono text-slate-800">{alert.ip_address || "127.0.0.1"}</span>
                      </div>
                    </div>
                    {alert.details?.reason && (
                      <p className="text-[11px] text-rose-700 italic">
                        Reason: {alert.details.reason}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <div className="py-10 text-center text-slate-400 text-xs">
                  <CheckCircle2 className="h-9 w-9 text-emerald-500 mx-auto mb-2" />
                  <p className="font-semibold text-slate-700">No notifications</p>
                  <p className="text-slate-400 mt-0.5">
                    You&apos;re all caught up! No pending file shares, downloads, or security alerts.
                  </p>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setShowNotificationsModal(false);
                  markBadgeSeen("alerts");
                  if (user?.role === "admin") {
                    setActiveTab("admin-security-dashboard");
                  } else {
                    setActiveTab("user-activity");
                  }
                }}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
              >
                <span>View in {user?.role === "admin" ? "Security Dashboard" : "Activity Log"}</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleClearNotifications();
                    markBadgeSeen("alerts");
                    setSecurityAlerts({ count: 0, list: [] });
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer"
                >
                  Clear All
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNotificationsModal(false);
                    markBadgeSeen("alerts");
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition cursor-pointer shadow-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}