// The File Analytics charts (summary cards, storage donut, upload / download / sharing charts, recent tables).
// Used by the File Analytics page AND inside the admin Security Dashboard, so both always look the same.
import { Link } from "react-router-dom";
import { C } from "../lib/theme";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Database, Download, Share2, UploadCloud } from "lucide-react";
import { extOf, formatBytes, formatNumber, formatStamp } from "../lib/format";
import FileTile, { GROUP_COLOR, GROUP_LABEL } from "./FileTile";
import { Delta, EmptyState } from "./ui";

function SummaryCard({ icon: Icon, tone, label, value, delta, sub }) {
  return (
    <div className="card flex items-center gap-4">
      <span className={`flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-2xl ${tone}`}><Icon size={32} /></span>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-slate-500">{label}</div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="font-display text-[28px] font-extrabold leading-tight tabular text-ink-950">{value}</span>
          <Delta value={delta} />
        </div>
        <div className="truncate text-xs text-slate-500">{sub}</div>
      </div>
    </div>
  );
}

const axis = { fontSize: 11, tickLine: false, axisLine: false, tick: { fill: "#64748b" } };
const shortDay = (d) => new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const grid = <CartesianGrid strokeDasharray="3 3" stroke="#e2e9f4" vertical={false} />;

function Panel({ title, right, children, className = "" }) {
  return (
    <div className={`card ${className}`}>
      <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-lg font-bold text-ink-950">{title}</h2>{right}</div>
      {children}
    </div>
  );
}


