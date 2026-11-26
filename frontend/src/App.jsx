import * as TrustShareReact from "react";

import { useCallback, useEffect, useState, useRef, lazy, Suspense } from "react";
import {
  BrowserRouter,
  Link,
  Route,
  Routes,
  useNavigate,
  useLocation,
  useParams,
} from "react-router-dom";

import {
  registerUser,
  loginUser,
  saveSession,
  getCurrentUser,
  startGoogleLogin,
  startGoogleLink,
  startMicrosoftLogin,
  startMicrosoftLink,
  clearSession,
  listFiles,
  listFolders,
  createFolder,
  unlockFolder,
  renameFolder,
  deleteFolder,
  startPasswordRecovery,
  resendPasswordRecoveryCode,
  verifyPasswordRecoveryCode,
  resetPasswordWithAuthorization,
  startAccountPasswordRecovery,
  resendAccountPasswordRecoveryCode,
  verifyAccountPasswordRecoveryCode,
  resetAccountPassword,
  uploadFile,
  downloadFile,
  deleteFile,
  moveFile,
  getStorageSummary,
  listFavorites,
  addFileFavorite,
  removeFileFavorite,
  addFolderFavorite,
  removeFolderFavorite,
  shareFile,
  startGoogleGmailConnect,
  getGoogleGmailStatus,
  listSharedFiles,
  downloadSharedFile,
  previewFile,
  previewSharedFile,
  getSharedFileInfo,
  revokeFileShare,
  updateFileShare,
  listFileShares,
  getRecentUploads,
  getDashboardActivity,
  getDashboardShares,
  retryShareInvitation,
  getFolderAccess,
  grantFolderAccess,
  updateFolderAccess,
  revokeFolderAccess,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  logoutUser,
  getApiErrorMessage,
} from "./api";

import "./App.css";
import AdminDashboard from "./admindashboard";
import { FileAnalyticsPage, StoragePage, UserSecurityPage } from "./WorkspaceInsights";
import "./redesign.css";
import "./trustshare-theme.css";
import "./auth-prototype.css";
import "./site-dynamics.css";

function consumePostLoginPath(defaultPath) {
  const requestedPath = sessionStorage.getItem("trustshare_after_login");
  sessionStorage.removeItem("trustshare_after_login");
  return requestedPath && requestedPath.startsWith("/") && !requestedPath.startsWith("//")
    ? requestedPath
    : defaultPath;
}

function Brand() {
  return (
    <Link to="/" className="brand">
      <span className="brand-icon"><SvgIcon name="shield" /></span>
      <span>
        trust<span className="brand-accent">share</span>
      </span>
    </Link>
  );
}

function NotificationBell({ iconOnly = false }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notificationError, setNotificationError] = useState("");
  const [totalNotifications, setTotalNotifications] = useState(0);
  const notificationsRef = useRef(notifications);

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  const refreshNotifications = useCallback(async ({ append = false } = {}) => {
    const offset = append ? notificationsRef.current.length : 0;
    try {
      const result = await getNotifications({ limit: 10, offset });
      setNotificationError("");
      setNotifications((current) => append
        ? [...current, ...(result.notifications || [])]
        : (result.notifications || []));
      setUnreadCount(Number(result.unread_count || 0));
      setTotalNotifications(Number(result.total || 0));
    } catch (error) {
      setNotificationError(error.response?.data?.detail || "Notifications could not be loaded.");
    }
  }, []);

  useEffect(() => {
    if (!sessionStorage.getItem("trustshare_token")) return undefined;
    const refreshOnReturn = () => {
      if (document.visibilityState === "visible" && sessionStorage.getItem("trustshare_token")) {
        refreshNotifications();
      }
    };
    const initialRefresh = window.setTimeout(refreshNotifications, 0);
    window.addEventListener("focus", refreshOnReturn);
    window.addEventListener("pageshow", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      window.removeEventListener("focus", refreshOnReturn);
      window.removeEventListener("pageshow", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
      window.clearTimeout(initialRefresh);
    };
  }, [refreshNotifications]);

  async function readNotification(notification) {
    if (notification.read) return;
    try {
      await markNotificationRead(notification.notification_id);
      setNotificationError("");
      setNotifications((current) => current.map((item) => (
        item.notification_id === notification.notification_id
          ? { ...item, read: true }
          : item
      )));
      setUnreadCount((current) => Math.max(0, current - 1));
    } catch (error) {
      setNotificationError(error.response?.data?.detail || "Notification could not be marked as read.");
    }
  }

  async function readAllNotifications() {
    try {
      await markAllNotificationsRead();
      setNotificationError("");
      setNotifications((current) => current.map((item) => ({ ...item, read: true })));
      setUnreadCount(0);
    } catch (error) {
      setNotificationError(error.response?.data?.detail || "Notifications could not be marked as read.");
    }
  }

  if (!sessionStorage.getItem("trustshare_token")) return null;

  return (
    <div className="notification-bell">
      <button
        type="button"
        className={iconOnly ? "notification-button notification-bell-icon" : "text-link notification-bell-button"}
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          if (nextOpen) refreshNotifications();
        }}
        aria-expanded={open}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
      >
        {iconOnly ? <><SvgIcon name="bell" />{unreadCount > 0 && <span className="notification-count">{unreadCount}</span>}</> : <>Notifications {unreadCount > 0 && <span className="notification-count">{unreadCount}</span>}</>}
      </button>
      {open && (
        <div className="notification-popover" role="region" aria-label="Notification history">
          {notifications.some((notification) => !notification.read) && (
            <button type="button" className="notification-item notification-mark-all" onClick={readAllNotifications}>
              Mark all as read
            </button>
          )}
          {notificationError && <p className="notification-empty" role="alert">{notificationError}</p>}
          {notifications.length === 0
            ? <p className="notification-empty">No notifications.</p>
            : notifications.map((notification) => (
              <button
                type="button"
                className={`notification-item${notification.read ? "" : " is-unread"}`}
                key={notification.notification_id}
                onClick={() => readNotification(notification)}
              >
                <strong>{notification.title}</strong>
                <span>{notification.message}</span>
                <small>{notification.created_at ? new Date(notification.created_at).toLocaleString() : "Time unavailable"}</small>
              </button>
            ))}
          {notifications.length < totalNotifications && (
            <button type="button" className="notification-item" onClick={() => refreshNotifications({ append: true })}>
              Load more notifications
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Header() {
  const signedIn = Boolean(sessionStorage.getItem("trustshare_token"));

  return (
    <header className="site-header">
      <Brand />
      <nav className="main-nav">
        <Link to="/" className="nav-link">Home</Link>
        <Link to="/features" className="nav-link">Features</Link>
        <Link to="/how-it-works" className="nav-link">How It Works</Link>
        <Link to="/pricing" className="nav-link">Pricing</Link>
        <Link to="/about" className="nav-link">About</Link>
      </nav>
      <div className="header-actions">
        {signedIn ? (
          <>
            <NotificationBell />
            <Link className="text-link" to="/account">My account</Link>
          </>
        ) : (
          <>
            <Link className="text-link" to="/login">Sign in</Link>
            <Link className="button button-primary" to="/login?mode=signup">
              Get started <SvgIcon name="arrowUpRight" />
            </Link>
          </>
        )}
      </div>
    </header>
  );
}

function FilePreview({ heroScene = false }) {
  function updateSceneParallax(event) {
    const scene = event.currentTarget;
    const bounds = scene.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    scene.style.setProperty("--scene-pointer-x", `${(x * 7).toFixed(1)}px`);
    scene.style.setProperty("--scene-pointer-y", `${(y * 6).toFixed(1)}px`);
    scene.style.setProperty("--scene-parallax-x", `${x.toFixed(3)}`);
    scene.style.setProperty("--scene-parallax-y", `${y.toFixed(3)}`);
  }

  function resetSceneParallax(event) {
    event.currentTarget.style.setProperty("--scene-parallax-x", "0");
    event.currentTarget.style.setProperty("--scene-parallax-y", "0");
    event.currentTarget.style.setProperty("--scene-pointer-x", "0");
    event.currentTarget.style.setProperty("--scene-pointer-y", "0");
  }

  return (
    <div className={`preview-scene${heroScene ? " preview-scene-hero" : ""}`} onPointerMove={updateSceneParallax} onPointerLeave={resetSceneParallax}>
      <div className="scene-orbit orbit-a" />
      <div className="scene-orbit orbit-b" />

      <div className="floating-note note-top">
        <span className="note-icon"><SvgIcon name="check" /></span>
        <span>
          <strong>Protected</strong>
          <small>Your files are in safe hands</small>
        </span>
      </div>

      <div className="file-dashboard">
        {heroScene && <div className="hero-vault-core" aria-hidden="true"><span><SvgIcon name="shield" /></span></div>}
        <div className="dashboard-top">
          <div>
            <span className="eyebrow">YOUR WORKSPACE</span>
            <h3>Recent files</h3>
          </div>
          <span className="dashboard-menu"><SvgIcon name="more" /></span>
        </div>

        <div className="storage-card">
          <div className="storage-symbol"><SvgIcon name="file" /></div>
          <div>
            <strong>Project overview</strong>
            <small>Updated just now · PDF</small>
          </div>
          <span className="file-check"><SvgIcon name="check" /></span>
        </div>

        <div className="file-entry">
          <span className="file-type type-green">XLS</span>
          <span>
            <strong>Team_budget.xlsx</strong>
            <small>850 KB · Spreadsheet</small>
          </span>
          <span className="file-dots"><SvgIcon name="more" /></span>
        </div>

        <div className="file-entry">
          <span className="file-type type-orange">DOC</span>
          <span>
            <strong>Meeting_notes.docx</strong>
            <small>1.2 MB · Document</small>
          </span>
          <span className="file-dots"><SvgIcon name="more" /></span>
        </div>

        <div className="file-entry">
          <span className="file-type type-purple">IMG</span>
          <span>
            <strong>Design_preview.png</strong>
            <small>3.4 MB · Image</small>
          </span>
          <span className="file-dots"><SvgIcon name="more" /></span>
        </div>

        <div className="dashboard-bottom">
          <span className="online-dot" /> Workspace protected
          <span className="secure-label">SECURE</span>
        </div>
      </div>

      <div className="floating-note note-bottom">
        <span className="avatar-stack">
          <i>A</i><i>M</i><i>+</i>
        </span>
        <span>
          <strong>Better together</strong>
          <small>Sharing made simple</small>
        </span>
      </div>
    </div>
  );
}

const encryptionStages = ["Original file", "AES-256-GCM", "Encrypted data", "Secure storage", "Authorized access"];

function EncryptionDemo() {
  const [stage, setStage] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => setStage((current) => (current + 1) % encryptionStages.length), 3200);
    return () => window.clearInterval(timer);
  }, [playing]);

  return (
    <section className="encryption-demo" id="security" aria-labelledby="encryption-demo-title">
      <div className="visual-section-heading">
        <span className="eyebrow">A VISUAL EXPLANATION · DEMO ONLY</span>
        <h2 id="encryption-demo-title">Readable in. <span>Protected at rest.</span></h2>
        <p>Illustrative flow; this animation does not encrypt files.</p>
      </div>
      <div className={`encryption-flow encryption-step-${stage}`} aria-live="polite">
        <div className="encryption-node original-node"><div className="demo-file"><span>PDF</span><i /><i /><i /><b>Read me</b></div><small>Original file</small></div>
        <div className="encryption-link"><i /></div>
        <div className="encryption-node crypto-node"><div className="crypto-vault"><SvgIcon name="shield" /><b>AES-256-GCM</b><i className="crypto-spark" /></div><small>Encrypt</small></div>
        <div className="encryption-link"><i /></div>
        <div className="encryption-node cipher-node"><div className="cipher-blocks" aria-label="Illustrative unreadable ciphertext">{Array.from({length:12},(_,index)=><i key={index}>{["A7","3F","D2","8C","01","B9","E4","6A","F0","2D","91","C5"][index]}</i>)}</div><small>Encrypted data</small></div>
        <div className="encryption-link"><i /></div>
        <div className="encryption-node storage-node"><div className="demo-cloud"><SvgIcon name="storage" /><span>•••</span></div><small>Secure storage</small></div>
        <div className="encryption-link"><i /></div>
        <div className="encryption-node access-node"><div className="demo-user"><span>U</span><i><SvgIcon name="check" /></i></div><small>Authorized access</small></div>
      </div>
      <div className="encryption-controls">
        <div className="encryption-steps" aria-label="Encryption demonstration step">
          {encryptionStages.map((label,index)=><button key={label} type="button" className={stage===index?"active":""} aria-label={`Show ${label} step`} aria-pressed={stage===index} onClick={()=>setStage(index)}><span>{String(index+1).padStart(2,"0")}</span>{label}</button>)}
        </div>
        <div className="demo-buttons"><button type="button" onClick={()=>setPlaying((value)=>!value)}>{playing?"Pause":"Play"}</button><button type="button" onClick={()=>{setStage(0);setPlaying(true);}}>Replay</button></div>
      </div>
    </section>
  );
}

function WorkflowShowcase() {
  return (
    <section className="workflow-timeline" id="how-it-works" aria-labelledby="workflow-title">
      <div className="timeline-heading"><span>HOW IT WORKS</span><h2 id="workflow-title">A clear path from file to team.</h2></div>
      <div className="timeline-steps">
        <article className="timeline-step"><span className="timeline-number">01</span><span className="timeline-icon"><SvgIcon name="file" /></span><div><h3>Upload</h3><p>Add files to your workspace.</p></div></article>
        <span className="timeline-connector" aria-hidden="true" />
        <article className="timeline-step"><span className="timeline-number">02</span><span className="timeline-icon"><SvgIcon name="users" /></span><div><h3>Organize access</h3><p>Choose who can access them.</p></div></article>
        <span className="timeline-connector" aria-hidden="true" />
        <article className="timeline-step"><span className="timeline-number">03</span><span className="timeline-icon"><SvgIcon name="share" /></span><div><h3>Share</h3><p>Work with the right people.</p></div></article>
      </div>
    </section>
  );
}

function FeatureShowcase() {
  return (
    <section className="feature-editorial" aria-labelledby="feature-editorial-title">
      <div className="editorial-intro"><span>BUILT FOR EVERYDAY WORK</span><h2 id="feature-editorial-title">Your files, in good order.</h2><Link to="/features">Explore features <SvgIcon name="arrowUpRight" /></Link></div>
      <div className="editorial-file-list"><div><span className="editorial-icon"><SvgIcon name="shield" /></span><strong>Encrypted storage</strong><small>Protected at rest</small></div><div><span className="editorial-icon"><SvgIcon name="share" /></span><strong>Secure sharing</strong><small>Selected recipients</small></div><div><span className="editorial-icon"><SvgIcon name="clock" /></span><strong>Expiry controls</strong><small>Time-limited access</small></div><div><span className="editorial-icon"><SvgIcon name="history" /></span><strong>Activity history</strong><small>Review key events</small></div></div>
      <div className="editorial-visual" aria-hidden="true"><div className="editorial-folder"><i /><b>PROJECT FILES</b><span>04</span></div><div className="editorial-paper paper-a" /><div className="editorial-paper paper-b" /></div>
    </section>
  );
}

function SecurityFacts() {
  return (
    <section className="security-facts" aria-labelledby="security-facts-title">
      <div className="security-facts-heading"><span>SECURITY MODEL</span><h2 id="security-facts-title">Protection, by design.</h2></div>
      <div className="security-stack" aria-hidden="true"><span>APP ACCESS</span><span>ENCRYPTION</span><span>STORAGE</span><span>ACTIVITY</span></div>
      <div className="security-fact-grid"><div><strong>AES-256-GCM</strong><span>Authenticated file encryption</span></div><div><strong>Per-file keys</strong><span>Wrapped by the configured key-encryption key</span></div><div><strong>Managed access</strong><span>Sharing permissions and expiry</span></div><div><strong>Activity records</strong><span>Reviewable file and sharing events</span></div></div>
    </section>
  );
}

const heroWorkflowStages = [
  { title: "Choose a file", detail: "Start with a document from your workspace.", icon: "file" },
  { title: "Encrypt", detail: "TrustShare protects uploaded files with AES-256-GCM encryption.", icon: "shield" },
  { title: "Store securely", detail: "Encrypted file data is kept in configured cloud storage.", icon: "storage" },
  { title: "Share with control", detail: "Grant access to a recipient and manage their permission.", icon: "users" },
];

function HeroWorkflow() {
  const [activeStage, setActiveStage] = useState(0);

  function tiltHeroWorkflow(event) {
    if (event.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    event.currentTarget.style.setProperty("--hero-tilt-x", `${(x * 12).toFixed(2)}deg`);
    event.currentTarget.style.setProperty("--hero-tilt-y", `${(y * -9).toFixed(2)}deg`);
    event.currentTarget.style.setProperty("--hero-light-x", `${((x + 0.5) * 100).toFixed(1)}%`);
    event.currentTarget.style.setProperty("--hero-light-y", `${((y + 0.5) * 100).toFixed(1)}%`);
  }

  function resetHeroWorkflow(event) {
    event.currentTarget.style.setProperty("--hero-tilt-x", "0deg");
    event.currentTarget.style.setProperty("--hero-tilt-y", "0deg");
    event.currentTarget.style.setProperty("--hero-light-x", "50%");
    event.currentTarget.style.setProperty("--hero-light-y", "45%");
  }

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    const timer = window.setInterval(() => {
      setActiveStage((stage) => (stage + 1) % heroWorkflowStages.length);
    }, 3600);
    return () => window.clearInterval(timer);
  }, []);

  const stage = heroWorkflowStages[activeStage];
  return (
    <section className="hero-workflow" aria-label="Interactive secure file workflow" onPointerMove={tiltHeroWorkflow} onPointerLeave={resetHeroWorkflow}>
      <div className="hero-workflow-spatial" aria-hidden="true">
        <span className="hero-spatial-document"><b>PDF</b><i /><i /><i /></span>
        <span className="hero-spatial-folder"><i /><b>TEAM FILES</b></span>
        <span className="hero-spatial-shield"><SvgIcon name="shield" /></span>
      </div>
      <div className="hero-workflow-topline"><span><i /> TRUSTSHARE WORKFLOW</span><small>SELECT A STAGE</small></div>
      <div className="hero-workflow-track" role="group" aria-label="File security stages">
        {heroWorkflowStages.map((item, index) => (
          <button
            type="button"
            key={item.title}
            className={`hero-workflow-node${activeStage === index ? " is-active" : ""}${activeStage > index ? " is-complete" : ""}`}
            aria-pressed={activeStage === index}
            onClick={() => setActiveStage(index)}
          >
            <span className="hero-workflow-icon"><SvgIcon name={item.icon} /></span>
            <span className="hero-workflow-label">{item.title}</span>
          </button>
        ))}
      </div>
      <div className="hero-workflow-detail" aria-live="polite" key={activeStage}>
        <span className="hero-workflow-detail-icon"><SvgIcon name={stage.icon} /></span>
        <div><small>STAGE 0{activeStage + 1}</small><strong>{stage.title}</strong><p>{stage.detail}</p></div>
        <span className="hero-workflow-pulse" aria-hidden="true" />
      </div>
      <div className="hero-workflow-caption"><span>FILE</span><i /><span>ENCRYPTION</span><i /><span>SECURE STORAGE</span><i /><span>AUTHORIZED SHARING</span></div>
    </section>
  );
}

const features = [
  {
    icon: "shield",
    title: "Privacy comes first",
    description: "Keep important documents protected and control who can access them.",
  },
  {
    icon: "share",
    title: "Controlled sharing",
    description: "Share files with selected people and manage permissions.",
  },
  {
    icon: "history",
    title: "Activity monitoring",
    description: "Review file activity and maintain visibility over access.",
  },
  {
    icon: "users",
    title: "Team collaboration",
    description: "Keep your documents organized for a smoother team workflow.",
  },
  {
    icon: "check",
    title: "Organized workspace",
    description: "Manage important files from one convenient workspace.",
  },
  {
    icon: "settings",
    title: "Role-based access",
    description: "Structure access around the responsibilities of each user.",
  },
];

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-brand"><Brand /><p>A considered workspace for secure file sharing and collaboration.</p></div>
      <nav className="footer-links" aria-label="Footer navigation"><Link to="/features">Features</Link><Link to="/how-it-works">How it works</Link><Link to="/about">About</Link><Link to="/login">Login</Link><Link to="/login?mode=signup">Get started</Link></nav>
      <span>© {new Date().getFullYear()} TrustShare</span>
    </footer>
  );
}

