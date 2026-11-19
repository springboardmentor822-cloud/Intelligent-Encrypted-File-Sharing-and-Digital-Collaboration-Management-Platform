import React, { useState, useEffect } from 'react';

export default function SharedLinksManagement({ user }) {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');
  const [copyMsg, setCopyMsg] = useState('');

  const getAuthHeaders = () => {
    return user?.token ? { Authorization: `Bearer ${user.token}` } : {};
  };

  const fetchShares = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:8000/api/v1/shares', {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setShares(data);
      }
    } catch (e) {
      console.warn('Could not load shares', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShares();
  }, []);

  const handleCopyLink = (url) => {
    navigator.clipboard.writeText(url);
    setCopyMsg('Link copied to clipboard!');
    setTimeout(() => setCopyMsg(''), 3000);
  };

  const handleRevoke = async (token) => {
    if (!confirm('Are you sure you want to revoke this link? Immediate access will be terminated.')) return;
    try {
      const res = await fetch(`http://localhost:8000/api/v1/share/${token}/revoke`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        setActionMsg('Share link was revoked successfully!');
        setTimeout(() => setActionMsg(''), 4000);
        fetchShares();
      }
    } catch {
      alert('Failed to revoke link.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>🔗</span>
            <span>Shared Links Management</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Monitor and revoke all temporary access links created for your encrypted documents.
          </p>
        </div>
        <button
          onClick={fetchShares}
          className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition flex items-center gap-1.5 self-start sm:self-auto"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          Refresh Links
        </button>
      </div>

      {/* Toast Alert */}
      {actionMsg && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2 animate-fade-in">
          <span>✓</span>
          <span>{actionMsg}</span>
        </div>
      )}
      {copyMsg && (
        <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 text-blue-800 text-xs font-bold flex items-center gap-2 animate-fade-in">
          <span>📋</span>
          <span>{copyMsg}</span>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Links</span>
          <span className="text-2xl font-black text-slate-900 mt-1 block">{shares.length}</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider block">Active Links</span>
          <span className="text-2xl font-black text-emerald-600 mt-1 block">
            {shares.filter(s => !s.is_revoked).length}
          </span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-red-600 uppercase tracking-wider block">Revoked Links</span>
          <span className="text-2xl font-black text-red-600 mt-1 block">
            {shares.filter(s => s.is_revoked).length}
          </span>
        </div>
      </div>

      {/* Links Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">All Created Access Links</h2>
          <span className="text-xs text-slate-400">Tokens hashed with SHA-256</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-100 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-6">File Name</th>
                <th className="py-3 px-4">Shared With</th>
                <th className="py-3 px-4">Permission</th>
                <th className="py-3 px-4">Expires At</th>
                <th className="py-3 px-4">Access Count</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-400">Loading shared links...</td>
                </tr>
              ) : shares.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-10 text-center text-slate-400">
                    No share links created yet. Go to your File Vault to create a secure link.
                  </td>
                </tr>
              ) : (
                shares.map((s) => (
                  <tr key={s.share_token} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-6 font-bold text-slate-900">{s.filename}</td>
                    <td className="py-3.5 px-4 text-slate-500">{s.shared_with || 'Public'}</td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                        s.permission === 'DOWNLOAD' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {s.permission}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-500">{s.expires_at}</td>
                    <td className="py-3.5 px-4 font-semibold">{s.access_count} downloads</td>
                    <td className="py-3.5 px-4">
                      {s.is_revoked ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                          Revoked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          Active
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-6 text-right space-x-2">
                      <button
                        onClick={() => handleCopyLink(s.direct_download_url)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-lg transition"
                      >
                        Copy URL
                      </button>
                      {!s.is_revoked && (
                        <button
                          onClick={() => handleRevoke(s.share_token)}
                          className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-[11px] rounded-lg border border-red-200 transition"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
