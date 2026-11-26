
import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

// Share concurrent idempotent reads (including StrictMode's development
// effect replay) without caching responses after they settle.
const pendingGetRequests = new Map();
const axiosGet = api.get.bind(api);
api.get = (url, config = {}) => {
  if (config.signal) return axiosGet(url, config);
  const headers = config.headers?.toJSON?.() || config.headers || {};
  const params = config.params || {};
  const key = JSON.stringify({
    url,
    token: sessionStorage.getItem("trustshare_token"),
    params: Object.fromEntries(Object.entries(params).sort(([left], [right]) => left.localeCompare(right))),
    headers: Object.fromEntries(Object.entries(headers).sort(([left], [right]) => left.localeCompare(right))),
  });
  const pending = pendingGetRequests.get(key);
  if (pending) return pending;
  const request = axiosGet(url, config);
  pendingGetRequests.set(key, request);
  request.then(
    () => { if (pendingGetRequests.get(key) === request) pendingGetRequests.delete(key); },
    () => { if (pendingGetRequests.get(key) === request) pendingGetRequests.delete(key); },
  );
  return request;
};

let authRedirectInProgress = false;

// Attach the current TrustShare token to authenticated requests.
api.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem("trustshare_token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = error.config?.url || "";
    const sessionToken = sessionStorage.getItem("trustshare_token");
    const requestAuthorization = error.config?.headers?.Authorization
      || error.config?.headers?.get?.("Authorization");
    const hasCurrentSession = Boolean(sessionToken && requestAuthorization === `Bearer ${sessionToken}`);
    const isAuthSubmission = requestUrl.endsWith("/auth/login")
      || requestUrl.endsWith("/auth/register");

    if (
      error.response?.status === 401
      && hasCurrentSession
      && !isAuthSubmission
      && !authRedirectInProgress
    ) {
      authRedirectInProgress = true;
      const currentPath = `${window.location.pathname}${window.location.search}`;
      if (currentPath !== "/login") {
        sessionStorage.setItem("trustshare_after_login", currentPath);
      }
      clearSession();
      window.location.assign("/login");
    }

    return Promise.reject(error);
  }
);

// Authentication
export async function registerUser({ full_name, email, password }) {
  const response = await api.post("/auth/register", {
    full_name,
    email,
    password,
  });
  return response.data;
}

export async function loginUser({ email, password }) {
  const response = await api.post("/auth/login", {
    email,
    password,
  });
  return response.data;
}

export async function getCurrentUser() {
  const response = await api.get("/auth/me");
  return response.data;
}

export async function getSecurityStatus() {
  const response = await api.get("/security/status");
  return response.data;
}

// Files
export async function listFiles(folderId = null, folderUnlockToken = null) {
  const params = {};

  if (folderId !== null) params.folder_id = folderId;
  const headers = folderUnlockToken
    ? { "X-Folder-Unlock-Token": folderUnlockToken }
    : undefined;

  const response = await api.get("/files", {
    params: Object.keys(params).length ? params : undefined,
    headers,
  });

  return response.data;
}

export async function getStorageSummary() {
  const response = await api.get("/files/storage");
  return response.data;
}

export async function listFavorites() {
  return (await api.get("/files/dashboard/favorites")).data;
}

export async function addFileFavorite(fileId) {
  return (await api.post(`/files/dashboard/favorites/files/${fileId}`)).data;
}

export async function removeFileFavorite(fileId) {
  await api.delete(`/files/dashboard/favorites/files/${fileId}`);
}

export async function addFolderFavorite(folderId) {
  return (await api.post(`/files/dashboard/favorites/folders/${folderId}`)).data;
}

export async function removeFolderFavorite(folderId) {
  await api.delete(`/files/dashboard/favorites/folders/${folderId}`);
}

export async function uploadFile(
  file,
  onUploadProgress,
  folderId = null,
  filePassword = null,
  folderUnlockToken = null
) {
  const formData = new FormData();
  formData.append("file", file);

  if (filePassword) {
    formData.append("password", filePassword);
  }

  const params = {};

  if (folderId !== null) params.folder_id = folderId;
  const headers = folderUnlockToken
    ? { "X-Folder-Unlock-Token": folderUnlockToken }
    : undefined;

  const response = await api.post("/files/upload", formData, {
    params: Object.keys(params).length ? params : undefined,
    headers,
    onUploadProgress,
  });

  return response.data;
}

export async function downloadFile(
  fileId,
  password = null,
  folderUnlockToken = null
) {
  return api.post(`/files/${fileId}/download`, {
    ...(password ? { password } : {}),
    ...(folderUnlockToken ? { folder_unlock_token: folderUnlockToken } : {}),
  }, { responseType: "blob" });
}

