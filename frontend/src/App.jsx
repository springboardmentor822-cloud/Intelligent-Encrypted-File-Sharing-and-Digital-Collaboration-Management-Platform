import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  Cloud,
  FileText,
  FileImage,
  FileSpreadsheet,
  LayoutDashboard,
  FolderOpen,
  Users,
  Share2,
  Clock,
  Star,
  Trash2,
  HardDrive,
  Database,
  BarChart3,
  Activity,
  Settings,
  Search,
  Bell,
  Upload,
  Download,
  LockKeyhole,
  Eye,
  EyeOff,
  LogOut,
  Menu,
  X,
  ChevronRight,
  CircleAlert,
  CheckCircle2,
  ShieldAlert,
  Link2,
  CalendarDays,
  RefreshCw,
  UserRound,
  File,
  Plus,
  Copy,
} from "lucide-react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const initialFiles = [
  {
    name: "Project_Report.pdf",
    type: "PDF",
    size: "2.4 MB",
    date: "Oct 28, 2026",
    owner: "You",
    icon: FileText,
    color: "red",
  },
  {
    name: "Research_Document.docx",
    type: "DOCX",
    size: "1.8 MB",
    date: "Oct 27, 2026",
    owner: "You",
    icon: FileText,
    color: "blue",
  },
  {
    name: "Budget_Analysis.xlsx",
    type: "XLSX",
    size: "850 KB",
    date: "Oct 26, 2026",
    owner: "You",
    icon: FileSpreadsheet,
    color: "green",
  },
  {
    name: "Presentation.pptx",
    type: "PPTX",
    size: "5.2 MB",
    date: "Oct 25, 2026",
    owner: "You",
    icon: FileText,
    color: "orange",
  },
  {
    name: "Team_Photo.png",
    type: "PNG",
    size: "3.1 MB",
    date: "Oct 24, 2026",
    owner: "You",
    icon: FileImage,
    color: "purple",
  },
];

const userMenu = [
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "My Files", icon: FolderOpen },
  { name: "Shared with Me", icon: Users },
  { name: "Shared by Me", icon: Share2 },
  { name: "Recent", icon: Clock },
  { name: "Favorites", icon: Star },
  { name: "Trash", icon: Trash2 },
  { name: "Storage", icon: HardDrive },
  { name: "File Analytics", icon: BarChart3 },
  { name: "Activity Logs", icon: Activity },
  { name: "Security", icon: ShieldCheck },
  { name: "Settings", icon: Settings },
];

const adminMenu = [
  { name: "Admin Dashboard", icon: LayoutDashboard },
  { name: "User Management", icon: Users },
  { name: "File Management", icon: FolderOpen },
  { name: "Sharing Reports", icon: Share2 },
  { name: "Security Dashboard", icon: ShieldCheck },
  { name: "Analytics", icon: BarChart3 },
  { name: "Reports", icon: FileText },
  { name: "Storage Analytics", icon: HardDrive },
  { name: "Suspicious Activity", icon: Activity },
  { name: "System Monitoring", icon: Activity },
  { name: "Audit Logs", icon: FileText },
  { name: "Settings", icon: Settings },
];

const loginEvents = [
  {
    user: "admin@trustshare.com",
    event: "Successful login",
    time: "Today, 08:30 PM",
    status: "Success",
  },
  {
    user: "user@example.com",
    event: "Successful login",
    time: "Today, 08:15 PM",
    status: "Success",
  },
  {
    user: "unknown@example.com",
    event: "Failed login attempt",
    time: "Today, 08:02 PM",
    status: "Failed",
  },
  {
    user: "guest@example.com",
    event: "Unauthorized file request",
    time: "Today, 07:45 PM",
    status: "Blocked",
  },
];

function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark">
        <ShieldCheck size={24} />
      </div>
      <span>
        Trust<span className="brand-blue">Share</span>
      </span>
    </div>
  );
}

