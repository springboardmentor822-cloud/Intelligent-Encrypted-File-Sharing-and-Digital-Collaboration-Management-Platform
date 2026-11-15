import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import api from "./lib/api";
import { useTheme } from "./lib/theme";
import Layout from "./components/Layout";
import ActivityLogs from "./pages/ActivityLogs";
import AdminAccess from "./pages/AdminAccess";
import AdminAlerts from "./pages/AdminAlerts";
import AdminAuditLogs from "./pages/AdminAuditLogs";
import AdminDashboard from "./pages/AdminDashboard";
import AdminFiles from "./pages/AdminFiles";
import AdminSecurity from "./pages/AdminSecurity";
import AdminNotifications from "./pages/AdminNotifications";
import AdminReports from "./pages/AdminReports";
import AdminSharing from "./pages/AdminSharing";
import AdminStorage from "./pages/AdminStorage";
import AdminThreats from "./pages/AdminThreats";
import AdminUserActivity from "./pages/AdminUserActivity";
import DashboardHome from "./pages/DashboardHome";
import FileAnalytics from "./pages/FileAnalytics";
import Files from "./pages/Files";
import Landing from "./pages/Landing";
import ForgotPassword from "./pages/ForgotPassword";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Notifications from "./pages/Notifications";
import OAuthCallback from "./pages/OAuthCallback";
import Settings from "./pages/Settings";
import SharedByMe from "./pages/SharedByMe";
import Storage from "./pages/Storage";
import UserSecurity from "./pages/UserSecurity";
import SharePage from "./pages/SharePage";
import Signup from "./pages/Signup";
import { isAdmin, useAuth } from "./store/auth";

// Redirects to /login if not logged in (and optionally checks for the admin role)
function Protected({ children, admin = false }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const blocked = !loading && !!user && admin && !isAdmin(user);
  // A normal user opened an admin page. React sends them back to their dashboard, but that happens inside the
  // browser, so we also TELL THE SERVER: it writes the audit event and fires the "non-admin in admin area" trigger.
  useEffect(() => {
    if (blocked) api.post("/auth/admin-area-attempt", { path: location.pathname }).catch(() => {});
  }, [blocked, location.pathname]);
  if (loading) return <div className="p-10 text-center text-slate-500">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && !isAdmin(user)) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  const init = useAuth((s) => s.init);
  const theme = useTheme((s) => s.theme);   // changing the theme re-creates the pages so charts pick up the new colours
  useEffect(() => { init(); }, [init]);

  return (
    <Routes key={theme}>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/share/:token" element={<SharePage />} />
      <Route path="/oauth/callback" element={<OAuthCallback />} />

      <Route element={<Protected><Layout /></Protected>}>
        <Route path="/dashboard" element={<DashboardHome />} />
        <Route path="/files" element={<Files mode="mine" />} />
        <Route path="/shared" element={<Files mode="shared" />} />
        <Route path="/shared-by-me" element={<SharedByMe />} />
        <Route path="/recent" element={<Files mode="recent" />} />
        <Route path="/favorites" element={<Files mode="favorites" />} />
        <Route path="/trash" element={<Files mode="trash" />} />
        <Route path="/storage" element={<Storage />} />
        <Route path="/file-analytics" element={<FileAnalytics />} />
        <Route path="/activity" element={<ActivityLogs />} />
        <Route path="/security" element={<UserSecurity />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/analytics" element={<Navigate to="/activity" replace />} />
        <Route path="/admin" element={<Protected admin><AdminDashboard view="overview" /></Protected>} />
        <Route path="/admin/users" element={<Protected admin><AdminDashboard view="users" /></Protected>} />
        <Route path="/admin/files" element={<Protected admin><AdminFiles /></Protected>} />
        <Route path="/admin/sharing" element={<Protected admin><AdminSharing /></Protected>} />
        <Route path="/admin/security" element={<Protected admin><AdminSecurity /></Protected>} />
        <Route path="/admin/security/threats" element={<Protected admin><AdminThreats /></Protected>} />
        <Route path="/admin/analytics" element={<Protected admin><FileAnalytics /></Protected>} />
        <Route path="/admin/system" element={<Protected admin><AdminDashboard view="system" /></Protected>} />
        <Route path="/admin/activity" element={<Protected admin><ActivityLogs /></Protected>} />
        <Route path="/admin/user-activity" element={<Protected admin><AdminUserActivity /></Protected>} />
        <Route path="/admin/audit" element={<Protected admin><AdminAuditLogs /></Protected>} />
        <Route path="/admin/access" element={<Protected admin><AdminAccess /></Protected>} />
        <Route path="/admin/alerts" element={<Protected admin><AdminAlerts /></Protected>} />
        <Route path="/admin/reports" element={<Protected admin><AdminReports /></Protected>} />
        <Route path="/admin/storage" element={<Protected admin><AdminStorage /></Protected>} />
        <Route path="/admin/notifications" element={<Protected admin><AdminNotifications /></Protected>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
