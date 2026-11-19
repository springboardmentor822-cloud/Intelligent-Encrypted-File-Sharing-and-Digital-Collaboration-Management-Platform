import React, { useState, useEffect } from 'react';

export default function SecurityIncidentManagement({ user }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [resolveModalAlert, setResolveModalAlert] = useState(null);
  const [resolveNotes, setResolveNotes] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  const getAuthHeaders = () => {
    return user?.token ? { Authorization: `Bearer ${user.token}` } : {};
  };

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:8000/api/v1/security/alerts', {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setAlerts(data);
      }
    } catch (e) {
      console.warn('Could not load security alerts', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const handleConfirmResolve = async () => {
    if (!resolveModalAlert) return;
    try {
      const res = await fetch(`http://localhost:8000/api/v1/security/alerts/${resolveModalAlert.id}/resolve`, {
        method: 'PATCH',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ notes: resolveNotes || 'Mitigated by administrator' })
      });
      if (res.ok) {
        setActionMsg(`Incident #${resolveModalAlert.id} resolved successfully!`);
        setTimeout(() => setActionMsg(''), 4000);
        setResolveModalAlert(null);
        setResolveNotes('');
        fetchAlerts();
      }
    } catch {
      alert('Failed to resolve alert.');
    }
  };

  const filteredAlerts = alerts.filter((a) => {
    if (severityFilter !== 'ALL' && a.severity !== severityFilter) return false;
    if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>🚨</span>
            <span>Security Incident Queue</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Automated SIEM 10-Rule threat detection stream, intrusion attempts, and incident mitigation ledger.
          </p>
        </div>
        <button
          onClick={fetchAlerts}
          className="px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs transition flex items-center gap-1.5 self-start sm:self-auto border border-purple-200"
        >
          Refresh Feed
        </button>
      </div>

      {actionMsg && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2 animate-fade-in">
          <span>✓</span>
          <span>{actionMsg}</span>
        </div>
      )}

      {/* KPI Severity Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-red-600 uppercase tracking-wider block">Critical Severity</span>
          <span className="text-2xl font-black text-red-600 mt-1 block">
            {alerts.filter(a => a.severity === 'CRITICAL').length}
          </span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider block">High Severity</span>
          <span className="text-2xl font-black text-amber-600 mt-1 block">
            {alerts.filter(a => a.severity === 'HIGH').length}
          </span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider block">Open Incidents</span>
          <span className="text-2xl font-black text-blue-600 mt-1 block">
            {alerts.filter(a => a.status === 'OPEN').length}
          </span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider block">Resolved Threats</span>
          <span className="text-2xl font-black text-emerald-600 mt-1 block">
            {alerts.filter(a => a.status === 'RESOLVED').length}
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-500 uppercase tracking-wider text-[11px]">Severity:</span>
          {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((s) => (
            <button
              key={s}
              onClick={() => setSeverityFilter(s)}
              className={`px-3 py-1 rounded-lg font-bold transition ${
                severityFilter === s
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-500 uppercase tracking-wider text-[11px]">Status:</span>
          {['ALL', 'OPEN', 'RESOLVED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 rounded-lg font-bold transition ${
                statusFilter === st
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Alerts Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-100 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-6">Incident ID / Rule</th>
                <th className="py-3 px-4">Event Type</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4">Severity</th>
                <th className="py-3 px-4">Attacker IP</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan="8" className="py-8 text-center text-slate-400">Loading incident queue...</td>
                </tr>
              ) : filteredAlerts.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-8 text-center text-slate-400">No matching security incidents found.</td>
                </tr>
              ) : (
                filteredAlerts.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-6">
                      <span className="font-black text-slate-900 block">#{a.id}</span>
                      <span className="text-[10px] font-bold text-purple-600 uppercase">{a.rule_id || 'SIEM_RULE'}</span>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">{a.event_type}</td>
                    <td className="py-3.5 px-4 text-slate-600 max-w-sm truncate">{a.description}</td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                        a.severity === 'CRITICAL' ? 'bg-red-100 text-red-800 border border-red-300' :
                        a.severity === 'HIGH' ? 'bg-orange-100 text-orange-800 border border-orange-300' :
                        a.severity === 'MEDIUM' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                        'bg-blue-100 text-blue-800 border border-blue-300'
                      }`}>
                        {a.severity}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-800">{a.ip_address}</td>
                    <td className="py-3.5 px-4 text-slate-500">{a.timestamp}</td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                        a.status === 'RESOLVED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                      }`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      {a.status !== 'RESOLVED' ? (
                        <button
                          onClick={() => setResolveModalAlert(a)}
                          className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[11px] rounded-lg border border-emerald-200 transition"
                        >
                          Resolve
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400 font-semibold">Mitigated</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resolution Modal */}
      {resolveModalAlert && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-black text-slate-900">Resolve Incident #{resolveModalAlert.id}</h3>
            <p className="text-xs text-slate-500">{resolveModalAlert.description}</p>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Administrative Notes</label>
              <textarea
                value={resolveNotes}
                onChange={(e) => setResolveNotes(e.target.value)}
                placeholder="Describe actions taken (e.g. IP blocked, user advised, verified false positive)..."
                rows="3"
                className="w-full p-3 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setResolveModalAlert(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmResolve}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition shadow-md shadow-emerald-500/20"
              >
                Confirm Resolution
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