function LoginPage({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
  event.preventDefault();

  if (mode !== "login") {
    setError("Signup and Forgot Password are not connected yet.");
    return;
  }

  if (!email.trim() || !password.trim()) {
    setError("Please enter your email address and password.");
    return;
  }

  try {
    setLoading(true);
    setError("");

    const response = await fetch(`${API_URL}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: email.trim(),
        password: password,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        typeof data.detail === "string"
          ? data.detail
          : "Login failed"
      );
    }

    if (!data.access_token) {
      throw new Error("Access token was not received.");
    }

    onLogin(email.trim(), data.access_token, data.role);

  } catch (error) {
    setError(error.message || "Unable to connect to the server.");
  } finally {
    setLoading(false);
  }
}

  return (
    <main className="login-page">
      <section className="login-hero">
        <Brand />

        <div className="hero-content">
          <span className="eyebrow">
            <ShieldCheck size={15} /> SECURITY · PRIVACY · TRUST
          </span>

          <h1>
            Secure File Sharing
            <br />
            for a <span>Safer Tomorrow</span>
          </h1>

          <p className="hero-description">
            Upload, store, and share your important files with end-to-end
            security, encryption, and complete control.
          </p>

          <div className="hero-art">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="cloud-illustration">
              <Cloud size={126} strokeWidth={1.2} />
              <LockKeyhole size={52} className="cloud-lock" />
            </div>

            <div className="floating-file file-one">
              <FileText size={22} />
              <span>Report.pdf</span>
            </div>
            <div className="floating-file file-two">
              <FileSpreadsheet size={22} />
              <span>Budget.xlsx</span>
            </div>
            <div className="floating-file file-three">
              <FileImage size={22} />
              <span>Photo.png</span>
            </div>
          </div>

          <div className="hero-benefits">
            <div>
              <LockKeyhole size={20} />
              <span>
                <strong>AES-256 encryption</strong>
                <small>Protection for your files</small>
              </span>
            </div>
            <div>
              <Users size={20} />
              <span>
                <strong>Controlled sharing</strong>
                <small>You decide who gets access</small>
              </span>
            </div>
            <div>
              <Activity size={20} />
              <span>
                <strong>Activity monitoring</strong>
                <small>Track access and file activity</small>
              </span>
            </div>
          </div>
        </div>

        <p className="hero-footer">
          Your files. Your privacy. Your control.
        </p>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <div className="mobile-brand">
            <Brand />
          </div>

          <div className="login-heading">
            <div className="login-shield">
              <ShieldCheck size={26} />
            </div>

            <h2>
              {mode === "login"
                ? "Welcome Back"
                : mode === "signup"
                  ? "Create Account"
                  : "Reset Password"}
            </h2>

            <p>
              {mode === "login"
                ? "Sign in to your TrustShare account"
                : mode === "signup"
                  ? "Start managing your files securely"
                  : "Enter your email to reset your password"}
            </p>
          </div>

          <form className="login-form" onSubmit={submit}>
            {mode === "signup" && (
              <label>
                Full Name
                <input placeholder="Enter your full name" required />
              </label>
            )}

            <label>
              Email Address
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            {mode !== "forgot" && (
              <label>
                Password
                <div className="password-field">
                  <LockKeyhole size={16} />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? (
                      <EyeOff size={17} />
                    ) : (
                      <Eye size={17} />
                    )}
                  </button>
                </div>
              </label>
            )}

            {mode === "login" && (
              <div className="form-options">
                <label className="remember-option">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setMode("forgot")}
                >
                  Forgot password?
                </button>
              </div>
            )}

            {error && <p className="form-error">{error}</p>}

           <button
  type="submit"
  className="primary-button login-submit"
  disabled={loading}
>
  {loading
    ? "Signing In..."
    : mode === "login"
      ? "Sign In"
      : mode === "signup"
        ? "Create Account"
        : "Send Reset Request"}

  <ChevronRight size={18} />
</button>
          </form>

          <div className="login-divider">
            <span />
            <p>Secure access to your workspace</p>
            <span />
          </div>

          <div className="login-security-note">
            <ShieldCheck size={18} />
            <span>Your account is protected by TrustShare security.</span>
          </div>

          <p className="signup-prompt">
            {mode === "login" ? "Don't have an account?" : "Already registered?"}{" "}
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setError("");
                setMode(mode === "login" ? "signup" : "login");
              }}
            >
              {mode === "login" ? "Sign up" : "Sign in"}
            </button>
          </p>

          {mode === "forgot" && (
            <button
              className="text-button back-to-login"
              onClick={() => {
                setError("");
                setMode("login");
              }}
            >
              Back to login
            </button>
          )}

          <p className="login-legal">
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </section>
    </main>
  );
}

function StatCard({ title, value, change, icon: Icon, color, detail }) {
  return (
    <article className="stat-card">
      <div className={`stat-icon ${color}`}>
        <Icon size={21} />
      </div>
      <div className="stat-copy">
        <p>{title}</p>
        <h3>{value}</h3>
        <div className="stat-bottom">
          <span className={change?.startsWith("-") ? "negative" : "positive"}>
            {change}
          </span>
          <span>{detail}</span>
        </div>
      </div>
    </article>
  );
}

function SectionHeading({ title, subtitle, children }) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      <div className="section-actions">{children}</div>
    </div>
  );
}

function MiniBarChart({ title, subtitle }) {
  const bars = [
    34, 48, 42, 64, 52, 78, 57, 72, 45, 61, 82, 67,
    48, 75, 55, 88, 62, 72, 53, 80, 65, 92, 58, 76,
  ];

  return (
    <article className="panel chart-panel">
      <div className="panel-heading">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <button className="icon-button" title="Refresh chart">
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="bar-chart" aria-label={title}>
        {bars.map((height, index) => (
          <div className="bar-column" key={index}>
            <div
              className={`bar ${index % 4 === 0 ? "bar-secondary" : ""}`}
              style={{ height: `${height}%` }}
            />
          </div>
        ))}
      </div>

      <div className="chart-labels">
        <span>Oct 01</span>
        <span>Oct 07</span>
        <span>Oct 14</span>
        <span>Oct 21</span>
        <span>Oct 28</span>
      </div>
    </article>
  );
}

function DonutChart() {
  return (
    <div className="donut-wrap">
      <div className="donut-chart">
        <div className="donut-hole">
          <strong>12.4 GB</strong>
          <span>Used storage</span>
        </div>
      </div>
      <div className="donut-legend">
        <p><span className="legend-dot documents" /> Documents <b>42%</b></p>
        <p><span className="legend-dot images" /> Images <b>28%</b></p>
        <p><span className="legend-dot videos" /> Videos <b>18%</b></p>
        <p><span className="legend-dot other" /> Other <b>12%</b></p>
      </div>
    </div>
  );
}

function FileTable({ files, onDelete, onFavorite, favorites, onDownload, onShare }) {
  if (!files.length) {
    return (
      <div className="empty-state">
        <FolderOpen size={35} />
        <h3>No files found</h3>
        <p>Upload a file or change your search to see your documents.</p>
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table className="file-table">
        <thead>
          <tr>
            <th>File name</th>
            <th>File size</th>
            <th>Last modified</th>
            <th>Owner</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {files.map((file, index) => {
            const Icon = file.icon || File;
            return (
              <tr key={`${file.name}-${index}`}>
                <td>
                  <div className="file-name-cell">
                    <div className={`file-type-icon ${file.color || "blue"}`}>
                      <Icon size={19} />
                    </div>
                    <div>
                      <strong>{file.name}</strong>
                      <small>{file.type || "FILE"} document</small>
                    </div>
                  </div>
                </td>
                <td>{file.size}</td>
                <td>{file.date}</td>
                <td>
                  <span className="owner-label">
                    <UserRound size={13} /> {file.owner || "You"}
                  </span>
                </td>
                <td>
                  <div className="table-actions">
                    <button
                      className="icon-button"
                      title="Download file"
                      onClick={() => onDownload(file)}
                    >
                      <Download size={16} />
                    </button>
                    <button
                       className="icon-button"
                       title="Share file"
                       onClick={() => onShare(file)}
                    >
                        <Share2 size={16} />
                    </button>
                    <button
                      className={`icon-button ${
                        favorites.includes(file.name) ? "favorite-active" : ""
                      }`}
                      title="Toggle favorite"
                      onClick={() => onFavorite(file.name)}
                    >
                      <Star size={16} />
                    </button>
                    <button
                      className="icon-button danger-action"
                      title="Move to trash"
                      onClick={() => onDelete(file)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SharedWithMe({ token }) {
  const [sharedFiles, setSharedFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchSharedFiles() {
      try {
        const response = await fetch(
          `${API_URL}/shared-with-me`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("Unable to load shared files");
        }

        const data = await response.json();
        setSharedFiles(data.shared_files || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (token) {
      fetchSharedFiles();
    }
  }, [token]);
  
  const [openingShareId, setOpeningShareId] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewName, setPreviewName] = useState("");

    const [downloadingShareId, setDownloadingShareId] = useState(null);

async function downloadSharedFile(file) {
  setDownloadingShareId(file.share_id);

  try {
    const response = await fetch(
      `"+API_URL+"shared-with-me/${file.share_id}/download`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || "Download failed");
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = file.file_name;
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.URL.revokeObjectURL(url);
  } catch (err) {
    alert(err.message);
  } finally {
    setDownloadingShareId(null);
  }
}

  if (loading) return <p>Loading shared files...</p>;

  if (error) return <p>{error}</p>;

  if (sharedFiles.length === 0) {
    return <p>No files have been shared with you.</p>;
  }

  return (
    <div>
      <h2>Shared with Me</h2>

      {sharedFiles.map((file) => (
        <div
          key={file.share_id}
          style={{
            padding: "15px",
            marginBottom: "12px",
            border: "1px solid #ddd",
            borderRadius: "10px",
          }}
        >
          <h3>{file.file_name}</h3>
          <p>Shared by: {file.shared_by}</p>
          <p>Permission: {file.permission}</p>
          <p>File size: {file.file_size} bytes</p>
          <p>
            Status: {file.active ? "Active" : "Expired / Revoked"}
          </p>

          {file.active && file.permission === "download" && (
  <button
    onClick={() => downloadSharedFile(file)}
    disabled={downloadingShareId === file.share_id}
  >
    {downloadingShareId === file.share_id
      ? "Downloading..."
      : "Download"}
  </button>
)}

                    {file.active &&
            file.permission === "view" &&
            file.content_type === "application/pdf" && (
              <button
                onClick={() => openSharedPdf(file)}
                disabled={openingShareId === file.share_id}
              >
                {openingShareId === file.share_id
                  ? "Opening..."
                  : "Open PDF"}
              </button>
            )}
        </div>
      ))}
    </div>
  );
}

function SharedByMe({ token }) {
  const [sharedFiles, setSharedFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    async function fetchSharedFiles() {
      try {
        const response = await fetch(
          `${API_URL}/shared-by-me`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("Unable to load shared files");
        }

        const data = await response.json();
        setSharedFiles(data.shared_files || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (token) {
      fetchSharedFiles();
    }
  }, [token]);

  async function revokeShare(shareId) {
    if (!window.confirm("Are you sure you want to revoke this share?")) {
      return;
    }

    try {
      const response = await fetch(
        `"+API_URL+"shares/${shareId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Unable to revoke share");
      }

      setSharedFiles((previous) =>
        previous.map((file) =>
          file.share_id === shareId
            ? {
                ...file,
                active: false,
                revoked_at: new Date().toISOString(),
              }
            : file
        )
      );

      setNotice("Share revoked successfully.");
    } catch (err) {
      setError(err.message);
    }
  }  async function openSharedPdf(file) {
    try {
      setOpeningShareId(file.share_id);
      setError("");

      const response = await fetch(
        `"+API_URL+"shared-with-me/${file.share_id}/view`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Unable to open PDF");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      setPreviewUrl(url);
      setPreviewName(file.file_name);
    } catch (err) {
      setError(err.message);
    } finally {
      setOpeningShareId(null);
    }
  }



  if (loading) return <p>Loading shared files...</p>;

  if (error) return <p>{error}</p>;

  return (
    <div>
      <h2>Shared by Me</h2>

      {notice && <p>{notice}</p>}

      {sharedFiles.length === 0 ? (
        <p>You have not shared any files yet.</p>
      ) : (
        sharedFiles.map((file) => (
          <div
            key={file.share_id}
            style={{
              padding: "15px",
              marginBottom: "12px",
              border: "1px solid #ddd",
              borderRadius: "10px",
            }}
          >
            <h3>{file.file_name}</h3>

            <p>Shared with: {file.shared_with || "Anyone with link"}</p>

            <p>Permission: {file.permission}</p>

            <p>File size: {(file.file_size / 1024).toFixed(2)} KB</p>

            <p>
              Shared on:{" "}
              {file.shared_at
                ? new Date(file.shared_at).toLocaleString()
                : "N/A"}
            </p>

            <p>
              Expires on:{" "}
              {file.expires_at
                ? new Date(file.expires_at).toLocaleString()
                : "Never"}
            </p>

            <p>
              Status:{" "}
              {file.active
                ? "Active"
                : file.revoked_at
                ? "Revoked"
                : "Expired"}
            </p>

            {file.active && (
              <button onClick={() => revokeShare(file.share_id)}>
                Revoke Share
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}


 function UserDashboard({
  files,
  setFiles,
  onLogout,
  email,
  token,
  activePage,
  setActivePage,
}) {
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState([]);
  const [notice, setNotice] = useState("");
  const [dashboardStats, setDashboardStats] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [shareFile, setShareFile] = useState(null);
  const [shareEmail, setShareEmail] = useState("");
  const [sharePermission, setSharePermission] = useState("view");
  const [shareExpiry, setShareExpiry] = useState(24);
  const [sharing, setSharing] = useState(false);
  const [createdShare, setCreatedShare] = useState(null);
  const [sharedFilesCount, setSharedFilesCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  useEffect(() => {
  async function fetchFiles() {
    if (!token) return;

    try {
      const response = await fetch(`${API_URL}/files`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Unable to fetch files");
      }

      const backendFiles = (data.files || []).map((file) => ({
        id: file.id,
        name: file.original_name,
        type: file.content_type?.split("/")[1]?.toUpperCase() || "FILE",
        size:
          file.file_size >= 1024 * 1024
            ? `${(file.file_size / (1024 * 1024)).toFixed(2)} MB`
            : `${(file.file_size / 1024).toFixed(1)} KB`,
        date: new Date(file.created_at).toLocaleDateString(),
        owner: "You",
        icon: file.content_type?.startsWith("image/")
          ? FileImage
          : file.content_type?.includes("spreadsheet")
            ? FileSpreadsheet
            : FileText,
        color: "blue",
      }));

      setFiles(backendFiles);
      setNotice("Files loaded successfully from the server.");

    } catch (error) {
      console.error("File loading error:", error);
      setNotice(error.message || "Unable to load files.");
    }
  }

  fetchFiles();
}, [token, setFiles]);

useEffect(() => {
  async function fetchDashboardStats() {
    if (!token) return;

    try {
      const response = await fetch(
       `${API_URL}/dashboard/stats`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Unable to load dashboard stats");
      }

      setDashboardStats(data);
    } catch (error) {
      console.error("Dashboard stats error:", error);
    }
  }

  fetchDashboardStats();
}, [token]);

useEffect(() => {
  async function fetchSharedFilesCount() {
    if (!token) return;

    try {
      const response = await fetch(
        `${API_URL}/shared-by-me`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Unable to load shared files");
      }

      const sharedFiles = data.shared_files || [];

      const activeShares = sharedFiles.filter(
        (share) => share.active === true
      );

      setSharedFilesCount(activeShares.length);
    } catch (error) {
      console.error("Shared files error:", error);
    }
  }

  fetchSharedFilesCount();
}, [token]);

useEffect(() => {
  async function fetchNotifications() {
    if (!token) return;

    try {
      const [notificationsResponse, countResponse] = await Promise.all([
        fetch(`${API_URL}/notifications`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),
        fetch(`${API_URL}/notifications/unread-count`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),
      ]);

      if (!notificationsResponse.ok || !countResponse.ok) {
        throw new Error("Unable to fetch notifications");
      }

      const notificationsData = await notificationsResponse.json();
      const countData = await countResponse.json();

      setNotifications(notificationsData.notifications || []);
      setUnreadNotificationCount(countData.unread_count || 0);
    } catch (error) {
      console.error("Notifications error:", error);
    }
  }

  fetchNotifications();
}, [token]);


async function markNotificationAsRead(notificationId) {
  const selectedNotification = notifications.find(
    (item) => item.notification_id === notificationId
  );

  if (!selectedNotification || selectedNotification.is_read) return;

  try {
    const response = await fetch(
      `"+API_URL+"notifications/${notificationId}/read`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error("Unable to mark notification as read");
    }

    setNotifications((previous) =>
      previous.map((item) =>
        item.notification_id === notificationId
          ? { ...item, is_read: true }
          : item
      )
    );

    setUnreadNotificationCount((previous) =>
      Math.max(previous - 1, 0)
    );
  } catch (error) {
    console.error("Mark notification error:", error);
  }
} 

const visibleFiles = files.filter((file) => {
  const matchesSearch = file.name
    .toLowerCase()
    .includes(search.toLowerCase());

  if (activePage === "Favorites") {
    return matchesSearch && favorites.includes(file.name);
  }

  return matchesSearch;
});

async function uploadFiles(event) {
  const selected = Array.from(event.target.files || []);
  if (!selected.length) return;

  const maxSize = 5 * 1024 * 1024;
  const allowedTypes = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/plain",
  "text/csv",
];

const allowed = selected.filter(
  (file) =>
    file.size <= maxSize &&
    allowedTypes.includes(file.type)
);

  if (!allowed.length) {
    setNotice("Files must be 5 MB or smaller.");
    event.target.value = "";
    return;
  }

  setUploading(true);

  try {
    for (const file of allowed) {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API_URL}/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || `Upload failed: ${file.name}`
        );
      }
    }

    const filesResponse = await fetch(
      `${API_URL}/files`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const filesData = await filesResponse.json();

    if (!filesResponse.ok) {
      throw new Error("Unable to refresh files from server.");
    }

    const backendFiles = (filesData.files || []).map((file) => ({
      id: file.id,
      name: file.original_name,
      type: file.content_type?.split("/")[1]?.toUpperCase() || "FILE",
      size:
        file.file_size >= 1024 * 1024
          ? `${(file.file_size / (1024 * 1024)).toFixed(2)} MB`
          : `${(file.file_size / 1024).toFixed(1)} KB`,
      date: new Date(file.created_at).toLocaleDateString(),
      owner: "You",
      icon: file.content_type?.startsWith("image/")
        ? FileImage
        : file.content_type?.includes("spreadsheet")
          ? FileSpreadsheet
          : FileText,
      color: "blue",
    }));

    setFiles(backendFiles);
    setNotice(`${allowed.length} file(s) uploaded successfully to the server.`);

  } catch (error) {
    console.error("Upload error:", error);
    setNotice(error.message || "File upload failed.");
  } finally {
    setUploading(false);
    event.target.value = "";
  }
}
async function deleteFile(file) {
  if (!file.id) {
    setNotice("File ID is missing. Cannot delete this file.");
    return;
  }

  const confirmed = window.confirm(
    `Are you sure you want to delete ${file.name}?`
  );

  if (!confirmed) return;

  try {
    const response = await fetch(
      `"+API_URL+"files/${file.id}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "File deletion failed.");
    }

    setFiles((previous) =>
      previous.filter((item) => item.id !== file.id)
    );

    setFavorites((previous) =>
      previous.filter((item) => item !== file.name)
    );

    setNotice(`${file.name} deleted successfully.`);

  } catch (error) {
    console.error("Delete error:", error);
    setNotice(error.message || "Unable to delete file.");
  }
}


  function toggleFavorite(name) {
    setFavorites((previous) =>
      previous.includes(name)
        ? previous.filter((item) => item !== name)
        : [...previous, name]
    );
  }
  function openShareModal(file) {
  setShareFile(file);
  setShareEmail("");
  setSharePermission("view");
  setShareExpiry(24);
  setCreatedShare(null);
}

async function createShare(event) {
  event.preventDefault();

  if (!shareFile?.id) {
    setNotice("File ID is missing.");
    return;
  }

  try {
    setSharing(true);
    setCreatedShare(null);

    const response = await fetch(
      `"+API_URL+"files/${shareFile.id}/share`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          permission: sharePermission,
          expires_in_hours: Number(shareExpiry),
          recipient_email: shareEmail.trim(),
        }),
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.detail || "File sharing failed.");
    }

    setCreatedShare({
      shareId: data.share_id,
      link: `"+API_URL+"share/${data.share_token}`,
      expiresAt: data.expires_at,
    });

    setNotice("File shared successfully!");
    setShareEmail("");

  } catch (error) {
    console.error("Share error:", error);
    setNotice(error.message || "Unable to share file.");
  } finally {
    setSharing(false);
  }
}
async function copyShareLink() {
  if (!createdShare?.link) return;

  try {
    await navigator.clipboard.writeText(createdShare.link);
    setNotice("Share link copied successfully!");
  } catch (error) {
    setNotice("Unable to copy link. Please copy it manually.");
  }
}

  async function downloadFile(file) {
  try {
    if (file.localFile) {
      const localUrl = URL.createObjectURL(file.localFile);
      const localAnchor = document.createElement("a");

      localAnchor.href = localUrl;
      localAnchor.download = file.name;
      document.body.appendChild(localAnchor);
      localAnchor.click();
      localAnchor.remove();

      URL.revokeObjectURL(localUrl);
      return;
    }

    if (!file.id) {
      setNotice("File ID is missing. Cannot download this file.");
      return;
    }

    const response = await fetch(
      `"+API_URL+"files/${file.id}/download`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || "File download failed.");
    }

    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = file.name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(downloadUrl);

    setNotice(`${file.name} downloaded successfully.`);
  } catch (error) {
    console.error("Download error:", error);
    setNotice(error.message || "Unable to download file.");
  }
}

  const pageTitle =
    activePage === "Dashboard" ? "Dashboard" : activePage;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button sidebar-close"
            onClick={() => document.body.classList.remove("sidebar-open")}
          >
            <X size={19} />
          </button>
        </div>

        <div className="workspace-label">WORKSPACE</div>

        <nav className="sidebar-nav">
          {userMenu.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={`nav-item ${activePage === name ? "active" : ""}`}
              onClick={() => {
                setActivePage(name);
                document.body.classList.remove("sidebar-open");
              }}
            >
              <Icon size={18} />
              <span>{name}</span>
              {name === "Shared with Me" && (
                <span className="nav-count">3</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-storage">
          <div className="storage-title">
            <HardDrive size={17} />
            <span>Storage</span>
            <span className="storage-percent">12%</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: "12%" }} />
          </div>
          <p>12.4 GB of 100 GB used</p>
          <button
            className="upgrade-button"
            onClick={() => {
              setActivePage("Storage");
              setNotice("Storage management is available in this demo.");
            }}
          >
            Manage Storage <ChevronRight size={15} />
          </button>
        </div>

        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <div className="avatar">U</div>
            <div className="sidebar-user-copy">
              <strong>{email.split("@")[0]}</strong>
              <small>Standard User</small>
            </div>
            <button
              className="icon-button"
              title="Sign out"
              onClick={onLogout}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => document.body.classList.toggle("sidebar-open")}
          >
            <Menu size={21} />
          </button>

          <div className="global-search">
            <Search size={17} />
            <input
              placeholder="Search files, folders..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="search-shortcut">⌘ K</span>
          </div>

          <div className="topbar-right">
  <span className="connection-status">
    <span /> Secure workspace
  </span>

  <div className="topbar-profile">
    <div className="avatar">U</div>
    <div>
      <strong>{email.split("@")[0]}</strong>
      <small>Personal account</small>
    </div>
  </div>

  <div className="notification-wrapper">
    <button
      className="icon-button notification-button"
      title="Notifications"
      onClick={() => setShowNotifications(!showNotifications)}
    >
      <Bell size={19} />
      {unreadNotificationCount > 0 && (
        <span className="notification-count">
          {unreadNotificationCount > 99
            ? "99+"
            : unreadNotificationCount}
        </span>
      )}
    </button>

    {showNotifications && (
      <div className="notification-dropdown">
        <h3>Notifications</h3>

        {notifications.length === 0 ? (
          <p>No notifications yet.</p>
        ) : (
          notifications.map((item) => (
            <div
              key={item.notification_id}
              className={`notification-item ${item.is_read ? "read" : "unread"}`}
              onClick={() =>
                markNotificationAsRead(item.notification_id)
              }
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
</div>
        </header>

        <main className="page-content">
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{pageTitle}</strong>
          </div>

          {notice && (
            <div className="notice">
              <CheckCircle2 size={17} />
              <span>{notice}</span>
              <button onClick={() => setNotice("")}>
                <X size={15} />
              </button>
            </div>
          )}

          {activePage === "Dashboard" && (
            <>
              <SectionHeading
                title="Welcome to TrustShare"
                subtitle="Manage your files securely, collaborate, and stay in control."
              >
                <label className="primary-button upload-button">
                  <Upload size={17} />
                  {uploading ? "Uploading..." : "Upload Files"}
                  <input
                    type="file"
                    multiple
                    hidden
                    onChange={uploadFiles}
                  />
                </label>
              </SectionHeading>

              <div className="welcome-banner">
                <div className="welcome-copy">
                  <span className="eyebrow">
                    <ShieldCheck size={14} /> YOUR SECURE WORKSPACE
                  </span>
                  <h2>Your files, protected.</h2>
                  <p>
                    Keep important documents organized and share them with
                    people you trust.
                  </p>
                  <button
                    className="banner-button"
                    onClick={() => setActivePage("My Files")}
                  >
                    Explore My Files <ChevronRight size={16} />
                  </button>
                </div>
                <div className="banner-art">
                  <Cloud size={94} strokeWidth={1.3} />
                  <LockKeyhole size={35} className="banner-lock" />
                  <div className="banner-file">
                    <FileText size={22} />
                    <span>Secure documents</span>
                    <ShieldCheck size={17} />
                  </div>
                </div>
              </div>

              <div className="stats-grid">
                <StatCard
                  title="Total Files"
                  value={dashboardStats?.total_files ?? files.length}
                  change="+12%"
                  detail="this month"
                  icon={FileText}
                  color="blue"
                />
                <StatCard
  title="Storage Used"
  value={
    dashboardStats
      ? `${Number(dashboardStats.storage_used_mb).toFixed(2)} MB`
      : "Loading..."
  }
  change="Live"
  detail="from server"
  icon={HardDrive}
  color="purple"
/>
                <StatCard
                  title="Shared Files"
                  value={sharedFilesCount}
                  change="Live"
                  detail="active shares"
                  icon={Share2}
                  color="green"
                />
                <StatCard
                  title="Security Status"
                  value="Protected"
                  change="Active"
                  detail="workspace"
                  icon={ShieldCheck}
                  color="orange"
                />
              </div>

              <div className="dashboard-grid">
                <article className="panel storage-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Storage Overview</h3>
                      <p>Distribution of your stored files</p>
                    </div>
                    <button
                      className="subtle-button"
                      onClick={() => setActivePage("Storage")}
                    >
                      Details
                    </button>
                  </div>
                  <DonutChart />
                </article>

                <MiniBarChart
                  title="File Activity"
                  subtitle="Illustrative activity for the month"
                />
              </div>

              <article className="panel recent-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Recent Files</h3>
                    <p>Your latest documents and uploads</p>
                  </div>
                  <button
                    className="subtle-button"
                    onClick={() => setActivePage("My Files")}
                  >
                    View All <ChevronRight size={15} />
                  </button>
                </div>
                <FileTable
                  files={files.slice(0, 4)}
                  onDelete={deleteFile}
                  onFavorite={toggleFavorite}
                  favorites={favorites}
                  onDownload={downloadFile}
                  onShare={openShareModal}

                />
              </article>

              <div className="security-tip">
                <div className="tip-icon">
                  <LockKeyhole size={20} />
                </div>
                <div>
                  <strong>Keep your account secure</strong>
                  <p>
                    Use a strong password and share files only with trusted
                    recipients.
                  </p>
                </div>
                <button
                  className="subtle-button"
                  onClick={() => setActivePage("Security")}
                >
                  Security settings <ChevronRight size={15} />
                </button>
              </div>
            </>
          )}

          {activePage === "My Files" && (
            <>
              <SectionHeading
                title="My Files"
                subtitle="Upload, organize, and manage your documents."
              >
                <label className="primary-button upload-button">
                  <Upload size={17} /> Upload Files
                  <input type="file" multiple hidden onChange={uploadFiles} />
                </label>
              </SectionHeading>
              <article className="panel recent-panel">
                <div className="panel-heading">
                  <div>
                    <h3>All Documents</h3>
                    <p>{visibleFiles.length} file(s) in this workspace</p>
                  </div>
                </div>
                <FileTable
                  files={visibleFiles}
                  onDelete={deleteFile}
                  onFavorite={toggleFavorite}
                  favorites={favorites}
                  onDownload={downloadFile}
                   onShare={openShareModal}
                />
              </article>
            </>
          )}

          {activePage === "Favorites" && (
            <>
              <SectionHeading
                title="Favorites"
                subtitle="Quick access to your starred documents."
              />
              <article className="panel recent-panel">
                <FileTable
                  files={visibleFiles}
                  onDelete={deleteFile}
                  onFavorite={toggleFavorite}
                  favorites={favorites}
                  onDownload={downloadFile}
                  onShare={openShareModal}

                />
              </article>
            </>
          )}

          {activePage === "File Analytics" && (
            <>
              <SectionHeading
                title="File Analytics"
                subtitle="Review storage distribution and file activity."
              >
                <button
                  className="secondary-button"
                  onClick={() => setNotice("Date filter is a UI demo.")}
                >
                  <CalendarDays size={16} /> Last 30 days
                </button>
              </SectionHeading>
              <div className="stats-grid">
                <StatCard title="Total Storage" value="12.4 GB" change="+12%" detail="sample" icon={HardDrive} color="blue" />
                <StatCard title="Files Uploaded" value={files.length} change="+8%" detail="sample" icon={Upload} color="green" />
                <StatCard title="Downloads" value="642" change="+15%" detail="sample" icon={Download} color="purple" />
                <StatCard title="Shares Created" value="126" change="+5%" detail="sample" icon={Share2} color="orange" />
              </div>
              <div className="dashboard-grid">
                <MiniBarChart title="Upload Reports" subtitle="Illustrative daily upload activity" />
                <MiniBarChart title="Download Reports" subtitle="Illustrative download activity" />
              </div>
              <article className="panel storage-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Storage Statistics</h3>
                    <p>Sample file type distribution</p>
                  </div>
                </div>
                <DonutChart />
              </article>
            </>
          )}

          {activePage === "Security" && (
            <SecurityPage />
          )}

          {activePage === "Activity Logs" && (
            <ActivityPage />
          )}

          {activePage === "Storage" && (
            <>
              <SectionHeading
                title="Storage"
                subtitle="Monitor workspace storage usage."
              />
              <article className="panel storage-detail">
                <div className="storage-detail-icon">
                  <HardDrive size={30} />
                </div>
                <h3>12.4 GB <span>of 100 GB used</span></h3>
                <div className="progress-track large-progress">
                  <div className="progress-fill" style={{ width: "12.4%" }} />
                </div>
                <p>12.4% of the illustrative storage allocation is in use.</p>
              </article>
            </>
          )}

          {activePage === "Shared with Me" && (
  <SharedWithMe token={token} />
)}

{activePage === "Shared by Me" && (
  <SharedByMe token={token} />
)}

          {activePage === "Recent" && (
            <>
              <SectionHeading
                title="Recent Files"
                subtitle="Recently modified documents."
              />
              <article className="panel recent-panel">
                <FileTable
                  files={visibleFiles}
                  onDelete={deleteFile}
                  onFavorite={toggleFavorite}
                  favorites={favorites}
                  onDownload={downloadFile}
                  onShare={openShareModal}
                />
              </article>
            </>
          )}

          {activePage === "Trash" && (
            <EmptyFeature
              icon={Trash2}
              title="Trash"
              description="Deleted files will appear here after you connect persistent trash management to the backend."
            />
          )}

          {activePage === "Settings" && (
            <EmptyFeature
              icon={Settings}
              title="Settings"
              description="Account preferences, password management, and security settings will be configured here."
            />
          )}
          {shareFile && (
  <div className="share-modal-backdrop">
    <div className="share-modal">
      <div className="share-modal-header">
        <div>
          <h2>Share File</h2>
          <p>Share your file securely with others.</p>
        </div>

        <button
          className="icon-button"
          type="button"
          onClick={() => setShareFile(null)}
        >
          <X size={19} />
        </button>
      </div>

      <div className="share-file-info">
        <FileText size={22} />
        <div>
          <strong>{shareFile.name}</strong>
          <small>{shareFile.size}</small>
        </div>
      </div>

      <form onSubmit={createShare}>
        <label>
          Recipient Email
          <input
            type="email"
            placeholder="Enter recipient email"
            value={shareEmail}
            onChange={(e) => setShareEmail(e.target.value)}
            required
          />
        </label>

        <label>
  Permission
  <select
    value={sharePermission}
    onChange={(e) => setSharePermission(e.target.value)}
  >
    <option value="view">View</option>
    <option value="download">Download</option>
  </select>
</label>

        <label>
          Link Expiration
          <select
            value={shareExpiry}
            onChange={(e) => setShareExpiry(e.target.value)}
          >
            <option value="1">1 Hour</option>
            <option value="24">24 Hours</option>
            <option value="72">3 Days</option>
            <option value="168">7 Days</option>
          </select>
        </label>

        <div className="share-modal-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => setShareFile(null)}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="primary-button"
            disabled={sharing}
          >
            <Share2 size={16} />
            {sharing ? "Sharing..." : "Share File"}
          </button>
        </div>
      </form>
      {createdShare && (
  <div className="created-share-section">
    <h3>Share Link Created Successfully!</h3>

    <p>Share ID: {createdShare.shareId}</p>

    <label>Generated Share Link</label>

    <input
      type="text"
      value={createdShare.link}
      readOnly
    />

    <button
      type="button"
      className="primary-button"
      onClick={copyShareLink}
    >
      <Copy size={16} />
      Copy Link
    </button>

    <p>
      Expires at: {new Date(createdShare.expiresAt).toLocaleString()}
    </p>
  </div>
)}

    </div>
  </div>
)}
        </main>

        <footer className="app-footer">
          <span>© 2026 TrustShare</span>
          <span><LockKeyhole size={13} /> Secure file management workspace</span>
        </footer>
      </div>
    </div>
  );
}


function SecurityPage({ token }) {
  const [filter, setFilter] = useState("All events");
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openingShareId, setOpeningShareId] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewName, setPreviewName] = useState("");

  useEffect(() => {
    async function fetchSecurityEvents() {
      if (!token) {
        setError("Admin authentication token is missing.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          `${API_URL}/admin/security/events?limit=100`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.detail || "Unable to load security events"
          );
        }

        setEvents(data.events || []);
      } catch (err) {
        setError(err.message || "Failed to load security events.");
      } finally {
        setLoading(false);
      }
    }

    fetchSecurityEvents();
  }, [token]);

  const successfulEvents = events.filter(
    (event) => event.event_type === "LOGIN_SUCCESS"
  );

  const failedEvents = events.filter(
    (event) =>
      event.event_type === "LOGIN_FAILED" ||
      event.event_type === "AUTH_FAILED"
  );

  const blockedTypes = [
    "ADMIN_ACCESS_DENIED",
    "FILE_SHARE_ACCESS_DENIED",
    "FILE_DOWNLOAD_DENIED",
  ];

  const blockedEvents = events.filter(
    (event) => blockedTypes.includes(event.event_type)
  );

  const totalLogins =
    successfulEvents.length + failedEvents.length;

  const filtered = events.filter((event) => {
    if (filter === "All events") return true;

    if (filter === "Successful") {
      return event.event_type === "LOGIN_SUCCESS";
    }

    if (filter === "Failed") {
      return (
        event.event_type === "LOGIN_FAILED" ||
        event.event_type === "AUTH_FAILED"
      );
    }

    if (filter === "Blocked") {
      return blockedTypes.includes(event.event_type);
    }

    return true;
  });

  function getEventStatus(eventType) {
    if (eventType === "LOGIN_SUCCESS") return "Success";

    if (
      eventType === "LOGIN_FAILED" ||
      eventType === "AUTH_FAILED"
    ) {
      return "Failed";
    }

    if (blockedTypes.includes(eventType)) return "Blocked";

    return "Monitor";
  }

  function formatEventName(eventType) {
    return eventType
      .replaceAll("_", " ")
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function formatEventTime(dateValue) {
    if (!dateValue) return "N/A";

    return new Date(dateValue).toLocaleString();
  }

  return (
    <>
      <SectionHeading
        title="Security Dashboard"
        subtitle="Monitor real login activity, access attempts, and security events."
      >
        <button
          className="secondary-button"
          onClick={() => window.location.reload()}
        >
          <Activity size={16} /> Refresh
        </button>
      </SectionHeading>

      <div className="security-banner">
        <div className="security-banner-icon">
          <ShieldCheck size={25} />
        </div>

        <div>
          <h3>Live security monitoring</h3>
          <p>
            Security events are loaded from your TrustShare FastAPI backend.
          </p>
        </div>

        <span className="status-pill status-green">
          <span /> Live API
        </span>
      </div>

      {error && (
        <div className="security-banner">
          <p>{error}</p>
        </div>
      )}

      <div className="stats-grid">
        <StatCard
          title="Total Logins"
          value={loading ? "..." : totalLogins}
          change="Live"
          detail="loaded events"
          icon={Users}
          color="blue"
        />

        <StatCard
          title="Successful Logins"
          value={loading ? "..." : successfulEvents.length}
          change="Live"
          detail="successful"
          icon={CheckCircle2}
          color="green"
        />

        <StatCard
          title="Failed Logins"
          value={loading ? "..." : failedEvents.length}
          change="Live"
          detail="failed authentication"
          icon={CircleAlert}
          color="orange"
        />

        <StatCard
          title="Blocked Attempts"
          value={loading ? "..." : blockedEvents.length}
          change="Live"
          detail="denied requests"
          icon={ShieldAlert}
          color="purple"
        />
      </div>

      <div className="dashboard-grid">
        <article className="panel security-events-panel">
          <div className="panel-heading">
            <div>
              <h3>Security Event Summary</h3>
              <p>Distribution of loaded security events</p>
            </div>
          </div>

          <div className="event-list">
            <div>
              <span className="event-indicator green-indicator" />
              <span>Successful logins</span>
              <strong>{successfulEvents.length}</strong>
            </div>

            <div>
              <span className="event-indicator orange-indicator" />
              <span>Failed authentication</span>
              <strong>{failedEvents.length}</strong>
            </div>

            <div>
              <span className="event-indicator red-indicator" />
              <span>Blocked attempts</span>
              <strong>{blockedEvents.length}</strong>
            </div>

            <div>
              <span className="event-indicator blue-indicator" />
              <span>Other security events</span>
              <strong>
                {events.length -
                  successfulEvents.length -
                  failedEvents.length -
                  blockedEvents.length}
              </strong>
            </div>
          </div>
        </article>

        <article className="panel security-events-panel">
          <div className="panel-heading">
            <div>
              <h3>Security Controls</h3>
              <p>Backend security features</p>
            </div>
          </div>

          <div className="control-list">
            <div>
              <ShieldCheck size={18} />
              <span>JWT authentication</span>
              <span className="status-pill status-neutral">Backend</span>
            </div>

            <div>
              <LockKeyhole size={18} />
              <span>AES-256-GCM encryption</span>
              <span className="status-pill status-neutral">Backend</span>
            </div>

            <div>
              <Link2 size={18} />
              <span>Expiring share links</span>
              <span className="status-pill status-neutral">Backend</span>
            </div>

            <div>
              <Activity size={18} />
              <span>Audit log recording</span>
              <span className="status-pill status-neutral">Backend</span>
            </div>
          </div>
        </article>
      </div>

      <article className="panel recent-panel">
        <div className="panel-heading">
          <div>
            <h3>Recent Login & Security Events</h3>
            <p>
              Actual records returned by the backend (maximum 100).
            </p>
          </div>

          <select
            className="filter-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option>All events</option>
            <option>Successful</option>
            <option>Failed</option>
            <option>Blocked</option>
          </select>
        </div>

        <div className="table-scroll">
          <table className="file-table">
            <thead>
              <tr>
                <th>User / Account</th>
                <th>Event</th>
                <th>Time</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="4">Loading security events...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="4">No security events found.</td>
                </tr>
              ) : (
                filtered.map((event) => {
                  const status = getEventStatus(event.event_type);

                  return (
                    <tr key={event.id}>
                      <td>
                        <strong>
                          {event.actor_email || "Unknown account"}
                        </strong>
                      </td>

                      <td>
                        {formatEventName(event.event_type)}
                        {event.details && (
                          <div>{event.details}</div>
                        )}
                      </td>

                      <td>{formatEventTime(event.created_at)}</td>

                      <td>
                        <span
                          className={`status-pill ${
                            status === "Success"
                              ? "status-green"
                              : status === "Failed"
                                ? "status-red"
                                : status === "Blocked"
                                  ? "status-orange"
                                  : "status-neutral"
                          }`}
                        >
                          {status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </article>
    </>
  );
}


function ActivityPage() {
  return (
    <>
      <SectionHeading
        title="Activity Logs"
        subtitle="Review example account and file activity."
      />
      <article className="panel recent-panel">
        <div className="panel-heading">
          <div>
            <h3>Recent Activity</h3>
            <p>Example events; live records require a backend API.</p>
          </div>
        </div>
        <div className="timeline">
          <div><span className="timeline-icon green"><Upload size={17} /></span><div><strong>File upload</strong><p>Project_Report.pdf was added to the demo workspace.</p><small>Today · Recent</small></div></div>
          <div><span className="timeline-icon blue"><UserRound size={17} /></span><div><strong>Account login</strong><p>A sample login event is displayed in the interface.</p><small>Today · Recent</small></div></div>
          <div><span className="timeline-icon purple"><Share2 size={17} /></span><div><strong>Sharing workflow</strong><p>Connect the share API to record actual sharing activity.</p><small>Today · Recent</small></div></div>
        </div>
      </article>
    </>
  );
}

function EmptyFeature({ icon: Icon, title, description }) {
  return (
    <>
      <SectionHeading title={title} subtitle={description} />
      <article className="panel empty-feature">
        <div className="empty-feature-icon"><Icon size={30} /></div>
        <h3>{title}</h3>
        <p>{description}</p>
        <span className="status-pill status-neutral">Backend integration required</span>
      </article>
    </>
  );
}

function AuditLogsPage({ token }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activityType, setActivityType] = useState("");
  const [status, setStatus] = useState("");
  const [userId, setUserId] = useState("");
  const [fileId, setFileId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  async function loadAuditLogs() {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();

params.append("limit", "100");

if (activityType) params.append("activity_type", activityType);
if (status) params.append("status", status);
if (userId) params.append("user_id", userId);
if (fileId) params.append("file_id", fileId);
if (startDate) params.append("start_date", startDate);
if (endDate) params.append("end_date", endDate);

const response = await fetch(
  `"+API_URL+"audit-logs/filter?${params.toString()}`,
  {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }
);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to load audit logs");
      }

      setEvents(data.audit_logs || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
  loadAuditLogs();
}, [token, activityType, status, userId, fileId, startDate, endDate]);

  return (
    <div>
      <SectionHeading
        title="Audit Logs"
        subtitle="Monitor and review actual TrustShare system activities."
      />
      <div className="panel recent-panel">
  <h3>Filter Audit Logs</h3>

  <div className="toolbar">
    <select
      value={activityType}
      onChange={(e) => setActivityType(e.target.value)}
    >
      <option value="">All Activity Types</option>
      <option value="LOGIN">LOGIN</option>
      <option value="UPLOAD">UPLOAD</option>
      <option value="DOWNLOAD">DOWNLOAD</option>
      <option value="SHARE">SHARE</option>
      <option value="FILE_ACCESS">FILE_ACCESS</option>
      <option value="SHARE_REVOKED">SHARE_REVOKED</option>
    </select>

    <select
      value={status}
      onChange={(e) => setStatus(e.target.value)}
    >
      <option value="">All Statuses</option>
      <option value="SUCCESS">SUCCESS</option>
      <option value="FAILED">FAILED</option>
    </select>

    <input
      type="number"
      placeholder="User ID"
      value={userId}
      onChange={(e) => setUserId(e.target.value)}
    />

    <input
      type="number"
      placeholder="File ID"
      value={fileId}
      onChange={(e) => setFileId(e.target.value)}
    />

    <input
      type="date"
      value={startDate}
      onChange={(e) => setStartDate(e.target.value)}
    />

    <input
      type="date"
      value={endDate}
      onChange={(e) => setEndDate(e.target.value)}
    />
  </div>

  <button
    className="secondary-button"
    onClick={() => {
      setActivityType("");
      setStatus("");
      setUserId("");
      setFileId("");
      setStartDate("");
      setEndDate("");
    }}
  >
    Clear Filters
  </button>
</div>
      <div className="panel recent-panel">
        <div className="panel-heading">
          <div>
            <h3>System Audit History</h3>
            <p>Latest records from the TrustShare backend (maximum 100).</p>
          </div>

          <button className="primary-button" onClick={loadAuditLogs}>
            Refresh
          </button>
        </div>

        {loading && <p>Loading audit logs...</p>}

        {error && <p className="error-text">{error}</p>}

        {!loading && !error && (
          <div className="table-scroll">
            <table className="file-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>User / Account</th>
                  <th>Event Type</th>
                  <th>Details</th>
                  <th>Date & Time</th>
                </tr>
              </thead>

              <tbody>
                {events.map((event) => (
                  <tr key={event.log_id}>
                     <td>{event.log_id}</td>
                    <td><strong>{event.username || "Unknown account"}</strong></td>
                    <td>{event.activity_type}</td>
                    <td>{event.description ||  "-"}</td>
                    <td>
                      {event.created_at
                        ? new
                      Date(event.created_at).toLocaleString()
                        : "-"}
                    </td>
                  </tr>
                ))}

                {events.length === 0 && (
                  <tr>
                    <td colSpan="5">No audit records found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- ADMIN USER MANAGEMENT ----------------

function UserManagementPage({ token }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");

  async function loadUsers() {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();

params.append("limit", "100");

if (activityType) params.append("activity_type", activityType);
if (status) params.append("status", status);
if (userId) params.append("user_id", userId);
if (fileId) params.append("file_id", fileId);
if (startDate) params.append("start_date", startDate);
if (endDate) params.append("end_date", endDate);

const response = await fetch(
  `"+API_URL+"audit-logs/filter?${params.toString()}`,
  {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }
);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to load users");
      }

      setUsers(data.users || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, [token]);

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      user.email?.toLowerCase().includes(search.toLowerCase());

    const matchesRole =
      roleFilter === "All" ||
      user.role?.toLowerCase() === roleFilter.toLowerCase();

    return matchesSearch && matchesRole;
  });

  return (
    <div>
      <SectionHeading
        title="User Management"
        subtitle="View and monitor registered TrustShare accounts."
      />

      <div className="stats-grid">
        <StatCard
          title="Total Users"
          value={users.length}
          detail="Registered accounts"
          icon={Users}
          color="blue"
        />

        <StatCard
          title="Standard Users"
          value={users.filter((u) => u.role === "user").length}
          detail="Regular accounts"
          icon={Users}
          color="green"
        />

        <StatCard
          title="Admin Users"
          value={users.filter((u) => u.role === "admin").length}
          detail="Administrator accounts"
          icon={ShieldCheck}
          color="purple"
        />
      </div>

      <div className="panel recent-panel">
        <div className="panel-heading">
          <div>
            <h3>Registered Users</h3>
            <p>Live records retrieved from PostgreSQL.</p>
          </div>

          <button className="primary-button" onClick={loadUsers}>
            Refresh
          </button>
        </div>

        <div className="toolbar">
          <input
            type="text"
            placeholder="Search name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="All">All Roles</option>
            <option value="user">Standard User</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        {loading && <p>Loading registered users...</p>}

        {error && <p className="error-text">{error}</p>}

        {!loading && !error && (
          <div className="table-scroll">
            <table className="file-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Full Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Registered Date</th>
                </tr>
              </thead>

              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td>{user.id}</td>
                    <td><strong>{user.full_name}</strong></td>
                    <td>{user.email}</td>
                    <td>{user.role}</td>
                    <td>
                      {user.created_at
                        ? new Date(user.created_at).toLocaleDateString()
                        : "-"}
                    </td>
                  </tr>
                ))}

                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan="5">No users found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
function AdminSharingReportsPage({ token }) {
  const [reports, setReports] = useState([]);
  const [stats, setStats] = useState({
    total_shares: 0,
    active_shares: 0,
    expired_shares: 0,
    revoked_shares: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    async function loadReports() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          `${API_URL}/admin/sharing-reports`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("Unable to load sharing reports");
        }

        const data = await response.json();

        setStats({
          total_shares: data.total_shares ?? 0,
          active_shares: data.active_shares ?? 0,
          expired_shares: data.expired_shares ?? 0,
          revoked_shares: data.revoked_shares ?? 0,
        });

        setReports(data.shares ?? []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadReports();
  }, [token, refreshKey]);

  const filteredReports = reports.filter((share) => {
    const searchText = search.toLowerCase();

    const matchesSearch =
      String(share.share_id).includes(searchText) ||
      (share.file_name || "").toLowerCase().includes(searchText) ||
      (share.owner_email || "").toLowerCase().includes(searchText) ||
      (share.recipient_email || "").toLowerCase().includes(searchText);

    const matchesStatus =
      statusFilter === "All" || share.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const cardStyle = {
    background: "var(--card-bg, #ffffff)",
    border: "1px solid var(--border-color, #e5e7eb)",
    borderRadius: "12px",
    padding: "20px",
    flex: "1 1 180px",
    minWidth: "150px",
  };

  const headingStyle = {
    fontSize: "13px",
    color: "var(--text-secondary, #6b7280)",
    marginBottom: "10px",
  };

  const valueStyle = {
    fontSize: "26px",
    fontWeight: "700",
    color: "var(--text-primary, #111827)",
  };

  const formatDate = (date) => {
    if (!date) return "—";

    return new Date(date).toLocaleString();
  };

  return (
    <div style={{ padding: "24px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "24px",
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Sharing Reports</h2>
          <p style={{ color: "#6b7280", marginTop: "6px" }}>
            Monitor all file-sharing activities across TrustShare.
          </p>
        </div>

        <button
          onClick={() => setRefreshKey((value) => value + 1)}
          style={{
            padding: "10px 18px",
            borderRadius: "8px",
            border: "1px solid #d1d5db",
            cursor: "pointer",
          }}
        >
          ↻ Refresh
        </button>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <div style={cardStyle}>
          <div style={headingStyle}>Total Shares</div>
          <div style={valueStyle}>{stats.total_shares}</div>
        </div>

        <div style={cardStyle}>
          <div style={headingStyle}>Active Shares</div>
          <div style={{ ...valueStyle, color: "#16a34a" }}>
            {stats.active_shares}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={headingStyle}>Expired Shares</div>
          <div style={{ ...valueStyle, color: "#d97706" }}>
            {stats.expired_shares}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={headingStyle}>Revoked Shares</div>
          <div style={{ ...valueStyle, color: "#dc2626" }}>
            {stats.revoked_shares}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "18px",
        }}
      >
        <input
          type="text"
          placeholder="Search file, owner, recipient or share ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: "11px",
            border: "1px solid #d1d5db",
            borderRadius: "8px",
            flex: "1 1 250px",
          }}
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: "11px",
            border: "1px solid #d1d5db",
            borderRadius: "8px",
          }}
        >
          <option value="All">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Expired">Expired</option>
          <option value="Revoked">Revoked</option>
        </select>
      </div>

      {loading ? (
        <p>Loading sharing reports...</p>
      ) : error ? (
        <p style={{ color: "#dc2626" }}>{error}</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "13px",
              minWidth: "1100px",
            }}
          >
            <thead>
              <tr style={{ background: "#f3f4f6", textAlign: "left" }}>
                {[
                  "Share ID",
                  "File Name",
                  "Owner",
                  "Recipient",
                  "Permission",
                  "Created At",
                  "Expires At",
                  "Status",
                ].map((heading) => (
                  <th
                    key={heading}
                    style={{
                      padding: "13px",
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filteredReports.length === 0 ? (
                <tr>
                  <td
                    colSpan="8"
                    style={{ padding: "24px", textAlign: "center" }}
                  >
                    No sharing records found.
                  </td>
                </tr>
              ) : (
                filteredReports.map((share) => (
                  <tr key={share.share_id}>
                    <td style={{ padding: "13px", borderBottom: "1px solid #e5e7eb" }}>
                      #{share.share_id}
                    </td>

                    <td style={{ padding: "13px", borderBottom: "1px solid #e5e7eb" }}>
                      {share.file_name}
                    </td>

                    <td style={{ padding: "13px", borderBottom: "1px solid #e5e7eb" }}>
                      <div>{share.owner_name}</div>
                      <small>{share.owner_email}</small>
                    </td>

                    <td style={{ padding: "13px", borderBottom: "1px solid #e5e7eb" }}>
                      {share.recipient_email || "Anyone with link"}
                    </td>

                    <td style={{ padding: "13px", borderBottom: "1px solid #e5e7eb" }}>
                      {share.permission}
                    </td>

                    <td style={{ padding: "13px", borderBottom: "1px solid #e5e7eb" }}>
                      {formatDate(share.created_at)}
                    </td>

                    <td style={{ padding: "13px", borderBottom: "1px solid #e5e7eb" }}>
                      {formatDate(share.expires_at)}
                    </td>

                    <td style={{ padding: "13px", borderBottom: "1px solid #e5e7eb" }}>
                      <span
                        style={{
                          padding: "5px 9px",
                          borderRadius: "20px",
                          fontWeight: "600",
                          background:
                            share.status === "Active"
                              ? "#dcfce7"
                              : share.status === "Expired"
                              ? "#fef3c7"
                              : "#fee2e2",
                          color:
                            share.status === "Active"
                              ? "#15803d"
                              : share.status === "Expired"
                              ? "#b45309"
                              : "#b91c1c",
                        }}
                      >
                        {share.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && (
        <p style={{ color: "#6b7280", marginTop: "14px" }}>
          Showing {filteredReports.length} of {reports.length} sharing records.
        </p>
      )}
    </div>
  );
}

function AdminUserManagementPage({ token }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadUsers() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(`${API_URL}/admin/users`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to load users");
      }

      setUsers(data.users || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, [token]);

  return (
    <div>
      <SectionHeading
        title="User Management"
        subtitle="Monitor all registered TrustShare users."
      />

      <div className="stat-grid">
        <div className="stat-card">
          <span>Total Users</span>
          <h2>{users.length}</h2>
        </div>
      </div>

      <div className="content-card">
        <h3>All Registered Users</h3>

        {loading ? (
          <p>Loading users...</p>
        ) : error ? (
          <p>{error}</p>
        ) : users.length === 0 ? (
          <p>No users found.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Full Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Created At</th>
              </tr>
            </thead>

            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.id}</td>
                  <td>{user.full_name}</td>
                  <td>{user.email}</td>
                  <td>{user.role}</td>
                  <td>
                    {user.created_at
                      ? new Date(user.created_at).toLocaleString()
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
// ---------------- ADMIN FILE MANAGEMENT ----------------

function AdminFileManagementPage({ token }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  async function loadFiles() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `${API_URL}/admin/files`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to load files");
      }

      setFiles(data.files || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFiles();
  }, [token]);

  const filteredFiles = files.filter((file) => {
    const query = search.toLowerCase();

    return (
      file.original_name?.toLowerCase().includes(query) ||
      file.owner_name?.toLowerCase().includes(query) ||
      file.owner_email?.toLowerCase().includes(query)
    );
  });

  function formatFileSize(bytes) {
    if (!bytes) return "0 Bytes";

    if (bytes < 1024) return `${bytes} Bytes`;

    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(2)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  return (
    <div>
      <SectionHeading
        title="File Management"
        subtitle="Monitor all files uploaded by TrustShare users."
      />

      <div className="stats-grid">
        <StatCard
          title="Total Files"
          value={files.length}
          detail="All registered files"
          icon={FileText}
          color="blue"
        />

        <StatCard
          title="PDF Files"
          value={files.filter((f) => f.content_type === "application/pdf").length}
          detail="PDF documents"
          icon={FileText}
          color="green"
        />

        <StatCard
          title="Other Files"
          value={files.filter((f) => f.content_type !== "application/pdf").length}
          detail="Images and other formats"
          icon={FolderOpen}
          color="purple"
        />
      </div>

      <div className="panel recent-panel">
        <div className="panel-heading">
          <div>
            <h3>All Uploaded Files</h3>
            <p>Live records retrieved from PostgreSQL.</p>
          </div>

          <button className="primary-button" onClick={loadFiles}>
            Refresh
          </button>
        </div>

        <div className="toolbar">
          <input
            type="text"
            placeholder="Search file name or owner..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading && <p>Loading files...</p>}

        {error && <p className="error-text">{error}</p>}

        {!loading && !error && (
          <div className="table-scroll">
            <table className="file-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>File Name</th>
                  <th>Owner</th>
                  <th>Email</th>
                  <th>Size</th>
                  <th>File Type</th>
                  <th>Uploaded Date</th>
                </tr>
              </thead>

              <tbody>
                {filteredFiles.map((file) => (
                  <tr key={file.id}>
                    <td>{file.id}</td>
                    <td><strong>{file.original_name}</strong></td>
                    <td>{file.owner_name}</td>
                    <td>{file.owner_email}</td>
                    <td>{formatFileSize(file.file_size)}</td>
                    <td>{file.content_type}</td>
                    <td>
                      {file.created_at
                        ? new Date(file.created_at).toLocaleDateString()
                        : "-"}
                    </td>
                  </tr>
                ))}

                {filteredFiles.length === 0 && (
                  <tr>
                    <td colSpan="7">No files found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AnalyticsBarChart({ title, subtitle, items = [] }) {
  const maxCount = Math.max(
    ...items.map((item) => Number(item.count) || 0),
    1
  );

  return (
    <article className="panel chart-panel">
      <div className="panel-heading">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
      </div>

      <div className="bar-chart" aria-label={title}>
        {items.map((item, index) => {
          const count = Number(item.count) || 0;
          const height = Math.max((count / maxCount) * 100, 3);

          return (
            <div className="bar-column" key={item.date}>
              <div
                className={`bar ${index % 4 === 0 ? "bar-secondary" : ""}`}
                style={{ height: `${height}%` }}
                title={`${item.date}: ${count}`}
              />
            </div>
          );
        })}
      </div>

      <div className="chart-labels">
        {items.map((item) => (
          <span key={item.date}>
            {new Date(`${item.date}T12:00:00`).toLocaleDateString(
              "en-IN",
              { day: "2-digit", month: "short" }
            )}
          </span>
        ))}
      </div>
    </article>
  );
}
function StoragePieChart({ items = [] }) {
  const total = items.reduce(
    (sum, item) => sum + Number(item.total_files || 0),
    0
  );

  let current = 0;

  const colors = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"];

  const gradient = items.map((item, index) => {
    const percentage = total
      ? (Number(item.total_files || 0) / total) * 100
      : 0;

    const start = current;
    current += percentage;

    return `${colors[index % colors.length]} ${start}% ${current}%`;
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-lg font-semibold mb-4">
        File Type Distribution
      </h3>

      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div
          style={{
            width: "180px",
            height: "180px",
            borderRadius: "50%",
            background: total
              ? `conic-gradient(${gradient.join(", ")})`
              : "#e5e7eb",
          }}
        />

        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={item.file_type} className="flex items-center gap-2">
              <span
                style={{
                  width: "12px",
                  height: "12px",
                  backgroundColor: colors[index % colors.length],
                  display: "inline-block",
                  borderRadius: "3px",
                }}
              />
              <span>
                {item.file_type} – {item.total_files} files
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function StorageUserBarChart({ items = [] }) {
  const maxStorage = Math.max(
    ...items.map((user) => Number(user.storage_used_mb) || 0),
    0.01
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-lg font-semibold mb-4">
        User-wise Storage Usage
      </h3>

      <div className="space-y-4">
        {items.map((user) => {
          const storage = Number(user.storage_used_mb) || 0;
          const width = (storage / maxStorage) * 100;

          return (
            <div key={user.user_id}>
              <div className="flex justify-between gap-3 mb-1">
                <span className="text-sm font-medium">
                  {user.full_name}
                </span>
                <span className="text-sm">
                  {storage} MB
                </span>
              </div>

              <div className="w-full bg-gray-100 rounded-full h-3">
                <div
                  className="bg-blue-500 rounded-full h-3"
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AdminAnalyticsPage({ token, title = "Admin Analytics" }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    let cancelled = false;

    async function fetchAnalytics() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `${API_URL}/admin/dashboard/stats`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || "Unable to load analytics");
        }

        if (!cancelled) {
          setStats(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (token) {
      fetchAnalytics();
    } else {
      setError("Admin authentication token is missing.");
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [token, refreshKey]);

  const storageValue = stats
    ? stats.storage_used_mb >= 1024
      ? `${(stats.storage_used_mb / 1024).toFixed(2)} GB`
      : `${Number(stats.storage_used_mb).toFixed(2)} MB`
    : "Loading...";

  return (
    <>
      <SectionHeading
        title={title}
        subtitle="Live platform statistics and activity reports."
      >
        <button
          className="secondary-button"
          onClick={() => setRefreshKey((prev) => prev + 1)}
          disabled={loading}
        >
          <RefreshCw size={16} />
          {loading ? "Loading..." : "Refresh"}
        </button>
      </SectionHeading>

      {error && (
        <div className="notice error-notice">
          {error}
        </div>
      )}

      <div className="stats-grid">
        <StatCard
          title="Registered Users"
          value={loading ? "..." : stats?.total_users ?? 0}
          change="Live"
          detail="All registered accounts"
          icon={Users}
          color="blue"
        />

        <StatCard
          title="Total Files"
          value={loading ? "..." : stats?.total_files ?? 0}
          change="Live"
          detail="Uploaded files"
          icon={FileText}
          color="green"
        />

        <StatCard
          title="Total Shares"
          value={loading ? "..." : stats?.total_shares ?? 0}
          change="Live"
          detail="Created shares"
          icon={Share2}
          color="purple"
        />

        <StatCard
          title="Storage Used"
          value={storageValue}
          change="Live"
          detail="Across all users"
          icon={HardDrive}
          color="orange"
        />

        <StatCard
          title="Security Events"
          value={loading ? "..." : stats?.total_security_events ?? 0}
          change="Live"
          detail="All recorded events"
          icon={ShieldCheck}
          color="blue"
        />
      </div>

      <SectionHeading
        title="Activity Reports"
        subtitle="Daily activity for the last 7 days."
      />

      {stats && (
        <div className="dashboard-grid">
          <AnalyticsBarChart
            title="User Growth"
            subtitle="New user registrations"
            items={stats.daily_user_growth}
          />

          <AnalyticsBarChart
            title="File Uploads"
            subtitle="Daily uploaded files"
            items={stats.daily_file_uploads}
          />

          <AnalyticsBarChart
            title="Sharing Activity"
            subtitle="Daily shares created"
            items={stats.daily_sharing_activity}
          />

          <AnalyticsBarChart
            title="Security Activity"
            subtitle="Daily recorded security events"
            items={stats.daily_security_activity}
          />
        </div>
      )}
            {title === "Admin Dashboard" && (
        <AdminRecentSecurityEvents token={token} />
      )}

    </>
  );
}


function SuspiciousActivityPage({ token }) {
  const [activities, setActivities] = useState([]);
  const [severity, setSeverity] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function fetchSuspiciousActivities() {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();

      if (severity) {
        params.append("severity", severity);
      }

      const response = await fetch(
        `"+API_URL+"admin/suspicious-activity?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Unable to load suspicious activities"
        );
      }

      setActivities(data.activities || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) {
      fetchSuspiciousActivities();
    } else {
      setError("Admin authentication token is missing.");
    }
  }, [token, severity]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">
          Suspicious Activity Detection
        </h2>
        <p className="text-gray-500 mt-1">
          Monitor failed logins, unauthorized access and suspicious downloads.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Filter by Severity
            </label>

            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="">All Severities</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>

          <button
            onClick={fetchSuspiciousActivities}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="notice error-notice">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-lg font-semibold mb-4">
          Detected Suspicious Activities ({activities.length})
        </h3>

        {loading && <p>Loading suspicious activities...</p>}

        {!loading && !error && activities.length === 0 && (
          <p className="text-gray-500">
            No suspicious activities detected in the selected period.
          </p>
        )}

        {!loading && activities.length > 0 && (
          <div className="table-scroll">
            <table className="file-table">
              <thead>
                <tr>
                  <th>User Email</th>
                  <th>Event Type</th>
                  <th>Severity</th>
                  <th>Description</th>
                  <th>Attempts</th>
                  <th>First Seen</th>
                  <th>Last Seen</th>
                </tr>
              </thead>

              <tbody>
                {activities.map((item, index) => (
                  <tr key={`${item.event_type}-${item.actor_email}-${index}`}>
                    <td>{item.actor_email || "Unknown"}</td>
                    <td>{item.event_type}</td>
                    <td>
                      <span
                        className={
                          item.severity === "High"
                            ? "text-red-600 font-semibold"
                            : item.severity === "Medium"
                            ? "text-orange-600 font-semibold"
                            : "text-green-600 font-semibold"
                        }
                      >
                        {item.severity}
                      </span>
                    </td>
                    <td>{item.description}</td>
                    <td>{item.total_attempts}</td>
                    <td>
                      {item.first_seen
                        ? new Date(item.first_seen).toLocaleString()
                        : "-"}
                    </td>
                    <td>
                      {item.last_seen
                        ? new Date(item.last_seen).toLocaleString()
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


function AdminReportsPage({ token }) {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  async function fetchReports() {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();

      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);

      const response = await fetch(
        `"+API_URL+"admin/reports?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Unable to load reports");
      }

      setReportData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) {
      fetchReports();
    } else {
      setError("Admin authentication token is missing.");
    }
  }, [token]);

  const reportCards = [
    { title: "Total Uploads", value: reportData?.total_uploads ?? 0 },
    { title: "Total Downloads", value: reportData?.total_downloads ?? 0 },
    { title: "Total Users", value: reportData?.total_users ?? 0 },
    { title: "Total Shares", value: reportData?.total_shares ?? 0 },
    {
      title: "Security Events",
      value: reportData?.total_security_events ?? 0,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Reports</h2>
        <p className="text-gray-500 mt-1">
          Monitor uploads, downloads, users, sharing and security reports.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-lg font-semibold mb-4">Filter Reports</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={fetchReports}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {loading ? "Loading..." : "Apply Filter"}
            </button>

            <button
              onClick={() => {
                setStartDate("");
                setEndDate("");
                setTimeout(() => {
                  fetchReports();
                }, 0);
              }}
              className="border border-gray-300 px-4 py-2 rounded-lg"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="notice error-notice">{error}</div>
      )}

      {loading && <p>Loading reports...</p>}

      {!loading && !error && reportData && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {reportCards.map((item) => (
              <div
                key={item.title}
                className="bg-white rounded-xl border border-gray-200 p-5"
              >
                <p className="text-sm text-gray-500">{item.title}</p>
                <h3 className="text-2xl font-bold mt-2">
                  {item.value.toLocaleString("en-IN")}
                </h3>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-lg font-semibold mb-4">
              Report Summary
            </h3>

            <div className="table-scroll">
              <table className="file-table">
                <thead>
                  <tr>
                    <th>Report Type</th>
                    <th>Total Records</th>
                  </tr>
                </thead>
                <tbody>
                  {reportCards.map((item) => (
                    <tr key={item.title}>
                      <td>{item.title}</td>
                      <td>{item.value.toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="dashboard-grid">
            <AnalyticsBarChart
              title="Daily Uploads"
              subtitle="Successful file uploads"
              items={reportData.daily_uploads || []}
            />

            <AnalyticsBarChart
              title="Daily Downloads"
              subtitle="Successful file downloads"
              items={reportData.daily_downloads || []}
            />

            <AnalyticsBarChart
              title="Daily User Registrations"
              subtitle="New user registrations"
              items={reportData.daily_users || []}
            />

            <AnalyticsBarChart
              title="Daily Sharing Activity"
              subtitle="Shares created"
              items={reportData.daily_shares || []}
            />

            <AnalyticsBarChart
              title="Daily Security Events"
              subtitle="Recorded security events"
              items={reportData.daily_security || []}
            />
          </div>

        </>
      )}
    </div>
  );
}

function StorageAnalyticsPage({ token }) {
  const [storageData, setStorageData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedUser, setSelectedUser] = useState("all");
  const [selectedFileType, setSelectedFileType] = useState("all");
  useEffect(() => {
    async function fetchStorageAnalytics() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          `${API_URL}/admin/dashboard/stats`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || "Unable to load storage analytics");
        }

        setStorageData(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (token) {
      fetchStorageAnalytics();
    } else {
      setError("Admin authentication token is missing.");
      setLoading(false);
    }
  }, [token]);

  if (loading) return <p>Loading storage analytics...</p>;

  if (error) {
    return <div className="notice error-notice">{error}</div>;
  }

  if (!storageData) return <p>No storage data available.</p>;
  const filteredUserStorage =
  selectedUser === "all"
    ? storageData.user_storage || []
    : (storageData.user_storage || []).filter(
        (user) => String(user.user_id) === selectedUser
      );

const filteredFileTypeStats =
  selectedFileType === "all"
    ? storageData.file_type_stats || []
    : (storageData.file_type_stats || []).filter(
        (item) => item.file_type === selectedFileType
      );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Storage Analytics</h2>
        <p className="text-gray-500 mt-1">
          Monitor total storage, user-wise usage and file type statistics.
        </p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
  <div>
    <label className="block text-sm font-medium mb-2">
      Filter by User
    </label>
    <select
      className="w-full border rounded-lg p-2"
      value={selectedUser}
      onChange={(e) => setSelectedUser(e.target.value)}
    >
      <option value="all">All Users</option>
      {filteredUserStorage.map((user) => (
        <option key={user.user_id} value={String(user.user_id)}>
          {user.full_name} ({user.email})
        </option>
      ))}
    </select>
  </div>

  <div>
    <label className="block text-sm font-medium mb-2">
      Filter by File Type
    </label>
    <select
      className="w-full border rounded-lg p-2"
      value={selectedFileType}
      onChange={(e) => setSelectedFileType(e.target.value)}
    >
      <option value="all">All File Types</option>
      {filteredFileTypeStats.map((item) => (
        <option key={item.file_type} value={item.file_type}>
          {item.file_type}
        </option>
      ))}
    </select>
  </div>
</div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Total Storage Used</p>
          <h3 className="text-2xl font-bold mt-2">
            {storageData.storage_used_mb} MB
          </h3>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Total Files</p>
          <h3 className="text-2xl font-bold mt-2">
            {storageData.total_files}
          </h3>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Registered Users</p>
          <h3 className="text-2xl font-bold mt-2">
            {storageData.total_users}
          </h3>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-lg font-semibold mb-4">User-wise Storage</h3>

        <div className="table-scroll">
          <table className="file-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Total Files</th>
                <th>Storage Used (MB)</th>
              </tr>
            </thead>
            <tbody>
              {filteredUserStorage.map((user) => (
                <tr key={user.user_id}>
                  <td>{user.full_name}</td>
                  <td>{user.email}</td>
                  <td>{user.total_files}</td>
                  <td>{user.storage_used_mb} MB</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-lg font-semibold mb-4">File Type Statistics</h3>

        <div className="table-scroll">
          <table className="file-table">
            <thead>
              <tr>
                <th>File Type</th>
                <th>Total Files</th>
                <th>Storage Used (MB)</th>
              </tr>
            </thead>
            <tbody>
              {filteredFileTypeStats.map((item) => (
                <tr key={item.file_type}>
                  <td>{item.file_type}</td>
                  <td>{item.total_files}</td>
                  <td>{item.storage_used_mb} MB</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

          <StoragePieChart items={filteredFileTypeStats} />

         <StorageUserBarChart items={filteredUserStorage} />

    </div>
  );
}



function AdminRecentSecurityEvents({ token }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activityType, setActivityType] = useState("");
  const [status, setStatus] = useState("");
  const [userId, setUserId] = useState("");
  const [fileId, setFileId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function fetchEvents() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          `${API_URL}/admin/security/events?limit=10`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || "Unable to load security events");
        }

        if (!cancelled) {
          setEvents(data.events || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (token) {
      fetchEvents();
    } else {
      setError("Admin authentication token is missing.");
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <article className="panel recent-panel">
      <div className="panel-heading">
        <div>
          <h3>Recent Security & Audit Events</h3>
          <p>Latest 10 events recorded in TrustShare.</p>
        </div>
      </div>

      {loading && <p>Loading security events...</p>}

      {error && (
        <div className="notice error-notice">{error}</div>
      )}

      {!loading && !error && (
        <div className="table-scroll">
          <table className="file-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Event Type</th>
                <th>Description</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={4}>No security events found.</td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr key={event.id}>
                    <td><strong>{event.actor_email || "System"}</strong></td>
                    <td>{event.event_type}</td>
                    <td>{event.details || "—"}</td>
                    <td>
                      {event.created_at
                        ? new Date(event.created_at).toLocaleString("en-IN")
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

function AdminSettingsPage({ token }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handlePasswordChange(e) {
    e.preventDefault();

    setMessage("");
    setError("");

    if (newPassword.length < 8) {
      setError("New password must contain at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirm password do not match.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/admin/change-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            current_password: currentPassword,
            new_password: newPassword,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Unable to change password.");
      }

      setMessage(data.message || "Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Admin Settings</h2>
        <p className="text-gray-500 mt-1">
          Manage administrator account security.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
        <h3 className="text-lg font-semibold mb-2">Change Password</h3>
        <p className="text-sm text-gray-500 mb-5">
          Choose a strong password with at least 8 characters.
        </p>

        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Current Password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              required
              minLength={8}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          {message && (
            <p className="text-sm text-green-600">{message}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg disabled:opacity-50"
          >
            {loading ? "Updating..." : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
}

function SystemMonitoringPage({ token }) {
  const [monitoring, setMonitoring] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function fetchMonitoring() {
    if (!token) {
      setError("Admin authentication token is missing.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `${API_URL}/admin/system-monitoring`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Unable to load system monitoring data."
        );
      }

      setMonitoring(data);
    } catch (err) {
      setError(err.message || "Failed to load monitoring data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchMonitoring();
  }, [token]);

  function formatUptime(seconds) {
    if (seconds === undefined || seconds === null) return "N/A";

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    return `${days}d ${hours}h ${minutes}m`;
  }

  function getUsageColor(value) {
    if (value >= 90) return "red";
    if (value >= 75) return "orange";
    return "green";
  }

  function UsageCard({ title, value, detail, icon: Icon }) {
    const percentage = Number(value || 0);

    return (
      <article className="panel">
        <div className="panel-heading">
          <div>
            <h3>{title}</h3>
            <p>{detail}</p>
          </div>
          <Icon size={22} />
        </div>

        <h2>{loading ? "..." : `${percentage.toFixed(1)}%`}</h2>

        <div
          style={{
            height: "10px",
            background: "var(--border-color, #e5e7eb)",
            borderRadius: "10px",
            overflow: "hidden",
            marginTop: "12px",
          }}
        >
          <div
            style={{
              width: `${Math.min(100, Math.max(0, percentage))}%`,
              height: "100%",
              background:
                getUsageColor(percentage) === "red"
                  ? "#ef4444"
                  : getUsageColor(percentage) === "orange"
                  ? "#f59e0b"
                  : "#22c55e",
              borderRadius: "10px",
            }}
          />
        </div>

        <p style={{ marginTop: "10px" }}>
          {loading ? "Loading..." : `${percentage.toFixed(1)}% used`}
        </p>
      </article>
    );
  }

  return (
    <>
      <SectionHeading
        title="System Monitoring"
        subtitle="Monitor live CPU, memory, disk usage and system uptime."
      >
        <button
          className="secondary-button"
          onClick={fetchMonitoring}
          disabled={loading}
        >
          <Activity size={16} />
          {loading ? "Loading..." : "Refresh"}
        </button>
      </SectionHeading>

      {error && (
        <div className="security-banner">
          <p>{error}</p>
        </div>
      )}

      {loading && !monitoring ? (
        <article className="panel">
          <p>Loading system monitoring data...</p>
        </article>
      ) : monitoring ? (
        <>
          <div className="security-banner">
            <div className="security-banner-icon">
              <Activity size={25} />
            </div>
            <div>
              <h3>Live system monitoring</h3>
              <p>System metrics loaded from your TrustShare FastAPI backend.</p>
            </div>
            <span className="status-pill status-green">Live API</span>
          </div>

          <div className="stats-grid">
            <UsageCard
              title="CPU Usage"
              value={monitoring.cpu?.usage_percent}
              detail="Processor utilization"
              icon={Activity}
            />

            <UsageCard
              title="RAM Usage"
              value={monitoring.memory?.usage_percent}
              detail={`${monitoring.memory?.used_gb ?? 0} GB used / ${monitoring.memory?.total_gb ?? 0} GB total`}
              icon={Database}
            />

            <UsageCard
              title="Disk Usage"
              value={monitoring.disk?.usage_percent}
              detail={`${monitoring.disk?.used_gb ?? 0} GB used / ${monitoring.disk?.total_gb ?? 0} GB total`}
              icon={HardDrive}
            />

            <StatCard
              title="System Uptime"
              value={formatUptime(monitoring.uptime_seconds)}
              change="Live"
              detail="Since last system restart"
              icon={Clock}
              color="blue"
            />
          </div>

          <article className="panel">
            <div className="panel-heading">
              <div>
                <h3>System Resource Details</h3>
                <p>Latest metrics reported by the server</p>
              </div>
            </div>

            <div className="event-list">
              <div>
                <span>CPU Usage</span>
                <strong>{monitoring.cpu?.usage_percent ?? "N/A"}%</strong>
              </div>
              <div>
                <span>Available RAM</span>
                <strong>{monitoring.memory?.available_gb ?? "N/A"} GB</strong>
              </div>
              <div>
                <span>Free Disk Space</span>
                <strong>{monitoring.disk?.free_gb ?? "N/A"} GB</strong>
              </div>
              <div>
                <span>Last Updated</span>
                <strong>
                  {monitoring.timestamp
                    ? new Date(monitoring.timestamp).toLocaleString()
                    : "N/A"}
                </strong>
              </div>
            </div>
          </article>
        </>
      ) : null}
    </>
  );
}

function AdminDashboard({ onLogout, email, token, activePage, setActivePage }) {
  const [filter, setFilter] = useState("All events");
  const [notifications, setNotifications] = useState([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);

    useEffect(() => {
    async function fetchNotifications() {
      if (!token) return;

      try {
        const [notificationsResponse, countResponse] = await Promise.all([
          fetch(`${API_URL}/notifications`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
          fetch(`${API_URL}/notifications/unread-count`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
        ]);

        if (!notificationsResponse.ok || !countResponse.ok) {
          throw new Error("Unable to fetch notifications");
        }

        const notificationsData = await notificationsResponse.json();
        const countData = await countResponse.json();

        setNotifications(notificationsData.notifications || []);
        setUnreadNotificationCount(countData.unread_count || 0);
      } catch (error) {
        console.error("Admin notifications error:", error);
      }
    }

    fetchNotifications();
  }, [token]);

    async function markNotificationAsRead(notificationId) {
    const selectedNotification = notifications.find(
      (item) => item.notification_id === notificationId
    );

    if (!selectedNotification || selectedNotification.is_read) return;

    try {
      const response = await fetch(
        `"+API_URL+"notifications/${notificationId}/read`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Unable to mark notification as read");
      }

      setNotifications((previous) =>
        previous.map((item) =>
          item.notification_id === notificationId
            ? { ...item, is_read: true }
            : item
        )
      );

      setUnreadNotificationCount((previous) =>
        Math.max(previous - 1, 0)
      );
    } catch (error) {
      console.error("Admin mark notification error:", error);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar admin-sidebar">
        <div className="sidebar-brand">
          <Brand />
        </div>
        <div className="workspace-label">ADMINISTRATION</div>
        <nav className="sidebar-nav">
          {adminMenu.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={`nav-item ${activePage === name ? "active" : ""}`}
              onClick={() => setActivePage(name)}
            >
              <Icon size={18} /><span>{name}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <div className="avatar admin-avatar">A</div>
            <div className="sidebar-user-copy">
              <strong>{email.split("@")[0]}</strong>
              <small>Administrator demo</small>
            </div>
            <button className="icon-button" onClick={onLogout} title="Sign out">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="global-search">
            <Search size={17} />
            <input placeholder="Search security events..." />
          </div>
          <div className="topbar-right">
            <span className="connection-status"><span /> Admin demo</span>
            <div className="notification-wrapper">
  <button
    className="icon-button notification-button"
    title="Notifications"
    onClick={() => setShowNotifications(!showNotifications)}
  >
    <Bell size={19} />
    {unreadNotificationCount > 0 && (
      <span className="notification-count">
        {unreadNotificationCount > 99
          ? "99+"
          : unreadNotificationCount}
      </span>
    )}
  </button>
</div>

{showNotifications && (
  <div className="notification-dropdown">
    <h3>Notifications</h3>

    {notifications.length === 0 ? (
      <p>No notifications yet.</p>
    ) : (
      notifications.map((item) => (
        <div
          key={item.notification_id}
          className={`notification-item ${item.is_read ? "read" : "unread"}`}
          onClick={() => markNotificationAsRead(item.notification_id)}
        >
          <strong>{item.title}</strong>
          <p>{item.message}</p>
          <small>{new Date(item.created_at).toLocaleString()}</small>
        </div>
      ))
    )}
  </div>
)}
            <div className="topbar-profile">
              <div className="avatar admin-avatar">A</div>
              <div><strong>Administrator</strong><small>Security team</small></div>
            </div>
          </div>
        </header>
        <main className="page-content">
  {activePage === "Admin Dashboard" ? (
  <AdminAnalyticsPage token={token} title="Admin Dashboard" />
) : activePage === "User Management" ? (
  <AdminUserManagementPage token={token} />
) : activePage === "File Management" ? (
  <AdminFileManagementPage token={token} />

) : activePage === "Sharing Reports" ? (
  <AdminSharingReportsPage token={token} />
) : activePage === "Security Dashboard" ? (
  <SecurityPage token={token} />
) : activePage === "Audit Logs" ? (
  <AuditLogsPage token={token} />
) : activePage === "Analytics" ? (
  <AdminAnalyticsPage token={token} />
) : activePage === "Reports" ? (
  <AdminReportsPage token={token} />
  ) : activePage === "Storage Analytics" ? (
  <StorageAnalyticsPage token={token} />
  ) : activePage === "Suspicious Activity" ? (
  <SuspiciousActivityPage token={token} />
        ) : activePage === "Settings" ? (
    <AdminSettingsPage token={token} />
  ) : activePage === "System Monitoring" ? (
  <SystemMonitoringPage token={token} />
) : (
           
   <>
              <SectionHeading
                title={activePage}
                subtitle="TrustShare administration and security monitoring."
              />
              <div className="stats-grid">
                <StatCard title="Registered Users" value="2,942" change="Demo" detail="sample data" icon={Users} color="blue" />
                <StatCard title="Files Indexed" value="12,481" change="Demo" detail="sample data" icon={FileText} color="green" />
                <StatCard title="Failed Logins" value="126" change="Review" detail="sample data" icon={ShieldAlert} color="orange" />
                <StatCard title="Security Events" value="56" change="Monitor" detail="sample data" icon={Activity} color="purple" />
              </div>
              <div className="dashboard-grid">
                <MiniBarChart title="System Activity" subtitle="Illustrative daily activity" />
                <MiniBarChart title="Login Monitoring" subtitle="Illustrative authentication activity" />
              </div>
              <article className="panel recent-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Security & Audit Events</h3>
                    <p>Sample records; connect the FastAPI audit API for live data.</p>
                  </div>
                  <select className="filter-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
                    <option>All events</option>
                    <option>Successful</option>
                    <option>Failed</option>
                    <option>Blocked</option>
                  </select>
                </div>
                <div className="table-scroll">
                  <table className="file-table">
                    <thead><tr><th>Account</th><th>Event</th><th>Time</th><th>Status</th></tr></thead>
                    <tbody>
                      {loginEvents.filter((event) => filter === "All events" || (filter === "Successful" && event.status === "Success") || (filter === "Failed" && event.status === "Failed") || (filter === "Blocked" && event.status === "Blocked")).map((event) => (
                        <tr key={event.user}>
                          <td><strong>{event.user}</strong></td><td>{event.event}</td><td>{event.time}</td>
                          <td><span className={`status-pill ${event.status === "Success" ? "status-green" : event.status === "Failed" ? "status-red" : "status-orange"}`}>{event.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>© 2026 TrustShare Admin</span>
          <span><ShieldCheck size={13} /> Administration preview</span>
        </footer>
      </div>
    </div>
  );
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [role, setRole] = useState("user");
  const [activePage, setActivePage] = useState("Dashboard");
  const [files, setFiles] = useState(initialFiles);


  

 function login(userEmail, accessToken, userRole) {
  setEmail(userEmail);
  setToken(accessToken);

  setRole(userRole === "admin" ? "admin" : "user");

  setActivePage(
    userRole === "admin" ? "Security Dashboard" : "Dashboard"
  );

  setAuthenticated(true);
}
  
function logout() {
  setAuthenticated(false);
  setEmail("");
  setToken("");
  setRole("user");
  setActivePage("Dashboard");
}
 
  if (!authenticated) {
    return <LoginPage onLogin={login} />;
  }

  if (role === "admin") {
    return (
      <AdminDashboard
        onLogout={logout}
        email={email}
        token={token}
        activePage={activePage}
        setActivePage={setActivePage}
      />
    );
  }

  return (
    <UserDashboard
      files={files}
      setFiles={setFiles}
      onLogout={logout}
      email={email}
      token={token}
      activePage={activePage}
      setActivePage={setActivePage}
    />
  );
}
