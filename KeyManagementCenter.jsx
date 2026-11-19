import React, { useState, useEffect } from 'react';

export default function KeyManagementCenter({ user }) {
  const [keyStatus, setKeyStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [rotationMsg, setRotationMsg] = useState('');

  const getAuthHeaders = () => {
    return user?.token ? { Authorization: `Bearer ${user.token}` } : {};
  };

  const fetchKeyStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:8000/api/v1/crypto/key-status', {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setKeyStatus(data);
      }
    } catch (e) {
      console.warn('Could not load key status', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeyStatus();
  }, []);

  const handleRotateKey = async () => {
    if (!confirm('Are you sure you want to trigger Master KEK Rotation? All active file DEKs will be rewrapped under the new KEK version.')) return;

    try {
      setRotating(true);
      const res = await fetch('http://localhost:8000/api/v1/crypto/rotate-kek', {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to rotate key.');

      setRotationMsg(`Successfully rotated to Master KEK Version #${data.new_version}! Rewrapped ${data.rewrapped_files_count} file envelopes.`);
      setTimeout(() => setRotationMsg(''), 6000);
      fetchKeyStatus();
    } catch (err) {
      alert(`Rotation Error: ${err.message}`);
    } finally {
      setRotating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>🔑</span>
            <span>Cryptographic Key Management Center (KMS)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            NIST SP 800-57 Master Key (KEK) versioning, DEK rewrapping engine, and cryptographic health monitor.
          </p>
        </div>
        <button
          onClick={handleRotateKey}
          disabled={rotating}
          className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition flex items-center gap-2 shadow-md shadow-purple-500/25 active:scale-95 disabled:opacity-50"
        >
          <span>🔄</span>
          <span>{rotating ? 'Rewrapping DEKs...' : 'Rotate Master KEK'}</span>
        </button>
      </div>

      {rotationMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2 animate-fade-in shadow-xs">
          <span className="text-base">✓</span>
          <span>{rotationMsg}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-purple-600 uppercase tracking-wider block">Active KEK Version</span>
          <span className="text-3xl font-black text-slate-900 mt-1 block">
            v{keyStatus?.current_kek_version || 1}
          </span>
          <span className="text-[10px] text-slate-400 mt-1 block">Protected by Envelope Encryption</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Key Length</span>
          <span className="text-3xl font-black text-slate-900 mt-1 block">256 Bits</span>
          <span className="text-[10px] text-emerald-600 font-bold mt-1 block">2^256 Combinations</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Cipher Mode</span>
          <span className="text-2xl font-black text-slate-900 mt-1 block">AES-GCM</span>
          <span className="text-[10px] text-slate-400 mt-1 block">Authenticated AEAD</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider block">KMS Health</span>
          <span className="text-2xl font-black text-emerald-600 mt-1 block">OPTIMAL</span>
          <span className="text-[10px] text-slate-400 mt-1 block">Zero Key Exposure</span>
        </div>
      </div>

      {/* Architecture Explanation Card */}
      <div className="bg-gradient-to-r from-purple-900 to-indigo-950 rounded-3xl p-6 text-white shadow-xl space-y-3">
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-extrabold uppercase tracking-wider border border-purple-500/30">
            Two-Tier Envelope Cryptography
          </span>
        </div>
        <h3 className="text-lg font-black tracking-tight">How TrustShare Rotates Master Keys Without Re-Encrypting Files</h3>
        <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
          In envelope encryption, each file is encrypted with its own unique 256-bit Data Encryption Key (DEK). The DEK itself is encrypted using the Master Key-Encryption-Key (KEK). When an administrator triggers key rotation, the system generates a new KEK version and unwrap/rewraps only the lightweight DEKs—without moving or reading multi-gigabyte file ciphertexts from cloud storage!
        </p>
      </div>

      {/* Version History Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Master KEK Version Ledger</h3>
          <span className="text-xs text-slate-400">Total Versions: {keyStatus?.key_versions?.length || 1}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-100 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-6">Version</th>
                <th className="py-3 px-4">Key Alias</th>
                <th className="py-3 px-4">Algorithm</th>
                <th className="py-3 px-4">Provisioned At</th>
                <th className="py-3 px-4">Rotated At</th>
                <th className="py-3 px-6 text-right">Lifecycle Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-400">Loading key versions...</td>
                </tr>
              ) : !keyStatus?.key_versions || keyStatus.key_versions.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-400">No key versions registered.</td>
                </tr>
              ) : (
                keyStatus.key_versions.map((kv) => (
                  <tr key={kv.version} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-6 font-black text-slate-900">v{kv.version}</td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-purple-700">{kv.alias}</td>
                    <td className="py-3.5 px-4 font-bold text-slate-700">{keyStatus.algorithm}</td>
                    <td className="py-3.5 px-4 text-slate-500">{kv.created_at}</td>
                    <td className="py-3.5 px-4 text-slate-500">{kv.rotated_at || 'Currently Active'}</td>
                    <td className="py-3.5 px-6 text-right">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        kv.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        {kv.status}
                      </span>
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
