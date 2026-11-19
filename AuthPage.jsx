import React, { useState } from 'react';

export default function AuthPage({ onLoginSuccess, onBackToHome, initialRole = 'USER' }) {
  const [activeTab, setActiveTab] = useState(initialRole); // 'USER' or 'ADMIN'
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // User Credentials Presets
  const userCredentials = {
    email: 'likitha@trustshare.io',
    name: 'Likitha Manchikanti',
    role: 'USER',
    password: 'UserPass2026!'
  };

  // Admin Credentials Presets
  const adminCredentials = {
    email: 'admin@trustshare.io',
    name: 'Admin',
    role: 'ADMIN',
    password: 'AdminPass2026!'
  };

  const [email, setEmail] = useState(initialRole === 'ADMIN' ? adminCredentials.email : userCredentials.email);
  const [password, setPassword] = useState(initialRole === 'ADMIN' ? adminCredentials.password : userCredentials.password);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setErrorMessage('');
    if (tab === 'ADMIN') {
      setEmail(adminCredentials.email);
      setPassword(adminCredentials.password);
    } else {
      setEmail(userCredentials.email);
      setPassword(userCredentials.password);
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setErrorMessage('');

    try {
      let response;
      const payload = JSON.stringify({
        email: email.trim(),
        password: password
      });

      try {
        response = await fetch('http://localhost:8000/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload
        });
      } catch (e1) {
        // Fallback to 127.0.0.1 if localhost resolution was blocked
        response = await fetch('http://127.0.0.1:8000/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload
        });
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Authentication failed. Please verify credentials.');
      }

      // Genuine server-side authenticated session
      if (onLoginSuccess) {
        onLoginSuccess({
          email: data.user.email,
          name: data.user.full_name,
          role: data.user.role,
          token: data.session_token
        });
      }
    } catch (err) {
      setErrorMessage(err.message || 'Could not connect to backend authentication server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 font-sans selection:bg-blue-600 selection:text-white">
      {/* =========================================================================
          LEFT HERO PANEL (Dark Navy/Glassmorphic Brand Overview)
         ========================================================================= */}
      <div className="lg:col-span-6 relative bg-gradient-to-br from-[#060e22] via-[#091a42] to-[#04285c] p-8 sm:p-12 lg:p-16 flex flex-col justify-between text-slate-100">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={onBackToHome}>
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/40">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
            </div>
            <div>
              <span className="text-2xl font-black tracking-tight text-white block">TrustShare 2.0</span>
              <span className="text-[10px] text-cyan-400 font-semibold uppercase tracking-wider block -mt-1">
                Zero-Trust Secure Cloud Vault
              </span>
            </div>
          </div>
          {onBackToHome && (
            <button
              onClick={onBackToHome}
              className="text-xs text-slate-300 hover:text-white transition bg-white/10 hover:bg-white/15 px-3.5 py-1.5 rounded-xl border border-white/10 flex items-center gap-1.5"
            >
              <span>← </span>
              <span>Home</span>
            </button>
          )}
        </div>

        {/* Center Copy */}
        <div className="my-10 space-y-6 max-w-lg">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            Argon2id Cryptographic Gateway
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight">
            Zero-Trust Security &amp; <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-300">
              Backend Access Control
            </span>
          </h1>

          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
            Sign in to access your AES-256-GCM encrypted vault, manage temporary sharing tokens, inspect tamper-evident audit logs, and monitor cloud security telemetry.
          </p>

          <div className="space-y-3 pt-2 text-xs sm:text-sm text-slate-200">
            <div className="flex items-center gap-3 bg-white/5 p-3 rounded-2xl border border-white/10">
              <span className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-bold">
                🔒
              </span>
              <div>
                <div className="font-bold text-white text-xs">AES-256-GCM Envelope Encryption</div>
                <div className="text-[11px] text-slate-400">All file payloads encrypted before persistent cloud storage.</div>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-white/5 p-3 rounded-2xl border border-white/10">
              <span className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center font-bold">
                🛡️
              </span>
              <div>
                <div className="font-bold text-white text-xs">Strict Backend RBAC (USER vs ADMIN)</div>
                <div className="text-[11px] text-slate-400">Enforced by FastAPI backend dependencies. Never trust client state.</div>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-white/5 p-3 rounded-2xl border border-white/10">
              <span className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-bold">
                👁️
              </span>
              <div>
                <div className="font-bold text-white text-xs">10-Rule Automated SIEM Engine</div>
                <div className="text-[11px] text-slate-400">Real-time alerts on brute-force logins, mass downloads, and tamper events.</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-xs text-slate-400 flex items-center justify-between border-t border-white/10 pt-4">
          <span>TrustShare Security Engine v2.0</span>
          <span>© 2026 Likitha Manchikanti</span>
        </div>
      </div>

      {/* =========================================================================
          RIGHT AUTH PANEL (Tabs for User & Admin Login)
         ========================================================================= */}
      <div className="lg:col-span-6 bg-[#f8fafc] text-slate-900 p-8 sm:p-12 lg:p-16 flex flex-col justify-center">
        <div className="max-w-md w-full mx-auto space-y-6">
          {/* Header Title */}
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              Sign In to TrustShare
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Select your role below to authenticate against the secure backend.
            </p>
          </div>

          {/* Role Selection Tabs */}
          <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-200/80 rounded-2xl border border-slate-300/80">
            <button
              type="button"
              onClick={() => handleTabChange('USER')}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                activeTab === 'USER'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <span>👤</span>
              <span>User (Likitha)</span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('ADMIN')}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                activeTab === 'ADMIN'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-500/25'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <span>🛡️</span>
              <span>Admin Portal</span>
            </button>
          </div>

          {/* Error Message Display */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2 animate-fade-in">
              <span className="text-base">⚠️</span>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Active Role Description Badge */}
          <div
            className={`p-3 rounded-2xl border text-xs leading-relaxed flex items-center gap-3 ${
              activeTab === 'USER'
                ? 'bg-blue-50 border-blue-200 text-blue-900'
                : 'bg-purple-50 border-purple-200 text-purple-900'
            }`}
          >
            <span className="text-lg">{activeTab === 'USER' ? '📁' : '⚡'}</span>
            <div>
              <span className="font-bold block">
                {activeTab === 'USER'
                  ? 'Standard User Portal (Likitha Manchikanti)'
                  : 'System Administrator Portal'}
              </span>
              <span className="text-[11px] text-slate-600">
                {activeTab === 'USER'
                  ? 'Access your Encrypted File Vault, My Files, Audit Trail, and Temporary Share Links.'
                  : 'Access the Security SIEM Dashboard, Threat Simulator, Storage Analytics, and Global Audit Logs.'}
              </span>
            </div>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={activeTab === 'USER' ? 'likitha@trustshare.io' : 'admin@trustshare.io'}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 text-slate-900 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600 transition bg-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-4 py-3 pr-10 rounded-xl border border-slate-300 text-slate-900 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600 transition bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-xs text-slate-400 hover:text-slate-600 font-semibold"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-slate-600">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                />
                <span>Remember session</span>
              </label>
              <span className="text-blue-600 font-semibold hover:underline cursor-pointer">
                Forgot password?
              </span>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3.5 px-4 rounded-xl text-white font-extrabold text-xs sm:text-sm uppercase tracking-wider transition shadow-lg flex items-center justify-center gap-2 ${
                loading ? 'opacity-70 cursor-not-allowed' : ''
              } ${
                activeTab === 'USER'
                  ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/30'
                  : 'bg-purple-600 hover:bg-purple-500 shadow-purple-500/30'
              }`}
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Verifying with Argon2id...</span>
                </>
              ) : (
                <span>{activeTab === 'USER' ? 'Sign In as Likitha Manchikanti →' : 'Sign In as Administrator →'}</span>
              )}
            </button>
          </form>

          {/* Security Notice */}
          <div className="pt-4 border-t border-slate-200 text-center">
            <p className="text-[11px] text-slate-400">
              🔒 Authenticated with Argon2id + CSPRNG session tokens. Unauthorized attempts are logged in the tamper-evident SIEM audit trail.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
