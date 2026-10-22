"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import AdminGraphicalAnalytics from "@/components/AdminGraphicalAnalytics";
import {
  ShieldCheck,
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
  AlertCircle
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
  const [userStorageQuotaBytes, setUserStorageQuotaBytes] = useState(500 * 1024 * 1024);
  const [userRemainingBytes, setUserRemainingBytes] = useState(500 * 1024 * 1024);
  const [userQuotaMb, setUserQuotaMb] = useState(500);

  // Security Alerts & Failed Login Notifications
  const [securityAlerts, setSecurityAlerts] = useState({ count: 0, list: [] });
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);

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

  // Password Visibility Toggle States for Modals
  const [showUploadPassword, setShowUploadPassword] = useState(false);
  const [showNewFolderPassword, setShowNewFolderPassword] = useState(false);
  const [showUnlockPassword, setShowUnlockPassword] = useState(false);
  const [showManagePassword, setShowManagePassword] = useState(false);

  // User Personal Activity Log State
  const [userLogs, setUserLogs] = useState([]);
  const [loadingUserLogs, setLoadingUserLogs] = useState(false);

  // Notifications Toast
  const [toastMessage, setToastMessage] = useState(null);

  // Admin Analytics & Moderation State
  const [adminAnalytics, setAdminAnalytics] = useState(null);
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
      } else {
        setActiveTab("my-vault");
      }
    } catch {
      window.location.href = "/login";
    }
  }, []);

  // Fetch Items from Backend
  const fetchItems = useCallback(async () => {
    if (!token) return;
    setLoadingItems(true);

    try {
      let filterParam = "all";
      if (activeTab === "starred") filterParam = "starred";
      if (activeTab === "recent") filterParam = "recent";
      if (activeTab === "shared") filterParam = "shared";

      const params = {
        folder_id: (activeTab === "my-vault" && currentFolderId) ? currentFolderId : undefined,
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
      if (res.data.user_storage_quota_bytes) {
        setUserStorageQuotaBytes(res.data.user_storage_quota_bytes);
      }
      if (res.data.user_remaining_bytes !== undefined) {
        setUserRemainingBytes(res.data.user_remaining_bytes);
      }
      if (res.data.user_quota_mb) {
        setUserQuotaMb(res.data.user_quota_mb);
      }
    } catch (err) {
      console.error("Failed to load files:", err);
      showToast("Unable to load files.", "error");
    } finally {
      setLoadingItems(false);
    }
  }, [token, activeTab, currentFolderId, categoryFilter, searchQuery, sortBy]);

  // Fetch User Personal Activity Logs
  const fetchUserLogs = useCallback(async () => {
    if (!token) return;
    setLoadingUserLogs(true);
    try {
      const res = await api.get("/files/activity-logs", { params: { limit: 50 } });
      setUserLogs(res.data.logs || []);
    } catch (err) {
      console.error("Failed to load user activity logs:", err);
      showToast("Failed to load activity logs.", "error");
    } finally {
      setLoadingUserLogs(false);
    }
  }, [token]);

  // Fetch Security Alerts & Incorrect Logins for Admins
  const fetchSecurityAlerts = useCallback(async () => {
    if (!token || !user || user.role !== "admin") return;
    try {
      const res = await api.get("/admin/security-alerts");
      setSecurityAlerts({
        count: res.data.total || 0,
        list: res.data.alerts || []
      });
    } catch (err) {
      if (err.response?.status !== 403) {
        console.warn("Failed to fetch security alerts:", err);
      }
    }
  }, [token, user]);

  // Load items whenever relevant filters change
  useEffect(() => {
    if (activeTab !== "admin-analytics" && activeTab !== "user-activity") {
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

  // Fetch Admin Analytics
  const fetchAdminData = useCallback(async () => {
    if (!token || !user || user.role !== "admin") {
      setActiveTab("my-vault");
      return;
    }
    setLoadingAdmin(true);

    try {
      const [analyticsRes, logsRes, usersRes] = await Promise.all([
        api.get("/admin/analytics"),
        api.get("/admin/audit-logs", {
          params: {
            limit: 50,
            action: logFilterAction !== "ALL" ? logFilterAction : undefined,
            username: logSearchUser.trim() || undefined
          }
        }),
        api.get("/admin/users")
      ]);

      setAdminAnalytics(analyticsRes.data);
      if (analyticsRes.data?.security_alerts) {
        setSecurityAlerts({
          count: analyticsRes.data.security_alerts.failed_logins_count || 0,
          list: analyticsRes.data.security_alerts.recent_failed_logins || []
        });
      }
      setAdminLogs(logsRes.data.logs || []);
      setAdminUsers(usersRes.data.users || []);
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
  }, [token, user, logFilterAction, logSearchUser]);

  useEffect(() => {
    if (activeTab === "admin-analytics") {
      fetchAdminData();
    }
  }, [activeTab, fetchAdminData]);

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

  // Sign out
  const handleLogout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (err) {
      console.warn("Logout notification failed:", err);
    } finally {
      localStorage.removeItem("trustshare_token");
      localStorage.removeItem("trustshare_user");
      setUser(null);
      setToken(null);
      setActiveTab("my-vault");
      window.location.href = "/login";
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
        throw new Error("Download failed");
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
        throw new Error("Folder download failed");
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
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
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

  // Move to Trash
  const handleTrashItem = async (item) => {
    try {
      await api.delete(`/files/${item.id}`);
      fetchItems();
      showToast(`'${item.name}' moved to Trash.`);
    } catch {
      showToast("Failed to move item to Trash", "error");
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
      className="min-h-screen bg-slate-50 flex flex-col md:flex-row text-slate-800 font-sans relative"
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
      {isDragging && (
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
      <aside className="w-full md:w-64 bg-slate-900 text-slate-300 flex flex-col justify-between p-5 border-r border-slate-800 shrink-0">
        <div>
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-3 mb-6 px-2 group">
            <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold tracking-tight text-white leading-tight">
                TrustShare
              </span>
              <span className="text-[10px] uppercase font-semibold text-emerald-400 tracking-wider flex items-center gap-1.5 mt-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                AES-256 Vault Online
              </span>
            </div>
          </Link>

          {/* Nav Links */}
          <nav className="space-y-1 text-sm font-medium">
            {user.role === "admin" ? (
              <>
                <div className="px-3 mb-2 flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">
                    Administrator Controls
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 font-mono font-bold">
                    RBAC
                  </span>
                </div>

                <button
                  onClick={() => {
                    setActiveTab("admin-analytics");
                    if (adminSubTab === "logs") setAdminSubTab("overview");
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition cursor-pointer ${
                    activeTab === "admin-analytics" && adminSubTab !== "logs"
                      ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold shadow-md shadow-indigo-900/30"
                      : "hover:bg-slate-800 text-slate-300 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Activity className="h-4 w-4 text-purple-400" />
                    <span>Admin Analytics</span>
                  </div>
                  {securityAlerts.count > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-bold animate-pulse">
                      {securityAlerts.count}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => {
                    setActiveTab("admin-analytics");
                    setAdminSubTab("logs");
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition cursor-pointer ${
                    activeTab === "admin-analytics" && adminSubTab === "logs"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "hover:bg-slate-800 text-slate-300 hover:text-white"
                  }`}
                >
                  <Activity className="h-4 w-4 text-cyan-400" />
                  <span>Activity Log</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setActiveTab("my-vault");
                    setCurrentFolderId(null);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition cursor-pointer ${
                    activeTab === "my-vault"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4" />
                    <span>My Vault</span>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-300">
                    {userTotalFiles}
                  </span>
                </button>

                <button
                  onClick={() => {
                    setActiveTab("shared");
                    setCurrentFolderId(null);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition cursor-pointer ${
                    activeTab === "shared"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <Share2 className="h-4 w-4 text-sky-400" />
                  <span>Shared Files</span>
                </button>

                <button
                  onClick={() => {
                    setActiveTab("recent");
                    setCurrentFolderId(null);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition cursor-pointer ${
                    activeTab === "recent"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <Clock className="h-4 w-4 text-emerald-400" />
                  <span>Recent Uploads</span>
                </button>

                <button
                  onClick={() => {
                    setActiveTab("starred");
                    setCurrentFolderId(null);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition cursor-pointer ${
                    activeTab === "starred"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <Star className="h-4 w-4 text-amber-400" />
                  <span>Starred Assets</span>
                </button>

                <button
                  onClick={() => {
                    setActiveTab("user-activity");
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition cursor-pointer ${
                    activeTab === "user-activity"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <Activity className="h-4 w-4 text-cyan-400" />
                  <span>Activity Log</span>
                </button>
              </>
            )}
          </nav>
        </div>

        {/* Encrypted Storage Bar & Sign Out */}
        <div className="space-y-4 pt-6 border-t border-slate-800">
          {user.role === "admin" ? (
            <div className="p-3.5 bg-slate-800/70 rounded-2xl border border-slate-700/60 text-xs">
              <div className="flex items-center gap-2 text-amber-400 font-semibold mb-1">
                <ShieldCheck className="h-4 w-4 text-amber-400" />
                <span>Admin Telemetry Mode</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                System telemetry, user RBAC moderation, and security audit logs are actively monitored.
              </p>
            </div>
          ) : (
            <div className="p-3.5 bg-slate-800/70 rounded-2xl border border-slate-700/60 text-xs">
              <div className="flex items-center justify-between text-slate-300 mb-1.5 font-medium">
                <div className="flex items-center gap-1.5">
                  <HardDrive className="h-3.5 w-3.5 text-blue-400" />
                  <span className="font-semibold">Vault Storage</span>
                </div>
                <span className="text-slate-400 font-mono text-[11px]">
                  {formatBytes(userStorageBytes)} / 500 MB
                </span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden my-2">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${
                    storagePercent > 90
                      ? "bg-rose-500"
                      : storagePercent > 70
                      ? "bg-amber-500"
                      : "bg-blue-500"
                  }`}
                  style={{ width: `${Math.max(storagePercent, 1)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                <span>{storagePercent}% used</span>
                <span className="text-emerald-400 font-bold font-mono">
                  {formatBytes(userRemainingBytes)} free
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1.5">
                AES-256 GCM • 500 MB individual quota
              </p>
            </div>
          )}

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 text-xs font-semibold text-slate-400 hover:text-rose-400 px-2 py-2 rounded-lg hover:bg-slate-800/50 transition cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ==================================================================== */}
      {/* MAIN CONTENT AREA */}
      {/* ==================================================================== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-4 sticky top-0 z-10">
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

            {/* Admin Notifications Bell for Incorrect Logins */}
            {user.role === "admin" && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowNotificationsModal(true)}
                  title="Security Alerts & Incorrect Logins"
                  className="relative p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer border border-slate-200"
                >
                  <Bell className="h-4 w-4" />
                  {securityAlerts.count > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 bg-rose-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                      {securityAlerts.count}
                    </span>
                  )}
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

            <div className="h-8 w-px bg-slate-200" />

            <div className="flex items-center gap-3">
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
          </div>
        </header>

        {/* ================================================================== */}
        {/* VIEW 1: ADMIN ANALYTICS & DASHBOARD (Only for Admin tab) */}
        {/* ================================================================== */}
        {activeTab === "admin-analytics" && (
          <main className="p-6 md:p-8 space-y-6 flex-1 overflow-y-auto bg-slate-50">
            {/* Clean Admin Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                  <Activity className="h-6 w-6 text-purple-600" />
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
                  onClick={() => setAdminSubTab("logs")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    adminSubTab === "logs"
                      ? "bg-purple-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  Audit Logs ({adminAnalytics?.total_audit_events || 0})
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
                    {/* Security Alerts Banner for Incorrect Logins */}
                    {securityAlerts.count > 0 && (
                      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 shadow-2xs">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                          <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-rose-100 text-rose-700">
                              <ShieldAlert className="h-6 w-6" />
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-rose-950 flex items-center gap-2">
                                <span>Security Notification: {securityAlerts.count} Incorrect Login Attempt(s)</span>
                                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-rose-200 text-rose-800">
                                  Alert
                                </span>
                              </h3>
                              <p className="text-xs text-rose-700 mt-0.5">
                                Real-time telemetry detected invalid authentication attempts. Inspect IP and target accounts.
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setAdminSubTab("logs");
                              setLogFilterAction("LOGIN_FAILED");
                            }}
                            className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer self-start sm:self-auto shrink-0 flex items-center gap-1.5"
                          >
                            <span>Inspect in Audit Logs</span>
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                          {securityAlerts.list.slice(0, 3).map((alert) => (
                            <div key={alert.id} className="p-3 bg-white rounded-xl border border-rose-200/80 text-xs space-y-1 shadow-2xs">
                              <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                                <span>{new Date(alert.timestamp).toLocaleTimeString()}</span>
                                <span className="text-rose-700 font-bold px-1.5 py-0.2 bg-rose-50 rounded">FAILED</span>
                              </div>
                              <p className="font-semibold text-slate-800 truncate">
                                Target: <span className="text-rose-900">{alert.username || "Unknown"}</span>
                              </p>
                              <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                                <span>IP: {alert.ip_address}</span>
                                {alert.details?.reason && (
                                  <span className="text-rose-600 text-[10px] truncate max-w-[120px]" title={alert.details.reason}>
                                    {alert.details.reason}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

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
                        <p className="text-2xl font-bold text-slate-900">{adminAnalytics.users.total}</p>
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
                        <p className="text-2xl font-bold text-slate-900">
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
                        <p className="text-2xl font-bold text-slate-900">
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
                        <p className="text-2xl font-bold text-slate-900">
                          {adminAnalytics.total_audit_events}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          Logged security & document actions
                        </p>
                      </div>
                    </div>

                    {/* Graphical Analytics Suite: Interactive 7-Day Activity Curves, Category Donut & User Storage Bars */}
                    <AdminGraphicalAnalytics
                      adminAnalytics={adminAnalytics}
                      formatBytes={formatBytes}
                      onCleanAdminStorage={handleCleanAdminStorage}
                      isCleaningStorage={isCleaningAdminStorage}
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
                                <select
                                  value={u.role}
                                  onChange={(e) => handleAdminChangeUserRole(u.id, e.target.value)}
                                  className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-600 cursor-pointer"
                                >
                                  <option value="admin">👑 Admin</option>
                                  <option value="user">👤 User</option>
                                </select>
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
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                    <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h2 className="text-base font-bold text-slate-900">Live MongoDB Security & Document Audit Logs</h2>
                        <p className="text-xs text-slate-500">Chronological telemetry of every file upload, download, and login attempt</p>
                      </div>

                      {/* Filter by action */}
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={logFilterAction}
                          onChange={(e) => setLogFilterAction(e.target.value)}
                          className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none"
                        >
                          <option value="ALL">All Actions</option>
                          <option value="LOGIN_FAILED">🚨 LOGIN_FAILED (Incorrect Login)</option>
                          <option value="LOGIN_SUCCESS">LOGIN_SUCCESS</option>
                          <option value="FILE_UPLOAD">FILE_UPLOAD</option>
                          <option value="FOLDER_CREATE">FOLDER_CREATE</option>
                          <option value="FILE_DOWNLOAD">FILE_DOWNLOAD</option>
                          <option value="PASSWORD_SET">PASSWORD_SET</option>
                          <option value="USER_ROLE_UPDATED">USER_ROLE_UPDATED</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => setLogFilterAction(logFilterAction === "LOGIN_FAILED" ? "ALL" : "LOGIN_FAILED")}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                            logFilterAction === "LOGIN_FAILED"
                              ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                              : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                          }`}
                        >
                          <ShieldAlert className="h-3.5 w-3.5" />
                          <span>{logFilterAction === "LOGIN_FAILED" ? "Show All Actions" : "Failed Logins Only"}</span>
                        </button>

                        <button
                          onClick={fetchAdminData}
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-500 transition cursor-pointer"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                          <tr>
                            <th className="px-5 py-3">Timestamp</th>
                            <th className="px-5 py-3">User</th>
                            <th className="px-5 py-3">Action</th>
                            <th className="px-5 py-3">Details / Target</th>
                            <th className="px-5 py-3">IP Address</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {adminLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-slate-50/70 transition">
                              <td className="px-5 py-3 text-slate-400 font-mono text-[11px]">
                                {new Date(log.timestamp).toLocaleString()}
                              </td>
                              <td className="px-5 py-3 font-semibold text-slate-800">
                                {log.username || "Anonymous"}
                              </td>
                              <td className="px-5 py-3">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10px] font-bold ${
                                    log.action.includes("DELETE") || log.action.includes("FAILED")
                                      ? "bg-rose-100 text-rose-700 border border-rose-200"
                                      : log.action.includes("UPLOAD") || log.action.includes("SUCCESS")
                                      ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                                      : log.action.includes("PASSWORD")
                                      ? "bg-amber-100 text-amber-700 border border-amber-200"
                                      : "bg-blue-100 text-blue-700 border border-blue-200"
                                  }`}
                                >
                                  {log.action.includes("FAILED") && <ShieldAlert className="h-3 w-3 text-rose-600" />}
                                  {log.action}
                                </span>
                              </td>
                              <td className="px-5 py-3 font-medium text-slate-700">
                                {log.details?.reason ? (
                                  <span className="text-rose-700 italic">
                                    {log.details.reason}
                                  </span>
                                ) : (
                                  log.resource_name || "-"
                                )}
                              </td>
                              <td className="px-5 py-3 text-slate-400 font-mono">
                                {log.ip_address}
                              </td>
                            </tr>
                          ))}
                          {adminLogs.length === 0 && (
                            <tr>
                              <td colSpan="5" className="text-center py-8 text-slate-400">
                                No audit records found for this filter.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
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
        {activeTab !== "admin-analytics" && activeTab !== "user-activity" && (
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

                <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                  <span>
                    {activeTab === "starred"
                      ? "Starred Assets"
                      : activeTab === "recent"
                      ? "Recent Uploads"
                      : activeTab === "shared"
                      ? "Shared Files"
                      : currentFolderDetails
                      ? currentFolderDetails.name
                      : "Encrypted Workspace"}
                  </span>
                  {currentFolderDetails?.is_password_protected && (
                    <span className="p-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200" title="Password Protected Folder">
                      <Lock className="h-4 w-4" />
                    </span>
                  )}
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  {activeTab === "starred"
                    ? "Your favorited and bookmarked assets for instant access"
                    : activeTab === "recent"
                    ? "Chronological view of files uploaded recently across your workspace"
                    : activeTab === "shared"
                    ? "Files secured with access passcodes and direct collaborative links"
                    : "Google Drive-style encrypted document vault with folder-wise hierarchy & password permissions"}
                </p>
              </div>

              {/* Contextual Action Buttons */}
              <div className="flex items-center gap-2">
                {activeTab === "my-vault" && (
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

            {/* Dynamic Real Vault Metrics Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              {/* Card 1: Real Total Files */}
              <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <span>Vault Assets</span>
                  <FileText className="h-4 w-4 text-blue-600" />
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl font-bold text-slate-900">
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
                  <span className="text-xl font-bold text-slate-900">
                    {formatBytes(userStorageBytes)}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    / 500 MB ({storagePercent}%)
                  </span>
                </div>
              </div>

              {/* Card 3: Real Protected Assets */}
              <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <span>Protected</span>
                  <Lock className="h-4 w-4 text-amber-600" />
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl font-bold text-slate-900">
                    {items.filter((i) => i.is_password_protected).length}
                  </span>
                  <span className="text-xs text-amber-700 font-medium">Locked Assets</span>
                </div>
              </div>

              {/* Card 4: Real Starred Assets */}
              <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <span>Starred</span>
                  <Star className="h-4 w-4 text-amber-500 fill-amber-500/20" />
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl font-bold text-slate-900">
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
                    No shared files
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    Files protected with passcodes or shared with team members will appear here.
                  </p>
                </div>
              ) : (
                /* Empty Dropzone State for My Vault */
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
                    className="mt-4 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-xs font-semibold hover:bg-blue-100 transition"
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
                                  onClick={() => setShareModalItem(file)}
                                  title="Share Link"
                                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
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
                          </td>
                          <td className="px-5 py-3.5 text-slate-400 font-mono text-[11px]">
                            {new Date(item.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="inline-flex items-center gap-2">
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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                  <Activity className="h-6 w-6 text-cyan-600" />
                  <span>Activity Log</span>
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time chronological audit trail of your file uploads, downloads, deletions, and security events
                </p>
              </div>

              <button
                type="button"
                onClick={fetchUserLogs}
                disabled={loadingUserLogs}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 shadow-2xs transition cursor-pointer"
              >
                <RefreshCw className={`h-4 w-4 text-slate-600 ${loadingUserLogs ? "animate-spin" : ""}`} />
                <span>Refresh Log</span>
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Recent Telemetry Events
                </span>
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
                      {userLogs.map((log) => (
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
                          <td className="px-5 py-3.5 text-slate-500 font-mono text-[11px]">
                            {log.details ? JSON.stringify(log.details) : "-"}
                          </td>
                        </tr>
                      ))}
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
      {showUploadModal && (
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
      {showFolderModal && (
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
                '{passwordModal.item?.name}' is password protected.
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

      {/* ==================================================================== */}
      {/* MODAL 6: SHARE LINK MODAL */}
      {/* ==================================================================== */}
      {shareModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Share2 className="h-5 w-5 text-blue-600" />
                <h3 className="font-bold text-slate-900">Share Workspace Asset</h3>
              </div>
              <button
                onClick={() => {
                  setShareModalItem(null);
                  setCopiedLink(false);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 mb-3">
              Direct access link for <strong>{shareModalItem.name}</strong>
              {shareModalItem.is_password_protected && " (Password protected)"}:
            </p>

            <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200 mb-4">
              <input
                type="text"
                readOnly
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/dashboard?item=${shareModalItem.id}`}
                className="bg-transparent text-xs text-slate-700 w-full focus:outline-none font-mono"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    `${window.location.origin}/dashboard?item=${shareModalItem.id}`
                  );
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedLink ? "Copied" : "Copy"}</span>
              </button>
            </div>

            {shareModalItem.is_password_protected && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                <Lock className="h-4 w-4 shrink-0 text-amber-600" />
                <span>Recipients will be prompted to enter the password before downloading.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 7: SECURITY NOTIFICATIONS MODAL (INCORRECT LOGIN ALERTS) */}
      {/* ==================================================================== */}
      {showNotificationsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-rose-100 text-rose-600 rounded-xl">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Security Notifications</h3>
                  <p className="text-xs text-slate-500">
                    Failed authentication attempts & incorrect login alerts
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowNotificationsModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="my-4 max-h-80 overflow-y-auto space-y-2.5 pr-1">
              {securityAlerts.list.length > 0 ? (
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
                <div className="py-8 text-center text-slate-400 text-xs">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                  <p className="font-semibold text-slate-700">No security alerts</p>
                  <p className="text-slate-400 mt-0.5">All recent login attempts are clean and authorized.</p>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setShowNotificationsModal(false);
                  if (user?.role === "admin") {
                    setActiveTab("admin-analytics");
                    setAdminSubTab("logs");
                    setLogFilterAction("LOGIN_FAILED");
                  } else {
                    setActiveTab("user-activity");
                  }
                }}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
              >
                <span>Inspect in {user?.role === "admin" ? "Audit Logs" : "Activity Log"}</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setShowNotificationsModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer"
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