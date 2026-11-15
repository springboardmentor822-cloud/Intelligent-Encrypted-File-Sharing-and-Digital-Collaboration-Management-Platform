import { useEffect, useState } from "react";
import api from "../lib/api";
import { formatDate } from "../lib/format";
import { isAdmin, useAuth } from "../store/auth";

const ACTIONS = ["login", "logout", "register", "upload", "download", "view", "delete", "share_link_create",
  "share_link_revoke", "share_access", "share_download", "share_view", "permission_grant", "permission_revoke", "restore",
  "delete_permanent", "password_change", "key_rotation", "role_change", "admin_access", "blocked_request", "share_link_expire", "notification_broadcast", "detection_rule_change", "audit_export"];

const sevColor = { info: "bg-slate-100 text-slate-700", warning: "bg-amber-100 text-amber-800", critical: "bg-red-100 text-red-700" };

export default function AuditLogTable() {
  const { user } = useAuth();
  const [filters, setFilters] = useState({ q: "", action: "", severity: "", result: "", user_email: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, page_size: 15 });
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const params = { page, page_size: 15 };
    Object.entries(filters).forEach(([k, v]) => v && (params[k] = v));
    try {
      const { data } = await api.get("/analytics/audit", { params });
      setData(data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [page, filters.action, filters.severity, filters.result]);

  const set = (key) => (e) => setFilters({ ...filters, [key]: e.target.value });
  const submit = (e) => { e.preventDefault(); setPage(1); load(); };
  const pages = Math.max(1, Math.ceil(data.total / data.page_size));

  return (
    <div className="card">
      <h3 className="mb-3 font-display text-lg font-bold">Audit log</h3>
      <form onSubmit={submit} className="mb-4 flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Search (email, IP, file, reason)..." value={filters.q} onChange={set("q")} />
        {isAdmin(user) && <input className="input max-w-[200px]" placeholder="User email" value={filters.user_email} onChange={set("user_email")} />}
        <select className="input w-44" value={filters.action} onChange={set("action")}>
          <option value="">All actions</option>
          {ACTIONS.map((a) => <option key={a}>{a}</option>)}
        </select>
        <select className="input w-36" value={filters.severity} onChange={set("severity")}>
          <option value="">All severity</option>
          <option>info</option><option>warning</option><option>critical</option>
        </select>
        <select className="input w-32" value={filters.result} onChange={set("result")}>
          <option value="">Any result</option>
          <option>success</option><option>failure</option>
        </select>
        <button className="btn-primary">Search</button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-xs uppercase text-slate-500">
            <tr><th className="py-2 pr-3">Time</th><th className="pr-3">User</th><th className="pr-3">Action</th>
              <th className="pr-3">Result</th><th className="pr-3">Severity</th><th className="pr-3">IP</th><th>Details</th></tr>
          </thead>
          <tbody>
            {data.items.map((l) => (
              <tr key={l.id} className="border-b last:border-0 align-top">
                <td className="whitespace-nowrap py-2 pr-3">{formatDate(l.timestamp)}</td>
                <td className="pr-3">{l.user_email || <span className="text-slate-400">anonymous</span>}</td>
                <td className="pr-3 font-medium">{l.action}</td>
                <td className={`pr-3 ${l.result === "failure" ? "text-red-600" : "text-green-600"}`}>{l.result}</td>
                <td className="pr-3"><span className={`rounded px-2 py-0.5 text-xs ${sevColor[l.severity]}`}>{l.severity}</span></td>
                <td className="pr-3">{l.ip}</td>
                <td className="max-w-xs truncate text-slate-500" title={JSON.stringify(l.details)}>
                  {l.details?.name || l.details?.reason || ""}
                </td>
              </tr>
            ))}
            {!loading && data.items.length === 0 && (
              <tr><td colSpan="7" className="py-8 text-center text-slate-500">No events found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-slate-500">{data.total} events</span>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
          <span>Page {page} / {pages}</span>
          <button className="btn-secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </div>
    </div>
  );
}