export async function previewFile(
  fileId,
  password = null,
  folderUnlockToken = null
) {
  return api.post(
    `/files/${fileId}/preview`,
    {
      ...(password ? { password } : {}),
      ...(folderUnlockToken
        ? { folder_unlock_token: folderUnlockToken }
        : {}),
    },
    { responseType: "blob" }
  );
}

export async function shareFile(fileId, recipientEmail, folderUnlockToken = null, permission = "download", expiresAt = null) {
  const response = await api.post(`/files/${fileId}/share`, {
    recipient_email: recipientEmail,
    permission,
    ...(expiresAt ? { expires_at: expiresAt } : {}),
    ...(folderUnlockToken ? { folder_unlock_token: folderUnlockToken } : {}),
  });
  return response.data;
}

export async function listSharedFiles() {
  const response = await api.get("/files/shared/with-me");
  return response.data;
}

export async function getSharedFileInfo(shareId) {
  const response = await api.get(`/files/shared/${shareId}`);
  return response.data;
}

export async function downloadSharedFile(shareId, password = null, folderUnlockToken = null) {
  return api.post(`/files/shared/${shareId}/download`, {
    ...(password ? { password } : {}),
    ...(folderUnlockToken ? { folder_unlock_token: folderUnlockToken } : {}),
  }, {
    responseType: "blob",
  });
}

export async function previewSharedFile(shareId, password = null, folderUnlockToken = null) {
  return api.post(`/files/shared/${shareId}/preview`, {
    ...(password ? { password } : {}),
    ...(folderUnlockToken ? { folder_unlock_token: folderUnlockToken } : {}),
  }, { responseType: "blob" });
}

export async function listFileShares(fileId) {
  const response = await api.get(`/files/${fileId}/shares`);
  return response.data;
}

export async function getRecentUploads(limit = 20, offset = 0) {
  return (await api.get("/files/dashboard/recent-uploads", { params: { limit, offset } })).data;
}

export async function getDashboardActivity(limit = 20, offset = 0) {
  return (await api.get("/files/dashboard/activity", { params: { limit, offset } })).data;
}

export async function getDashboardShares() {
  return (await api.get("/files/dashboard/shares")).data;
}

export async function getDashboardAnalytics(days = 30, startDate = null, endDate = null) {
  return (await api.get("/files/dashboard/analytics", {
    params: { days, ...(startDate ? { start_date: startDate } : {}), ...(endDate ? { end_date: endDate } : {}) },
  })).data;
}

export async function retryShareInvitation(fileId, shareId, folderUnlockToken = null) {
  return (await api.post(`/files/${fileId}/shares/${shareId}/retry`, {
    ...(folderUnlockToken ? { folder_unlock_token: folderUnlockToken } : {}),
  })).data;
}

export async function revokeFileShare(fileId, shareId) {
  await api.delete(`/files/${fileId}/shares/${shareId}`);
}

export async function updateFileShare(fileId, shareId, permission, expiresAt = null) {
  return (await api.patch(`/files/${fileId}/shares/${shareId}`, {
    permission,
    ...(expiresAt ? { expires_at: expiresAt } : {}),
  })).data;
}

export async function deleteFile(
  fileId,
  password = null,
  folderUnlockToken = null
) {
  const params = {};

  if (password) params.password = password;
  const headers = folderUnlockToken
    ? { "X-Folder-Unlock-Token": folderUnlockToken }
    : undefined;

  await api.delete(`/files/${fileId}`, {
    params: Object.keys(params).length ? params : undefined,
    headers,
  });
}

export async function moveFile(
  fileId,
  folderId,
  password = null,
  destinationPassword = null,
  sourceFolderPassword = null
) {
  const params = { folder_id: folderId };

  // These parameters require the backend move route to support them.
  if (password) params.password = password;
  const response = await api.patch(`/files/${fileId}/move`, null, {
    params,
    headers: {
      ...(sourceFolderPassword ? { "X-Source-Folder-Unlock-Token": sourceFolderPassword } : {}),
      ...(destinationPassword ? { "X-Destination-Folder-Unlock-Token": destinationPassword } : {}),
    },
  });

  return response.data;
}

// Folders
export async function listFolders() {
  const response = await api.get("/folders");
  return response.data;
}

export async function getFolderAccess(folderId) {
  const response = await api.get(`/folders/${folderId}/access`);
  return response.data;
}

export async function grantFolderAccess(folderId, recipientEmail, permission = "viewer", expiresAt = null, folderUnlockToken = null) {
  const response = await api.post(`/folders/${folderId}/access`, {
    recipient_email: recipientEmail,
    permission,
    ...(expiresAt ? { expires_at: expiresAt } : {}),
    ...(folderUnlockToken ? { folder_unlock_token: folderUnlockToken } : {}),
  });
  return response.data;
}

