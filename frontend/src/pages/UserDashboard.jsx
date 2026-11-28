import './UserDashboard.css'
import { useEffect, useState } from 'react'
import { API } from '../config.js'
const NAVIGATION = [
  { name: 'Dashboard', icon: '⌂' },
  { name: 'My Files', icon: '▤' },
  { name: 'File Upload', icon: '↑' },
  { name: 'Shared With Me', icon: '⇩' },
  { name: 'Shared By Me', icon: '⇧' },
  { name: 'Analytics', icon: '▥' },
  { name: 'Activity History', icon: '◷' },
  { name: 'Notifications', icon: '♧' },
  { name: 'My Account', icon: '◎' },
  { name: 'Settings', icon: '⚙' },
]

function UserDashboard({ onLogout }) {
  const [activeSection, setActiveSection] = useState('Dashboard')
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false)
  const [userFiles, setUserFiles] = useState([])
  const [sharedFiles, setSharedFiles] = useState([])
  const [sharedByMe, setSharedByMe] = useState([])
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [revokingShareId, setRevokingShareId] = useState(null)
  const [storage, setStorage] = useState(null)
  const [deletingFileId, setDeletingFileId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [shareFile, setShareFile] = useState(null)
  const [shareEmail, setShareEmail] = useState('')
  const [sharePermission, setSharePermission] = useState('Viewer')
  const [shareExpiry, setShareExpiry] = useState(24)
  const [sharing, setSharing] = useState(false)
  const [createdShareLink, setCreatedShareLink] = useState('')
  const [profileName, setProfileName] = useState(
    localStorage.getItem('trustshare_name') || ''
  )
  const [profileImage, setProfileImage] = useState(
    localStorage.getItem('trustshare_avatar') || ''
  )

  const [previewUrl, setPreviewUrl] = useState('')
  const [previewName, setPreviewName] = useState('')
  const [previewType, setPreviewType] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)

  const email = localStorage.getItem('trustshare_email') || 'User'
  const token = sessionStorage.getItem('trustshare_token')

  const initial = (profileName || email || 'U')
    .charAt(0)
    .toUpperCase()

  async function apiRequest(path, options = {}) {
    if (!token) {
      throw new Error('Session expired. Please login again.')
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      ...(options.body instanceof FormData
        ? {}
        : { Accept: 'application/json' }),
      ...options.headers,
    }

    const response = await fetch(`${API}${path}`, {
      ...options,
      headers,
    })

    if (!response.ok) {
      let data = {}
      try {
        data = await response.json()
      } catch {
        // Response was not JSON
      }

      throw new Error(
        data.detail || `Request failed (${response.status})`
      )
    }

    return response
  }

  async function loadMyFiles() {
    const response = await apiRequest('/files')
    const data = await response.json()

    setUserFiles(data.files || [])
    setStorage(data.storage || null)
  }

  async function loadSharedFiles() {
    const response = await apiRequest('/shared-with-me')
    const data = await response.json()

    setSharedFiles(data.files || [])
  }

async function loadSharedByMe() {
  const response = await apiRequest('/shared-by-me')
  const data = await response.json()

  setSharedByMe(data.shares || [])
}
async function loadNotifications() {
  setNotificationsLoading(true)

  try {
    const response = await apiRequest('/notifications')
    const data = await response.json()

    setNotifications(data.notifications || [])
    setUnreadCount(data.unread_count || 0)
  } catch (err) {
    setError(`Notifications: ${err.message}`)
  } finally {
    setNotificationsLoading(false)
  }
}

async function handleMarkNotificationRead(notificationId) {
  try {
    await apiRequest(`/notifications/${notificationId}/read`, {
      method: 'PATCH',
    })

    setNotifications(previous =>
      previous.map(item =>
        item.notification_id === notificationId
          ? { ...item, is_read: true }
          : item
      )
    )

    setUnreadCount(previous => Math.max(0, previous - 1))
  } catch (err) {
    setError(`Mark as read failed: ${err.message}`)
  }
}

