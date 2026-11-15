// Admin → Notification Management (Milestone 3, Task 3 + final integration): statistics, e-mail delivery, announcements, SMTP test.
import { useCallback, useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BellRing, Mail, MailCheck, MailWarning, Megaphone, Send } from "lucide-react";
import api, { errorMessage } from "../lib/api";
import { formatNumber, formatStamp } from "../lib/format";
import { C } from "../lib/theme";
import { NotifIcon, TYPE_META } from "../components/notifyMeta";
import { Field, inputCls } from "../components/filters";
import { PageHeader, StatCard } from "../components/ui";

const EMAIL_TONE = { sent: "bg-emerald-50 text-emerald-600", failed: "bg-red-50 text-red-600", skipped: "bg-amber-50 text-amber-700", muted: "bg-paper-100 text-slate-500" };

export default function AdminNotifications() {
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ title: "", message: "", audience: "all", send_email: false });
  const [testTo, setTestTo] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(() => { api.get("/admin/notifications/overview", { params: { days: 14 } }).then((r) => setD(r.data)).catch(async (e) => setError(await errorMessage(e))); }, []);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  const broadcast = async () => {
    try {
      const { data } = await api.post("/admin/notifications/broadcast", form);
      setMsg(`Sent to ${data.recipients} people${form.send_email ? ` · ${data.emails_sent} e-mails delivered${data.smtp_configured ? "" : " (SMTP is not configured, so e-mails were skipped)"}` : ""}.`);
      setForm({ ...form, title: "", message: "" }); load();
    } catch (e) { setMsg(await errorMessage(e)); }
  };
  const testMail = async () => {
    try { const { data } = await api.post("/admin/notifications/test-email", { to: testTo }); setMsg(data.status === "sent" ? `Test e-mail sent to ${testTo}.` : data.status === "skipped" ? "SMTP is not configured (see .env), so nothing was sent. The attempt is shown in the e-mail log." : "Sending failed. Check the SMTP settings."); load(); }
    catch (e) { setMsg(await errorMessage(e)); }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader title="Notification Management" subtitle="What users and admins are being told, whether e-mails reach them, and a way to broadcast announcements." />
      {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {msg && <div className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800">{msg}</div>}
      {!d ? <p className="py-16 text-center text-slate-500">Loading...</p> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard icon={BellRing} label="Notifications (14 days)" value={formatNumber(d.total)} sub={`${d.unread} unread`} />
            <StatCard icon={Send} tone="green" label="Read rate" value={d.read_rate === null ? "-" : `${d.read_rate}%`} />
            <StatCard icon={MailCheck} tone="sky" label="E-mails sent" value={d.emails.sent} />
            <StatCard icon={MailWarning} tone="amber" label="E-mails skipped" value={d.emails.skipped} sub={d.smtp_configured ? "" : "SMTP not configured"} />
            <StatCard icon={Mail} tone="red" label="E-mails failed" value={d.emails.failed} />
          </div>

          <div className="grid gap-5 lg:grid-cols-5">
            <div className="card lg:col-span-3">
              <h2 className="mb-3 font-display text-lg font-bold text-ink-950">Notifications per day</h2>
              <div className="h-56"><ResponsiveContainer><BarChart data={d.series}><CartesianGrid strokeDasharray="3 3" stroke="#e2e9f4" vertical={false} /><XAxis dataKey="day" tickFormatter={(x) => x.slice(5)} fontSize={11} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} /><Tooltip /><Bar dataKey="count" name="Notifications" fill={C.primary} radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div>
              <div className="mt-2 flex flex-wrap gap-2">{Object.entries(TYPE_META).map(([k, m]) => <span key={k} className={`rounded-full px-3 py-1 text-xs font-medium ${m.tone}`}>{m.label}: {d.by_type[k] || 0}</span>)}</div>
            </div>

            <div className="card lg:col-span-2">
              <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold text-ink-950"><Megaphone size={18} className="text-brand-600" /> Send an announcement</h2>
              <p className="mb-3 text-xs text-slate-500">Appears in everyone's bell. Optionally also by e-mail.</p>
              <div className="space-y-3">
                <Field label="Title"><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Scheduled maintenance tonight" /></Field>
                <Field label="Message"><textarea className={`${inputCls} h-20`} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></Field>
                <div className="flex flex-wrap items-center gap-3">
                  <select className={`${inputCls} !w-auto`} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}><option value="all">Everyone</option><option value="users">Normal users only</option><option value="admins">Admins only</option></select>
                  <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={form.send_email} onChange={(e) => setForm({ ...form, send_email: e.target.checked })} /> Also e-mail</label>
                  <button className="btn-primary ml-auto" disabled={form.title.length < 3 || form.message.length < 3} onClick={broadcast}><Send size={15} /> Send</button>
                </div>
              </div>
              <div className="mt-4 border-t border-paper-200 pt-3">
                <div className="mb-1 text-xs font-medium text-slate-500">Test the e-mail connection (SMTP {d.smtp_configured ? "is configured" : "is NOT configured"})</div>
                <div className="flex gap-2"><input className={`${inputCls} flex-1`} value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" /><button className="btn-secondary !py-2" disabled={!testTo.includes("@")} onClick={testMail}>Send test</button></div>
              </div>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="card overflow-hidden !p-0">
              <h2 className="p-4 pb-2 font-display text-lg font-bold text-ink-950">Latest notifications (all users)</h2>
              <div className="max-h-[26rem] overflow-y-auto">
                {d.recent.map((n) => (
                  <div key={n.id} className="flex items-start gap-3 border-t border-paper-200 p-3.5">
                    <NotifIcon type={n.type} />
                    <div className="min-w-0 flex-1 text-sm"><div className="font-semibold text-ink-950">{n.title}</div><div className="line-clamp-2 text-slate-600">{n.message}</div>
                      <div className="mt-0.5 text-xs text-slate-400">to {n.to_name} ({n.to_email}) · {formatStamp(n.created_at)} · {n.read ? "read" : "unread"}</div></div>
                    {n.email_status && <span className={`rounded-md px-1.5 py-px text-[11px] font-medium ${EMAIL_TONE[n.email_status]}`}>e-mail {n.email_status}</span>}
                  </div>
                ))}
                {d.recent.length === 0 && <p className="p-8 text-center text-sm text-slate-500">Nothing yet.</p>}
              </div>
            </div>
            <div className="card overflow-hidden !p-0">
              <h2 className="p-4 pb-2 font-display text-lg font-bold text-ink-950">E-mail delivery log</h2>
              <div className="max-h-[26rem] overflow-y-auto">
                {d.email_log.map((m) => (
                  <div key={m.id} className="flex items-start gap-3 border-t border-paper-200 p-3.5 text-sm">
                    <span className={`mt-0.5 rounded-md px-2 py-0.5 text-xs font-semibold capitalize ${EMAIL_TONE[m.status]}`}>{m.status}</span>
                    <div className="min-w-0 flex-1"><div className="truncate font-medium text-ink-950">{m.subject}</div><div className="truncate text-xs text-slate-500">to {m.to} · {m.kind} · {formatStamp(m.created_at)}</div>{m.error && <div className="text-xs text-amber-700">{m.error}</div>}</div>
                  </div>
                ))}
                {d.email_log.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No e-mails attempted yet.</p>}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
