// System Monitoring: is every part of the platform alive, and how fast does it answer?
import { useEffect, useState } from "react";
import { CheckCircle2, Database, FileText, Link2, ScrollText, ShieldAlert, Users, XCircle } from "lucide-react";
import api from "../lib/api";
import { formatNumber } from "../lib/format";
import { StatCard } from "./ui";

function uptime(sec) {
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

export default function SystemPanel() {
  const [d, setD] = useState(null);
  useEffect(() => {
    const load = () => api.get("/admin/system").then((r) => setD(r.data)).catch(() => setD(false));
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);
  if (d === null) return <p className="py-10 text-center text-slate-500">Checking services...</p>;
  if (d === false) return <p className="py-10 text-center text-red-600">Could not read system health.</p>;
  const allOk = d.services.every((s) => s.ok);
  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold">Service health</h2>
            <p className="text-sm text-slate-500">Version {d.version} · {d.environment} · up for {uptime(d.uptime_seconds)} · master key {d.key_version}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${allOk ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {allOk ? "All systems operational" : "Problem detected"}</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {d.services.map((s) => (
            <div key={s.name} className={`rounded-2xl border p-4 ${s.ok ? "border-paper-200" : "border-red-200 bg-red-50"}`}>
              <div className="flex items-center gap-2 text-sm font-medium">
                {s.ok ? <CheckCircle2 size={18} className="text-emerald-600" /> : <XCircle size={18} className="text-red-600" />} {s.name}
              </div>
              <div className="mt-2 font-display text-2xl font-bold tabular">{s.ok ? `${s.ms} ms` : "Down"}</div>
              <div className="text-xs text-slate-500">{s.ok ? "response time" : s.error}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={Users} label="Users" value={formatNumber(d.counts.users)} />
        <StatCard icon={FileText} tone="green" label="Files" value={formatNumber(d.counts.files)} />
        <StatCard icon={Link2} tone="violet" label="Share links" value={formatNumber(d.counts.links)} />
        <StatCard icon={ScrollText} tone="sky" label="Audit records" value={formatNumber(d.counts.audit_records)} />
        <StatCard icon={ShieldAlert} tone="red" label="Open alerts" value={formatNumber(d.counts.open_alerts)} />
      </div>
    </div>
  );
}
