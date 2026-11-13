
import React from "react";
import ReactDOM from "react-dom/client";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

import "./index.css";
import { AuthProvider, useAuth } from "./auth";
import { adminVisit } from "./api";
import Shell from "./Shell";
import { Loading } from "./ui";

import Landing from "./pages/Landing";
import {
  Login,
  Signup,
  Forgot,
  Reset,
  OAuthComplete,
  VerifyEmail,
} from "./pages/Auth";

import {
  Dashboard,
  MyFiles,
  SharedWithMe,
  SharedByMe,
  Recent,
  Favorites,
  Trash,
  StoragePage,
  Analytics,
  ActivityLogs,
  SecurityPage,
  SettingsPage,
} from "./pages/user";

import {
  AdminDashboard,
  AdminUsers,
  AdminFiles,
  AdminSharing,
  AdminSecurity,
  AdminAnalytics,
  AdminSystem,
  AdminAudit,
  AdminSettings,
} from "./pages/admin/admin";

import {
  AdminActivityMonitoring,
  AdminAuditLogs,
  AdminReports,
  AdminStorageAnalytics,
  AdminNotifications,
  AdminSecurityMonitoring,
  AdminSuspiciousAlerts,
} from "./pages/admin/milestone3";
import AdminLogin from "./pages/admin/AdminLogin";

import PublicShare from "./pages/PublicShare";
import SecureFolder from "./pages/SecureFolder";

function Guard({
  admin,
  children,
}: {
  admin?: boolean;
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const loc = useLocation();

  if (loading) return <Loading />;

  if (!user) {
    return (
      <Navigate
        to="/login"
        state={{ from: loc.pathname }}
        replace
      />
    );
  }

  // Frontend navigation convenience only.
  // The backend must independently enforce all access permissions.
  if (admin && user.role !== "admin" && !adminVisit.get()) {
    return <Navigate to="/admin/login?denied=1" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />

      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<Forgot />} />
      <Route path="/reset-password" element={<Reset />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/oauth/complete" element={<OAuthComplete />} />

      {/* Administrator portal is completely separate from the user dashboard. */}
      <Route path="/admin/login" element={<AdminLogin />} />

      <Route path="/s/:token" element={<PublicShare />} />

      <Route
        path="/app"
        element={
          <Guard>
            <Shell />
          </Guard>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="files" element={<MyFiles />} />
        <Route path="shared-with-me" element={<SharedWithMe />} />
        <Route path="shared-by-me" element={<SharedByMe />} />
        <Route path="recent" element={<Recent />} />
        <Route path="favorites" element={<Favorites />} />

        {/* Restored features — keep both routes */}
        <Route path="secure-folder" element={<SecureFolder />} />

        <Route path="trash" element={<Trash />} />
        <Route path="storage" element={<StoragePage />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="activity" element={<ActivityLogs />} />
        <Route path="security" element={<SecurityPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route
        path="/admin"
        element={
          <Guard admin>
            <Shell admin />
          </Guard>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="files" element={<AdminFiles />} />
        <Route path="sharing" element={<AdminSharing />} />
        <Route path="security" element={<AdminSecurity />} />
        <Route path="analytics" element={<AdminAnalytics />} />
        <Route path="system" element={<AdminSystem />} />
        <Route path="audit" element={<AdminAudit />} />
        <Route path="settings" element={<AdminSettings />} />

        {/* Milestone 3 administration modules */}
        <Route path="activity-monitoring" element={<AdminActivityMonitoring />} />
        <Route path="audit-logs" element={<AdminAuditLogs />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="storage-analytics" element={<AdminStorageAnalytics />} />
        <Route path="notifications" element={<AdminNotifications />} />
        <Route path="security-monitoring" element={<AdminSecurityMonitoring />} />
        <Route path="suspicious" element={<AdminSuspiciousAlerts />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