function LandingPage() {
  return (
    <div className="landing-page">
      <Header />
      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <div className="hero-tag">
              <span /> YOUR FILES. YOUR CONTROL.
            </div>
            <h1>Secure files.<br />Confident teams.<br /><span>Work together.</span></h1>
            <p>Encrypt, organize, and share important files with access controls built into the workflow.</p>
            <div className="hero-actions">
              <Link
                className="button button-primary button-large"
                to="/login?mode=signup"
              >
                Get started <SvgIcon name="arrowUpRight" />
              </Link>
              <Link
                className="button button-light button-large"
                to="/features"
              >
                Explore features
              </Link>
            </div>
          </div>
          <div className="hero-visual">
            <HeroWorkflow />
          </div>
          <div className="hero-decoration" />
        </section>

        <WorkflowShowcase />
        <FeatureShowcase />

        <EncryptionDemo />

        <section className="sharing-visual" aria-labelledby="sharing-title">
          <div className="sharing-title"><span>CONTROLLED SHARING</span><h2 id="sharing-title">People. File. Permission.</h2></div>
          <div className="sharing-flow">
            <div className="sharing-person"><span>A</span><small>Sender</small></div>
            <div className="sharing-connection"><i /></div>
            <div className="sharing-file"><SvgIcon name="file" /><small>Encrypted file</small></div>
            <div className="sharing-connection"><i /></div>
            <div className="sharing-permissions"><span><SvgIcon name="check" /></span><small>Permissions</small></div>
            <div className="sharing-connection"><i /></div>
            <div className="sharing-person recipient"><span>M</span><small>Recipient</small></div>
          </div>
          <div className="sharing-controls-labels"><span>Share</span><span>Access expiry</span><span>Revoke</span><span>Activity</span></div>
        </section>

        <SecurityFacts />

        <section className="cta-section">
          <div className="cta-file-stack" aria-hidden="true"><i /><i /><span><SvgIcon name="file" /></span></div>
          <h2>Ready to secure your files?</h2>
          <Link
            className="button button-primary button-large"
            to="/login?mode=signup"
          >
            Get started <SvgIcon name="arrowUpRight" />
          </Link>
          <Link className="cta-login-link" to="/login">Login</Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function FeaturesPage() {
  return (
    <div className="landing-page">
      <Header />
      <main className="inner-page">
        <div className="inner-page-heading">
          <span className="eyebrow">TRUSTSHARE FEATURES</span>
          <h1>
            Everything you need.<br />
            <span>All in one place.</span>
          </h1>
          <p>
            Discover tools designed to help you manage files, collaborate
            with your team, and keep access organized.
          </p>
        </div>

        <div className="feature-grid inner-feature-grid">
          {features.map((feature) => (
            <article className="feature-card" key={feature.title}>
              <span className="feature-icon"><SvgIcon name={feature.icon} /></span>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>

        <div className="inner-page-cta">
          <h2>Ready to organize your workspace?</h2>
          <Link
            className="button button-primary button-large"
            to="/login?mode=signup"
          >
            Get started <SvgIcon name="arrowUpRight" />
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function HowItWorksPage() {
  const steps = [
    ["01", "Upload your files", "Bring your documents into your TrustShare workspace."],
    ["02", "Organize access", "Choose how your team members should access shared files."],
    ["03", "Share and collaborate", "Make files available to the people who need them."],
  ];

  return (
    <div className="landing-page">
      <Header />
      <main className="inner-page">
        <div className="inner-page-heading">
          <span className="eyebrow">HOW IT WORKS</span>
          <h1>
            Three steps to a<br />
            <span>better workflow.</span>
          </h1>
          <p>A simple process for managing and sharing your important files.</p>
        </div>

        <div className="steps-list inner-steps">
          {steps.map(([number, title, description]) => (
            <div key={number}>
              <span>{number}</span>
              <p>
                <strong>{title}</strong>
                <small>{description}</small>
              </p>
            </div>
          ))}
        </div>

        <div className="inner-page-cta">
          <h2>Your workspace starts here.</h2>
          <Link
            className="button button-primary button-large"
            to="/login?mode=signup"
          >
            Create an account <SvgIcon name="arrowUpRight" />
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function PricingPage() {
  return (
    <div className="landing-page">
      <Header />
      <main className="inner-page">
        <div className="inner-page-heading">
          <span className="eyebrow">TRUSTSHARE PRICING</span>
          <h1>
            Simple tools for<br />
            <span>your team's needs.</span>
          </h1>
          <p>
            Explore TrustShare's file management and collaboration experience
            as the platform develops.
          </p>
        </div>

        <div className="pricing-card">
          <span className="feature-icon"><SvgIcon name="shield" /></span>
          <span className="eyebrow pricing-eyebrow">GET STARTED</span>
          <h2>TrustShare Starter</h2>
          <p>
            For individuals and teams getting started with organized file sharing.
          </p>
          <ul>
            <li><SvgIcon name="check" /> File organization</li>
            <li><SvgIcon name="check" /> Sharing workflow</li>
            <li><SvgIcon name="check" /> Access management foundations</li>
          </ul>
          <p className="pricing-note">
            Pricing and plan limits have not been configured yet.
          </p>
          <Link
            className="button button-primary button-large"
            to="/login?mode=signup"
          >
            Get started <SvgIcon name="arrowUpRight" />
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function AboutPage() {
  return (
    <div className="landing-page">
      <Header />
      <main className="inner-page about-page">
        <div className="inner-page-heading">
          <span className="eyebrow">ABOUT TRUSTSHARE</span>
          <h1>
            Files should be easy<br />
            <span>to manage and share.</span>
          </h1>
          <p>
            TrustShare is a file-sharing and digital collaboration platform
            concept focused on helping people organize documents, manage
            access, and work together.
          </p>
          <Link
            className="button button-primary button-large"
            to="/features"
          >
            Explore features <SvgIcon name="arrowUpRight" />
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

/* Handles the token returned by the OAuth login flow. */
function AuthCallback() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Completing sign-in...");
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    async function completeSignIn() {
      const fragment = new URLSearchParams(
        window.location.hash.startsWith("#")
          ? window.location.hash.slice(1)
          : window.location.hash
      );

      const token = fragment.get("token");

      if (!token) {
        setMessage("No sign-in token was received. Please sign in again.");
        return;
      }

      window.history.replaceState(
        {},
        document.title,
        window.location.pathname + window.location.search
      );

      try {
        sessionStorage.setItem("trustshare_token", token);

        const user = await getCurrentUser();

        if (!user || !user.email) {
          throw new Error("Unable to retrieve your account details.");
        }

        sessionStorage.setItem("trustshare_user", JSON.stringify(user));

        const destination = user.role === "super_admin"
          ? "/admin"
          : consumePostLoginPath("/dashboard");
        navigate(destination, { replace: true });
      } catch (error) {
        clearSession();
        setMessage(
          error.response?.status === 401
            ? "Your sign-in token could not be verified. Please try again."
            : error.message || "Unable to finish signing in. Please try again."
        );
      }
    }

    completeSignIn();
  }, [navigate]);

  return (
    <main className="not-found">
      <Brand />
      <h1>{message}</h1>
      <Link className="button button-primary" to="/login">
        Return to sign in
      </Link>
    </main>
  );
}
/* Account page: connected sign-in methods and account details. */
function AccountPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [message, setMessage] = useState(() => (
    new URLSearchParams(window.location.search).get("microsoft_linked") === "1"
      ? "Microsoft account connected successfully."
      : ""
  ));
  const [errorMessage, setErrorMessage] = useState(() => (
    new URLSearchParams(window.location.search).get("microsoft_link_error") || ""
  ));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (
      params.get("microsoft_linked") === "1"
      || params.get("microsoft_link_error")
    ) {
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname
      );
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAccount() {
      if (!sessionStorage.getItem("trustshare_token")) {
        navigate("/login", { replace: true });
        return;
      }

      try {
        const currentUser = await getCurrentUser();

        if (cancelled) return;

        setUser(currentUser);
        sessionStorage.setItem(
          "trustshare_user",
          JSON.stringify(currentUser)
        );
      } catch (error) {
        if (error.response?.status === 401) {
          clearSession();
          if (!cancelled) navigate("/login", { replace: true });
        } else if (!cancelled) {
          setErrorMessage(getApiErrorMessage(error) || "Could not load account settings.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAccount();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function handleLinkGoogle() {
    setMessage("");
    setErrorMessage("");
    setLinking(true);

    try {
      await startGoogleLink();
    } catch (error) {
      setErrorMessage(
        error.response?.data?.detail ||
          error.message ||
          "Could not start Google account linking. Please try again."
      );
      setLinking(false);
    }
  }

  async function handleLinkMicrosoft() {
    setMessage("");
    setErrorMessage("");
    setLinking(true);

    try {
      await startMicrosoftLink();
    } catch (error) {
      setErrorMessage(
        error.response?.data?.detail ||
          error.message ||
          "Could not start Microsoft account linking. Please try again."
      );
      setLinking(false);
    }
  }

  async function handleSignOut() {
    try {
      await logoutUser();
    } catch {
      // Keep local sign-out available during a server outage.
    } finally {
      clearSession();
      navigate("/login", { replace: true });
    }
  }

  if (loading) {
    return (
      <main className="not-found">
        <Brand />
        <h1>Loading your account...</h1>
      </main>
    );
  }

  if (!user) return null;

  const email = user.email || "Email not available";
  const name = user.full_name || user.name || "TrustShare user";
  const provider = String(user.auth_provider || "").toLowerCase();

  const googleLinked =
    provider === "google" || Boolean(user.google_linked);

  const microsoftLinked = Boolean(user.microsoft_linked);

  return (
    <div className="landing-page">
      <Header />
      <main className="inner-page">
        <div className="inner-page-heading">
          <span className="eyebrow">YOUR TRUSTSHARE ACCOUNT</span>
          <h1>
            Welcome back,<br />
            <span>{name}.</span>
          </h1>
          <p>
            Manage your account and the sign-in methods connected to it.
          </p>
        </div>

        <section className="pricing-card account-card">
          <span className="feature-icon"><SvgIcon name="shield" /></span>
          <h2>Account details</h2>

          <p><strong>Name:</strong> {name}</p>
          <p><strong>Email:</strong> {email}</p>

          <div className="account-provider">
            <p>
              <strong>Google account:</strong>{" "}
              {googleLinked ? "Connected" : "Not connected"}
            </p>

            {googleLinked ? (
              <p>Your Google sign-in is connected to this TrustShare account.</p>
            ) : (
              <>
                <p>
                  Connect Google to use it with your existing TrustShare account.
                </p>
                <button
                  type="button"
                  className="button button-primary button-large"
                  onClick={handleLinkGoogle}
                  disabled={linking}
                >
                  {linking ? "Connecting..." : <>Link Google account <SvgIcon name="arrowUpRight" /></>}
                </button>
              </>
            )}
          </div>

          <div className="account-provider">
            <p>
              <strong>Microsoft account:</strong>{" "}
              {microsoftLinked ? "Connected" : "Not connected"}
            </p>

            {microsoftLinked ? (
              <p>
                Your Microsoft sign-in is connected to this TrustShare account.
              </p>
            ) : (
              <>
                <p>
                  Connect Microsoft to associate it with your existing
                  TrustShare account.
                </p>
                <button
                  type="button"
                  className="button button-primary button-large"
                  onClick={handleLinkMicrosoft}
                  disabled={linking}
                >
                  {linking ? "Connecting to Microsoft..." : <>Connect Microsoft <SvgIcon name="arrowUpRight" /></>}
                </button>
              </>
            )}
          </div>

          {message && (
            <p className="form-message" role="status">{message}</p>
          )}

          {errorMessage && (
            <p className="form-message" role="alert">{errorMessage}</p>
          )}

          <button
            type="button"
            className="button button-light button-large"
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function LoginPage() {
  const navigate = useNavigate();

  const [isSignup, setIsSignup] = useState(
    new URLSearchParams(window.location.search).get("mode") === "signup"
  );
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(() => {
    const error = new URLSearchParams(window.location.search).get("error");

    if (error === "microsoft_account_exists") {
      return (
        "This email already has a TrustShare account. Sign in with its "
        + "original method, then connect Microsoft from your account page."
      );
    }

    return "";
  });

  function moveAuthScene(event) {
    if (event.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 22;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 18;
    event.currentTarget.style.setProperty("--auth-pointer-x", `${x.toFixed(1)}px`);
    event.currentTarget.style.setProperty("--auth-pointer-y", `${y.toFixed(1)}px`);
    event.currentTarget.style.setProperty("--auth-tilt-x", `${((x / 22) * 7).toFixed(2)}deg`);
    event.currentTarget.style.setProperty("--auth-tilt-y", `${((y / 18) * -5).toFixed(2)}deg`);
  }

  function resetAuthScene(event) {
    event.currentTarget.style.setProperty("--auth-pointer-x", "0px");
    event.currentTarget.style.setProperty("--auth-pointer-y", "0px");
    event.currentTarget.style.setProperty("--auth-tilt-x", "0deg");
    event.currentTarget.style.setProperty("--auth-tilt-y", "0deg");
  }

  function switchMode(signup) {
    setIsSignup(signup);
    setMessage("");
    navigate(signup ? "/login?mode=signup" : "/login");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    try {
      const data = isSignup
        ? await registerUser({
            full_name: fullName.trim(),
            email: email.trim(),
            password,
          })
        : await loginUser({
            email: email.trim(),
            password,
          });

      saveSession(data);

      const user = data.user;

      const destination = user?.role === "super_admin"
        ? "/admin"
        : consumePostLoginPath("/dashboard");
      navigate(destination, { replace: true });
    } catch (error) {
      const detail = error.response?.data?.detail;

      setMessage(
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail.map((item) => item.msg).join(", ")
            : getApiErrorMessage(error)
      );
    }
  }

  function handleGoogleLogin() {
    setMessage("");
    startGoogleLogin();
  }

  function handleMicrosoftLogin() {
    setMessage("");
    startMicrosoftLogin();
  }

  return (
    <main className={`auth-page auth-login-page${isSignup ? " is-signup" : " is-login"}`}>
      <div className="auth-topbar">
        <Brand />
        <Link to="/" className="back-home"><SvgIcon name="arrowLeft" /> Back to home</Link>
      </div>

      <div className="auth-layout">
        <section className="auth-showcase">
          <div className="showcase-label">
            <span /> {isSignup ? "YOUR SECURE WORKSPACE STARTS HERE" : "A BETTER WAY TO SHARE"}
          </div>
          <h1>
            {isSignup ? <>A workspace<br />built around <span>you.</span></> : <>Your work,<br />in good <span>hands.</span></>}
          </h1>
          <p className="showcase-description">
            {isSignup
              ? "Create a protected place for your files, then invite the people you trust to work with you."
              : "Bring your documents and your team together in a workspace designed around privacy, clarity, and control."}
          </p>
          <div className={`auth-art ${isSignup ? "signup-scene" : "login-scene"}`} key={isSignup ? "signup-scene" : "login-scene"} onPointerMove={moveAuthScene} onPointerLeave={resetAuthScene}>
            {isSignup ? (
              <div className="signup-workspace-scene" aria-hidden="true">
                <div className="signup-portal"><span><SvgIcon name="shield" /></span><i /></div>
                <div className="signup-doc signup-doc-back"><b>DOC</b><i /><i /><i /></div>
                <div className="signup-doc signup-doc-front"><b>NEW FILE</b><i /><i /><i /><i /></div>
                <div className="signup-workspace-folder"><span /><i /><i /><b>MY WORKSPACE</b><small>PRIVATE · ENCRYPTED</small></div>
                <div className="signup-member-node"><span>A</span><i>+</i></div>
                <div className="signup-scene-path signup-path-one"><i /></div>
                <div className="signup-scene-path signup-path-two"><i /></div>
                <span className="signup-scene-caption">A SECURE SPACE, READY FOR YOU</span>
              </div>
            ) : (
              <>
                <FilePreview />
                <div className="auth-prototype-layer" aria-hidden="true">
                  <div className="auth-object-folder"><span /><i /><i /><b>TEAM FILES</b></div>
                  <div className="auth-object-storage"><SvgIcon name="storage" /><i /><i /><i /></div>
                  <div className="auth-object-cipher"><i /><i /><i /><i /><i /><i /><b>ENCRYPTED</b></div>
                  <div className="auth-object-shield"><SvgIcon name="shield" /><b>SECURE ENTRY</b></div>
                  <div className="auth-transfer-path path-a"><i /></div>
                  <div className="auth-transfer-path path-b"><i /></div>
                  <i className="auth-scene-particle particle-a" /><i className="auth-scene-particle particle-b" /><i className="auth-scene-particle particle-c" /><i className="auth-scene-particle particle-d" />
                </div>
              </>
            )}
          </div>
          <div className="showcase-footer">
            <span className="showcase-check"><SvgIcon name="check" /></span>
            <span>
              <strong>{isSignup ? "Your workspace is one step away" : "Made for peace of mind"}</strong>
              <small>{isSignup ? "Join a secure file collaboration space." : "Thoughtful file management starts here."}</small>
            </span>
          </div>
        </section>

        <section className="auth-form-panel">
          <div className="auth-form-content" key={isSignup ? "signup" : "login"}>
            <div className="form-heading-icon"><SvgIcon name="shield" /></div>
            <span className="eyebrow">
              {isSignup ? "LET'S GET YOU SET UP" : "WELCOME BACK"}
            </span>
            <h2>{isSignup ? "Create your account" : "Good to see you."}</h2>
            <p className="auth-subtitle">
              {isSignup
                ? "A workspace for your files is just a few details away."
                : "Sign in to get back to your workspace."}
            </p>

            <form onSubmit={handleSubmit}>
              {isSignup && (
                <label className="form-label">
                  Full name
                  <input
                    type="text"
                    placeholder="Enter your full name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    autoComplete="name"
                    required
                  />
                </label>
              )}

              <label className="form-label">
                Email address
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </label>

              <label className="form-label">
                <span className="label-row">
                  Password
                  {!isSignup && (
                    <Link to="/forgot-password">
                      Forgot password?
                    </Link>
                  )}
                </span>

                <span className="password-wrap">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder={
                      isSignup
                        ? "Create a strong password"
                        : "Enter your password"
                    }

                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={isSignup ? "new-password" : "current-password"}
                    minLength={8}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </span>
              </label>

              {!isSignup && (
                <label className="remember-row">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                  />
                  Keep me signed in
                </label>
              )}

              {isSignup && (
                <p className="password-hint">
                  Use at least 8 characters for your password.
                </p>
              )}

              <button
                className="button button-primary submit-button"
                type="submit"
              >
                {isSignup ? "Create account" : "Sign in"} <SvgIcon name="arrowUpRight" />
              </button>
            </form>

            {message && (
              <p className="form-message" role="status">{message}</p>
            )}

            <div className="auth-divider">
              <span />or continue with<span />
            </div>

            <div className="social-buttons">
              <button type="button" onClick={handleGoogleLogin}>
                <b className="google-mark">G</b> Google
              </button>
              <button type="button" onClick={handleMicrosoftLogin}>
                <b className="microsoft-mark"></b> Microsoft
              </button>
            </div>

            <p className="switch-auth">
              {isSignup
                ? "Already have an account?"
                : "New to TrustShare?"}
              <button
                type="button"
                onClick={() => switchMode(!isSignup)}
              >
                {isSignup ? "Sign in" : "Create an account"}
              </button>
            </p>

            <p className="terms-note">
              By continuing, you agree to use TrustShare responsibly and
              protect your account credentials.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendRemaining, setResendRemaining] = useState(0);

  useEffect(() => {
    if (resendRemaining <= 0) return undefined;

    const timer = window.setInterval(() => {
      setResendRemaining((remaining) => Math.max(remaining - 1, 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendRemaining]);

  function showError(requestError) {
    setError(getApiErrorMessage(requestError));
    setMessage("");
  }

  async function sendCode(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await startAccountPasswordRecovery(email.trim());

      if (!response.challenge_id) {
        setMessage(response.message);
        return;
      }

      setChallengeId(response.challenge_id);
      setResendRemaining(response.resend_after || 60);
      setStep("verify");
      setMessage(response.message);
    } catch (requestError) {
      showError(requestError);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await verifyAccountPasswordRecoveryCode(
        challengeId,
        code
      );
      setResetToken(response.reset_token);
      setStep("reset");
    } catch (requestError) {
      showError(requestError);
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    if (busy || resendRemaining > 0) return;

    setBusy(true);
    setError("");
    try {
      const response = await resendAccountPasswordRecoveryCode(challengeId);
      setChallengeId(response.challenge_id);
      setResendRemaining(response.resend_after || 60);
      setCode("");
      setMessage("A new verification code has been sent.");
    } catch (requestError) {
      showError(requestError);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(event) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      await resetAccountPassword(resetToken, newPassword);
      setStep("success");
      setMessage("Your password has been reset successfully.");
    } catch (requestError) {
      showError(requestError);
    } finally {
      setBusy(false);
    }
  }

  const titles = {
    email: "Forgot your password?",
    verify: "Verify your identity",
    reset: "Create a new password",
    success: "Password reset complete",
  };

  const descriptions = {
    email: "Enter your registered email address and we'll send you a verification code.",
    verify: "Enter the one-time code sent to your email address.",
    reset: "Choose a strong password to secure your TrustShare account.",
    success: "You can now sign in with your new password.",
  };

  return (
    <main className="auth-page">
      <div className="auth-topbar">
        <Brand />
        <Link to="/login" className="back-home"><SvgIcon name="arrowLeft" /> Back to login</Link>
      </div>

      <div className="auth-layout">
        <section className="auth-showcase">
          <div className="showcase-label">
            <span /> SECURITY FIRST
          </div>
          <h1>
            Your account,<br />
            in safe <span>hands.</span>
          </h1>
          <p className="showcase-description">
            Verify your identity before changing your password and getting
            back to your workspace.
          </p>
          <div className="auth-art">
            <FilePreview />
          </div>
        </section>

        <section className="auth-form-panel">
          <div className="auth-form-content">
            <div className="form-heading-icon"><SvgIcon name="shield" /></div>
            <span className="eyebrow">TRUSTSHARE ACCOUNT RECOVERY</span>
            <h2>{titles[step]}</h2>
            <p className="auth-subtitle">{descriptions[step]}</p>

            {step === "email" && (
              <form onSubmit={sendCode}>
                <label className="form-label">
                  Email address
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    required
                  />
                </label>
                <button
                  className="button button-primary submit-button"
                  type="submit"
                  disabled={busy}
                >
                  {busy ? "Sending..." : "Send code"} <SvgIcon name="arrowUpRight" />
                </button>
              </form>
            )}

            {step === "verify" && (
              <form onSubmit={verifyCode}>
                <label className="form-label">
                  Verification code
                  <input
                    className="recovery-code-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(event) =>
                      setCode(event.target.value.replace(/\D/g, ""))
                    }
                    required
                  />
                </label>
                <button
                  className="button button-primary submit-button"
                  type="submit"
                  disabled={busy}
                >
                  {busy ? "Verifying..." : "Verify identity"} <SvgIcon name="arrowUpRight" />
                </button>
                <button
                  className="recovery-text-button"
                  type="button"
                  onClick={resendCode}
                  disabled={busy || resendRemaining > 0}
                >
                  {resendRemaining > 0
                    ? `Resend code in ${resendRemaining}s`
                    : "Resend code"}
                </button>
              </form>
            )}

            {step === "reset" && (
              <form onSubmit={resetPassword}>
                <label className="form-label">
                  New password
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </label>
                <label className="form-label">
                  Confirm password
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) =>
                      setConfirmPassword(event.target.value)
                    }
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </label>
                <button
                  className="button button-primary submit-button"
                  type="submit"
                  disabled={busy}
                >
                  {busy ? "Resetting..." : "Reset password"} <SvgIcon name="arrowUpRight" />
                </button>
              </form>
            )}

            {step === "success" && (
              <button
                className="button button-primary submit-button"
                type="button"
                onClick={() => navigate("/login")}
              >
                Back to login <SvgIcon name="arrowUpRight" />
              </button>
            )}

            {message && (
              <p className="form-message" role="status">{message}</p>
            )}
            {error && (
              <p className="form-message form-message-error" role="alert">
                {error}
              </p>
            )}

            {step !== "success" && (
              <p className="switch-auth">
                <Link to="/login">Back to login</Link>
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}


const SIDEBAR_ICONS = {
  dashboard: <><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/></>,
  folder: <><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/><path d="M3 10h18"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  share: <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 10.7 6.6-3.4m-6.6 7 6.6 3.4"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  star: <><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></>,
  starFilled: <><path fill="currentColor" d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  folderOpen: <><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/><path d="M3 10h18"/></>,
  trash: <><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/></>,
  storage: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></>,
  chart: <><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-5 5"/><path d="M15 9h4v4"/></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5m4-1v5l3 2"/></>,
  shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11"/><path d="m9 12 2 2 4-4"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.8 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.8-1l-1.7.6-1.4-2.4L5.1 15a8 8 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.8-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.8 1l1.7-.6 1.4 2.4-1.4 1.1a8 8 0 0 1-.1 2z"/></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
  check: <><path d="m5 12 4 4L19 6"/></>,
  arrowUpRight: <><path d="M7 17 17 7M7 7h10v10"/></>,
  arrowLeft: <><path d="m15 18-6-6 6-6M9 12h12"/></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  close: <><path d="m18 6-12 12M6 6l12 12"/></>,
};

function SidebarIcon({ name }) {
  return <svg className="sidebar-nav-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{SIDEBAR_ICONS[name]}</svg>;
}

function SvgIcon({ name, className }) {
  return <svg className={className} viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{SIDEBAR_ICONS[name] || SIDEBAR_ICONS.shield}</svg>;
}

function DashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef(null);
  const openedRouteFolderRef = useRef("");
  const dashboardPanelRefreshSequence = useRef(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigateSidebar = (path) => { navigate(path); setSidebarOpen(false); };
  const workspacePage = location.pathname.replace(/\/$/, "").split("/").pop() || "dashboard";
  const isOverviewPage = workspacePage === "dashboard";
  const isRecentUploadsPage = workspacePage === "recent-uploads";
  const isActivityPage = workspacePage === "activity";
  const isAnalyticsPage = workspacePage === "analytics";
  const isStoragePage = workspacePage === "storage";
  const isSecurityPage = workspacePage === "security";
  const isSharedByMePage = workspacePage === "shared-by-me";
  const isFavoritesPage = workspacePage === "favorites";
  const isTrashPage = workspacePage === "trash";
  const isFilesPage = workspacePage === "files" || workspacePage === "shared";

  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem("trustshare_user") || "null");
    } catch {
      return null;
    }
  });

  const [files, setFiles] = useState([]);
  const [allFiles, setAllFiles] = useState([]);
  const [storageSummary, setStorageSummary] = useState(null);
  const [favorites, setFavorites] = useState([]);
  const [favoriteBusy, setFavoriteBusy] = useState("");
  const [shareMutationBusy, setShareMutationBusy] = useState(false);
  const [recentUploads, setRecentUploads] = useState(null);
  const [activityEntries, setActivityEntries] = useState(null);
  const [shareDashboard, setShareDashboard] = useState(null);
  const [gmailStatus, setGmailStatus] = useState(null);
  const [gmailStatusError, setGmailStatusError] = useState("");
  const [dashboardPanelErrors, setDashboardPanelErrors] = useState({ uploads: "", activity: "", shares: "" });
  const [dashboardPanelLoading, setDashboardPanelLoading] = useState({ uploads: true, activity: true, shares: true });
  const [recentHasMore, setRecentHasMore] = useState(false);
  const [activityHasMore, setActivityHasMore] = useState(false);
  const [loadingMoreRecent, setLoadingMoreRecent] = useState(false);
  const [loadingMoreActivity, setLoadingMoreActivity] = useState(false);
  const [shareFilter, setShareFilter] = useState("All");
  const [viewingShared, setViewingShared] = useState(false);
  const [folders, setFolders] = useState([]);
  const [activeFolderId, setActiveFolderId] = useState(null);

  const [newFolderName, setNewFolderName] = useState("");
  const [folderSearch, setFolderSearch] = useState("");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("All files");
  const [sortBy, setSortBy] = useState("date");
  const [sortDirection, setSortDirection] = useState("desc");

  const [folderBusy, setFolderBusy] = useState(false);
  const [openingFolderId, setOpeningFolderId] = useState(null);
  const [downloadingFileId, setDownloadingFileId] = useState(null);
  const [preview, setPreview] = useState(null);
  const previewUrlRef = useRef(null);
  const previewRequestRef = useRef(0);
  const [folderToDelete, setFolderToDelete] = useState(null);
  const [deleteChoice, setDeleteChoice] = useState("keep_files");
  const [confirmPermanentDelete, setConfirmPermanentDelete] =
    useState(false);

  const [fileToDelete, setFileToDelete] = useState(null);
  const [fileDeleteBusy, setFileDeleteBusy] = useState(false);

  const [selectedFileIds, setSelectedFileIds] = useState([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveDestinationId, setMoveDestinationId] = useState("root");
  const [moveBusy, setMoveBusy] = useState(false);

  const [draggedFileIds, setDraggedFileIds] = useState([]);
  const [dropTargetKey, setDropTargetKey] = useState("");

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const quickUploadRequested = useRef(false);
  const [error, setError] = useState(() => {
    const gmailResult = new URLSearchParams(window.location.search).get("gmail");
    if (gmailResult === "connected") return "Gmail is connected. You can retry sharing your file.";
    if (gmailResult === "denied") return "Gmail authorization was cancelled. No Gmail account was connected.";
    if (gmailResult === "failed") return "Gmail authorization was not completed. Try Connect Gmail again before sharing.";
    return "";
  });

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("gmail")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (workspacePage === "files" && quickUploadRequested.current && fileInputRef.current) {
      fileInputRef.current.click();
      quickUploadRequested.current = false;
    }
  }, [workspacePage]);

  // Folder unlocks stay in memory for at most 15 minutes.
  const FOLDER_UNLOCK_TTL_MS = 15 * 60 * 1000;
  const [folderPasswordCache, setFolderPasswordCache] = useState({});
  const [accessFolder, setAccessFolder] = useState(null);
  const [folderAccess, setFolderAccess] = useState([]);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessBusy, setAccessBusy] = useState(false);
  const [accessEmail, setAccessEmail] = useState("");
  const [accessExpiry, setAccessExpiry] = useState("");
  const [accessPermission, setAccessPermission] = useState("viewer");
  const [accessExpiryEdits, setAccessExpiryEdits] = useState({});
  const [accessPermissionEdits, setAccessPermissionEdits] = useState({});

  // Custom dialog state.
  const [dialog, setDialog] = useState(null);
  const [dialogValue, setDialogValue] = useState("");
  const [dialogConfirmValue, setDialogConfirmValue] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogShowPassword, setDialogShowPassword] = useState(false);
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [resendRemaining, setResendRemaining] = useState(0);
  const dialogResolver = useRef(null);

  useEffect(() => () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    previewRequestRef.current += 1;
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreview(null);
  }, [workspacePage, user?.id]);

  function closePreview() {
    previewRequestRef.current += 1;
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreview(null);
  }

  const activeFolder = folders.find(
    (folder) => Number(folder.id) === Number(activeFolderId)
  );

  // --------------------------------------------------
  // CUSTOM DIALOG SYSTEM
  // --------------------------------------------------

  function openDialog(options) {
    // Avoid replacing a dialog that is still waiting for a result.
    if (dialogResolver.current) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      dialogResolver.current = resolve;
      setDialog(options);
      setDialogValue(options.defaultValue ?? "");
      setDialogConfirmValue("");
      setDialogError(options.error || "");
      setDialogBusy(false);
      setDialogShowPassword(false);
      setResendAvailableAt(options.resendAvailableAt || 0);
      setResendRemaining(
        options.resendAvailableAt
          ? Math.max(
              0,
              Math.ceil(
                (options.resendAvailableAt - Date.now()) / 1000
              )
            )
          : 0
      );
    });
  }

  function closeDialog(result = null) {
    const resolve = dialogResolver.current;

    dialogResolver.current = null;
    setDialog(null);
    setDialogValue("");
    setDialogConfirmValue("");
    setDialogError("");
    setDialogBusy(false);
    setDialogShowPassword(false);
    setResendAvailableAt(0);
    setResendRemaining(0);

    if (resolve) resolve(result);
  }

  function submitDialog(event) {
    event.preventDefault();

    if (!dialog || dialogBusy) return;

    if (dialog.type === "info") {
      closeDialog(true);
      return;
    }

    if (dialog.type === "choice") return;

    if (dialog.type === "folder-unlock") {
      if (!dialogValue.trim()) {
        setDialogError("Enter the folder password to continue.");
        return;
      }

      setDialogBusy(true);
      unlockFolder(dialog.folderId, dialogValue)
        .then((session) => {
          saveFolderPassword(
            dialog.folderId,
            session.unlock_token,
            session.expires_in
          );
          closeDialog({
            action: "unlocked",
            unlock_token: session.unlock_token,
          });
        })
        .catch((error) => {
          setDialogError(
            error.response?.status === 403
              ? "Incorrect folder password. Please try again."
              : getApiErrorMessage(error)
          );
        })
        .finally(() => {
          if (dialogResolver.current) setDialogBusy(false);
        });
      return;
    }

    if (dialog.type === "identity-verification") {
      if (!/^\d{6}$/.test(dialogValue)) {
        setDialogError("Enter the 6-digit verification code.");
        return;
      }

      setDialogBusy(true);
      verifyPasswordRecoveryCode(
        dialog.challengeId,
        dialogValue
      )
        .then(({ reset_token: resetToken }) => {
          setDialog({
            type: "password-reset",
            title: "Create a new password",
            description:
              "Your identity was verified. Choose a new password " +
              "for this protected item.",
            confirmText: "Reset Password",
            resetToken,
          });
          setDialogValue("");
          setDialogConfirmValue("");
          setDialogError("");
          setDialogShowPassword(false);
        })
        .catch((error) => {
          setDialogError(
            getApiErrorMessage(error) ||
              "We could not verify your identity."
          );
        })
        .finally(() => setDialogBusy(false));
      return;
    }

    if (dialog.type === "password-reset") {
      if (
        dialogValue.length < 8 ||
        dialogValue.length > 128
      ) {
        setDialogError("Password must contain 8 to 128 characters.");
        return;
      }

      if (dialogValue !== dialogConfirmValue) {
        setDialogError("The passwords do not match.");
        return;
      }

      setDialogBusy(true);
      resetPasswordWithAuthorization(
        dialog.resetToken,
        dialogValue
      )
        .then(() =>
          closeDialog({
            action: "recovered",
            password: dialogValue,
          })
        )
        .catch((error) => {
          setDialogError(
            getApiErrorMessage(error) ||
              "We could not reset this password."
          );
        })
        .finally(() => setDialogBusy(false));
      return;
    }

    if (
      ["text", "password", "password-confirm"].includes(dialog.type) &&
      !dialogValue.trim()
    ) {
      setDialogError("This field is required.");
      return;
    }

    if (
      dialog.type === "password-confirm" &&
      (dialogValue.length < 8 || dialogValue.length > 128)
    ) {
      setDialogError("Password must contain 8 to 128 characters.");
      return;
    }

    if (
      dialog.type === "password-confirm" &&
      dialogValue !== dialogConfirmValue
    ) {
      setDialogError("The passwords do not match.");
      return;
    }

    if (
      dialog.type === "password-confirm" ||
      dialog.type === "password" ||
      dialog.type === "text" ||
      dialog.type === "permission"
    ) {
      closeDialog(dialogValue);
      return;
    }

    if (dialog.type === "optional-date") {
      closeDialog(dialogValue);
    }
  }

  async function resendRecoveryCode() {
    if (
      !dialog ||
      dialog.type !== "identity-verification" ||
      dialogBusy ||
      Date.now() < resendAvailableAt
    ) {
      return;
    }

    setDialogBusy(true);
    try {
      const response = await resendPasswordRecoveryCode(
        dialog.challengeId
      );
      setDialog({
        ...dialog,
        challengeId: response.challenge_id,
        maskedEmail: response.masked_email,
      });
      setResendAvailableAt(
        Date.now() + response.resend_after * 1000
      );
      setResendRemaining(response.resend_after);
      setDialogValue("");
      setDialogError("");
    } catch (error) {
      setDialogError(
        getApiErrorMessage(error) ||
          "We could not resend the verification code."
      );
    } finally {
      setDialogBusy(false);
    }
  }

  useEffect(() => {
    if (dialog?.type !== "identity-verification") return undefined;

    const interval = window.setInterval(() => {
      setResendRemaining(
        Math.max(
          0,
          Math.ceil((resendAvailableAt - Date.now()) / 1000)
        )
      );
    }, 1000);

    return () => window.clearInterval(interval);
  }, [dialog?.type, resendAvailableAt]);

  // --------------------------------------------------
  // FOLDER PASSWORD HELPERS
  // --------------------------------------------------

  async function recoverProtectedPassword(kind, item) {
    try {
      const response = await startPasswordRecovery(kind, item.id);
      const result = await openDialog({
        type: "identity-verification",
        title: "Verify it's you",
        description:
          "We sent a verification code to your registered email " +
          "address to protect this recovery.",
        maskedEmail: response.masked_email,
        challengeId: response.challenge_id,
        resendAvailableAt:
          Date.now() + response.resend_after * 1000,
      });

      if (result?.action === "recovered") {
        setError("");
        return result.password;
      }
    } catch (err) {
      setError(
        getApiErrorMessage(err) ||
          "Could not start password recovery."
      );
    }

    return null;
  }

  async function askForFolderPassword(folder, forcePrompt = false) {
    if (!folder?.is_password_protected) return null;

    const cached = folderPasswordCache[folder.id];

    if (cached?.token && cached.expiresAt > Date.now() && !forcePrompt) {
      return cached.token;
    }
    if (cached) clearFolderPassword(folder.id);

    const result = await openDialog({
      type: "folder-unlock",
      folderId: Number(folder.id),
      title: "Protected folder",
      description: `Enter the password to access "${folder.name}".`,
      label: "Folder password",
      confirmText: "Unlock",
      cancelText: "Cancel",
      showForgotPassword: "Forgot Folder Password?",
    });

    if (result?.action === "unlocked") return result.unlock_token;
    if (result?.action === "forgot") {
      const recoveredPassword = await recoverProtectedPassword("folder", folder);
      if (!recoveredPassword) return null;
      try {
        const session = await unlockFolder(folder.id, recoveredPassword);
        saveFolderPassword(folder.id, session.unlock_token, session.expires_in);
        return session.unlock_token;
      } catch (error) {
        setError(getApiErrorMessage(error));
      }
    }
    return null;
  }

  async function askForFilePassword(file, action = "access") {
    if (!file?.is_password_protected) return null;

    const result = await openDialog({
      type: "password",
      title: `${action} protected file`,
      description: `Enter the password for "${file.original_name}".`,
      label: "File password",
      confirmText: "Unlock",
      cancelText: "Cancel",
      showForgotPassword: "Forgot File Password?",
    });

    if (result?.action === "forgot") {
      return await recoverProtectedPassword("file", file);
    }

    return result || null;
  }


  function clearFolderPassword(folderId) {
    setFolderPasswordCache((current) => {
      const next = { ...current };
      delete next[folderId];
      return next;
    });
  }

  function saveFolderPassword(folderId, token, expiresIn = 900) {
    if (!token) return;

    setFolderPasswordCache((current) => ({
      ...current,
      [folderId]: { token, expiresAt: Date.now() + Math.min(FOLDER_UNLOCK_TTL_MS, expiresIn * 1000) },
    }));
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      const activeUnlock = folderPasswordCache[activeFolderId];
      if (activeFolderId == null || !activeUnlock || activeUnlock.expiresAt > Date.now()) return;
      clearFolderPassword(activeFolderId);
      setActiveFolderId(null);
      setFiles(allFiles.filter((file) => file.folder_id == null));
      setError("The folder was locked after 15 minutes. Enter its password to open it again.");
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeFolderId, allFiles, folderPasswordCache]);

  async function getParentFolderPassword(file, forcePrompt = false) {
    if (file.folder_id == null) return null;

    let folder = folders.find(
      (item) => Number(item.id) === Number(file.folder_id)
    );

    const isProtected = Boolean(
      file.is_parent_folder_password_protected || folder?.is_password_protected
    );
    if (!isProtected) return null;
    if (!folder) {
      folder = {
        id: file.folder_id,
        name: "this folder",
        is_password_protected: true,
      };
    }

    return await askForFolderPassword(folder, forcePrompt);
  }

  // --------------------------------------------------
  // INITIAL DASHBOARD LOAD
  // --------------------------------------------------

  useEffect(() => {
    if (!sessionStorage.getItem("trustshare_token")) {
      navigate("/login", { replace: true });
      return;
    }

    let cancelled = false;

    async function loadDashboard() {
      try {
        const [currentUser, userFolders, userFiles] = await Promise.all([
          getCurrentUser(),
          listFolders(),
          listFiles(),
        ]);

        if (cancelled) return;

        setUser(currentUser);
        try {
          setGmailStatus(await getGoogleGmailStatus());
          setGmailStatusError("");
        } catch (gmailError) {
          if (!cancelled) {
            setGmailStatus(null);
            setGmailStatusError(getApiErrorMessage(gmailError) || "Gmail connection status is unavailable.");
          }
        }
        try {
          setStorageSummary(await getStorageSummary());
        } catch (storageError) {
          setStorageSummary(null);
          setError(getApiErrorMessage(storageError) || "Storage usage could not be loaded.");
        }

        sessionStorage.setItem(
          "trustshare_user",
          JSON.stringify(currentUser)
        );

        setFolders(
          (Array.isArray(userFolders) ? userFolders : []).sort(
            (a, b) => (a.name || "").localeCompare(b.name || "")
          )
        );

        let favoriteRows = [];
        try {
          favoriteRows = await listFavorites();
          if (!cancelled) setFavorites(Array.isArray(favoriteRows) ? favoriteRows : []);
        } catch (favoriteError) {
          if (!cancelled) setError(getApiErrorMessage(favoriteError) || "Favorites could not be loaded.");
        }
        const favoriteFileIds = new Set(favoriteRows.filter((entry) => entry.kind === "file").map((entry) => String(entry.id)));
        const loadedFiles = (Array.isArray(userFiles) ? userFiles : []).map((file) => ({ ...file, is_favorite: favoriteFileIds.has(String(file.id)) }));

        setAllFiles(loadedFiles);
        if (workspacePage !== "shared") {
          setFiles(loadedFiles.filter((file) => file.folder_id == null));
        }
        await refreshDashboardPanels();
      } catch (err) {
        if (err.response?.status === 401) {
          clearSession();
          navigate("/login", { replace: true });
          return;
        }

        if (!cancelled) {
          setError(
            getApiErrorMessage(err) || "Could not load your workspace."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [navigate, workspacePage]);

  useEffect(() => {
    let cancelled = false;
    setActiveTab("All files");
    if (workspacePage === "shared") {
      setViewingShared(true);
      listSharedFiles().then((shared) => {
        if (!cancelled) {
          const favoriteIds = new Set(favorites.filter((entry) => entry.kind === "file").map((entry) => String(entry.id)));
          setFiles((Array.isArray(shared) ? shared : []).map((item) => ({ ...item, is_favorite: favoriteIds.has(String(item.id)) })));
        }
      }).catch((err) => {
        if (!cancelled) setError(getApiErrorMessage(err) || "Could not load files shared with you.");
      });
    } else {
      setViewingShared(false);
      if (workspacePage === "files" && location.state?.openFolderId != null) {
        const folderId = Number(location.state.openFolderId);
        const folder = folders.find((entry) => Number(entry.id) === folderId);
        const requestKey = `${location.key}:${folderId}`;

        if (openedRouteFolderRef.current === requestKey) {
          return () => { cancelled = true; };
        }

        if (!folder) {
          if (!loading) {
            setError("The requested folder was not found. Refresh and try again.");
          }
        } else {
          openedRouteFolderRef.current = requestKey;
          setViewingShared(Boolean(folder.is_shared));
          setActiveFolderId(folderId);
          refreshFolderFiles(folderId).catch((err) => {
            if (!cancelled) {
              setError(getApiErrorMessage(err) || "Could not open the folder.");
            }
          });
        }
      } else if (workspacePage === "files") {
        setActiveFolderId(null);
        setFiles(allFiles.filter((file) => file.folder_id == null));
      }
    }
    return () => { cancelled = true; };
    // The effect is keyed to router navigation; state snapshots are refreshed on each route render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspacePage, location.key, folders, allFiles, loading]);

  // --------------------------------------------------
  // REFRESH FILES
  // --------------------------------------------------

  async function refreshFolderFiles(
    folderId = activeFolderId,
    suppliedPassword = null
  ) {
    const isRoot = folderId == null;

    const folder = isRoot
      ? null
      : folders.find(
          (item) => Number(item.id) === Number(folderId)
        );

    if (!isRoot && !folder) {
      throw new Error("Folder not found. Refresh and try again.");
    }

    let unlockToken = suppliedPassword;

    if (folder?.is_password_protected && !unlockToken) {
      unlockToken = await askForFolderPassword(folder);

      if (!unlockToken) {
        throw new Error("Folder access cancelled.");
      }
    }

    let folderFiles;
    if (isRoot) {
      folderFiles = viewingShared ? await listSharedFiles() : await listFiles();
    } else {
      folderFiles = await listFiles(folderId, unlockToken);
    }
    const everyFile = isRoot && !viewingShared
      ? folderFiles
      : await listFiles();

    const favoriteIds = new Set(favorites.filter((entry) => entry.kind === "file").map((entry) => String(entry.id)));
    const completeList = (Array.isArray(everyFile) ? everyFile : []).map((item) => ({ ...item, is_favorite: favoriteIds.has(String(item.id)) }));

    setAllFiles(completeList);
    try {
      setStorageSummary(await getStorageSummary());
    } catch (storageError) {
      setStorageSummary(null);
      setError(getApiErrorMessage(storageError) || "Storage usage could not be refreshed.");
    }

    setFiles(
      isRoot
        ? viewingShared ? (Array.isArray(folderFiles) ? folderFiles : []) : completeList.filter((file) => file.folder_id == null)
        : Array.isArray(folderFiles)
          ? folderFiles.map((item) => ({ ...item, is_favorite: favoriteIds.has(String(item.id)) }))
          : []
    );
  }

  async function handleFolderSelect(folderId) {
    if (openingFolderId !== null) return;
    setError("");
    setOpeningFolderId(folderId ?? "root");

    try {
      const folder = folderId == null
        ? null
        : folders.find((item) => Number(item.id) === Number(folderId));
      if (folderId != null && !folder) {
        throw new Error("Folder not found. Refresh and try again.");
      }

      // Start the password flow directly from the card click. Do not issue a
      // contents request using a cached unlock state before this verification.
      const unlockToken = folder?.is_password_protected
        ? await askForFolderPassword(folder, true)
        : null;
      if (folder?.is_password_protected && !unlockToken) {
        throw new Error("Folder access cancelled.");
      }

      await refreshFolderFiles(folderId, unlockToken);

      setSelectedFileIds([]);
      setDraggedFileIds([]);
      setDropTargetKey("");
      setShowBulkDeleteModal(false);
      setShowMoveModal(false);

      setActiveFolderId(folderId);
      setSearch("");
      setActiveTab("All files");
    } catch (err) {
      if (err.response?.status === 401) {
        clearSession();
        navigate("/login", { replace: true });
        return;
      }

      if (err.response?.status === 403 && folderId != null) {
        clearFolderPassword(folderId);
      }

      if (err.message !== "Folder access cancelled.") {
        setError(
          getApiErrorMessage(err) || err.message || "Could not open folder."
        );
      }
    } finally {
      setOpeningFolderId(null);
    }
  }

  // --------------------------------------------------
  // CREATE FOLDER
  // --------------------------------------------------

  async function handleCreateFolder(event) {
    event.preventDefault();

    const name = newFolderName.trim();

    if (!name || folderBusy) return;

    const protect = await openDialog({
      type: "choice",
      title: "Protect your folder?",
      description:
        "Choose whether this folder should require a password.",
      confirmText: "Set password",
      cancelText: "Create without password",
    });

    if (protect === null) return;

    let password = null;

    if (protect === "yes") {
      password = await openDialog({
        type: "password-confirm",
        title: "Set folder password",
        description: "Create a password between 8 and 128 characters.",
        confirmText: "Create folder",
      });

      if (!password) return;
    }

    setFolderBusy(true);
    setError("");

    try {
      const folder = await createFolder(name, password);

      setFolders((current) =>
        [...current, folder].sort((a, b) =>
          (a.name || "").localeCompare(b.name || "")
        )
      );

      setNewFolderName("");
    } catch (err) {
      if (err.response?.status === 401) {
        clearSession();
        navigate("/login", { replace: true });
        return;
      }

      setError(getApiErrorMessage(err) || "Could not create folder.");
    } finally {
      setFolderBusy(false);
    }
  }

  // --------------------------------------------------
  // DELETE FOLDER
  // --------------------------------------------------

  function handleDeleteFolder(folder) {
    setFolderToDelete(folder);
    setDeleteChoice("keep_files");
    setConfirmPermanentDelete(false);
    setError("");
  }

  async function confirmDeleteFolder() {
    if (!folderToDelete || folderBusy) return;

    if (deleteChoice === "delete_files" && !confirmPermanentDelete) {
      return;
    }

    const folder = folderToDelete;
    const password = await askForFolderPassword(folder);

    if (folder.is_password_protected && !password) return;

    setFolderBusy(true);
    setError("");

    try {
      await deleteFolder(folder.id, deleteChoice, password);

      setFolders((current) =>
        current.filter(
          (item) => Number(item.id) !== Number(folder.id)
        )
      );

      clearFolderPassword(folder.id);

      const wasActive =
        Number(activeFolderId) === Number(folder.id);

      if (wasActive) {
        setActiveFolderId(null);
        setSelectedFileIds([]);
        setShowBulkDeleteModal(false);
        setShowMoveModal(false);
      }

      await refreshFolderFiles(wasActive ? null : activeFolderId);

      setFolderToDelete(null);
    } catch (err) {
      setError(getApiErrorMessage(err) || "Could not delete folder.");
    } finally {
      setFolderBusy(false);
    }
  }

  // --------------------------------------------------
  // RENAME FOLDER
  // --------------------------------------------------

  async function handleRenameFolder(folder) {
    if (folderBusy) return;

    const password = await askForFolderPassword(folder);

    if (folder.is_password_protected && !password) return;

    const name = await openDialog({
      type: "text",
      title: "Rename folder",
      description: "Enter a new name for this folder.",
      label: "Folder name",
      defaultValue: folder.name,
      confirmText: "Save changes",
    });

    if (
      !name?.trim() ||
      name.trim() === folder.name ||
      folderBusy
    ) {
      return;
    }

    setFolderBusy(true);
    setError("");

    try {
      const updated = await renameFolder(
        folder.id,
        name.trim(),
        password
      );

      setFolders((current) =>
        current
          .map((item) =>
            Number(item.id) === Number(updated.id) ? updated : item
          )
          .sort((a, b) =>
            (a.name || "").localeCompare(b.name || "")
          )
      );
    } catch (err) {
      if (err.response?.status === 403) {
        clearFolderPassword(folder.id);
      }

      setError(getApiErrorMessage(err) || "Could not rename folder.");
    } finally {
      setFolderBusy(false);
    }
  }

  // --------------------------------------------------
  // UPLOAD FILES
  // --------------------------------------------------

  async function handleUpload(event) {
    const input = event.target;
    const selectedFiles = Array.from(input.files || []);

    if (!selectedFiles.length) return;

    let folderPassword = null;

    if (activeFolder?.is_password_protected) {
      folderPassword = await askForFolderPassword(activeFolder);

      if (!folderPassword) {
        input.value = "";
        return;
      }
    }

    const protectFiles = await openDialog({
      type: "choice",
      title: "Protect uploaded files?",
      description:
        "Choose whether every selected file should require its own password.",
      confirmText: "Set password",
      cancelText: "Upload without password",
    });

    if (protectFiles === null) {
      input.value = "";
      return;
    }

    let filePassword = null;

    if (protectFiles === "yes") {
      filePassword = await openDialog({
        type: "password-confirm",
        title: "Set file password",
        description:
          "This password will be applied to every file in this upload.",
        confirmText: "Continue",
      });

      if (!filePassword) {
        input.value = "";
        return;
      }
    }

    setError("");
    setUploading(true);
    setUploadProgress(0);

    try {
      for (const [index, file] of selectedFiles.entries()) {
        await uploadFile(
          file,
          (progressEvent) => {
            if (!progressEvent.total) return;

            const progress =
              progressEvent.loaded / progressEvent.total;

            setUploadProgress(
              Math.round(
                ((index + progress) / selectedFiles.length) * 100
              )
            );
          },
          activeFolderId,
          filePassword,
          folderPassword
        );
      }

      await refreshFolderFiles(activeFolderId, folderPassword);
      await refreshDashboardPanels();
      setUploadProgress(100);
    } catch (err) {
      if (err.response?.status === 401) {
        clearSession();
        navigate("/login", { replace: true });
        return;
      }

      setError(getApiErrorMessage(err) || "Upload failed.");
    } finally {
      setUploading(false);
      input.value = "";
    }
  }

  // --------------------------------------------------
  // DOWNLOAD FILE
  // --------------------------------------------------

  async function handlePreview(file) {
    if (file.is_previewable === false) {
      setError("This file type cannot be previewed in TrustShare.");
      return;
    }

    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreview({
      file,
      url: null,
      contentType: file.content_type || "application/octet-stream",
      loading: true,
      error: "",
    });

    try {
      setError("");

      const folderPassword = await getParentFolderPassword(file);

      if (
        file.folder_id != null &&
        file.is_parent_folder_password_protected &&
        !folderPassword
      ) {
        closePreview();
        return;
      }

      let filePassword = null;

      if (file.is_password_protected) {
        filePassword = await askForFilePassword(file, "Preview");

        if (!filePassword) {
          closePreview();
          return;
        }
      }

      const response = file.share_id
        ? await previewSharedFile(
            file.share_token,
            filePassword,
            folderPassword
          )
        : await previewFile(
            file.id,
            filePassword,
            folderPassword
          );

      if (requestId !== previewRequestRef.current) return;
      const previewUrl = URL.createObjectURL(response.data);
      previewUrlRef.current = previewUrl;
      setPreview({
        file,
        url: previewUrl,
        contentType: response.headers?.["content-type"] || file.content_type || "application/octet-stream",
        loading: false,
        error: "",
      });
    } catch (err) {
      if (requestId === previewRequestRef.current) {
        setPreview((current) => current ? {
          ...current,
          loading: false,
          error: getApiErrorMessage(err) || "Could not preview this file.",
        } : current);
      }
    }
  }

  async function handleDownload(file) {
    setError("");

    try {
      const folderPassword = await getParentFolderPassword(file);

      if (file.folder_id != null) {
        const parent = folders.find(
          (folder) => Number(folder.id) === Number(file.folder_id)
        );

        if ((file.is_parent_folder_password_protected || parent?.is_password_protected) && !folderPassword) return;
      }

      let filePassword = null;

      if (file.is_password_protected) {
        filePassword = await askForFilePassword(file, "Download");

        if (!filePassword) return;
      }

      setDownloadingFileId(file.id);
      const response = file.share_id
        ? await downloadSharedFile(file.share_token, filePassword, folderPassword)
        : await downloadFile(file.id, filePassword, folderPassword);

      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = file.original_name || "download";

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      if (err.response?.status === 401) {
        clearSession();
        navigate("/login", { replace: true });
        return;
      }

      setError(
        getApiErrorMessage(err) || "Could not download this file."
      );
    } finally {
      setDownloadingFileId(null);
    }
  }

  // --------------------------------------------------
  // DELETE SINGLE FILE
  // --------------------------------------------------

  function handleDelete(file) {
    setFileToDelete(file);
    setError("");
  }

async function confirmDeleteFile() {
  if (!fileToDelete || fileDeleteBusy) return;

  const file = fileToDelete;
  let folderPassword;
  let filePassword = null;

  const parent =
    file.folder_id == null
      ? null
      : folders.find(
          (folder) => Number(folder.id) === Number(file.folder_id)
        );

  try {
    // Step 1: Get the parent folder unlock token when required.
    folderPassword = await getParentFolderPassword(file);

    if (
      file.folder_id != null &&
      (file.is_parent_folder_password_protected ||
        parent?.is_password_protected) &&
      !folderPassword
    ) {
      return;
    }

    // Step 2: Ask for the file password when required.
    if (file.is_password_protected) {
      filePassword = await askForFilePassword(file, "Delete");

      if (!filePassword) return;
    }

    // The existing Delete modal already confirms this action.
    // Do not open a second confirmation dialog.
    setFileDeleteBusy(true);
    setError("");

    await deleteFile(file.id, filePassword, folderPassword);

    // Refresh the current file list after successful deletion.
    await refreshFolderFiles(activeFolderId);

    setSelectedFileIds((current) =>
      current.filter((id) => id !== String(file.id))
    );

    setFileToDelete(null);
  } catch (err) {
    setError(
      getApiErrorMessage(err) || "Could not delete this file."
    );
  } finally {
    setFileDeleteBusy(false);
  }
}

  // --------------------------------------------------
  // FILE SELECTION
  // --------------------------------------------------

  function handleFileSelection(fileId, checked) {
    const id = String(fileId);

    setSelectedFileIds((current) => {
      if (checked) {
        return current.includes(id) ? current : [...current, id];
      }

      return current.filter((selectedId) => selectedId !== id);
    });
  }

  function handleSelectAllVisible(checked) {
    const visibleIds = visibleFiles.map((file) => String(file.id));

    setSelectedFileIds((current) => {
      if (checked) {
        return [...new Set([...current, ...visibleIds])];
      }

      return current.filter((id) => !visibleIds.includes(id));
    });
  }

  // --------------------------------------------------
  // BULK DELETE
  // --------------------------------------------------

  async function confirmBulkDelete() {
    if (!selectedFileIds.length || fileDeleteBusy) return;

    const idsToDelete = [...selectedFileIds];
    const failedIds = [];

    setFileDeleteBusy(true);
    setError("");

    try {
      for (const id of idsToDelete) {
        const file = allFiles.find(
          (item) => String(item.id) === String(id)
        );

        if (!file) {
          failedIds.push(id);
          continue;
        }

        const parent = file.folder_id == null
          ? null
          : folders.find(
              (folder) => Number(folder.id) === Number(file.folder_id)
            );

        let folderPassword = null;
        let filePassword = null;

        if (parent?.is_password_protected) {
          folderPassword = await getParentFolderPassword(file);

          if (!folderPassword) {
            failedIds.push(id);
            continue;
          }
        }

        if (file.is_password_protected) {
          filePassword = await askForFilePassword(file, "Delete");

          if (!filePassword) {
            failedIds.push(id);
            continue;
          }
        }

        try {
          await deleteFile(id, filePassword, folderPassword);
        } catch (err) {
          if (err.response?.status === 401) {
            clearSession();
            navigate("/login", { replace: true });
            return;
          }

          failedIds.push(id);
        }
      }

      await refreshFolderFiles(activeFolderId);

      if (failedIds.length) {
        setSelectedFileIds(failedIds);
        setError(
          `Could not delete ${failedIds.length} file(s). They remain selected so you can retry.`
        );
      } else {
        setSelectedFileIds([]);
        setShowBulkDeleteModal(false);
      }
    } catch (err) {
      setError(getApiErrorMessage(err) || "Bulk delete failed.");
    } finally {
      setFileDeleteBusy(false);
    }
  }

  // --------------------------------------------------
  // MOVE FILES
  // --------------------------------------------------

  async function confirmMoveFiles() {
    if (!selectedFileIds.length || moveBusy) return;

    const destinationId =
      moveDestinationId === "root" ? null : Number(moveDestinationId);

    const selectedFiles = selectedFileIds
      .map((id) =>
        allFiles.find((file) => String(file.id) === String(id))
      )
      .filter(Boolean);

    const filesToMove = selectedFiles.filter((file) => {
      const currentId =
        file.folder_id == null ? null : Number(file.folder_id);

      return currentId !== destinationId;
    });

    if (!filesToMove.length) {
      setError("The selected files are already in that destination.");
      return;
    }

    const destination = destinationId == null
      ? null
      : folders.find(
          (folder) => Number(folder.id) === destinationId
        );

    let destinationPassword = null;

    if (destination?.is_password_protected) {
      destinationPassword = await askForFolderPassword(destination);

      if (!destinationPassword) return;
    }

    setMoveBusy(true);
    setError("");

    const failedIds = [];

    try {
      for (const file of filesToMove) {
        const sourceFolder = file.folder_id == null
          ? null
          : folders.find(
              (folder) =>
                Number(folder.id) === Number(file.folder_id)
            );

        let sourceFolderPassword = null;
        let filePassword = null;

        if (sourceFolder?.is_password_protected) {
          sourceFolderPassword =
            await askForFolderPassword(sourceFolder);

          if (!sourceFolderPassword) {
            failedIds.push(String(file.id));
            continue;
          }
        }

        if (file.is_password_protected) {
          filePassword = await askForFilePassword(file, "Move");

          if (!filePassword) {
            failedIds.push(String(file.id));
            continue;
          }
        }

        try {
          await moveFile(
            Number(file.id),
            destinationId,
            filePassword,
            destinationPassword,
            sourceFolderPassword
          );
        } catch (err) {
          if (err.response?.status === 401) {
            clearSession();
            navigate("/login", { replace: true });
            return;
          }

          failedIds.push(String(file.id));
        }
      }

      await refreshFolderFiles(activeFolderId);

      if (failedIds.length) {
        setSelectedFileIds(failedIds);
        setError(
          `${failedIds.length} file(s) could not be moved. They remain selected.`
        );
      } else {
        setSelectedFileIds([]);
        setShowMoveModal(false);
      }
    } catch (err) {
      setError(getApiErrorMessage(err) || "Could not move files.");
    } finally {
      setMoveBusy(false);
    }
  }

  // --------------------------------------------------
  // DRAG AND DROP
  // --------------------------------------------------

  function handleFileDragStart(event, file) {
    if (fileDeleteBusy || moveBusy || uploading) {
      event.preventDefault();
      return;
    }

    const fileId = String(file.id);

    const idsToDrag = selectedFileIds.includes(fileId)
      ? [...selectedFileIds]
      : [fileId];

    setDraggedFileIds(idsToDrag);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", idsToDrag.join(","));
  }

  function handleFileDragEnd() {
    setDraggedFileIds([]);
    setDropTargetKey("");
  }

  function handleFolderDragOver(event, destinationId) {
    event.preventDefault();

    if (fileDeleteBusy || moveBusy || uploading) return;

    event.dataTransfer.dropEffect = "move";

    setDropTargetKey(
      destinationId === null ? "root" : String(destinationId)
    );
  }

  function handleFolderDragLeave(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setDropTargetKey("");
    }
  }

  function handleFolderDrop(event, destinationId) {
    event.preventDefault();
    event.stopPropagation();

    if (fileDeleteBusy || moveBusy || uploading) return;

    const raw = event.dataTransfer.getData("text/plain");

    const ids = raw
      ? [...new Set(raw.split(",").filter(Boolean))]
      : [...draggedFileIds];

    setDropTargetKey("");
    setDraggedFileIds([]);

    const existingIds = ids.filter((id) =>
      allFiles.some((file) => String(file.id) === String(id))
    );

    if (!existingIds.length) {
      setError("Could not identify the dragged files.");
      return;
    }

    setSelectedFileIds(existingIds);

    setMoveDestinationId(
      destinationId === null ? "root" : String(destinationId)
    );

    setError("");
    setShowMoveModal(true);
  }

  // --------------------------------------------------
  // SHARE
  // --------------------------------------------------

  async function handleShare(file) {
    let folderPassword = null;
    try {
      if (file.is_parent_folder_password_protected || folders.find((folder) => Number(folder.id) === Number(file.folder_id))?.is_password_protected) {
        folderPassword = await getParentFolderPassword(file);
        if (!folderPassword) return;
      }
      const recipient = await openDialog({ type: "text", title: "Share file", description: `Enter the recipient's email to share "${file.original_name}".`, label: "Recipient email", confirmText: "Share", cancelText: "Cancel" });
      if (!recipient) return;
      const permission = await openDialog({ type: "permission", title: "Set file access", description: "Choose whether the recipient can preview the file or also download it.", label: "Recipient permission", defaultValue: "view", confirmText: "Continue", cancelText: "Cancel" });
      if (!permission) return;
      const expiryInput = await openDialog({ type: "optional-date", title: "Set link expiry", description: "Leave blank for no expiry. The link will stop working at the selected local time.", label: "Expires at (optional)", confirmText: "Create secure link", cancelText: "Cancel" });
      if (expiryInput === null) return;
      const expiresAt = expiryInput ? new Date(expiryInput).toISOString() : null;
      const result = await shareFile(file.id, recipient, folderPassword, permission, expiresAt);
      await refreshDashboardPanels();
      setError(result.email_sent
        ? `Gmail accepted the invitation for sending to ${recipient}. Inbox delivery is not confirmed.`
        : `File access was created for ${recipient}, but the invitation email failed: ${result.email_error} Select Share again to retry the invitation.`);
    } catch (err) {
      setError(getApiErrorMessage(err) || "Could not share this file.");
    }
  }

  async function refreshFavorites() {
    const result = await listFavorites();
    const rows = Array.isArray(result) ? result : [];
    setFavorites(rows);
    const fileIds = new Set(rows.filter((entry) => entry.kind === "file").map((entry) => String(entry.id)));
    setAllFiles((current) => current.map((file) => ({ ...file, is_favorite: fileIds.has(String(file.id)) })));
    setFiles((current) => current.map((file) => ({ ...file, is_favorite: fileIds.has(String(file.id)) })));
    return rows;
  }

  async function toggleFileFavorite(file) {
    const key = `file:${file.id}`;
    if (favoriteBusy) return;
    setFavoriteBusy(key);
    try {
      if (file.is_favorite) await removeFileFavorite(file.id);
      else await addFileFavorite(file.id);
      await refreshFavorites();
      setError(file.is_favorite ? "Removed from Favorites." : "Added to Favorites.");
    } catch (err) {
      setError(getApiErrorMessage(err) || "Could not update this favorite.");
    } finally {
      setFavoriteBusy("");
    }
  }

  async function toggleFolderFavorite(folder) {
    const key = `folder:${folder.id}`;
    if (favoriteBusy) return;
    setFavoriteBusy(key);
    try {
      const saved = favorites.some((entry) => entry.kind === "folder" && String(entry.id) === String(folder.id));
      if (saved) await removeFolderFavorite(folder.id);
      else await addFolderFavorite(folder.id);
      await refreshFavorites();
      setError(saved ? "Folder removed from Favorites." : "Folder added to Favorites.");
    } catch (err) {
      setError(getApiErrorMessage(err) || "Could not update this folder favorite.");
    } finally {
      setFavoriteBusy("");
    }
  }

  async function handleConnectGmail() {
    try {
      await startGoogleGmailConnect();
    } catch (err) {
      setError(getApiErrorMessage(err) || "Could not start Gmail authorization.");
    }
  }

  async function refreshGmailStatus() {
    try {
      setGmailStatus(await getGoogleGmailStatus());
      setGmailStatusError("");
    } catch (err) {
      setGmailStatus(null);
      setGmailStatusError(getApiErrorMessage(err) || "Gmail connection status is unavailable.");
    }
  }

  async function handleRevokeSharedEntry(entry) {
    if (shareMutationBusy || entry.access_status !== "Active") return;
    const confirmed = await openDialog({ type: "choice", title: "Revoke shared access?", description: `${entry.recipient_email} will lose access to ${entry.item_type === "folder" ? "this folder and its files" : "this file"}. Ownership and the original password will remain unchanged.`, confirmText: "Revoke access", cancelText: "Keep access" });
    if (confirmed !== "yes") return;
    setShareMutationBusy(true);
    try {
      if (entry.item_type === "folder") await revokeFolderAccess(entry.folder_id, entry.id);
      else await revokeFileShare(entry.file_id, entry.id);
      await refreshDashboardPanels();
      setError(`Access revoked for ${entry.recipient_email}.`);
    } catch (err) {
      setError(getApiErrorMessage(err) || "Could not revoke access.");
    } finally {
      setShareMutationBusy(false);
    }
  }

  async function handleCopyShareLink(entry) {
      if (!entry.share_token) {
        setError("This sharing record does not have a link available.");
        return;
      }
      try {
        await navigator.clipboard.writeText(`${window.location.origin}/shared/${entry.share_token}`);
        setError(`Copied the link for ${entry.recipient_email}.`);
      } catch {
        setError("Could not copy the sharing link. Copy it from the browser address bar instead.");
      }
    }

  async function handleUpdateSharedEntry(entry) {
      if (shareMutationBusy || entry.item_type !== "file" || !["Active", "Expired"].includes(entry.access_status)) return;
      const permission = await openDialog({
        type: "permission",
        title: "Update file access",
        description: `Choose the access that ${entry.recipient_email} should have.`,
        label: "Recipient permission",
        defaultValue: entry.permission,
        confirmText: "Continue",
        cancelText: "Cancel",
      });
      if (!permission) return;
      const expiryInput = await openDialog({
        type: "optional-date",
        title: "Update link expiry",
        description: "Leave blank for no expiry.",
        label: "Expires at (optional)",
        defaultValue: entry.expires_at ? (() => { const expiryDate = new Date(entry.expires_at); return new Date(expiryDate.getTime() - expiryDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16); })() : "",
        confirmText: "Save changes",
        cancelText: "Cancel",
      });
      if (expiryInput === null) return;
      setShareMutationBusy(true);
      try {
        await updateFileShare(entry.file_id, entry.id, permission, expiryInput ? new Date(expiryInput).toISOString() : null);
        await refreshDashboardPanels();
        setError(`Updated access for ${entry.recipient_email}.`);
      } catch (err) {
        setError(getApiErrorMessage(err) || "Could not update file access.");
      } finally {
        setShareMutationBusy(false);
    }
  }

  async function loadFolderAccess(folder) {
    setAccessLoading(true);
    try {
      const result = await getFolderAccess(folder.id);
      setFolderAccess(result.access || []);
      setAccessExpiryEdits(Object.fromEntries((result.access || []).map((entry) => [
        entry.id,
        entry.expires_at ? new Date(entry.expires_at).toISOString().slice(0, 16) : "",
      ])));
      setAccessPermissionEdits(Object.fromEntries((result.access || []).map((entry) => [entry.id, entry.permission])));
    } catch (err) {
      setError(getApiErrorMessage(err) || "Could not load folder access.");
      setAccessFolder(null);
    } finally {
      setAccessLoading(false);
    }
  }

  async function handleManageFolderAccess(folder) {
    setAccessFolder(folder);
    setFolderAccess([]);
    setAccessEmail("");
    setAccessExpiry("");
    setAccessPermission("viewer");
    await loadFolderAccess(folder);
  }

  async function handleGrantFolderAccess(event) {
    event.preventDefault();
    if (!accessFolder || accessBusy) return;
    let folderPassword = null;
    if (accessFolder.is_password_protected) {
      folderPassword = await askForFolderPassword(accessFolder);
      if (!folderPassword) return;
    }
    setAccessBusy(true);
    try {
      const result = await grantFolderAccess(
        accessFolder.id,
        accessEmail.trim(),
        accessPermission,
        accessExpiry ? new Date(accessExpiry).toISOString() : null,
        folderPassword
      );
      setError(result.email_sent
        ? `Folder access granted to ${result.recipient_email}. The invitation email was sent.`
        : `Folder access is active for ${result.recipient_email}, but the invitation email failed: ${result.email_error || "Connect Gmail and retry."}`);
      setAccessEmail("");
      setAccessExpiry("");
      await loadFolderAccess(accessFolder);
      await refreshDashboardPanels();
    } catch (err) {
      setError(getApiErrorMessage(err) || "Could not grant folder access.");
    } finally {
      setAccessBusy(false);
    }
  }

  async function handleUpdateFolderAccess(entry) {
    if (!accessFolder || accessBusy) return;
    const confirmed = await openDialog({
      type: "choice",
      title: "Update folder access?",
      description: `Save the access settings for ${entry.recipient_email}?`,
      confirmText: "Save changes",
      cancelText: "Cancel",
    });
    if (confirmed !== "yes") return;
    setAccessBusy(true);
    try {
      const value = accessExpiryEdits[entry.id];
      await updateFolderAccess(accessFolder.id, entry.id, accessPermissionEdits[entry.id] || entry.permission, value ? new Date(value).toISOString() : null);
      await loadFolderAccess(accessFolder);
      await refreshDashboardPanels();
      setError("Folder access settings updated.");
    } catch (err) {
      setError(getApiErrorMessage(err) || "Could not update folder access.");
    } finally {
      setAccessBusy(false);
    }
  }

  async function handleRevokeFolderAccess(entry) {
    if (!accessFolder || accessBusy) return;
    const confirmed = await openDialog({
      type: "choice",
      title: "Revoke folder access?",
      description: `${entry.recipient_email} will lose access to this folder and its files. The files will remain in the folder.`,
      confirmText: "Revoke access",
      cancelText: "Cancel",
    });
    if (confirmed !== "yes") return;
    setAccessBusy(true);
    try {
      await revokeFolderAccess(accessFolder.id, entry.id);
      await loadFolderAccess(accessFolder);
      await refreshDashboardPanels();
      setError(`Folder access revoked for ${entry.recipient_email}.`);
      if (Number(activeFolderId) === Number(accessFolder.id)) {
        await handleFolderSelect(null);
      }
    } catch (err) {
      setError(getApiErrorMessage(err) || "Could not revoke folder access.");
    } finally {
      setAccessBusy(false);
    }
  }

  async function handleSharedWithMe() {
    navigate("/dashboard/shared");
  }

  async function handleRevokeShare(file) {
    try {
      const shares = await listFileShares(file.id);
      if (!shares.length) {
        setError("This file has no active shares.");
        return;
      }
      const recipient = await openDialog({
        type: "text",
        title: "Revoke file access",
        description: `Active recipients: ${shares.map((share) => share.recipient_email).join(", ")}. Enter the email to revoke.`,
        label: "Recipient email",
        confirmText: "Revoke access",
        cancelText: "Cancel",
      });
      if (!recipient) return;
      const share = shares.find((item) => item.recipient_email.toLowerCase() === recipient.trim().toLowerCase());
      if (!share) {
        setError("That email does not have an active share for this file.");
        return;
      }
      await revokeFileShare(file.id, share.id);
      await refreshDashboardPanels();
      setError("File access revoked.");
    } catch (err) {
      setError(getApiErrorMessage(err) || "Could not revoke file access.");
    }
  }

  async function retryStorageSummary() {
    try {
      setStorageSummary(await getStorageSummary());
    } catch (err) {
      setStorageSummary(null);
      setError(getApiErrorMessage(err) || "Storage summary is unavailable.");
    }
  }

  async function refreshDashboardPanels() {
    const refreshSequence = ++dashboardPanelRefreshSequence.current;
    setDashboardPanelLoading({ uploads: true, activity: true, shares: true });
    const [uploadsResult, activityResult, sharesResult] = await Promise.allSettled([
      getRecentUploads(), getDashboardActivity(), getDashboardShares(),
    ]);
    if (refreshSequence !== dashboardPanelRefreshSequence.current) return;
    setRecentUploads(uploadsResult.status === "fulfilled" ? uploadsResult.value : null);
    setActivityEntries(activityResult.status === "fulfilled" ? activityResult.value : null);
    setRecentHasMore(uploadsResult.status === "fulfilled" && uploadsResult.value.length === 20);
    setActivityHasMore(activityResult.status === "fulfilled" && activityResult.value.length === 20);
    setShareDashboard(sharesResult.status === "fulfilled" ? sharesResult.value : null);
    setDashboardPanelErrors({
      uploads: uploadsResult.status === "rejected" ? getApiErrorMessage(uploadsResult.reason) || "Could not load recent uploads." : "",
      activity: activityResult.status === "rejected" ? getApiErrorMessage(activityResult.reason) || "Could not load account activity." : "",
      shares: sharesResult.status === "rejected" ? getApiErrorMessage(sharesResult.reason) || "Could not load sharing records." : "",
    });
    setDashboardPanelLoading({ uploads: false, activity: false, shares: false });
  }

  async function refreshDashboardActivity() {
    setDashboardPanelLoading((current) => ({ ...current, activity: true }));
    try {
      const entries = await getDashboardActivity();
      setActivityEntries(entries);
      setActivityHasMore(entries.length === 20);
      setDashboardPanelErrors((current) => ({ ...current, activity: "" }));
    } catch (err) {
      setActivityEntries(null);
      setDashboardPanelErrors((current) => ({ ...current, activity: getApiErrorMessage(err) || "Could not load account activity." }));
    } finally {
      setDashboardPanelLoading((current) => ({ ...current, activity: false }));
    }
  }

  async function refreshDashboardShares() {
    setDashboardPanelLoading((current) => ({ ...current, shares: true }));
    try {
      setShareDashboard(await getDashboardShares());
      setDashboardPanelErrors((current) => ({ ...current, shares: "" }));
    } catch (err) {
      setShareDashboard(null);
      setDashboardPanelErrors((current) => ({ ...current, shares: getApiErrorMessage(err) || "Could not load sharing records." }));
    } finally {
      setDashboardPanelLoading((current) => ({ ...current, shares: false }));
    }
  }

  async function loadMoreRecentUploads() {
    if (!recentHasMore || loadingMoreRecent) return;
    setLoadingMoreRecent(true);
    try {
      const next = await getRecentUploads(20, recentUploads?.length || 0);
      setRecentUploads((current) => [...(current || []), ...next]);
      setRecentHasMore(next.length === 20);
    } catch (err) {
      setDashboardPanelErrors((current) => ({ ...current, uploads: getApiErrorMessage(err) || "Could not load more recent uploads." }));
    } finally {
      setLoadingMoreRecent(false);
    }
  }

  async function loadMoreActivity() {
    if (!activityHasMore || loadingMoreActivity) return;
    setLoadingMoreActivity(true);
    try {
      const next = await getDashboardActivity(20, activityEntries?.length || 0);
      setActivityEntries((current) => [...(current || []), ...next]);
      setActivityHasMore(next.length === 20);
    } catch (err) {
      setDashboardPanelErrors((current) => ({ ...current, activity: getApiErrorMessage(err) || "Could not load more activity." }));
    } finally {
      setLoadingMoreActivity(false);
    }
  }

  async function handleRetryInvitation(entry) {
    try {
      let folderPassword = null;
      const file = allFiles.find((candidate) => Number(candidate.id) === Number(entry.file_id));
      if (file && (file.is_parent_folder_password_protected || folders.find((folder) => Number(folder.id) === Number(file.folder_id))?.is_password_protected)) {
        folderPassword = await getParentFolderPassword(file);
        if (!folderPassword) return;
      }
      await retryShareInvitation(entry.file_id, entry.id, folderPassword);
      setError("Gmail accepted the invitation for sending. Inbox delivery is not confirmed.");
      await refreshDashboardPanels();
    } catch (err) {
      setError(getApiErrorMessage(err) || "Invitation retry failed.");
      await refreshDashboardPanels();
    }
  }

  async function handleSignOut() {
    try {
      await logoutUser();
    } catch {
      // Keep local sign-out available during a server outage.
    } finally {
      clearSession();
      navigate("/login", { replace: true });
    }
  }

  // --------------------------------------------------
  // DISPLAY HELPERS
  // --------------------------------------------------

  function formatSize(bytes) {
    const value = Number(bytes || 0);

    if (value < 1024) return `${value} B`;
    if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;

    if (value < 1024 ** 3) {
      return `${(value / 1024 ** 2).toFixed(2)} MB`;
    }

    return `${(value / 1024 ** 3).toFixed(2)} GB`;
  }

  function fileIcon(filename = "") {
    if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(filename)) return "IMG";
    if (/\.(xls|xlsx|csv)$/i.test(filename)) return "XLS";
    if (/\.(ppt|pptx)$/i.test(filename)) return "PPT";
    if (/\.(zip|rar|7z)$/i.test(filename)) return "ZIP";
    if (/\.pdf$/i.test(filename)) return "PDF";

    return "DOC";
  }

  const foldersForPage = folders.filter((folder) => viewingShared ? Boolean(folder.is_shared) : !folder.is_shared);
  const visibleFolders = foldersForPage.filter((folder) =>
    (folder.name || "")
      .toLowerCase()
      .includes(folderSearch.trim().toLowerCase())
  );

  const visibleFiles = [...files]
    .filter((file) => {
      const filename = file.original_name || "";

      const matchesSearch = filename
        .toLowerCase()
        .includes(search.trim().toLowerCase());

      const matchesTab =
        activeTab === "All files" ||
        (activeTab === "Documents" &&
          /\.(pdf|doc|docx|txt|ppt|pptx)$/i.test(filename)) ||
        (activeTab === "Images" &&
          /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(filename)) ||
        (activeTab === "Spreadsheets" &&
          /\.(xls|xlsx|csv)$/i.test(filename));

      return matchesSearch && matchesTab;
    })
    .sort((a, b) => {
      let comparison;

      if (sortBy === "name") {
        comparison = (a.original_name || "").localeCompare(
          b.original_name || ""
        );
      } else if (sortBy === "size") {
        comparison =
          Number(a.size_bytes || a.size || 0) -
          Number(b.size_bytes || b.size || 0);
      } else {
        comparison =
          new Date(a.created_at || 0).getTime() -
          new Date(b.created_at || 0).getTime();
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

  const allVisibleSelected =
    visibleFiles.length > 0 &&
    visibleFiles.every((file) =>
      selectedFileIds.includes(String(file.id))
    );

  const rootFileCount = allFiles.filter(
    (file) => file.folder_id == null
  ).length;

  const name = user?.full_name || user?.name || "there";

  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

  if (loading) {
    return (
      <main className="not-found">
        <Brand />
        <h1>Preparing your workspace...</h1>
      </main>
    );
  }

  return (
    <div
      className="workspace"
      onPointerMove={(event) => {
        if (event.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
        const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
        event.currentTarget.style.setProperty("--workspace-pointer-x", `${(x * 100).toFixed(1)}%`);
        event.currentTarget.style.setProperty("--workspace-pointer-y", `${(y * 100).toFixed(1)}%`);
      }}
      onPointerLeave={(event) => {
        event.currentTarget.style.setProperty("--workspace-pointer-x", "50%");
        event.currentTarget.style.setProperty("--workspace-pointer-y", "44%");
      }}
    >
      {sidebarOpen && <button className="workspace-sidebar-backdrop" type="button" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className={`workspace-sidebar${sidebarOpen ? " is-open" : ""}`} aria-label="Workspace navigation">
        <div className="workspace-sidebar-brand"><Brand /></div>
        <nav className="workspace-sidebar-nav">
          <p className="sidebar-label">Workspace</p>
          <button className={isOverviewPage ? "sidebar-item active" : "sidebar-item"} type="button" onClick={() => navigateSidebar("/dashboard")}><SidebarIcon name="dashboard"/><span className="sidebar-item-label">Dashboard</span></button>
          <button className={workspacePage === "files" ? "sidebar-item active" : "sidebar-item"} type="button" onClick={() => { setViewingShared(false); setActiveFolderId(null); setFiles(allFiles.filter((file) => file.folder_id == null)); navigateSidebar("/dashboard/files"); }}><SidebarIcon name="folder"/><span className="sidebar-item-label">My Files</span>{rootFileCount > 0 && <span className="sidebar-count">{rootFileCount}</span>}</button>
          <button className={workspacePage === "shared" ? "sidebar-item active" : "sidebar-item"} type="button" onClick={() => { handleSharedWithMe(); setSidebarOpen(false); }}><SidebarIcon name="users"/><span className="sidebar-item-label">Shared with Me</span></button>
          <button className={isSharedByMePage ? "sidebar-item active" : "sidebar-item"} type="button" onClick={() => navigateSidebar("/dashboard/shared-by-me")}><SidebarIcon name="share"/><span className="sidebar-item-label">Shared by Me</span></button>
          <p className="sidebar-label sidebar-group-label">Library</p>
          <button className={isRecentUploadsPage ? "sidebar-item active" : "sidebar-item"} type="button" onClick={() => navigateSidebar("/dashboard/recent-uploads")}><SidebarIcon name="clock"/><span className="sidebar-item-label">Recent</span></button>
          <button className={workspacePage === "favorites" ? "sidebar-item active" : "sidebar-item"} type="button" onClick={() => navigateSidebar("/dashboard/favorites")}><SidebarIcon name="star"/><span className="sidebar-item-label">Favorites</span></button>
          <button className={workspacePage === "trash" ? "sidebar-item active" : "sidebar-item"} type="button" onClick={() => navigateSidebar("/dashboard/trash")}><SidebarIcon name="trash"/><span className="sidebar-item-label">Trash</span></button>
          <p className="sidebar-label sidebar-group-label">Manage</p>
          <button className={workspacePage === "storage" ? "sidebar-item active" : "sidebar-item"} type="button" onClick={() => navigateSidebar("/dashboard/storage")}><SidebarIcon name="storage"/><span className="sidebar-item-label">Storage</span></button>
          <button className={workspacePage === "analytics" ? "sidebar-item active" : "sidebar-item"} type="button" onClick={() => navigateSidebar("/dashboard/analytics")}><SidebarIcon name="chart"/><span className="sidebar-item-label">File Analytics</span></button>
          <button className={isActivityPage ? "sidebar-item active" : "sidebar-item"} type="button" onClick={() => navigateSidebar("/dashboard/activity")}><SidebarIcon name="history"/><span className="sidebar-item-label">Activity Logs</span></button>
          <button className={isSecurityPage ? "sidebar-item active" : "sidebar-item"} type="button" onClick={() => navigateSidebar("/dashboard/security")}><SidebarIcon name="shield"/><span className="sidebar-item-label">Security</span></button>
          <button className="sidebar-item" type="button" onClick={() => navigateSidebar("/account")}><SidebarIcon name="settings"/><span className="sidebar-item-label">Settings</span></button>
          {user?.role === "super_admin" && <button className="sidebar-item" type="button" onClick={() => navigate("/admin")}><SidebarIcon name="shield"/><span className="sidebar-item-label">Admin dashboard</span></button>}
        </nav>
        <div className="sidebar-bottom"><div className="sidebar-storage-heading"><SidebarIcon name="storage"/><span>Storage</span><strong>{storageSummary ? `${Math.round(storageSummary.usage_percent || 0)}%` : "—"}</strong></div>{storageSummary ? <><div className="sidebar-storage-values">{formatSize(storageSummary.used_bytes)} <span>of {formatSize(storageSummary.total_bytes)}</span></div><div className="sidebar-storage-track" role="progressbar" aria-label="Storage used" aria-valuenow={storageSummary.usage_percent || 0} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${Math.min(100, Math.max(0, storageSummary.usage_percent || 0))}%` }}/></div></> : <p className="sidebar-storage-unavailable">Storage information unavailable</p>}<button className="sidebar-signout" onClick={handleSignOut}>Sign out</button></div>
      </aside>

      <main className="workspace-main">
        <header className="workspace-topbar">
          <button className="workspace-menu-toggle" type="button" aria-label="Open navigation" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(true)}><SidebarIcon name="menu"/></button>
          <div className="workspace-breadcrumb"><span className="eyebrow">YOUR WORKSPACE</span><p><strong>{isAnalyticsPage ? "File analytics" : isStoragePage ? "Storage" : isSecurityPage ? "Security" : isFavoritesPage ? "Favorites" : isTrashPage ? "Trash" : isSharedByMePage ? "Shared by me" : isRecentUploadsPage ? "Recent" : isActivityPage ? "Activity logs" : workspacePage === "shared" ? "Shared with me" : workspacePage === "files" ? activeFolder?.name || "My files" : activeFolder?.name || "Dashboard"}</strong></p></div>
          <label className="topbar-search"><SvgIcon name="search" /><input type="search" placeholder="Search files and folders" value={search} onChange={(event) => { setSearch(event.target.value); setFolderSearch(event.target.value); if (workspacePage !== "files" && workspacePage !== "shared") navigate("/dashboard/files"); }} aria-label="Search files and folders" /></label>
          <div className="workspace-user"><NotificationBell iconOnly /><details className="profile-menu"><summary><div className="user-avatar">{initials || "U"}</div><span><strong>{name}</strong><small>{user?.role || "user"}</small></span><b>⌄</b></summary><div className="profile-menu-popover"><span>{user?.email || ""}</span><button type="button" onClick={() => navigate("/account")}>Account settings</button><button type="button" onClick={handleSignOut}>Sign out</button></div></details></div>
        </header>

        {error && (
          <div className="workspace-notice" role="status">
            <span><SvgIcon name="shield" /></span>
            <p>{error}</p>
            {/Connect Gmail before sending|Reconnect Gmail|Gmail authorization/.test(error) && (
              <button type="button" className="button" onClick={handleConnectGmail}>
                Connect Gmail
              </button>
            )}
            <button
              type="button"
              onClick={() => setError("")}
              aria-label="Dismiss message"
            >
              <SvgIcon name="close" />
            </button>
          </div>
        )}

        {isOverviewPage && <section className="workspace-stat-grid">
          <article className="workspace-stat-card">
            <div className="stat-icon stat-teal"><SvgIcon name="folderOpen" /></div>
            <span>Total files</span>
            <strong>{allFiles.length}</strong>
            <small>Files in your workspace</small>
          </article>

          <article className="workspace-stat-card">
            <div className="stat-icon stat-purple"><SvgIcon name="storage" /></div>
            <span>Storage used</span>
            <strong>{storageSummary ? formatSize(storageSummary.used_bytes) : "Unavailable"}</strong>
            {storageSummary ? (
              <>
                <div className="storage-progress-track" role="progressbar" aria-valuenow={storageSummary.usage_percent || 0} aria-valuemin="0" aria-valuemax="100">
                  <div className="storage-progress-fill" style={{ width: `${Math.min(100, Math.max(0, storageSummary.usage_percent || 0))}%` }} />
                </div>
                <small>Remaining {formatSize(storageSummary.remaining_bytes)} / Total {formatSize(storageSummary.total_bytes)}</small>
              </>
            ) : (
              <small>Storage summary unavailable. <button type="button" onClick={retryStorageSummary}>Retry</button></small>
            )}
          </article>

          <article className="workspace-stat-card">
            <div className="stat-icon stat-orange"><SvgIcon name="folder" /></div>
            <span>Folders</span>
            <strong>{folders.length}</strong>
            <small>Your organized folders</small>
          </article>

          <article className="workspace-stat-card">
            <div className="stat-icon stat-green">?</div>
            <span>Active shares</span>
            <strong>{shareDashboard?.summary.active_recipient_shares ?? "—"}</strong>
            <small>People with access to your files</small>
          </article>
        </section>}

        {isOverviewPage && <section className="workspace-welcome"><div><span className="insights-eyebrow">GOOD TO SEE YOU</span><h1>Welcome back, {name.split(" ")[0]}.</h1><p>Your workspace is ready. Pick up where you left off or add something new.</p></div><div className="workspace-quick-actions"><button className="button button-primary" type="button" onClick={() => { quickUploadRequested.current = true; navigate("/dashboard/files"); }}>Upload files</button><button className="button" type="button" onClick={() => navigate("/dashboard/files")}>Create folder</button></div></section>}
        {isOverviewPage && <section className="workspace-files-card dashboard-detail-page"><div className="files-card-heading"><div><h2>Recent uploads</h2><p>Your latest files, including items uploaded into folders.</p></div><button type="button" className="button" onClick={refreshDashboardPanels}>Refresh</button></div>{dashboardPanelErrors.uploads && <p className="dashboard-empty" role="alert">{dashboardPanelErrors.uploads} <button type="button" className="button" onClick={refreshDashboardPanels}>Retry</button></p>}{recentUploads === null ? <p className="dashboard-empty">{dashboardPanelLoading.uploads ? "Loading recent uploads..." : "Recent uploads could not be loaded."}</p> : recentUploads.length === 0 ? <p className="dashboard-empty">No uploads yet.</p> : <div className="dashboard-activity-list">{recentUploads.slice(0, 5).map((entry) => <button className="dashboard-activity-row dashboard-upload-row" key={entry.id} type="button" onClick={() => handleDownload(entry)}><span><strong>{entry.original_name}</strong><small>{entry.folder_name ? `Folder: ${entry.folder_name} · ` : "All files · "}{new Date(entry.created_at).toLocaleString()}</small></span><span className="dashboard-activity-meta"><strong>{formatSize(entry.size_bytes)}</strong></span></button>)}</div>}{recentHasMore && <div className="dashboard-load-more"><button className="button" type="button" onClick={loadMoreRecentUploads} disabled={loadingMoreRecent}>{loadingMoreRecent ? "Loading..." : "Load more uploads"}</button></div>}<button type="button" className="workspace-recent-link" onClick={() => navigate("/dashboard/recent-uploads")}>View recent activity</button></section>}
        {isAnalyticsPage && <FileAnalyticsPage />}
        {isStoragePage && <StoragePage />}
        {isSecurityPage && <UserSecurityPage />}
        {isFavoritesPage && <section className="workspace-files-card dashboard-detail-page"><div className="files-card-heading"><div><h2>Favorites</h2><p>Files and folders saved to your account.</p></div><button type="button" className="button" onClick={() => refreshFavorites().catch((err) => setError(getApiErrorMessage(err)))}>Refresh</button></div>{favorites.length === 0 ? <div className="folder-empty"><span><SvgIcon name="star" /></span><h3>No favorites yet</h3><p>Use the star action on a file or folder to save it here.</p></div> : <div className="dashboard-activity-list">{favorites.map((entry) => <div className="dashboard-activity-row" key={`${entry.kind}-${entry.id}`}><span><strong>{entry.kind === "folder" ? `${entry.name}` : entry.original_name}</strong><small>{entry.kind === "folder" ? `Folder · ${entry.owner_name}${entry.is_shared ? ` · ${entry.permission}` : " · You own this"}` : `${formatSize(entry.size_bytes)} · ${entry.owner_name}${entry.is_shared ? " · Shared with you" : " · You own this"}`}</small></span><span className="workspace-file-actions">{entry.kind === "folder" ? <button type="button" onClick={() => navigate("/dashboard/files", { state: { openFolderId: entry.id } })}>Open folder</button> : <><button type="button" onClick={() => navigate(entry.is_shared && !entry.shared_folder_id ? "/dashboard/shared" : "/dashboard/files", entry.folder_id ? { state: { openFolderId: entry.folder_id } } : undefined)}>Open location</button><button type="button" onClick={() => handleDownload(entry)}>Download</button></>}<button type="button" disabled={favoriteBusy !== ""} onClick={() => entry.kind === "folder" ? toggleFolderFavorite(entry) : toggleFileFavorite({ ...entry, is_favorite: true })}>{favoriteBusy === `${entry.kind}:${entry.id}` ? "Saving…" : "Remove favorite"}</button></span></div>)}</div>}</section>}
        {isTrashPage && <section className="workspace-files-card dashboard-detail-page"><div className="files-card-heading"><div><h2>Trash</h2><p>TrustShare currently deletes files and folders permanently after confirmation.</p></div></div><div className="folder-empty"><span><SvgIcon name="trash" /></span><h3>Trash is not enabled</h3><p>Deleted records cannot be restored in this version. No items are stored in Trash, and nothing was changed.</p></div></section>}
        {isSharedByMePage && <section className="workspace-welcome"><div><span className="insights-eyebrow">COLLABORATION</span><h1>Shared by me</h1><p>Review your current sharing invitations and access status below.</p></div></section>}

        {isRecentUploadsPage && <section className="workspace-files-card dashboard-insight-card dashboard-detail-page">
          <div className="files-card-heading"><div><h2>Recent uploads</h2><p>Files recently uploaded to your workspace.</p></div><button type="button" className="button" onClick={refreshDashboardPanels}>Refresh</button></div>
          {dashboardPanelErrors.uploads && <p className="dashboard-empty" role="alert">{dashboardPanelErrors.uploads} <button type="button" className="button" onClick={refreshDashboardPanels}>Retry</button></p>}
          {recentUploads === null ? <p className="dashboard-empty">{dashboardPanelLoading.uploads ? "Loading recent uploads..." : "Recent uploads could not be loaded."}</p> : recentUploads.length === 0 ? <p className="dashboard-empty">No uploads yet.</p> : <div className="dashboard-activity-list">
            {recentUploads.map((entry) => <button className="dashboard-activity-row dashboard-upload-row" key={entry.id} type="button" onClick={() => handleDownload(entry)}><span><strong>{entry.original_name}</strong><small>{entry.folder_name ? `Folder: ${entry.folder_name} · ` : "All files · "}{new Date(entry.created_at).toLocaleString()}</small></span><span className="dashboard-activity-meta"><strong>{formatSize(entry.size_bytes)}</strong></span></button>)}
          </div>}
          {recentHasMore && <div className="dashboard-load-more"><button className="button" type="button" onClick={loadMoreRecentUploads} disabled={loadingMoreRecent}>{loadingMoreRecent ? "Loading..." : "Load more uploads"}</button></div>}
        </section>}

        {isActivityPage && <section className="workspace-files-card dashboard-insight-card dashboard-detail-page">
          <div className="files-card-heading"><div><h2>Activity log</h2><p>Recent actions recorded for your account.</p></div><button type="button" className="button" onClick={refreshDashboardPanels}>Refresh</button></div>
          {dashboardPanelErrors.activity && <p className="dashboard-empty" role="alert">{dashboardPanelErrors.activity} <button type="button" className="button" onClick={refreshDashboardActivity}>Retry</button></p>}
          {activityEntries === null ? <p className="dashboard-empty">{dashboardPanelLoading.activity ? "Loading activity log..." : "Activity log could not be loaded."}</p> : activityEntries.length === 0 ? <p className="dashboard-empty">No activity recorded yet.</p> : <div className="dashboard-activity-list">{activityEntries.map((entry) => <div className="dashboard-activity-row" key={entry.id}>
            <span><strong>{entry.action}{entry.target_name ? ` · ${entry.target_name}` : ""}</strong><small>{new Date(entry.created_at).toLocaleString()}</small></span>
            <span className={`dashboard-result dashboard-result-${entry.result.toLowerCase()}`}>{entry.result}</span>
          </div>)}</div>}
          {activityHasMore && <div className="dashboard-load-more"><button className="button" type="button" onClick={loadMoreActivity} disabled={loadingMoreActivity}>{loadingMoreActivity ? "Loading..." : "Load more activity"}</button></div>}
        </section>}

        {(isOverviewPage || isSharedByMePage) && <section className="workspace-files-card dashboard-shares-card">
          <div className="files-card-heading"><div><h2>Shared files</h2><p>Invitation status reflects Gmail provider acceptance, not inbox delivery.</p></div><button type="button" className="button" onClick={async () => { await refreshDashboardPanels(); await refreshGmailStatus(); }}>Refresh</button></div>
          <div className="gmail-connection-status" role="status">
            {gmailStatusError ? <span className="dashboard-error-text">{gmailStatusError}</span> : gmailStatus === null ? <span>Checking Gmail connection…</span> : gmailStatus.connected ? <span>Gmail connected{gmailStatus.sender_email ? ` as ${gmailStatus.sender_email}` : ""}.</span> : <span>Gmail is disconnected. File access permissions can still be created, but invitations cannot be emailed.</span>}
            <button type="button" className="button" onClick={handleConnectGmail}>{gmailStatus?.connected ? "Reconnect Gmail" : "Connect Gmail"}</button>
          </div>
          {dashboardPanelErrors.shares && <p className="dashboard-empty" role="alert">{dashboardPanelErrors.shares} <button type="button" className="button" onClick={refreshDashboardShares}>Retry</button></p>}
          {shareDashboard === null ? <p className="dashboard-empty">{dashboardPanelLoading.shares ? "Loading sharing records..." : "Sharing summary unavailable."}</p> : <>
            <div className="share-summary-grid">
              {[["Unique shared files", shareDashboard.summary.total_shared_files], ["Files with sent invitations", shareDashboard.summary.successfully_shared_files], ["Sent invitations", shareDashboard.summary.sent_emails], ["Pending invitations", shareDashboard.summary.pending_emails], ["Failed invitations", shareDashboard.summary.failed_emails], ["Active recipient shares", shareDashboard.summary.active_recipient_shares]].map(([title, count]) => <div className="share-summary-item" key={title}><small>{title}</small><strong>{count}</strong></div>)}
            </div>
            {shareDashboard.invitations.length > 1 && (() => {
              const completed = shareDashboard.invitations.filter((row) => ["sent", "failed"].includes(row.email_status)).length;
              const total = shareDashboard.invitations.length;
              const attempts = shareDashboard.invitations.reduce((sum, row) => sum + (Number(row.email_attempt_count) || 0), 0);
              return <div className="dashboard-progress"><span>{completed} of {total} invitation records resolved · {attempts} delivery attempts · {shareDashboard.summary.sent_emails} sent · {shareDashboard.summary.pending_emails} pending · {shareDashboard.summary.failed_emails} failed</span><div className="storage-progress-track" role="progressbar" aria-label="Resolved invitation records" aria-valuenow={Math.round((completed / total) * 100)} aria-valuemin="0" aria-valuemax="100"><div className="storage-progress-fill" style={{ width: `${Math.round((completed / total) * 100)}%` }} /></div></div>;
            })()}
            <div className="dashboard-share-filters">{["All", "Active", "Expired", "Revoked", "Sent", "Pending", "Failed"].map((filter) => <button type="button" className={shareFilter === filter ? "button button-primary" : "button"} key={filter} onClick={() => setShareFilter(filter)}>{filter}</button>)}</div>
            {shareDashboard.invitations.filter((entry) => shareFilter === "All" || (entry.item_type === "folder" ? entry.access_status === shareFilter : ["Active", "Expired", "Revoked"].includes(shareFilter) ? entry.access_status === shareFilter : shareFilter === "Pending" ? ["pending", "sending"].includes(entry.email_status) : entry.email_status === shareFilter.toLowerCase())).length === 0 ? <p className="dashboard-empty">No sharing records match this filter.</p> : (
              <div className="dashboard-share-list">{shareDashboard.invitations.filter((entry) => shareFilter === "All" || (entry.item_type === "folder" ? entry.access_status === shareFilter : ["Active", "Expired", "Revoked"].includes(shareFilter) ? entry.access_status === shareFilter : shareFilter === "Pending" ? ["pending", "sending"].includes(entry.email_status) : entry.email_status === shareFilter.toLowerCase())).map((entry) => <div className="dashboard-share-row" key={`${entry.item_type}-${entry.id}`}>
                <span><strong>{entry.file_name}</strong><small>{entry.item_type === "folder" ? "Folder" : `${entry.content_type || "File"} · File`} · {entry.recipient_email} · {new Date(entry.created_at).toLocaleString()}{entry.expires_at ? ` · Expires ${new Date(entry.expires_at).toLocaleString()}` : ""}{entry.email_attempt_count ? ` · ${entry.email_attempt_count} email attempt(s)` : ""}</small></span><span>{entry.permission}</span><span className={`dashboard-result dashboard-result-${entry.item_type === "folder" ? entry.access_status.toLowerCase() : entry.email_status}`}>{entry.item_type === "folder" ? "Email status not stored" : entry.email_status === "sent" ? "Gmail accepted" : entry.email_status}{entry.email_error_category ? ` · ${entry.email_error_category}` : ""}</span><span>{entry.access_status}</span>{entry.item_type === "file" && entry.share_token && <button type="button" className="button" onClick={() => handleCopyShareLink(entry)}>Copy link</button>}{entry.item_type === "file" && ["Active", "Expired"].includes(entry.access_status) && <button type="button" className="button" disabled={shareMutationBusy} onClick={() => handleUpdateSharedEntry(entry)}>Update access</button>}{entry.item_type === "file" && entry.email_status === "failed" && <button type="button" className="button" onClick={() => handleRetryInvitation(entry)}>Retry email</button>}{entry.access_status === "Active" && <button type="button" className="button" disabled={shareMutationBusy} onClick={() => handleRevokeSharedEntry(entry)}>{shareMutationBusy ? "Updating..." : "Revoke access"}</button>}
              </div>)}</div>
            )}
          </>}
        </section>}

        {isFilesPage && <>
        <section className="workspace-files-card folder-card">
          <div className="files-card-heading folder-heading">
            <div>
              <h2>{viewingShared ? "Shared with me" : activeFolder ? activeFolder.name : "My folders"}</h2>
              <p>
                {activeFolder
                  ? "You are viewing this folder's contents."
                  : "Keep related files together. Drag files onto a folder to move them."}
              </p>
            </div>

            {activeFolder ? (
              <button
                type="button"
                className="button"
                onClick={() => handleFolderSelect(null)}
              >
                <SvgIcon name="arrowLeft" /> Back to folders
              </button>
            ) : (
              <form
                className="folder-create-form"
                onSubmit={handleCreateFolder}
              >
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(event) =>
                    setNewFolderName(event.target.value)
                  }
                  placeholder="Enter folder name"
                  maxLength={255}
                  disabled={folderBusy}
                  aria-label="New folder name"
                />

                <button
                  className="button button-primary"
                  type="submit"
                  disabled={folderBusy || !newFolderName.trim()}
                >
                  {folderBusy ? "Please wait..." : "+ Create folder"}
                </button>
              </form>
            )}
          </div>

          {!activeFolder && (
            <>
              <label className="workspace-search folder-search">
                <SvgIcon name="search" />
                <input
                  type="search"
                  placeholder="Search folders..."
                  value={folderSearch}
                  onChange={(event) =>
                    setFolderSearch(event.target.value)
                  }
                />
              </label>

              <div className="folder-grid">
                <button
                  type="button"
                  className={
                    dropTargetKey === "root"
                      ? "folder-tile folder-tile-active folder-drop-target"
                      : "folder-tile"
                  }
                  onClick={() => handleFolderSelect(null)}
                  disabled={openingFolderId !== null}
                  onDragOver={(event) =>
                    handleFolderDragOver(event, null)
                  }
                  onDragLeave={handleFolderDragLeave}
                  onDrop={(event) => handleFolderDrop(event, null)}
                  title="Drop files here to move them to All files"
                >
                  <span className="folder-tile-icon all-files-icon"><SvgIcon name="folderOpen" /></span>
                  <span className="folder-tile-info">
                    <strong>{openingFolderId === "root" ? "Opening…" : viewingShared ? "Shared files" : "All files"}</strong>
                    <small>{openingFolderId === "root" ? "Loading contents" : `${viewingShared ? files.length : rootFileCount} ${viewingShared ? "shared items" : "files"}`}</small>
                  </span>
                  <span className="folder-tile-arrow">›</span>
                </button>

                {visibleFolders.map((folder) => {
                  const count = allFiles.filter(
                    (file) =>
                      Number(file.folder_id) === Number(folder.id)
                  ).length;

                  const isDropTarget =
                    dropTargetKey === String(folder.id);

                  return (
                    <article
                      className={
                        isDropTarget
                          ? "folder-tile folder-drop-target"
                          : "folder-tile"
                      }
                      key={folder.id}
                      onDragOver={folder.is_shared ? undefined : (event) =>
                        handleFolderDragOver(event, folder.id)
                      }
                      onDragLeave={folder.is_shared ? undefined : handleFolderDragLeave}
                      onDrop={folder.is_shared ? undefined : (event) =>
                        handleFolderDrop(event, folder.id)
                      }
                      title={folder.is_shared ? `Shared by another TrustShare user` : `Drop files here to move them into ${folder.name}`}
                    >
                      <button
                        type="button"
                        className="folder-open-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleFolderSelect(folder.id);
                      }}
                        disabled={folderBusy || openingFolderId !== null}
                      >
                        <span className="folder-tile-icon"><SvgIcon name="folder" /></span>
                        <span className="folder-tile-info">
                          <strong>
                            {Number(openingFolderId) === Number(folder.id)
                              ? `Opening ${folder.name}…`
                              : folder.name}
                            {folder.is_password_protected ? <SvgIcon name="shield" /> : ""}
                          </strong>
                          <small>
                            {Number(openingFolderId) === Number(folder.id)
                              ? "Loading contents"
                              : folder.is_shared ? `${folder.permission} access` : `${count} ${count === 1 ? "file" : "files"}`}
                          </small>
                        </span>
                      </button>

                      <button className="folder-favorite-toggle" type="button" aria-label={`${favorites.some((entry) => entry.kind === "folder" && String(entry.id) === String(folder.id)) ? "Remove" : "Add"} ${folder.name} favorite`} title="Toggle favorite" disabled={favoriteBusy !== ""} onClick={(event) => { event.stopPropagation(); toggleFolderFavorite(folder); }}><SvgIcon name={favorites.some((entry) => entry.kind === "folder" && String(entry.id) === String(folder.id)) ? "starFilled" : "star"} /></button>
                      {!folder.is_shared && <details className="folder-menu">
                        <summary aria-label={`Actions for ${folder.name}`} onClick={(event) => event.stopPropagation()}>
                          <SvgIcon name="more" />
                        </summary>

                        <div className="folder-menu-options">
                          <button
                            type="button"
                            onClick={() => handleManageFolderAccess(folder)}
                            disabled={folderBusy}
                          >
                            Manage Access
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRenameFolder(folder)}
                            disabled={folderBusy}
                          >
                            Rename
                          </button>

                          <button
                            type="button"
                            className="folder-delete-option"
                            onClick={() => handleDeleteFolder(folder)}
                            disabled={folderBusy}
                          >
                            Delete
                          </button>
                        </div>
                      </details>}
                    </article>
                  );
                })}
              </div>

              {foldersForPage.length === 0 && (
                <div className="folder-empty">
                  <span><SvgIcon name="folder" /></span>
                  <h3>{viewingShared ? "No folders shared with you" : "No folders yet"}</h3>
                  <p>{viewingShared ? "Folders shared with your account will appear here." : "Create your first folder to organize your files."}</p>
                </div>
              )}

              {foldersForPage.length > 0 && visibleFolders.length === 0 && (
                <p className="folder-no-results">
                  No folders match "{folderSearch}".
                </p>
              )}
            </>
          )}
        </section>

        <section className="workspace-files-card">
          <div className="files-card-heading">
            <div>
              <h2>
                {activeFolder ? `${activeFolder.name} files` : "Your files"}
              </h2>
              <p>
                {activeFolder
                  ? activeFolder.is_shared
                    ? activeFolder.permission === "editor"
                      ? "View, download, upload, and delete files shared with you."
                      : "View and download files shared with you."
                    : "Upload and manage files in this folder."
                  : "Search, sort, download, and manage your files."}
              </p>
            </div>

            {(!activeFolder?.is_shared || activeFolder.permission === "editor") && <button
              className="button button-primary"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? `Uploading ${uploadProgress}%` : "↑ Upload files"}
            </button>}

            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={handleUpload}
            />
          </div>

          {uploading && (
            <div
              className="upload-progress"
              role="progressbar"
              aria-valuenow={uploadProgress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div style={{ width: `${uploadProgress}%` }} />
            </div>
          )}

          <div className="files-toolbar">
            <label className="workspace-search">
              <SvgIcon name="search" />
              <input
                type="search"
                placeholder="Search files by name..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>

            <div className="bulk-file-controls">
              <label className="select-all-files">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(event) =>
                    handleSelectAllVisible(event.target.checked)
                  }
                  disabled={
                    visibleFiles.length === 0 ||
                    (Boolean(activeFolder?.is_shared) && activeFolder?.permission !== "editor") ||
                    fileDeleteBusy ||
                    moveBusy
                  }
                />
                Select all visible
              </label>

              {selectedFileIds.length > 0 && (
                <>
                  {!activeFolder?.is_shared && <button
                    type="button"
                    className="move-files-button"
                    onClick={() => {
                      setMoveDestinationId("root");
                      setShowMoveModal(true);
                      setError("");
                    }}
                    disabled={fileDeleteBusy || moveBusy}
                  >
                    <SvgIcon name="arrowUpRight" /> Move to ({selectedFileIds.length})
                  </button>}

                  <button
                    type="button"
                    className="delete-file-button bulk-delete-button"
                    onClick={() => setShowBulkDeleteModal(true)}
                    disabled={fileDeleteBusy || moveBusy}
                  >
                    Delete Selected ({selectedFileIds.length})
                  </button>
                </>
              )}
            </div>

            <div className="file-sort-controls">
              <label>
                Sort by
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                >
                  <option value="date">Date added</option>
                  <option value="name">Name</option>
                  <option value="size">File size</option>
                </select>
              </label>

              <label>
                Order
                <select
                  value={sortDirection}
                  onChange={(event) =>
                    setSortDirection(event.target.value)
                  }
                >
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </select>
              </label>
            </div>
          </div>

          <div className="file-tabs">
            {["All files", "Documents", "Images", "Spreadsheets"].map(
              (tab) => (
                <button
                  type="button"
                  key={tab}
                  className={
                    activeTab === tab ? "file-tab active" : "file-tab"
                  }
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                </button>
              )
            )}
          </div>

          <div className="file-list">
            {visibleFiles.map((file) => (
              <article
                className="workspace-file-row draggable-file-row"
                key={file.id}
                draggable={!file.share_id && !file.is_shared && !fileDeleteBusy && !moveBusy && !uploading}
                onDragStart={(event) => handleFileDragStart(event, file)}
                onDragEnd={handleFileDragEnd}
                title="Drag this file onto a folder to move it"
              >
                <input
                  type="checkbox"
                  className="file-select-checkbox"
                  checked={selectedFileIds.includes(String(file.id))}
                  onChange={(event) =>
                    handleFileSelection(file.id, event.target.checked)
                  }
                  aria-label={`Select ${file.original_name || "file"}`}
                  disabled={Boolean(file.share_id || (file.is_shared && file.folder_permission !== "editor")) || fileDeleteBusy || moveBusy}
                  draggable={false}
                />

                <div className="workspace-file-icon">
                  {fileIcon(file.original_name)}
                </div>

                <div className="workspace-file-info">
                  <strong>
                    {file.original_name || "Unnamed file"}
                    {file.is_password_protected ? <> <SvgIcon name="shield" /></> : null}
                  </strong>

                  <small>
                    {formatSize(file.size_bytes || file.size || file.file_size)}
                    {" · "}
                    {file.created_at
                      ? new Date(file.created_at).toLocaleDateString()
                      : "Date unavailable"}
                  </small>
                </div>

                <div className="workspace-file-actions" draggable={false}>
                  {(!file.is_shared ||
                    file.permission === "download" ||
                    file.folder_permission === "viewer" ||
                    file.folder_permission === "editor") && (
                    <button
                      type="button"
                      onClick={() => handleDownload(file)}
                      disabled={downloadingFileId === file.id}
                      draggable={false}
                    >
                      {downloadingFileId === file.id ? "Downloading..." : "Download"}
                    </button>
                  )}
                  {file.is_previewable !== false && (
                    <button
                      type="button"
                      onClick={() => handlePreview(file)}
                      draggable={false}
                    >
                      Preview
                    </button>
                  )}

                  <button type="button" className={file.is_favorite ? "favorite-file-action is-favorite" : "favorite-file-action"} aria-label={`${file.is_favorite ? "Remove from" : "Add to"} Favorites: ${file.original_name}`} onClick={() => toggleFileFavorite(file)} disabled={favoriteBusy !== ""} draggable={false}>{favoriteBusy === `file:${file.id}` ? "Saving…" : <><SvgIcon name={file.is_favorite ? "starFilled" : "star"} /> {file.is_favorite ? "Favorited" : "Favorite"}</>}</button>

                  {!file.share_id && !file.is_shared && <button
                    type="button"
                    onClick={() => handleShare(file)}
                    draggable={false}
                  >
                    Share
                  </button>}

                  {!file.share_id && !file.is_shared && <button type="button" onClick={() => handleRevokeShare(file)} draggable={false}>
                    Manage access
                  </button>}

                  {!file.share_id && (!file.is_shared || file.folder_permission === "editor") && <button
                    type="button"
                    className="delete-file-button"
                    onClick={() => handleDelete(file)}
                    disabled={fileDeleteBusy || moveBusy}
                    draggable={false}
                  >
                    Delete
                  </button>}
                </div>
              </article>
            ))}

            {visibleFiles.length === 0 && (
              <div className="folder-empty">
                <span><SvgIcon name="file" /></span>
                <h3>No files found</h3>
                <p>
                  {activeFolder
                    ? "Upload a file into this folder to get started."
                    : "Upload a file or change your search and filters."}
                </p>
              </div>
            )}
          </div>
        </section>
        </>}
      </main>

      {preview && (
        <div
          className="preview-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePreview();
          }}
        >
          <section
            className="preview-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="file-preview-title"
          >
            <header className="preview-modal-header">
              <div>
                <p className="folder-modal-eyebrow">SECURE PREVIEW</p>
                <h2 id="file-preview-title">{preview.file.original_name}</h2>
                {preview.file.is_shared && (
                  <small>
                    {preview.file.permission === "view"
                      ? "View-only access"
                      : "Shared file"}
                  </small>
                )}
              </div>
              <button
                type="button"
                className="folder-modal-close"
                aria-label="Close preview"
                onClick={closePreview}
              >
                <SvgIcon name="close" />
              </button>
            </header>

            <div className="preview-modal-content">
              {preview.loading && <p className="dashboard-empty">Preparing secure preview...</p>}
              {!preview.loading && preview.error && (
                <p className="form-message form-message-error" role="alert">
                  {preview.error}
                </p>
              )}
              {!preview.loading && !preview.error && preview.url && (
                /\.pptx?$/i.test(preview.file?.original_name || "") ||
                preview.contentType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
                preview.contentType === "application/vnd.ms-powerpoint"
              ) ? (
                <TrustSharePptxPreview url={preview.url} fileName={preview.file?.original_name} />
              ) : preview.contentType.startsWith("image/") ? (
                <TrustShareImagePreview url={preview.url} alt={preview.file?.original_name} />
              ) : preview.contentType === "application/pdf" ? (
                <TrustSharePdfPreview url={preview.url} />
              ) : preview.contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || /\.docx$/i.test(preview.file?.original_name || "") ? (
                <TrustShareDocxPreview url={preview.url} />
              ) : (
                <p className="form-message">Preview is not available for this file type. Download the file to view it.</p>
              )}
            </div>
          </section>
        </div>
      )}

      {/* CUSTOM PROMPT / CONFIRM / ALERT DIALOG */}

      {dialog && (
        <div
          className="ts-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !dialogBusy) {
              closeDialog(null);
            }
          }}
        >
          <form className="ts-dialog" onSubmit={submitDialog}>
            <div className="ts-dialog-icon">
              <SvgIcon name={dialog.type === "identity-verification" || dialog.type === "password-reset" ? "shield" : dialog.type === "password" || dialog.type === "password-confirm" ? "settings" : dialog.type === "choice" ? "check" : "file"} />
            </div>

            <p className="ts-dialog-eyebrow">TRUSTSHARE</p>

            <h2>{dialog.title || "Continue"}</h2>

            {dialog.description && (
              <p className="ts-dialog-description">
                {dialog.description}
              </p>
            )}

            {dialog.type === "choice" ? (
              <div className="ts-dialog-actions">
                <button
                  type="button"
                  className="ts-dialog-cancel"
                  onClick={() => closeDialog("no")}
                >
                  {dialog.cancelText || "Cancel"}
                </button>

                <button
                  type="button"
                  className="ts-dialog-primary"
                  onClick={() => closeDialog("yes")}
                >
                  {dialog.confirmText || "Continue"}
                </button>
              </div>
            ) : (
              <>
                {dialog.type === "text" && (
                  <label className="ts-dialog-field">
                    <span>{dialog.label || "Name"}</span>
                    <input
                      autoFocus
                      type="text"
                      value={dialogValue}
                      maxLength={255}
                      placeholder={dialog.placeholder || ""}
                      onChange={(event) =>
                        setDialogValue(event.target.value)
                      }
                    />
                  </label>
                )}

                {dialog.type === "optional-date" && (
                  <label className="ts-dialog-field">
                    <span>{dialog.label || "Optional expiration"}</span>
                    <input autoFocus type="datetime-local" value={dialogValue} onChange={(event) => setDialogValue(event.target.value)} />
                  </label>
                )}

                {dialog.type === "permission" && (
                  <label className="ts-dialog-field">
                    <span>Recipient permission</span>
                    <select autoFocus value={dialogValue} onChange={(event) => setDialogValue(event.target.value)}>
                      <option value="view">View in browser only</option>
                      <option value="download">View and download</option>
                    </select>
                  </label>
                )}

                {(dialog.type === "password" || dialog.type === "folder-unlock") && (
                  <label className="ts-dialog-field">
                    <span>{dialog.label || "Password"}</span>
                    <input
                      autoFocus
                      type={
                        dialog.type === "folder-unlock" && dialogShowPassword
                          ? "text"
                          : "password"
                      }
                      value={dialogValue}
                      disabled={dialogBusy}
                      onChange={(event) => {
                        setDialogValue(event.target.value);
                        if (dialogError) setDialogError("");
                      }}
                      autoComplete="current-password"
                    />
                  </label>
                )}

                {dialog.type === "folder-unlock" && (
                  <button
                    type="button"
                    className="ts-dialog-link ts-dialog-password-toggle"
                    onClick={() => setDialogShowPassword((visible) => !visible)}
                    disabled={dialogBusy}
                  >
                    {dialogShowPassword ? "Hide password" : "Show password"}
                  </button>
                )}

                {(dialog.type === "password" || dialog.type === "folder-unlock") &&
                  dialog.showForgotPassword && (
                    <button
                      type="button"
                      className="ts-dialog-link"
                      onClick={() => !dialogBusy && closeDialog({ action: "forgot" })}
                      disabled={dialogBusy}
                    >
                      {dialog.showForgotPassword}
                    </button>
                  )}

                {dialog.type === "identity-verification" && (
                  <>
                    <div className="ts-dialog-identity-email">
                      <span>Verification code sent to</span>
                      <strong>{dialog.maskedEmail}</strong>
                    </div>
                    <label className="ts-dialog-field">
                      <span>One-time code</span>
                      <input
                        autoFocus
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        className="ts-dialog-otp-input"
                        value={dialogValue}
                        onChange={(event) =>
                          setDialogValue(
                            event.target.value.replace(/\D/g, "")
                          )
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="ts-dialog-link ts-dialog-password-toggle"
                      onClick={resendRecoveryCode}
                      disabled={
                        dialogBusy || resendRemaining > 0
                      }
                    >
                      {resendRemaining > 0
                        ? `Resend Code (${resendRemaining}s)`
                        : "Resend Code"}
                    </button>
                  </>
                )}

                {dialog.type === "password-reset" && (
                  <>
                    <label className="ts-dialog-field">
                      <span>New Password</span>
                      <input
                        autoFocus
                        type={
                          dialogShowPassword ? "text" : "password"
                        }
                        value={dialogValue}
                        onChange={(event) =>
                          setDialogValue(event.target.value)
                        }
                        autoComplete="new-password"
                      />
                    </label>
                    <label className="ts-dialog-field">
                      <span>Confirm Password</span>
                      <input
                        type={
                          dialogShowPassword ? "text" : "password"
                        }
                        value={dialogConfirmValue}
                        onChange={(event) =>
                          setDialogConfirmValue(event.target.value)
                        }
                        autoComplete="new-password"
                      />
                    </label>
                    <button
                      type="button"
                      className="ts-dialog-link"
                      onClick={() =>
                        setDialogShowPassword((visible) => !visible)
                      }
                    >
                      {dialogShowPassword
                        ? "Hide passwords"
                        : "Show passwords"}
                    </button>
                  </>
                )}

                {dialog.type === "password-confirm" && (
                  <>
                    <label className="ts-dialog-field">
                      <span>New password</span>
                      <input
                        autoFocus
                        type="password"
                        value={dialogValue}
                        onChange={(event) =>
                          setDialogValue(event.target.value)
                        }
                        autoComplete="new-password"
                      />
                    </label>

                    <label className="ts-dialog-field">
                      <span>Confirm password</span>
                      <input
                        type="password"
                        value={dialogConfirmValue}
                        onChange={(event) =>
                          setDialogConfirmValue(event.target.value)
                        }
                        autoComplete="new-password"
                      />
                    </label>
                  </>
                )}

                {dialogError && (
                  <p className="ts-dialog-error" role="alert">
                    {dialogError}
                  </p>
                )}

                <div className="ts-dialog-actions">
                  <button
                    type="button"
                    className="ts-dialog-cancel"
                    onClick={() => closeDialog(null)}
                    disabled={dialogBusy}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="ts-dialog-primary"
                    disabled={dialogBusy}
                  >
                    {dialogBusy ? (
                      <span className="ts-dialog-spinner" />
                    ) : dialog.type === "info"
                      ? "OK"
                      : dialog.confirmText || "Continue"}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}

      {/* MOVE FILES MODAL */}

      {showMoveModal && (
        <div
          className="folder-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !moveBusy) {
              setShowMoveModal(false);
            }
          }}
        >
          <section
            className="folder-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="move-files-title"
          >
            <div className="folder-modal-icon"><SvgIcon name="folder" /></div>

            <button
              className="folder-modal-close"
              type="button"
              onClick={() => setShowMoveModal(false)}
              disabled={moveBusy}
              aria-label="Close dialog"
            >
              <SvgIcon name="close" />
            </button>

            <span className="folder-modal-eyebrow">FILE MANAGEMENT</span>

            <h2 id="move-files-title">
              Move {selectedFileIds.length === 1 ? "file" : "files"}?
            </h2>

            <p className="folder-modal-description">
              Move {selectedFileIds.length} selected file(s) to the destination.
            </p>

            <label className="move-destination-label">
              Destination folder
              <select
                value={moveDestinationId}
                onChange={(event) =>
                  setMoveDestinationId(event.target.value)
                }
                disabled={moveBusy}
              >
                <option value="root">All files (no folder)</option>

                {folders.map((folder) => (
                  <option key={folder.id} value={String(folder.id)}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="folder-modal-actions">
              <button
                type="button"
                className="folder-modal-cancel"
                onClick={() => setShowMoveModal(false)}
                disabled={moveBusy}
              >
                Cancel
              </button>

              <button
                type="button"
                className="folder-modal-confirm"
                onClick={confirmMoveFiles}
                disabled={moveBusy || selectedFileIds.length === 0}
              >
                {moveBusy ? "Moving files..." : "Move files"}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* DELETE SINGLE FILE MODAL */}

      {fileToDelete && (
        <div className="folder-modal-backdrop">
          <section
            className="folder-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="file-delete-modal-title"
          >
            <div className="folder-modal-icon"><SvgIcon name="file" /></div>

            <h2 id="file-delete-modal-title">Delete file?</h2>

            <p className="folder-modal-description">
              Permanently delete{" "}
              <strong>{fileToDelete.original_name || "this file"}</strong>?
            </p>

            <div className="folder-modal-actions">
              <button
                type="button"
                className="folder-modal-cancel"
                onClick={() => setFileToDelete(null)}
                disabled={fileDeleteBusy}
              >
                Cancel
              </button>

              <button
                type="button"
                className="folder-modal-confirm danger-button"
                onClick={confirmDeleteFile}
                disabled={fileDeleteBusy}
              >
                {fileDeleteBusy ? "Deleting..." : "Delete file"}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* BULK DELETE MODAL */}

      {showBulkDeleteModal && selectedFileIds.length > 0 && (
        <div className="folder-modal-backdrop">
          <section
            className="folder-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-delete-title"
          >
            <div className="folder-modal-icon">trash</div>

            <h2 id="bulk-delete-title">Delete selected files?</h2>

            <p className="folder-modal-description">
              Permanently delete {selectedFileIds.length} selected file(s)?
            </p>

            <div className="folder-modal-actions">
              <button
                type="button"
                className="folder-modal-cancel"
                onClick={() => setShowBulkDeleteModal(false)}
                disabled={fileDeleteBusy}
              >
                Cancel
              </button>

              <button
                type="button"
                className="folder-modal-confirm danger-button"
                onClick={confirmBulkDelete}
                disabled={fileDeleteBusy}
              >
                {fileDeleteBusy ? "Deleting..." : "Delete files"}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* DELETE FOLDER MODAL */}

      {folderToDelete && (
        <div className="folder-modal-backdrop">
          <section
            className="folder-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="folder-modal-title"
          >
            <div className="folder-modal-icon"><SvgIcon name="folder" /></div>

            <h2 id="folder-modal-title">Delete folder</h2>

            <p className="folder-modal-description">
              What should happen to files in{" "}
              <strong>{folderToDelete.name}</strong>?
            </p>

            <button
              type="button"
              className={
                deleteChoice === "keep_files"
                  ? "folder-delete-choice selected"
                  : "folder-delete-choice"
              }
              onClick={() => {
                setDeleteChoice("keep_files");
                setConfirmPermanentDelete(false);
              }}
              disabled={folderBusy}
            >
              <span className="folder-choice-icon keep-icon"><SvgIcon name="folderOpen" /></span>

              <span className="folder-choice-copy">
                <strong>Keep all files</strong>
                <small>Move files to All files and remove the folder.</small>
              </span>

              <span className="folder-choice-radio">
                {deleteChoice === "keep_files" ? <SvgIcon name="check" /> : null}
              </span>
            </button>

            <button
              type="button"
              className={
                deleteChoice === "delete_files"
                  ? "folder-delete-choice selected danger-selected"
                  : "folder-delete-choice"
              }
              onClick={() => {
                setDeleteChoice("delete_files");
                setConfirmPermanentDelete(false);
              }}
              disabled={folderBusy}
            >
              <span className="folder-choice-icon delete-icon"><SvgIcon name="trash" /></span>

              <span className="folder-choice-copy">
                <strong>Delete folder and files</strong>
                <small>Permanently remove files in this folder.</small>
              </span>

              <span className="folder-choice-radio">
                {deleteChoice === "delete_files" ? <SvgIcon name="check" /> : null}
              </span>
            </button>

            {deleteChoice === "delete_files" && (
              <label className="folder-delete-warning">
                <input
                  type="checkbox"
                  checked={confirmPermanentDelete}
                  onChange={(event) =>
                    setConfirmPermanentDelete(event.target.checked)
                  }
                  disabled={folderBusy}
                />

                <span>
                  I understand that the files will be permanently deleted.
                </span>
              </label>
            )}

            <div className="folder-modal-actions">
              <button
                type="button"
                className="folder-modal-cancel"
                onClick={() => setFolderToDelete(null)}
                disabled={folderBusy}
              >
                Cancel
              </button>

              <button
                type="button"
                className={
                  deleteChoice === "delete_files"
                    ? "folder-modal-confirm danger-button"
                    : "folder-modal-confirm"
                }
                onClick={confirmDeleteFolder}
                disabled={
                  folderBusy ||
                  (deleteChoice === "delete_files" &&
                    !confirmPermanentDelete)
                }
              >
                {folderBusy
                  ? "Please wait..."
                  : deleteChoice === "delete_files"
                    ? "Delete everything"
                    : "Delete folder"}
              </button>
            </div>
          </section>
        </div>
      )}

      {accessFolder && (
        <div className="folder-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !accessBusy) setAccessFolder(null);
        }}>
          <section className="folder-modal folder-access-modal" role="dialog" aria-modal="true" aria-labelledby="folder-access-title">
            <button type="button" className="folder-modal-close" aria-label="Close access settings" onClick={() => !accessBusy && setAccessFolder(null)}><SvgIcon name="close" /></button>
            <div className="folder-modal-icon"><SvgIcon name="users" /></div>
            <p className="folder-modal-eyebrow">FOLDER PERMISSIONS</p>
            <h2 id="folder-access-title">Manage Access</h2>
            <p className="folder-modal-description">Manage people who can view <strong>{accessFolder.name}</strong> and its files.</p>

            {accessLoading ? <p>Loading access list...</p> : folderAccess.length === 0 ? (
              <p className="folder-access-empty">No one else currently has access to this folder.</p>
            ) : (
              <div className="folder-access-list">
                {folderAccess.map((entry) => (
                  <div className="folder-access-row" key={entry.id}>
                    <div className="folder-access-identity">
                      <strong>{entry.recipient_email}</strong>
                      <small>{entry.status} · {entry.permission === "viewer" ? "Viewer" : entry.permission}</small>
                    </div>
                    <label className="folder-access-expiry">
                      Permission
                      <select
                        value={accessPermissionEdits[entry.id] || entry.permission}
                        onChange={(event) => setAccessPermissionEdits((current) => ({ ...current, [entry.id]: event.target.value }))}
                        disabled={entry.status !== "Active" || accessBusy}
                      >
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                      </select>
                    </label>
                    <label className="folder-access-expiry">
                      Expires
                      <input
                        type="datetime-local"
                        value={accessExpiryEdits[entry.id] || ""}
                        onChange={(event) => setAccessExpiryEdits((current) => ({ ...current, [entry.id]: event.target.value }))}
                        disabled={entry.status !== "Active" || accessBusy}
                      />
                    </label>
                    {entry.status === "Active" && (
                      <div className="folder-access-actions">
                        <button type="button" className="button" onClick={() => handleUpdateFolderAccess(entry)} disabled={accessBusy}>Save</button>
                        <button type="button" className="folder-delete-option" onClick={() => handleRevokeFolderAccess(entry)} disabled={accessBusy}>Revoke</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <form className="folder-access-grant" onSubmit={handleGrantFolderAccess}>
              <h3>Grant access</h3>
              <label className="folder-access-field">
                Recipient email
                <input type="email" value={accessEmail} onChange={(event) => setAccessEmail(event.target.value)} required maxLength={255} placeholder="person@example.com" disabled={accessBusy} />
              </label>
              <label className="folder-access-field">
                Permission
                <select value={accessPermission} onChange={(event) => setAccessPermission(event.target.value)} disabled={accessBusy}>
                  <option value="viewer">Viewer · view and download</option>
                  <option value="editor">Editor · upload and delete</option>
                </select>
              </label>
              <label className="folder-access-field">
                Optional expiry
                <input type="datetime-local" value={accessExpiry} onChange={(event) => setAccessExpiry(event.target.value)} disabled={accessBusy} />
              </label>
              <p className="folder-modal-description">Folder passwords are never shared. Editors can upload and delete files, but cannot move files or manage this folder.</p>
              <div className="folder-modal-actions">
                <button type="button" className="folder-modal-cancel" onClick={() => !accessBusy && setAccessFolder(null)} disabled={accessBusy}>Cancel</button>
                <button type="submit" className="folder-modal-confirm" disabled={accessBusy || !accessEmail.trim()}>{accessBusy ? "Saving..." : "Grant access"}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}



const LazyTrustSharePptxRenderer = lazy(() => import("./TrustSharePptxRenderer.jsx"));

function TrustSharePptxPreview({ url, fileName = "PowerPoint presentation" }) {
  const viewerRef = useRef(null);
  const [slideCount, setSlideCount] = useState(0);
  const [activeSlide, setActiveSlide] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [error, setError] = useState("");

  const changeZoom = async (nextZoom) => {
    const boundedZoom = Math.min(200, Math.max(50, nextZoom));
    setZoom(boundedZoom);

    try {
      await viewerRef.current?.setZoom(boundedZoom);
    } catch (zoomError) {
      console.error("PowerPoint zoom error:", zoomError);
    }
  };

  const goToPreviousSlide = () => {
    viewerRef.current?.previous();
  };

  const goToNextSlide = () => {
    viewerRef.current?.next();
  };

  return (
    <div className="trustshare-pptx-viewer">
      <div className="trustshare-pptx-toolbar">
        <div className="trustshare-pptx-navigation">
          <button
            type="button"
            className="button"
            onClick={goToPreviousSlide}
            disabled={activeSlide <= 0}
          >
            Previous
          </button>

          <span aria-live="polite">
            Slide {slideCount ? activeSlide + 1 : 0} of {slideCount || "..."}
          </span>

          <button
            type="button"
            className="button"
            onClick={goToNextSlide}
            disabled={!slideCount || activeSlide >= slideCount - 1}
          >
            Next
          </button>
        </div>

        <div className="trustshare-pptx-zoom">
          <button
            type="button"
            className="button"
            onClick={() => changeZoom(zoom - 10)}
            disabled={zoom <= 50}
            aria-label="Zoom out"
          >
            −
          </button>

          <span>{zoom}%</span>

          <button
            type="button"
            className="button"
            onClick={() => changeZoom(zoom + 10)}
            disabled={zoom >= 200}
            aria-label="Zoom in"
          >
            +
          </button>

          <button
            type="button"
            className="button"
            onClick={() => {
              setZoom(100);
              viewerRef.current?.setZoom("fit-width");
            }}
          >
            Fit Width
          </button>
        </div>
      </div>

      {error && (
        <p className="form-message form-message-error" role="alert">
          {error}
        </p>
      )}

      <div className="trustshare-pptx-canvas">
        <Suspense fallback={<p className="dashboard-empty">Loading PowerPoint viewer...</p>}>
          <LazyTrustSharePptxRenderer
          ref={viewerRef}
          source={url}
          defaultZoom="fit-width"
          showToolbar={false}
          showThumbnails
          onLoad={(presentation) => {
            setSlideCount(presentation.document.slides.length);
            setActiveSlide(0);
            setError("");
          }}
          onSlideChange={setActiveSlide}
          onError={(viewerError) => {
            setError(
              viewerError?.message ||
              `Unable to preview ${fileName}.`
            );
          }}
          onWarning={(warning) => {
            console.warn("PowerPoint preview warning:", warning);
          }}
          />
        </Suspense>
      </div>
    </div>
  );
}
function TrustShareImagePreview({ url, alt = "Image preview" }) {
  const viewerRef = TrustShareReact.useRef(null);
  const [scale, setScale] = TrustShareReact.useState(1);
  const [dimensions, setDimensions] = TrustShareReact.useState(null);

  TrustShareReact.useEffect(() => {
    setScale(1);
    setDimensions(null);
  }, [url]);

  const changeZoom = (amount) => {
    setScale(current =>
      Math.min(4, Math.max(0.1, current + amount))
    );
  };

  const fitImage = (mode) => {
    const viewer = viewerRef.current;

    if (!viewer || !dimensions) return;

    const availableWidth = Math.max(100, viewer.clientWidth - 40);
    const availableHeight = Math.max(100, viewer.clientHeight - 40);

    const widthScale = availableWidth / dimensions.width;
    const heightScale = availableHeight / dimensions.height;

    const nextScale = mode === "width"
      ? widthScale
      : Math.min(widthScale, heightScale);

    setScale(Math.min(4, Math.max(0.1, nextScale)));
  };

  return (
    <div className="trustshare-image-viewer">
      <div className="trustshare-image-toolbar">
        <button
          type="button"
          disabled={!dimensions || scale <= 0.1}
          onClick={() => changeZoom(-0.2)}
        >
          Zoom −
        </button>

        <span>{Math.round(scale * 100)}%</span>

        <button
          type="button"
          disabled={!dimensions || scale >= 4}
          onClick={() => changeZoom(0.2)}
        >
          Zoom +
        </button>

        <button
          type="button"
          disabled={!dimensions}
          onClick={() => fitImage("width")}
        >
          Fit Width
        </button>

        <button
          type="button"
          disabled={!dimensions}
          onClick={() => fitImage("page")}
        >
          Fit Screen
        </button>

        <button
          type="button"
          disabled={!dimensions || scale === 1}
          onClick={() => setScale(1)}
        >
          Reset
        </button>
      </div>

      <div
        className="trustshare-image-viewport"
        ref={viewerRef}
      >
        <img
          src={url}
          alt={alt}
          draggable="false"
          onLoad={(event) => {
            const image = event.currentTarget;
            setDimensions({
              width: image.naturalWidth,
              height: image.naturalHeight,
            });
          }}
          style={{
            width: dimensions ? `${dimensions.width * scale}px` : "auto",
            height: dimensions ? `${dimensions.height * scale}px` : "auto",
          }}
        />
      </div>
    </div>
  );
}
function TrustShareDocxPreview({ url }) {
  const containerRef = TrustShareReact.useRef(null);
  const viewerRef = TrustShareReact.useRef(null);
  const wrapperRef = TrustShareReact.useRef(null);
  const pageElementsRef = TrustShareReact.useRef([]);

  const [loading, setLoading] = TrustShareReact.useState(true);
  const [error, setError] = TrustShareReact.useState("");
  const [page, setPage] = TrustShareReact.useState(1);
  const [pageCount, setPageCount] = TrustShareReact.useState(0);
  const [scale, setScale] = TrustShareReact.useState(1);

  TrustShareReact.useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;

    if (!container) return undefined;

    container.replaceChildren();
    wrapperRef.current = null;
    pageElementsRef.current = [];

    setLoading(true);
    setError("");
    setPage(1);
    setPageCount(0);
    setScale(1);

    async function loadDocx() {
      try {
        // This URL contains the already-decrypted preview response.
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error("Could not read the secure preview data.");
        }

        const blob = await response.blob();

        if (cancelled) return;

        const { renderAsync } = await import("docx-preview");
        if (cancelled) return;

        await renderAsync(blob, container, container, {
          className: "docx",
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
        });

        if (cancelled) return;

        const wrapper = container.querySelector(".docx-wrapper");

        if (!wrapper) {
          throw new Error("The Word document pages could not be prepared.");
        }

        const pages = Array.from(wrapper.children).filter(
          element => element.matches("section.docx")
        );

        if (!pages.length) {
          throw new Error("No readable pages were found in this document.");
        }

        wrapperRef.current = wrapper;
        pageElementsRef.current = pages;
        wrapper.style.zoom = "1";

        setPageCount(pages.length);
        setPage(1);
        setScale(1);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error("DOCX preview error:", err);
          setError(
            err.message ||
            "Unable to display this Word document. Please try downloading it."
          );
          setLoading(false);
        }
      }
    }

    loadDocx();

    return () => {
      cancelled = true;
      wrapperRef.current = null;
      pageElementsRef.current = [];
      container.replaceChildren();
    };
  }, [url]);

  TrustShareReact.useEffect(() => {
    if (wrapperRef.current) {
      wrapperRef.current.style.zoom = String(scale);
    }
  }, [scale, pageCount]);

  const changeZoom = (amount) => {
    setScale(current =>
      Math.min(2.5, Math.max(0.3, current + amount))
    );
  };

  const fitDocx = (mode) => {
    const viewer = viewerRef.current;
    const firstPage = pageElementsRef.current[0];

    if (!viewer || !firstPage) return;

    const availableWidth = Math.max(100, viewer.clientWidth - 40);
    const availableHeight = Math.max(100, viewer.clientHeight - 40);
    const pageWidth = firstPage.offsetWidth;
    const pageHeight = firstPage.offsetHeight;

    if (!pageWidth || !pageHeight) return;

    const widthScale = availableWidth / pageWidth;
    const heightScale = availableHeight / pageHeight;

    const nextScale = mode === "width"
      ? widthScale
      : Math.min(widthScale, heightScale);

    setScale(Math.min(2.5, Math.max(0.3, nextScale)));
  };

  const goToPage = (nextPage) => {
    const safePage = Math.min(
      pageCount,
      Math.max(1, nextPage)
    );

    setPage(safePage);

    const target = pageElementsRef.current[safePage - 1];

    if (target) {
      target.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  return (
    <div className="trustshare-docx-viewer">
      <div className="trustshare-docx-toolbar">
        <button
          type="button"
          disabled={loading || page <= 1}
          onClick={() => goToPage(page - 1)}
        >
          Previous
        </button>

        <span>
          Page {page} of {pageCount || 0}
        </span>

        <button
          type="button"
          disabled={loading || page >= pageCount}
          onClick={() => goToPage(page + 1)}
        >
          Next
        </button>

        <button
          type="button"
          disabled={loading || !pageCount}
          onClick={() => fitDocx("width")}
        >
          Fit Width
        </button>

        <button
          type="button"
          disabled={loading || !pageCount}
          onClick={() => fitDocx("page")}
        >
          Fit Page
        </button>

        <button
          type="button"
          disabled={loading || scale <= 0.3}
          onClick={() => changeZoom(-0.2)}
        >
          Zoom −
        </button>

        <span>{Math.round(scale * 100)}%</span>

        <button
          type="button"
          disabled={loading || scale >= 2.5}
          onClick={() => changeZoom(0.2)}
        >
          Zoom +
        </button>

        <button
          type="button"
          disabled={loading || scale === 1}
          onClick={() => setScale(1)}
        >
          Reset
        </button>
      </div>

      {loading && (
        <p className="dashboard-empty">
          Preparing Word document preview...
        </p>
      )}

      {error && (
        <p className="form-message form-message-error" role="alert">
          {error}
        </p>
      )}

      <div
        ref={viewerRef}
        className="trustshare-docx-preview"
      >
        <div
          ref={containerRef}
          className="trustshare-docx-pages"
        />
      </div>
    </div>
  );
}
function TrustSharePdfPreview({ url }) {
  const [pdf, setPdf] = TrustShareReact.useState(null);
  const [page, setPage] = TrustShareReact.useState(1);
  const [scale, setScale] = TrustShareReact.useState(1);
  const [error, setError] = TrustShareReact.useState("");
  const canvasRef = TrustShareReact.useRef(null);
  const viewerRef = TrustShareReact.useRef(null);

  TrustShareReact.useEffect(() => {
    let cancelled = false;
    let loadingTask;

    async function loadPdf() {
      try {
        setPdf(null);
        setPage(1);
        setScale(1);
        setError("");

        const [pdfjsLib, workerModule] = await Promise.all([
          import("pdfjs-dist"),
          import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
        ]);
        if (cancelled) return;
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
        loadingTask = pdfjsLib.getDocument({ url });
        const document = await loadingTask.promise;

        if (cancelled) {
          await document.destroy();
          return;
        }

        setPdf(document);
      } catch (err) {
        if (!cancelled) {
          setError("Unable to display this PDF. Please try again.");
          console.error("PDF preview error:", err);
        }
      }
    }

    loadPdf();

    return () => {
      cancelled = true;
      if (loadingTask) loadingTask.destroy();
    };
  }, [url]);

  async function fitPdf(mode) {
    if (!pdf || !viewerRef.current) return;

    try {
      const pdfPage = await pdf.getPage(page);
      const baseViewport = pdfPage.getViewport({ scale: 1 });
      const container = viewerRef.current;

      const styles = window.getComputedStyle(container);
      const horizontalPadding = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight);
      const verticalPadding = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
      const availableWidth = Math.max(100, container.clientWidth - horizontalPadding);
      const availableHeight = Math.max(100, container.clientHeight - verticalPadding);

      const widthScale = availableWidth / baseViewport.width;
      const heightScale = availableHeight / baseViewport.height;

      const nextScale = mode === "page"
        ? Math.min(widthScale, heightScale)
        : widthScale;

      setScale(Math.max(0.1, Math.min(3, nextScale)));
    } catch (err) {
      console.error("PDF fit calculation failed:", err);
    }
  }

  const manualZoomRef = TrustShareReact.useRef(false);
  const fitModeRef = TrustShareReact.useRef("width");

  TrustShareReact.useEffect(() => {
    if (!pdf || !viewerRef.current) return;

    const container = viewerRef.current;
    const observer = new ResizeObserver(() => {
      if (!manualZoomRef.current) {
        fitPdf(fitModeRef.current);
      }
    });

    observer.observe(container);
    if (!manualZoomRef.current) fitPdf(fitModeRef.current);

    return () => observer.disconnect();
  }, [pdf, page]);
  TrustShareReact.useEffect(() => {
    if (!pdf || !canvasRef.current) return;

    let cancelled = false;
    let renderTask;

    async function renderPage() {
      try {
        const pdfPage = await pdf.getPage(page);
        if (cancelled) return;

        const viewport = pdfPage.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");

        const outputScale = Math.min(
          window.devicePixelRatio || 1,
          2.5
        );

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        renderTask = pdfPage.render({
          canvasContext: context,
          viewport,
          transform: outputScale === 1
            ? null
            : [outputScale, 0, 0, outputScale, 0, 0]
        });

        await renderTask.promise;
      } catch (err) {
        if (!cancelled && err?.name !== "RenderingCancelledException") {
          setError("Unable to render this PDF page.");
          console.error("PDF rendering error:", err);
        }
      }
    }

    renderPage();

    return () => {
      cancelled = true;
      if (renderTask) renderTask.cancel();
    };
  }, [pdf, page, scale]);

  if (error) {
    return <p className="form-message form-message-error">{error}</p>;
  }

  if (!pdf) {
    return <p className="form-message">Loading PDF preview...</p>;
  }

  return (
    <div className="trustshare-pdf-viewer">
      <div className="trustshare-pdf-toolbar">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setPage(p => Math.max(1, p - 1))}
        >
          Previous
        </button>

        <span>Page {page} of {pdf.numPages}</span>

        <button
          type="button"
          disabled={page >= pdf.numPages}
          onClick={() => setPage(p => Math.min(pdf.numPages, p + 1))}
        >
          Next
        </button>

        <button type="button" onClick={() => { fitModeRef.current = "width"; manualZoomRef.current = false; fitPdf("width"); }}>
          Fit Width
        </button>

        <button type="button" onClick={() => { fitModeRef.current = "page"; manualZoomRef.current = false; fitPdf("page"); }}>
          Fit Page
        </button>

        <button
          type="button"
          disabled={scale <= 0.3}
          onClick={() => { manualZoomRef.current = true; setScale(s => Math.max(0.3, Math.round((s - 0.25) * 100) / 100)); }}
        >
          Zoom −
        </button>

        <span>{Math.round(scale * 100)}%</span>

        <button
          type="button"
          disabled={scale >= 3}
          onClick={() => { manualZoomRef.current = true; setScale(s => Math.min(3, Math.round((s + 0.25) * 100) / 100)); }}
        >
          Zoom +
        </button>
      </div>

      <div className="trustshare-pdf-page" ref={viewerRef}>
        <canvas ref={canvasRef} aria-label={`PDF page ${page}`} />
      </div>
    </div>
  );
}
function SharedFilePage() {
  const { shareId } = useParams();
  const navigate = useNavigate();

  const [file, setFile] = useState(null);
  const [filePassword, setFilePassword] = useState("");
  const [folderPassword, setFolderPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(null);
  const previewRequestRef = useRef(0);

  const returnPath = `/shared/${shareId}`;

  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
  }, [preview?.url]);

  useEffect(() => {
    return () => {
      previewRequestRef.current += 1;
    };
  }, [shareId]);

  function closeSharedPreview() {
    previewRequestRef.current += 1;
    setPreview(null);
  }

  useEffect(() => {
    if (!sessionStorage.getItem("trustshare_token")) {
      sessionStorage.setItem("trustshare_after_login", returnPath);
      navigate("/login", { replace: true });
      return undefined;
    }

    let cancelled = false;

    getSharedFileInfo(shareId)
      .then((sharedFile) => {
        if (!cancelled) {
          setFile(sharedFile);
        }
      })
      .catch((requestError) => {
        if (requestError.response?.status === 401) {
          sessionStorage.setItem("trustshare_after_login", returnPath);
          clearSession();
          navigate("/login", { replace: true });
          return;
        }

        if (!cancelled) {
          setError(getApiErrorMessage(requestError));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [navigate, returnPath, shareId]);

  async function downloadFileFromShare() {
    setDownloading(true);
    setError("");
    setMessage("");

    try {
      let folderUnlockToken = null;

      if (file?.is_parent_folder_password_protected) {
        const session = await unlockFolder(
          file.folder_id,
          folderPassword
        );

        folderUnlockToken = session.unlock_token;
      }

      const response = await downloadSharedFile(
        file?.share_token || shareId,
        file?.is_password_protected ? filePassword : null,
        folderUnlockToken
      );

      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = file?.original_name || "download";

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      window.setTimeout(() => URL.revokeObjectURL(url), 1000);

      setMessage("Download started.");
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setDownloading(false);
    }
  }

  async function previewFileFromShare() {
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;

    setDownloading(true);
    setError("");
    setMessage("");
    setPreview({
      url: null,
      contentType: file?.content_type || "application/octet-stream",
      loading: true,
      error: "",
    });

    try {
      let folderUnlockToken = null;

      if (file?.is_parent_folder_password_protected) {
        const session = await unlockFolder(
          file.folder_id,
          folderPassword
        );

        if (requestId !== previewRequestRef.current) return;

        folderUnlockToken = session.unlock_token;
      }

      const response = await previewSharedFile(
        shareId,
        file?.is_password_protected ? filePassword : null,
        folderUnlockToken
      );

      if (requestId !== previewRequestRef.current) return;

      const url = URL.createObjectURL(response.data);

      if (requestId !== previewRequestRef.current) {
        URL.revokeObjectURL(url);
        return;
      }

      setPreview({
        url,
        contentType: response.headers?.["content-type"] || file?.content_type || "application/octet-stream",
        loading: false,
        error: "",
      });
    } catch (requestError) {
      if (requestId !== previewRequestRef.current) return;

      setError(getApiErrorMessage(requestError));
      setPreview((current) => current ? {
        ...current,
        loading: false,
        error: getApiErrorMessage(requestError),
      } : current);
    } finally {
      if (requestId === previewRequestRef.current) {
        setDownloading(false);
      }
    }
  }
  return (
    <main className="auth-page">
      <div className="auth-topbar">
        <Brand />
        <Link to="/dashboard" className="back-home">
          Open TrustShare
        </Link>
      </div>

      <div className="shared-invitation-layout">
        <section className="shared-invitation-panel">
          <div className="shared-invitation-content">
            <span className="eyebrow">
              TRUSTSHARE FILE INVITATION
            </span>

            {loading ? (
              <h2>Checking your access...</h2>
            ) : file ? (
              <>
                <h2>{file.original_name}</h2>

                <p className="auth-subtitle">
                  Shared by {file.owner_name}. Sign in is required to
                  access this file.
                </p>

                {file.is_password_protected && (
                  <label className="form-label">
                    File password
                    <input
                      type="password"
                      value={filePassword}
                      onChange={(event) =>
                        setFilePassword(event.target.value)
                      }
                      autoComplete="current-password"
                      required
                    />
                  </label>
                )}

                {file.is_parent_folder_password_protected && (
                  <label className="form-label">
                    Folder password
                    <input
                      type="password"
                      value={folderPassword}
                      onChange={(event) =>
                        setFolderPassword(event.target.value)
                      }
                      autoComplete="current-password"
                      required
                    />
                  </label>
                )}

                {file.is_previewable ? (
                  <button
                    className="button button-primary submit-button"
                    type="button"
                    onClick={previewFileFromShare}
                    disabled={
                      downloading ||
                      (file.is_password_protected && !filePassword) ||
                      (file.is_parent_folder_password_protected &&
                        !folderPassword)
                    }
                  >
                    {downloading
                      ? "Preparing preview..."
                      : "Preview file"}
                  </button>
                ) : (
                  <p className="form-message">
                    This file type cannot be previewed in the browser.
                    {file.permission === "download"
                      ? " Use Download file to save it securely."
                      : " Download is not permitted for this share."}
                  </p>
                )}

                {file.permission === "download" && (
                  <button
                    className="button submit-button"
                    type="button"
                    onClick={downloadFileFromShare}
                    disabled={
                      downloading ||
                      (file.is_password_protected && !filePassword) ||
                      (file.is_parent_folder_password_protected &&
                        !folderPassword)
                    }
                  >
                    {downloading
                      ? "Preparing download..."
                      : "Download file"}
                  </button>
                )}

                {message && (
                  <p className="form-message" role="status">
                    {message}
                  </p>
                )}

                {error && (
                  <p
                    className="form-message form-message-error"
                    role="alert"
                  >
                    {error}
                  </p>
                )}

                <p className="auth-subtitle">
                  You can also find this file under “Shared with me”
                  in your dashboard.
                </p>
              </>
            ) : (
              <>
                <h2>
                  {error === "This sharing link has expired"
                    ? error
                    : "Shared file unavailable"}
                </h2>

                {error && error !== "This sharing link has expired" && (
                  <p
                    className="form-message form-message-error"
                    role="alert"
                  >
                    {error}
                  </p>
                )}
              </>
            )}
          </div>
        </section>
      </div>

      {preview && (
        <div
          className="preview-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeSharedPreview();
          }}
        >
          <section
            className="preview-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shared-file-preview-title"
          >
            <header className="preview-modal-header">
              <div>
                <p className="folder-modal-eyebrow">SECURE PREVIEW</p>
                <h2 id="shared-file-preview-title">
                  {file?.original_name || "Shared file"}
                </h2>
                <small>
                  {file?.permission === "view" ? "View-only access" : "Shared file"}
                </small>
              </div>
              <button
                type="button"
                className="folder-modal-close"
                aria-label="Close preview"
                onClick={closeSharedPreview}
              >
                <SvgIcon name="close" />
              </button>
            </header>

            <div className="preview-modal-content">
              {preview.loading && (
                <p className="dashboard-empty">Preparing secure preview...</p>
              )}

              {!preview.loading && preview.error && (
                <p className="form-message form-message-error" role="alert">
                  {preview.error}
                </p>
              )}

              {!preview.loading && !preview.error && preview.url && (
                /\.pptx?$/i.test(file?.original_name || "") ||
                preview.contentType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
                preview.contentType === "application/vnd.ms-powerpoint"
              ) ? (
                <TrustSharePptxPreview
                  url={preview.url}
                  fileName={file?.original_name}
                />
              ) : !preview.loading && !preview.error && preview.url &&
                preview.contentType?.startsWith("image/") ? (
                <TrustShareImagePreview
                  url={preview.url}
                  alt={file?.original_name}
                />
              ) : !preview.loading && !preview.error && preview.url &&
                preview.contentType === "application/pdf" ? (
                <TrustSharePdfPreview url={preview.url} />
              ) : !preview.loading && !preview.error && preview.url &&
                (preview.contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
                  /\.docx$/i.test(file?.original_name || "")) ? (
                <TrustShareDocxPreview url={preview.url} />
              ) : null}
            </div>
          </section>
        </div>
      )}    </main>
  );
}


function NotFound() {
  return (
    <main className="not-found">
      <Brand />
      <h1>We couldn't find that page.</h1>
      <Link className="button button-primary" to="/">
        Return home
      </Link>
    </main>
  );
}


export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/shared/:shareId" element={<SharedFilePage />} />
        <Route path="/admin/*" element={<AdminDashboard />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/dashboard/files" element={<DashboardPage />} />
        <Route path="/dashboard/shared" element={<DashboardPage />} />
        <Route path="/dashboard/recent-uploads" element={<DashboardPage />} />
        <Route path="/dashboard/activity" element={<DashboardPage />} />
        <Route path="/dashboard/shared-by-me" element={<DashboardPage />} />
        <Route path="/dashboard/favorites" element={<DashboardPage />} />
        <Route path="/dashboard/trash" element={<DashboardPage />} />
        <Route path="/dashboard/storage" element={<DashboardPage />} />
        <Route path="/dashboard/analytics" element={<DashboardPage />} />
        <Route path="/dashboard/security" element={<DashboardPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
