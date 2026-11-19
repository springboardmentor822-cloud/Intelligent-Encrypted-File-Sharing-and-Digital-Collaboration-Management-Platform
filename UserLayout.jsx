import React, { useState } from 'react';
import FileAnalyticsDashboard from './FileAnalyticsDashboard';
import SharedLinksManagement from './SharedLinksManagement';
import UserSecuritySection from './UserSecuritySection';
import EncryptionLab from './EncryptionLab';
import AccountSessionSettings from './AccountSessionSettings';

export default function UserLayout({ user, onLogout }) {
  const [currentTab, setCurrentTab] = useState('file-vault');

  const navigationItems = [
    { id: 'file-vault', label: 'File Vault & Storage', icon: '📁', description: 'AES-256 encrypted documents' },
    { id: 'shared-links', label: 'Shared Links', icon: '🔗', description: 'Temporary token shares' },
    { id: 'security-center', label: 'Security Center', icon: '🛡️', description: '10 Security Pillars' },
    { id: 'crypto-lab', label: 'Cryptographic Lab', icon: '🔐', description: 'Interactive AES-GCM studio' },
    { id: 'account-settings', label: 'Account & Sessions', icon: '⚙️', description: 'Argon2id credentials' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex font-sans">
      {/* =========================================================================
          USER SIDEBAR (Strictly User-Only Pages)
         ========================================================================= */}
      <aside className="w-64 bg-[#0a1128] text-slate-300 flex flex-col justify-between border-r border-slate-800 shrink-0 hidden md:flex">
        {/* Brand Header */}
        <div>
          <div className="p-6 border-b border-slate-800/80 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/25">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
              </svg>
            </div>
            <div>
              <span className="font-black text-white text-base tracking-tight block">TrustShare</span>
              <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider block">User Portal</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1.5">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider px-3 mb-2 block">
              Workspace Navigation
            </span>
            {navigationItems.map((item) => {
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-xs transition text-left ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  <div className="truncate">
                    <span className="block leading-tight">{item.label}</span>
                    <span className={`text-[10px] font-normal block truncate ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                      {item.description}
                    </span>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Profile Card & Sign Out */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/60 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-xs shadow-md shadow-blue-500/25">
              LM
            </div>
            <div className="truncate">
              <span className="text-xs font-bold text-white block truncate">{user.name || 'Likitha Manchikanti'}</span>
              <span className="text-[10px] text-slate-400 block truncate">{user.email}</span>
              <span className="inline-block mt-0.5 px-2 py-0.2 rounded-full text-[9px] font-extrabold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                STANDARD USER
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
          MAIN USER WORKSPACE
         ========================================================================= */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Mobile Header */}
        <header className="md:hidden bg-[#0a1128] text-white p-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="font-black text-sm">TrustShare User</span>
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
                currentTab === item.id ? 'bg-blue-600 text-white' : 'text-slate-600 bg-slate-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Page Container */}
        <main className="flex-1 p-6 sm:p-8 max-w-7xl w-full mx-auto">
          {currentTab === 'file-vault' && (
            <FileAnalyticsDashboard user={user} onLogout={onLogout} />
          )}

          {currentTab === 'shared-links' && (
            <SharedLinksManagement user={user} />
          )}

          {currentTab === 'security-center' && (
            <UserSecuritySection user={user} onLogout={onLogout} />
          )}

          {currentTab === 'crypto-lab' && (
            <EncryptionLab user={user} onLogout={onLogout} />
          )}

          {currentTab === 'account-settings' && (
            <AccountSessionSettings user={user} />
          )}
        </main>
      </div>
    </div>
  );
}
