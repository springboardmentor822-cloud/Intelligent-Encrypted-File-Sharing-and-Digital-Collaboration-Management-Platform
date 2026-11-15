// Admin → Access Control: who is let in and who is kept out.
//   Approvals: new accounts wait here when "approve new accounts" is on.   Blocked IPs: addresses shut out (by hand or automatically).
//   Tripwires: decoy files that raise a critical alert when anyone touches them.   Policy: the on/off switch for approvals.
import { useCallback, useEffect, useState } from "react";
import { Ban, CheckCircle2, Crosshair, DoorClosed, DoorOpen, ShieldCheck, UserCheck, XCircle } from "lucide-react";
import api, { errorMessage } from "../lib/api";
import { formatStamp, timeAgo } from "../lib/format";
import { Field, inputCls } from "../components/filters";
import { Avatar, EmptyState, Led, PageHeader, Segmented, StatCard } from "../components/ui";

export default function AdminAccess() {
  const [tab, setTab] = useState("approvals");
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [block, setBlock] = useState({ ip: "", reason: "", minutes: "" });

  const load = useCallback(() => { api.get("/admin/access/overview").then((r) => setD(r.data)).catch(async (e) => setErr(await errorMessage(e))); }, []);
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);

  const run = async (fn, ok) => { setErr(""); setMsg(""); try { await fn(); setMsg(ok); load(); } catch (e) { setErr(await errorMessage(e)); } };
  const decide = (u, approve) => run(() => api.post(`/admin/access/users/${u.id}/${approve ? "approve" : "reject"}`), `${u.email} was ${approve ? "approved" : "declined"}.`);
  const setPolicy = (v) => run(() => api.put("/admin/access/policy", { require_approval: v }), v ? "New accounts now wait for your approval." : "Registration is open again.");
  const addBlock = () => run(() => api.post("/admin/access/blocked-ips", { ip: block.ip.trim(), reason: block.reason || "Blocked by an administrator", minutes: block.minutes ? Number(block.minutes) : null }), `${block.ip} is blocked.`)
    .then(() => setBlock({ ip: "", reason: "", minutes: "" }));
  const unblock = (ip) => run(() => api.delete(`/admin/access/blocked-ips/${encodeURIComponent(ip)}`), `${ip} can get in again.`);
  const removeTrap = (t) => run(() => api.put(`/admin/access/tripwires/${t.file_id}`, { on: false }), `Tripwire removed from ${t.name}.`);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="Access Control" subtitle="You decide who gets in: approve or decline new accounts, shut out hostile IP addresses, and plant tripwires for snoopers.">
        <Segmented value={tab} onChange={setTab} options={[["approvals", `Approvals${d?.counts.pending ? ` (${d.counts.pending})` : ""}`], ["blocked", "Blocked IPs"], ["tripwires", "Tripwires"], ["policy", "Policy"]]} />
      </PageHeader>
      {err && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      {msg && <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{msg}</div>}
      {!d ? <p className="py-16 text-center text-slate-500">Loading...</p> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={d.policy.require_approval ? DoorClosed : DoorOpen} tone={d.policy.require_approval ? "amber" : "green"} label="Registration" value={d.policy.require_approval ? "Approval needed" : "Open"} sub="who may create accounts" />
            <StatCard icon={UserCheck} tone="violet" label="Waiting for approval" value={d.counts.pending} />
            <StatCard icon={Ban} tone="red" label="Blocked IP addresses" value={d.counts.blocked} sub={`${d.counts.auto_blocked} blocked automatically`} />
            <StatCard icon={Crosshair} tone="amber" label="Tripwire files" value={d.counts.tripwires} sub="traps set" />
          </div>

          {tab === "approvals" && (
            <div className="space-y-4">
              {!d.policy.require_approval && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Registration is <b>open</b>: anyone can create an account. Turn on <b>approval</b> in the Policy tab so new accounts wait for you.</div>}
              {d.pending.length === 0 ? <EmptyState icon={ShieldCheck} title="Nobody is waiting" text="New accounts that need approval appear here, and you are notified instantly." /> : (
                <div className="card overflow-hidden !p-0">
                  {d.pending.map((u) => (
                    <div key={u.id} className="flex flex-wrap items-center gap-4 border-b border-paper-200 p-4 last:border-0">
                      <Avatar name={u.name} size={42} />
                      <div className="min-w-0 flex-1"><div className="font-semibold text-ink-950">{u.name}</div><div className="text-sm text-slate-500">{u.email} · asked {timeAgo(u.created_at)}</div></div>
                      <button className="btn-secondary text-red-600" onClick={() => decide(u, false)}><XCircle size={16} /> Decline</button>
                      <button className="btn-primary" onClick={() => decide(u, true)}><CheckCircle2 size={16} /> Let in</button>
                    </div>
                  ))}
                </div>
              )}
              {d.decided.length > 0 && (
                <div className="card"><h2 className="mb-2 font-display text-lg font-bold text-ink-950">Recent decisions</h2>
                  {d.decided.map((x, i) => <div key={i} className="flex items-center gap-2 border-b border-paper-200 py-2 text-sm last:border-0"><Led tone={x.action === "access_approve" ? "on" : "bad"} /><span className="flex-1 text-slate-700"><b>{x.by}</b> {x.action === "access_approve" ? "let in" : "declined"} <b>{x.who}</b></span><span className="text-xs text-slate-400">{formatStamp(x.at)}</span></div>)}
                </div>
              )}
            </div>
          )}

          {tab === "blocked" && (
            <div className="space-y-4">
              <div className="card !p-4">
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="IP address"><input className={`${inputCls} w-48`} value={block.ip} onChange={(e) => setBlock({ ...block, ip: e.target.value })} placeholder="203.0.113.9" /></Field>
                  <Field label="Reason"><input className={`${inputCls} w-64`} value={block.reason} onChange={(e) => setBlock({ ...block, reason: e.target.value })} placeholder="Password guessing" /></Field>
                  <Field label="Minutes (empty = until removed)"><input type="number" min="1" className={`${inputCls} w-40`} value={block.minutes} onChange={(e) => setBlock({ ...block, minutes: e.target.value })} /></Field>
                  <button className="btn-danger !py-2" disabled={!block.ip} onClick={addBlock}><Ban size={15} /> Block</button>
                </div>
                <p className="mt-2 text-xs text-slate-500">Blocked addresses get "403" on every request. Your own computer, Docker and local networks can never be blocked, so you cannot lock yourself out. You can also block from the Threat Monitor, or let a detection rule do it automatically (Security Alerts → Detection rules).</p>
              </div>
              {d.blocked_ips.length === 0 ? <EmptyState icon={DoorOpen} title="No IP address is blocked" /> : (
                <div className="card overflow-x-auto !p-0">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-paper-100 text-xs text-slate-500"><tr><th className="p-3 font-medium">IP address</th><th className="font-medium">Reason</th><th className="font-medium">Blocked by</th><th className="font-medium">Since</th><th className="font-medium">Until</th><th className="pr-3 text-right font-medium">Action</th></tr></thead>
                    <tbody>
                      {d.blocked_ips.map((b) => (
                        <tr key={b.ip} className="border-b border-paper-200 last:border-0">
                          <td className="p-3 font-mono text-ink-950">{b.ip}</td><td className="text-slate-700">{b.reason}</td>
                          <td><span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${b.auto ? "bg-violet-50 text-violet-700" : "bg-paper-100 text-slate-600"}`}>{b.auto ? "automatic rule" : b.by}</span></td>
                          <td className="whitespace-nowrap text-slate-600">{formatStamp(b.created_at)}</td><td className="whitespace-nowrap text-slate-600">{b.expires_at ? formatStamp(b.expires_at) : "until removed"}</td>
                          <td className="pr-3 text-right"><button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => unblock(b.ip)}>Let back in</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === "tripwires" && (
            <div className="space-y-4">
              <div className="card !p-4 text-sm text-slate-600">A <b>tripwire</b> is a decoy file. Upload something tempting such as <i>passwords_backup.xlsx</i>, then switch the tripwire on in <b>File Management</b>. Nobody has a reason to open it, so if anyone (or any share link) does, a <b>critical alert</b> fires with their name and IP.</div>
              {d.tripwires.length === 0 ? <EmptyState icon={Crosshair} title="No tripwires set" text="Mark a file as a trap in Admin → File Management." /> : (
                <div className="card overflow-hidden !p-0">
                  {d.tripwires.map((t) => (
                    <div key={t.file_id} className="flex items-center gap-4 border-b border-paper-200 p-4 last:border-0">
                      <span className="rounded-xl bg-red-50 p-2.5 text-red-500"><Crosshair size={18} /></span>
                      <div className="min-w-0 flex-1"><div className="font-semibold text-ink-950">{t.name}</div><div className="text-xs text-slate-500">set by {t.by} · {formatStamp(t.since)}</div></div>
                      <button className="btn-secondary !py-1.5 text-xs" onClick={() => removeTrap(t)}>Remove trap</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "policy" && (
            <div className="card flex flex-wrap items-center justify-between gap-5">
              <div className="flex items-start gap-4">
                <span className="rounded-2xl bg-brand-50 p-3 text-brand-600"><UserCheck size={22} /></span>
                <div><h2 className="font-display text-lg font-bold text-ink-950">Approve new accounts</h2>
                  <p className="max-w-xl text-sm text-slate-500">When on, people can still sign up, but they cannot log in until you let them in. You get a notification for every request. Accounts that already exist are not affected.</p></div>
              </div>
              <button onClick={() => setPolicy(!d.policy.require_approval)} className={`relative h-8 w-14 shrink-0 rounded-full transition ${d.policy.require_approval ? "bg-brand-600" : "bg-paper-300"}`} aria-label="Toggle approval">
                <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${d.policy.require_approval ? "left-7" : "left-1"}`} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