export async function updateFolderAccess(folderId, shareId, permission, expiresAt = null) {
  const response = await api.patch(`/folders/${folderId}/access/${shareId}`, {
    permission,
    ...(expiresAt ? { expires_at: expiresAt } : {}),
  });
  return response.data;
}

export async function revokeFolderAccess(folderId, shareId) {
  await api.delete(`/folders/${folderId}/access/${shareId}`);
}

export async function createFolder(name, password = null) {
  const response = await api.post("/folders", {
    name,
    ...(password ? { password } : {}),
  });
  return response.data;
}

export async function unlockFolder(folderId, password) {
  const response = await api.post(`/folders/${folderId}/unlock`, { password });
  return response.data;
}

export async function renameFolder(folderId, name, unlockToken = null) {
  const response = await api.patch(
    `/folders/${folderId}`,
    { name },
    { headers: unlockToken ? { "X-Folder-Unlock-Token": unlockToken } : undefined }
  );
  return response.data;
}

export async function deleteEmptyFolder(folderId, unlockToken = null) {
  await api.delete(`/folders/${folderId}`, {
    headers: unlockToken ? { "X-Folder-Unlock-Token": unlockToken } : undefined,
  });
}

export async function deleteFolder(
  folderId,
  action = "keep_files",
  unlockToken = null
) {
  await api.delete(`/folders/${folderId}`, {
    params: {
      action,
    },
    headers: unlockToken ? { "X-Folder-Unlock-Token": unlockToken } : undefined,
  });
}

export async function startPasswordRecovery(kind, resourceId) {
  const response = await api.post(
    `/recovery/${kind}/${resourceId}/start`
  );
  return response.data;
}

export async function resendPasswordRecoveryCode(challengeId) {
  const response = await api.post("/recovery/resend", {
    challenge_id: challengeId,
  });
  return response.data;
}

export async function verifyPasswordRecoveryCode(challengeId, code) {
  const response = await api.post("/recovery/verify", {
    challenge_id: challengeId,
    code,
  });
  return response.data;
}

export async function resetPasswordWithAuthorization(
  resetToken,
  password
) {
  const response = await api.post(
    "/recovery/reset",
    { reset_token: resetToken, password }
  );
  return response.data;
}

export async function startAccountPasswordRecovery(email) {
  const response = await api.post("/recovery/account/start", { email });
  return response.data;
}

export async function resendAccountPasswordRecoveryCode(challengeId) {
  const response = await api.post("/recovery/account/resend", {
    challenge_id: challengeId,
  });
  return response.data;
}

export async function verifyAccountPasswordRecoveryCode(challengeId, code) {
  const response = await api.post("/recovery/account/verify", {
    challenge_id: challengeId,
    code,
  });
  return response.data;
}

export async function resetAccountPassword(resetToken, password) {
  const response = await api.post("/recovery/account/reset", {
    reset_token: resetToken,
    password,
  });
  return response.data;
}

// Session
export function saveSession(data) {
  if (!data?.access_token || !data?.user) {
    throw new Error("Invalid login response from the server.");
  }

  sessionStorage.setItem("trustshare_token", data.access_token);
  sessionStorage.setItem("trustshare_user", JSON.stringify(data.user));
}

export function clearSession() {
  sessionStorage.removeItem("trustshare_token");
  sessionStorage.removeItem("trustshare_user");
}

export function startGoogleLogin() {
  window.location.assign(`${API_BASE_URL}/auth/google/login`);
}

export function startMicrosoftLogin() {
  window.location.assign(`${API_BASE_URL}/auth/microsoft/login`);
}

export async function startGoogleLink() {
  const response = await api.post("/auth/google/link/start", {});

  if (!response.data?.authorization_url) {
    throw new Error(
      "The server did not return a Google authorization URL."
    );
  }

  window.location.assign(response.data.authorization_url);
}

export async function startGoogleGmailConnect() {
  const response = await api.post("/auth/google/gmail/connect/start", {});
  if (!response.data?.authorization_url) {
    throw new Error("The server did not return a Google Gmail authorization URL.");
  }
  window.location.assign(response.data.authorization_url);
}

export async function getGoogleGmailStatus() {
  return (await api.get("/auth/google/gmail/status")).data;
}

export async function startMicrosoftLink() {
  const response = await api.post("/auth/microsoft/link/start", {});

  if (!response.data?.authorization_url) {
    throw new Error(
      "The server did not return a Microsoft authorization URL."
    );
  }

  window.location.assign(response.data.authorization_url);
}

// API errors
export function getApiErrorMessage(error) {
  if (error.response?.data?.detail) {
    const detail = error.response.data.detail;
    return typeof detail === "string"
      ? detail
      : "The request failed. Please try again.";
  }

  if (error.response) {
    return `Server error (${error.response.status}). Please try again.`;
  }

  if (error.request) {
    return "Cannot connect to the TrustShare server. Check that the backend is running.";
  }

  return error.message || "Something went wrong. Please try again.";
}

