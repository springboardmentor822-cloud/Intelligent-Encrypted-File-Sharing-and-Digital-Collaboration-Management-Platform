"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  LineChart,
  Line,
} from "recharts";
import { api } from "@/lib/api";
import {
  Shield,
  Lock,
  FileText,
  Upload,
  Download,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  FileImage,
  FileCode,
  LogOut,
  User as UserIcon,
  Search,
  HardDrive,
  Eye,
  EyeOff,
  Share2,
  Activity,
  Users,
  ChevronRight,
  TrendingUp,
  AlertTriangle,
  LogIn,
  Layers,
  Database,
  BarChart3,
  Clock,
  Filter,
  Globe,
  Key,
  RefreshCw,
  Link2,
  Bell,
  Calendar,
  ChevronDown,
  XCircle,
  Info,
  ShieldAlert,
  Sliders,
} from "lucide-react";

interface User {
  id: number;
  email: string;
  full_name?: string;
  role: "admin" | "user" | "guest";
}

interface FileItem {
  id: number;
  filename: string;
  original_filename: string;
  file_size: number;
  content_type: string | null;
  uploaded_at: string;
  is_encrypted?: boolean;
  encryption_algorithm?: string;
  sha256_hash?: string;
}

interface ShareLinkItem {
  id: number;
  file_id: number;
  original_filename: string;
  permission: "download" | "view";
  created_at: string;
  expires_at: string;
  is_revoked: boolean;
  download_count: number;
  max_downloads: number | null;
  token?: string;
  share_url?: string;
}