async function handleMarkAllNotificationsRead() {
  try {
    await apiRequest('/notifications/read-all', {
      method: 'PATCH',
    })

    setNotifications(previous =>
      previous.map(item => ({ ...item, is_read: true }))
    )

    setUnreadCount(0)
    setMessage('All notifications marked as read.')
  } catch (err) {
    setError(`Unable to mark notifications as read: ${err.message}`)
  }
}

  async function loadDashboard() {
    setLoading(true)
    setError('')

    try {const results = await Promise.allSettled([
  loadMyFiles(),
  loadSharedFiles(),
  loadSharedByMe(),
])

      const failures = results.filter(
        result => result.status === 'rejected'
      )

      if (failures.length) {
        setError(
          failures.map(item => item.reason.message).join(' | ')
        )
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

async function handleRevokeShare(shareId) {
  const confirmed = window.confirm(
    'Are you sure you want to revoke this sharing link? The recipient will lose access.'
  )

  if (!confirmed) return

  setRevokingShareId(shareId)
  setError('')
  setMessage('')

  try {
    const response = await apiRequest(
      `/share/revoke/${shareId}`,
      { method: 'POST' }
    )

    const data = await response.json()

    setMessage(
      data.message || 'File sharing revoked successfully.'
    )

    await loadSharedByMe()

  } catch (err) {
    setError(`Revoke failed: ${err.message}`)
  } finally {
    setRevokingShareId(null)
  }
}

  useEffect(() => {
    loadDashboard()
  }, [])
useEffect(() => {
  if (activeSection === 'Notifications') {
    loadNotifications()
  }
}, [activeSection])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function formatBytes(bytes = 0) {
    const value = Number(bytes)

    if (!Number.isFinite(value) || value <= 0) return '0 Bytes'

    const units = ['Bytes', 'KB', 'MB', 'GB']
    const index = Math.min(
      Math.floor(Math.log(value) / Math.log(1024)),
      units.length - 1
    )

    return `${(value / Math.pow(1024, index)).toFixed(2)} ${units[index]}`
  }

  function handleProfileImage(event) {
    const image = event.target.files?.[0]
    if (!image) return

    if (!image.type.startsWith('image/')) {
      setError('Please select a valid image.')
      return
    }

    if (image.size > 2 * 1024 * 1024) {
      setError('Profile image must be smaller than 2 MB.')
      return
    }

    const reader = new FileReader()

    reader.onload = () => {
      const result = String(reader.result)
      setProfileImage(result)

      try {
        localStorage.setItem('trustshare_avatar', result)
        setMessage('Profile picture updated on this device.')
      } catch {
        setError('Image is too large for browser storage.')
      }
    }

    reader.readAsDataURL(image)
  }

  function saveProfile() {
    localStorage.setItem('trustshare_name', profileName)
    setMessage('Profile name saved on this device.')
  }

  async function handleUpload(event) {
    event.preventDefault()

    if (!selectedFile) {
      setError('Please select a file first.')
      return
    }

    setUploading(true)
    setError('')
    setMessage('')

    try {
      const formData = new FormData()
      formData.append('uploaded_file', selectedFile)

      const response = await apiRequest('/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      setMessage(data.message || 'File uploaded successfully.')
      setSelectedFile(null)
      event.target.reset()

      await loadMyFiles()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function getFileBlob(file) {
    const response = await apiRequest(`/download/${file.id}`)
    return await response.blob()
  }

  async function handleView(file) {
    setPreviewLoading(true)
    setError('')

    try {
      const blob = await getFileBlob(file)
      const url = URL.createObjectURL(blob)

      setPreviewUrl(oldUrl => {
        if (oldUrl) URL.revokeObjectURL(oldUrl)
        return url
      })

      setPreviewName(file.filename || 'File')
      const extension = file.filename
  ?.split('.')
  .pop()
  ?.toLowerCase()

const mimeTypes = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  txt: 'text/plain',
  csv: 'text/csv',
  html: 'text/html',
}

setPreviewType(
  mimeTypes[extension] ||
  file.content_type ||
  blob.type ||
  'application/octet-stream'
)
    } catch (err) {
      setError(`Preview failed: ${err.message}`)
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleDownload(file) {
    try {
      setError('')

      const blob = await getFileBlob(file)
      const url = URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = url
      link.download = file.filename || 'download'
      document.body.appendChild(link)
      link.click()
      link.remove()

      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      setError(`Download failed: ${err.message}`)
    }
  }
function openShareModal(file) {
  setShareFile(file)
  setShareEmail('')
  setSharePermission('Viewer')
  setShareExpiry(24)
  setCreatedShareLink('')
  setError('')
  setMessage('')
}

function closeShareModal() {
  setShareFile(null)
  setCreatedShareLink('')
}

async function handleShareSubmit(event) {
  event.preventDefault()

  if (!shareFile) return

  setSharing(true)
  setError('')
  setMessage('')

  try {
    const response = await apiRequest(
      `/share/${shareFile.id}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shared_with_email: shareEmail.trim() || null,
          permission: sharePermission,
          expires_in_hours: Number(shareExpiry),
        }),
      }
    )

    const data = await response.json()
    const token = data.share?.sharing_token

    if (!token) {
      throw new Error('Sharing token was not returned by server.')
    }

    const link = `${API}/shared-download/${encodeURIComponent(token)}`

    setCreatedShareLink(link)
    setMessage('File sharing link created successfully.')

  } catch (err) {
    setError(`Share failed: ${err.message}`)
  } finally {
    setSharing(false)
  }
}

async function copyShareLink() {
  try {
    await navigator.clipboard.writeText(createdShareLink)
    setMessage('Sharing link copied successfully.')
  } catch {
    setError('Unable to copy automatically. Please copy the link manually.')
  }
}
  
async function handleDelete(file) {
  const confirmed = window.confirm(
    `Are you sure you want to permanently delete "${file.filename}"?`
  )

  if (!confirmed) return

  setDeletingFileId(file.id)
  setError('')
  setMessage('')

  try {
    const response = await apiRequest(
      `/delete/${file.id}`,
      { method: 'DELETE' }
    )

    const data = await response.json()

    setMessage(data.message || 'File deleted successfully.')

    // Refresh files and storage information
    await loadMyFiles()

    // Close preview if the deleted file was being previewed
    if (previewName === file.filename) {
      closePreview()
    }

  } catch (err) {
    setError(`Delete failed: ${err.message}`)
  } finally {
    setDeletingFileId(null)
  }
}


  function closePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl('')
    setPreviewName('')
    setPreviewType('')
  }

  const usedBytes = storage?.used_bytes ?? 0
  const limitBytes = storage?.limit_bytes ?? 1073741824
  const remainingBytes =
    storage?.remaining_bytes ?? Math.max(0, limitBytes - usedBytes)

  const usage = Math.min(
    100,
    Math.max(0, Number(storage?.usage_percentage ?? 0))
  )

  function filteredFiles(files) {
    return files.filter(file =>
      (file.filename || '')
        .toLowerCase()
        .includes(searchQuery.toLowerCase())
    )
  }
function renderFiles(files, shared = false) {
  const filtered = filteredFiles(files)

  if (!filtered.length) {
    return (
      <div className="ts-empty">
        <span>▤</span>
        <h3>No files found</h3>
        <p>Your files will appear here.</p>
      </div>
    )
  }

  return (
    <div className="ts-table-wrap">
      <table className="ts-table">
        <thead>
          <tr>
            <th>File name</th>
            <th>Size</th>
            {shared && <th>Shared by</th>}
            {shared && <th>Permission</th>}
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {filtered.map(file => (
            <tr key={file.share_id || file.id}>
              <td>
                <div className="ts-file-name">
                  <span className="ts-file-icon">▤</span>
                  <div>
                    <strong>{file.filename}</strong>
                    <small>{file.content_type || 'Document'}</small>
                  </div>
                </div>
              </td>

              <td>{formatBytes(file.size)}</td>

              {shared && (
                <td>{file.shared_by || 'User'}</td>
              )}

              {shared && (
                <td>
                  <span className="ts-permission">
                    {file.permission || 'Viewer'}
                  </span>
                </td>
              )}

              <td>
                <div className="ts-actions">
                  <button
                    className="ts-action-btn"
                    onClick={() => handleView(file)}
                  >
                    View
                  </button>

                  <button
                    className="ts-action-btn ts-action-primary"
                    onClick={() => handleDownload(file)}
                  >
                    Download
                  </button>
{!shared && (
  <button
    className="ts-action-btn ts-action-primary"
    onClick={() => openShareModal(file)}
  >
    Share
  </button>
)}
                  {!shared && (
                    <button
                      className="ts-danger-btn"
                      onClick={() => handleDelete(file)}
                      disabled={deletingFileId === file.id}
                    >
                      {deletingFileId === file.id ? 'Deleting...' : 'Delete'}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
  function renderDashboard() {
    return (
      <>
        <div className="ts-welcome">
          <div>
            <span className="ts-eyebrow">YOUR WORKSPACE</span>
            <h1>Welcome back, {profileName || 'User'}!</h1>
            <p>Manage your files securely in one place.</p>
          </div>

          <button
            className="ts-primary-btn"
            onClick={() => setActiveSection('File Upload')}
          >
            + Upload File
          </button>
        </div>

        <div className="ts-stats">
          <div className="ts-stat-card">
            <span className="ts-stat-icon">▤</span>
            <p>My Files</p>
            <h2>{userFiles.length}</h2>
            <small>Uploaded files</small>
          </div>

          <div className="ts-stat-card">
            <span className="ts-stat-icon">⇩</span>
            <p>Shared With Me</p>
            <h2>{sharedFiles.length}</h2>
            <small>Received files</small>
          </div>

          <div className="ts-stat-card">
            <span className="ts-stat-icon">◫</span>
            <p>Storage Used</p>
            <h2>{formatBytes(usedBytes)}</h2>
            <small>Out of {formatBytes(limitBytes)}</small>
          </div>

          <div className="ts-stat-card">
            <span className="ts-stat-icon">⇧</span>
            <p>Available Storage</p>
            <h2>{formatBytes(remainingBytes)}</h2>
            <small>Remaining space</small>
          </div>
        </div>

        <div className="ts-panel ts-storage">
          <div className="ts-panel-heading">
            <div>
              <h3>Storage Overview</h3>
              <p>Monitor your personal storage.</p>
            </div>
            <strong>{usage.toFixed(1)}%</strong>
          </div>

          <div className="ts-progress">
            <div style={{ width: `${usage}%` }} />
          </div>

          <div className="ts-storage-footer">
            <span>{formatBytes(usedBytes)} used</span>
            <span>{formatBytes(remainingBytes)} available</span>
          </div>
        </div>

        <div className="ts-panel">
          <div className="ts-panel-heading">
            <div>
              <h3>Recent Files</h3>
              <p>Your recently uploaded documents.</p>
            </div>

            <button
              className="ts-text-btn"
              onClick={() => setActiveSection('My Files')}
            >
              View all →
            </button>
          </div>

          {renderFiles(userFiles.slice(0, 5))}
        </div>
      </>
    )
  }

  function renderContent() {
    switch (activeSection) {
      case 'Dashboard':
        return renderDashboard()

      case 'My Files':
        return (
          <div className="ts-panel">
            <div className="ts-panel-heading">
              <div>
                <h2>My Files</h2>
                <p>View and download your uploaded files.</p>
              </div>
              <button
                className="ts-primary-btn"
                onClick={() => setActiveSection('File Upload')}
              >
                + Upload
              </button>
            </div>
            {renderFiles(userFiles)}
          </div>
        )

      case 'File Upload':
        return (
          <div className="ts-panel ts-upload-panel">
            <h2>Upload a File</h2>
            <p>Upload your document securely.</p>

            <form onSubmit={handleUpload}>
              <label className="ts-upload-box">
                <span>↑</span>
                <strong>Select your file</strong>
                <small>PDF, TXT, PNG, JPG, DOCX, CSV</small>

                <input
                  type="file"
                  accept=".pdf,.txt,.png,.jpg,.jpeg,.docx,.csv"
                  onChange={event =>
                    setSelectedFile(event.target.files?.[0] || null)
                  }
                />
              </label>

              {selectedFile && (
                <p className="ts-selected-file">
                  Selected: {selectedFile.name}
                </p>
              )}

              <p className="ts-muted">
                Maximum 10 MB per file.
              </p>

              <button
                className="ts-primary-btn"
                disabled={uploading || !selectedFile}
              >
                {uploading ? 'Uploading...' : 'Upload Securely'}
              </button>
            </form>
          </div>
        )

      case 'Shared With Me':
        return (
          <div className="ts-panel">
            <h2>Shared With Me</h2>
            <p>Documents shared with your account.</p>
            {renderFiles(sharedFiles, true)}
          </div>
        )

     
case 'Shared By Me':
  return (
    <div className="ts-panel">
      <div className="ts-panel-heading">
        <div>
          <h2>Shared By Me</h2>
          <p>Manage files you have shared with others.</p>
        </div>

        <button
          className="ts-primary-btn"
          onClick={loadSharedByMe}
        >
          Refresh
        </button>
      </div>

      {sharedByMe.length === 0 ? (
        <div className="ts-empty">
          <span>⇧</span>
          <h3>No shared files found</h3>
          <p>Your shared files will appear here.</p>
        </div>
      ) : (
        <div className="ts-table-wrap">
          <table className="ts-table">
            <thead>
              <tr>
                <th>File Name</th>
                <th>Shared With</th>
                <th>Permission</th>
                <th>Expiry</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {sharedByMe.map(share => {
                const status = share.is_revoked
                  ? 'Revoked'
                  : share.is_expired
                    ? 'Expired'
                    : 'Active'

                const canRevoke =
                  !share.is_revoked && !share.is_expired

                return (
                  <tr key={share.share_id}>
                    <td>
                      <strong>{share.filename}</strong>
                    </td>

                    <td>
                      {share.shared_with || 'Anyone with link'}
                    </td>

                    <td>
                      <span className="ts-permission">
                        {share.permission}
                      </span>
                    </td>

                    <td>
                      {share.expires_at
                        ? new Date(share.expires_at).toLocaleString()
                        : 'No expiry'}
                    </td>

                    <td>
                      <span
                        className={
                          status === 'Active'
                            ? 'ts-active'
                            : ''
                        }
                      >
                        {status}
                      </span>
                    </td>

                    <td>
                      {canRevoke ? (
                        <button
                          className="ts-danger-btn"
                          onClick={() =>
                            handleRevokeShare(share.share_id)
                          }
                          disabled={
                            revokingShareId === share.share_id
                          }
                        >
                          {revokingShareId === share.share_id
                            ? 'Revoking...'
                            : 'Revoke'}
                        </button>
                      ) : (
                        <span className="ts-muted">
                          No action
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
 case 'Analytics':
        return (
          <div className="ts-panel">
            <h2>File Analytics</h2>
            <div className="ts-stats">
              <div className="ts-stat-card">
                <p>Total Files</p>
                <h2>{userFiles.length}</h2>
              </div>
              <div className="ts-stat-card">
                <p>Shared Files</p>
                <h2>{sharedFiles.length}</h2>
              </div>
              <div className="ts-stat-card">
                <p>Storage</p>
                <h2>{formatBytes(usedBytes)}</h2>
              </div>
            </div>
          </div>
        )

      case 'My Account':
        return (
          <div className="ts-panel ts-account-panel">
            <h2>My Account</h2>
            <p>Manage your personal profile.</p>

            <div className="ts-account-avatar">
              <img
                src={profileImage || ''}
                alt=""
                style={{ display: profileImage ? 'block' : 'none' }}
              />
              {!profileImage && <span>{initial}</span>}
            </div>

            <label className="ts-upload-avatar">
              Change Profile Picture
              <input
                type="file"
                accept="image/*"
                onChange={handleProfileImage}
              />
            </label>

            <label>Full Name</label>
            <input
              className="ts-input"
              value={profileName}
              onChange={event => setProfileName(event.target.value)}
              placeholder="Enter your full name"
            />

            <label>Email Address</label>
            <input
              className="ts-input"
              value={email}
              readOnly
            />

            <label>Account Type</label>
            <input
              className="ts-input"
              value="Personal Account"
              readOnly
            />

            <button
              className="ts-primary-btn"
              onClick={saveProfile}
            >
              Save Profile
            </button>

            <p className="ts-muted">
              Profile name and picture are currently saved locally in
              this browser. Permanent account profile storage requires
              a backend profile API.
            </p>
          </div>
        )

      case 'Settings':
        return (
          <div className="ts-panel">
            <h2>Settings</h2>
            <p>Account and security information.</p>

            <div className="ts-setting-row">
              <span>Login email</span>
              <strong>{email}</strong>
            </div>

            <div className="ts-setting-row">
              <span>Account status</span>
              <strong className="ts-active">Authenticated</strong>
            </div>

            <div className="ts-setting-row">
              <span>File encryption</span>
              <strong className="ts-active">Enabled</strong>
            </div>

            <button
              className="ts-danger-btn"
              onClick={onLogout}
            >
              Logout
            </button>
          </div>
        )
case 'Notifications':
  return (
    <div className="ts-panel">
      <div className="ts-panel-heading">
        <div>
          <h2>Notifications</h2>
          <p>
            Stay updated about file sharing and account activity.
          </p>
          <span className="ts-notification-count">
            {unreadCount} unread notifications
          </span>
        </div>

        <div className="ts-notification-actions">
          <button
            className="ts-secondary-btn"
            onClick={loadNotifications}
            disabled={notificationsLoading}
          >
            Refresh
          </button>

          {unreadCount > 0 && (
            <button
              className="ts-primary-btn"
              onClick={handleMarkAllNotificationsRead}
            >
              Mark All as Read
            </button>
          )}
        </div>
      </div>

      {notificationsLoading ? (
        <div className="ts-empty">
          Loading notifications...
        </div>
      ) : notifications.length === 0 ? (
        <div className="ts-empty">
          <span>♧</span>
          <h3>No notifications yet</h3>
          <p>Your notifications will appear here.</p>
        </div>
      ) : (
        <div className="ts-notification-list">
          {notifications.map(item => (
            <div
              className={`ts-notification-card ${
                item.is_read ? 'read' : 'unread'
              }`}
              key={item.notification_id}
            >
              <div className="ts-notification-icon">
                {item.type === 'FILE_SHARED' ? '📁' : '🔔'}
              </div>

              <div className="ts-notification-content">
                <div className="ts-notification-title">
                  <strong>{item.title}</strong>
                  {!item.is_read && (
                    <span className="ts-unread-dot"></span>
                  )}
                </div>

                <p>{item.message}</p>

                <small>
                  {new Date(item.created_at).toLocaleString()}
                </small>
              </div>

              {!item.is_read && (
                <button
                  className="ts-mark-read-btn"
                  onClick={() =>
                    handleMarkNotificationRead(item.notification_id)
                  }
                >
                  Mark as Read
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )

case 'Activity History':
  return (
    <div className="ts-panel">
      <h2>Activity History</h2>
      <p>Activity history will be connected separately.</p>
    </div>
  )

      default:
        return null
    }
  }

  return (
    <div className="ts-app">
      <aside className="ts-sidebar">
        <div className="ts-brand">
          <div className="ts-brand-logo">T</div>
          <div>
            <strong>TrustShare</strong>
            <small>Secure Workspace</small>
          </div>
        </div>

        <div className="ts-workspace-label">WORKSPACE</div>

        <nav className="ts-navigation">
          {NAVIGATION.map(item => (
            <button
              key={item.name}
              className={
                activeSection === item.name
                  ? 'ts-nav-item active'
                  : 'ts-nav-item'
              }
              onClick={() => {
                setActiveSection(item.name)
                setSearchQuery('')
                setError('')
                setMessage('')
              }}
            >
              <span className="ts-nav-icon">{item.icon}</span>
              <span>{item.name}</span>
            </button>
          ))}
        </nav>

        <div className="ts-sidebar-bottom">
          <div className="ts-sidebar-security">
            <span>◈</span>
            <div>
              <strong>Secure Storage</strong>
              <small>AES-256-GCM protected</small>
            </div>
          </div>

          <button className="ts-logout" onClick={onLogout}>
            ↪ Logout
          </button>
        </div>
      </aside>

      <main className="ts-main">
        <header className="ts-topbar">
          <div>
            <div className="ts-breadcrumb">
              Workspace / <strong>{activeSection}</strong>
            </div>
          </div>

          <div className="ts-topbar-right">
            <div className="ts-search">
              <span>⌕</span>
              <input
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="Search files..."
              />
            </div>
            <div className="ts-notification-wrapper">
              <button
                className="ts-notification-bell"
                onClick={() => {
                  setShowNotificationDropdown(previous => !previous)
                  if (!showNotificationDropdown) {
                    loadNotifications()
                  }
                }}
                title="Notifications"
              >
                🔔

                {unreadCount > 0 && (
                  <span className="ts-bell-badge">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {showNotificationDropdown && (
                <div className="ts-notification-dropdown">

                  
<div className="ts-dropdown-header">
  <strong>Notifications</strong>

  <div className="ts-dropdown-actions">
    <button
      onClick={loadNotifications}
      title="Refresh notifications"
    >
      ↻ Refresh
    </button>

    {unreadCount > 0 && (
      <button
        onClick={handleMarkAllNotificationsRead}
        title="Mark all as read"
      >
        Mark All Read
      </button>
    )}

    <button onClick={() => setActiveSection('Notifications')}>
      View All
    </button>
  </div>
</div>

                  {notifications.length === 0 ? (
                    <p className="ts-dropdown-empty">
                      No notifications yet.
                    </p>
                  ) : (
                    notifications.slice(0, 5).map(item => (
                      <div
                        key={item.notification_id}
                        className={`ts-dropdown-item ${
                          item.is_read ? '' : 'unread'
                        }`}
                        onClick={async () => {
                          if (!item.is_read) {
                            await handleMarkNotificationRead(
                              item.notification_id
                            )
                          }
                          setShowNotificationDropdown(false)
                        }}
                      >
                        <strong>{item.title}</strong>
                        <p>{item.message}</p>
                        <small>
                          {new Date(item.created_at).toLocaleString()}
                        </small>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="ts-profile">
              <div className="ts-avatar-small">
                {profileImage
                  ? <img src={profileImage} alt="Profile" />
                  : initial}
              </div>
              <div className="ts-profile-text">
                <strong>{profileName || 'User'}</strong>
                <small>{email}</small>
              </div>
            </div>
          </div>
        </header>

        <div className="ts-content">
          {error && (
            <div className="ts-alert ts-alert-error">
              {error}
              <button onClick={() => setError('')}>×</button>
            </div>
          )}

          {message && (
            <div className="ts-alert ts-alert-success">
              {message}
              <button onClick={() => setMessage('')}>×</button>
            </div>
          )}

          {loading ? (
            <div className="ts-loading">Loading your workspace...</div>
          ) : (
            renderContent()
          )}
        </div>
      </main>
{shareFile && (
  <div className="ts-preview-overlay">
    <div className="ts-preview-modal">

      <div className="ts-preview-header">
        <strong>Share File</strong>

        <button onClick={closeShareModal}>
          ✕ Close
        </button>
      </div>

      <div style={{ padding: '24px' }}>

        <h3>{shareFile.filename}</h3>

        {!createdShareLink ? (
          <form onSubmit={handleShareSubmit}>

            <label>Recipient Email (Optional)</label>

            <input
              className="ts-input"
              type="email"
              value={shareEmail}
              onChange={event =>
                setShareEmail(event.target.value)
              }
              placeholder="Enter recipient email"
            />

            <label>Permission</label>

            <select
              className="ts-input"
              value={sharePermission}
              onChange={event =>
                setSharePermission(event.target.value)
              }
            >
              <option value="Viewer">Viewer</option>
              <option value="Editor">Editor</option>
            </select>

            <label>Link Expiry</label>

            <select
              className="ts-input"
              value={shareExpiry}
              onChange={event =>
                setShareExpiry(event.target.value)
              }
            >
              <option value={1}>1 Hour</option>
              <option value={24}>24 Hours</option>
              <option value={72}>3 Days</option>
              <option value={168}>7 Days</option>
              <option value={720}>30 Days</option>
            </select>

            <button
              type="submit"
              className="ts-primary-btn"
              disabled={sharing}
              style={{ marginTop: '20px' }}
            >
              {sharing ? 'Creating Link...' : 'Generate Share Link'}
            </button>

          </form>
        ) : (
          <div>

            <p className="ts-muted">
              Your secure sharing link is ready.
            </p>

            <input
              className="ts-input"
              value={createdShareLink}
              readOnly
              onFocus={event => event.target.select()}
            />

            <button
              className="ts-primary-btn"
              onClick={copyShareLink}
              style={{ marginTop: '12px' }}
            >
              Copy Share Link
            </button>

          </div>
        )}

      </div>
    </div>
  </div>
)}
      {previewLoading && (
        <div className="ts-preview-overlay">
          <div className="ts-preview-loading">Preparing preview...</div>
        </div>
      )}

      {previewUrl && (
        <div className="ts-preview-overlay">
          <div className="ts-preview-modal">
            <div className="ts-preview-header">
              <strong>{previewName}</strong>
              <button onClick={closePreview}>✕ Close</button>
            </div>

            {previewType.includes('pdf') ? (
              <iframe
                className="ts-preview-frame"
                src={previewUrl}
                title="PDF Preview"
              />
            ) : previewType.startsWith('image/') ? (
              <img
                className="ts-preview-image"
                src={previewUrl}
                alt={previewName}
              />
            ) : previewType.startsWith('text/') ? (
              <iframe
                className="ts-preview-frame"
                src={previewUrl}
                title="Text Preview"
              />
            ) : (
              <div className="ts-preview-unsupported">
                <h3>Preview unavailable</h3>
                <p>This file format cannot be previewed in the browser.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default UserDashboard
