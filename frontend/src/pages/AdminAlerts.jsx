// Admin → Security Alerts (Milestone 3, Task 6): suspicious-activity alerts, the editable detection rules, and test scenarios.
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Ban, FlaskConical, KeyRound, Link2, ListChecks, Play, ShieldAlert, ShieldX, SlidersHorizontal, UserX } from "lucide-react";
import api, { errorMessage } from "../lib/api";
import { formatNumber, formatStamp } from "../lib/format";
import { Field, FilterBar, Pager, SeverityPill, inputCls } from "../components/filters";
import { EmptyState, Led, PageHeader, Segmented, StatCard } from "../components/ui";

const EMPTY = { user: "", type: "", severity: "", status: "", date_from: "", date_to: "" };
const label = (t) => t.replace(/_/g, " ");

function Alerts() {
  const [sum, setSum] = useState(null);
  const [draft, setDraft] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    const p = Object.fromEntries(Object.entries(applied).filter(([, v]) => v));
    api.get("/security/events", { params: { ...p, page, page_size: 15 } }).then((r) => setData(r.data)).catch(async (e) => setError(await errorMessage(e)));
    api.get("/security/summary", { params: { days: 30 } }).then((r) => setSum(r.data)).catch(() => {});
  }, [applied, page]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const set = (k) => (e) => setDraft({ ...draft, [k]: e.target.value });
  const blockIp = async (ip) => {
    const minutes = window.prompt(`Block ${ip} for how many minutes? (leave empty to block until you remove it)`, "60");
    if (minutes === null) return;
    try { await api.post("/admin/access/blocked-ips", { ip, reason: "Blocked from the alerts list", minutes: minutes ? Number(minutes) : null }); setError(""); alert(`${ip} is blocked.`); }
    catch (er) { setError(await errorMessage(er)); }
  };
  const update = async (ev, resolved) => {
    const note = resolved ? window.prompt("Add a short note about what you found (optional):", "") : null;
    if (resolved && note === null) return;
    await api.patch(`/security/events/${ev.alert_id}`, { resolved, note: note || undefined });
    load();
  };

  return (
    <div className="space-y-5">
      {sum && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={ShieldAlert} tone="red" label="Security events (30 days)" value={formatNumber(sum.total_events)} sub={`${sum.open} still open`} />
          <StatCard icon={UserX} label="Failed login attempts" value={formatNumber(sum.failed_logins)} />
          <StatCard icon={ShieldX} tone="amber" label="Unauthorized access attempts" value={formatNumber(sum.unauthorized_attempts)} sub={`${sum.blocked_requests} blocked`} />
          <StatCard icon={AlertTriangle} tone="violet" label="Suspicious downloads" value={formatNumber(sum.suspicious_downloads)} sub="alerts raised" />
          <StatCard icon={Link2} tone="sky" label="Expired-link attempts" value={formatNumber(sum.expired_link_attempts)} />
          <StatCard icon={Ban} tone="red" label="Revoked-link attempts" value={formatNumber(sum.revoked_link_attempts)} />
          <StatCard icon={KeyRound} tone="red" label="High severity" value={formatNumber(sum.by_severity.high)} sub={`${sum.by_severity.medium} medium · ${sum.by_severity.low} low`} />
          <StatCard icon={ListChecks} tone="green" label="Resolved" value={formatNumber(sum.total_events - sum.open)} />
        </div>
      )}
      <FilterBar onApply={() => { setPage(1); setApplied(draft); }} onReset={() => { setDraft(EMPTY); setApplied(EMPTY); setPage(1); }}>
        <Field label="User / e-mail / IP"><input className={`${inputCls} w-48`} value={draft.user} onChange={set("user")} placeholder="alice@x.com or 203.0.113.9" /></Field>
        <Field label="Event type"><select className={`${inputCls} w-52`} value={draft.type} onChange={set("type")}><option value="">All types</option>{data?.types.map((t) => <option key={t} value={t}>{label(t)}</option>)}</select></Field>
        <Field label="Severity"><select className={`${inputCls} w-32`} value={draft.severity} onChange={set("severity")}><option value="">Any</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></Field>
        <Field label="Status"><select className={`${inputCls} w-32`} value={draft.status} onChange={set("status")}><option value="">Any</option><option value="open">Open</option><option value="resolved">Resolved</option></select></Field>
        <Field label="From"><input type="date" className={inputCls} value={draft.date_from} onChange={set("date_from")} /></Field>
        <Field label="To"><input type="date" className={inputCls} value={draft.date_to} onChange={set("date_to")} /></Field>
      </FilterBar>
      {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {!data ? <p className="py-12 text-center text-slate-500">Loading...</p> : data.items.length === 0 ? <EmptyState icon={ShieldAlert} title="No alerts match" text="Good news, or use the Test scenarios tab to create some." /> : (
        <div className="card overflow-x-auto !p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper-100 text-xs text-slate-500"><tr><th className="p-3 font-medium">Severity</th><th className="font-medium">Alert</th><th className="font-medium">User</th><th className="font-medium">IP address</th><th className="font-medium">Date &amp; time</th><th className="font-medium">Status</th><th className="pr-3 text-right font-medium">Action</th></tr></thead>
            <tbody>
              {data.items.map((e) => (
                <tr key={e.alert_id} className={`border-b border-paper-200 align-top last:border-0 ${e.status === "resolved" ? "opacity-60" : ""}`}>
                  <td className="p-3"><SeverityPill level={e.severity} /></td>
                  <td className="max-w-md py-3 pr-3"><div className="font-semibold capitalize text-ink-950">{label(e.type)}{e.simulated && <span className="ml-2 rounded bg-brand-100 px-1.5 py-px text-[10px] font-bold text-brand-700">SIMULATED</span>}</div>
                    <div className="text-slate-600">{e.message}</div>{e.resolution_note && <div className="mt-0.5 text-xs italic text-slate-500">Note: {e.resolution_note}</div>}</td>
                  <td className="py-3 text-xs text-slate-600">{e.user_email || e.user_id || "-"}</td>
                  <td className="py-3 font-mono text-xs text-slate-600">{e.ip || "-"}{e.ip && <button className="ml-2 font-sans font-semibold text-red-600 hover:underline" onClick={() => blockIp(e.ip)}>Block</button>}</td>
                  <td className="whitespace-nowrap py-3 text-slate-600">{formatStamp(e.created_at)}</td>
                  <td className="py-3"><span className="flex items-center gap-1.5 text-xs capitalize"><Led tone={e.status === "open" ? "bad" : "on"} />{e.status}</span></td>
                  <td className="py-3 pr-3 text-right">{e.status === "open" ? <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => update(e, true)}>Resolve</button> : <button className="text-xs font-semibold text-brand-600 hover:underline" onClick={() => update(e, false)}>Re-open</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />
        </div>
      )}
    </div>
  );
}

function Rules() {
  const [rules, setRules] = useState(null);
  const [edit, setEdit] = useState({});
  const [msg, setMsg] = useState("");
  const load = () => api.get("/security/rules").then((r) => setRules(r.data));
  useEffect(() => { load(); }, []);
  const val = (r, k) => (edit[r.id]?.[k] ?? (k === "window_seconds" ? Math.round(r.window_seconds / 60) : r[k]));
  const AUTO = "auto_block";
  const change = (r, k, v) => setEdit({ ...edit, [r.id]: { ...edit[r.id], [k]: v } });
  const save = async (r) => {
    const e = edit[r.id] || {};
    const body = {};
    if ("enabled" in e) body.enabled = e.enabled;
    if ("threshold" in e) body.threshold = Number(e.threshold);
    if ("window_seconds" in e) body.window_seconds = Number(e.window_seconds) * 60;
    if ("severity" in e) body.severity = e.severity;
    if ("auto_block" in e) body.auto_block = e.auto_block;
    if ("block_minutes" in e) body.block_minutes = Number(e.block_minutes);
    try { await api.put(`/security/rules/${r.id}`, body); setEdit({ ...edit, [r.id]: {} }); setMsg(`Saved "${r.name}". It applies within 15 seconds.`); load(); } catch (er) { setMsg(await errorMessage(er)); }
  };
  const reset = async (r) => { await api.post(`/security/rules/${r.id}/reset`); setEdit({ ...edit, [r.id]: {} }); setMsg(`"${r.name}" is back to its default.`); load(); };
  if (!rules) return <p className="py-12 text-center text-slate-500">Loading...</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Each rule watches one kind of behaviour. When it happens <b>threshold</b> times within the <b>time window</b>, an alert with the chosen <b>severity</b> is created and every admin is notified. Change the numbers to test with smaller limits.</p>
      {msg && <div className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800">{msg}</div>}
      {rules.map((r) => {
        const dirty = Object.keys(edit[r.id] || {}).length > 0;
        return (
          <div key={r.id} className={`card !p-4 ${val(r, "enabled") ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-center gap-4">
              <button onClick={() => change(r, "enabled", !val(r, "enabled"))} className={`relative h-6 w-11 shrink-0 rounded-full transition ${val(r, "enabled") ? "bg-brand-600" : "bg-paper-300"}`} aria-label="Switch rule on or off">
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${val(r, "enabled") ? "left-[22px]" : "left-0.5"}`} />
              </button>
              <div className="min-w-[220px] flex-1"><div className="font-semibold text-ink-950">{r.name}</div><div className="text-xs text-slate-500">{r.description}</div></div>
              <Field label="Threshold"><input type="number" min="1" className={`${inputCls} w-24`} value={val(r, "threshold")} onChange={(e) => change(r, "threshold", e.target.value)} /></Field>
              <Field label="Window (min)"><input type="number" min="0" className={`${inputCls} w-24`} value={val(r, "window_seconds")} onChange={(e) => change(r, "window_seconds", e.target.value)} disabled={r.window_seconds === 0 && r.threshold === 1 && !edit[r.id]} /></Field>
              <Field label="Severity"><select className={`${inputCls} w-28`} value={val(r, "severity")} onChange={(e) => change(r, "severity", e.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field>
              {r.can_block && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50/70 px-3 py-2 pt-2 text-xs text-red-700" title="When this rule fires, the attacking IP address is shut out for a while. Private / local addresses are never blocked.">
                  <label className="flex cursor-pointer items-center gap-1.5 font-semibold"><input type="checkbox" checked={!!val(r, AUTO)} onChange={(e) => change(r, AUTO, e.target.checked)} /> Auto-block IP</label>
                  {val(r, AUTO) && <><input type="number" min="1" className="w-16 rounded-lg border border-red-200 bg-white px-1.5 py-1 text-center" value={val(r, "block_minutes")} onChange={(e) => change(r, "block_minutes", e.target.value)} /> min</>}
                </div>
              )}
              <div className="flex items-center gap-2 pt-4">
                <span className="rounded-full bg-paper-100 px-2.5 py-1 text-xs text-slate-500">fired {r.fired}×</span>
                <button className="btn-primary !px-3 !py-1.5 text-xs" disabled={!dirty} onClick={() => save(r)}>Save</button>
                <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => reset(r)}>Default</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Scenarios({ onDone }) {
  const [list, setList] = useState([]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState("");
  useEffect(() => { api.get("/security/scenarios").then((r) => setList(r.data)); }, []);
  const run = async (s) => {
    setBusy(s.id); setResult(null);
    try { setResult({ ok: true, ...(await api.post("/security/simulate", { scenario: s.id })).data }); } catch (e) { setResult({ ok: false, error: await errorMessage(e) }); } finally { setBusy(""); }
  };
  return (
    <div className="space-y-4">
      <div className="card !p-4 text-sm text-slate-600">These buttons replay the test scenarios from the milestone <b>safely</b>: they write the same activity records an attacker would cause (from a documentation IP like <span className="font-mono">203.0.113.x</span>, marked <b>[SIMULATED]</b>) and send them through the real detection rules. You should then see an alert, an admin notification and a pop-up.</div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((s, i) => (
          <div key={s.id} className="card flex flex-col gap-3">
            <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><FlaskConical size={18} /></span>
              <div><div className="text-xs font-semibold text-slate-400">SCENARIO {i + 1}</div><div className="font-semibold text-ink-950">{s.label}</div></div></div>
            <button className="btn-primary mt-auto" disabled={!!busy} onClick={() => run(s)}><Play size={15} /> {busy === s.id ? "Running..." : "Run scenario"}</button>
          </div>
        ))}
      </div>
      {result && (
        <div className={`rounded-2xl border p-4 text-sm ${result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          {result.ok ? <>Created <b>{result.events_created}</b> simulated events from <span className="font-mono">{result.ip}</span>. Rule “{result.rule}” should now have raised a <b>{label(result.expected_alert)}</b> alert.{" "}
            <button className="font-semibold underline" onClick={onDone}>Open the alerts</button></> : result.error}
        </div>
      )}
    </div>
  );
}

export default function AdminAlerts() {
  const [tab, setTab] = useState("alerts");
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader title="Security Alerts" subtitle="Suspicious activity found by the detection rules, who caused it, and what to do about it.">
        <Segmented value={tab} onChange={setTab} options={[["alerts", "Alerts"], ["rules", "Detection rules"], ["test", "Test scenarios"]]} />
      </PageHeader>
      {tab === "alerts" && <Alerts />}
      {tab === "rules" && <Rules />}
      {tab === "test" && <Scenarios onDone={() => setTab("alerts")} />}
      {tab === "rules" && <div className="flex items-center gap-2 text-xs text-slate-500"><SlidersHorizontal size={14} /> Rules are saved in MongoDB, so they survive restarts.</div>}
    </div>
  );
}
