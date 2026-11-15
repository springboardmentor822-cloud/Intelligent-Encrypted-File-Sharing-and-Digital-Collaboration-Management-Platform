// Where is my space going?  Gauge + per-type breakdown + biggest files + trash.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Trash2 } from "lucide-react";
import api from "../lib/api";
import { formatBytes, timeAgo } from "../lib/format";
import FileTile, { TYPE_COLOR, TYPE_LABEL } from "../components/FileTile";
import { Gauge, PageHeader, ProgressBar } from "../components/ui";

export default function Storage() {
  const [data, setData] = useState(null);
  const [largest, setLargest] = useState([]);
  useEffect(() => {
    api.get("/reports/file-analytics", { params: { days: 30 } }).then((r) => setData(r.data)).catch(() => setData(false));
    api.get("/analytics/largest").then((r) => setLargest(r.data)).catch(() => {});
  }, []);
  if (data === null) return <p className="py-20 text-center text-slate-500">Loading...</p>;
  if (data === false) return <p className="py-20 text-center text-red-600">Could not load storage data.</p>;
  const s = data.storage;
  const biggest = s.by_type[0]?.bytes || 1;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader kicker="07 — Capacity" title="Storage"
        subtitle={data.range.scope === "platform" ? "Platform-wide storage across all users." : "Your encrypted storage and how it is used."} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card flex flex-col items-center">
          <Gauge used={s.used_bytes} capacity={s.capacity_bytes} />
          <div className="mt-5 grid w-full grid-cols-3 gap-2 text-center text-sm">
            <div><div className="font-semibold text-brand-700">{formatBytes(s.used_bytes)}</div><div className="text-xs text-slate-500">Used</div></div>
            <div><div className="font-semibold text-emerald-600">{formatBytes(s.free_bytes)}</div><div className="text-xs text-slate-500">Available</div></div>
            <div><div className="font-semibold">{formatBytes(s.capacity_bytes)}</div><div className="text-xs text-slate-500">Total</div></div>
          </div>
          <Link to="/trash" className="mt-5 flex w-full items-center gap-2 rounded-xl bg-paper-100 p-3 text-sm text-slate-600 hover:bg-paper-200">
            <Trash2 size={15} /> Trash holds <b>{s.trash_files}</b> file{s.trash_files === 1 ? "" : "s"} ({formatBytes(s.trash_bytes)}) — not counted above
          </Link>
        </div>

        <div className="card lg:col-span-2">
          <h2 className="font-display text-lg font-bold">By file type</h2>
          {s.by_type.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">No files yet.</p> : (
            <div className="mt-3 grid items-center gap-4 sm:grid-cols-[200px_1fr]">
              <div className="h-48">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={s.by_type} dataKey="bytes" nameKey="type" innerRadius={52} outerRadius={85} paddingAngle={2} stroke="none">
                      {s.by_type.map((t) => <Cell key={t.type} fill={TYPE_COLOR[t.type] || TYPE_COLOR.other} />)}
                    </Pie>
                    <Tooltip formatter={(v) => formatBytes(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3">
                {s.by_type.map((t) => (
                  <div key={t.type}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TYPE_COLOR[t.type] || TYPE_COLOR.other }} />
                        {TYPE_LABEL[t.type] || t.type} <span className="text-slate-400">· {t.files} file{t.files === 1 ? "" : "s"}</span></span>
                      <span className="tabular font-medium">{formatBytes(t.bytes)}</span>
                    </div>
                    <ProgressBar warn={false} pct={(t.bytes / biggest) * 100} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="mb-3 font-display text-lg font-bold">Largest files</h2>
        {largest.length === 0 ? <p className="text-sm text-slate-500">Nothing to show yet.</p> : (
          <div className="divide-y divide-paper-200">
            {largest.map((f, i) => (
              <div key={f.id} className="flex items-center gap-3 py-2.5">
                <span className="w-5 font-mono text-xs text-slate-400">{i + 1}</span>
                <FileTile category={f.category} size={36} />
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{f.name}</div>
                  <div className="text-xs text-slate-500">{f.owner_email} · {timeAgo(f.created_at)}</div></div>
                <div className="tabular font-semibold">{formatBytes(f.size_bytes)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
