// Activity Logs: your own audit trail (admins see everyone's). Alerts for admins.
import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import api from "../lib/api";
import { formatDate } from "../lib/format";
import { isAdmin, useAuth } from "../store/auth";
import AuditLogTable from "../components/AuditLogTable";
import { Led, PageHeader, StatCard } from "../components/ui";
import { Activity, Link2, ShieldX } from "lucide-react";

function AlertsPanel() {
  const [alerts, setAlerts] = useState([]);
  const load = () => api.get("/analytics/alerts").then((r) => setAlerts(r.data));
  useEffect(() => { load(); }, []);
  const resolve = async (id) => { await api.patch(`/analytics/alerts/${id}/resolve`); load(); };
  return (
    <div className="card">
      <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-bold"><ShieldAlert size={18} className="text-red-600" /> Security alerts</h3>
      {alerts.length === 0 && <p className="text-sm text-slate-500">No alerts. Everything looks normal.</p>}
      <div className="space-y-2">
        {alerts.map((a) => (
          <div key={a.id} className={`flex items-start justify-between gap-3 rounded-xl border border-paper-200 p-3 text-sm ${a.resolved ? "opacity-50" : ""}`}>
            <div className="flex gap-2"><span className="mt-1.5"><Led tone={a.resolved ? "off" : a.severity === "critical" ? "bad" : "warn"} /></span>
              <div><div className="font-medium">{a.message}</div>
                <div className="text-xs text-slate-500">{a.type} · IP {a.ip || "unknown"} · {formatDate(a.created_at)}</div></div></div>
            {!a.resolved && <button className="btn-secondary !py-1.5" onClick={() => resolve(a.id)}>Resolve</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ActivityLogs() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  useEffect(() => { api.get("/analytics/summary").then((r) => setSummary(r.data)); }, []);
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader kicker="09 — Ledger" title="Activity Logs"
        subtitle={isAdmin(user) ? "Every action on the platform, newest first." : "Every action you took, and every action on your files, newest first."} />
      {summary && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={Activity} label="Events (24h)" value={summary.events_24h} />
          <StatCard icon={ShieldX} tone="amber" label="Denied actions (24h)" value={summary.failed_actions_24h} />
          <StatCard icon={Link2} tone="sky" label="Active share links" value={summary.active_links} />
          {isAdmin(user) ? <StatCard icon={ShieldAlert} tone="red" label="Open security alerts" value={summary.open_alerts} />
            : <StatCard tone="violet" label="Your role" value={<span className="capitalize">{user.roles.join(", ")}</span>} />}
        </div>
      )}
      {isAdmin(user) && <AlertsPanel />}
      <AuditLogTable />
    </div>
  );
}
