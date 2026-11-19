import React, { useState, useEffect, useRef } from 'react';

export default function FileAnalyticsDashboard({ onNavigate, user, onLogout }) {
  const [dateFilter, setDateFilter] = useState('Oct 1, 2026 - Nov 04, 2026');
  
  // Real Backend Files State
  const [files, setFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [backendOnline, setBackendOnline] = useState(false);

  // Active Tab Filter (All, Documents, Spreadsheets, Images, Active Shares, Audit Trail)
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeShares, setActiveShares] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);

  // Milestone 3: Notifications State (Task 3)
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);

  // Upload State
  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [alertBanner, setAlertBanner] = useState({ type: '', message: '' });

  // Share Modal State
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [activeShareFile, setActiveShareFile] = useState(null);
  const [expiryHours, setExpiryHours] = useState(24);
  const [sharePermission, setSharePermission] = useState('DOWNLOAD');
  const [isCreatingShare, setIsCreatingShare] = useState(false);
  const [createdShare, setCreatedShare] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [isRevoked, setIsRevoked] = useState(false);

  // File Details / Cryptographic Envelope Inspector Modal
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const [inspectedFile, setInspectedFile] = useState(null);

  // Helper to format bytes
  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Helper for file badge styling
  const getFileBadge = (filename) => {
    const ext = filename?.split('.').pop()?.toUpperCase() || 'FILE';
    if (['PDF'].includes(ext)) return { ext, color: 'bg-red-50 text-red-600 border border-red-200' };
    if (['DOCX', 'DOC'].includes(ext)) return { ext, color: 'bg-blue-50 text-blue-600 border border-blue-200' };
    if (['XLSX', 'XLS', 'CSV'].includes(ext)) return { ext, color: 'bg-emerald-50 text-emerald-600 border border-emerald-200' };
    if (['PNG', 'JPG', 'JPEG'].includes(ext)) return { ext, color: 'bg-purple-50 text-purple-600 border border-purple-200' };
    return { ext, color: 'bg-slate-50 text-slate-600 border border-slate-200' };
  };

  const getAuthHeaders = (extra = {}) => {
    const headers = { ...extra };
    if (user?.token) {
      headers['Authorization'] = `Bearer ${user.token}`;
    }
    return headers;
  };

  // Fetch real uploaded files, active shares, notifications & audit logs from FastAPI backend
  const fetchBackendFiles = async () => {
    try {
      setLoadingFiles(true);
      
      // 1. Files
      const res = await fetch('http://localhost:8000/api/v1/files', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setFiles(data);
        setBackendOnline(true);
      } else {
        setFiles([]);
        setAlertBanner({ type: 'error', message: 'Unable to load your encrypted file vault.' });
        setBackendOnline(false);
      }

      // 2. Shares
      const shareRes = await fetch('http://localhost:8000/api/v1/shares', { headers: getAuthHeaders() });
      if (shareRes.ok) {
        const sharesData = await shareRes.json();
        setActiveShares(sharesData);
      }

      // 3. Milestone 3: Notifications (Task 3)
      const notifRes = await fetch('http://localhost:8000/api/v1/notifications', { headers: getAuthHeaders() });
      if (notifRes.ok) {
        const notifData = await notifRes.json();
        setNotifications(notifData.notifications || []);
        setUnreadCount(notifData.unread_count || 0);
      }

      // 4. Milestone 3: Audit Logs (Task 2)
      const auditRes = await fetch('http://localhost:8000/api/v1/audit-logs?limit=25', { headers: getAuthHeaders() });
      if (auditRes.ok) {
        const auditData = await auditRes.json();
        setAuditLogs(auditData);
      }
    } catch (err) {
      console.warn('Backend offline or unreachable:', err);
      setFiles([]);
      setAlertBanner({ type: 'error', message: 'The TrustShare backend is unavailable.' });
      setBackendOnline(false);
    } finally {
      setLoadingFiles(false);
    }
  };

  useEffect(() => {
    fetchBackendFiles();
  }, []);

  // Mark all notifications as read
  const handleMarkAllRead = async () => {
    try {
      await fetch('http://localhost:8000/api/v1/notifications/mark-all-read', {
        method: 'POST',
        headers: getAuthHeaders()
      });
      setUnreadCount(0);
      setNotifications(notifications.map(n => ({ ...n, is_read: true })));
    } catch (e) {
      console.error(e);
    }
  };

  // Trigger file dialog
  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Handle file upload to backend with AES-256 encryption
  const uploadSingleFile = async (file) => {
    if (!file) return;

    const allowedExtensions = ['.pdf', '.docx', '.xlsx', '.png', '.jpg', '.txt'];
    const fileExt = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowedExtensions.includes(fileExt)) {
      setAlertBanner({
        type: 'error',
        message: `File '${fileExt}' not permitted. Whitelisted: PDF, DOCX, XLSX, PNG, JPG, TXT.`
      });
      setTimeout(() => setAlertBanner({ type: '', message: '' }), 5000);
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      setIsUploading(true);
      setUploadStage('Generating 256-bit DEK & AES-GCM Encrypting...');
      setAlertBanner({
        type: 'info',
        message: `Encrypting '${file.name}' with AES-256-GCM and pushing to Cloud Vault...`
      });

      const res = await fetch('http://localhost:8000/api/v1/files/upload', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: 'Upload failed' }));
        throw new Error(errData.detail || 'Upload failed');
      }

      const result = await res.json();
      setAlertBanner({
        type: 'success',
        message: `File '${result.filename}' securely encrypted with AES-256-GCM & stored in Cloud Vault! (File ID: #${result.file_id})`
      });
      setTimeout(() => setAlertBanner({ type: '', message: '' }), 6000);

      fetchBackendFiles();
    } catch (err) {
      setAlertBanner({
        type: 'error',
        message: `Upload Error: ${err.message}`
      });
      setTimeout(() => setAlertBanner({ type: '', message: '' }), 6000);
    } finally {
      setIsUploading(false);
      setUploadStage('');
    }
  };

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) {
      uploadSingleFile(selected);
      e.target.value = '';
    }
  };

  // Drag and Drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = () => {
    setIsDragOver(false);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      uploadSingleFile(droppedFile);
    }
  };

  // Open Share Modal
  const openShareModal = (file) => {
    setActiveShareFile(file);
    setCreatedShare(null);
    setIsRevoked(false);
    setCopySuccess(false);
    setShareModalOpen(true);
  };

  // Open Inspector Modal
  const openInspectModal = (file) => {
    setInspectedFile(file);
    setInspectModalOpen(true);
  };

  // Generate Share Link via Backend
  const handleGenerateShare = async () => {
    if (!activeShareFile) return;

    try {
      setIsCreatingShare(true);
      const res = await fetch(`http://localhost:8000/api/v1/files/${activeShareFile.id}/share`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          expires_in_hours: parseInt(expiryHours, 10),
          permission: sharePermission
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Failed to create share link' }));
        throw new Error(err.detail || 'Failed to create share link');
      }

      const shareData = await res.json();
      setCreatedShare(shareData);
      setIsRevoked(false);
      fetchBackendFiles();
    } catch (err) {
      alert(`Error creating share link: ${err.message}`);
    } finally {
      setIsCreatingShare(false);
    }
  };

  // Copy share URL to clipboard
  const handleCopyUrl = (urlToCopy) => {
    const targetUrl = urlToCopy || createdShare?.share_url;
    if (!targetUrl) return;
    navigator.clipboard.writeText(targetUrl);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 3000);
  };

  // Revoke Share Link
  const handleRevokeShare = async (tokenToRevoke) => {
    const token = tokenToRevoke || createdShare?.share_token;
    if (!token) return;

    try {
      setIsRevoking(true);
      const res = await fetch(`http://localhost:8000/api/v1/share/${token}/revoke`, {
        method: 'POST',
        headers: getAuthHeaders()
      });

      if (!res.ok) {
        throw new Error('Could not revoke link.');
      }

      setIsRevoked(true);
      fetchBackendFiles();
    } catch (err) {
      alert(`Error revoking share link: ${err.message}`);
    } finally {
      setIsRevoking(false);
    }
  };

  // Authenticated In-Memory Decryption Download
  const handleDownloadFile = async (fileItem) => {
    try {
      setAlertBanner({ type: 'info', message: `Unwrapping DEK & Decrypting '${fileItem.filename}' in-memory over HTTPS...` });
      const res = await fetch(`http://localhost:8000/api/v1/files/${fileItem.id}/download`, {
        headers: getAuthHeaders()
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Decryption download failed' }));
        throw new Error(err.detail || 'Download failed');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileItem.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setAlertBanner({ type: 'success', message: `Decrypted and downloaded '${fileItem.filename}' successfully!` });
      setTimeout(() => setAlertBanner({ type: '', message: '' }), 4000);
      fetchBackendFiles();
    } catch (err) {
      setAlertBanner({ type: 'error', message: `Decryption Error: ${err.message}` });
      setTimeout(() => setAlertBanner({ type: '', message: '' }), 6000);
    }
  };

  // Filter files based on tab & search query
  const filteredFiles = files.filter((f) => {
    const ext = f.filename?.split('.').pop()?.toLowerCase();
    const matchesSearch = f.filename?.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (activeTab === 'all') return true;
    if (activeTab === 'docs') return ['pdf', 'docx', 'doc', 'txt'].includes(ext);
    if (activeTab === 'sheets') return ['xlsx', 'xls', 'csv'].includes(ext);
    if (activeTab === 'images') return ['png', 'jpg', 'jpeg'].includes(ext);
    return true;
  });

  return (
    <div className="min-h-full bg-slate-50 text-slate-800 font-sans relative selection:bg-blue-600 selection:text-white">
      {/* Hidden File Input for Direct AES-256 Uploads */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".pdf,.docx,.xlsx,.png,.jpg,.txt"
      />

      {/* Floating Status Notification Toast */}
      {alertBanner.message && (
        <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3.5 rounded-2xl shadow-2xl border flex items-center gap-3 text-xs font-semibold backdrop-blur-md transition-all ${
          alertBanner.type === 'error'
            ? 'bg-red-600/95 text-white border-red-500 shadow-red-500/20'
            : alertBanner.type === 'success'
            ? 'bg-emerald-600/95 text-white border-emerald-500 shadow-emerald-500/20'
            : 'bg-blue-600/95 text-white border-blue-500 shadow-blue-500/20'
        }`}>
          {alertBanner.type === 'info' && (
            <svg className="animate-spin w-4 h-4 text-white shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
          )}
          {alertBanner.type === 'success' && (
            <svg className="w-4 h-4 text-white shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
            </svg>
          )}
          {alertBanner.type === 'error' && (
            <svg className="w-4 h-4 text-white shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          <span>{alertBanner.message}</span>
          <button onClick={() => setAlertBanner({ type: '', message: '' })} className="ml-2 hover:opacity-75 font-bold">✕</button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="w-full overflow-y-auto p-6 lg:p-8 space-y-6">
        {/* Top Header Bar */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search encrypted vault files, keys, extensions..."
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-xs"
            />
            <svg className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </div>

          <div className="flex items-center gap-3">
            {/* Primary Action: Direct File Upload with AES-256 */}
            <button
              onClick={handleUploadClick}
              disabled={isUploading}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl text-xs font-bold shadow-lg shadow-blue-500/25 transition active:scale-95 disabled:opacity-50"
            >
              {isUploading ? (
                <>
                  <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  <span>Encrypting...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <span>Upload Encrypted File</span>
                </>
              )}
            </button>

            {/* MILESTONE 3 - TASK 3: Real-Time Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-2.5 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 shadow-xs transition"
                title="Notifications"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Popover Drawer */}
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-3xl shadow-2xl p-4 z-50 space-y-3 animate-fade-in text-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="font-bold text-slate-900">Notifications ({notifications.length})</span>
                    <button onClick={handleMarkAllRead} className="text-[11px] text-blue-600 hover:underline font-semibold">
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <p className="py-4 text-center text-slate-400">No notifications yet</p>
                    ) : (
                      notifications.map((n) => (
                        <div key={n.id} className={`py-2.5 ${n.is_read ? 'opacity-60' : 'font-semibold'}`}>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-900">{n.title}</span>
                            <span className="text-[10px] text-slate-400">{n.created_at}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 font-normal mt-0.5">{n.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Card */}
            <div className="flex items-center gap-2.5 bg-white p-1.5 pr-4 rounded-2xl border border-slate-200 shadow-xs">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-extrabold text-xs shadow-sm">
                LM
              </div>
              <div className="text-left">
                <div className="text-xs font-bold text-slate-800 leading-tight">Likitha Manchikanti</div>
                <div className="text-[10px] text-slate-400 capitalize flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                  {user?.role ? user.role.toLowerCase() : 'user'}
                </div>
              </div>
            </div>

            {/* Sign Out Button */}
            {onLogout && (
              <button
                onClick={onLogout}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-red-600 hover:bg-red-50 border border-slate-200 hover:border-red-200 transition"
                title="Sign out of your session"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            )}
          </div>
        </header>

        {/* Hero Banner with Milestone 3 Active Telemetry */}
        <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white rounded-3xl p-6 lg:p-8 shadow-xl border border-slate-800">
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-500/20 text-cyan-300 border border-blue-400/30">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                Milestone 3 Monitoring & Audit Active
              </div>
              <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tight">
                File Analytics & Cryptographic Vault
              </h1>
              <p className="text-xs lg:text-sm text-slate-300 leading-relaxed">
                Integrated with real-time Activity Monitoring, Centralized Audit Logging, Storage Analytics, and Threat Detection.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/15 text-center">
                <div className="text-[10px] text-slate-300 uppercase tracking-wider font-semibold">Active Encryption</div>
                <div className="text-sm font-black text-cyan-300">AES-256-GCM</div>
              </div>
              <div className="bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/15 text-center">
                <div className="text-[10px] text-slate-300 uppercase tracking-wider font-semibold">Audit Stream</div>
                <div className="text-sm font-black text-emerald-400">● Live Sync</div>
              </div>
            </div>
          </div>

          {/* Ambient background glows */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
          <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-indigo-600/20 rounded-full blur-2xl pointer-events-none"></div>
        </div>

        {/* 4 Summary Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Total Storage Vault</span>
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/></svg>
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900 mt-2">
              {formatBytes(files.reduce((acc, f) => acc + (f.size_bytes || 0), 0))}
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
              <span>Encrypted with AES-256</span>
              <span className="text-emerald-600 font-bold">100% Protected</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Live Files In Vault</span>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900 mt-2">{files.length}</div>
            <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
              <span>Cloud Storage S3/Local</span>
              <span className="text-emerald-600 font-bold">Live Synced</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Decryption Downloads</span>
              <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900 mt-2">
              {files.reduce((acc, f) => acc + (f.download_count || 0), 0)}
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
              <span>In-Memory RAM Decrypt</span>
              <span className="text-emerald-600 font-bold">Logged in Audit</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Secure Share Links</span>
              <div className="w-9 h-9 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg>
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900 mt-2">
              {activeShares.length}
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
              <span>Time-Bound & Revocable</span>
              <span className="text-emerald-600 font-bold">RBAC Governed</span>
            </div>
          </div>
        </div>

        {/* Interactive Drag & Drop Upload Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleUploadClick}
          className={`border-2 border-dashed rounded-3xl p-6 text-center cursor-pointer transition-all duration-200 ${
            isDragOver
              ? 'border-blue-600 bg-blue-50/70 scale-[1.01]'
              : 'border-slate-300 hover:border-blue-400 bg-white/60 hover:bg-white'
          }`}
        >
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-xs">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div className="text-sm font-bold text-slate-800">
              Drag & Drop any document here, or <span className="text-blue-600 underline">browse files</span>
            </div>
            <p className="text-xs text-slate-400">
              Automatic AES-256-GCM encryption with envelope key wrapping (Max 25 MB • PDF, DOCX, XLSX, PNG, JPG, TXT)
            </p>
          </div>
        </div>

        {/* Encrypted Vault Files Table & Filter Tabs */}
        <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-xs space-y-5">
          {/* Header & Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <span>Encrypted Vault Files</span>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {filteredFiles.length} files
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Protected with 256-bit DEK. All activities are recorded in MongoDB and SQLite audit logs.
              </p>
            </div>

            {/* Filter Chips */}
            <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-2xl text-xs font-semibold">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 rounded-xl transition ${activeTab === 'all' ? 'bg-white text-blue-600 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}
              >
                All Files
              </button>
              <button
                onClick={() => setActiveTab('docs')}
                className={`px-3 py-1.5 rounded-xl transition ${activeTab === 'docs' ? 'bg-white text-blue-600 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Documents
              </button>
              <button
                onClick={() => setActiveTab('sheets')}
                className={`px-3 py-1.5 rounded-xl transition ${activeTab === 'sheets' ? 'bg-white text-blue-600 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Spreadsheets
              </button>
              <button
                onClick={() => setActiveTab('images')}
                className={`px-3 py-1.5 rounded-xl transition ${activeTab === 'images' ? 'bg-white text-blue-600 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Images
              </button>
              <button
                onClick={() => setActiveTab('shares')}
                className={`px-3 py-1.5 rounded-xl transition ${activeTab === 'shares' ? 'bg-white text-blue-600 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Share Links ({activeShares.length})
              </button>
              <button
                onClick={() => setActiveTab('audit')}
                className={`px-3 py-1.5 rounded-xl transition ${activeTab === 'audit' ? 'bg-white text-blue-600 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Audit Trail ({auditLogs.length})
              </button>
            </div>
          </div>

          {/* Table Mode 1: Files */}
          {activeTab !== 'shares' && activeTab !== 'audit' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-slate-400 border-b border-slate-100 bg-slate-50/50 rounded-xl">
                  <tr>
                    <th className="py-3 px-3">File Name</th>
                    <th className="py-3 px-3">Size</th>
                    <th className="py-3 px-3">Encryption Standard</th>
                    <th className="py-3 px-3">Uploaded At</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredFiles.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="py-8 text-center text-slate-400">
                        No files matching current filters. Click "Upload Encrypted File" to add one!
                      </td>
                    </tr>
                  ) : (
                    filteredFiles.map((file) => {
                      const badge = getFileBadge(file.filename);
                      return (
                        <tr key={file.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-3.5 px-3 flex items-center gap-3 font-medium">
                            <span className={`px-2.5 py-1 rounded-xl text-[10px] font-bold ${badge.color}`}>
                              {badge.ext}
                            </span>
                            <div>
                              <span className="font-bold text-slate-900 block truncate max-w-[220px]">
                                {file.filename}
                              </span>
                              <span className="text-[10px] text-slate-400 block font-mono">
                                Vault ID: #{file.id}
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-3 text-slate-600 font-semibold">
                            {formatBytes(file.size_bytes)}
                          </td>
                          <td className="py-3.5 px-3">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <svg className="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                              </svg>
                              AES-256-GCM
                            </span>
                          </td>
                          <td className="py-3.5 px-3 text-slate-500 font-medium">
                            {file.created_at || 'Just now'}
                          </td>
                          <td className="py-3.5 px-3 text-right space-x-2">
                            {/* Cryptographic Inspector Button */}
                            <button
                              onClick={() => openInspectModal(file)}
                              title="Inspect Envelope Encryption"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-[11px] transition"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                              Inspect
                            </button>

                            {/* Direct In-Memory Decrypt Download */}
                            <button
                              type="button"
                              onClick={() => handleDownloadFile(file)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition active:scale-95"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                              Download
                            </button>

                            {/* Open Secure Sharing Modal */}
                            <button
                              onClick={() => openShareModal(file)}
                              className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] shadow-sm shadow-blue-500/20 transition active:scale-95"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg>
                              Share Link
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Table Mode 2: Active Share Links */}
          {activeTab === 'shares' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-slate-400 border-b border-slate-100 bg-slate-50/50 rounded-xl">
                  <tr>
                    <th className="py-3 px-3">Target File</th>
                    <th className="py-3 px-3">Share Token (CSPRNG)</th>
                    <th className="py-3 px-3">Expires At</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {activeShares.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="py-8 text-center text-slate-400">
                        No active share links yet. Click "Share Link" on any file in your vault!
                      </td>
                    </tr>
                  ) : (
                    activeShares.map((s, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition">
                        <td className="py-3.5 px-3 font-bold text-slate-900">
                          {s.filename}
                        </td>
                        <td className="py-3.5 px-3 font-mono text-[11px] text-slate-500">
                          {s.share_token.slice(0, 16)}...
                        </td>
                        <td className="py-3.5 px-3 text-slate-500 font-medium">
                          {s.expires_at}
                        </td>
                        <td className="py-3.5 px-3">
                          {s.is_revoked ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                              ⛔ Revoked (403)
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                              Active Temporary
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-right space-x-2">
                          {!s.is_revoked && (
                            <>
                              <button
                                onClick={() => handleCopyUrl(s.direct_download_url)}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] rounded-xl transition"
                              >
                                Copy URL
                              </button>
                              <button
                                onClick={() => handleRevokeShare(s.share_token)}
                                className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-[11px] rounded-xl transition"
                              >
                                Revoke
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Table Mode 3: Milestone 3 Audit Trail (Task 2) */}
          {activeTab === 'audit' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-slate-400 border-b border-slate-100 bg-slate-50/50 rounded-xl">
                  <tr>
                    <th className="py-3 px-3">Log ID</th>
                    <th className="py-3 px-3">User & IP</th>
                    <th className="py-3 px-3">Operation</th>
                    <th className="py-3 px-3">Details</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-8 text-center text-slate-400">
                        No audit records yet. Upload or download a file to see live audit logs!
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50 transition">
                        <td className="py-3 px-3 font-mono font-bold text-blue-600">#{log.id}</td>
                        <td className="py-3 px-3">
                          <span className="font-bold text-slate-900 block">{log.username}</span>
                          <span className="text-[10px] text-slate-400 font-mono block">{log.ip_address}</span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            {log.activity_type}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-600 max-w-xs truncate">{log.description}</td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            log.status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                          }`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right text-slate-400 font-medium">{log.timestamp}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </main>

      {/* Cryptographic Inspector Modal */}
      {inspectModalOpen && inspectedFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Cryptographic Envelope Inspector</h3>
                  <p className="text-xs text-slate-400">Zero-knowledge server-side encryption verification</p>
                </div>
              </div>
              <button 
                onClick={() => setInspectModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold transition"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Original Filename:</span>
                  <span className="font-bold text-slate-900">{inspectedFile.filename}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Cipher Standard:</span>
                  <span className="font-bold text-emerald-600">AES-256-GCM (Authenticated AEAD)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Payload Size:</span>
                  <span className="font-mono text-slate-800">{formatBytes(inspectedFile.size_bytes)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Data Encryption Key (DEK):</span>
                  <span className="font-mono text-blue-600 font-bold">256-bit (Unique per file)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Key Wrapping:</span>
                  <span className="font-mono text-purple-600 font-bold">Master KEK Encrypted</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Cloud Vault Storage Key:</span>
                  <span className="font-mono text-[10px] text-slate-600 truncate max-w-[200px]">
                    {inspectedFile.storage_key || `${inspectedFile.id}_vault.enc`}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 flex items-center gap-2 text-emerald-800 text-[11px]">
                <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                </svg>
                <span><b>Tamper-Proof Integrity:</b> Decryption will automatically abort if ciphertext or nonce is altered.</span>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setInspectModalOpen(false)}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Secure Sharing Modal */}
      {shareModalOpen && activeShareFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-xs">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Create Secure Share Link</h3>
                  <p className="text-xs text-slate-400">Generates 32-byte CSPRNG token with automated expiration.</p>
                </div>
              </div>
              <button 
                onClick={() => setShareModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold transition"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-900 text-xs">{activeShareFile.filename}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Size: {formatBytes(activeShareFile.size_bytes)} • Standard: AES-256-GCM
                </div>
              </div>
              <span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 font-bold text-[10px] rounded-full border border-blue-200">
                Encrypted
              </span>
            </div>

            {!createdShare && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Link Expiration</label>
                    <select
                      value={expiryHours}
                      onChange={(e) => setExpiryHours(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                    >
                      <option value="1">1 Hour</option>
                      <option value="24">24 Hours (1 Day)</option>
                      <option value="48">48 Hours (2 Days)</option>
                      <option value="168">7 Days (1 Week)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Access Permission</label>
                    <select
                      value={sharePermission}
                      onChange={(e) => setSharePermission(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                    >
                      <option value="DOWNLOAD">Download (Full Decrypt)</option>
                      <option value="VIEW">View Only (Inspect)</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={handleGenerateShare}
                  disabled={isCreatingShare}
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl text-xs font-bold shadow-lg shadow-blue-500/25 transition flex items-center justify-center gap-2 active:scale-95"
                >
                  {isCreatingShare ? (
                    <span>Generating Cryptographic Token...</span>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
                      <span>Generate Secure Link</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {createdShare && (
              <div className="space-y-4 pt-1">
                <div className={`p-4 rounded-2xl border ${isRevoked ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      {isRevoked ? '⛔ Share Link Revoked' : '✅ Active Temporary Share Link'}
                    </span>
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${isRevoked ? 'bg-red-200 text-red-800' : 'bg-emerald-200 text-emerald-800'}`}>
                      {isRevoked ? 'Access Denied (403)' : `Expires in ${expiryHours}h`}
                    </span>
                  </div>

                  {!isRevoked ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={createdShare.share_url}
                          className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-xl text-xs font-mono text-slate-800 select-all focus:outline-none"
                        />
                        <button
                          onClick={() => handleCopyUrl(createdShare.share_url)}
                          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1 shrink-0"
                        >
                          {copySuccess ? 'Copied!' : 'Copy'}
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <a
                          href={createdShare.share_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-blue-600 hover:underline font-bold flex items-center gap-1"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                          Open & Test Download
                        </a>

                        <button
                          onClick={() => handleRevokeShare(createdShare.share_token)}
                          disabled={isRevoking}
                          className="text-xs text-red-600 hover:text-red-700 font-bold flex items-center gap-1 transition"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
                          {isRevoking ? 'Revoking...' : 'Revoke Link Now'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-red-700">
                        This share link has been revoked. Any recipient attempting to download the file will receive an HTTP 403 Forbidden response.
                      </p>
                      <button
                        onClick={() => { setCreatedShare(null); setIsRevoked(false); }}
                        className="text-xs text-blue-600 font-bold hover:underline"
                      >
                        Create another link
                      </button>
                    </div>
                  )}
                </div>

                <div className="text-[11px] text-slate-400 text-center">
                  Share token: <span className="font-mono text-slate-600">{createdShare.share_token}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
