import React, { useState, useEffect } from 'react';

export default function AccountSessionSettings({ user }) {
  const [profile, setProfile] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwMsg, setPwMsg] = useState({ type: '', text: '' });
  const [pwLoading, setPwLoading] = useState(false);

  const getAuthHeaders = () => {
    return user?.token ? { Authorization: `Bearer ${user.token}` } : {};
  };

  const loadData = async () => {
    try {
      setLoading(true);
      // 1. Profile
      const profRes = await fetch('http://localhost:8000/api/v1/users/profile', {
        headers: getAuthHeaders()
      });
      if (profRes.ok) {
        setProfile(await profRes.json());
      }

      // 2. Active Sessions
      const sessRes = await fetch('http://localhost:8000/api/v1/auth/sessions', {
        headers: getAuthHeaders()
      });
      if (sessRes.ok) {
        setSessions(await sessRes.json());
      }
    } catch (e) {
      console.warn('Failed to fetch account info', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwMsg({ type: '', text: '' });

    if (newPassword !== confirmPassword) {
      setPwMsg({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    if (newPassword.length < 8) {
      setPwMsg({ type: 'error', text: 'Password must be at least 8 characters long.' });
      return;
    }

    try {
      setPwLoading(true);
      const res = await fetch('http://localhost:8000/api/v1/auth/change-password', {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Password update failed.');
      }

      setPwMsg({ type: 'success', text: 'Password successfully updated with Argon2id!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      loadData();
    } catch (err) {
      setPwMsg({ type: 'error', text: err.message });
    } finally {
      setPwLoading(false);
    }
  };

  const handleRevokeSession = async (sessionId) => {
    if (!confirm('Revoke this workstation session?')) return;
    try {
      const res = await fetch(`http://localhost:8000/api/v1/auth/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        loadData();
      }
    } catch {
      alert('Failed to revoke session.');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="pb-4 border-b border-slate-200">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <span>⚙️</span>
          <span>Account &amp; Session Settings</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Manage your credentials, Argon2id security parameters, and active device sessions.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Profile & Security Overview */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black text-lg shadow-md shadow-blue-500/25">
                LM
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">{profile?.full_name || 'Likitha Manchikanti'}</h3>
                <span className="text-xs text-slate-500 block">{profile?.email || user.email}</span>
                <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 font-bold text-[10px]">
                  ROLE: {profile?.role || 'USER'}
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 space-y-3 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Storage Quota</span>
                <span className="font-bold text-slate-900">{profile?.storage_formatted || '0.00 MB'} / 100 MB</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="bg-blue-600 h-full w-[8%]"></div>
              </div>
              <div className="flex justify-between text-slate-600 pt-2">
                <span>Encryption Suite</span>
                <span className="font-bold text-slate-800">AES-256-GCM AEAD</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Password Hash</span>
                <span className="font-bold text-emerald-600">Argon2id (OWASP Tier)</span>
              </div>
            </div>
          </div>

          {/* Change Password Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Change Password</h3>
            {pwMsg.text && (
              <div className={`p-3 rounded-xl text-xs font-semibold ${
                pwMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
              }`}>
                {pwMsg.text}
              </div>
            )}
            <form onSubmit={handlePasswordChange} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Current Password</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">New Password (min 8 chars)</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <button
                type="submit"
                disabled={pwLoading}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition shadow-sm"
              >
                {pwLoading ? 'Updating Hash...' : 'Update Password with Argon2id'}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Active Sessions Registry */}
        <div className="lg:col-span-7">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Active Workstation Sessions</h3>
                <p className="text-[11px] text-slate-400">Server-side validated sessions with 30m idle timeout.</p>
              </div>
              <button
                onClick={loadData}
                className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold"
              >
                Refresh
              </button>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <div className="p-8 text-center text-slate-400">Loading sessions...</div>
              ) : sessions.length === 0 ? (
                <div className="p-8 text-center text-slate-400">No other active sessions.</div>
              ) : (
                sessions.map((s) => (
                  <div key={s.id} className="p-4 sm:p-5 flex items-center justify-between gap-4 hover:bg-slate-50/80 transition">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-base">
                        💻
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{s.ip_address}</span>
                          {s.is_current && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              Current Session
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500 block truncate max-w-xs">{s.user_agent}</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">Last active: {s.last_active_at}</span>
                      </div>
                    </div>

                    {!s.is_current && (
                      <button
                        onClick={() => handleRevokeSession(s.id)}
                        className="px-2.5 py-1 text-[11px] text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 font-bold rounded-lg transition"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
