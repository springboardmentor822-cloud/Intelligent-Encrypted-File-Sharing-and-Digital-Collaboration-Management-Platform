import React, { useState, useEffect } from 'react';

export default function AdminSecurityDashboard({ onNavigate, user, onLogout }) {
  const [dateFilter, setDateFilter] = useState('Oct 1, 2026 - Oct 22, 2026');
  const [activeNav, setActiveNav] = useState('security');
  const [timeRange, setTimeRange] = useState('Last 30 Days');
  const [simulationMsg, setSimulationMsg] = useState('');
  const [securityAlerts, setSecurityAlerts] = useState([]);
  const [loading, setLoading] = useState(false);

  // Default recent login records matching the reference design
  const [loginActivity, setLoginActivity] = useState([
    { id: 1, name: 'Priya Sharma', email: 'priya@company.com', ip: '192.168.1.45', status: 'Success', location: 'Hyderabad, IN', time: '22 Oct 2026, 10:24 AM' },
    { id: 2, name: 'Rohit Verma', email: 'rohit@company.com', ip: '103.21.78.90', status: 'Success', location: 'Bangalore, IN', time: '22 Oct 2026, 09:18 AM' },
    { id: 3, name: 'Unknown User', email: '-', ip: '185.62.11.34', status: 'Failed', location: 'Moscow, RU', time: '22 Oct 2026, 08:11 AM' },
    { id: 4, name: 'Sneha Patil', email: 'sneha@company.com', ip: '49.36.21.11', status: 'Success', location: 'Pune, IN', time: '21 Oct 2026, 07:45 PM' },
    { id: 5, name: 'Ankit Singh', email: 'ankit@company.com', ip: '203.75.24.18', status: 'Failed', location: 'New York, US', time: '21 Oct 2026, 06:32 PM' }
  ]);

  // Default security events matching the reference design
  const defaultSecurityEvents = [
    { id: 101, event: 'Multiple failed login attempts', severity: 'High', ip: '192.168.1.45', details: '5 failed attempts', time: '22 Oct 2026, 10:24 AM' },
    { id: 102, event: 'Suspicious login from new device', severity: 'Medium', ip: '103.21.78.90', details: 'New device detected', time: '22 Oct 2026, 09:18 AM' },
    { id: 103, event: 'Unauthorized access attempt', severity: 'High', ip: '185.62.11.34', details: 'Blocked by firewall', time: '22 Oct 2026, 08:11 AM' },
    { id: 104, event: 'Admin login', severity: 'Info', ip: '49.36.21.11', details: 'Admin dashboard accessed', time: '21 Oct 2026, 07:45 PM' },
    { id: 105, event: 'File download anomaly', severity: 'Medium', ip: '203.75.24.18', details: 'High number of downloads', time: '21 Oct 2026, 06:32 PM' }
  ];

  const getAuthHeaders = (extra = {}) => {
    const headers = { ...extra };
    if (user?.token) {
      headers['Authorization'] = `Bearer ${user.token}`;
    }
    return headers;
  };

  // Fetch live security alerts from backend
  const fetchLiveAlerts = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/v1/security/alerts', {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const mapped = data.map((item, idx) => ({
            id: item.id || 200 + idx,
            event: item.event_type || item.threat_type || 'Security Violation',
            severity: item.severity || 'High',
            ip: item.ip_address || item.source_ip || '127.0.0.1',
            details: item.description || 'Automated rule triggered',
            time: item.timestamp || (item.created_at ? new Date(item.created_at).toLocaleString() : 'Just now')
          }));
          setSecurityAlerts([...mapped, ...defaultSecurityEvents]);
          return;
        }
      }
    } catch (e) {
      console.warn('Backend alerts offline, using default stream');
    }
    setSecurityAlerts(defaultSecurityEvents);
  };

  useEffect(() => {
    fetchLiveAlerts();
  }, []);

  // Simulate Threat for Mentor Viva Demonstration
  const handleSimulateThreat = async (type) => {
    try {
      setSimulationMsg(`Triggering ${type}...`);
      const res = await fetch('http://localhost:8000/api/v1/security/simulate', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ threat_type: type })
      });
      if (res.ok) {
        const data = await res.json();
        setSimulationMsg(data.message || 'Simulated threat recorded successfully!');
        setTimeout(() => setSimulationMsg(''), 4000);
        fetchLiveAlerts();
      } else {
        const newEvt = {
          id: Date.now(),
          event: type.replace(/_/g, ' '),
          severity: 'High',
          ip: '192.168.1.100',
          details: 'Simulated threat triggered live',
          time: 'Just now'
        };
        setSecurityAlerts([newEvt, ...securityAlerts]);
        setSimulationMsg(`Threat simulated: ${type}`);
        setTimeout(() => setSimulationMsg(''), 4000);
      }
    } catch (err) {
      const newEvt = {
        id: Date.now(),
        event: type.replace(/_/g, ' '),
        severity: 'High',
        ip: '192.168.1.100',
        details: 'Simulated threat triggered live',
        time: 'Just now'
      };
      setSecurityAlerts([newEvt, ...securityAlerts]);
      setSimulationMsg(`Threat simulated: ${type}`);
      setTimeout(() => setSimulationMsg(''), 4000);
    }
  };

  return (
    <div className="min-h-full bg-[#f1f5f9] font-sans text-slate-800 antialiased">
      {/* =========================================================================
          LEFT DARK SIDEBAR (Exact design from reference image)
         ========================================================================= */}
      <aside className="hidden">
        <div>
          {/* Logo */}
          <div className="p-5 border-b border-slate-800/80 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-400 flex items-center justify-center text-white shadow-lg shadow-blue-500/25">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
            </div>
            <div>
              <span className="font-extrabold text-base text-white tracking-tight block">TrustShare</span>
              <span className="text-[10px] text-slate-400 font-medium block -mt-0.5">Secure File-Sharing System</span>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="p-4 space-y-6">
            <div>
              <div className="text-[10px] font-bold text-slate-400 tracking-wider uppercase px-3 mb-2">
                ADMIN PANEL
              </div>
              <nav className="space-y-1 text-xs font-semibold">
                <button
                  onClick={() => onNavigate('file-analytics')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition text-left"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                  <span>Dashboard</span>
                </button>

                <button
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition text-left"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                  <span>User Management</span>
                </button>

                <button
                  onClick={() => onNavigate('file-analytics')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition text-left"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                  <span>File Management</span>
                </button>

                <button
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition text-left"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  <span>Sharing Reports</span>
                </button>

                {/* Active Link: Security Dashboard */}
                <button
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-blue-600 text-white font-bold shadow-md shadow-blue-600/30 text-left transition"
                >
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                  <span>Security Dashboard</span>
                </button>

                <button
                  onClick={() => onNavigate('encryption-lab')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-cyan-400 hover:text-cyan-300 hover:bg-slate-800/60 font-bold transition text-left"
                >
                  <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                  <span>🔐 Encryption Lab</span>
                </button>

                <button
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition text-left"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                  <span>Analytics</span>
                </button>

                <button
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition text-left"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  <span>System Monitoring</span>
                </button>

                <button
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition text-left"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <span>Activity Logs</span>
                </button>

                <button
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition text-left"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /></svg>
                  <span>Settings</span>
                </button>
              </nav>
            </div>
          </div>
        </div>

        {/* Bottom Storage Meter (Exact from reference) */}
        <div className="p-4 border-t border-slate-800/80">
          <div className="bg-slate-900/80 p-3.5 rounded-2xl border border-slate-800">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="flex items-center gap-1.5 text-slate-300 font-semibold">
                <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z" /></svg>
                Storage Usage
              </span>
              <span className="text-[11px] font-bold text-blue-400">34%</span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full rounded-full" style={{ width: '34%' }}></div>
            </div>
            <div className="text-[10px] text-slate-400 mt-2 font-mono">
              342 GB / 1 TB
            </div>
          </div>
        </div>
      </aside>

      {/* =========================================================================
          MAIN CONTENT AREA
         ========================================================================= */}
      <main className="flex-1 overflow-y-auto flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="bg-white border-b border-slate-200/90 px-6 py-3 flex items-center justify-between gap-4 sticky top-0 z-30">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search users, files, logs..."
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition"
            />
            <svg className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Right Header items: Threat Simulator, Bell, Admin Profile, Date Filter */}
          <div className="flex items-center gap-3">
            {/* Simulation Button for Viva Demo */}
            <div className="relative group">
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 text-xs font-bold transition shadow-xs"
              >
                <span className="text-red-600">⚠</span>
                <span>Simulate Threat Event</span>
                <span className="text-[10px]">▼</span>
              </button>
              <div className="absolute right-0 mt-1 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl py-2 hidden group-hover:block z-50">
                <button
                  onClick={() => handleSimulateThreat('BRUTE_FORCE_LOGIN')}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 font-medium"
                >
                  ⚡ Brute Force Login (&gt;5 fails)
                </button>
                <button
                  onClick={() => handleSimulateThreat('MASS_DOWNLOAD_ANOMALY')}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-amber-50 hover:text-amber-700 font-medium"
                >
                  ⚡ Mass Download Anomaly (&gt;20 files)
                </button>
                <button
                  onClick={() => handleSimulateThreat('REVOKED_TOKEN_ACCESS')}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 font-medium"
                >
                  ⚡ Access to Revoked Token
                </button>
                <button
                  onClick={() => handleSimulateThreat('EXPIRED_LINK_ACCESS')}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-purple-50 hover:text-purple-700 font-medium"
                >
                  ⚡ Access Expired Link
                </button>
              </div>
            </div>

            {/* Notification Bell */}
            <div className="relative p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white"></span>
            </div>

            {/* Admin Avatar Profile */}
            <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                A
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-xs font-bold text-slate-800 leading-tight">Admin</div>
                <div className="text-[10px] text-slate-400 font-medium leading-tight">System Administrator</div>
              </div>
            </div>

            {/* Sign Out Button */}
            {onLogout && (
              <button
                onClick={onLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:text-red-600 hover:bg-red-50 border border-slate-200 hover:border-red-200 transition"
                title="Sign out of your session"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            )}

            {/* Date Picker Filter */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700">
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <span>{dateFilter}</span>
              <span className="text-[10px] text-slate-400">▼</span>
            </div>
          </div>
        </header>

        {/* Simulation Alert Banner */}
        {simulationMsg && (
          <div className="mx-6 mt-4 bg-emerald-600 text-white text-xs font-bold px-4 py-2.5 rounded-2xl shadow-lg flex items-center justify-between animate-fade-in">
            <span>✓ {simulationMsg}</span>
            <button onClick={() => setSimulationMsg('')} className="text-white hover:opacity-80">✕</button>
          </div>
        )}

        {/* Body Content Container */}
        <div className="p-6 space-y-6">
          {/* Dashboard Title Header */}
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-[#0a192f] text-white flex items-center justify-center shadow-sm">
              <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Security Dashboard</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Monitor login activity, access attempts, security events and audit logs
              </p>
            </div>
          </div>

          {/* =========================================================================
              5 TOP KPI CARDS (Exact match to reference design)
             ========================================================================= */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* 1. Total Logins */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                </div>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                  ↑ 10%
                </span>
              </div>
              <div className="mt-2">
                <div className="text-[11px] font-semibold text-slate-500">Total Logins</div>
                <div className="text-xl font-extrabold text-slate-900 mt-0.5">2,942</div>
                <div className="text-[10px] text-slate-400 mt-0.5">+268 this month</div>
              </div>
            </div>

            {/* 2. Successful Logins */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                  ↑ 12%
                </span>
              </div>
              <div className="mt-2">
                <div className="text-[11px] font-semibold text-slate-500">Successful Logins</div>
                <div className="text-xl font-extrabold text-slate-900 mt-0.5">2,781</div>
                <div className="text-[10px] text-slate-400 mt-0.5">94.5% success rate</div>
              </div>
            </div>

            {/* 3. Failed Logins */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                  ↑ 28%
                </span>
              </div>
              <div className="mt-2">
                <div className="text-[11px] font-semibold text-slate-500">Failed Logins</div>
                <div className="text-xl font-extrabold text-slate-900 mt-0.5">124</div>
                <div className="text-[10px] text-slate-400 mt-0.5">4.2% failure rate</div>
              </div>
            </div>

            {/* 4. Unauthorized Attempts */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                  ↑ 50%
                </span>
              </div>
              <div className="mt-2">
                <div className="text-[11px] font-semibold text-slate-500">Unauthorized Attempts</div>
                <div className="text-xl font-extrabold text-slate-900 mt-0.5">18</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Blocked automatically</div>
              </div>
            </div>

            {/* 5. Security Events */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                </div>
                <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                  ↑ 17%
                </span>
              </div>
              <div className="mt-2">
                <div className="text-[11px] font-semibold text-slate-500">Security Events</div>
                <div className="text-xl font-extrabold text-slate-900 mt-0.5">{securityAlerts.length || 56}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Includes suspicious activity</div>
              </div>
            </div>
          </div>

          {/* =========================================================================
              3 CHARTS ROW (Login Activity, Access Attempts, Security Events Donut)
             ========================================================================= */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* 1. Login Activity (Area chart) */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Login Activity</h3>
                </div>
                <div className="text-[10px] font-semibold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg">
                  Last 30 Days ▼
                </div>
              </div>

              {/* Clean SVG Area Chart */}
              <div className="h-44 w-full relative mt-2">
                <svg className="w-full h-full overflow-visible" viewBox="0 0 320 140" preserveAspectRatio="none">
                  {/* Grid Lines */}
                  <line x1="0" y1="20" x2="320" y2="20" stroke="#f1f5f9" strokeWidth="1" />
                  <line x1="0" y1="55" x2="320" y2="55" stroke="#f1f5f9" strokeWidth="1" />
                  <line x1="0" y1="90" x2="320" y2="90" stroke="#f1f5f9" strokeWidth="1" />
                  <line x1="0" y1="125" x2="320" y2="125" stroke="#e2e8f0" strokeWidth="1" />

                  {/* Gradient Definition */}
                  <defs>
                    <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Successful Logins Area */}
                  <path
                    d="M 0,85 C 40,55 70,80 100,50 C 130,25 170,60 210,35 C 250,55 280,30 320,40 L 320,125 L 0,125 Z"
                    fill="url(#greenGrad)"
                  />
                  {/* Successful Logins Line */}
                  <path
                    d="M 0,85 C 40,55 70,80 100,50 C 130,25 170,60 210,35 C 250,55 280,30 320,40"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />

                  {/* Failed Logins Line (Red) */}
                  <path
                    d="M 0,118 C 40,115 70,110 100,116 C 130,112 170,118 210,110 C 250,114 280,112 320,115"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>

                {/* Y-axis labels */}
                <div className="absolute left-0 top-0 text-[9px] text-slate-400 font-mono">200</div>
                <div className="absolute left-0 top-10 text-[9px] text-slate-400 font-mono">150</div>
                <div className="absolute left-0 top-20 text-[9px] text-slate-400 font-mono">100</div>
                <div className="absolute left-0 top-28 text-[9px] text-slate-400 font-mono">0</div>
              </div>

              {/* X-axis labels */}
              <div className="flex justify-between text-[10px] text-slate-400 font-medium px-2 mt-2">
                <span>Oct 1</span>
                <span>Oct 5</span>
                <span>Oct 10</span>
                <span>Oct 15</span>
                <span>Oct 20</span>
              </div>

              {/* Legend */}
              <div className="flex items-center justify-center gap-4 text-[11px] font-semibold mt-3 pt-2 border-t border-slate-100">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  Successful Logins
                </span>
                <span className="flex items-center gap-1.5 text-slate-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                  Failed Logins
                </span>
              </div>
            </div>

            {/* 2. Access Attempts (Dual Bar Chart) */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Access Attempts</h3>
                </div>
                <div className="text-[10px] font-semibold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg">
                  Last 30 Days ▼
                </div>
              </div>

              {/* Bar Chart Graphic */}
              <div className="h-44 w-full relative flex items-end justify-between gap-1.5 px-3 pb-1 border-b border-slate-200">
                {/* 15 Bar Pairs matching reference style */}
                {[
                  { r: 25, b: 50 }, { r: 15, b: 35 }, { r: 40, b: 70 }, { r: 20, b: 45 },
                  { r: 35, b: 80 }, { r: 10, b: 30 }, { r: 50, b: 65 }, { r: 15, b: 40 },
                  { r: 30, b: 75 }, { r: 25, b: 55 }, { r: 60, b: 90 }, { r: 20, b: 40 },
                  { r: 45, b: 70 }, { r: 30, b: 60 }, { r: 15, b: 35 }
                ].map((item, idx) => (
                  <div key={idx} className="flex-1 flex items-end justify-center gap-0.5 h-full">
                    {/* Red Bar (Unauthorized) */}
                    <div
                      className="w-1 bg-red-500 rounded-t-sm transition hover:bg-red-600"
                      style={{ height: `${item.r}%` }}
                    ></div>
                    {/* Blue Bar (Blocked) */}
                    <div
                      className="w-1 bg-blue-500 rounded-t-sm transition hover:bg-blue-600"
                      style={{ height: `${item.b}%` }}
                    ></div>
                  </div>
                ))}
              </div>

              {/* X-axis labels */}
              <div className="flex justify-between text-[10px] text-slate-400 font-medium px-2 mt-2">
                <span>Oct 1</span>
                <span>Oct 5</span>
                <span>Oct 10</span>
                <span>Oct 15</span>
                <span>Oct 20</span>
              </div>

              {/* Legend */}
              <div className="flex items-center justify-center gap-4 text-[11px] font-semibold mt-3 pt-2 border-t border-slate-100">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                  Unauthorized Attempts
                </span>
                <span className="flex items-center gap-1.5 text-slate-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                  Blocked Attempts
                </span>
              </div>
            </div>

            {/* 3. Security Events (Donut Chart) */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-slate-900">Security Events</h3>
              </div>

              {/* Circular Donut & Legend */}
              <div className="flex items-center gap-4 my-auto">
                {/* SVG Donut */}
                <div className="relative w-32 h-32 shrink-0 flex items-center justify-center">
                  <svg className="w-32 h-32 -rotate-90" viewBox="0 0 100 100">
                    {/* Background Ring */}
                    <circle cx="50" cy="50" r="38" fill="transparent" stroke="#f1f5f9" strokeWidth="16" />

                    {/* Donut Segments (Total Circumference = 2 * PI * 38 ≈ 238.76) */}
                    {/* 1. Multiple Login Attempts: 32% (76.4) */}
                    <circle cx="50" cy="50" r="38" fill="transparent" stroke="#06b6d4" strokeWidth="16"
                      strokeDasharray="76.4 162.3" strokeDashoffset="0" />
                    {/* 2. Suspicious IP Access: 21% (50.1) */}
                    <circle cx="50" cy="50" r="38" fill="transparent" stroke="#10b981" strokeWidth="16"
                      strokeDasharray="50.1 188.6" strokeDashoffset="-76.4" />
                    {/* 3. Unauthorized Access: 18% (43.0) */}
                    <circle cx="50" cy="50" r="38" fill="transparent" stroke="#f59e0b" strokeWidth="16"
                      strokeDasharray="43.0 195.7" strokeDashoffset="-126.5" />
                    {/* 4. Policy Violations: 14% (33.4) */}
                    <circle cx="50" cy="50" r="38" fill="transparent" stroke="#3b82f6" strokeWidth="16"
                      strokeDasharray="33.4 205.3" strokeDashoffset="-169.5" />
                    {/* 5. Malware/File Threat: 9% (21.5) */}
                    <circle cx="50" cy="50" r="38" fill="transparent" stroke="#ef4444" strokeWidth="16"
                      strokeDasharray="21.5 217.2" strokeDashoffset="-202.9" />
                    {/* 6. Others: 6% (14.3) */}
                    <circle cx="50" cy="50" r="38" fill="transparent" stroke="#8b5cf6" strokeWidth="16"
                      strokeDasharray="14.3 224.4" strokeDashoffset="-224.4" />
                  </svg>
                  {/* Center Text */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                    <span className="text-xl font-black text-slate-900 leading-none">56</span>
                    <span className="text-[10px] text-slate-400 font-semibold mt-0.5">Events</span>
                  </div>
                </div>

                {/* Legend list */}
                <div className="space-y-1 text-[11px] font-semibold text-slate-600 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 truncate"><span className="w-2 h-2 rounded-full bg-cyan-500 shrink-0"></span> Multiple Login Attempts</span>
                    <span className="font-bold text-slate-800 text-[10px]">18 (32%)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 truncate"><span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span> Suspicious IP Access</span>
                    <span className="font-bold text-slate-800 text-[10px]">12 (21%)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 truncate"><span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span> Unauthorized Access</span>
                    <span className="font-bold text-slate-800 text-[10px]">10 (18%)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 truncate"><span className="w-2 h-2 rounded-full bg-blue-500 shrink-0"></span> Policy Violations</span>
                    <span className="font-bold text-slate-800 text-[10px]">8 (14%)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 truncate"><span className="w-2 h-2 rounded-full bg-red-500 shrink-0"></span> Malware/File Threat</span>
                    <span className="font-bold text-slate-800 text-[10px]">5 (9%)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 truncate"><span className="w-2 h-2 rounded-full bg-purple-500 shrink-0"></span> Others</span>
                    <span className="font-bold text-slate-800 text-[10px]">3 (6%)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* =========================================================================
              2 DATA TABLES SIDE BY SIDE (Recent Login Activity & Recent Security Events)
             ========================================================================= */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Table 1: Recent Login Activity */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900">Recent Login Activity</h3>
                <button className="text-xs font-semibold text-blue-600 hover:underline">View All</button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">
                      <th className="pb-2.5 font-semibold">User</th>
                      <th className="pb-2.5 font-semibold">IP Address</th>
                      <th className="pb-2.5 font-semibold">Status</th>
                      <th className="pb-2.5 font-semibold">Location</th>
                      <th className="pb-2.5 font-semibold">Date &amp; Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loginActivity.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/70 transition">
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 font-bold text-[10px] flex items-center justify-center">
                              {item.name[0]}
                            </div>
                            <div>
                              <div className="font-bold text-slate-800">{item.name}</div>
                              <div className="text-[10px] text-slate-400">{item.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 pr-2 font-mono text-[11px] text-slate-600">{item.ip}</td>
                        <td className="py-2.5 pr-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              item.status === 'Success'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-red-50 text-red-700 border border-red-200'
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="py-2.5 pr-2 text-slate-600 text-[11px]">{item.location}</td>
                        <td className="py-2.5 text-slate-400 text-[10px] whitespace-nowrap">{item.time}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Table 2: Recent Security Events */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900">Recent Security Events</h3>
                <button className="text-xs font-semibold text-blue-600 hover:underline">View All</button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">
                      <th className="pb-2.5 font-semibold">Event</th>
                      <th className="pb-2.5 font-semibold">Severity</th>
                      <th className="pb-2.5 font-semibold">IP Address</th>
                      <th className="pb-2.5 font-semibold">Details</th>
                      <th className="pb-2.5 font-semibold">Date &amp; Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {securityAlerts.slice(0, 6).map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/70 transition">
                        <td className="py-2.5 pr-3 font-semibold text-slate-800 text-[11px]">
                          {item.event}
                        </td>
                        <td className="py-2.5 pr-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              item.severity === 'High'
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : item.severity === 'Medium'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}
                          >
                            {item.severity}
                          </span>
                        </td>
                        <td className="py-2.5 pr-2 font-mono text-[11px] text-slate-600">{item.ip}</td>
                        <td className="py-2.5 pr-2 text-slate-500 text-[11px]">{item.details}</td>
                        <td className="py-2.5 text-slate-400 text-[10px] whitespace-nowrap">{item.time}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
