import React, { useState } from 'react';
import AdminSecurityDashboard from './AdminSecurityDashboard';
import AdminUserManagement from './AdminUserManagement';
import SecurityIncidentManagement from './SecurityIncidentManagement';
import KeyManagementCenter from './KeyManagementCenter';
import AuditComplianceExplorer from './AuditComplianceExplorer';
import EncryptionLab from './EncryptionLab';

export default function AdminLayout({ user, onLogout }) {
  const [currentTab, setCurrentTab] = useState('admin-dashboard');

  const navigationItems = [
    { id: 'admin-dashboard', label: 'SIEM & Security Dashboard', icon: '📊', description: 'Telemetry & analytics' },
    { id: 'user-management', label: 'User Directory', icon: '👥', description: 'Account lifecycle & quotas' },
    { id: 'incident-management', label: 'Security Incidents', icon: '🚨', description: '10 SIEM rule queue' },
    { id: 'key-management', label: 'Key Management (KMS)', icon: '🔑', description: 'Master KEK rotation' },
    { id: 'audit-explorer', label: 'Audit & Compliance', icon: '📜', description: 'Hash chain verification' },
    { id: 'crypto-lab', label: 'Cryptographic Studio', icon: '🔐', description: 'AES-256-GCM testing' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex font-sans">
      {/* =========================================================================
          ADMIN SIDEBAR (Strictly Admin-Only Pages)
         ========================================================================= */}
      <aside className="w-68 bg-[#090d1f] text-slate-300 flex flex-col justify-between border-r border-slate-800 shrink-0 hidden md:flex">
        {/* Brand Header */}
        <div>
          <div className="p-6 border-b border-slate-800/80 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-purple-500/30">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
              </svg>
            </div>
            <div>
              <span className="font-black text-white text-base tracking-tight block">TrustShare</span>
              <span className="text-[10px] text-purple-400 font-extrabold uppercase tracking-wider block">Security Admin</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1.5">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider px-3 mb-2 block">
              Administration Portals
            </span>
            {navigationItems.map((item) => {
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-xs transition text-left ${
                    isActive
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  <div className="truncate">
                    <span className="block leading-tight">{item.label}</span>
                    <span className={`text-[10px] font-normal block truncate ${isActive ? 'text-purple-100' : 'text-slate-400'}`}>
                      {item.description}
                    </span>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Admin Profile Card & Sign Out */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/60 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center font-black text-xs shadow-md shadow-purple-500/25">
              AD
            </div>
            <div className="truncate">
              <span className="text-xs font-bold text-white block truncate">{user.name || 'System Administrator'}</span>
              <span className="text-[10px] text-slate-400 block truncate">{user.email}</span>
              <span className="inline-block mt-0.5 px-2 py-0.2 rounded-full text-[9px] font-extrabold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                SYSTEM ADMINISTRATOR
              </span>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-red-950/60 text-slate-300 hover:text-red-300 hover:border-red-800/60 border border-slate-700/60 font-bold text-xs transition flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* =========================================================================
          MAIN ADMIN WORKSPACE
         ========================================================================= */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Mobile Header */}
        <header className="md:hidden bg-[#090d1f] text-white p-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="font-black text-sm">TrustShare Admin</span>
          </div>
          <button onClick={onLogout} className="text-xs text-red-400 font-bold">Sign Out</button>
        </header>

        {/* Mobile Tab Selector */}
        <div className="md:hidden flex overflow-x-auto bg-white p-2 border-b border-slate-200 gap-1">
          {navigationItems.map(item => (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${
                currentTab === item.id ? 'bg-purple-600 text-white' : 'text-slate-600 bg-slate-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Page Container */}
        <main className="flex-1 p-6 sm:p-8 max-w-7xl w-full mx-auto">
          {currentTab === 'admin-dashboard' && (
            <AdminSecurityDashboard user={user} onLogout={onLogout} />
          )}

          {currentTab === 'user-management' && (
            <AdminUserManagement user={user} />
          )}

          {currentTab === 'incident-management' && (
            <SecurityIncidentManagement user={user} />
          )}

          {currentTab === 'key-management' && (
            <KeyManagementCenter user={user} />
          )}

          {currentTab === 'audit-explorer' && (
            <AuditComplianceExplorer user={user} />
          )}

          {currentTab === 'crypto-lab' && (
            <EncryptionLab user={user} onLogout={onLogout} />
          )}
        </main>
      </div>
    </div>
  );
}
