import React, { useState, useEffect } from 'react';

export default function AuditComplianceExplorer({ user }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activityFilter, setActivityFilter] = useState('');
  const [verificationResult, setVerificationResult] = useState(null);
  const [verifying, setVerifying] = useState(false);

  const getAuthHeaders = () => {
    return user?.token ? { Authorization: `Bearer ${user.token}` } : {};
  };

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      const url = activityFilter
        ? `http://localhost:8000/api/v1/audit/logs?limit=100&activity_type=${activityFilter}`
        : 'http://localhost:8000/api/v1/audit/logs?limit=100';

      const res = await fetch(url, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (e) {
      console.warn('Failed to load audit logs', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, [activityFilter]);

  const handleVerifyChain = async () => {
    try {
      setVerifying(true);
      const res = await fetch('http://localhost:8000/api/v1/audit/verify-chain', {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const result = await res.json();
        setVerificationResult(result);
      }
    } catch {
      alert('Verification API request failed.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>📜</span>
            <span>Audit &amp; Compliance Explorer</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Tamper-evident SHA-256 hash-chained compliance ledger with independent cryptographic verification.
          </p>
        </div>
        <button
          onClick={handleVerifyChain}
          disabled={verifying}
          className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition flex items-center gap-2 shadow-md shadow-slate-900/25 active:scale-95 disabled:opacity-50"
        >
          <span>🛡️</span>
          <span>{verifying ? 'Validating Hash Chain...' : 'Verify Cryptographic Hash Chain'}</span>
        </button>
      </div>

      {/* Hash Chain Verification Result Banner */}
      {verificationResult && (
        <div className={`p-5 rounded-2xl border transition shadow-xs animate-fade-in ${
          verificationResult.is_valid
            ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
            : 'bg-red-50 border-red-200 text-red-950'
        }`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{verificationResult.is_valid ? '✅' : '❌'}</span>
              <div>
                <h4 className="font-extrabold text-sm">
                  {verificationResult.is_valid
                    ? 'Audit Hash Chain Verified: 100% Tamper-Free'
                    : 'Cryptographic Tampering Detected!'}
                </h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  {verificationResult.message || verificationResult.reason}
                </p>
                {verificationResult.latest_hash && (
                  <span className="font-mono text-[10px] text-slate-500 block mt-1 truncate max-w-lg">
                    Latest Block Hash: {verificationResult.latest_hash}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => setVerificationResult(null)}
              className="text-xs font-bold text-slate-400 hover:text-slate-700"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Filter Chips */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-2 text-xs">
        <span className="font-bold text-slate-500 uppercase tracking-wider text-[11px] mr-2">Filter Activity:</span>
        {['', 'LOGIN', 'UPLOAD', 'DOWNLOAD', 'SHARE', 'REVOKE', 'UNAUTHORIZED_ACCESS', 'PASSWORD_CHANGE'].map((f) => (
          <button
            key={f}
            onClick={() => setActivityFilter(f)}
            className={`px-3 py-1 rounded-lg font-bold transition ${
              activityFilter === f
                ? 'bg-purple-600 text-white shadow-sm shadow-purple-500/25'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f || 'ALL EVENTS'}
          </button>
        ))}
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Cryptographically Chained Audit Records</h3>
          <span className="text-xs text-slate-400">Total Entries: {logs.length}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-100 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-6">Timestamp</th>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Activity Type</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Source IP</th>
                <th className="py-3 px-6">Record Hash (SHA-256)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-400">Loading audit records...</td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-400">No matching audit logs found.</td>
                </tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/80 transition font-mono text-[11px]">
                    <td className="py-3.5 px-6 font-sans text-xs text-slate-600">{l.timestamp}</td>
                    <td className="py-3.5 px-4 font-sans font-bold text-slate-900">{l.username || l.user_id}</td>
                    <td className="py-3.5 px-4 font-sans">
                      <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                        l.activity_type.includes('UNAUTHORIZED') || l.activity_type.includes('REVOKE')
                          ? 'bg-red-50 text-red-700 border border-red-200'
                          : l.activity_type === 'LOGIN'
                          ? 'bg-purple-50 text-purple-700 border border-purple-200'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}>
                        {l.activity_type}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-sans text-slate-700 max-w-sm truncate">{l.description}</td>
                    <td className="py-3.5 px-4 font-sans">
                      <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                        l.status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-500">{l.ip_address}</td>
                    <td className="py-3.5 px-6 text-purple-700 font-semibold truncate max-w-xs">
                      {l.record_hash ? `${l.record_hash.substring(0, 16)}...` : 'N/A'}
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
