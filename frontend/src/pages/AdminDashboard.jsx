import { useCallback, useEffect, useMemo, useState } from "react";
import { C } from "../lib/theme";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Activity, CheckCircle2, Database, HardDrive, KeyRound, LayoutDashboard, RefreshCw, Search, ShieldAlert, ShieldCheck,
  Users, Wifi,
} from "lucide-react";
import api, { errorMessage } from "../lib/api";
import { formatBytes, formatDate, timeAgo } from "../lib/format";
import { useAuth } from "../store/auth";
import Modal from "../components/Modal";
import { Avatar, Badge, Gauge, PageHeader, ProgressBar, StatCard } from "../components/ui";
import CommandCenter from "../components/CommandCenter";
import SystemPanel from "../components/SystemPanel";

const COLORS = [C.primary, "#e5484d", "#10b981", "#f59e0b", "#8b5cf6", "#64748b", "#06b6d4"];
const sevTone = { info: "slate", warning: "amber", critical: "red" };

/* ======================= OVERVIEW ======================= */
function Overview({ ov, sec }) {
  const s = ov.storage;
  const pie = [{ name: "Used", value: s.used_bytes }, { name: "Free", value: s.free_bytes }];
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Total users" value={ov.users.total}
          sub={`${ov.users.active} active - ${ov.users.disabled} disabled - ${ov.users.new_7d} new this week`} />
        <StatCard icon={Wifi} tone="sky" label="Active sessions" value={ov.active_sessions}
          sub={`${ov.users.mfa_enabled} users have MFA on`} />
        <StatCard icon={HardDrive} tone="amber" label="Storage used" value={formatBytes(s.used_bytes)}
          sub={`${formatBytes(s.free_bytes)} left of ${formatBytes(s.capacity_bytes)}`}>
          <ProgressBar pct={(s.used_bytes / s.capacity_bytes) * 100} />
        </StatCard>
        <StatCard icon={ShieldAlert} tone="red" label="Open security alerts" value={ov.open_alerts}
          sub={`${ov.activity_24h.failed_logins} failed logins in 24h`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card flex flex-col items-center">
          <h3 className="mb-4 self-start font-display font-semibold">Platform storage</h3>
          <Gauge used={s.used_bytes} capacity={s.capacity_bytes} />
          <div className="mt-5 grid w-full grid-cols-3 gap-2 text-center text-sm">
            <div><div className="font-semibold text-brand-700">{formatBytes(s.used_bytes)}</div><div className="text-xs text-slate-500">Consumed</div></div>
            <div><div className="font-semibold text-emerald-600">{formatBytes(s.free_bytes)}</div><div className="text-xs text-slate-500">Left over</div></div>
            <div><div className="font-semibold">{formatBytes(s.capacity_bytes)}</div><div className="text-xs text-slate-500">Capacity</div></div>
          </div>
        </div>

        <div className="card lg:col-span-2">
          <h3 className="mb-3 font-display font-semibold">Logins - last 14 days</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={sec.login_series}>
                <defs>
                  <linearGradient id="gOk" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0d9488" stopOpacity={0.4} /><stop offset="95%" stopColor="#0d9488" stopOpacity={0} /></linearGradient>
                  <linearGradient id="gBad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} /><stop offset="95%" stopColor="#ef4444" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" tickFormatter={(d) => d.slice(5)} fontSize={12} />
                <YAxis allowDecimals={false} fontSize={12} />
                <Tooltip /><Legend />
                <Area type="monotone" dataKey="success" name="Successful" stroke="#0d9488" fill="url(#gOk)" strokeWidth={2} />
                <Area type="monotone" dataKey="failure" name="Failed" stroke="#ef4444" fill="url(#gBad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card">
          <h3 className="mb-3 font-display font-semibold">Last 24 hours</h3>
          <div className="grid grid-cols-2 gap-3">
            {[["Uploads", ov.activity_24h.uploads], ["Downloads", ov.activity_24h.downloads],
              ["Events logged", ov.activity_24h.events], ["Active share links", ov.active_links]].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-slate-50 p-3"><div className="font-display text-2xl font-bold">{v}</div><div className="text-xs text-slate-500">{k}</div></div>
            ))}
          </div>
          <h3 className="mb-2 mt-5 font-display font-semibold">Roles</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(ov.users.roles).map(([r, c]) => <Badge key={r} tone={r === "admin" ? "violet" : r === "guest" ? "amber" : "teal"}>{r}: {c}</Badge>)}
          </div>
        </div>

        <div className="card">
          <h3 className="mb-3 font-display font-semibold">Storage by file type</h3>
          {s.by_category.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">No files yet.</p> : (
            <div className="h-56">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={s.by_category.map((c) => ({ name: c.category, value: c.bytes }))} dataKey="value" innerRadius={45} outerRadius={80}>
                    {s.by_category.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => formatBytes(v)} /><Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="mb-3 font-display font-semibold">Top storage users</h3>
          {s.top_users.length === 0 && <p className="py-10 text-center text-sm text-slate-500">No uploads yet.</p>}
          <div className="space-y-4">
            {s.top_users.map((u) => (
              <div key={u.user_id}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 truncate"><Avatar name={u.name} size={24} /> {u.name}</span>
                  <span className="text-slate-500">{formatBytes(u.bytes)}</span>
                </div>
                <ProgressBar pct={(u.bytes / s.per_user_quota_bytes) * 100} height="h-1.5" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ======================= USERS ======================= */
function ActivityModal({ user, onClose }) {
  const [items, setItems] = useState(null);
  useEffect(() => { api.get(`/admin/users/${user.id}/activity`).then((r) => setItems(r.data)); }, [user.id]);
  return (
    <Modal title={`Activity - ${user.full_name}`} onClose={onClose} wide>
      {!items && <p className="text-sm text-slate-500">Loading...</p>}
      {items && items.length === 0 && <p className="text-sm text-slate-500">No recorded activity yet.</p>}
      <div className="space-y-2">
        {items?.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded-xl border p-2.5 text-sm">
            <div>
              <span className="font-medium">{a.action}</span>{" "}
              <span className={a.result === "failure" ? "text-red-600" : "text-emerald-600"}>{a.result}</span>
              <div className="text-xs text-slate-500">{a.name || a.reason || ""} {a.ip ? `- ${a.ip}` : ""}</div>
            </div>
            <div className="text-right text-xs text-slate-500">{timeAgo(a.timestamp)}<div><Badge tone={sevTone[a.severity]}>{a.severity}</Badge></div></div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function UsersTab({ users, me, act }) {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [viewUser, setViewUser] = useState(null);
  const list = useMemo(() => users.filter((u) =>
    (!role || u.roles.includes(role)) && (!q || (u.full_name + u.email).toLowerCase().includes(q.toLowerCase()))), [users, q, role]);

  return (
    <div className="card p-0">
      <div className="flex flex-wrap gap-3 border-b p-4">
        <div className="relative max-w-xs flex-1">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input className="input pl-9" placeholder="Search name or email..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input w-36" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option><option>admin</option><option>user</option><option>guest</option>
        </select>
        <span className="ml-auto self-center text-sm text-slate-500">{list.length} of {users.length} users</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="p-3.5">User</th><th>Role</th><th className="min-w-[170px]">Storage</th><th>Files</th><th>Last login</th><th>Last IP</th><th>MFA</th><th>Active</th><th></th></tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id} className="border-b last:border-0 hover:bg-slate-50/60">
                <td className="p-3.5">
                  <div className="flex items-center gap-3"><Avatar name={u.full_name} />
                    <div><div className="font-medium">{u.full_name}</div><div className="text-xs text-slate-500">{u.email}</div></div></div>
                </td>
                <td>
                  <select className="input w-24 py-1" value={u.roles[0]} disabled={u.id === me.id}
                    onChange={(e) => act(() => api.patch(`/admin/users/${u.id}/role`, { role: e.target.value }), "Role updated")}>
                    <option>admin</option><option>user</option><option>guest</option>
                  </select>
                </td>
                <td>
                  <div className="mb-1 text-xs text-slate-600">{formatBytes(u.storage_bytes)} / {formatBytes(u.quota_bytes)}</div>
                  <ProgressBar pct={(u.storage_bytes / u.quota_bytes) * 100} height="h-1.5" />
                </td>
                <td>{u.files}</td>
                <td className="whitespace-nowrap text-slate-600" title={formatDate(u.last_login)}>{timeAgo(u.last_login)}</td>
                <td className="text-slate-600">{u.last_ip || "-"}</td>
                <td>{u.mfa_enabled ? <Badge tone="green">On</Badge> : <Badge>Off</Badge>}</td>
                <td>
                  <button disabled={u.id === me.id} title={u.is_active ? "Click to disable" : "Click to enable"}
                    onClick={() => act(() => api.patch(`/admin/users/${u.id}/active`, { is_active: !u.is_active }), u.is_active ? "User disabled" : "User enabled")}
                    className={`relative h-6 w-11 rounded-full transition disabled:opacity-40 ${u.is_active ? "bg-brand-500" : "bg-slate-300"}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${u.is_active ? "left-[22px]" : "left-0.5"}`} />
                  </button>
                </td>
                <td className="pr-3"><button className="btn-secondary px-3 py-1.5" onClick={() => setViewUser(u)}><Activity size={14} /> Activity</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {viewUser && <ActivityModal user={viewUser} onClose={() => setViewUser(null)} />}
    </div>
  );
}

/* ======================= SECURITY ======================= */
function SecurityTab({ sec, act }) {
  const [alerts, setAlerts] = useState([]);
  const [showResolved, setShowResolved] = useState(false);
  const loadAlerts = useCallback(() => api.get("/analytics/alerts").then((r) => setAlerts(r.data)), []);
  useEffect(() => { loadAlerts(); }, [loadAlerts]);
  const shown = alerts.filter((a) => showResolved || !a.resolved);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={CheckCircle2} label="Successful logins (14d)" value={sec.totals.logins_ok} />
        <StatCard icon={ShieldAlert} tone="red" label="Failed logins (14d)" value={sec.totals.logins_failed} />
        <StatCard icon={ShieldAlert} tone="amber" label="Warning events" value={sec.severity.warning} sub="last 14 days" />
        <StatCard icon={ShieldAlert} tone="red" label="Critical events" value={sec.severity.critical} sub="last 14 days" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h3 className="mb-3 font-display font-semibold">Failures by action</h3>
          {sec.failed_by_action.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">No failures recorded. 🎉</p> : (
            <div className="h-60"><ResponsiveContainer>
              <BarChart data={sec.failed_by_action} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis type="number" allowDecimals={false} fontSize={12} />
                <YAxis type="category" dataKey="action" fontSize={12} width={110} /><Tooltip />
                <Bar dataKey="count" fill="#ef4444" radius={[0, 6, 6, 0]} />
              </BarChart></ResponsiveContainer></div>
          )}
        </div>
        <div className="card">
          <h3 className="mb-3 font-display font-semibold">Alerts by type</h3>
          {sec.alerts_by_type.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">No alerts in this period.</p> : (
            <div className="h-60"><ResponsiveContainer>
              <PieChart><Pie data={sec.alerts_by_type} dataKey="count" nameKey="type" innerRadius={45} outerRadius={80}>
                {sec.alerts_by_type.map((_, i) => <Cell key={i} fill={COLORS[(i + 3) % COLORS.length]} />)}</Pie>
                <Tooltip /><Legend /></PieChart></ResponsiveContainer></div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h3 className="mb-3 font-display font-semibold">Top failing IP addresses</h3>
          {sec.top_failing_ips.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Nothing suspicious.</p>}
          <table className="w-full text-sm"><tbody>
            {sec.top_failing_ips.map((i) => (
              <tr key={i.ip} className="border-b last:border-0">
                <td className="py-2 font-mono">{i.ip}</td>
                <td><Badge tone={i.failures >= 5 ? "red" : "amber"}>{i.failures} failures</Badge></td>
                <td className="text-right text-xs text-slate-500">{timeAgo(i.last_seen)}</td>
              </tr>))}
          </tbody></table>
        </div>
        <div className="card">
          <h3 className="mb-3 font-display font-semibold">Recent warnings &amp; critical events</h3>
          {sec.recent_events.length === 0 && <p className="py-6 text-center text-sm text-slate-500">All quiet.</p>}
          <div className="space-y-2">
            {sec.recent_events.map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-xl border p-2.5 text-sm">
                <div><b>{e.action}</b> <span className="text-slate-500">{e.user_email || "anonymous"} - {e.ip}</span>
                  {e.reason && <div className="text-xs text-slate-500">{e.reason}</div>}</div>
                <div className="text-right text-xs text-slate-500">{timeAgo(e.timestamp)}<div><Badge tone={sevTone[e.severity]}>{e.severity}</Badge></div></div>
              </div>))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display font-semibold"><ShieldAlert size={18} className="text-red-600" /> Security alerts</h3>
          <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Show resolved</label>
        </div>
        {shown.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No open alerts. Everything looks normal.</p>}
        <div className="space-y-2">
          {shown.map((a) => (
            <div key={a.id} className={`flex items-start justify-between gap-3 rounded-xl border p-3 text-sm ${a.resolved ? "opacity-50" : "border-red-200 bg-red-50/50"}`}>
              <div><div className="font-medium">{a.message}</div>
                <div className="text-xs text-slate-500">{a.type} - IP {a.ip || "unknown"} - {formatDate(a.created_at)}</div></div>
              {!a.resolved && <button className="btn-secondary shrink-0" onClick={() => act(async () => { await api.patch(`/analytics/alerts/${a.id}/resolve`); await loadAlerts(); }, "Alert resolved")}>Resolve</button>}
            </div>))}
        </div>
      </div>
    </div>
  );
}

/* ======================= STORAGE ======================= */
function StorageTab({ ov, users }) {
  const s = ov.storage;
  const sorted = [...users].sort((a, b) => b.storage_bytes - a.storage_bytes);
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card flex flex-col items-center">
          <h3 className="mb-4 self-start font-display font-semibold">Capacity</h3>
          <Gauge used={s.used_bytes} capacity={s.capacity_bytes} size={210} />
          <div className="mt-5 w-full space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Consumed</span><b>{formatBytes(s.used_bytes)}</b></div>
            <div className="flex justify-between"><span className="text-slate-500">Left over</span><b className="text-emerald-600">{formatBytes(s.free_bytes)}</b></div>
            <div className="flex justify-between"><span className="text-slate-500">Total capacity</span><b>{formatBytes(s.capacity_bytes)}</b></div>
            <div className="flex justify-between"><span className="text-slate-500">Files stored</span><b>{s.file_count}</b></div>
            <div className="flex justify-between"><span className="text-slate-500">Quota per user</span><b>{formatBytes(s.per_user_quota_bytes)}</b></div>
          </div>
          <p className="mt-4 text-xs text-slate-400">Capacity is set with PLATFORM_STORAGE_GB in the .env file.</p>
        </div>
        <div className="card lg:col-span-2">
          <h3 className="mb-3 font-display font-semibold">Consumption by file type</h3>
          {s.by_category.length === 0 ? <p className="py-16 text-center text-sm text-slate-500">No files stored yet.</p> : (
            <div className="h-72"><ResponsiveContainer>
              <BarChart data={s.by_category.map((c) => ({ type: c.category, MB: +(c.bytes / 1048576).toFixed(2), files: c.files }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="type" fontSize={12} /><YAxis fontSize={12} unit=" MB" />
                <Tooltip formatter={(v, n, p) => [`${v} MB (${p.payload.files} files)`, "Size"]} />
                <Bar dataKey="MB" radius={[8, 8, 0, 0]}>{s.by_category.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
              </BarChart></ResponsiveContainer></div>
          )}
        </div>
      </div>
      <div className="card">
        <h3 className="mb-4 font-display font-semibold">Storage per user</h3>
        <div className="space-y-4">
          {sorted.map((u) => {
            const pct = (u.storage_bytes / u.quota_bytes) * 100;
            return (
              <div key={u.id} className="grid items-center gap-3 sm:grid-cols-[220px_1fr_190px]">
                <div className="flex items-center gap-2 truncate"><Avatar name={u.full_name} size={28} /><span className="truncate text-sm font-medium">{u.full_name}</span></div>
                <ProgressBar pct={pct} />
                <div className="text-right text-xs text-slate-500">{formatBytes(u.storage_bytes)} used - {formatBytes(Math.max(u.quota_bytes - u.storage_bytes, 0))} left</div>
              </div>);
          })}
        </div>
      </div>
    </div>
  );
}

/* ======================= ENCRYPTION KEYS ======================= */
function KeysTab({ act }) {
  const [keys, setKeys] = useState(null);
  const load = useCallback(() => api.get("/admin/keys/status").then((r) => setKeys(r.data)), []);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card">
        <h3 className="mb-3 flex items-center gap-2 font-display font-semibold"><KeyRound size={18} /> Master key status</h3>
        {keys && (
          <>
            <div className="mb-4 rounded-xl bg-brand-50 p-4"><div className="text-xs text-brand-700">Current master key version</div>
              <div className="font-display text-3xl font-bold text-brand-800">{keys.current_version}</div></div>
            <div className="mb-4 space-y-2">
              {Object.entries(keys.files_by_key_version).length === 0 && <p className="text-sm text-slate-500">No encrypted files yet.</p>}
              {Object.entries(keys.files_by_key_version).map(([v, c]) => (
                <div key={v} className="flex items-center justify-between rounded-xl border p-3 text-sm">
                  <span>Files locked with key <b>{v}</b></span><Badge tone={v === keys.current_version ? "green" : "amber"}>{c} files</Badge>
                </div>))}
            </div>
            <button className="btn-primary" onClick={() => act(async () => {
              const { data } = await api.post("/admin/keys/rotate");
              await load();
              return `Rotation complete: ${data.rewrapped} file key(s) re-locked with ${data.current_version}.`;
            })}><RefreshCw size={16} /> Rotate file keys to current master key</button>
          </>
        )}
      </div>
      <div className="card text-sm text-slate-600">
        <h3 className="mb-3 font-display font-semibold text-slate-900">How rotation works</h3>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Add a new key to <code className="rounded bg-slate-100 px-1">MASTER_KEYS</code> in <code className="rounded bg-slate-100 px-1">.env</code>, e.g. <code className="rounded bg-slate-100 px-1">v1:...,v2:...</code></li>
          <li>Set <code className="rounded bg-slate-100 px-1">MASTER_KEY_CURRENT=v2</code> and restart the backend.</li>
          <li>Click the rotate button. Each file's small data key is re-locked with v2.</li>
          <li>The encrypted files themselves are never touched, so rotation is fast.</li>
        </ol>
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-amber-800">Keep old keys in MASTER_KEYS until every file shows the new version.</p>
      </div>
    </div>
  );
}

/* ======================= PAGE ======================= */
// view = "overview" (Dashboard) | "users" (User Management) | "system" (System Monitoring: health + storage + keys)
const TITLES = {
  overview: ["Admin Dashboard", "Monitor users, storage and security across the whole platform."],
  users: ["User Management", "See every account, change roles, and disable or enable users."],
  system: ["System Monitoring", "Service health, storage and encryption keys."],
};

export default function AdminDashboard({ view = "overview" }) {
  const me = useAuth((s) => s.user);
  const [ov, setOv] = useState(null);
  const [sec, setSec] = useState(null);
  const [users, setUsers] = useState([]);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [loadedAt, setLoadedAt] = useState(null);

  const load = useCallback(async () => {
    try {
      const [o, s, u] = await Promise.all([api.get("/admin/overview"), api.get("/admin/security"), api.get("/admin/users")]);
      setOv(o.data); setSec(s.data); setUsers(u.data); setLoadedAt(new Date());
    } catch (e) { setError(await errorMessage(e)); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  // run an action, show a message, then refresh the dashboard
  const act = async (fn, okMsg) => {
    setError(""); setMsg("");
    try { const r = await fn(); setMsg(typeof r === "string" ? r : okMsg || "Done"); await load(); }
    catch (e) { setError(await errorMessage(e)); }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {view !== "overview" ? <PageHeader title={TITLES[view][0]} subtitle={TITLES[view][1]}>
        <button className="btn-secondary" onClick={load}><RefreshCw size={15} /> Refresh {loadedAt && <span className="text-xs text-slate-400">({timeAgo(loadedAt.toISOString())})</span>}</button>
      </PageHeader> : null}

      {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {msg && <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{msg}</div>}

      {!ov || !sec ? <p className="py-20 text-center text-slate-500">{error ? "" : "Loading dashboard..."}</p> : (
        <>
          {view === "overview" && <CommandCenter ov={ov} />}
          {view === "users" && <UsersTab users={users} me={me} act={act} />}
          {view === "system" && (
            <div className="space-y-6">
              <SystemPanel />
              <StorageTab ov={ov} users={users} />
              <KeysTab act={act} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
