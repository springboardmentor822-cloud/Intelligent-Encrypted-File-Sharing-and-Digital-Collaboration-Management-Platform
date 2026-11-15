// Admin → Audit Logs (Milestone 3, Task 2). Read-only history of every important action, with filters and CSV export.
import { useCallback, useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import api, { errorMessage } from "../lib/api";
import { formatStamp } from "../lib/format";
import { ExportButton, Field, FilterBar, Pager, StatusPill, inputCls } from "../components/filters";
import { Avatar, EmptyState, PageHeader } from "../components/ui";

const EMPTY = { user: "", activity_type: "", file: "", status: "", date_from: "", date_to: "" };

export default function AdminAuditLogs() {
  const [draft, setDraft] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const params = () => Object.fromEntries(Object.entries(applied).filter(([, v]) => v));

  const load = useCallback(() => {
    setError("");
    api.get("/audit-logs", { params: { ...params(), page, page_size: 25 } }).then((r) => setData(r.data)).catch(async (e) => setError(await errorMessage(e)));
  }, [applied, page]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setDraft({ ...draft, [k]: e.target.value });
  const apply = () => { setPage(1); setApplied(draft); };
  const reset = () => { setDraft(EMPTY); setApplied(EMPTY); setPage(1); };
  const pick = (k, v) => { const next = { ...applied, [k]: v }; setDraft(next); setApplied(next); setPage(1); };   // click a user / file / type to filter by it

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader title="Audit Logs" subtitle="A permanent, read-only history of logins, uploads, downloads, sharing, permission changes and security actions. Nobody can edit or delete these records from the app.">
        <ExportButton path="/audit-logs/export" params={params()} filename="audit_logs.csv" />
      </PageHeader>

      <FilterBar onApply={apply} onReset={reset}>
        <Field label="User (e-mail or ID)"><input className={`${inputCls} w-52`} value={draft.user} onChange={set("user")} placeholder="alice@example.com" /></Field>
        <Field label="Activity type">
          <select className={`${inputCls} w-44`} value={draft.activity_type} onChange={set("activity_type")}>
            <option value="">All activities</option>{data?.activity_types.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
          </select>
        </Field>
        <Field label="File name or ID"><input className={`${inputCls} w-48`} value={draft.file} onChange={set("file")} placeholder="Report.pdf" /></Field>
        <Field label="Status"><select className={`${inputCls} w-32`} value={draft.status} onChange={set("status")}><option value="">Any</option><option value="success">Success</option><option value="failure">Failed</option></select></Field>
        <Field label="From"><input type="date" className={inputCls} value={draft.date_from} onChange={set("date_from")} /></Field>
        <Field label="To"><input type="date" className={inputCls} value={draft.date_to} onChange={set("date_to")} /></Field>
      </FilterBar>
      {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {data && (
        <div className="grid gap-4 sm:grid-cols-3">
          {[["Matching records", data.total, "text-ink-950"], ["Successful", data.success, "text-emerald-600"], ["Failed / denied", data.failure, "text-red-600"]].map(([l, v, c]) => (
            <div key={l} className="card !p-4"><div className="text-xs text-slate-500">{l}</div><div className={`font-display text-3xl font-extrabold tabular ${c}`}>{v.toLocaleString()}</div></div>
          ))}
        </div>
      )}

      {!data ? <p className="py-16 text-center text-slate-500">Loading...</p> : data.items.length === 0 ? <EmptyState icon={ScrollText} title="No records match" text="Change the filters or press Reset." /> : (
        <div className="card overflow-x-auto !p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper-100 text-xs text-slate-500">
              <tr><th className="p-3 font-medium">Time</th><th className="font-medium">User</th><th className="font-medium">Activity</th><th className="font-medium">Description</th><th className="font-medium">Status</th><th className="font-medium">IP address</th><th className="pr-3 font-medium">Log ID</th></tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.log_id} className={`border-b border-paper-200 align-top last:border-0 hover:bg-paper-50 ${r.status === "failure" ? "bg-red-50/30" : ""}`}>
                  <td className="whitespace-nowrap p-3 text-slate-600">{formatStamp(r.timestamp)}</td>
                  <td className="py-3 pr-2">
                    <button className="flex items-center gap-2 text-left" onClick={() => r.user_email && pick("user", r.user_email)} title="Filter by this user">
                      <Avatar name={r.username} size={28} /><span><span className="block whitespace-nowrap font-medium text-ink-950">{r.username}</span><span className="block max-w-[170px] truncate text-xs text-slate-500">{r.user_email || "not signed in"}</span></span>
                    </button>
                  </td>
                  <td className="py-3"><button className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 hover:bg-brand-100" onClick={() => pick("activity_type", r.activity_type)}>{r.activity_type.replace(/_/g, " ")}</button></td>
                  <td className="max-w-md py-3 pr-3 text-slate-700">{r.description}{r.file_name && <button className="ml-1.5 text-xs font-semibold text-brand-600 hover:underline" onClick={() => pick("file", r.file_name)}>file history</button>}</td>
                  <td className="py-3"><StatusPill ok={r.status === "success"} /></td>
                  <td className="whitespace-nowrap py-3 font-mono text-xs text-slate-600">{r.ip || "-"}</td>
                  <td className="py-3 pr-3 font-mono text-[11px] text-slate-400" title={`${r.log_id}${r.file_id ? ` · file ${r.file_id}` : ""}`}>{r.log_id.slice(-8)}</td>
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
