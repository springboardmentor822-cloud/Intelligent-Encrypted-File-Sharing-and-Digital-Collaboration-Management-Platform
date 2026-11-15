// Small pieces shared by the admin report / log pages: a filter field, a pager and an export button.
import { useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { downloadCsv, errorMessage } from "../lib/api";

export function Field({ label, children, className = "" }) {
  return <label className={`block text-xs font-medium text-slate-500 ${className}`}>{label}<div className="mt-1">{children}</div></label>;
}

export const inputCls = "input !py-2 text-sm";

// The row of boxes above a table. `value` is the filter object, `onChange` gets the whole new object.
export function FilterBar({ children, onApply, onReset }) {
  return (
    <div className="card !p-4">
      <div className="flex flex-wrap items-end gap-3">
        {children}
        <button className="btn-primary !py-2" onClick={onApply}>Apply</button>
        <button className="btn-secondary !py-2" onClick={onReset}>Reset</button>
      </div>
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm text-slate-500">
      <span>{total === 0 ? "No records" : `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, total)} of ${total.toLocaleString()}`}</span>
      <span className="flex items-center gap-1">
        <button className="rounded-lg border border-paper-300 p-1.5 hover:bg-paper-100 disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={16} /></button>
        <span className="px-2">Page {page} / {pages}</span>
        <button className="rounded-lg border border-paper-300 p-1.5 hover:bg-paper-100 disabled:opacity-40" disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight size={16} /></button>
      </span>
    </div>
  );
}

export function ExportButton({ path, params, filename, label = "Export CSV" }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async () => { setBusy(true); setErr(""); try { await downloadCsv(path, params, filename); } catch (e) { setErr(await errorMessage(e)); } finally { setBusy(false); } };
  return (
    <span className="inline-flex flex-col items-end">
      <button className="btn-secondary !py-2" disabled={busy} onClick={go}><Download size={15} /> {busy ? "Preparing..." : label}</button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </span>
  );
}

export function SeverityPill({ level }) {
  const cls = { high: "bg-red-50 text-red-600", medium: "bg-amber-50 text-amber-600", low: "bg-emerald-50 text-emerald-600" }[level] || "bg-paper-100 text-slate-500";
  return <span className={`rounded-md px-2 py-0.5 text-xs font-semibold capitalize ${cls}`}>{level}</span>;
}

export function StatusPill({ ok, okLabel = "Success", badLabel = "Failed" }) {
  return <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${ok ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>{ok ? okLabel : badLabel}</span>;
}
