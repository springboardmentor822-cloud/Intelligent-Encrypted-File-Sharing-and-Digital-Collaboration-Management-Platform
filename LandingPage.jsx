import React from 'react';

export default function LandingPage({ onNavigate }) {
  return (
    <div className="min-h-screen bg-[#070d1e] text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white antialiased">
      {/* =========================================================================
          1. NAVIGATION BAR
         ========================================================================= */}
      <nav className="sticky top-0 z-40 bg-[#070d1e]/85 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => onNavigate('landing')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-400 flex items-center justify-center text-white shadow-lg shadow-blue-500/25">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
            </div>
            <div>
              <span className="text-xl font-extrabold tracking-tight text-white block">TrustShare</span>
              <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider block -mt-1">
                AES-256 Enterprise Vault
              </span>
            </div>
          </div>

          {/* Center Links */}
          <div className="hidden md:flex items-center gap-8 text-xs font-semibold text-slate-300">
            <a href="#features" className="hover:text-cyan-400 transition">Features</a>
            <a href="#security" className="hover:text-cyan-400 transition">Security Architecture</a>
            <a href="#monitoring" className="hover:text-cyan-400 transition">Milestone 3 Monitoring</a>
            <button
              onClick={() => onNavigate('auth', { role: 'USER' })}
              className="text-slate-300 hover:text-white transition"
            >
              User Portal
            </button>
            <button
              onClick={() => onNavigate('auth', { role: 'ADMIN' })}
              className="text-slate-300 hover:text-white transition"
            >
              Admin Portal
            </button>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate('auth', { role: 'USER' })}
              className="text-xs font-bold text-slate-300 hover:text-white px-3.5 py-2 rounded-xl hover:bg-slate-800 transition"
            >
              Sign In
            </button>
            <button
              onClick={() => onNavigate('auth', { role: 'USER' })}
              className="text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl transition shadow-md shadow-blue-600/30 flex items-center gap-1.5"
            >
              <span>Get Started</span>
              <span>→</span>
            </button>
          </div>
        </div>
      </nav>

      {/* =========================================================================
          2. HERO SECTION
         ========================================================================= */}
      <section className="relative max-w-7xl mx-auto px-6 pt-12 pb-20 lg:pt-20 lg:pb-28">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Hero Pitch */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
              Milestone 3 Active • Enterprise Cloud Security Platform
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">
              Secure Cloud File Sharing for a{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-indigo-300">
                Safer Tomorrow
              </span>
            </h1>

            <p className="text-sm sm:text-base text-slate-300 max-w-xl leading-relaxed">
              Upload, store, and share your critical documents with certified 
              <span className="text-cyan-400 font-semibold"> AES-256-GCM Envelope Encryption</span>, 
              <span className="text-emerald-400 font-semibold"> Real-Time Activity Monitoring</span>, 
              <span className="text-purple-400 font-semibold"> Centralized Audit Logging</span>, and 
              <span className="text-amber-400 font-semibold"> Automated Threat Detection</span>.
            </p>

            {/* Direct Dual Login Buttons */}
            <div className="flex flex-wrap items-center gap-3.5 pt-2">
              <button
                onClick={() => onNavigate('auth', { role: 'USER' })}
                className="px-6 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs sm:text-sm uppercase tracking-wider transition shadow-xl shadow-blue-600/30 flex items-center gap-2"
              >
                <span>👤</span>
                <span>Sign In as User (Likitha) →</span>
              </button>

              <button
                onClick={() => onNavigate('auth', { role: 'ADMIN' })}
                className="px-6 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-extrabold text-xs sm:text-sm uppercase tracking-wider transition flex items-center gap-2"
              >
                <span>🛡️</span>
                <span>Sign In as Admin →</span>
              </button>
            </div>

            {/* Checklist */}
            <div className="pt-6 border-t border-slate-800/80 flex flex-wrap items-center gap-6 text-xs text-slate-400 font-medium">
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-400 font-bold">✓</span> AES-256-GCM Vault
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-400 font-bold">✓</span> Role-Based Access Control
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-400 font-bold">✓</span> Centralized Audit Logs
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-400 font-bold">✓</span> Threat Detection Engine
              </div>
            </div>
          </div>

          {/* Right Visual Card (Interactive Vault & Threat Preview) */}
          <div className="lg:col-span-5 relative">
            <div className="relative bg-gradient-to-b from-[#0f1d38] to-[#0a1426] border border-cyan-500/20 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs font-bold">
                <div className="flex items-center gap-2 text-white">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>TrustShare Live Security Cluster</span>
                </div>
                <span className="text-[10px] text-cyan-300 font-mono bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
                  AES-256 ACTIVE
                </span>
              </div>

              {/* Sample Encrypted Documents */}
              <div className="space-y-2.5">
                <div className="p-3 rounded-2xl bg-[#080f20] border border-slate-800 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-white flex items-center gap-2">
                      <span className="text-red-400">📄</span> Annual_Audit_Report.pdf
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono mt-0.5">2.4 MB • AES-256-GCM Sealed</div>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/20">
                    Encrypted
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-[#080f20] border border-slate-800 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-white flex items-center gap-2">
                      <span className="text-blue-400">📄</span> Q4_Financial_Ledger.xlsx
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono mt-0.5">840 KB • Protected by DEK</div>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-bold border border-blue-500/20">
                    Shared
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-[#080f20] border border-slate-800 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-white flex items-center gap-2">
                      <span className="text-purple-400">📄</span> Architecture_Blueprint.png
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono mt-0.5">3.1 MB • Master KEK Wrapped</div>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 text-[10px] font-bold border border-purple-500/20">
                    Audit Logged
                  </span>
                </div>
              </div>

              {/* Live Threat Monitor Badge */}
              <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 text-[11px] flex items-center justify-between text-slate-300">
                <span className="flex items-center gap-2">
                  <span className="text-amber-400">⚠</span>
                  <span>Automated Anomaly Watcher</span>
                </span>
                <span className="font-mono text-emerald-400 text-[10px] font-bold">0 Active Threats</span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Stats Strip */}
        <div className="mt-8 pt-8 border-t border-slate-800/80 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
            <div className="text-2xl sm:text-3xl font-black text-cyan-400">100%</div>
            <div className="text-[11px] text-slate-400 mt-1 uppercase font-semibold">Encryption Coverage</div>
          </div>
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
            <div className="text-2xl sm:text-3xl font-black text-blue-400">256-Bit</div>
            <div className="text-[11px] text-slate-400 mt-1 uppercase font-semibold">Key Entropy</div>
          </div>
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
            <div className="text-2xl sm:text-3xl font-black text-purple-400">6 Modules</div>
            <div className="text-[11px] text-slate-400 mt-1 uppercase font-semibold">Milestone 3 Architecture</div>
          </div>
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
            <div className="text-2xl sm:text-3xl font-black text-emerald-400">0 ms</div>
            <div className="text-[11px] text-slate-400 mt-1 uppercase font-semibold">Tamper Latency</div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          3. MILESTONE 3 CAPABILITIES GRID
         ========================================================================= */}
      <section id="features" className="max-w-7xl mx-auto px-6 py-16 border-t border-slate-800/80 space-y-10">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Comprehensive Architecture</div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">Engineered for Enterprise Data Security</h2>
          <p className="text-xs sm:text-sm text-slate-400">
            From client-side envelope encryption to automated SIEM threat response, explore every security layer built into TrustShare.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Feature 1 */}
          <div className="bg-[#0b162c] border border-slate-800 rounded-3xl p-6 space-y-3 hover:border-cyan-500/40 transition">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-bold text-lg">
              🔐
            </div>
            <h3 className="text-base font-bold text-white">AES-256-GCM Envelope Encryption</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Every stored document is encrypted using Galois/Counter Mode with fresh 256-bit DEKs, 96-bit nonces, and 128-bit GHASH authentication tags.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="bg-[#0b162c] border border-slate-800 rounded-3xl p-6 space-y-3 hover:border-blue-500/40 transition">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-lg">
              👁️
            </div>
            <h3 className="text-base font-bold text-white">Activity Monitoring (Task 1)</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Real-time telemetry recording every file upload, download, share creation, and login event automatically in dual SQLite and MongoDB storage.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="bg-[#0b162c] border border-slate-800 rounded-3xl p-6 space-y-3 hover:border-purple-500/40 transition">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center font-bold text-lg">
              📜
            </div>
            <h3 className="text-base font-bold text-white">Centralized Audit Logging (Task 2)</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Tamper-evident, court-admissible audit trails queryable via filtered endpoints by user, target file, action type, and status.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="bg-[#0b162c] border border-slate-800 rounded-3xl p-6 space-y-3 hover:border-amber-500/40 transition">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold text-lg">
              🔔
            </div>
            <h3 className="text-base font-bold text-white">Real-Time Notifications (Task 3)</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Instant user and admin alerts delivered with unread count badges, slide-out notification drawers, and automated read state synchronization.
            </p>
          </div>

          {/* Feature 5 */}
          <div className="bg-[#0b162c] border border-slate-800 rounded-3xl p-6 space-y-3 hover:border-emerald-500/40 transition">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-lg">
              📊
            </div>
            <h3 className="text-base font-bold text-white">Storage Analytics &amp; Reports (Tasks 4 &amp; 5)</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Executive reports summarizing upload/download volume, top accessed documents, and per-user storage allocation tables.
            </p>
          </div>

          {/* Feature 6 */}
          <div className="bg-[#0b162c] border border-slate-800 rounded-3xl p-6 space-y-3 hover:border-red-500/40 transition">
            <div className="w-10 h-10 rounded-2xl bg-red-500/10 text-red-400 flex items-center justify-center font-bold text-lg">
              🚨
            </div>
            <h3 className="text-base font-bold text-white">Suspicious Activity Detection (Task 6)</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Automated SIEM rule engine detecting brute-force logins (&gt;5 fails), mass downloads, and revoked token access attempts with live simulation.
            </p>
          </div>
        </div>
      </section>

      {/* =========================================================================
          4. FOOTER
         ========================================================================= */}
      <footer className="mt-auto border-t border-slate-800 bg-[#050917] py-8 text-center text-xs text-slate-500 space-y-2">
        <div className="flex items-center justify-center gap-2">
          <span className="font-extrabold text-slate-300">TrustShare</span>
          <span>•</span>
          <span>Likitha Manchikanti — Enterprise Secure Cloud File Sharing</span>
        </div>
        <p className="text-[11px] text-slate-600">Built with Python FastAPI, SQLAlchemy, React, Vite, Tailwind CSS, and AES-256-GCM.</p>
      </footer>
    </div>
  );
}