// Super-admin APIs
export async function getAdminOverview() {
  const response = await api.get("/admin/overview");
  return response.data;
}

export async function getAdminPlatformSettings() {
  return (await api.get("/admin/settings")).data;
}

export async function updateAdminPlatformSettings(settings) {
  return (await api.patch("/admin/settings", settings)).data;
}

export async function getAdminUsers({
  search = "",
  role = "",
  limit = 100,
  offset = 0,
} = {}) {
  const response = await api.get("/admin/users", {
    params: {
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(role ? { role } : {}),
      limit,
      offset,
    },
  });
  return response.data;
}

export async function getAdminFiles({ search = "", limit = 100, offset = 0 } = {}) {
  return (await api.get("/admin/files", { params: { ...(search.trim() ? { search: search.trim() } : {}), limit, offset } })).data;
}

export async function getAdminSharingReports({ search = "", status = "", ownerId = "", kind = "", startDate = "", endDate = "", limit = 200, offset = 0 } = {}) {
  return (await api.get("/admin/sharing-reports", { params: { ...(search.trim() ? { search: search.trim() } : {}), ...(status ? { status } : {}), ...(ownerId ? { owner_id: ownerId } : {}), ...(kind ? { kind } : {}), ...(startDate ? { start_date: startDate } : {}), ...(endDate ? { end_date: endDate } : {}), limit, offset } })).data;
}

export async function getAdminSystemHealth() {
  return (await api.get("/admin/system-health")).data;
}

export async function getAdminSecurityAlerts(limit = 100) {
  const response = await api.get("/admin/security-alerts", {
    params: { limit },
  });
  return response.data;
}

export async function getAdminAuditLogs({
  limit = 100,
    offset = 0,
  eventType = "",
    userId = "",
  fileId = "",
    status = "",
    startDate = "",
    endDate = "",
    search = "",
} = {}) {
  const response = await api.get("/audit-logs", {
    params: {
      limit,
        offset,
      ...(eventType ? { event_type: eventType } : {}),
      ...(userId ? { user_id: userId } : {}),
      ...(fileId ? { file_id: fileId } : {}),
      ...(status ? { status } : {}),
      ...(startDate ? { start_date: startDate } : {}),
      ...(endDate ? { end_date: endDate } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
    },
  });
  return response.data;
}

export async function getAdminFileAnalytics(filters = {}) {
  const response = await api.get("/admin/file-analytics", { params: filters });
  return response.data;
}

export async function getAdminSecurityDashboard(days = 30, startDate = null, endDate = null) {
  return (await api.get("/admin/security-dashboard", {
    params: { days, ...(startDate ? { start_date: startDate } : {}), ...(endDate ? { end_date: endDate } : {}) },
  })).data;
}

export async function getAdminKeyRotationPreview() {
  return (await api.get("/admin/key-rotation/preview")).data;
}

export async function applyAdminKeyRotation() {
  return (await api.post("/admin/key-rotation/apply", { confirm: true })).data;
}
export async function getNotifications({ unreadOnly = false, limit = 50, offset = 0 } = {}) {
  return (await api.get("/notifications", {
    params: { unread_only: unreadOnly, limit, offset },
  })).data;
}

export async function getAdminNotifications({ userId, read, limit = 100, offset = 0 } = {}) {
  return (await api.get("/admin/notifications", {
    params: {
      ...(userId == null ? {} : { user_id: userId }),
      ...(read == null ? {} : { read }),
      limit,
      offset,
    },
  })).data;
}

export async function markNotificationRead(notificationId) {
  return (await api.post(`/notifications/${notificationId}/read`)).data;
}

export async function markAllNotificationsRead() {
  return (await api.post("/notifications/read-all")).data;
}

export async function logoutUser() {
  return (await api.post("/auth/logout")).data;
}

export async function getAuditLogs(filters = {}) {
  return (await api.get("/audit-logs", { params: filters })).data;
}

export async function getSecurityEvents(filters = {}) {
  return (await api.get("/security-events", { params: filters })).data;
}

export async function getStorageAnalytics(filters = {}) {
  return (await api.get("/analytics/storage", { params: filters })).data;
}

export async function getUserStorageAnalytics() {
  return (await api.get("/analytics/users/storage")).data;
}

export async function getFileAnalytics(filters = {}) {
  return (await api.get("/analytics/files", { params: filters })).data;
}

export async function getDownloadAnalytics(filters = {}) {
  return (await api.get("/analytics/downloads", { params: filters })).data;
}

export async function getSharingAnalytics(filters = {}) {
  return (await api.get("/analytics/sharing", { params: filters })).data;
}

export default api;
