import { useEffect, useMemo, useState } from 'react'
import './AdminDashboard.css'
import { API } from '../config.js'
const menuItems = [
  ['Dashboard', '⌂'],
  ['User Management', '♙'],
  ['File Management', '▤'],
  ['Sharing Reports', '➤'],
  ['Security Dashboard', '⬡'],
  ['Analytics', '▥'],
  ['System Monitoring', '◷'],
  ['Activity Logs', '☷'],
  ['Settings', '⚙'],
]

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

function StatCard({ icon, label, value, note, tone }) {
  return (
    <article className="adm-stat-card">
      <div className={`adm-stat-icon ${tone}`}>{icon}</div>
      <div>
        <p>{label}</p>
        <h2>{value ?? '—'}</h2>
        <small>{note}</small>
      </div>
    </article>
  )
}

function LoginActivityChart({ attempts }) {
  const points = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date()
      date.setDate(date.getDate() - (6 - i))
      return date
    })

    return days.map(date => {
      const key = date.toLocaleDateString()

      return {
        label: date.toLocaleDateString('en', {
          day: 'numeric',
          month: 'short',
        }),
        count: attempts.filter(item =>
          item.attempted_at &&
          new Date(item.attempted_at).toLocaleDateString() === key
        ).length,
      }
    })
  }, [attempts])

  const max = Math.max(1, ...points.map(p => p.count))

  return (
    <div className="adm-chart-area">
      <div className="adm-chart-bars">
        {points.map(point => (
          <div className="adm-chart-column" key={point.label}>
            <strong>{point.count}</strong>

            <div className="adm-bar-track">
              <div
                className="adm-bar"
                style={{
                  height: `${Math.max(4, point.count / max * 100)}%`,
                }}
              />
            </div>

            <small>{point.label}</small>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AdminDashboard({ onLogout }) {
  const [overview, setOverview] = useState(null)
  const [personalStorage, setPersonalStorage] = useState(null)
  const [failedLogins, setFailedLogins] = useState([])
  const [securityAlerts, setSecurityAlerts] = useState([])
  const [alertSummary, setAlertSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [activeMenu, setActiveMenu] = useState('Security Dashboard')
  const [search, setSearch] = useState('')

  const [auditLogs, setAuditLogs] = useState([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState('')
  const [userActivity, setUserActivity] = useState([])
  const [fileActivity, setFileActivity] = useState([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState('')
  // User Management states
  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState('')
  // File Management states
  const [adminFiles, setAdminFiles] = useState([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [filesError, setFilesError] = useState('')
  // Sharing Reports states
  const [adminShares, setAdminShares] = useState([])
  const [shareSummary, setShareSummary] = useState(null)
  const [sharesLoading, setSharesLoading] = useState(false)
  const [sharesError, setSharesError] = useState('')
  // System Monitoring states
  const [systemData, setSystemData] = useState(null)
  const [systemLoading, setSystemLoading] = useState(false)
  const [systemError, setSystemError] = useState('')
  // Admin Settings states
  const [adminSettings, setAdminSettings] = useState(null)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsError, setSettingsError] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)

  // Report download states
  const [reportDownloading, setReportDownloading] = useState(false)
  const [reportError, setReportError] = useState('')
  const [reportSuccess, setReportSuccess] = useState('')

  // Load Admin Dashboard
  useEffect(() => {
    let cancelled = false

    async function loadDashboard() {
      setLoading(true)
      setError('')

      try {
        const token = sessionStorage.getItem('trustshare_token')

        if (!token) {
          throw new Error('Login session expired. Please log in again.')
        }

        const headers = {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        }

        const [
           overviewResponse,
           securityResponse,
           alertsResponse,
           personalStorageResponse
        ] = await Promise.all([
  fetch(`${API}/admin/overview`, { headers }),
  fetch(`${API}/admin/security/failed-logins`, { headers }),
  fetch(`${API}/admin/security/alerts`, { headers }),
  fetch(`${API}/files`, { headers }),
])
        const overviewData = await overviewResponse.json()
        const securityData = await securityResponse.json()
        const alertsData = await alertsResponse.json()
        const personalStorageData = await personalStorageResponse.json()

        if (!overviewResponse.ok) {
          throw new Error(
            overviewData.detail || 'Could not load admin overview'
          )
        }

        if (!securityResponse.ok) {
          throw new Error(
            securityData.detail || 'Could not load security events'
          )
        }

        if (!alertsResponse.ok) {
          throw new Error(
            alertsData.detail || 'Could not load security alerts'
          )
        }

        if (!cancelled) {
          setOverview(overviewData)
          console.log("Analytics Overview:", overviewData)
          setFailedLogins(securityData.attempts || [])
          setSecurityAlerts(alertsData.alerts || [])
          setAlertSummary(alertsData)
          setPersonalStorage(personalStorageData.storage || null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadDashboard()

    return () => {
      cancelled = true
    }
  }, [])

  // Load Audit Logs
  const loadAuditLogs = async () => {
    setAuditLoading(true)
    setAuditError('')

    try {
      const token = sessionStorage.getItem('trustshare_token')

      if (!token) {
        throw new Error('Login session expired.')
      }

      const response = await fetch(
        `${API}/admin/audit-logs?limit=100&skip=0`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to load audit logs')
      }

      setAuditLogs(data.audit_logs || [])
    } catch (err) {
      setAuditError(err.message)
    } finally {
      setAuditLoading(false)
    }
  }
  // Load Dashboard User and File Activity
const loadDashboardActivity = async () => {
  setActivityLoading(true)
  setActivityError('')

  try {
    const token = sessionStorage.getItem('trustshare_token')

    if (!token) {
      throw new Error('Login session expired.')
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    }

    const [userResponse, fileResponse] = await Promise.all([
      fetch(`${API}/admin/audit-logs?category=AUTH&limit=8&skip=0`, {
        headers,
      }),
      fetch(`${API}/admin/audit-logs?category=FILE&limit=8&skip=0`, {
        headers,
      }),
    ])

    const [userData, fileData] = await Promise.all([
      userResponse.json(),
      fileResponse.json(),
    ])

    if (!userResponse.ok) {
      throw new Error(userData.detail || 'Failed to load user activity')
    }

    if (!fileResponse.ok) {
      throw new Error(fileData.detail || 'Failed to load file activity')
    }

    setUserActivity(userData.audit_logs || [])
    setFileActivity(fileData.audit_logs || [])
  } catch (err) {
    setActivityError(err.message)
  } finally {
    setActivityLoading(false)
  }
}

const loadUsers = async () => {
  setUsersLoading(true)
  setUsersError('')

  try {
    const token = sessionStorage.getItem('trustshare_token')

    if (!token) {
      throw new Error('Login session expired.')
    }

    const response = await fetch(`${API}/admin/users`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.detail || 'Failed to load users')
    }

    setUsers(data.users || [])
  } catch (err) {
    setUsersError(err.message)
  } finally {
    setUsersLoading(false)
  }
}

const loadAdminFiles = async () => {
  setFilesLoading(true)
  setFilesError('')

  try {
    const token = sessionStorage.getItem('trustshare_token')

    if (!token) {
      throw new Error('Login session expired.')
    }

    const response = await fetch(`${API}/admin/files`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.detail || 'Failed to load files')
    }

    setAdminFiles(data.files || [])
  } catch (err) {
    setFilesError(err.message)
  } finally {
    setFilesLoading(false)
  }
}
const loadAdminShares = async () => {
  setSharesLoading(true)
  setSharesError('')

  try {
    const token = sessionStorage.getItem('trustshare_token')

    if (!token) {
      throw new Error('Login session expired.')
    }

    const response = await fetch(`${API}/admin/shares`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.detail || 'Failed to load sharing reports')
    }

    setAdminShares(data.shares || [])

    setShareSummary({
      total: data.total_shares || 0,
      active: data.active_shares || 0,
      expired: data.expired_shares || 0,
      revoked: data.revoked_shares || 0,
    })
  } catch (err) {
    setSharesError(err.message)
  } finally {
    setSharesLoading(false)
  }
}

const loadSystemMonitoring = async () => {
  setSystemLoading(true)
  setSystemError('')

  try {
    const token = sessionStorage.getItem('trustshare_token')

    if (!token) {
      throw new Error('Login session expired.')
    }

    const response = await fetch(`${API}/admin/system-monitoring`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.detail || 'Failed to load system monitoring')
    }

    setSystemData(data)
  } catch (err) {
    setSystemError(err.message)
  } finally {
    setSystemLoading(false)
  }
}
const loadAdminSettings = async () => {
  setSettingsLoading(true)
  setSettingsError('')

  try {
    const token = sessionStorage.getItem('trustshare_token')

    if (!token) {
      throw new Error('Login session expired.')
    }

    const response = await fetch(`${API}/admin/settings`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.detail || 'Failed to load settings')
    }

    setAdminSettings(data)
  } catch (err) {
    setSettingsError(err.message)
  } finally {
    setSettingsLoading(false)
  }
}
const handlePasswordChange = async (e) => {
  e.preventDefault()

  setPasswordMessage('')
  setPasswordError('')

  if (newPassword !== confirmPassword) {
    setPasswordError('New password and confirm password do not match.')
    return
  }

  if (currentPassword === newPassword) {
    setPasswordError('New password must be different.')
    return
  }

  setPasswordLoading(true)

  try {
    const token = sessionStorage.getItem('trustshare_token')

    const response = await fetch(
      `${API}/admin/settings/change-password`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      }
    )

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.detail || 'Password change failed.')
    }

    setPasswordMessage(data.message)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
  } catch (err) {
    setPasswordError(err.message)
  } finally {
    setPasswordLoading(false)
  }
}

  useEffect(() => {
  if (activeMenu === 'Dashboard') {
    loadDashboardActivity()
  }
}, [activeMenu])

  useEffect(() => {
  if (activeMenu === 'User Management') {
    loadUsers()
  }
}, [activeMenu])

  useEffect(() => {
  if (activeMenu === 'File Management') {
    loadAdminFiles()
  }
}, [activeMenu])

useEffect(() => {
  if (activeMenu === 'Sharing Reports') {
    loadAdminShares()
  }
}, [activeMenu])

useEffect(() => {
  if (activeMenu === 'System Monitoring') {
    loadSystemMonitoring()
  }
}, [activeMenu])

useEffect(() => {
  if (activeMenu === 'Settings') {
    loadAdminSettings()
  }
}, [activeMenu])

  useEffect(() => {
    if (activeMenu === 'Activity Logs') {
      loadAuditLogs()
    }
  }, [activeMenu])

  // Download Admin Report CSV
  const handleDownloadReport = async () => {
    setReportDownloading(true)
    setReportError('')
    setReportSuccess('')

    try {
      const token = sessionStorage.getItem('trustshare_token')

      if (!token) {
        throw new Error('Login session expired. Please login again.')
      }

      const response = await fetch(
        `${API}/admin/reports/export`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'text/csv',
          },
        }
      )

      if (!response.ok) {
        let message = 'Failed to download report'

        try {
          const data = await response.json()
          message = data.detail || message
        } catch {
          // Response was not JSON
        }

        throw new Error(message)
      }

      const blob = await response.blob()

      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')

      link.href = downloadUrl
      link.download = 'trustshare_admin_report.csv'

      document.body.appendChild(link)
      link.click()
      link.remove()

      window.URL.revokeObjectURL(downloadUrl)

      setReportSuccess('Report downloaded successfully.')
    } catch (err) {
      console.error('Report download error:', err)
      setReportError(err.message || 'Unable to download report.')
    } finally {
      setReportDownloading(false)
    }
  }

  const summary = overview?.summary || {}
  const personalUsedBytes = personalStorage?.used_bytes ?? 0
  const personalLimitBytes = personalStorage?.limit_bytes ?? 2147483648

  const personalUsagePercent = Math.min(
  100,
  Math.max(0, Number(personalStorage?.usage_percentage ?? 0))
)

const formatStorageMB = (bytes) =>
  (bytes / (1024 * 1024)).toFixed(2)

  // Filter Audit Logs
  const filteredAuditLogs = auditLogs.filter(log => {
    const query = search.toLowerCase()

    return [
      log.actor_email,
      log.actor_id,
      log.action,
      log.category,
      log.resource_type,
      log.resource_id,
      log.ip_address,
      log.status,
    ].some(value =>
      String(value || '').toLowerCase().includes(query)
    )
  })

  // Filter Failed Logins
  const filteredLogins = failedLogins.filter(item => {
    const query = search.toLowerCase()

    return (
      (item.email || '').toLowerCase().includes(query) ||
      (item.ip_address || '').toLowerCase().includes(query)
    )
  })

  return (
    <main className="adm-layout">

      {/* Sidebar */}
      <aside className="adm-sidebar">

        <div className="adm-brand">
          <div className="adm-brand-logo">◆</div>

          <div>
            <h2>
              Trust<span>Share</span>
            </h2>
            <small>Secure File-Sharing System</small>
          </div>
        </div>

        <p className="adm-side-label">ADMIN PANEL</p>

        <nav className="adm-navigation">
          {menuItems.map(([label, icon]) => (
            <button
              key={label}
              className={activeMenu === label ? 'active' : ''}
              onClick={() => setActiveMenu(label)}
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </nav>

        <div className="adm-storage">
  <div className="adm-storage-title">
    <span>◉</span> Storage Usage
  </div>

  <div className="adm-storage-track">
    <span style={{ width: `${personalUsagePercent}%` }} />
  </div>

  <div className="adm-storage-info">
    <span>
      {formatStorageMB(personalUsedBytes)} MB / {formatStorageMB(personalLimitBytes)} MB
    </span>
    <span>{personalUsagePercent}% used</span>
  </div>
</div>

        <button className="adm-logout" onClick={onLogout}>
          ↪ Logout
        </button>

      </aside>

      {/* Main Content */}
      <section className="adm-main">

        {/* Topbar */}
        <header className="adm-topbar">

          <div className="adm-search">
            <span>⌕</span>

            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search users, files, logs..."
            />
          </div>

          <div className="adm-profile">
            <button className="adm-notification">♧</button>

            <div className="adm-avatar">A</div>

            <div>
              <strong>Admin</strong>
              <small>System Administrator</small>
            </div>
          </div>

        </header>

        <div className="adm-content">

          {/* Page Heading */}
          <div className="adm-page-heading">

            <div>
              <span className="adm-heading-icon">⬡</span>

              <div>
                <h1>{activeMenu}</h1>

                <p>
                  Monitor login activity, access attempts,
                  security events and audit logs.
                </p>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={handleDownloadReport}
                disabled={reportDownloading}
                style={{
                  padding: '11px 18px',
                  border: 'none',
                  borderRadius: '8px',
                  background: reportDownloading ? '#64748b' : '#2563eb',
                  color: '#ffffff',
                  fontWeight: '600',
                  cursor: reportDownloading ? 'not-allowed' : 'pointer',
                  opacity: reportDownloading ? 0.7 : 1,
                }}
              >
                {reportDownloading
                  ? 'Downloading...'
                  : '⬇ Download Report'}
              </button>

              <span className="adm-date">◷ Last 7 Days</span>
            </div>

          </div>

          {error && (
            <div className="adm-error">
              {error}
            </div>
          )}

          {reportError && (
            <div className="adm-error">
              {reportError}
            </div>
          )}

          {reportSuccess && (
            <div
              style={{
                padding: '10px 14px',
                marginBottom: '15px',
                borderRadius: '8px',
                background: '#dcfce7',
                color: '#166534',
              }}
            >
              {reportSuccess}
            </div>
          )}

          {/* Dashboard */}
          {activeMenu === 'Dashboard' ? (
            <>
              <section className="adm-stats-grid">

                <StatCard
                  icon="♙"
                  label="Total Users"
                  value={loading ? '...' : summary.total_users}
                  note="Registered users"
                  tone="blue"
                />

                <StatCard
                  icon="▤"
                  label="Total Files"
                  value={loading ? '...' : summary.total_files}
                  note="Stored files"
                  tone="green"
                />

                <StatCard
                  icon="▱"
                  label="Storage Used"
                  value={loading ? '...' : `${summary.total_storage_mb ?? 0} MB`}
                  note="Current storage"
                  tone="purple"
                />

                <StatCard
                  icon="✕"
                  label="Failed Logins"
                  value={
                    loading
                      ? '...'
                      : summary.total_failed_logins ?? failedLogins.length
                  }
                  note="Security records"
                  tone="red"
                />

                <StatCard
                  icon="⬡"
                  label="Security Events"
                  value={loading ? '...' : failedLogins.length}
                  note="Recorded events"
                  tone="orange"
                />
                <StatCard
                 icon="↗"
                 label="Total Shares"
                 value={loading ? '...' : summary.total_shares}
                 note="Total sharing records"
                 tone="blue"
                />

              </section>

              <section className="adm-table-grid">

                <article className="adm-panel">
                  <div className="adm-panel-heading">
                    <h3>Recent User Activity</h3>
                    <span>Overview</span>
                  </div>

                  <div className="adm-table-wrap">
  {activityLoading ? (
    <div className="adm-empty">Loading user activity...</div>
  ) : activityError ? (
    <div className="adm-empty">{activityError}</div>
  ) : userActivity.length === 0 ? (
    <div className="adm-empty">No user activity found.</div>
  ) : (
    <table>
      <thead>
        <tr>
          <th>Activity</th>
          <th>User</th>
          <th>Status</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        {userActivity.map((log, index) => (
          <tr key={log._id || index}>
            <td>{log.action?.replaceAll('_', ' ') || 'Activity'}</td>
            <td>{log.actor_email || log.actor_id || 'System'}</td>
            <td>{log.status || '-'}</td>
            <td>
              {log.created_at
                ? new Date(log.created_at).toLocaleString()
                : '-'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )}
</div>
                </article>

                <article className="adm-panel">
                  <div className="adm-panel-heading">
                    <h3>Recent File Activity</h3>
                    <span>Overview</span>
                  </div>

                  <div className="adm-table-wrap">
  {activityLoading ? (
    <div className="adm-empty">Loading file activity...</div>
  ) : activityError ? (
    <div className="adm-empty">{activityError}</div>
  ) : fileActivity.length === 0 ? (
    <div className="adm-empty">No file activity found.</div>
  ) : (
    <table>
      <thead>
        <tr>
          <th>Action</th>
          <th>File</th>
          <th>User</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        {fileActivity.map((log, index) => (
          <tr key={log._id || index}>
            <td>{log.action?.replaceAll('_', ' ') || 'Activity'}</td>
            <td>
              {log.details?.filename || log.resource_id || 'File'}
            </td>
            <td>{log.actor_email || log.actor_id || 'System'}</td>
            <td>
              {log.created_at
                ? new Date(log.created_at).toLocaleString()
                : '-'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )}
</div>
                </article>

              </section>
            </>
          ) : activeMenu === 'Security Dashboard' ? (

            /* Security Dashboard */
            <>
              <section className="adm-stats-grid">

                <StatCard
                  icon="♙"
                  label="Total Users"
                  value={loading ? '...' : summary.total_users}
                  note="Registered users"
                  tone="blue"
                />

                <StatCard
                  icon="▤"
                  label="Total Files"
                  value={loading ? '...' : summary.total_files}
                  note="Stored files"
                  tone="green"
                />

                <StatCard
                  icon="▱"
                  label="Storage Used"
                  value={loading ? '...' : `${summary.total_storage_mb ?? 0} MB`}
                  note="Current storage"
                  tone="purple"
                />

                <StatCard
                  icon="✕"
                  label="Failed Logins"
                  value={
                    loading
                      ? '...'
                      : summary.total_failed_logins ?? failedLogins.length
                  }
                  note="Recorded failed attempts"
                  tone="red"
                />

                <StatCard
                  icon="⬡"
                  label="Security Events"
                  value={loading ? '...' : failedLogins.length}
                  note="Available security records"
                  tone="orange"
                />

<section
  className="adm-panel"
  style={{
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    gridColumn: '1 / -1',
    marginBottom: '24px'
  }}
>
  <div className="adm-panel-heading">
    <h3>Suspicious Activity Alerts</h3>
    <span>
      Last {alertSummary?.time_window_minutes ?? 10} Minutes
    </span>
  </div>

  <div style={{
    display: 'flex',
    gap: '20px',
    flexWrap: 'wrap',
    padding: '16px 0'
  }}>
    <div>
      <strong style={{ fontSize: '24px' }}>
        {alertSummary?.total_alerts ?? securityAlerts.length}
      </strong>
      <p>Total Security Alerts</p>
    </div>

    <div>
      <strong style={{ fontSize: '24px' }}>
        {alertSummary?.total_suspicious_share_attempts ?? 0}
      </strong>
      <p>Suspicious Share Attempts</p>
    </div>
  </div>

  {securityAlerts.length > 0 ? (
    <div className="adm-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Severity</th>
            <th>Activity</th>
            <th>IP Address</th>
            <th>Attempts</th>
          </tr>
        </thead>
        <tbody>
          {securityAlerts.map((alert, index) => (
            <tr key={`alert-${index}`}>
              <td>
                <span className="adm-status failed">
                  {alert.severity || 'HIGH'}
                </span>
              </td>
              <td>
                {alert.message ||
                  alert.description ||
                  alert.action ||
                  'Suspicious activity detected'}
              </td>
              <td>{alert.ip_address || 'Unavailable'}</td>
              <td>{alert.count ?? alert.attempts ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="adm-empty">
      {loading
        ? 'Checking suspicious activities...'
        : 'No suspicious activity detected in the last 10 minutes.'}
    </p>
  )}
</section>

              </section>

              <section className="adm-chart-grid">

                <article className="adm-panel">
                  <div className="adm-panel-heading">
                    <h3>Failed Login Activity</h3>
                    <span>Last 7 Days</span>
                  </div>

                  <LoginActivityChart attempts={failedLogins} />

                  <p className="adm-chart-caption">
                    Daily failed login attempts recorded by the server.
                  </p>
                </article>

                <article className="adm-panel adm-info-panel">
                  <div className="adm-panel-heading">
                    <h3>Access Attempts</h3>
                    <span>Security</span>
                  </div>

                  <div className="adm-empty-chart">
                    <div className="adm-empty-icon">◷</div>
                    <strong>Access analytics</strong>
                    <p>
                      Detailed access-attempt analytics will appear
                      when the backend provides this data.
                    </p>
                  </div>
                </article>

                <article className="adm-panel adm-info-panel">
                  <div className="adm-panel-heading">
                    <h3>Security Events</h3>
                    <span>Overview</span>
                  </div>

                  <div className="adm-event-summary">
                    <div className="adm-event-number">
                      {failedLogins.length}
                    </div>

                    <p>Failed login records available</p>

                    <small>
                      Other event categories will be connected
                      to their respective backend APIs.
                    </small>
                  </div>
                </article>

              </section>

              <section className="adm-table-grid">

                <article className="adm-panel">
                  <div className="adm-panel-heading">
                    <h3>Recent Login Activity</h3>
                    <span>{filteredLogins.length} Records</span>
                  </div>

                  <div className="adm-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Email</th>
                          <th>IP Address</th>
                          <th>Status</th>
                          <th>Date & Time</th>
                        </tr>
                      </thead>

                      <tbody>
                        {filteredLogins.slice(0, 8).map((item, index) => (
                          <tr
                            key={`${item.email}-${item.attempted_at}-${index}`}
                          >
                            <td>{item.email || 'Unknown'}</td>
                            <td>{item.ip_address || 'Unavailable'}</td>

                            <td>
                              <span className="adm-status failed">
                                {item.status || 'Failed'}
                              </span>
                            </td>

                            <td>{formatDate(item.attempted_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {!loading && filteredLogins.length === 0 && (
                      <p className="adm-empty">
                        No matching login records found.
                      </p>
                    )}
                  </div>
                </article>

                <article className="adm-panel">
                  <div className="adm-panel-heading">
                    <h3>Recent Security Events</h3>
                    <span>{failedLogins.length} Events</span>
                  </div>

                  <div className="adm-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Event</th>
                          <th>IP Address</th>
                          <th>Date & Time</th>
                        </tr>
                      </thead>

                      <tbody>
                        {failedLogins.slice(0, 8).map((item, index) => (
                          <tr key={`event-${index}`}>
                            <td>Failed login attempt</td>
                            <td>{item.ip_address || 'Unavailable'}</td>
                            <td>{formatDate(item.attempted_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {!loading && failedLogins.length === 0 && (
                      <p className="adm-empty">
                        No security events recorded.
                      </p>
                    )}
                  </div>
                </article>

              </section>
            </>

          ) : activeMenu === 'Activity Logs' ? (

            /* Activity Logs */
            <article className="adm-panel">

              <div className="adm-panel-heading">
                <div>
                  <h2>Audit Trail</h2>
                  <p>
                    Track all activities performed on TrustShare.
                  </p>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <span className="adm-status success">
                    {auditLogs.length} Records
                  </span>

                  <button
                    className="adm-refresh-btn"
                    onClick={loadAuditLogs}
                    disabled={auditLoading}
                  >
                    {auditLoading ? 'Refreshing...' : '↻ Refresh'}
                  </button>
                </div>
              </div>

              {auditLoading ? (
                <div className="adm-empty">
                  Loading activity logs...
                </div>
              ) : auditError ? (
                <div className="adm-empty">
                  {auditError}
                </div>
              ) : filteredAuditLogs.length === 0 ? (
                <div className="adm-empty">
                  No activity logs found.
                </div>
              ) : (

                <div className="adm-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date & Time</th>
                        <th>Category</th>
                        <th>Action</th>
                        <th>User</th>
                        <th>Resource</th>
                        <th>IP Address</th>
                        <th>Status</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredAuditLogs.map((log, index) => (
                        <tr key={log._id || index}>
                          <td>
                            {log.created_at
                              ? new Date(log.created_at).toLocaleString()
                              : 'N/A'}
                          </td>

                          <td>{log.category || 'N/A'}</td>
                          <td>{log.action || 'N/A'}</td>

                          <td>
                            {log.actor_email || log.actor_id || 'System'}
                          </td>

                          <td>
                            {log.resource_type || 'N/A'}
                            {log.resource_id
                              ? ` #${log.resource_id}`
                              : ''}
                          </td>

                          <td>{log.ip_address || 'N/A'}</td>

                          <td>
                            <span
                              className={`adm-status ${
                                log.status === 'SUCCESS'
                                  ? 'success'
                                  : 'failed'
                              }`}
                            >
                              {log.status || 'UNKNOWN'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

              )}

            </article>


          ) : activeMenu === 'Analytics' ? (

            /* Professional Analytics Dashboard */
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
              width: '100%'
            }}>

              {/* Analytics Heading */}
              <div>
                <h2 style={{
                  fontSize: '23px',
                  fontWeight: 700,
                  color: '#0f172a',
                  margin: 0
                }}>
                  Storage Overview
                </h2>
                <p style={{
                  color: '#64748b',
                  marginTop: '7px',
                  fontSize: '14px'
                }}>
                  Monitor platform storage, uploaded files and user consumption.
                </p>
              </div>

              {/* KPI Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '18px'
              }}>

                {[
                  {
                    label: 'Total Storage Used',
                    value: `${summary.total_storage_mb ?? 0} MB`,
                    icon: '▤',
                    color: '#2563eb',
                    bg: '#eff6ff',
                    note: 'Storage consumed'
                  },
                  {
                    label: 'Total Files',
                    value: summary.total_files ?? 0,
                    icon: '▧',
                    color: '#0891b2',
                    bg: '#ecfeff',
                    note: 'Uploaded files'
                  },
                  {
                    label: 'Total Users',
                    value: summary.total_users ?? 0,
                    icon: '♙',
                    color: '#7c3aed',
                    bg: '#f5f3ff',
                    note: 'Registered users'
                  },
                  {
                    label: 'Storage Utilization',
                    value: `${summary.storage_utilization_percentage ?? 0}%`,
                    icon: '◷',
                    color: '#059669',
                    bg: '#ecfdf5',
                    note: 'Overall capacity used'
                  }
                ].map(card => (
                  <article
                    key={card.label}
                    className="adm-panel"
                    style={{
                      padding: '22px',
                      borderRadius: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '14px'
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span style={{
                        color: '#64748b',
                        fontSize: '13px',
                        fontWeight: 600
                      }}>
                        {card.label}
                      </span>

                      <span style={{
                        width: '42px',
                        height: '42px',
                        display: 'grid',
                        placeItems: 'center',
                        borderRadius: '12px',
                        color: card.color,
                        background: card.bg,
                        fontSize: '21px'
                      }}>
                        {card.icon}
                      </span>
                    </div>

                    <div>
                      <h2 style={{
                        margin: 0,
                        fontSize: '27px',
                        color: '#0f172a',
                        fontWeight: 750
                      }}>
                        {card.value}
                      </h2>

                      <small style={{
                        display: 'block',
                        color: '#94a3b8',
                        marginTop: '7px'
                      }}>
                        {card.note}
                      </small>
                    </div>
                  </article>
                ))}
              </div>

{/* 7-Day Failed Login Trend */}
<article className="adm-panel" style={{ marginTop: '20px', padding: '22px' }}>
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '22px'
  }}>
    <div>
      <h3 style={{ margin: 0, color: '#0f172a' }}>
        Failed Login Trend
      </h3>
      <p style={{ color: '#64748b', fontSize: '13px', marginTop: '6px' }}>
        Failed login attempts during the last 7 days
      </p>
    </div>
    <span style={{
      background: '#fff1f2',
      color: '#e11d48',
      padding: '7px 12px',
      borderRadius: '20px',
      fontSize: '12px',
      fontWeight: 600
    }}>
      Last 7 Days
    </span>
  </div>

  {(() => {
    const trend = overview?.failed_login_trend || []
    const maxCount = Math.max(
      1,
      ...trend.map(item => item.failed_logins || 0)
    )

    return trend.length > 0 ? (
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
        gap: '12px',
        alignItems: 'end',
        minHeight: '180px'
      }}>
        {trend.map(item => {
          const count = item.failed_logins || 0
          const height = (count / maxCount) * 125

          return (
            <div key={item.date} style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '9px',
              height: '180px'
            }}>
              <strong style={{ fontSize: '12px', color: '#334155' }}>
                {count}
              </strong>
              <div style={{
                width: '100%',
                maxWidth: '42px',
                height: `${Math.max(height, 4)}px`,
                background: '#e11d48',
                borderRadius: '7px 7px 0 0'
              }} />
              <small style={{
                color: '#64748b',
                fontSize: '10px',
                textAlign: 'center'
              }}>
                {item.date.slice(5)}
              </small>
            </div>
          )
        })}
      </div>
    ) : (
      <p style={{ color: '#64748b' }}>
        No failed login trend data available.
      </p>
    )
  })()}
</article>
{/* 7-Day User Registration Trend */}
<article className="adm-panel" style={{ marginTop: '20px', padding: '22px' }}>
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '22px'
  }}>
    <div>
      <h3 style={{ margin: 0, color: '#0f172a' }}>
        User Registration Trend
      </h3>
      <p style={{ color: '#64748b', fontSize: '13px', marginTop: '6px' }}>
        New user registrations during the last 7 days
      </p>
    </div>

    <span style={{
      background: '#eff6ff',
      color: '#2563eb',
      padding: '7px 12px',
      borderRadius: '20px',
      fontSize: '12px',
      fontWeight: 600
    }}>
      Last 7 Days
    </span>
  </div>

  {(() => {
    const trend = overview?.user_growth_trend || []

    // Show all 7 dates, including days with zero registrations
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date()
      date.setDate(date.getDate() - (6 - index))

      const dateKey = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
      ].join('-')

      const item = trend.find(entry => entry.date === dateKey)

      return {
        date: dateKey,
        users: item?.users || 0
      }
    })

    const maxCount = Math.max(
      1,
      ...days.map(item => item.users)
    )

    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
        gap: '12px',
        alignItems: 'end',
        minHeight: '180px'
      }}>
        {days.map(item => {
          const height = (item.users / maxCount) * 125

          return (
            <div key={item.date} style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '9px',
              height: '180px'
            }}>
              <strong style={{ fontSize: '12px', color: '#334155' }}>
                {item.users}
              </strong>

              <div style={{
                width: '100%',
                maxWidth: '42px',
                height: `${Math.max(height, 4)}px`,
                background: '#2563eb',
                borderRadius: '7px 7px 0 0'
              }} />

              <small style={{
                color: '#64748b',
                fontSize: '10px',
                textAlign: 'center'
              }}>
                {item.date.slice(5)}
              </small>
            </div>
          )
        })}
      </div>
    )
  })()}
</article>

              {/* Overall Storage Capacity */}
              <article className="adm-panel" style={{
                padding: '24px',
                borderRadius: '14px'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px'
                }}>
                  <div>
                    <h3 style={{ margin: 0, color: '#0f172a' }}>
                      Overall Storage Capacity
                    </h3>
                    <p style={{
                      color: '#64748b',
                      fontSize: '13px',
                      margin: '7px 0 0'
                    }}>
                      Storage used across all registered users
                    </p>
                  </div>

                  <strong style={{
                    fontSize: '22px',
                    color: '#2563eb'
                  }}>
                    {summary.storage_utilization_percentage ?? 0}%
                  </strong>
                </div>

                <div style={{
                  height: '13px',
                  background: '#e2e8f0',
                  borderRadius: '20px',
                  overflow: 'hidden',
                  marginTop: '22px'
                }}>
                  <div style={{
                    width: `${Math.min(summary.storage_utilization_percentage || 0, 100)}%`,
                    height: '100%',
                    background: '#2563eb',
                    borderRadius: '20px',
                    transition: 'width 0.4s ease'
                  }} />
                </div>

                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '10px',
                  marginTop: '12px',
                  fontSize: '12px',
                  color: '#64748b'
                }}>
                  <span>
                    Used: {summary.total_storage_mb ?? 0} MB
                  </span>
                  <span>
                    Total Capacity: {(
                      (summary.total_storage_capacity_bytes || 0) /
                      (1024 * 1024)
                    ).toFixed(2)} MB
                  </span>
                </div>
              </article>

              {/* Storage by File Type */}
              <article className="adm-panel" style={{
                padding: '24px',
                borderRadius: '14px'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '10px'
                }}>
                  <div>
                    <h3 style={{ margin: 0, color: '#0f172a' }}>
                      Storage by File Type
                    </h3>
                    <p style={{
                      color: '#64748b',
                      fontSize: '13px',
                      marginTop: '6px'
                    }}>
                      File format distribution and storage consumption
                    </p>
                  </div>

                  <span style={{
                    background: '#eff6ff',
                    color: '#2563eb',
                    padding: '7px 12px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 600
                  }}>
                    {(overview?.files_by_type || []).length} Types
                  </span>
                </div>

                {(() => {
                  const files = overview?.files_by_type || []
                  const totalStorage = files.reduce(
                    (sum, item) => sum + (item.storage_bytes || 0), 0
                  )

                  const colors = [
                    '#2563eb',
                    '#0891b2',
                    '#7c3aed',
                    '#059669',
                    '#ea580c'
                  ]

                  return files.length > 0 ? files.map((item, index) => {
                    const percentage = totalStorage
                      ? (item.storage_bytes / totalStorage) * 100
                      : 0

                    return (
                      <div key={item.file_type} style={{ marginTop: '24px' }}>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '10px',
                          marginBottom: '10px'
                        }}>
                          <div>
                            <strong style={{ color: '#0f172a' }}>
                              {item.file_type}
                            </strong>
                            <small style={{
                              color: '#64748b',
                              marginLeft: '10px'
                            }}>
                              {item.count} files
                            </small>
                          </div>

                          <div>
                            <strong>{item.storage_mb} MB</strong>
                            <small style={{
                              color: '#64748b',
                              marginLeft: '8px'
                            }}>
                              {percentage.toFixed(1)}%
                            </small>
                          </div>
                        </div>

                        <div style={{
                          height: '11px',
                          background: '#e2e8f0',
                          borderRadius: '20px',
                          overflow: 'hidden'
                        }}>
                          <div style={{
                            width: `${percentage}%`,
                            height: '100%',
                            background: colors[index % colors.length],
                            borderRadius: '20px'
                          }} />
                        </div>
                      </div>
                    )
                  }) : (
                    <p style={{ color: '#64748b', marginTop: '20px' }}>
                      No file storage data available.
                    </p>
                  )
                })()}
              </article>

              {/* User-wise Storage Usage */}
              <article className="adm-panel" style={{
                padding: '24px',
                borderRadius: '14px'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px'
                }}>
                  <div>
                    <h3 style={{ margin: 0, color: '#0f172a' }}>
                      User-wise Storage Usage
                    </h3>
                    <p style={{
                      color: '#64748b',
                      fontSize: '13px',
                      marginTop: '6px'
                    }}>
                      Individual user storage consumption
                    </p>
                  </div>

                  <span style={{
                    padding: '7px 12px',
                    background: '#eff6ff',
                    color: '#2563eb',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 600
                  }}>
                    {(overview?.user_storage || []).length} Users
                  </span>
                </div>

                <div style={{
                  overflowX: 'auto',
                  marginTop: '22px'
                }}>
                  <table style={{
                    width: '100%',
                    minWidth: '620px',
                    borderCollapse: 'collapse',
                    textAlign: 'left'
                  }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        {['User', 'Files', 'Storage Used', 'Quota Usage'].map(title => (
                          <th key={title} style={{
                            padding: '15px 12px',
                            fontSize: '12px',
                            color: '#64748b',
                            textTransform: 'uppercase',
                            borderBottom: '1px solid #e2e8f0'
                          }}>
                            {title}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {(overview?.user_storage || []).map(user => (
                        <tr key={user.user_id}>
                          <td style={{
                            padding: '16px 12px',
                            borderBottom: '1px solid #f1f5f9',
                            color: '#334155',
                            fontWeight: 600
                          }}>
                            {user.email}
                          </td>

                          <td style={{
                            padding: '16px 12px',
                            borderBottom: '1px solid #f1f5f9'
                          }}>
                            {user.total_files}
                          </td>

                          <td style={{
                            padding: '16px 12px',
                            borderBottom: '1px solid #f1f5f9',
                            fontWeight: 600
                          }}>
                            {user.storage_mb} MB
                          </td>

                          <td style={{
                            padding: '16px 12px',
                            borderBottom: '1px solid #f1f5f9'
                          }}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px'
                            }}>
                              <div style={{
                                width: '85px',
                                height: '7px',
                                background: '#e2e8f0',
                                borderRadius: '20px',
                                overflow: 'hidden'
                              }}>
                                <div style={{
                                  width: `${Math.min(user.usage_percentage || 0, 100)}%`,
                                  height: '100%',
                                  background: '#2563eb',
                                  borderRadius: '20px'
                                }} />
                              </div>

                              <small style={{
                                color: '#64748b',
                                whiteSpace: 'nowrap'
                              }}>
                                {user.usage_percentage}%
                              </small>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {(!overview?.user_storage || overview.user_storage.length === 0) && (
                    <p style={{
                      textAlign: 'center',
                      padding: '24px',
                      color: '#64748b'
                    }}>
                      No user storage records available.
                    </p>
                  )}
                </div>
              </article>

            </div>

                    ) : activeMenu === 'User Management' ? (

            <article className="adm-panel">
              <div className="adm-panel-heading">
                <h3>User Management</h3>

                <button
                  className="adm-refresh-btn"
                  onClick={loadUsers}
                  disabled={usersLoading}
                >
                  {usersLoading ? 'Loading...' : 'Refresh'}
                </button>
              </div>

              <p>Total Registered Users: {users.length}</p>

              {usersLoading ? (
                <div className="adm-empty">Loading users...</div>
              ) : usersError ? (
                <div className="adm-empty">{usersError}</div>
              ) : users.length === 0 ? (
                <div className="adm-empty">No users found.</div>
              ) : (
                <div className="adm-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Email</th>
                        <th>Role</th>
                      </tr>
                    </thead>

                    <tbody>
                      {users.map(user => (
                        <tr key={user.id}>
                          <td>{user.id}</td>
                          <td>{user.email}</td>
                          <td>{user.role}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>

                 ) : activeMenu === 'File Management' ? (

            <article className="adm-panel">
              <div className="adm-panel-heading">
                <h3>File Management</h3>

                <button
                  className="adm-refresh-btn"
                  onClick={loadAdminFiles}
                  disabled={filesLoading}
                >
                  {filesLoading ? 'Loading...' : 'Refresh'}
                </button>
              </div>

              <p>Total Uploaded Files: {adminFiles.length}</p>

              {filesLoading ? (
                <div className="adm-empty">Loading files...</div>
              ) : filesError ? (
                <div className="adm-empty">{filesError}</div>
              ) : adminFiles.length === 0 ? (
                <div className="adm-empty">No files found.</div>
              ) : (
                <div className="adm-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Filename</th>
                        <th>File Type</th>
                        <th>Size</th>
                        <th>Owner</th>
                      </tr>
                    </thead>

                    <tbody>
                      {adminFiles.map(file => (
                        <tr key={file.id}>
                          <td>{file.id}</td>
                          <td>{file.filename}</td>
                          <td>{file.content_type}</td>
                          <td>
                            {(file.size / (1024 * 1024)).toFixed(2)} MB
                          </td>
                          <td>{file.owner_email}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>

                    ) : activeMenu === 'Sharing Reports' ? (
            <article className="adm-panel">
              <div className="adm-panel-heading">
                <h3>Sharing Reports</h3>
                <button
                  className="adm-refresh-btn"
                  onClick={loadAdminShares}
                  disabled={sharesLoading}
                >
                  {sharesLoading ? 'Loading...' : 'Refresh'}
                </button>
              </div>

              {sharesLoading ? (
                <div className="adm-empty">Loading sharing reports...</div>
              ) : sharesError ? (
                <div className="adm-empty">{sharesError}</div>
              ) : (
                <>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                    gap: '12px',
                    marginBottom: '20px'
                  }}>
                    <div className="adm-panel">
                      <h4>Total Shares</h4>
                      <h2>{shareSummary?.total ?? 0}</h2>
                    </div>
                    <div className="adm-panel">
                      <h4>Active Shares</h4>
                      <h2>{shareSummary?.active ?? 0}</h2>
                    </div>
                    <div className="adm-panel">
                      <h4>Expired Shares</h4>
                      <h2>{shareSummary?.expired ?? 0}</h2>
                    </div>
                    <div className="adm-panel">
                      <h4>Revoked Shares</h4>
                      <h2>{shareSummary?.revoked ?? 0}</h2>
                    </div>
                  </div>

                  {adminShares.length === 0 ? (
                    <div className="adm-empty">No sharing records found.</div>
                  ) : (
                    <div className="adm-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Share ID</th>
                            <th>File</th>
                            <th>Shared By</th>
                            <th>Shared With</th>
                            <th>Permission</th>
                            <th>Expires At</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adminShares.map(share => (
                            <tr key={share.share_id}>
                              <td>{share.share_id}</td>
                              <td>{share.filename}</td>
                              <td>{share.shared_by}</td>
                              <td>{share.shared_with}</td>
                              <td>{share.permission}</td>
                              <td>
                                {share.expires_at
                                  ? new Date(share.expires_at).toLocaleString()
                                  : 'Never'}
                              </td>
                              <td>{share.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </article>

         ) : activeMenu === 'System Monitoring' ? (
  <article className="adm-panel">
    <div className="adm-panel-heading">
      <h3>System Monitoring</h3>
      <button
        className="adm-refresh-btn"
        onClick={loadSystemMonitoring}
        disabled={systemLoading}
      >
        {systemLoading ? 'Checking...' : 'Refresh Monitoring'}
      </button>
    </div>

    {systemLoading ? (
      <div className="adm-empty">Checking system services...</div>
    ) : systemError ? (
      <div className="adm-empty">{systemError}</div>
    ) : systemData ? (
      <>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
          marginBottom: '20px'
        }}>
          <div>
            <h2 style={{ margin: 0 }}>{systemData.overall_status}</h2>
            <p style={{ margin: '6px 0 0' }}>
              {systemData.healthy_services} of {systemData.total_services} services healthy
            </p>
          </div>
          <span style={{
            padding: '8px 14px',
            borderRadius: '20px',
            background: systemData.overall_status === 'Healthy' ? '#dcfce7' : '#fee2e2',
            color: systemData.overall_status === 'Healthy' ? '#166534' : '#991b1b',
            fontWeight: 600
          }}>
            {systemData.overall_status}
          </span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: '12px',
          marginBottom: '20px'
        }}>
          {Object.entries(systemData.services || {}).map(([name, service]) => (
            <div key={name} className="adm-panel" style={{ margin: 0 }}>
              <h4>{name}</h4>
              <h2 style={{
                color: service.status === 'Healthy' ? '#16a34a' : '#dc2626'
              }}>
                {service.status}
              </h2>
              <p>Response Time: {service.response_time_ms} ms</p>
            </div>
          ))}
        </div>

        <p>
          Last checked: {systemData.checked_at
            ? new Date(systemData.checked_at).toLocaleString()
            : 'N/A'}
        </p>
      </>
    ) : (
      <div className="adm-empty">No monitoring data available.</div>
    )}
  </article>
) : activeMenu === 'Settings' ? (
  <article className="adm-panel">
    <div className="adm-panel-heading">
      <h3>Admin Settings</h3>
      <button
        className="adm-refresh-btn"
        onClick={loadAdminSettings}
        disabled={settingsLoading}
      >
        {settingsLoading ? 'Loading...' : 'Refresh'}
      </button>
    </div>

    {settingsLoading ? (
      <div className="adm-empty">Loading settings...</div>
    ) : settingsError ? (
      <div className="adm-empty">{settingsError}</div>
    ) : adminSettings ? (
      <div style={{
        padding: '16px',
        marginBottom: '24px',
        border: '1px solid #e5e7eb',
        borderRadius: '10px'
      }}>
        <h3>Admin Profile</h3>
        <p><strong>Email:</strong> {adminSettings.email}</p>
        <p><strong>Role:</strong> {adminSettings.role}</p>
      </div>
    ) : null}

    <div style={{
      padding: '16px',
      border: '1px solid #e5e7eb',
      borderRadius: '10px'
    }}>
      <h3>Change Password</h3>

      <form onSubmit={handlePasswordChange}>
        <div style={{ marginBottom: '14px' }}>
          <label>Current Password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            minLength={8}
            maxLength={128}
            style={{ width: '100%', padding: '10px', marginTop: '6px' }}
          />
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label>New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            maxLength={128}
            style={{ width: '100%', padding: '10px', marginTop: '6px' }}
          />
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label>Confirm New Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            maxLength={128}
            style={{ width: '100%', padding: '10px', marginTop: '6px' }}
          />
        </div>

        {passwordError && (
          <p style={{ color: '#dc2626' }}>{passwordError}</p>
        )}

        {passwordMessage && (
          <p style={{ color: '#16a34a' }}>{passwordMessage}</p>
        )}

        <button
          type="submit"
          className="adm-refresh-btn"
          disabled={passwordLoading}
        >
          {passwordLoading ? 'Updating...' : 'Update Password'}
        </button>
      </form>
    </div>
  </article>
) : (


            /* Other Sections */
            <article className="adm-panel adm-coming-soon">
              <div className="adm-empty-icon">▤</div>

              <h2>{activeMenu}</h2>

              <p>
                This section's dashboard UI will be connected
                when its backend functionality is ready.
              </p>

              <button onClick={() => setActiveMenu('Security Dashboard')}>
                Back to Security Dashboard
              </button>
            </article>

          )}

        </div>
      </section>
    </main>
  )
}