export default function TrustShareApp() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "register">("login");

  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"user" | "admin" | "guest">("user");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // User Workspace State
  const [userTab, setUserTab] = useState<"files" | "shares" | "analytics" | "security">("files");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Milestone 2: Secure File Sharing State
  const [userShareLinks, setUserShareLinks] = useState<ShareLinkItem[]>([]);
  const [sharingModalFile, setSharingModalFile] = useState<FileItem | null>(null);
  const [shareHours, setShareHours] = useState<number>(24);
  const [sharePermission, setSharePermission] = useState<"download" | "view">("download");
  const [shareMaxDownloads, setShareMaxDownloads] = useState<string>("");
  const [generatedShareUrl, setGeneratedShareUrl] = useState<string>("");
  const [shareLoading, setShareLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Public Recipient Shared File Modal State
  const [publicShareToken, setPublicShareToken] = useState<string>("");
  const [publicShareModalOpen, setPublicShareModalOpen] = useState(false);
  const [publicShareData, setPublicShareData] = useState<any>(null);
  const [publicShareLoading, setPublicShareLoading] = useState(false);
  const [publicShareError, setPublicShareError] = useState("");

  // Admin Dashboard State
  // Milestone 3 State: Notifications
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState<number>(0);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState<boolean>(false);

  // Milestone 3 State: Storage Analytics & Reports & Security Monitoring
  const [adminTab, setAdminTab] = useState<"security" | "dashboard" | "users" | "files" | "analytics" | "reports" | "logs">("security");
  const [storageAnalytics, setStorageAnalytics] = useState<any>(null);
  const [userStorageList, setUserStorageList] = useState<any[]>([]);
  const [fileStats, setFileStats] = useState<any>(null);
  const [reportTab, setReportTab] = useState<"uploads" | "downloads" | "sharing" | "security">("uploads");
  const [reportsData, setReportsData] = useState<any>(null);
  const [securityAlerts, setSecurityAlerts] = useState<any[]>([]);
  const [securitySummary, setSecuritySummary] = useState<any>(null);
  const [alertSeverityFilter, setAlertSeverityFilter] = useState<string>("ALL");
  const [simulatingEvent, setSimulatingEvent] = useState<boolean>(false);
  const [recipientEmail, setRecipientEmail] = useState<string>("");
  const [securityData, setSecurityData] = useState<any>(null);
  const [adminMetrics, setAdminMetrics] = useState<any>(null);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [adminLogs, setAdminLogs] = useState<any[]>([]);
  const [logFilter, setLogFilter] = useState("ALL");
  const [adminUserSearch, setAdminUserSearch] = useState("");
  const [adminFileSearch, setAdminFileSearch] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [selectedSecCard, setSelectedSecCard] = useState<"ALL" | "SUCCESS" | "FAILED" | "UNAUTHORIZED" | "EVENTS">("ALL");
  const [activeSecurityModal, setActiveSecurityModal] = useState<any>(null);

  // Check saved session on initial load
  useEffect(() => {
    const savedToken = localStorage.getItem("trustshare_token");
    const savedUser = localStorage.getItem("trustshare_user");
    if (savedToken && savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        // invalid cached user
      }
    }
  }, []);

  // Fetch real user files
  const fetchFiles = async () => {
    try {
      const res = await api.get("/files/");
      setFiles(res.data);
    } catch (err: any) {
      console.error("Failed to load files", err);
    }
  };

  // Fetch real admin telemetry
  // Milestone 3: Fetch Notifications
  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const [listRes, countRes] = await Promise.all([
        api.get("/notifications?limit=20"),
        api.get("/notifications/unread-count"),
      ]);
      setNotifications(listRes.data);
      setUnreadNotifCount(countRes.data.unread_count || 0);
    } catch (e) {
      console.error("Notifications fetch error", e);
    }
  };

  const handleMarkNotificationRead = async (id: number) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
      setUnreadNotifCount((prev) => Math.max(0, prev - 1));
    } catch (e) {
      console.error("Mark read error", e);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      await api.post("/notifications/mark-all-read");
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadNotifCount(0);
    } catch (e) {
      console.error("Mark all read error", e);
    }
  };

  // Milestone 3: Storage Analytics
  const fetchStorageAnalytics = async () => {
    try {
      const [storageRes, usersRes, filesRes] = await Promise.all([
        api.get("/analytics/storage"),
        api.get("/analytics/users/storage"),
        api.get("/analytics/files"),
      ]);
      setStorageAnalytics(storageRes.data);
      setUserStorageList(usersRes.data);
      setFileStats(filesRes.data);
    } catch (e) {
      console.error("Storage analytics error", e);
    }
  };

  // Milestone 3: Reports
  const fetchReports = async (type: "uploads" | "downloads" | "sharing" | "security") => {
    try {
      const res = await api.get(`/reports/${type}`);
      setReportsData(res.data);
    } catch (e) {
      console.error("Reports error", e);
    }
  };

  const handleExportCSV = async (type: string) => {
    try {
      const res = await api.get(`/reports/export/csv?report_type=${type}`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `trustshare_${type}_report.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      console.error("CSV Export error", e);
    }
  };

  // Milestone 3: Security Monitoring & Suspicious Activity Detection
  const fetchSecurityMonitoring = async () => {
    try {
      const sevParam = alertSeverityFilter !== "ALL" ? `?severity=${alertSeverityFilter}` : "";
      const [sumRes, alertsRes] = await Promise.all([
        api.get("/security-monitoring/summary"),
        api.get(`/security-monitoring/alerts${sevParam}`),
      ]);
      setSecuritySummary(sumRes.data);
      setSecurityAlerts(alertsRes.data);
    } catch (e) {
      console.error("Security monitoring error", e);
    }
  };

  const handleResolveAlert = async (id: number) => {
    try {
      await api.post(`/security-monitoring/alerts/${id}/resolve`);
      setSecurityAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, status: "resolved" } : a)));
      fetchSecurityMonitoring();
    } catch (e) {
      console.error("Resolve alert error", e);
    }
  };

  const handleSimulateSuspiciousEvent = async (eventType: string) => {
    setSimulatingEvent(true);
    try {
      await api.post(`/security-monitoring/simulate-suspicious-event?event_type=${eventType}`);
      await fetchSecurityMonitoring();
      await fetchNotifications();
      fetchAdminTelemetry();
    } catch (e) {
      console.error("Simulate suspicious event error", e);
    } finally {
      setSimulatingEvent(false);
    }
  };

  const fetchAdminTelemetry = async () => {
    if (user?.role !== "admin") return;
    setAdminLoading(true);
    try {
      const [secRes, metRes, usersRes, logsRes] = await Promise.all([
        api.get("/admin/security-metrics"),
        api.get("/admin/metrics"),
        api.get("/admin/users"),
        api.get("/admin/logs?limit=50"),
      ]);
      setSecurityData(secRes.data);
      setAdminMetrics(metRes.data);
      setAdminUsers(usersRes.data);
      setAdminLogs(logsRes.data);
      fetchStorageAnalytics();
      fetchSecurityMonitoring();
      fetchReports(reportTab);
    } catch (err) {
      console.error("Failed to load admin security telemetry", err);
    } finally {
      setAdminLoading(false);
    }
  };

  const handleLogFilterChange = async (action: string) => {
    setLogFilter(action);
    setAdminLoading(true);
    try {
      const url = action === "ALL" ? "/admin/logs?limit=50" : `/admin/logs?limit=50&action=${action}`;
      const res = await api.get(url);
      setAdminLogs(res.data);
    } catch (err) {
      console.error("Failed to load filtered logs", err);
    } finally {
      setAdminLoading(false);
    }
  };

  // Milestone 2: Fetch Share Links
  const fetchShareLinks = async () => {
    if (!user) return;
    try {
      const res = await api.get("/files/shares/all");
      setUserShareLinks(res.data);
    } catch (err) {
      console.error("Failed to load share links", err);
    }
  };

  // Milestone 2: Fetch Public Shared File Info
  const fetchPublicShareInfo = async (token: string) => {
    setPublicShareLoading(true);
    setPublicShareError("");
    try {
      const res = await api.get(`/files/public/share/${token}/info`);
      setPublicShareData(res.data);
    } catch (err: any) {
      setPublicShareError(err.response?.data?.detail || "Invalid, expired, or revoked share link.");
      setPublicShareData(null);
    } finally {
      setPublicShareLoading(false);
    }
  };

  // Milestone 2: Create Secure Share Link
  const handleCreateShareLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sharingModalFile) return;
    setShareLoading(true);
    try {
      const parsedMax = shareMaxDownloads.trim() ? parseInt(shareMaxDownloads.trim()) : null;
      const res = await api.post(`/files/${sharingModalFile.id}/share`, {
        expires_in_hours: shareHours,
        permission: sharePermission,
        max_downloads: parsedMax,
        recipient_email: recipientEmail.trim() || null,
      });
      setGeneratedShareUrl(res.data.share_url);
      fetchShareLinks();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to create secure share link.");
    } finally {
      setShareLoading(false);
    }
  };

  // Milestone 2: Revoke Share Link
  const handleRevokeShareLink = async (linkId: number) => {
    if (!confirm("Are you sure you want to revoke this share link? Recipients will immediately lose access.")) return;
    try {
      await api.post(`/files/shares/${linkId}/revoke`);
      fetchShareLinks();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to revoke share link.");
    }
  };

  // Milestone 2: Download Public Shared File (with in-memory decryption)
  const handlePublicDownload = async (token: string, originalName: string, permission: string) => {
    try {
      const res = await api.get(`/files/public/share/${token}/download`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      if (permission === "view") {
        window.open(url, "_blank");
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", originalName);
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
    } catch (err: any) {
      alert("Failed to access file. The share link may have expired or been revoked.");
    }
  };

  // Check URL query parameters for ?token=... or ?share=... on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get("token") || urlParams.get("share");
      if (token) {
        setPublicShareToken(token);
        fetchPublicShareInfo(token);
        setPublicShareModalOpen(true);
      }
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchFiles();
      if (user.role === "admin") {
        fetchAdminTelemetry();
      }
      if (userTab === "shares") {
        fetchShareLinks();
      }
    }
  }, [user, userTab]);

  // Handle Registration
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccess("");
    setAuthLoading(true);
    try {
      await api.post("/auth/register", {
        email,
        password,
        full_name: fullName,
        role,
      });
      setAuthSuccess("Account created successfully! Switching to sign in...");
      setTimeout(() => {
        setAuthTab("login");
        setAuthSuccess("");
      }, 1400);
    } catch (err: any) {
      setAuthError(err.response?.data?.detail || "Registration failed. Try again.");
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccess("");
    setAuthLoading(true);
    try {
      const res = await api.post("/auth/login", { email, password });
      localStorage.setItem("trustshare_token", res.data.access_token);
      localStorage.setItem("trustshare_user", JSON.stringify(res.data.user));
      setUser(res.data.user);
      setShowAuthModal(false);
      setPassword("");
    } catch (err: any) {
      setAuthError(err.response?.data?.detail || "Invalid credentials. Try again.");
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle Logout
  const handleLogout = () => {
    localStorage.removeItem("trustshare_token");
    localStorage.removeItem("trustshare_user");
    setUser(null);
    setFiles([]);
    setSecurityData(null);
    setAdminMetrics(null);
    setAdminUsers([]);
    setAdminLogs([]);
  };

  // Handle File Upload (Users only)
  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setUploadLoading(true);
    setUploadStatus("");

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      await api.post("/files/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUploadStatus("File uploaded and encrypted successfully!");
      setSelectedFile(null);
      fetchFiles();
      setTimeout(() => setUploadStatus(""), 3500);
    } catch (err: any) {
      setUploadStatus(err.response?.data?.detail || "Upload failed.");
    } finally {
      setUploadLoading(false);
    }
  };

  // Handle File Download
  const handleDownload = async (fileId: number, originalName: string) => {
    try {
      const res = await api.get(`/files/${fileId}/download`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", originalName);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert("Download failed. You may lack permission.");
    }
  };

  // Handle File Delete
  const handleDelete = async (fileId: number) => {
    if (!confirm("Are you sure you want to permanently delete this file?")) return;
    try {
      await api.delete(`/files/${fileId}`);
      setFiles(files.filter((f) => f.id !== fileId));
      if (user?.role === "admin") {
        fetchAdminTelemetry();
      }
    } catch (err) {
      alert("Delete failed. You may lack permission.");
    }
  };

  // Real Storage Quota Calculations
  const totalSizeBytes = useMemo(() => {
    return files.reduce((acc, f) => acc + (f.file_size || 0), 0);
  }, [files]);
  const totalSizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(2);
  const quotaPercent = Math.min(100, Math.round((totalSizeBytes / (50 * 1024 * 1024)) * 100));

  // Admin platform storage calculation (real sum from PostgreSQL)
  const adminStorageBytes = adminMetrics?.total_storage_bytes || 0;
  const adminStoragePercent = Math.min(100, Math.round((adminStorageBytes / (50 * 1024 * 1024)) * 100));

  const filteredFiles = useMemo(() => {
    return files.filter((f) => {
      const matchesSearch = f.original_filename.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;
      if (selectedCategory === "all") return true;
      if (selectedCategory === "pdf") return f.original_filename.toLowerCase().endsWith(".pdf");
      if (selectedCategory === "docs")
        return [".doc", ".docx", ".txt"].some((ext) => f.original_filename.toLowerCase().endsWith(ext));
      if (selectedCategory === "sheets")
        return [".xls", ".xlsx", ".csv"].some((ext) => f.original_filename.toLowerCase().endsWith(ext));
      if (selectedCategory === "images")
        return [".png", ".jpg", ".jpeg", ".svg", ".webp"].some((ext) =>
          f.original_filename.toLowerCase().endsWith(ext)
        );
      return true;
    });
  }, [files, selectedCategory, searchQuery]);

  const filteredAdminUsers = useMemo(() => {
    return adminUsers.filter((u) => {
      const q = adminUserSearch.toLowerCase();
      const email = (u.email || "").toLowerCase();
      const name = (u.full_name || "").toLowerCase();
      const role = (u.role || "").toLowerCase();
      return email.includes(q) || name.includes(q) || role.includes(q);
    });
  }, [adminUsers, adminUserSearch]);

  const filteredAdminFiles = useMemo(() => {
    return files.filter((f) => {
      const q = adminFileSearch.toLowerCase();
      const filename = (f.original_filename || "").toLowerCase();
      return filename.includes(q);
    });
  }, [files, adminFileSearch]);

  const getFileIcon = (filename: string) => {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext === "pdf") return <FileText className="w-5 h-5 text-rose-400" />;
    if (["xls", "xlsx", "csv"].includes(ext || ""))
      return <FileSpreadsheet className="w-5 h-5 text-emerald-400" />;
    if (["png", "jpg", "jpeg", "svg", "webp"].includes(ext || ""))
      return <FileImage className="w-5 h-5 text-teal-400" />;
    return <FileCode className="w-5 h-5 text-slate-300" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatLocalDateTime = (dateStr?: string | null): string => {
    if (!dateStr) return "N/A";
    try {
      const hasTz = dateStr.endsWith("Z") || /[+-]\d{2}(:\d{2})?$/.test(dateStr);
      const normalized = hasTz ? dateStr : `${dateStr}Z`;
      const d = new Date(normalized);
      if (isNaN(d.getTime())) return dateStr;
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");
      const seconds = String(d.getSeconds()).padStart(2, "0");
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } catch {
      return dateStr;
    }
  };

  const SECURITY_MODULES = [
    {
      id: "aes",
      title: "AES-256 Encryption",
      desc: "All files are encrypted using industry-standard AES-256 encryption before storage.",
      icon: Lock,
      color: "text-emerald-400 bg-emerald-500/10",
      spec: "Cipher: AES-256-CBC with dynamic per-file IV. Cryptographic hash: SHA-256 digest validation.",
      status: "Active & Enforced",
    },
    {
      id: "tls",
      title: "HTTPS/TLS Communication",
      desc: "All data is transmitted securely using HTTPS/TLS encryption.",
      icon: Globe,
      color: "text-blue-400 bg-blue-500/10",
      spec: "Transport Layer Security TLS 1.3 enforced. All in-transit packets encrypted against eavesdropping.",
      status: "Active & Enforced",
    },
    {
      id: "jwt",
      title: "JWT Authentication",
      desc: "Secure token-based authentication for protected API access.",
      icon: Key,
      color: "text-purple-400 bg-purple-500/10",
      spec: "Algorithm: HMAC-SHA256 (HS256) with 1440-minute TTL expiry and client signature verification.",
      status: "Active & Enforced",
    },
    {
      id: "oauth",
      title: "OAuth2 Authentication",
      desc: "Sign in using your Google or Microsoft account credentials.",
      icon: Users,
      color: "text-rose-400 bg-rose-500/10",
      spec: "OAuth2 Bearer Token specification with RFC 6749 compliance and automated token refresh cycles.",
      status: "Active & Enforced",
    },
    {
      id: "rbac",
      title: "Role-Based Access Control",
      desc: "Access and permissions are managed based on assigned role.",
      icon: Shield,
      color: "text-cyan-400 bg-cyan-500/10",
      spec: "3-tier hierarchical RBAC: Administrator (Governance/Audit), User (Encrypted Vault), Guest (Read-only).",
      status: "Active & Enforced",
    },
    {
      id: "links",
      title: "Temporary Share Links",
      desc: "Create time-limited secure links with custom permissions.",
      icon: Link2,
      color: "text-blue-400 bg-blue-500/10",
      spec: "Configurable link expiration (1 hour to 7 days), maximum download thresholds, and revocation tokens.",
      status: "Active & Enforced",
    },
    {
      id: "downloads",
      title: "Download Tracking",
      desc: "Track all file downloads and inspect historical access records.",
      icon: BarChart3,
      color: "text-emerald-400 bg-emerald-500/10",
      spec: "Audit logging tracks user ID, client IP, timestamp, and byte transfer for every download.",
      status: "Active & Enforced",
    },
    {
      id: "audit",
      title: "Audit Logging",
      desc: "Maintain detailed logs of all security events and file activities.",
      icon: FileText,
      color: "text-teal-400 bg-teal-500/10",
      spec: "Dual-persistence compliance: MongoDB Atlas document store with resilient PostgreSQL ACID fallback.",
      status: "Active & Enforced",
    },
    {
      id: "tokens",
      title: "Secure Token Generation",
      desc: "Generate secure tokens for file access and authenticated sharing.",
      icon: Sliders,
      color: "text-blue-400 bg-blue-500/10",
      spec: "CSPRNG (Cryptographically Secure Pseudo-Random Number Generator) with 256-bit entropy.",
      status: "Active & Enforced",
    },
    {
      id: "rotation",
      title: "Key Rotation",
      desc: "Encryption keys are rotated periodically for enhanced security.",
      icon: RefreshCw,
      color: "text-teal-400 bg-teal-500/10",
      spec: "Scheduled master key rotation policy with re-encryption envelope wrapping and key versioning.",
      status: "Active & Enforced",
    },
  ];

  const displayLogins = useMemo(() => {
    const allLogins = securityData?.recent_logins || [];
    if (selectedSecCard === "SUCCESS") return allLogins.filter((l: any) => l.status === "Success");
    if (selectedSecCard === "FAILED") return allLogins.filter((l: any) => l.status === "Failed");
    return allLogins;
  }, [securityData?.recent_logins, selectedSecCard]);

  const displaySecEvents = useMemo(() => {
    const allEvts = securityData?.recent_security_events || [];
    if (selectedSecCard === "UNAUTHORIZED")
      return allEvts.filter(
        (e: any) =>
          e.event.toLowerCase().includes("unauthorized") ||
          e.event.toLowerCase().includes("failed") ||
          e.severity === "High"
      );
    return allEvts;
  }, [securityData?.recent_security_events, selectedSecCard]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* 1. Global Navigation Bar */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 px-6 lg:px-12 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
                TrustShare
              </span>
              {user && (
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                  {user.role === "admin" ? "Admin Panel" : "User Panel"}
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-500 -mt-0.5">Secure File-Sharing System</p>
          </div>
        </div>

        {/* Global Search */}
        {user && (
          <div className="hidden md:flex items-center gap-4 flex-1 max-w-md mx-8">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-2.5" />
              <input
                type="text"
                placeholder={user.role === "admin" ? "Search users, files, logs..." : "Search files, folders..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-1.5 rounded-xl bg-slate-900 border border-slate-800 focus:border-emerald-500 focus:outline-none text-xs text-white placeholder-slate-500 transition"
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-3 text-sm">
          {/* Milestone 2: Direct Access Shared Link Button */}
          <button
            onClick={() => setPublicShareModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500/40 text-slate-300 hover:text-emerald-400 text-xs font-medium transition"
            title="Open an encrypted file via secure share link token"
          >
            <Link2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Access Share Link</span>
          </button>

          {/* Milestone 3: Notification Bell & Live Panel */}
          {user && (
            <div className="relative">
              <button
                onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
                className="relative p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500/40 text-slate-300 hover:text-white transition"
                title="Notifications"
              >
                <Bell className="w-4 h-4 text-emerald-400" />
                {unreadNotifCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-[10px] font-bold text-white flex items-center justify-center animate-pulse">
                    {unreadNotifCount > 9 ? "9+" : unreadNotifCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown Drawer */}
              {notifDropdownOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-slate-900/95 border border-slate-800 shadow-2xl backdrop-blur-xl z-50 overflow-hidden divide-y divide-slate-800/60 animate-in fade-in zoom-in-95 duration-150">
                  <div className="p-3.5 flex items-center justify-between bg-slate-950/70">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-emerald-400" />
                      <span className="font-bold text-xs text-white">Notifications</span>
                      {unreadNotifCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-mono font-bold">
                          {unreadNotifCount} unread
                        </span>
                      )}
                    </div>
                    {unreadNotifCount > 0 && (
                      <button
                        onClick={handleMarkAllNotificationsRead}
                        className="text-[11px] text-emerald-400 hover:underline font-medium"
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/40">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500">
                        No notifications yet.
                      </div>
                    ) : (
                      notifications.map((n) => {
                        const isAlert = n.notification_type === "SECURITY_ALERT";
                        const isShared = n.notification_type === "FILE_SHARED";
                        return (
                          <div
                            key={n.id}
                            className={`p-3 text-xs transition flex items-start gap-2.5 ${
                              !n.is_read ? "bg-emerald-950/20" : "hover:bg-slate-850"
                            }`}
                          >
                            <div className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                              isAlert ? "bg-rose-500/20 text-rose-400" : isShared ? "bg-blue-500/20 text-blue-400" : "bg-emerald-500/20 text-emerald-400"
                            }`}>
                              {isAlert ? <ShieldAlert className="w-3.5 h-3.5" /> : isShared ? <Share2 className="w-3.5 h-3.5" /> : <Info className="w-3.5 h-3.5" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`font-semibold ${!n.is_read ? "text-white" : "text-slate-300"}`}>
                                {n.title}
                              </p>
                              <p className="text-slate-400 text-[11px] mt-0.5 line-clamp-2">
                                {n.message}
                              </p>
                              <span className="text-[10px] text-slate-500 font-mono mt-1 block">
                                {n.created_at ? new Date(n.created_at).toLocaleString() : ""}
                              </span>
                            </div>
                            {!n.is_read && (
                              <button
                                onClick={() => handleMarkNotificationRead(n.id)}
                                className="text-[10px] text-emerald-400 hover:text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/20 hover:bg-emerald-500/10 shrink-0"
                              >
                                Read
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {user ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2.5 pl-2 border-l border-slate-800">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center font-bold text-white text-xs shadow-md shadow-emerald-500/20">
                  {user.full_name ? user.full_name[0].toUpperCase() : user.email[0].toUpperCase()}
                </div>
                <div className="hidden lg:block text-left text-xs">
                  <p className="font-semibold text-white leading-tight">{user.full_name || "User"}</p>
                  <p className="text-[10px] text-slate-500 capitalize">{user.role} Account</p>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="ml-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition text-xs font-semibold"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setAuthTab("login");
                  setShowAuthModal(true);
                }}
                className="px-4 py-2 rounded-xl text-slate-300 hover:text-white font-medium transition"
              >
                Sign In
              </button>
              <button
                onClick={() => {
                  setAuthTab("register");
                  setShowAuthModal(true);
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-lg shadow-emerald-500/20 transition"
              >
                Get Started
              </button>
            </div>
          )}
        </div>
      </header>

      {/* 2. Main Page Content */}
      {!user ? (
        /* ================= LANDING PAGE ================= */
        <main className="flex-1 flex flex-col">
          <section id="home" className="max-w-7xl mx-auto w-full px-6 lg:px-12 pt-12 pb-16 lg:pt-20 lg:pb-24 flex flex-col lg:flex-row items-center justify-between gap-12">
            <div className="flex-1 space-y-6 text-left">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold tracking-wide">
                <Lock className="w-3.5 h-3.5" />
                <span>Secure • Private • Reliable</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.15] text-white">
                Secure File Sharing for a{" "}
                <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-green-400 bg-clip-text text-transparent">
                  Safer Tomorrow
                </span>
              </h1>

              <p className="text-slate-400 text-base sm:text-lg leading-relaxed max-w-xl">
                Upload, store, and share your important files with end-to-end security, encryption,
                and complete control. Designed for individuals, teams, and organizations.
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  onClick={() => {
                    setAuthTab("register");
                    setShowAuthModal(true);
                  }}
                  className="px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-xl shadow-emerald-500/25 transition flex items-center gap-2"
                >
                  <span>Get Started</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setAuthTab("login");
                    setShowAuthModal(true);
                  }}
                  className="px-6 py-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white font-semibold text-sm transition flex items-center gap-2"
                >
                  <span>Sign In</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-5 pt-4 text-xs font-medium text-slate-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>AES-256 Encrypted Storage</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Controlled Sharing</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Audit Logs</span>
                </div>
              </div>
            </div>

            <div className="flex-1 w-full max-w-lg relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-3xl blur-2xl opacity-60"></div>
              <div className="relative bg-slate-900/90 border border-slate-800 rounded-3xl p-8 shadow-2xl backdrop-blur-xl space-y-5 text-center">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/20">
                  <Shield className="w-7 h-7" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-white">Zero-Knowledge Cryptographic Vault</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    All document payloads are encrypted with AES-256 upon intake. Sign in or register to inspect your private storage or manage platform compliance.
                  </p>
                </div>
                <div className="pt-2 flex justify-center">
                  <button
                    onClick={() => {
                      setAuthTab("login");
                      setShowAuthModal(true);
                    }}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-500/20 transition"
                  >
                    Access Your Vault →
                  </button>
                </div>
              </div>
            </div>
          </section>

          <footer className="mt-auto border-t border-slate-800 py-6 text-center text-xs text-slate-500">
            © 2026 TrustShare Platform. Intelligent Encrypted File Sharing.
          </footer>
        </main>
      ) : user.role === "admin" ? (
        /* ================= ADMINISTRATOR PANEL ================= */
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Admin Sidebar Navigation */}
          <aside className="w-full md:w-64 border-r border-slate-800/80 bg-slate-950/70 p-5 flex flex-col justify-between shrink-0">
            <div className="space-y-6">
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider px-3 mb-2">
                  Admin Panel
                </p>
                <div className="space-y-1">
                  {[
                    { id: "security", label: "Security Monitoring", icon: ShieldAlert },
                    { id: "dashboard", label: "Platform Overview", icon: BarChart3 },
                    { id: "analytics", label: "Storage Analytics", icon: HardDrive },
                    { id: "reports", label: "Activity Reports", icon: FileText },
                    { id: "users", label: "User Management", icon: Users },
                    { id: "files", label: "Secure File Registry", icon: Layers },
                    { id: "logs", label: "Audit Logs", icon: Activity },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setAdminTab(item.id as any)}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
                          adminTab === item.id
                            ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                            : "text-slate-400 hover:text-white hover:bg-slate-900"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* REAL Storage Usage Widget */}
              <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span className="flex items-center gap-1.5 font-medium">
                    <HardDrive className="w-3.5 h-3.5 text-emerald-400" /> Platform Storage
                  </span>
                  <span className="font-mono text-emerald-400 font-bold">{adminStoragePercent}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    style={{ width: `${adminStoragePercent}%` }}
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
                  ></div>
                </div>
                <p className="text-[11px] font-mono text-slate-400">
                  {formatFileSize(adminStorageBytes)} / 50 MB
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-500/30 hover:bg-rose-500/5 transition text-xs font-medium"
            >
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </aside>

          {/* Admin Main Stage */}
          <main className="flex-1 p-6 md:p-8 overflow-y-auto space-y-6">
            {/* VIEW 1: SECURITY DASHBOARD */}
            {adminTab === "security" && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {/* Live Detected Security Alerts Feed */}
                {securityAlerts.length > 0 && (
                  <div className="rounded-2xl border border-rose-500/30 bg-slate-900/60 backdrop-blur-xl overflow-hidden p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-400" />
                        <span>Active Security Threats & Suspicious Violations ({securityAlerts.filter(a => a.status === 'active').length} active)</span>
                      </h3>
                      <div className="flex items-center gap-2">
                        <select
                          value={alertSeverityFilter}
                          onChange={(e) => {
                            setAlertSeverityFilter(e.target.value);
                            fetchSecurityMonitoring();
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300"
                        >
                          <option value="ALL">All Severities</option>
                          <option value="High">High Severity</option>
                          <option value="Medium">Medium Severity</option>
                          <option value="Low">Low Severity</option>
                        </select>
                      </div>
                    </div>
                    <div className="divide-y divide-slate-800/60 max-h-60 overflow-y-auto">
                      {securityAlerts.map((alt) => (
                        <div key={alt.id} className="py-2.5 flex items-center justify-between gap-4 text-xs">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                alt.severity === "High" ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                              }`}>
                                {alt.severity}
                              </span>
                              <span className="font-semibold text-white">{alt.activity_type}</span>
                              <span className="text-slate-500 font-mono text-[11px]">{alt.ip_address}</span>
                            </div>
                            <p className="text-slate-300 text-xs">{alt.description}</p>
                          </div>
                          {alt.status === "active" ? (
                            <button
                              onClick={() => handleResolveAlert(alt.id)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold shrink-0"
                            >
                              Resolve
                            </button>
                          ) : (
                            <span className="text-xs text-slate-500 italic shrink-0">Resolved</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 1. Header Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
                  <div>
                    <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
                      <ShieldAlert className="w-6 h-6 text-emerald-400" />
                      <span>Security Dashboard</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Monitor live login activity, access attempts, security events and audit logs
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={fetchAdminTelemetry}
                      disabled={adminLoading}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 text-xs font-semibold text-emerald-400 flex items-center gap-1.5 transition"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${adminLoading ? "animate-spin" : ""}`} />
                      <span>Refresh Telemetry</span>
                    </button>
                  </div>
                </div>

                {/* Active Filter Pill */}
                {selectedSecCard !== "ALL" && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-emerald-500/30 text-xs">
                    <span className="text-slate-300">
                      Filtering activity by: <strong className="text-emerald-400 capitalize">{selectedSecCard.replace("_", " ")}</strong>
                    </span>
                    <button
                      onClick={() => setSelectedSecCard("ALL")}
                      className="text-xs text-rose-400 hover:text-rose-300 font-semibold"
                    >
                      Clear Filter ✕
                    </button>
                  </div>
                )}

                {/* REAL Security Summary Cards (Interactive Filter Triggers) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  {/* Card 1: Total Logins */}
                  <button
                    onClick={() => setSelectedSecCard("ALL")}
                    className={`text-left p-4 rounded-2xl bg-slate-900/60 border transition-all duration-200 cursor-pointer space-y-2 hover:scale-[1.02] ${
                      selectedSecCard === "ALL"
                        ? "border-blue-500/60 ring-2 ring-blue-500/30 bg-blue-500/5 shadow-lg shadow-blue-500/10"
                        : "border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                        <Users className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] text-slate-500 font-medium">Click to show all</span>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Total Logins</p>
                      <h3 className="text-2xl font-bold text-white tracking-tight">
                        {securityData?.summary?.total_logins ?? 0}
                      </h3>
                      <p className="text-[10px] text-slate-500 mt-0.5">All auth attempts</p>
                    </div>
                  </button>

                  {/* Card 2: Successful Logins */}
                  <button
                    onClick={() => setSelectedSecCard(selectedSecCard === "SUCCESS" ? "ALL" : "SUCCESS")}
                    className={`text-left p-4 rounded-2xl bg-slate-900/60 border transition-all duration-200 cursor-pointer space-y-2 hover:scale-[1.02] ${
                      selectedSecCard === "SUCCESS"
                        ? "border-emerald-500/60 ring-2 ring-emerald-500/30 bg-emerald-500/5 shadow-lg shadow-emerald-500/10"
                        : "border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] text-emerald-400 font-medium">Filter success</span>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Successful Logins</p>
                      <h3 className="text-2xl font-bold text-white tracking-tight">
                        {securityData?.summary?.successful_logins ?? 0}
                      </h3>
                      <p className="text-[10px] text-emerald-400 font-medium mt-0.5">
                        {securityData?.summary?.success_rate ?? "100%"} success rate
                      </p>
                    </div>
                  </button>

                  {/* Card 3: Failed Logins */}
                  <button
                    onClick={() => setSelectedSecCard(selectedSecCard === "FAILED" ? "ALL" : "FAILED")}
                    className={`text-left p-4 rounded-2xl bg-slate-900/60 border transition-all duration-200 cursor-pointer space-y-2 hover:scale-[1.02] ${
                      selectedSecCard === "FAILED"
                        ? "border-rose-500/60 ring-2 ring-rose-500/30 bg-rose-500/5 shadow-lg shadow-rose-500/10"
                        : "border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
                        <XCircle className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] text-rose-400 font-medium">Filter failures</span>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Failed Logins</p>
                      <h3 className="text-2xl font-bold text-white tracking-tight">
                        {securityData?.summary?.failed_logins ?? 0}
                      </h3>
                      <p className="text-[10px] text-rose-400 font-medium mt-0.5">
                        {securityData?.summary?.failure_rate ?? "0%"} failure rate
                      </p>
                    </div>
                  </button>

                  {/* Card 4: Unauthorized Attempts */}
                  <button
                    onClick={() => setSelectedSecCard(selectedSecCard === "UNAUTHORIZED" ? "ALL" : "UNAUTHORIZED")}
                    className={`text-left p-4 rounded-2xl bg-slate-900/60 border transition-all duration-200 cursor-pointer space-y-2 hover:scale-[1.02] ${
                      selectedSecCard === "UNAUTHORIZED"
                        ? "border-amber-500/60 ring-2 ring-amber-500/30 bg-amber-500/5 shadow-lg shadow-amber-500/10"
                        : "border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] text-amber-400 font-medium">Filter blocks</span>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Unauthorized Attempts</p>
                      <h3 className="text-2xl font-bold text-white tracking-tight">
                        {securityData?.summary?.unauthorized_attempts ?? 0}
                      </h3>
                      <p className="text-[10px] text-slate-500 mt-0.5">Blocked by policy</p>
                    </div>
                  </button>

                  {/* Card 5: Security Events */}
                  <button
                    onClick={() => setSelectedSecCard(selectedSecCard === "EVENTS" ? "ALL" : "EVENTS")}
                    className={`text-left p-4 rounded-2xl bg-slate-900/60 border transition-all duration-200 cursor-pointer space-y-2 hover:scale-[1.02] ${
                      selectedSecCard === "EVENTS"
                        ? "border-purple-500/60 ring-2 ring-purple-500/30 bg-purple-500/5 shadow-lg shadow-purple-500/10"
                        : "border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                        <ShieldAlert className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] text-purple-400 font-medium">Inspect incidents</span>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Security Events</p>
                      <h3 className="text-2xl font-bold text-white tracking-tight">
                        {securityData?.summary?.security_events ?? 0}
                      </h3>
                      <p className="text-[10px] text-slate-500 mt-0.5">Live security incidents</p>
                    </div>
                  </button>
                </div>

                {/* Middle Row: REAL Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Chart 1: Login Activity */}
                  <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-white text-sm">Login Activity (Live)</h4>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium">
                        <span className="flex items-center gap-1 text-emerald-400">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Success
                        </span>
                        <span className="flex items-center gap-1 text-rose-400">
                          <span className="w-2 h-2 rounded-full bg-rose-500"></span> Failed
                        </span>
                      </div>
                    </div>

                    {(!securityData?.login_activity_chart || securityData.login_activity_chart.length === 0) ? (
                      <div className="h-44 flex flex-col items-center justify-center text-xs text-slate-500">
                        <Activity className="w-6 h-6 mb-1 text-slate-600" />
                        <span>No login activity in this period.</span>
                      </div>
                    ) : (
                      <div className="h-44 w-full flex items-end justify-between gap-2 pt-2 pb-1 border-b border-slate-800">
                        {securityData.login_activity_chart.map((point: any, i: number) => (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                            <div className="w-full flex items-end justify-center gap-1 h-32">
                              <div
                                style={{ height: `${Math.max(4, point.successful * 20)}px` }}
                                className="w-2.5 rounded-t bg-emerald-500"
                                title={`Success: ${point.successful}`}
                              ></div>
                              <div
                                style={{ height: `${Math.max(4, point.failed * 20)}px` }}
                                className="w-2.5 rounded-t bg-rose-500"
                                title={`Failed: ${point.failed}`}
                              ></div>
                            </div>
                            <span className="text-[10px] font-mono text-slate-500">{point.label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Chart 2: Access Attempts */}
                  <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-white text-sm">Access Attempts (Live)</h4>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium">
                        <span className="flex items-center gap-1 text-rose-400">
                          <span className="w-2 h-2 rounded bg-rose-500"></span> Blocked
                        </span>
                      </div>
                    </div>

                    {(!securityData?.access_attempts_chart || securityData.access_attempts_chart.length === 0) ? (
                      <div className="h-44 flex flex-col items-center justify-center text-xs text-slate-500">
                        <Shield className="w-6 h-6 mb-1 text-slate-600" />
                        <span>No blocked attempts recorded.</span>
                      </div>
                    ) : (
                      <div className="h-44 w-full flex items-end justify-between gap-2 pt-2 pb-1 border-b border-slate-800">
                        {securityData.access_attempts_chart.map((point: any, i: number) => (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                            <div className="w-full flex items-end justify-center gap-1 h-32">
                              <div
                                style={{ height: `${Math.max(4, point.blocked * 20)}px` }}
                                className="w-3 rounded-t bg-rose-500"
                                title={`Blocked: ${point.blocked}`}
                              ></div>
                            </div>
                            <span className="text-[10px] font-mono text-slate-500">{point.label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Chart 3: Security Events Breakdown */}
                  <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-white text-sm">Security Events</h4>
                      <span className="text-xs text-slate-400 font-mono">
                        {securityData?.summary?.security_events ?? 0} Events
                      </span>
                    </div>

                    {(!securityData?.security_events_breakdown || securityData.security_events_breakdown.length === 0) ? (
                      <div className="h-44 flex flex-col items-center justify-center text-xs text-emerald-400 space-y-1">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                        <span className="font-semibold">All Clear</span>
                        <span className="text-slate-500 text-[11px]">No security events or violations recorded</span>
                      </div>
                    ) : (
                      <div className="space-y-2.5 pt-2">
                        {securityData.security_events_breakdown.map((item: any, idx: number) => (
                          <div key={idx} className="space-y-1">
                            <div className="flex items-center justify-between text-xs text-slate-300">
                              <span>{item.name}</span>
                              <span className="font-mono text-slate-400">
                                {item.count} ({item.percentage}%)
                              </span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                              <div
                                style={{ width: `${item.percentage}%`, backgroundColor: item.color }}
                                className="h-full rounded-full"
                              ></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Row: 2 REAL Live Tables */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Table 1: Real Recent Login Activity */}
                  <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-white text-sm">Recent Login Activity</h4>
                        {selectedSecCard !== "ALL" && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono">
                            Filtered: {selectedSecCard}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setAdminTab("logs");
                          handleLogFilterChange("USER_LOGIN");
                        }}
                        className="text-xs text-emerald-400 hover:text-emerald-300 font-medium transition"
                      >
                        View All →
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold text-[10px]">
                            <th className="py-2.5 px-3">User</th>
                            <th className="py-2.5 px-3">IP Address</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">Date & Time</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                          {(!displayLogins || displayLogins.length === 0) ? (
                            <tr>
                              <td colSpan={4} className="py-8 text-center text-slate-500 font-sans">
                                No login activities matching current filter.
                              </td>
                            </tr>
                          ) : (
                            displayLogins.map((log: any, idx: number) => (
                              <tr key={idx} className="hover:bg-slate-900/50 transition">
                                <td className="py-2.5 px-3 font-sans font-medium text-white flex items-center gap-2">
                                  <div className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 text-[10px] flex items-center justify-center font-bold">
                                    {log.user[0]}
                                  </div>
                                  <span className="truncate max-w-[120px]">{log.user}</span>
                                </td>
                                <td className="py-2.5 px-3 text-slate-400">{log.ip}</td>
                                <td className="py-2.5 px-3">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                      log.status === "Success"
                                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                        : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                    }`}
                                  >
                                    {log.status}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-slate-500 text-[11px]">{log.date}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Table 2: Real Recent Security Events */}
                  <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-white text-sm">Recent Security Events</h4>
                        {selectedSecCard !== "ALL" && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono">
                            Filtered: {selectedSecCard}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setAdminTab("logs");
                          handleLogFilterChange("FILE_UPLOAD_FAILED");
                        }}
                        className="text-xs text-emerald-400 hover:text-emerald-300 font-medium transition"
                      >
                        View All →
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold text-[10px]">
                            <th className="py-2.5 px-3">Event</th>
                            <th className="py-2.5 px-3">Severity</th>
                            <th className="py-2.5 px-3">Details</th>
                            <th className="py-2.5 px-3">Date & Time</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                          {(!displaySecEvents || displaySecEvents.length === 0) ? (
                            <tr>
                              <td colSpan={4} className="py-8 text-center text-slate-500 font-sans">
                                No security incidents matching current filter.
                              </td>
                            </tr>
                          ) : (
                            displaySecEvents.map((evt: any, idx: number) => (
                              <tr key={idx} className="hover:bg-slate-900/50 transition">
                                <td className="py-2.5 px-3 font-sans font-medium text-white truncate max-w-[120px]">
                                  {evt.event}
                                </td>
                                <td className="py-2.5 px-3">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                      evt.severity === "High"
                                        ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                        : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                    }`}
                                  >
                                    {evt.severity}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 font-sans text-slate-400 truncate max-w-[140px]">
                                  {evt.details}
                                </td>
                                <td className="py-2.5 px-3 text-slate-500 text-[11px]">{evt.date}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* 10 Active Security Infrastructure & Protection Controls */}
                <div className="space-y-4 pt-4 border-t border-slate-800">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-white text-base flex items-center gap-2">
                        <Shield className="w-5 h-5 text-emerald-400" />
                        <span>Active Security Infrastructure & Protection Controls</span>
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Click any security module card to inspect cryptographic specs, key sizes, and live verification status
                      </p>
                    </div>
                    <span className="text-[11px] font-mono text-emerald-400 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 w-fit">
                      10/10 Active Security Modules
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    {SECURITY_MODULES.map((item) => {
                      const Icon = item.icon;
                      return (
                        <div
                          key={item.id}
                          onClick={() => setActiveSecurityModal(item)}
                          className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-emerald-500/40 hover:bg-slate-900/90 transition flex flex-col justify-between space-y-4 cursor-pointer group hover:scale-[1.01]"
                        >
                          <div className="flex items-center justify-between">
                            <div className={`w-9 h-9 rounded-xl ${item.color} flex items-center justify-center transition group-hover:scale-110`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Active
                            </span>
                          </div>
                          <div>
                            <h5 className="font-semibold text-white text-sm mb-1 group-hover:text-emerald-300 transition">
                              {item.title}
                            </h5>
                            <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                              {item.desc}
                            </p>
                          </div>
                          <div className="text-xs font-semibold text-emerald-400 group-hover:text-emerald-300 flex items-center gap-1 pt-1">
                            <span>Inspect Specification</span>
                            <ChevronRight className="w-3 h-3 transition group-hover:translate-x-1" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}


            {/* VIEW 2: PLATFORM OVERVIEW & METRICS */}
            {adminTab === "dashboard" && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
                  <div>
                    <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
                      <BarChart3 className="w-6 h-6 text-emerald-400" />
                      <span>Platform Overview & Governance</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Aggregated telemetry across all registered platform users, vault files, and storage quotas
                    </p>
                  </div>

                  <button
                    onClick={fetchAdminTelemetry}
                    disabled={adminLoading}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 text-xs font-semibold text-emerald-400 flex items-center gap-1.5 transition"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${adminLoading ? "animate-spin" : ""}`} />
                    <span>Refresh Metrics</span>
                  </button>
                </div>

                {/* 5 Real Metric Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  {/* Total Users */}
                  <button
                    onClick={() => setAdminTab("users")}
                    className="text-left p-4 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-900/90 transition-all duration-200 cursor-pointer space-y-2 hover:scale-[1.02] group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center transition group-hover:scale-110">
                        <Users className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] text-slate-500 group-hover:text-indigo-400 font-medium">Manage users →</span>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Total Users</p>
                      <h3 className="text-2xl font-bold text-white tracking-tight">
                        {adminMetrics?.total_users ?? 0}
                      </h3>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {adminMetrics?.users_by_role?.admin ?? 0} Admin • {adminMetrics?.users_by_role?.user ?? 0} Users • {adminMetrics?.users_by_role?.guest ?? 0} Guests
                      </p>
                    </div>
                  </button>

                  {/* Total Files */}
                  <button
                    onClick={() => setAdminTab("files")}
                    className="text-left p-4 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-900/90 transition-all duration-200 cursor-pointer space-y-2 hover:scale-[1.02] group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center transition group-hover:scale-110">
                        <Layers className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] text-slate-500 group-hover:text-emerald-400 font-medium">View registry →</span>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Total Files</p>
                      <h3 className="text-2xl font-bold text-white tracking-tight">
                        {adminMetrics?.total_files ?? 0}
                      </h3>
                      <p className="text-[10px] text-emerald-400 font-medium mt-0.5">Encrypted in vault</p>
                    </div>
                  </button>

                  {/* Storage Used */}
                  <button
                    onClick={() => setAdminTab("files")}
                    className="text-left p-4 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-teal-500/50 hover:bg-slate-900/90 transition-all duration-200 cursor-pointer space-y-2 hover:scale-[1.02] group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-9 h-9 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center transition group-hover:scale-110">
                        <HardDrive className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] text-slate-500 group-hover:text-teal-400 font-medium">Inspect storage →</span>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Platform Storage</p>
                      <h3 className="text-2xl font-bold text-white tracking-tight">
                        {formatFileSize(adminMetrics?.total_storage_bytes || 0)}
                      </h3>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {adminStoragePercent}% of 50 MB quota
                      </p>
                    </div>
                  </button>

                  {/* Upload Failures */}
                  <button
                    onClick={() => {
                      setAdminTab("logs");
                      handleLogFilterChange("FILE_UPLOAD_FAILED");
                    }}
                    className="text-left p-4 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-rose-500/50 hover:bg-slate-900/90 transition-all duration-200 cursor-pointer space-y-2 hover:scale-[1.02] group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center transition group-hover:scale-110">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] text-slate-500 group-hover:text-rose-400 font-medium">Filter violations →</span>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Upload Failures</p>
                      <h3 className="text-2xl font-bold text-white tracking-tight">
                        {adminMetrics?.upload_failures ?? 0}
                      </h3>
                      <p className="text-[10px] text-rose-400 font-medium mt-0.5">Violations logged</p>
                    </div>
                  </button>

                  {/* Total Logins */}
                  <button
                    onClick={() => {
                      setAdminTab("logs");
                      handleLogFilterChange("USER_LOGIN");
                    }}
                    className="text-left p-4 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-amber-500/50 hover:bg-slate-900/90 transition-all duration-200 cursor-pointer space-y-2 hover:scale-[1.02] group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center transition group-hover:scale-110">
                        <LogIn className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] text-slate-500 group-hover:text-amber-400 font-medium">Filter logins →</span>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Total Logins</p>
                      <h3 className="text-2xl font-bold text-white tracking-tight">
                        {adminMetrics?.total_logins ?? 0}
                      </h3>
                      <p className="text-[10px] text-slate-500 mt-0.5">Audited auth events</p>
                    </div>
                  </button>
                </div>

                {/* Visual telemetry & charts */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Storage Breakdown by File Type */}
                  <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-white text-sm">Storage by File Type</h4>
                      <span className="text-xs text-slate-400 font-mono">
                        {formatFileSize(adminMetrics?.total_storage_bytes || 0)}
                      </span>
                    </div>
                    <div className="space-y-3 pt-1">
                      {[
                        { label: "PDF Documents", key: "pdf", color: "bg-rose-500" },
                        { label: "Images", key: "images", color: "bg-teal-500" },
                        { label: "Text & Documents", key: "docs", color: "bg-blue-500" },
                        { label: "Spreadsheets", key: "sheets", color: "bg-emerald-500" },
                        { label: "Other Files", key: "others", color: "bg-purple-500" },
                      ].map((item) => {
                        const bytes = adminMetrics?.storage_by_type?.[item.key] || 0;
                        const count = adminMetrics?.file_counts_by_type?.[item.key] || 0;
                        const total = adminMetrics?.total_storage_bytes || 1;
                        const pct = Math.round((bytes / total) * 100);
                        return (
                          <div key={item.key} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-300 font-medium">{item.label}</span>
                              <span className="text-slate-400 font-mono">
                                {formatFileSize(bytes)} ({count} files)
                              </span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                              <div
                                style={{ width: `${bytes > 0 ? Math.max(pct, 4) : 0}%` }}
                                className={`h-full ${item.color} rounded-full transition-all duration-500`}
                              ></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* User Role Distribution */}
                  <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-white text-sm">Role-Based Access (RBAC)</h4>
                      <span className="text-xs text-slate-400 font-mono">
                        {adminMetrics?.total_users ?? 0} Users
                      </span>
                    </div>
                    <div className="space-y-3 pt-1">
                      {[
                        { label: "Administrators", role: "admin", color: "bg-purple-500", desc: "Governance & Audit Oversight" },
                        { label: "Standard Users", role: "user", color: "bg-emerald-500", desc: "Encrypted Vault & Sharing" },
                        { label: "Guests", role: "guest", color: "bg-slate-500", desc: "Read-only access" },
                      ].map((r) => {
                        const count = adminMetrics?.users_by_role?.[r.role] || 0;
                        const total = adminMetrics?.total_users || 1;
                        const pct = Math.round((count / total) * 100);
                        return (
                          <div key={r.role} className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80 space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <div>
                                <span className="font-semibold text-white">{r.label}</span>
                                <p className="text-[10px] text-slate-500">{r.desc}</p>
                              </div>
                              <span className="font-mono text-slate-300 font-bold">{count}</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                              <div
                                style={{ width: `${count > 0 ? Math.max(pct, 5) : 0}%` }}
                                className={`h-full ${r.color} rounded-full`}
                              ></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Activity Timeline (MongoDB aggregated) */}
                  <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-white text-sm">Activity Timeline (7 Days)</h4>
                      <span className="text-xs text-slate-400">Live Mongo Events</span>
                    </div>
                    {(!adminMetrics?.activity_timeline || adminMetrics.activity_timeline.length === 0) ? (
                      <div className="h-44 flex flex-col items-center justify-center text-xs text-slate-500">
                        <Activity className="w-6 h-6 mb-1 text-slate-600" />
                        <span>No activity recorded in the past 7 days.</span>
                      </div>
                    ) : (
                      <div className="h-44 w-full flex items-end justify-between gap-2 pt-2 pb-1 border-b border-slate-800">
                        {adminMetrics.activity_timeline.map((item: any, idx: number) => (
                          <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                            <div className="w-full flex items-end justify-center gap-1 h-32">
                              <div
                                style={{ height: `${Math.max(4, item.uploads * 15)}px` }}
                                className="w-2.5 rounded-t bg-emerald-500"
                                title={`Uploads: ${item.uploads}`}
                              ></div>
                              <div
                                style={{ height: `${Math.max(4, item.logins * 15)}px` }}
                                className="w-2.5 rounded-t bg-blue-500"
                                title={`Logins: ${item.logins}`}
                              ></div>
                              <div
                                style={{ height: `${Math.max(4, item.failures * 15)}px` }}
                                className="w-2.5 rounded-t bg-rose-500"
                                title={`Failures: ${item.failures}`}
                              ></div>
                            </div>
                            <span className="text-[10px] font-mono text-slate-500">{item._id.slice(5)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-center gap-4 text-[10px] text-slate-400 pt-1">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded bg-emerald-500"></span> Uploads
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded bg-blue-500"></span> Logins
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded bg-rose-500"></span> Failures
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}


            {/* VIEW 3: USER MANAGEMENT */}
            {adminTab === "users" && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
                  <div>
                    <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
                      <Users className="w-6 h-6 text-emerald-400" />
                      <span>User Management</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Governed accounts stored in PostgreSQL with Role-Based Access Control (RBAC)
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={adminUserSearch}
                        onChange={(e) => setAdminUserSearch(e.target.value)}
                        placeholder="Search users..."
                        className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-52"
                      />
                    </div>
                    <button
                      onClick={fetchAdminTelemetry}
                      disabled={adminLoading}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 text-xs font-semibold text-emerald-400 flex items-center gap-1.5 transition"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${adminLoading ? "animate-spin" : ""}`} />
                      <span>Refresh</span>
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-xl overflow-hidden shadow-2xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-800/80 text-slate-400 text-xs font-semibold uppercase tracking-wider bg-slate-950/60">
                          <th className="px-6 py-3.5">User</th>
                          <th className="px-6 py-3.5">Role</th>
                          <th className="px-6 py-3.5">Status</th>
                          <th className="px-6 py-3.5">Files Owned</th>
                          <th className="px-6 py-3.5">Registered</th>
                          <th className="px-6 py-3.5 text-right">User ID</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50 text-xs">
                        {filteredAdminUsers.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                              No users found matching your search.
                            </td>
                          </tr>
                        ) : (
                          filteredAdminUsers.map((u) => (
                            <tr key={u.id} className="hover:bg-slate-900/60 transition">
                              <td className="px-6 py-3.5 flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700/60 flex items-center justify-center font-bold text-white text-xs">
                                  {u.full_name ? u.full_name[0].toUpperCase() : u.email[0].toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-semibold text-white">{u.full_name}</p>
                                  <p className="text-[11px] text-slate-400 font-mono">{u.email}</p>
                                </div>
                              </td>
                              <td className="px-6 py-3.5">
                                <span
                                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border ${
                                    u.role === "admin"
                                      ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                                      : u.role === "user"
                                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                      : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                                  }`}
                                >
                                  {u.role}
                                </span>
                              </td>
                              <td className="px-6 py-3.5">
                                <span className="inline-flex items-center gap-1.5 text-emerald-400 text-[11px]">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                  {u.is_active ? "Active" : "Inactive"}
                                </span>
                              </td>
                              <td className="px-6 py-3.5 font-mono text-slate-300">
                                <span className="px-2 py-0.5 rounded bg-slate-800/70 border border-slate-700/50">
                                  {u.file_count} files
                                </span>
                              </td>
                              <td className="px-6 py-3.5 text-slate-400 font-mono">
                                {u.created_at ? u.created_at.slice(0, 10) : "N/A"}
                              </td>
                              <td className="px-6 py-3.5 text-right font-mono text-slate-500">
                                #{u.id}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}


            {/* VIEW 4: FILE REGISTRY */}
            {adminTab === "files" && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
                  <div>
                    <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
                      <Layers className="w-6 h-6 text-emerald-400" />
                      <span>Platform File Registry</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Complete audit and oversight of all encrypted files across all user accounts
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={adminFileSearch}
                        onChange={(e) => setAdminFileSearch(e.target.value)}
                        placeholder="Search files..."
                        className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-52"
                      />
                    </div>
                    <button
                      onClick={() => {
                        fetchFiles();
                        fetchAdminTelemetry();
                      }}
                      disabled={adminLoading}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 text-xs font-semibold text-emerald-400 flex items-center gap-1.5 transition"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${adminLoading ? "animate-spin" : ""}`} />
                      <span>Refresh</span>
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-xl overflow-hidden shadow-2xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-800/80 text-slate-400 text-xs font-semibold uppercase tracking-wider bg-slate-950/60">
                          <th className="px-6 py-3.5">File Name</th>
                          <th className="px-6 py-3.5">Size</th>
                          <th className="px-6 py-3.5">Content Type</th>
                          <th className="px-6 py-3.5">Uploaded</th>
                          <th className="px-6 py-3.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50 text-xs">
                        {filteredAdminFiles.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                              No files found in the platform vault.
                            </td>
                          </tr>
                        ) : (
                          filteredAdminFiles.map((file) => (
                            <tr key={file.id} className="hover:bg-slate-900/60 transition">
                              <td className="px-6 py-3.5 flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-slate-800 text-emerald-400 border border-slate-700/50">
                                  {getFileIcon(file.original_filename)}
                                </div>
                                <div>
                                  <p className="font-semibold text-white">{file.original_filename}</p>
                                  <p className="text-[10px] text-slate-500 font-mono">ID: #{file.id}</p>
                                </div>
                              </td>
                              <td className="px-6 py-3.5 font-mono text-slate-300">
                                {formatFileSize(file.file_size)}
                              </td>
                              <td className="px-6 py-3.5 text-slate-400 font-mono">
                                {file.content_type || "application/octet-stream"}
                              </td>
                              <td className="px-6 py-3.5 text-slate-400 font-mono">
                                {formatLocalDateTime(file.uploaded_at)}
                              </td>
                              <td className="px-6 py-3.5 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => handleDownload(file.id, file.original_filename)}
                                    title="Audit / Download file"
                                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(file.id)}
                                    title="Delete file"
                                    className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
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
            )}


                        {/* ============================================================== */}
            {/* MILESTONE 3 TASK 5: STORAGE ANALYTICS & USAGE MONITORING      */}
            {/* ============================================================== */}
            {adminTab === "analytics" && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
                  <div>
                    <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
                      <HardDrive className="w-6 h-6 text-emerald-400" />
                      <span>Storage Analytics & Usage Monitoring</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Calculated from actual database records & encrypted vault allocations
                    </p>
                  </div>
                  <button
                    onClick={fetchStorageAnalytics}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 text-xs font-semibold text-emerald-400 flex items-center gap-1.5 transition self-start sm:self-auto"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Refresh Analytics</span>
                  </button>
                </div>

                {/* 4 Storage Metric Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-lg">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Total Storage Occupied
                    </span>
                    <p className="text-2xl font-extrabold text-white font-mono">
                      {storageAnalytics?.total_storage_formatted || "0 B"}
                    </p>
                    <p className="text-xs text-emerald-400 mt-2 font-mono">
                      {storageAnalytics?.total_storage_bytes || 0} bytes
                    </p>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-lg">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Platform Quota Allocation
                    </span>
                    <p className="text-2xl font-extrabold text-emerald-400 font-mono">
                      {storageAnalytics?.usage_percentage || 0}%
                    </p>
                    <div className="w-full h-2 rounded-full bg-slate-800 mt-3 overflow-hidden">
                      <div
                        style={{ width: `${Math.min(100, storageAnalytics?.usage_percentage || 0)}%` }}
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400"
                      ></div>
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-lg">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Total Uploaded Files
                    </span>
                    <p className="text-2xl font-extrabold text-white font-mono">
                      {fileStats?.total_uploaded_files || 0}
                    </p>
                    <p className="text-xs text-slate-400 mt-2">
                      {fileStats?.total_downloaded_files || 0} total downloads logged
                    </p>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-lg">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Total Shared Files
                    </span>
                    <p className="text-2xl font-extrabold text-teal-400 font-mono">
                      {fileStats?.total_shared_files || 0}
                    </p>
                    <p className="text-xs text-slate-400 mt-2">
                      Across temporary & permanent links
                    </p>
                  </div>
                </div>

                {/* Storage by File Type & Most Downloaded Files */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Storage by File Type */}
                  <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800">
                    <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-emerald-400" />
                      <span>Storage Breakdown by File Type</span>
                    </h3>
                    <div className="space-y-3">
                      {(!fileStats?.storage_by_file_type || fileStats.storage_by_file_type.length === 0) ? (
                        <p className="text-xs text-slate-500 py-4 text-center">No file types recorded yet.</p>
                      ) : (
                        fileStats.storage_by_file_type.map((t: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60">
                            <span className="text-xs font-mono font-bold text-white uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              .{t.file_type}
                            </span>
                            <span className="text-xs font-mono font-semibold text-slate-300">
                              {t.formatted}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Most Frequently Downloaded */}
                  <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800">
                    <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                      <Download className="w-4 h-4 text-emerald-400" />
                      <span>Most Frequently Downloaded Files</span>
                    </h3>
                    <div className="space-y-3">
                      {(!fileStats?.most_frequently_downloaded || fileStats.most_frequently_downloaded.length === 0) ? (
                        <p className="text-xs text-slate-500 py-4 text-center">No downloads logged yet.</p>
                      ) : (
                        fileStats.most_frequently_downloaded.map((item: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60">
                            <span className="text-xs font-medium text-slate-200 truncate max-w-xs">
                              {item.filename}
                            </span>
                            <span className="text-xs font-mono font-bold text-emerald-400 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                              {item.download_count} downloads
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* User-Wise Storage Usage Table (Task 5 Step 3) */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-xl overflow-hidden shadow-2xl">
                  <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white">User-Wise Storage Allocation</h3>
                      <p className="text-xs text-slate-400">Exact disk allocation per registered user account</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-800/80 text-slate-400 text-xs font-semibold uppercase tracking-wider bg-slate-950/40">
                          <th className="px-6 py-3.5">User</th>
                          <th className="px-6 py-3.5">Email</th>
                          <th className="px-6 py-3.5">Role</th>
                          <th className="px-6 py-3.5">Files Uploaded</th>
                          <th className="px-6 py-3.5">Storage Used</th>
                          <th className="px-6 py-3.5">Platform Share</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50 text-xs">
                        {userStorageList.map((u: any) => (
                          <tr key={u.user_id} className="hover:bg-slate-900/60 transition">
                            <td className="px-6 py-3.5 font-semibold text-white">{u.user_name}</td>
                            <td className="px-6 py-3.5 text-slate-400 font-mono">{u.email}</td>
                            <td className="px-6 py-3.5 capitalize">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                u.role === "admin" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-slate-800 text-slate-300"
                              }`}>
                                {u.role}
                              </span>
                            </td>
                            <td className="px-6 py-3.5 font-mono font-bold text-emerald-400">{u.files_uploaded}</td>
                            <td className="px-6 py-3.5 font-mono font-bold text-white">{u.storage_used_formatted}</td>
                            <td className="px-6 py-3.5">
                              <div className="flex items-center gap-2">
                                <div className="w-24 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                                  <div style={{ width: `${u.percentage}%` }} className="h-full bg-emerald-500"></div>
                                </div>
                                <span className="text-[11px] font-mono text-slate-400">{u.percentage}%</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* MILESTONE 3 TASK 4: ACTIVITY & SECURITY REPORTS               */}
            {/* ============================================================== */}
            {adminTab === "reports" && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
                  <div>
                    <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
                      <FileText className="w-6 h-6 text-emerald-400" />
                      <span>Activity & Security Reports</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Detailed telemetry reports across file operations and security boundaries
                    </p>
                  </div>

                  {/* Report Sub-Tabs & Export */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800">
                      {[
                        { id: "uploads", label: "Uploads" },
                        { id: "downloads", label: "Downloads" },
                        { id: "sharing", label: "Sharing" },
                        { id: "security", label: "Security" },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => {
                            setReportTab(tab.id as any);
                            fetchReports(tab.id as any);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                            reportTab === tab.id
                              ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() => handleExportCSV(reportTab)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 transition shadow-sm"
                      title="Download full report as CSV"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Export CSV</span>
                    </button>
                  </div>
                </div>

                {/* Sub-report: Uploads */}
                {reportTab === "uploads" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                        <span className="text-xs text-slate-400 block mb-1">Total Files Uploaded</span>
                        <p className="text-2xl font-bold font-mono text-white">{reportsData?.total_files_uploaded || 0}</p>
                      </div>
                      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                        <span className="text-xs text-slate-400 block mb-1">Top Uploading Users</span>
                        <p className="text-sm font-semibold text-emerald-400 mt-1">
                          {reportsData?.files_uploaded_by_user?.[0]?.user || "None yet"}
                        </p>
                      </div>
                      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                        <span className="text-xs text-slate-400 block mb-1">Encryption Mode</span>
                        <p className="text-sm font-semibold text-teal-400 mt-1">AES-256-GCM Envelope</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold bg-slate-950/60">
                            <th className="px-6 py-3">Filename</th>
                            <th className="px-6 py-3">Owner</th>
                            <th className="px-6 py-3">Size</th>
                            <th className="px-6 py-3">Uploaded Date</th>
                            <th className="px-6 py-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                          {reportsData?.recent_uploads?.map((u: any) => (
                            <tr key={u.file_id} className="hover:bg-slate-900/40">
                              <td className="px-6 py-3 font-semibold text-white">{u.original_filename}</td>
                              <td className="px-6 py-3 text-slate-400 font-mono">{u.owner}</td>
                              <td className="px-6 py-3 font-mono text-slate-300">{formatFileSize(u.file_size)}</td>
                              <td className="px-6 py-3 text-slate-400">{formatLocalDateTime(u.upload_date)}</td>
                              <td className="px-6 py-3">
                                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                                  {u.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Sub-report: Downloads */}
                {reportTab === "downloads" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                        <span className="text-xs text-slate-400 block mb-1">Total Downloads Completed</span>
                        <p className="text-2xl font-bold font-mono text-emerald-400">{reportsData?.total_downloads || 0}</p>
                      </div>
                      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                        <span className="text-xs text-slate-400 block mb-1">Failed / Rejected Attempts</span>
                        <p className="text-2xl font-bold font-mono text-rose-400">{reportsData?.failed_download_attempts || 0}</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold bg-slate-950/60">
                            <th className="px-6 py-3">User / Recipient</th>
                            <th className="px-6 py-3">File</th>
                            <th className="px-6 py-3">IP Address</th>
                            <th className="px-6 py-3">Timestamp</th>
                            <th className="px-6 py-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                          {reportsData?.recent_download_events?.map((d: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-900/40">
                              <td className="px-6 py-3 font-mono text-slate-300">{d.user}</td>
                              <td className="px-6 py-3 font-semibold text-white">{d.filename}</td>
                              <td className="px-6 py-3 font-mono text-slate-400">{d.ip}</td>
                              <td className="px-6 py-3 text-slate-400">{formatLocalDateTime(d.timestamp)}</td>
                              <td className="px-6 py-3">
                                <span className={`px-2 py-0.5 rounded font-semibold ${
                                  d.status === "Success" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                }`}>
                                  {d.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Sub-report: Sharing */}
                {reportTab === "sharing" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                        <span className="text-xs text-slate-400 block mb-1">Total Share Links</span>
                        <p className="text-2xl font-bold font-mono text-white">{reportsData?.total_files_shared || 0}</p>
                      </div>
                      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                        <span className="text-xs text-slate-400 block mb-1">Active Links</span>
                        <p className="text-2xl font-bold font-mono text-emerald-400">{reportsData?.active_sharing_links || 0}</p>
                      </div>
                      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                        <span className="text-xs text-slate-400 block mb-1">Expired Links</span>
                        <p className="text-2xl font-bold font-mono text-amber-400">{reportsData?.expired_sharing_links || 0}</p>
                      </div>
                      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                        <span className="text-xs text-slate-400 block mb-1">Revoked Links</span>
                        <p className="text-2xl font-bold font-mono text-rose-400">{reportsData?.revoked_sharing_links || 0}</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold bg-slate-950/60">
                            <th className="px-6 py-3">File</th>
                            <th className="px-6 py-3">Shared By</th>
                            <th className="px-6 py-3">Permission</th>
                            <th className="px-6 py-3">Downloads / Limit</th>
                            <th className="px-6 py-3">Expires At</th>
                            <th className="px-6 py-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                          {reportsData?.recent_shares?.map((s: any) => (
                            <tr key={s.id} className="hover:bg-slate-900/40">
                              <td className="px-6 py-3 font-semibold text-white">{s.filename}</td>
                              <td className="px-6 py-3 font-mono text-slate-300">{s.creator}</td>
                              <td className="px-6 py-3 uppercase font-mono text-teal-400">{s.permission}</td>
                              <td className="px-6 py-3 font-mono text-slate-300">
                                {s.download_count} / {s.max_downloads || "Unlimited"}
                              </td>
                              <td className="px-6 py-3 text-slate-400">{s.expires_at ? formatLocalDateTime(s.expires_at) : "No TTL"}</td>
                              <td className="px-6 py-3">
                                <span className={`px-2 py-0.5 rounded font-semibold ${
                                  s.status === "Active" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : s.status === "Expired" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                }`}>
                                  {s.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Sub-report: Security */}
                {reportTab === "security" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                        <span className="text-xs text-slate-400 block mb-1">Total Security Alerts</span>
                        <p className="text-2xl font-bold font-mono text-rose-400">{reportsData?.summary?.total_security_alerts || 0}</p>
                      </div>
                      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                        <span className="text-xs text-slate-400 block mb-1">Failed Logins</span>
                        <p className="text-2xl font-bold font-mono text-amber-400">{reportsData?.summary?.failed_login_attempts || 0}</p>
                      </div>
                      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                        <span className="text-xs text-slate-400 block mb-1">Unauthorized Access</span>
                        <p className="text-2xl font-bold font-mono text-rose-400">{reportsData?.summary?.unauthorized_access_attempts || 0}</p>
                      </div>
                      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                        <span className="text-xs text-slate-400 block mb-1">Expired Link Access</span>
                        <p className="text-2xl font-bold font-mono text-purple-400">{reportsData?.summary?.expired_link_access_attempts || 0}</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold bg-slate-950/60">
                            <th className="px-6 py-3">Threat Type</th>
                            <th className="px-6 py-3">Severity</th>
                            <th className="px-6 py-3">Description</th>
                            <th className="px-6 py-3">IP Address</th>
                            <th className="px-6 py-3">Timestamp</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                          {reportsData?.recent_alerts?.map((a: any) => (
                            <tr key={a.id} className="hover:bg-slate-900/40">
                              <td className="px-6 py-3 font-semibold text-white">{a.activity_type}</td>
                              <td className="px-6 py-3">
                                <span className={`px-2 py-0.5 rounded font-semibold ${
                                  a.severity === "High" ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                }`}>
                                  {a.severity}
                                </span>
                              </td>
                              <td className="px-6 py-3 text-slate-300">{a.description}</td>
                              <td className="px-6 py-3 font-mono text-slate-400">{a.ip}</td>
                              <td className="px-6 py-3 text-slate-400">{formatLocalDateTime(a.timestamp)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

{/* VIEW 5: ACTIVITY & AUDIT LOGS */}
            {adminTab === "logs" && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
                  <div>
                    <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
                      <Activity className="w-6 h-6 text-emerald-400" />
                      <span>System Audit Logs</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Real-time tamper-proof audit trail stored directly in MongoDB Atlas
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <select
                      value={logFilter}
                      onChange={(e) => handleLogFilterChange(e.target.value)}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="ALL">All Actions</option>
                      <option value="USER_LOGIN">USER_LOGIN</option>
                      <option value="USER_LOGIN_FAILED">USER_LOGIN_FAILED</option>
                      <option value="USER_REGISTER">USER_REGISTER</option>
                      <option value="FILE_UPLOAD">FILE_UPLOAD</option>
                      <option value="FILE_UPLOAD_FAILED">FILE_UPLOAD_FAILED</option>
                      <option value="FILE_DOWNLOAD">FILE_DOWNLOAD</option>
                      <option value="FILE_DELETE">FILE_DELETE</option>
                      <option value="UNAUTHORIZED_ACCESS">UNAUTHORIZED_ACCESS</option>
                    </select>
                    <button
                      onClick={() => handleLogFilterChange(logFilter)}
                      disabled={adminLoading}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 text-xs font-semibold text-emerald-400 flex items-center gap-1.5 transition"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${adminLoading ? "animate-spin" : ""}`} />
                      <span>Refresh</span>
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-xl overflow-hidden shadow-2xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-800/80 text-slate-400 text-xs font-semibold uppercase tracking-wider bg-slate-950/60">
                          <th className="px-6 py-3.5">Timestamp</th>
                          <th className="px-6 py-3.5">Action</th>
                          <th className="px-6 py-3.5">User</th>
                          <th className="px-6 py-3.5">IP Address</th>
                          <th className="px-6 py-3.5">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50 text-xs font-mono">
                        {(!adminLogs || adminLogs.length === 0) ? (
                          <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-slate-500 font-sans">
                              No activity logs found for this filter.
                            </td>
                          </tr>
                        ) : (
                          adminLogs.map((log: any, idx: number) => {
                            const act = log.action || "";
                            const isFail = act.includes("FAILED") || act.includes("UNAUTHORIZED");
                            const isSuccess = act === "USER_LOGIN" || act === "FILE_UPLOAD";
                            const details = log.details || {};
                            const detailStr = details.reason
                              ? `${details.reason}${details.filename ? ` (${details.filename})` : ""}`
                              : details.filename
                              ? `File: ${details.filename}`
                              : JSON.stringify(details);

                            return (
                              <tr key={log._id || idx} className="hover:bg-slate-900/60 transition">
                                <td className="px-6 py-3.5 text-slate-400">
                                  {formatLocalDateTime(log.timestamp)}
                                </td>
                                <td className="px-6 py-3.5">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                      isFail
                                        ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                        : isSuccess
                                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                        : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                    }`}
                                  >
                                    {act}
                                  </span>
                                </td>
                                <td className="px-6 py-3.5 text-slate-300">
                                  {log.user_email || `User #${log.user_id}`}
                                </td>
                                <td className="px-6 py-3.5 text-slate-400">
                                  {details.ip || "127.0.0.1"}
                                </td>
                                <td className="px-6 py-3.5 font-sans text-slate-400 truncate max-w-xs">
                                  {detailStr}
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
            )}

          </main>
        </div>
      ) : (
        /* ================= STANDARD USER WORKSPACE ================= */
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* User Sidebar Navigation */}
          <aside className="w-full md:w-64 border-r border-slate-800/80 bg-slate-950/70 p-5 flex flex-col justify-between shrink-0">
            <div className="space-y-6">
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider px-3 mb-2">
                  User Panel
                </p>
                <div className="space-y-1">
                  {[
                    { id: "files", label: "Secure Files (Vault)", icon: Layers },
                    { id: "shares", label: "Secure File Sharing", icon: Link2 },
                    { id: "analytics", label: "File Analytics", icon: BarChart3 },
                    { id: "security", label: "Security Architecture", icon: Shield },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setUserTab(item.id as any)}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
                          userTab === item.id
                            ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                            : "text-slate-400 hover:text-white hover:bg-slate-900"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* REAL User Storage Widget */}
              <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span className="flex items-center gap-1.5 font-medium">
                    <HardDrive className="w-3.5 h-3.5 text-emerald-400" /> Used Storage
                  </span>
                  <span className="font-mono text-emerald-400 font-bold">{quotaPercent}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    style={{ width: `${quotaPercent}%` }}
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-500"
                  ></div>
                </div>
                <p className="text-[11px] font-mono text-slate-400">{totalSizeMB} MB / 50 MB</p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-500/30 hover:bg-rose-500/5 transition text-xs font-medium"
            >
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </aside>

          {/* User Main Workspace */}
          <main className="flex-1 p-6 md:p-8 overflow-y-auto space-y-6">
            {/* VIEW 1: USER SECURITY SECTION */}
            {userTab === "security" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
                    <Shield className="w-6 h-6 text-emerald-400" />
                    <span>Security</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Your files and account are protected with advanced security measures
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  {SECURITY_MODULES.map((item) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.id}
                        onClick={() => setActiveSecurityModal(item)}
                        className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-emerald-500/40 hover:bg-slate-900/90 transition flex flex-col justify-between space-y-4 cursor-pointer group hover:scale-[1.01]"
                      >
                        <div className="flex items-center justify-between">
                          <div className={`w-9 h-9 rounded-xl ${item.color} flex items-center justify-center transition group-hover:scale-110`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Active
                          </span>
                        </div>
                        <div>
                          <h4 className="font-semibold text-white text-sm mb-1 group-hover:text-emerald-300 transition">
                            {item.title}
                          </h4>
                          <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                            {item.desc}
                          </p>
                        </div>
                        <div className="text-xs font-semibold text-emerald-400 group-hover:text-emerald-300 flex items-center gap-1 pt-1">
                          <span>Inspect Specification</span>
                          <ChevronRight className="w-3 h-3 transition group-hover:translate-x-1" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}


            {/* VIEW 4: MILESTONE 2 SHARED LINKS MANAGEMENT */}
            {userTab === "shares" && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
                  <div>
                    <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
                      <Link2 className="w-6 h-6 text-emerald-400" />
                      <span>Secure File Sharing & Access Controls</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Manage time-limited sharing tokens, monitor download counts, and revoke active links immediately
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={fetchShareLinks}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 text-xs font-semibold text-emerald-400 flex items-center gap-1.5 transition"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Refresh Links</span>
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-xl overflow-hidden shadow-2xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800/80 text-slate-400 font-semibold uppercase tracking-wider bg-slate-950/60">
                          <th className="px-6 py-3.5">File Name</th>
                          <th className="px-6 py-3.5">Permission</th>
                          <th className="px-6 py-3.5">Created</th>
                          <th className="px-6 py-3.5">Expires At</th>
                          <th className="px-6 py-3.5">Downloads / Quota</th>
                          <th className="px-6 py-3.5">Status</th>
                          <th className="px-6 py-3.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50 font-mono">
                        {userShareLinks.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-6 py-12 text-center text-slate-500 font-sans">
                              No active or historical share links found. Click "Share" on any file in "My Files" to generate a secure link.
                            </td>
                          </tr>
                        ) : (
                          userShareLinks.map((link) => {
                            const isExpired = new Date(link.expires_at) < new Date();
                            const isRevoked = link.is_revoked;
                            const isActive = !isExpired && !isRevoked;

                            return (
                              <tr key={link.id} className="hover:bg-slate-900/60 transition">
                                <td className="px-6 py-3.5 font-sans font-medium text-white flex items-center gap-2">
                                  <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                  <span className="truncate max-w-xs">{link.original_filename}</span>
                                </td>
                                <td className="px-6 py-3.5">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                    link.permission === "view"
                                      ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                      : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  }`}>
                                    {link.permission}
                                  </span>
                                </td>
                                <td className="px-6 py-3.5 text-slate-400">
                                  {formatLocalDateTime(link.created_at)}
                                </td>
                                <td className="px-6 py-3.5 text-slate-400">
                                  {formatLocalDateTime(link.expires_at)}
                                </td>
                                <td className="px-6 py-3.5 text-slate-300">
                                  {link.download_count} / {link.max_downloads ? link.max_downloads : "Unlimited"}
                                </td>
                                <td className="px-6 py-3.5">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                    isRevoked
                                      ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                      : isExpired
                                      ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                      : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  }`}>
                                    {isRevoked ? "Revoked" : isExpired ? "Expired" : "Active"}
                                  </span>
                                </td>
                                <td className="px-6 py-3.5 text-right font-sans">
                                  {isActive ? (
                                    <button
                                      onClick={() => handleRevokeShareLink(link.id)}
                                      className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-semibold transition"
                                    >
                                      Revoke Link
                                    </button>
                                  ) : (
                                    <span className="text-[11px] text-slate-600">Inactive</span>
                                  )}
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
            )}

            {/* VIEW 2: USER FILE ANALYTICS (Real Values + Charts) */}
            {userTab === "analytics" && (() => {
              // ── derived chart data ──────────────────────────────────────────
              const fileTypeCounts: Record<string, number> = {};
              files.forEach((f) => {
                const ext = f.original_filename.split(".").pop()?.toLowerCase() || "other";
                const bucket =
                  ext === "pdf" ? "PDF" :
                  ["doc","docx","txt"].includes(ext) ? "Docs" :
                  ["xls","xlsx","csv"].includes(ext) ? "Sheets" :
                  ["png","jpg","jpeg","svg","webp"].includes(ext) ? "Images" : "Other";
                fileTypeCounts[bucket] = (fileTypeCounts[bucket] || 0) + 1;
              });
              const fileTypePieData = Object.entries(fileTypeCounts).map(([name, value]) => ({ name, value }));
              const PIE_COLORS = ["#10b981","#3b82f6","#f59e0b","#8b5cf6","#64748b"];

              const usedMB = parseFloat(totalSizeMB);
              const freeMB = parseFloat((50 - usedMB).toFixed(2));
              const storageDonut = [
                { name: "Used", value: usedMB, fill: "#10b981" },
                { name: "Free", value: freeMB, fill: "#1e293b" },
              ];

              // Share link status breakdown
              const activeLinks  = userShareLinks.filter(l => !l.is_revoked && new Date(l.expires_at) >= new Date()).length;
              const expiredLinks = userShareLinks.filter(l => !l.is_revoked && new Date(l.expires_at) < new Date()).length;
              const revokedLinks = userShareLinks.filter(l => l.is_revoked).length;
              const shareStatusData = [
                { name: "Active",  count: activeLinks,  fill: "#10b981" },
                { name: "Expired", count: expiredLinks, fill: "#f59e0b" },
                { name: "Revoked", count: revokedLinks, fill: "#ef4444" },
              ];

              // Upload timeline – group files by date
              const dateMap: Record<string, number> = {};
              files.forEach((f) => {
                const d = f.uploaded_at ? f.uploaded_at.slice(0, 10) : "Unknown";
                dateMap[d] = (dateMap[d] || 0) + 1;
              });
              const uploadTimeline = Object.entries(dateMap)
                .sort(([a], [b]) => a.localeCompare(b))
                .slice(-14)
                .map(([date, count]) => ({ date: date.slice(5), count }));

              // Radial bar for quota
              const radialData = [{ name: "Used", value: quotaPercent, fill: quotaPercent > 80 ? "#ef4444" : quotaPercent > 50 ? "#f59e0b" : "#10b981" }];

              return (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
                      <BarChart3 className="w-6 h-6 text-emerald-400" />
                      <span>File Analytics</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Live insights about your private file storage and upload activity.
                    </p>
                  </div>

                  {/* KPI cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
                      <span className="text-xs text-slate-400">Total Storage Used</span>
                      <h3 className="text-2xl font-bold text-white">{totalSizeMB} MB</h3>
                      <p className="text-[10px] text-slate-500">of 50 MB · {quotaPercent}% capacity</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
                      <span className="text-xs text-slate-400">Encrypted Files</span>
                      <h3 className="text-2xl font-bold text-white">{files.length}</h3>
                      <p className="text-[10px] text-slate-500">AES-256-GCM vault documents</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
                      <span className="text-xs text-slate-400">Storage Remaining</span>
                      <h3 className="text-2xl font-bold text-white">{freeMB} MB</h3>
                      <p className="text-[10px] text-slate-500">Available vault quota</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
                      <span className="text-xs text-slate-400">Share Links</span>
                      <h3 className="text-2xl font-bold text-white">{userShareLinks.length}</h3>
                      <p className="text-[10px] text-emerald-400">{activeLinks} active · {expiredLinks} expired</p>
                    </div>
                  </div>

                  {/* Charts row 1 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Storage Quota Donut */}
                    <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
                      <h4 className="text-sm font-semibold text-slate-200 mb-4">Storage Quota</h4>
                      {files.length === 0 ? (
                        <div className="h-48 flex items-center justify-center text-slate-500 text-xs">Upload files to see storage usage</div>
                      ) : (
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart>
                            <Pie
                              data={storageDonut}
                              cx="50%"
                              cy="50%"
                              innerRadius={55}
                              outerRadius={80}
                              startAngle={90}
                              endAngle={-270}
                              dataKey="value"
                              stroke="none"
                            >
                              {storageDonut.map((entry, i) => (
                                <Cell key={i} fill={entry.fill} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, fontSize: 12 }}
                              formatter={(v: any) => [`${v} MB`, ""]}
                            />
                            <Legend
                              formatter={(value) => <span style={{ color: "#94a3b8", fontSize: 11 }}>{value}</span>}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                      <p className="text-center text-xs text-slate-500 mt-1">{quotaPercent}% used of 50 MB</p>
                    </div>

                    {/* File Type Breakdown Pie */}
                    <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
                      <h4 className="text-sm font-semibold text-slate-200 mb-4">File Type Breakdown</h4>
                      {fileTypePieData.length === 0 ? (
                        <div className="h-48 flex items-center justify-center text-slate-500 text-xs">No files uploaded yet</div>
                      ) : (
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart>
                            <Pie
                              data={fileTypePieData}
                              cx="50%"
                              cy="50%"
                              outerRadius={80}
                              dataKey="value"
                              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                              labelLine={false}
                              stroke="none"
                            >
                              {fileTypePieData.map((_, i) => (
                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, fontSize: 12 }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>

                  {/* Charts row 2 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Upload Timeline */}
                    <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
                      <h4 className="text-sm font-semibold text-slate-200 mb-4">Upload Timeline</h4>
                      {uploadTimeline.length === 0 ? (
                        <div className="h-48 flex items-center justify-center text-slate-500 text-xs">No upload history yet</div>
                      ) : (
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart data={uploadTimeline}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                            <Tooltip
                              contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, fontSize: 12 }}
                              labelStyle={{ color: "#94a3b8" }}
                            />
                            <Line
                              type="monotone"
                              dataKey="count"
                              stroke="#10b981"
                              strokeWidth={2}
                              dot={{ fill: "#10b981", r: 3 }}
                              name="Uploads"
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      )}
                    </div>

                    {/* Share Link Status Bar Chart */}
                    <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
                      <h4 className="text-sm font-semibold text-slate-200 mb-4">Share Link Status</h4>
                      {userShareLinks.length === 0 ? (
                        <div className="h-48 flex items-center justify-center text-slate-500 text-xs">No share links created yet</div>
                      ) : (
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={shareStatusData} barCategoryGap="40%">
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                            <Tooltip
                              contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, fontSize: 12 }}
                              cursor={{ fill: "rgba(255,255,255,0.03)" }}
                            />
                            <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Links">
                              {shareStatusData.map((entry, i) => (
                                <Cell key={i} fill={entry.fill} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}


            {/* VIEW 3: USER FILE VAULT */}
            {userTab === "files" && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      placeholder="Search encrypted files..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 focus:border-emerald-500 focus:outline-none text-sm text-white placeholder-slate-500 transition"
                    />
                  </div>

                  <form onSubmit={handleFileUpload} className="flex items-center gap-2">
                    <input
                      type="file"
                      id="file-upload"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) setSelectedFile(e.target.files[0]);
                      }}
                    />
                    <label
                      htmlFor="file-upload"
                      className="cursor-pointer px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-sm font-medium text-slate-300 hover:text-white transition flex items-center gap-2"
                    >
                      <Upload className="w-4 h-4 text-emerald-400" />
                      <span>{selectedFile ? selectedFile.name : "Select File"}</span>
                    </label>

                    <button
                      type="submit"
                      disabled={!selectedFile || uploadLoading}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-lg shadow-emerald-500/20 transition disabled:opacity-50"
                    >
                      {uploadLoading ? "Uploading..." : "Upload"}
                    </button>
                  </form>
                </div>

                {uploadStatus && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{uploadStatus}</span>
                  </div>
                )}

                <div className="border border-slate-800 rounded-2xl bg-slate-900/30 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-200 text-sm">
                      Encrypted Documents ({filteredFiles.length})
                    </h3>
                  </div>

                  {filteredFiles.length === 0 ? (
                    <div className="py-16 text-center text-slate-500 space-y-2">
                      <Shield className="w-10 h-10 mx-auto text-slate-700" />
                      <p className="text-sm font-medium">No files found in this category.</p>
                      <p className="text-xs text-slate-600">Select a file above to securely upload.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-800/80 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                            <th className="px-6 py-3">File Name</th>
                            <th className="px-6 py-3">Size</th>
                            <th className="px-6 py-3">Uploaded</th>
                            <th className="px-6 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                          {filteredFiles.map((file) => (
                            <tr key={file.id} className="hover:bg-slate-900/50 transition">
                              <td className="px-6 py-3.5 flex items-center gap-3 font-medium text-slate-200">
                                {getFileIcon(file.original_filename)}
                                <div className="flex flex-col">
                                  <span className="truncate max-w-xs">{file.original_filename}</span>
                                  <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                                    <Lock className="w-2.5 h-2.5" /> AES-256-GCM Encrypted
                                  </span>
                                </div>
                              </td>
                              <td className="px-6 py-3.5 text-slate-400 font-mono text-xs">
                                {formatFileSize(file.file_size)}
                              </td>
                              <td className="px-6 py-3.5 text-slate-500 text-xs">
                                {file.uploaded_at ? file.uploaded_at.slice(0, 10) : "Recent"}
                              </td>
                              <td className="px-6 py-3.5 text-right space-x-2">
                                <button
                                  onClick={() => handleDownload(file.id, file.original_filename)}
                                  title="Download Decrypted File"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    setSharingModalFile(file);
                                    setGeneratedShareUrl("");
                                    setCopiedLink(false);
                                  }}
                                  title="Share File (Encrypted Temporary Link)"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition"
                                >
                                  <Share2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDelete(file.id)}
                                  title="Delete File"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

          </main>
        </div>
      )}

      {/* 3. Auth Modal */}
      {showAuthModal && !user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row">
            <button
              onClick={() => {
                setShowAuthModal(false);
                setAuthError("");
                setAuthSuccess("");
              }}
              className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
            >
              ✕
            </button>

            <div className="w-full md:w-5/12 bg-gradient-to-b from-slate-900 via-slate-900 to-emerald-950/40 p-8 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-800">
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-500/20">
                    <Shield className="w-4 h-4 text-white" />
                  </div>
                  <span className="font-bold text-lg text-white">TrustShare</span>
                </div>

                <div className="space-y-2">
                  <h3 className="text-2xl font-extrabold text-white leading-tight">
                    Secure File Sharing for a <span className="text-emerald-400">Safer Tomorrow</span>
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Upload, store, and share your important files with end-to-end security,
                    encryption, and complete control.
                  </p>
                </div>

                <div className="space-y-3 pt-2 text-xs text-slate-300">
                  <div className="flex items-start gap-2.5">
                    <div className="p-1 rounded bg-emerald-500/10 text-emerald-400 mt-0.5">
                      <Lock className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <p className="font-semibold text-white">AES-256 Encrypted Storage</p>
                      <p className="text-[11px] text-slate-400">Your files stay private and protected</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <div className="p-1 rounded bg-teal-500/10 text-teal-400 mt-0.5">
                      <Users className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <p className="font-semibold text-white">Controlled Sharing</p>
                      <p className="text-[11px] text-slate-400">Set permissions and role boundaries</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <div className="p-1 rounded bg-emerald-500/10 text-emerald-400 mt-0.5">
                      <Activity className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <p className="font-semibold text-white">Track & Monitor</p>
                      <p className="text-[11px] text-slate-400">Full audit logs and activity tracking</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 pt-6">
                <span className="w-6 h-1 rounded-full bg-emerald-500"></span>
                <span className="w-2 h-1 rounded-full bg-slate-700"></span>
                <span className="w-2 h-1 rounded-full bg-slate-700"></span>
              </div>
            </div>

            <div className="w-full md:w-7/12 p-8 bg-slate-900 flex flex-col justify-center">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  {authTab === "login" ? "Welcome Back" : "Create Account"}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  {authTab === "login"
                    ? "Sign in to your TrustShare account"
                    : "Join the intelligent encrypted file sharing platform"}
                </p>
              </div>

              <div className="flex bg-slate-950 p-1 rounded-xl mb-5 border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab("login");
                    setAuthError("");
                  }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                    authTab === "login"
                      ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab("register");
                    setAuthError("");
                  }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                    authTab === "register"
                      ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Sign Up
                </button>
              </div>

              {authError && (
                <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              {authSuccess && (
                <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{authSuccess}</span>
                </div>
              )}

              {authTab === "login" ? (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Email Address</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none text-sm text-white placeholder-slate-500 transition"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-slate-300">Password</label>
                      <span className="text-[11px] text-emerald-400 hover:underline cursor-pointer">
                        Forgot password?
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none text-sm text-white placeholder-slate-500 transition pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-500/20 transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <span>{authLoading ? "Signing in..." : "Sign In →"}</span>
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRegister} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Sanjith"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none text-sm text-white placeholder-slate-500 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none text-sm text-white placeholder-slate-500 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none text-sm text-white placeholder-slate-500 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Role (RBAC)</label>
                    <select
                      value={role}
                      onChange={(e: any) => setRole(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none text-sm text-white transition"
                    >
                      <option value="user">Standard User (Private files)</option>
                      <option value="admin">Administrator (Platform Security)</option>
                      <option value="guest">Guest (Read only)</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-500/20 transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <span>{authLoading ? "Creating account..." : "Sign Up →"}</span>
                  </button>
                </form>
              )}

              <div className="mt-5 text-center">
                <p className="text-xs text-slate-400">
                  {authTab === "login" ? "Don't have an account? " : "Already have an account? "}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthTab(authTab === "login" ? "register" : "login");
                      setAuthError("");
                      setAuthSuccess("");
                    }}
                    className="text-emerald-400 font-semibold hover:underline"
                  >
                    {authTab === "login" ? "Sign up" : "Sign in"}
                  </button>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Milestone 2: Secure File Sharing Configuration Modal */}
      {sharingModalFile && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl relative space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">Create Secure Share Link</h3>
                  <p className="text-xs text-slate-400 truncate max-w-xs">{sharingModalFile.original_filename}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSharingModalFile(null);
                  setGeneratedShareUrl("");
                }}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            {!generatedShareUrl ? (
              <form onSubmit={handleCreateShareLink} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Link Expiration (Time-to-Live)
                  </label>
                  <select
                    value={shareHours}
                    onChange={(e) => setShareHours(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none text-xs text-white"
                  >
                    <option value={1}>1 Hour (Quick Sharing)</option>
                    <option value={24}>24 Hours (Standard 1 Day)</option>
                    <option value={168}>7 Days (1 Week)</option>
                    <option value={720}>30 Days (Extended)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Access Permission
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setSharePermission("download")}
                      className={`p-3 rounded-xl border text-left transition ${
                        sharePermission === "download"
                          ? "border-emerald-500 bg-emerald-500/10 text-white"
                          : "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <p className="text-xs font-semibold">Download & Save</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Recipient can decrypt & save file</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSharePermission("view")}
                      className={`p-3 rounded-xl border text-left transition ${
                        sharePermission === "view"
                          ? "border-blue-500 bg-blue-500/10 text-white"
                          : "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <p className="text-xs font-semibold">View Only</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">In-browser preview without download</p>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Maximum Download Limit (Optional)
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Leave empty for unlimited downloads"
                    value={shareMaxDownloads}
                    onChange={(e) => setShareMaxDownloads(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none text-xs text-white placeholder-slate-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Link expires automatically once this download limit is reached
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={shareLoading}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <span>{shareLoading ? "Generating Cryptographic Token..." : "Generate Secure Share Link →"}</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 pt-2">
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Secure Encrypted Link Generated!</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    This single-use access link is protected with a 256-bit cryptographically unpredictable token.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-400">Share Link URL</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={generatedShareUrl}
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-emerald-400 font-mono select-all focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(generatedShareUrl);
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2500);
                      }}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shrink-0 transition"
                    >
                      {copiedLink ? "Copied!" : "Copy Link"}
                    </button>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => {
                      setSharingModalFile(null);
                      setGeneratedShareUrl("");
                      setUserTab("shares");
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition"
                  >
                    View All Active Links →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Milestone 2: Recipient Public Share Access Modal */}
      {publicShareModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl relative space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">Access Shared Encrypted File</h3>
                  <p className="text-xs text-slate-400">Enter token or verify shared link permissions</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setPublicShareModalOpen(false);
                  setPublicShareError("");
                  setPublicShareData(null);
                }}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-medium text-slate-300">Share Link Token</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Paste 256-bit token here..."
                  value={publicShareToken}
                  onChange={(e) => setPublicShareToken(e.target.value)}
                  className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 text-xs text-white font-mono placeholder-slate-500 focus:outline-none"
                />
                <button
                  onClick={() => fetchPublicShareInfo(publicShareToken)}
                  disabled={publicShareLoading || !publicShareToken.trim()}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shrink-0 transition disabled:opacity-50"
                >
                  {publicShareLoading ? "Verifying..." : "Verify"}
                </button>
              </div>
            </div>

            {publicShareError && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{publicShareError}</span>
              </div>
            )}

            {publicShareData && (
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                    AES-256-GCM Verified
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Expires: {formatLocalDateTime(publicShareData.expires_at)}
                  </span>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <div className="p-2.5 rounded-xl bg-slate-900 text-emerald-400 border border-slate-800">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div className="truncate">
                    <p className="font-semibold text-white text-sm truncate">{publicShareData.original_filename}</p>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      {formatFileSize(publicShareData.file_size)} • {publicShareData.permission === "view" ? "View Only" : "Full Download"}
                    </p>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => handlePublicDownload(publicShareToken, publicShareData.original_filename, publicShareData.permission)}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>
                      {publicShareData.permission === "view" ? "Decrypt & View File" : "Decrypt & Download File"}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}


      {/* Active Security Specification Modal */}
      {activeSecurityModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl relative space-y-5 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl ${activeSecurityModal.color} flex items-center justify-center shadow-inner`}>
                  {(() => {
                    const ModalIcon = activeSecurityModal.icon;
                    return <ModalIcon className="w-6 h-6" />;
                  })()}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">
                    {activeSecurityModal.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      {activeSecurityModal.status}
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="text-[11px] font-mono text-slate-400">Security Control #{activeSecurityModal.id}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setActiveSecurityModal(null)}
                className="w-8 h-8 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            {/* Description */}
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <p className="text-xs text-slate-300 leading-relaxed">
                {activeSecurityModal.desc}
              </p>
            </div>

            {/* Technical Specification */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Cryptographic & Architectural Specification</span>
                <span className="text-[10px] text-emerald-400 font-mono">FIPS 140-2 Standards</span>
              </h4>
              <div className="p-4 rounded-xl bg-slate-950/90 border border-emerald-500/20 font-mono text-xs text-emerald-300 leading-relaxed">
                {activeSecurityModal.spec}
              </div>
            </div>

            {/* Verification Parameters */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Telemetry Verification</span>
                <p className="font-semibold text-white">Live ACID Audit Trail</p>
                <p className="text-[11px] text-slate-400">Persisted in PostgreSQL audit_logs</p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Access Scope</span>
                <p className="font-semibold text-white">Platform-Wide Guard</p>
                <p className="text-[11px] text-slate-400">Role-gated end-to-end enforcement</p>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
              {user?.role === "admin" ? (
                <button
                  onClick={() => {
                    const filter =
                      activeSecurityModal.id === "aes" || activeSecurityModal.id === "downloads"
                        ? "FILE_DOWNLOAD"
                        : "USER_LOGIN";
                    setAdminTab("logs");
                    handleLogFilterChange(filter);
                    setActiveSecurityModal(null);
                  }}
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1.5 transition"
                >
                  <span>Inspect Audit Records in Logs</span>
                  <span>→</span>
                </button>
              ) : (
                <span className="text-[11px] text-slate-500">Security active on your account</span>
              )}
              <button
                onClick={() => setActiveSecurityModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition"
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