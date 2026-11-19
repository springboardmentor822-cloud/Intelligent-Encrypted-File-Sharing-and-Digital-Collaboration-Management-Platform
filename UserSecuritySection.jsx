import React, { useState } from 'react';

export default function UserSecuritySection({ onNavigate, user, onLogout }) {
  const [selectedPillar, setSelectedPillar] = useState(null);

  // 10 Security Pillars matching the exact reference image
  const securityPillars = [

    {
      id: 1,
      title: 'AES-256 Encryption',
      status: 'Active',
      desc: 'All files are encrypted using industry-standard AES-256 encryption before storage.',
      details: 'Implements Galois/Counter Mode (AES-256-GCM) providing authenticated encryption. A 256-bit unique Data Encryption Key (DEK) is generated cryptographically per file, protecting vault contents at rest against quantum and brute-force threats.',
      iconColor: 'text-emerald-600 bg-emerald-50 border-emerald-200',
      icon: (
        <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      )
    },
    {
      id: 2,
      title: 'HTTPS/TLS Communication',
      status: 'Active',
      desc: 'All data is transmitted securely using HTTPS/TLS encryption.',
      details: 'Strict TLS 1.3 cryptographic tunneling en route between React frontend and FastAPI backend, securing payloads against eavesdropping, interception, packet tampering, and Man-In-The-Middle (MITM) attacks.',
      iconColor: 'text-blue-600 bg-blue-50 border-blue-200',
      icon: (
        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
        </svg>
      )
    },
    {
      id: 3,
      title: 'JWT Authentication',
      status: 'Active',
      desc: 'Secure token-based authentication for protected API access.',
      details: 'RFC-7519 compliant JSON Web Tokens cryptographically signed with HMAC-SHA256. Carries user identity, role claims, and strict expiration times to eliminate server-side session vulnerabilities.',
      iconColor: 'text-purple-600 bg-purple-50 border-purple-200',
      icon: (
        <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
      )
    },
    {
      id: 4,
      title: 'OAuth2 Authentication',
      status: 'Active',
      desc: 'Sign in using your Google or Microsoft account.',
      details: 'Federated identity delegation protocol enabling zero-trust third-party authorization. Ensures raw user passwords never touch application servers while adhering to OIDC security standards.',
      iconColor: 'text-red-600 bg-red-50 border-red-200',
      icon: (
        <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      )
    },
    {
      id: 5,
      title: 'Role-Based Access Control',
      status: 'Active',
      desc: 'Access and permissions are managed based on your role.',
      details: 'Hierarchical authorization tiers (ADMIN, USER, GUEST). Standard users are cryptographically prevented from viewing administrative dashboards, security rule matrices, and system telemetry with 403 Forbidden enforcement.',
      iconColor: 'text-blue-600 bg-blue-50 border-blue-200',
      icon: (
        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      )
    },
    {
      id: 6,
      title: 'Temporary Share Links',
      status: 'Active',
      desc: 'Create time-limited secure links with custom permissions.',
      details: 'High-entropy 256-bit cryptographic tokens generated with configurable expiration windows (1h to 72h). Offers instantaneous revocation switches that immediately invalidate token resolution on the edge.',
      iconColor: 'text-cyan-600 bg-cyan-50 border-cyan-200',
      icon: (
        <svg className="w-5 h-5 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      )
    },
    {
      id: 7,
      title: 'Download Tracking',
      status: 'Active',
      desc: 'Track all file downloads and access history.',
      details: 'Real-time telemetry counters capture exact decryption timestamps, requester IP addresses, user agent fingerprints, and total download tallies stored in the database for comprehensive compliance tracking.',
      iconColor: 'text-indigo-600 bg-indigo-50 border-indigo-200',
      icon: (
        <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      )
    },
    {
      id: 8,
      title: 'Audit Logging',
      status: 'Active',
      desc: 'Maintain detailed logs of all security events and file activities.',
      details: 'Tamper-evident, immutable audit trail recording every upload, download, permission alteration, and shared link creation. Directly queryable via /api/v1/audit-logs with granular filtering.',
      iconColor: 'text-blue-600 bg-blue-50 border-blue-200',
      icon: (
        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    },
    {
      id: 9,
      title: 'Secure Token Generation',
      status: 'Active',
      desc: 'Generate secure tokens for file access and sharing.',
      details: 'Uses Python secrets module and OS-level CSPRNG (/dev/urandom on Unix, CryptGenRandom on Windows) ensuring tokens possess 256 bits of cryptographic entropy with zero predictability.',
      iconColor: 'text-sky-600 bg-sky-50 border-sky-200',
      icon: (
        <svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        </svg>
      )
    },
    {
      id: 10,
      title: 'Key Rotation',
      status: 'Active',
      desc: 'Encryption keys are rotated periodically for enhanced security.',
      details: 'Two-tier envelope key architecture decoupling file payload keys from Master Key Encryption Keys (KEK). Enables zero-downtime master key rotation without requiring costly re-encryption of stored files.',
      iconColor: 'text-teal-600 bg-teal-50 border-teal-200',
      icon: (
        <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      )
    }
  ];

  return (
    <div className="min-h-full bg-[#f8fafc] font-sans text-slate-800 antialiased">

      {/* =========================================================================
          MAIN USER CONTENT
         ========================================================================= */}
      <main className="flex-1 overflow-y-auto flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="bg-white border-b border-slate-200/90 px-6 py-3 flex items-center justify-between gap-4 sticky top-0 z-30">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search files, folders..."
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition"
            />
            <svg className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Right Header items: Bell & Profile LM Likitha Manchikanti */}
          <div className="flex items-center gap-4">
            {/* Notification Bell */}
            <div className="relative p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white"></span>
            </div>

            {/* User Profile Card: LM / Likitha Manchikanti (Standard User) */}
            <div className="flex items-center gap-2.5 pl-3 border-l border-slate-200">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-extrabold text-xs flex items-center justify-center shadow-xs">
                LM
              </div>
              <div className="text-left">
                <div className="text-xs font-bold text-slate-800 leading-tight">Likitha Manchikanti</div>
                <div className="text-[10px] text-slate-400 font-medium leading-tight">Standard User</div>
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
          </div>
        </header>

        {/* Security Body Section */}
        <div className="p-6 space-y-6">
          {/* Header Banner */}
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/25">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Security</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Your files and account are protected with advanced security measures
              </p>
            </div>
          </div>

          {/* =========================================================================
              10 SECURITY CARDS (2 rows of 5 cards matching reference design)
             ========================================================================= */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {securityPillars.map((item) => (
              <div
                key={item.id}
                className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:shadow-md hover:border-blue-300 transition duration-200 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center border bg-slate-50 border-slate-100 shadow-xs">
                      {item.icon}
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {item.status}
                    </span>
                  </div>

                  <h3 className="text-xs font-bold text-slate-900 leading-snug">{item.title}</h3>
                  <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed line-clamp-3">
                    {item.desc}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 mt-3 flex items-center justify-between text-[11px]">
                  <button
                    onClick={() => setSelectedPillar(item)}
                    className="text-blue-600 font-semibold hover:text-blue-800 flex items-center gap-1 transition"
                  >
                    <span>Learn More</span>
                    <span>→</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Learn More Modal */}
      {selectedPillar && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  {selectedPillar.icon}
                </div>
                <h3 className="text-base font-extrabold text-slate-900">{selectedPillar.title}</h3>
              </div>
              <button
                onClick={() => setSelectedPillar(null)}
                className="text-slate-400 hover:text-slate-700 font-bold text-lg p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Status: {selectedPillar.status}
              </div>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                {selectedPillar.details}
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedPillar(null)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
