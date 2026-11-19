import React, { useState, useEffect } from 'react';
import LandingPage from './LandingPage';
import AuthPage from './AuthPage';
import UserLayout from './UserLayout';
import AdminLayout from './AdminLayout';

export default function App() {
  // Session State: Load from sessionStorage if already authenticated
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = sessionStorage.getItem('trustshare_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Current Screen State: Default to 'landing' (Home Page)
  const [currentScreen, setCurrentScreen] = useState(() => {
    try {
      const savedUser = sessionStorage.getItem('trustshare_user');
      if (savedUser) {
        return 'dashboard';
      }
    } catch {
      // ignore
    }
    return 'landing';
  });

  const [authRole, setAuthRole] = useState('USER');
  const [notificationMsg, setNotificationMsg] = useState('');
  const [rbacAlert, setRbacAlert] = useState('');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Synchronize currentUser with sessionStorage
  useEffect(() => {
    if (currentUser) {
      sessionStorage.setItem('trustshare_user', JSON.stringify(currentUser));
    } else {
      sessionStorage.removeItem('trustshare_user');
    }
  }, [currentUser]);

  // Secure Navigation Controller (Strict RBAC & Auth Guard)
  const navigateTo = (screen, options = {}) => {
    // 1. Navigation to Auth page
    if (screen === 'auth') {
      if (options.role) setAuthRole(options.role);
      setCurrentScreen('auth');
      return;
    }

    // 2. Navigation to Public Home Page
    if (screen === 'landing') {
      setCurrentScreen('landing');
      return;
    }

    // 3. Protected Dashboard Screens: Authentication is MANDATORY
    if (!currentUser) {
      setRbacAlert('Access Denied: You must authenticate with the backend first.');
      setTimeout(() => setRbacAlert(''), 5000);
      setAuthRole(screen === 'admin' ? 'ADMIN' : 'USER');
      setCurrentScreen('auth');
      return;
    }

    setRbacAlert('');
    setCurrentScreen('dashboard');
  };

  // Login Handler (Called only by AuthPage upon verified server-side authentication)
  const handleLoginSuccess = (userPayload) => {
    setCurrentUser(userPayload);
    setRbacAlert('');
    setNotificationMsg(`Signed in as ${userPayload.name} (${userPayload.role})`);
    setTimeout(() => setNotificationMsg(''), 4000);
    setCurrentScreen('dashboard');
  };

  // Request Logout (Triggers the confirmation modal first)
  const handleRequestLogout = () => {
    setShowLogoutConfirm(true);
  };

  // Confirmed Logout (Completely terminates active server-side and client session)
  const handleConfirmLogout = async () => {
    const prevName = currentUser?.name || 'User';
    const token = currentUser?.token;
    setShowLogoutConfirm(false);

    if (token) {
      try {
        await fetch('http://localhost:8000/api/v1/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch {
        // Continue clearing client session even if network offline
      }
    }

    setCurrentUser(null);
    sessionStorage.removeItem('trustshare_user');
    setRbacAlert('');
    setNotificationMsg(`Signed out of ${prevName}'s session. You have been returned to the Home page.`);
    setTimeout(() => setNotificationMsg(''), 5000);
    setCurrentScreen('landing');
  };

  return (
    <div className="relative min-h-screen">
      {/* RBAC Violation Alert Banner */}
      {rbacAlert && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-red-600 text-white text-xs font-semibold px-6 py-3 rounded-2xl shadow-2xl border border-red-400 flex items-center gap-3 animate-fade-in max-w-lg">
          <span className="text-base">⛔</span>
          <span>{rbacAlert}</span>
          <button onClick={() => setRbacAlert('')} className="ml-auto text-white font-bold p-1 hover:opacity-80">✕</button>
        </div>
      )}

      {/* Global Success / Logout Toast */}
      {notificationMsg && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white text-xs font-bold px-4 py-2.5 rounded-2xl shadow-xl border border-slate-700 flex items-center gap-2 animate-fade-in">
          <span className="text-emerald-400">✓</span>
          <span>{notificationMsg}</span>
        </div>
      )}

      {/* Reconfirmation Logout Modal Pop-Up */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-red-50 text-red-600 flex items-center justify-center text-xl shadow-xs border border-red-100">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>

            <div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight">Confirm Sign Out</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Are you sure you want to log out of your session as{' '}
                <span className="font-bold text-slate-800">{currentUser?.name}</span>?
              </p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-2.5 border border-slate-100 text-[11px] text-slate-500 flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>All encrypted files and keys are secured.</span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmLogout}
                className="py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition shadow-md shadow-red-500/25"
              >
                Yes, Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Screen Routing & Role-Based Layout Rendering */}
      {currentScreen === 'landing' && (
        <LandingPage onNavigate={navigateTo} />
      )}

      {currentScreen === 'auth' && (
        <AuthPage
          onLoginSuccess={handleLoginSuccess}
          onBackToHome={() => setCurrentScreen('landing')}
          initialRole={authRole}
        />
      )}

      {/* Authenticated Workspace: STRICT SEPARATION BY ROLE */}
      {currentScreen === 'dashboard' && currentUser && (
        currentUser.role === 'ADMIN' ? (
          <AdminLayout user={currentUser} onLogout={handleRequestLogout} />
        ) : (
          <UserLayout user={currentUser} onLogout={handleRequestLogout} />
        )
      )}
    </div>
  );
}
