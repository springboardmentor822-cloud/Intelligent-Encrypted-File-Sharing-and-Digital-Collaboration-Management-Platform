import { useEffect, useState } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import api from "../lib/api";
import { formatBytes } from "../lib/format";

const COLORS = ["#0d9488", "#f59e0b", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7", "#64748b"];

export default function StorageStats() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api.get("/analytics/storage").then((r) => setStats(r.data)); }, []);
  if (!stats) return <div className="card">Loading storage...</div>;

  const pct = stats.quota_bytes ? Math.min(100, (stats.used_bytes / stats.quota_bytes) * 100) : null;
  const data = stats.by_category.map((c) => ({ name: c.category, value: c.bytes, files: c.files }));

  return (
    <div className="card">
      <h3 className="mb-3 font-semibold">Storage usage</h3>
      <div className="mb-1 text-2xl font-bold">{formatBytes(stats.used_bytes)}</div>
      <div className="mb-3 text-sm text-slate-500">
        {stats.file_count} files{stats.quota_bytes ? ` - ${pct.toFixed(1)}% of ${formatBytes(stats.quota_bytes)}` : ""}
      </div>
      {data.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">No files yet.</p>
      ) : (
        <div className="h-60">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85}>
                {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => formatBytes(v)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
