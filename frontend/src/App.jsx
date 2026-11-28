import { API } from './config.js'
import UserDashboard from './pages/UserDashboard.jsx'
import { useEffect, useState } from 'react'
import './App.css'
import AdminDashboard from './pages/AdminDashboard.jsx'
function App() {
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [dashboard, setDashboard] = useState('')
  const [currentPage, setCurrentPage] = useState('landing')

  const isLogin = mode === 'login'
  const isSignup = mode === 'signup'
  const isForgot = mode === 'forgot'
  const [failedLogins, setFailedLogins] = useState([])
  const [failedLoginCount, setFailedLoginCount] = useState(0)
  const [securityError, setSecurityError] = useState('')
  const [adminOverview, setAdminOverview] = useState(null)
  const [overviewError, setOverviewError] = useState('')

  const [userFiles, setUserFiles] = useState([])
  const [userStorage, setUserStorage] = useState(null)
  const [userLoading, setUserLoading] = useState(false)
  const [userError, setUserError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)


useEffect(() => {
  if (dashboard !== 'Admin') return

  async function fetchFailedLogins() {
    try {
      setSecurityError('')

      const token = sessionStorage.getItem('trustshare_token')

      const response = await fetch(
        `${API}/admin/security/failed-logins`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to load security data')
      }

      setFailedLogins(data.attempts || [])
      setFailedLoginCount(data.total_failed_attempts || 0)
    } catch (error) {
      setSecurityError(error.message)
    }
  }

  fetchFailedLogins()
}, [dashboard])

useEffect(() => {
  if (dashboard !== 'Admin') return

  async function fetchAdminOverview() {
    try {
      setOverviewError('')

      const token = sessionStorage.getItem('trustshare_token')

      if (!token) {
        throw new Error('Login token not found. Please log in again.')
      }

      const response = await fetch(
        `${API}/admin/overview`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to load dashboard data')
      }

      setAdminOverview(data)
    } catch (error) {
      setOverviewError(error.message)
    }
  }

  fetchAdminOverview()
}, [dashboard])


useEffect(() => {
  if (dashboard !== 'User') return

  async function fetchUserFiles() {
    setUserLoading(true)
    setUserError('')

    try {
      const token = sessionStorage.getItem('trustshare_token')

      if (!token) {
        throw new Error('Login session expired. Please log in again.')
      }

      const response = await fetch(`${API}/files`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Unable to load your files.')
      }

      setUserFiles(data.files || [])
      setUserStorage(data.storage || null)
    } catch (error) {
      setUserError(error.message)
    } finally {
      setUserLoading(false)
    }
  }

  fetchUserFiles()
}, [dashboard])


async function handleFileUpload(event) {
  event.preventDefault()

  if (!selectedFile) {
    setUploadMessage('Please select a file first.')
    return
  }

  setUploading(true)
  setUploadMessage('')
  setUserError('')

  try {
    const token = sessionStorage.getItem('trustshare_token')
    const formData = new FormData()

    formData.append('uploaded_file', selectedFile)

    const response = await fetch(`${API}/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.detail || 'File upload failed.')
    }

    setUploadMessage(data.message || 'File uploaded successfully!')
    setSelectedFile(null)

    // Refresh the file list and storage overview.
    const filesResponse = await fetch(`${API}/files`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })

    const filesData = await filesResponse.json()

    if (!filesResponse.ok) {
      throw new Error(
        filesData.detail || 'File uploaded, but refreshing the file list failed.'
      )
    }

    setUserFiles(filesData.files || [])
    setUserStorage(filesData.storage || null)
  } catch (error) {
    setUploadMessage(error.message)
  } finally {
    setUploading(false)
  }
}

function formatBytes(bytes) {
  if (bytes == null || !Number.isFinite(Number(bytes))) return '—'
  if (bytes === 0) return '0 Bytes'

  const units = ['Bytes', 'KB', 'MB', 'GB']
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  )

  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 2)} ${units[index]}`
}



async function handleSubmit(event) {
  event.preventDefault()
  setMessage('')

  try {
    const endpoint = isSignup
      ? `${API}/register`
      : `${API}/login`

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        email: email.trim(),
        password: password,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(
        data.detail || data.message || 'Request failed. Please try again.'
      )
    }

    // Signup successful
    if (isSignup) {
      setMessage('Account created successfully! Please login.')
      setMode('login')
      setPassword('')
      return
    }

    // Login successful
    if (!data.access_token) {
      throw new Error('Access token was not received.')
    }

    sessionStorage.setItem('trustshare_token', data.access_token)
    sessionStorage.setItem('trustshare_role', data.role)
    sessionStorage.setItem('trustshare_email', email.trim())

    setMessage(
      data.role === 'Admin'
        ? 'Admin login successful!'
        : 'User login successful!'
    )

    setDashboard(data.role)

  } catch (error) {
    setMessage(
      error.message === 'Failed to fetch'
        ? 'Unable to connect to the server. Please try again.'
        : error.message
    )
  }
}


  function changeMode(nextMode) {
    setMode(nextMode)
    setMessage('')
    setPassword('')
  }

  function socialLogin(provider) {
    setMessage(
      `${provider} login is not connected yet.`
    )
  }


if (currentPage === 'landing') {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <div className="landing-logo">
          <span className="landing-logo-icon">T</span>
          <span>Trust<span>Share</span></span>
        </div>

        <nav className="landing-nav">
          <a href="#home">Home</a>
          <a href="#features">Features</a>
          <a href="#about">About</a>
        </nav>

        <div className="landing-actions">
          <button
            className="landing-signin"
            onClick={() => setCurrentPage('login')}
          >
            Sign In
          </button>

          <button
            className="landing-get-started"
            onClick={() => setCurrentPage('login')}
          >
            Get Started
          </button>
        </div>
      </header>

      <section className="landing-hero" id="home">
        <div className="landing-content">
          <span className="landing-badge">
            Secure. Private. In Your Control.
          </span>

          <h1>
            Your Files.
            <br />
            Your Control.
            <br />
            <span>Your Security.</span>
          </h1>

          <p>
            Store, organize and share your files with confidence.
            TrustShare brings secure file access and team collaboration
            together in one workspace.
          </p>

          <div className="landing-hero-actions">
            <button
              className="landing-get-started"
              onClick={() => setCurrentPage('login')}
            >
              Explore Your Workspace →
            </button>

            <button
              className="landing-secondary"
              onClick={() => document.getElementById('features')?.scrollIntoView({
                behavior: 'smooth'
              })}
            >
              Discover Features
            </button>
          </div>

          <div className="landing-trust">
            <span>🔒 Secure Access</span>
            <span>🛡️ Role-Based Control</span>
            <span>📁 Organized Files</span>
          </div>
        </div>

        <div className="landing-visual">
          <div className="landing-orbit">
            <div className="landing-shield">🛡️</div>
          </div>

          <div className="landing-file-card">
            <div className="landing-file-heading">
              <span>My Workspace</span>
              <span>•••</span>
            </div>

            <div className="landing-file">
              <span className="landing-file-icon">📄</span>
              <div>
                <strong>Project_Report.pdf</strong>
                <small>PDF Document · Secure</small>
              </div>
              <span>🔒</span>
            </div>

            <div className="landing-file">
              <span className="landing-file-icon">📊</span>
              <div>
                <strong>Project_Data.xlsx</strong>
                <small>Spreadsheet · Secure</small>
              </div>
              <span>🔒</span>
            </div>

            <div className="landing-file">
              <span className="landing-file-icon">📁</span>
              <div>
                <strong>Team Documents</strong>
                <small>Shared Workspace</small>
              </div>
              <span>→</span>
            </div>

            <div className="landing-security-note">
              <span>●</span> Your workspace, protected
            </div>
          </div>
        </div>
      </section>

      <section className="landing-features" id="features">
        <div className="landing-section-heading">
          <span>BUILT FOR YOUR SECURITY</span>
          <h2>Everything you need to share with confidence</h2>
          <p>
            A smarter way to manage files, access and collaboration.
          </p>
        </div>

        <div className="landing-feature-grid">
          <article className="landing-feature-card">
            <span>🔐</span>
            <h3>Secure File Access</h3>
            <p>Keep your files protected and accessible to authorized users.</p>
          </article>

          <article className="landing-feature-card">
            <span>👥</span>
            <h3>Controlled Sharing</h3>
            <p>Make file collaboration more organized and controlled.</p>
          </article>

          <article className="landing-feature-card">
            <span>🛡️</span>
            <h3>Role-Based Access</h3>
            <p>Separate user and administrator access to important features.</p>
          </article>

          <article className="landing-feature-card">
            <span>📈</span>
            <h3>Security Monitoring</h3>
            <p>Give administrators visibility into recorded failed login attempts.</p>
          </article>
        </div>
      </section>

      <footer className="landing-footer" id="about">
        <div className="landing-logo">
          <span className="landing-logo-icon">T</span>
          <span>Trust<span>Share</span></span>
        </div>
        <p>Secure collaboration starts here.</p>
      </footer>
    </main>
  )
}




if (dashboard === 'Admin') {
  return (
    <AdminDashboard
      onLogout={() => {
        sessionStorage.removeItem('trustshare_token')
        sessionStorage.removeItem('trustshare_role')
        sessionStorage.removeItem('trustshare_email')
        setDashboard('')
        setCurrentPage('login')
        setMessage('')
      }}
    />
  )
}




if (dashboard === 'User') {
  return (
    <UserDashboard
      onLogout={() => {
        sessionStorage.removeItem('trustshare_token')
        sessionStorage.removeItem('trustshare_role')
        sessionStorage.removeItem('trustshare_email')
        setDashboard('')
        setCurrentPage('login')
        setMessage('')
      }}
    />
  )
}




  return (
    <main className="auth-page">
      <section className="brand-panel">
        <div className="brand">
          <div className="brand-icon">T</div>
          <span>
            Trust<span className="brand-light">Share</span>
          </span>
        </div>

        <div className="brand-content">
          <div className="eyebrow">
            <span className="status-dot" />
            YOUR FILES. YOUR CONTROL.
          </div>

          <h1>
            Share with confidence.
            <br />
            <span>Work without limits.</span>
          </h1>

          <p className="brand-description">
            A secure space for your files and team collaboration.
            Keep your documents organized and your access under control.
          </p>

          <div className="security-card">
            <div className="security-icon">⌁</div>
            <div>
              <strong>Security at every step</strong>
              <p>
                Private access. Controlled sharing. Peace of mind.
              </p>
            </div>
            <span className="check-mark">✓</span>
          </div>
        </div>

        <div className="brand-footer">
          <span>SECURE FILE SHARING PLATFORM</span>
          <span>BUILT FOR YOUR WORKSPACE</span>
        </div>

        <div className="decor-circle circle-one" />
        <div className="decor-circle circle-two" />
      </section>

      <section className="form-panel">
        <div className="mobile-brand">
          <div className="brand-icon">T</div>
          <span>TrustShare</span>
        </div>

        <div className="auth-card">
          <div className="form-heading">
            <div className="welcome-label">
              {isLogin
                ? 'WELCOME BACK'
                : isSignup
                  ? 'GET STARTED'
                  : 'ACCOUNT RECOVERY'}
            </div>

            <h2>
              {isLogin
                ? 'Sign in to TrustShare'
                : isSignup
                  ? 'Create your account'
                  : 'Forgot your password?'}
            </h2>

            <p>
              {isLogin
                ? 'Enter your details to access your workspace.'
                : isSignup
                  ? 'Create an account to manage your secure files.'
                  : 'Enter your email and we’ll help you reset your password.'}
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </div>

            {!isForgot && (
              <div className="field">
                <div className="label-row">
                  <label htmlFor="password">Password</label>

                  {isLogin && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => changeMode('forgot')}
                    >
                      Forgot password?
                    </button>
                  )}
                </div>

                <div className="password-wrap">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(event) =>
                      setPassword(event.target.value)
                    }
                    autoComplete={
                      isSignup ? 'new-password' : 'current-password'
                    }
                    minLength={8}
                    maxLength={128}
                    required
                  />

                  <button
                    type="button"
                    className="show-password"
                    onClick={() =>
                      setShowPassword(!showPassword)
                    }
                    aria-label={
                      showPassword ? 'Hide password' : 'Show password'
                    }
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
            )}

            {isLogin && (
              <label className="remember-row">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) =>
                    setRememberMe(event.target.checked)
                  }
                />
                <span>Remember me</span>
              </label>
            )}

            <button className="submit-button" type="submit">
              <span>
                {isLogin
                  ? 'Sign in to your account'
                  : isSignup
                    ? 'Create account'
                    : 'Send reset instructions'}
              </span>
              <span>→</span>
            </button>

            {message && (
              <p className="form-message" role="status">
                {message}
              </p>
            )}

            {isLogin && (
              <>
                <div className="divider">
                  <span>OR CONTINUE WITH</span>
                </div>

                <div className="social-login">
                  <button
                    type="button"
                    className="social-button"
                    onClick={() => socialLogin('Google')}
                  >
                    <svg
                      className="google-logo"
                      viewBox="0 0 48 48"
                      aria-hidden="true"
                    >
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 3.23 13.22l7.98 6.19C13.11 13.72 18.1 9.5 24 9.5Z"
                        transform="translate(2 2)"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.76 7.18l7.73 6C44.42 38.05 46.98 31.92 46.98 24.55Z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a24 24 0 0 0 0 21.56l7.98-6.19Z"
                        transform="translate(2 2)"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.9-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.17 2.3-5.9 0-10.89-4.22-12.69-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"
                        transform="translate(2 0)"
                      />
                    </svg>
                    Continue with Google
                  </button>

                  <button
                    type="button"
                    className="social-button"
                    onClick={() => socialLogin('Microsoft')}
                  >
                    <svg
                      className="microsoft-logo"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
                      <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
                      <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
                      <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
                    </svg>
                    Continue with Microsoft
                  </button>
                </div>
              </>
            )}
          </form>

          <div className="form-switch">
            {isLogin ? (
              <>
                New to TrustShare?
                <button
                  type="button"
                  onClick={() => changeMode('signup')}
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                {isForgot
                  ? 'Remember your password?'
                  : 'Already have an account?'}
                <button
                  type="button"
                  onClick={() => changeMode('login')}
                >
                  Sign in
                </button>
              </>
            )}
          </div>

          <div className="privacy-note">
            <span>▣</span>
            Your workspace. Your files. Your control.
          </div>
        </div>

        <footer className="form-footer">
          <span>© 2026 TrustShare</span>
          <span>Secure collaboration, made simple.</span>
        </footer>
      </section>
    </main>
  )
}

export default App
