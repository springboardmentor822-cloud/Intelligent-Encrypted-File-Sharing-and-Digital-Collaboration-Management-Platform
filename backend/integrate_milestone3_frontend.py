import re

page_path = r"C:\Desktop\Intelligent-Encrypted-File-Sharing-and-Digital-Collaboration-Management-Platform\frontend\src\app\page.tsx"

with open(page_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update Admin Tab definition and add Milestone 3 state
old_admin_state = 'const [adminTab, setAdminTab] = useState<"security" | "dashboard" | "users" | "files" | "logs">("security");'
new_admin_state = '''// Milestone 3 State: Notifications
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
  const [recipientEmail, setRecipientEmail] = useState<string>("");'''

if old_admin_state in content:
    content = content.replace(old_admin_state, new_admin_state)
    print("Replaced admin state successfully.")
else:
    print("Warning: old_admin_state not found directly.")

# 2. Add handlers for Milestone 3 right after fetchAdminTelemetry
old_fetch_telemetry = '''  const fetchAdminTelemetry = async () => {
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
    } catch (err) {
      console.error("Failed to load admin security telemetry", err);
    } finally {
      setAdminLoading(false);
    }
  };'''

new_handlers = '''  // Milestone 3: Fetch Notifications
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
  };'''

if old_fetch_telemetry in content:
    content = content.replace(old_fetch_telemetry, new_handlers)
    print("Replaced fetchAdminTelemetry with Milestone 3 handlers.")
else:
    print("Warning: old_fetch_telemetry not matched exactly.")

# 3. Add periodic notification polling in useEffect
old_user_effect = '''  useEffect(() => {
    if (user) {
      fetchFiles();
      fetchShareLinks();
      if (user.role === "admin") {
        fetchAdminTelemetry();
      }
    }
  }, [user]);'''

new_user_effect = '''  useEffect(() => {
    if (user) {
      fetchFiles();
      fetchShareLinks();
      fetchNotifications();
      if (user.role === "admin") {
        fetchAdminTelemetry();
      }
      const interval = setInterval(() => {
        fetchNotifications();
      }, 15000);
      return () => clearInterval(interval);
    }
  }, [user]);'''

if old_user_effect in content:
    content = content.replace(old_user_effect, new_user_effect)
    print("Added notification interval polling.")

# 4. Insert Notification Bell and Popover in Header
old_header_btn = '''          {/* Milestone 2: Direct Access Shared Link Button */}
          <button
            onClick={() => setPublicShareModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500/40 text-slate-300 hover:text-emerald-400 text-xs font-medium transition"
            title="Open an encrypted file via secure share link token"
          >
            <Link2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Access Share Link</span>
          </button>'''

new_header_btn = '''          {/* Milestone 2: Direct Access Shared Link Button */}
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
          )}'''

if old_header_btn in content:
    content = content.replace(old_header_btn, new_header_btn)
    print("Added Notification Bell & Dropdown in Header.")

# 5. Expand Admin Navigation Sidebar Items
old_sidebar_items = '''                  {[
                    { id: "security", label: "Security Dashboard", icon: ShieldAlert },
                    { id: "dashboard", label: "Platform Overview", icon: BarChart3 },
                    { id: "users", label: "User Management", icon: Users },
                    { id: "files", label: "File Registry", icon: Layers },
                    { id: "logs", label: "Activity Logs", icon: Activity },
                  ].map((item) => {'''

new_sidebar_items = '''                  {[
                    { id: "security", label: "Security Monitoring", icon: ShieldAlert },
                    { id: "dashboard", label: "Platform Overview", icon: BarChart3 },
                    { id: "analytics", label: "Storage Analytics", icon: HardDrive },
                    { id: "reports", label: "Activity Reports", icon: FileText },
                    { id: "users", label: "User Management", icon: Users },
                    { id: "files", label: "File Registry", icon: Layers },
                    { id: "logs", label: "Audit Logs", icon: Activity },
                  ].map((item) => {'''

if old_sidebar_items in content:
    content = content.replace(old_sidebar_items, new_sidebar_items)
    print("Updated Admin sidebar navigation with Milestone 3 tabs.")

# 6. Add recipient email in share modal
old_max_downloads_input = '''                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Download Quota Limit (Optional)
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 5 (leave empty for unlimited)"
                    value={shareMaxDownloads}
                    onChange={(e) => setShareMaxDownloads(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none text-xs text-white"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Link will automatically expire once this download quota is exhausted.
                  </p>
                </div>'''

new_max_downloads_input = '''                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Download Quota Limit (Optional)
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 5 (leave empty for unlimited)"
                    value={shareMaxDownloads}
                    onChange={(e) => setShareMaxDownloads(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none text-xs text-white"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Link will automatically expire once this download quota is exhausted.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Recipient Email (Optional Notification)
                  </label>
                  <input
                    type="email"
                    placeholder="collaborator@company.com"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none text-xs text-white"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Recipient will instantly receive an in-app file-sharing notification.
                  </p>
                </div>'''

if old_max_downloads_input in content:
    content = content.replace(old_max_downloads_input, new_max_downloads_input)
    print("Added recipient email input to file sharing modal.")

# Update share link API call to pass recipientEmail
old_share_api_call = '''      const res = await api.post(`/files/${sharingModalFile.id}/share`, {
        expires_in_hours: shareHours,
        permission: sharePermission,
        max_downloads: parsedMax,
      });'''

new_share_api_call = '''      const res = await api.post(`/files/${sharingModalFile.id}/share`, {
        expires_in_hours: shareHours,
        permission: sharePermission,
        max_downloads: parsedMax,
        recipient_email: recipientEmail.trim() || null,
      });'''

if old_share_api_call in content:
    content = content.replace(old_share_api_call, new_share_api_call)
    print("Updated share link API call with recipient email.")

# 7. Add Milestone 3 Views: Storage Analytics (Task 5) and Activity Reports (Task 4)
# Insert right before {adminTab === "logs" && (
views_to_insert = '''            {/* ============================================================== */}
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

                  {/* Report Sub-Tabs */}
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
                              <td className="px-6 py-3 text-slate-400">{u.upload_date?.slice(0, 19).replace("T", " ")}</td>
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
                              <td className="px-6 py-3 text-slate-400">{d.timestamp?.slice(0, 19).replace("T", " ")}</td>
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
                              <td className="px-6 py-3 text-slate-400">{s.expires_at?.slice(0, 19).replace("T", " ") || "No TTL"}</td>
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
                              <td className="px-6 py-3 text-slate-400">{a.timestamp?.slice(0, 19).replace("T", " ")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
'''

target_logs = '{/* VIEW 5: ACTIVITY & AUDIT LOGS */}\n            {adminTab === "logs" && ('
if target_logs in content:
    content = content.replace(target_logs, views_to_insert + "\n" + target_logs)
    print("Inserted Milestone 3 views (Storage Analytics and Activity Reports).")
else:
    # Try alternative matching
    alt_target = '{adminTab === "logs" && ('
    if alt_target in content:
        content = content.replace(alt_target, views_to_insert + "\n            " + alt_target, 1)
        print("Inserted Milestone 3 views before adminTab === 'logs'.")

# 8. Enhance Security Monitoring with Suspicious Activity Simulator and Alert Feed
# Find where adminTab === "security" starts
old_sec_start = '{adminTab === "security" && ('
new_sec_panel = '''{adminTab === "security" && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {/* Milestone 3 Task 6: Threat Simulator Bar */}
                <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-950/40 via-slate-900 to-slate-900 border border-rose-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-rose-400" />
                      <span>Task 6: Suspicious Activity Detection Engine</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Trigger test security scenarios to verify automated rule evaluation and admin alert dispatch
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => handleSimulateSuspiciousEvent("FAILED_LOGINS")}
                      disabled={simulatingEvent}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold transition"
                    >
                      Test Failed Logins (&gt;5)
                    </button>
                    <button
                      onClick={() => handleSimulateSuspiciousEvent("UNAUTHORIZED_ACCESS")}
                      disabled={simulatingEvent}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold transition"
                    >
                      Test Unauthorized Access
                    </button>
                    <button
                      onClick={() => handleSimulateSuspiciousEvent("EXCESSIVE_DOWNLOADS")}
                      disabled={simulatingEvent}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-semibold transition"
                    >
                      Test Download Spike (&gt;20)
                    </button>
                    <button
                      onClick={() => handleSimulateSuspiciousEvent("EXPIRED_LINK_ACCESS")}
                      disabled={simulatingEvent}
                      className="px-2.5 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-semibold transition"
                    >
                      Test Expired Link
                    </button>
                  </div>
                </div>

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
                )}'''

if old_sec_start in content:
    content = content.replace(old_sec_start, new_sec_panel, 1)
    print("Enhanced Security Dashboard with Suspicious Activity Detection & Threat Simulator.")

with open(page_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Finished integrating Milestone 3 into page.tsx successfully!")

