// Pop-up notifications for admins. Every 8 seconds it asks the server "any new security alert since I last asked?"
// and shows a red card in the corner. (Simplified: polling. Production would use WebSockets or Server-Sent Events.)
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldAlert, X } from "lucide-react";
import api from "../lib/api";

export default function ThreatToaster() {
  const [toasts, setToasts] = useState([]);
  const since = useRef(new Date().toISOString());

  useEffect(() => {
    const tick = async () => {
      try {
        const { data } = await api.get("/reports/threat-feed", { params: { since: since.current } });
        since.current = data.server_time;
        if (data.alerts.length) setToasts((t) => [...t, ...data.alerts].slice(-4));
      } catch { /* the next tick will try again */ }
    };
    const timer = setInterval(tick, 8000);
    return () => clearInterval(timer);
  }, []);

  if (!toasts.length) return null;
  return (
    <div className="fixed right-4 top-20 z-[60] w-80 space-y-2">
      {toasts.map((a) => (
        <div key={a.id} className={`rounded-2xl border bg-white p-3.5 shadow-xl ${a.severity === "critical" ? "border-red-300" : "border-amber-300"}`}>
          <div className="flex items-start gap-2.5">
            <span className={`mt-0.5 rounded-lg p-1.5 ${a.severity === "critical" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"}`}><ShieldAlert size={16} /></span>
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-semibold text-ink-950">{a.severity === "critical" ? "Security alert" : "Security warning"}</div>
              <div className="text-slate-600">{a.message}</div>
              <div className="mt-1 flex items-center gap-3 text-xs">
                <span className="text-slate-400">IP {a.ip || "unknown"}</span>
                <Link to="/admin/security/threats" onClick={() => setToasts([])} className="font-semibold text-brand-600 hover:underline">Open Threat Monitor</Link>
              </div>
            </div>
            <button className="text-slate-400 hover:text-slate-700" onClick={() => setToasts((t) => t.filter((x) => x.id !== a.id))}><X size={15} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}