export default function ActivityAnalytics({ data }) {
  const c = data.cards, dl = data.deltas;
  const groups = data.storage.by_group.filter((g) => g.bytes > 0);
  return (
    <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard icon={Database} tone="bg-brand-50 text-brand-600" label="Total Storage Used" value={formatBytes(c.storage_used_bytes)} delta={dl.storage}
              sub={`of ${formatBytes(c.storage_capacity_bytes)}`} />
            <SummaryCard icon={UploadCloud} tone="bg-emerald-50 text-emerald-600" label="Total Uploads" value={formatNumber(c.total_uploads)} delta={dl.uploads} sub="files uploaded" />
            <SummaryCard icon={Download} tone="bg-violet-50 text-violet-600" label="Total Downloads" value={formatNumber(c.total_downloads)} delta={dl.downloads} sub="files downloaded" />
            <SummaryCard icon={Share2} tone="bg-red-50 text-red-500" label="Total Shares" value={formatNumber(c.total_shares)} delta={dl.shares} sub="files shared" />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Storage Usage Statistics" right={<span className="rounded-lg border border-paper-300 px-3 py-1.5 text-xs text-slate-600">By File Type</span>}>
              {groups.length === 0 ? <EmptyState title="No files stored yet" /> : (
                <div className="grid items-center gap-4 sm:grid-cols-[210px_1fr]">
                  <div className="relative h-52">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={groups} dataKey="bytes" nameKey="type" innerRadius={62} outerRadius={92} paddingAngle={1} stroke="none" startAngle={90} endAngle={-270}>
                          {groups.map((g) => <Cell key={g.type} fill={GROUP_COLOR[g.type]} />)}
                        </Pie>
                        <Tooltip formatter={(v) => formatBytes(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <div className="font-display text-xl font-extrabold text-ink-950">{formatBytes(data.storage.used_bytes)}</div>
                      <div className="text-xs text-slate-500">of {formatBytes(data.storage.capacity_bytes)}</div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {data.storage.by_group.map((g) => (
                      <div key={g.type} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2.5"><span className="h-3 w-3 rounded-full" style={{ background: GROUP_COLOR[g.type] }} />{GROUP_LABEL[g.type]}</span>
                        <span className="tabular text-slate-600">{formatBytes(g.bytes)} <span className="text-slate-400">({data.storage.used_bytes ? Math.round((g.bytes / data.storage.used_bytes) * 100) : 0}%)</span></span>
                      </div>
                    ))}
                    <div className="border-t border-paper-200 pt-2 text-xs text-slate-500">{formatBytes(data.storage.free_bytes)} available · <Link to="/storage" className="text-brand-700 hover:underline">details</Link></div>
                  </div>
                </div>
              )}
            </Panel>

            <Panel title="File Upload Reports">
              {data.uploads.total === 0 ? <EmptyState title="No uploads in this period" /> : (
                <div className="h-64">
                  <ResponsiveContainer>
                    <BarChart data={data.uploads.series} barCategoryGap="18%">
                      {grid}<XAxis dataKey="day" tickFormatter={shortDay} interval="preserveStartEnd" {...axis} /><YAxis allowDecimals={false} {...axis} />
                      <Tooltip /><Legend iconType="circle" formatter={(v) => GROUP_LABEL[v]} />
                      {data.uploads.groups.map((g) => <Bar key={g} dataKey={g} stackId="u" fill={GROUP_COLOR[g]} />)}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Download Analytics">
              <div className="h-64">
                <ResponsiveContainer>
                  <AreaChart data={data.downloads.series}>
                    <defs>
                      <linearGradient id="gTot" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.primary} stopOpacity={0.25} /><stop offset="95%" stopColor={C.primary} stopOpacity={0} /></linearGradient>
                      <linearGradient id="gUni" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.2} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                      <linearGradient id="gSha" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f0506e" stopOpacity={0.2} /><stop offset="95%" stopColor="#f0506e" stopOpacity={0} /></linearGradient>
                    </defs>
                    {grid}<XAxis dataKey="day" tickFormatter={shortDay} interval="preserveStartEnd" {...axis} /><YAxis allowDecimals={false} {...axis} />
                    <Tooltip /><Legend iconType="circle" />
                    <Area type="monotone" name="Total Downloads" dataKey="total" stroke={C.primary} strokeWidth={2} fill="url(#gTot)" dot={{ r: 2.5 }} />
                    <Area type="monotone" name="Unique Users" dataKey="unique" stroke="#10b981" strokeWidth={2} fill="url(#gUni)" dot={{ r: 2.5 }} />
                    <Area type="monotone" name="Shared Files Downloads" dataKey="shared" stroke="#f0506e" strokeWidth={2} fill="url(#gSha)" dot={{ r: 2.5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-3 text-center text-xs text-slate-500">
                <div><b className="block font-display text-lg text-ink-950">{formatNumber(data.downloads.total)}</b>total downloads</div>
                <div><b className="block font-display text-lg text-ink-950">{formatNumber(data.downloads.unique_users)}</b>unique users</div>
                <div><b className="block font-display text-lg text-ink-950">{formatNumber(data.downloads.shared_link)}</b>via share links</div>
              </div>
            </Panel>

            <Panel title="Sharing Activity Reports">
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={data.sharing.series} barCategoryGap="18%">
                    {grid}<XAxis dataKey="day" tickFormatter={shortDay} interval="preserveStartEnd" {...axis} /><YAxis allowDecimals={false} {...axis} />
                    <Tooltip /><Legend iconType="circle" />
                    <Bar name="Direct Share" dataKey="direct" stackId="s" fill={C.primarySoft} />
                    <Bar name="Link Share" dataKey="link" stackId="s" fill="#10b981" />
                    <Bar name="Internal Share" dataKey="internal" stackId="s" fill="#8b5cf6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-3 text-center text-xs text-slate-500">
                <div><b className="block font-display text-lg text-ink-950">{data.sharing.direct}</b>direct shares</div>
                <div><b className="block font-display text-lg text-ink-950">{data.sharing.link}</b>links created</div>
                <div><b className="block font-display text-lg text-ink-950">{data.sharing.internal}</b>internal accesses</div>
              </div>
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Recent Uploads" right={<Link to="/files" className="text-sm font-medium text-brand-600 hover:underline">View All</Link>} className="overflow-x-auto">
              {data.recent_uploads.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No uploads in this period.</p> : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-paper-100 text-xs text-slate-500"><tr><th className="rounded-l-lg p-2.5 font-medium">File Name</th><th className="font-medium">Size</th><th className="font-medium">Type</th><th className="rounded-r-lg font-medium">Date &amp; Time</th></tr></thead>
                  <tbody>
                    {data.recent_uploads.map((f) => (
                      <tr key={f.id} className="border-b border-paper-200 last:border-0">
                        <td className="py-2.5 pr-2"><span className="flex items-center gap-2.5"><FileTile category={f.category} size={30} /><span className="max-w-[150px] truncate font-medium text-ink-950">{f.name}</span></span></td>
                        <td className="whitespace-nowrap tabular text-slate-600">{formatBytes(f.size_bytes)}</td>
                        <td className="text-slate-600">{extOf(f.name)}</td>
                        <td className="whitespace-nowrap text-slate-600">{formatStamp(f.uploaded_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>

            <Panel title="Recent Downloads" right={<Link to="/activity" className="text-sm font-medium text-brand-600 hover:underline">View All</Link>} className="overflow-x-auto">
              {data.recent_downloads.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No downloads in this period.</p> : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-paper-100 text-xs text-slate-500"><tr><th className="rounded-l-lg p-2.5 font-medium">File Name</th><th className="font-medium">Downloaded By</th><th className="font-medium">Size</th><th className="rounded-r-lg font-medium">Date &amp; Time</th></tr></thead>
                  <tbody>
                    {data.recent_downloads.map((d, i) => (
                      <tr key={i} className="border-b border-paper-200 last:border-0">
                        <td className="py-2.5 pr-2"><span className="flex items-center gap-2.5"><FileTile category={d.category} size={30} /><span className="max-w-[130px] truncate font-medium text-ink-950">{d.name || "-"}</span></span></td>
                        <td className="text-slate-600">{d.user_email || <span className="text-slate-400">link visitor</span>}</td>
                        <td className="whitespace-nowrap tabular text-slate-600">{d.size_bytes ? formatBytes(d.size_bytes) : "-"}</td>
                        <td className="whitespace-nowrap text-slate-600">{formatStamp(d.downloaded_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </div>
    </div>
  );
}
