import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Empty } from "../ui";

// Every chart in the app uses the dark-red palette.
export const DARK_RED = ["#450a0a", "#7f1d1d", "#991b1b", "#b91c1c", "#dc2626", "#ef4444"];

export const CAT_COLORS: Record<string, string> = {
  documents: "#7f1d1d",
  images: "#b91c1c",
  videos: "#dc2626",
  others: "#450a0a",
};

/** Build a dark-red color map for an arbitrary list of series keys. */
export function redPalette(keys: string[]): Record<string, string> {
  return keys.reduce((acc, k, i) => { acc[k] = DARK_RED[i % DARK_RED.length]; return acc; }, {} as Record<string, string>);
}

const tick = { fontSize: 11, fill: "#64748b" };
const short = (d: string) => new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
const grid = <CartesianGrid strokeDasharray="3 3" stroke="#f1d5d5" vertical={false} />;
const tooltipStyle = { borderRadius: 12, border: "1px solid #f3d6d6", boxShadow: "0 8px 24px -8px rgba(127,29,29,.25)", fontSize: 12 };

export function StackedBars({ data, keys, colors, height = 240, empty }: { data: any[]; keys: string[]; colors: Record<string, string>; height?: number; empty?: string }) {
  data = Array.isArray(data) ? data : [];
  if (!data.some((d) => keys.some((k) => d[k]))) return <Empty title={empty || "No data in this period"} />;
  const c = colors || redPalette(keys);
  return <div style={{ height }}><ResponsiveContainer><BarChart data={data}>{grid}<XAxis dataKey="date" tick={tick} tickFormatter={short} minTickGap={24} /><YAxis allowDecimals={false} tick={tick} width={32} /><Tooltip contentStyle={tooltipStyle} labelFormatter={short as any} />
    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />{keys.map((k) => <Bar key={k} isAnimationActive={false} dataKey={k} stackId="a" fill={c[k]} name={k[0].toUpperCase() + k.slice(1).replace("_", " ")} />)}</BarChart></ResponsiveContainer></div>;
}

export function Lines({ data, keys, colors, names, height = 240, area, empty }: { data: any[]; keys: string[]; colors: Record<string, string>; names?: Record<string, string>; height?: number; area?: boolean; empty?: string }) {
  data = Array.isArray(data) ? data : [];
  if (!data.some((d) => keys.some((k) => d[k]))) return <Empty title={empty || "No data in this period"} />;
  const c = colors || redPalette(keys);
  const C: any = area ? AreaChart : LineChart; const S: any = area ? Area : Line;
  return <div style={{ height }}><ResponsiveContainer><C data={data}>{grid}<XAxis dataKey="date" tick={tick} tickFormatter={short} minTickGap={24} /><YAxis allowDecimals={false} tick={tick} width={32} /><Tooltip contentStyle={tooltipStyle} labelFormatter={short as any} /><Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
    {keys.map((k) => <S key={k} isAnimationActive={false} type="monotone" dataKey={k} stroke={c[k]} fill={c[k]} fillOpacity={area ? 0.14 : 0} strokeWidth={2} dot={false} name={names?.[k] || k} />)}</C></ResponsiveContainer></div>;
}

export function Donut({ data, center, height = 200 }: { data: { name: string; value: number; color: string }[]; center: React.ReactNode; height?: number }) {
  data = Array.isArray(data) ? data : [];
  const has = data.some((d) => d.value > 0);
  return <div className="relative" style={{ height, width: height }}><ResponsiveContainer><PieChart><Pie isAnimationActive={false} data={has ? data : [{ name: "none", value: 1, color: "#f1d5d5" }]} dataKey="value" innerRadius="64%" outerRadius="100%" stroke="#fff" strokeWidth={2}>{(has ? data : [{ color: "#f1d5d5" }]).map((d: any, i) => <Cell key={i} fill={d.color} />)}</Pie>{has && <Tooltip contentStyle={tooltipStyle} />}</PieChart></ResponsiveContainer>
    <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">{center}</div></div>;
}

/** Minimal single-series bar chart (dark red by default) for categorical data such as KEK versions. */
export function SimpleBars({ data, xKey, yKey, color = "#991b1b", height = 220, empty }: {
  data: any[]; xKey: string; yKey: string; color?: string; height?: number; empty?: string;
}) {
  data = Array.isArray(data) ? data : [];
  if (!data.length) return <Empty title={empty || "No data"} />;
  return <div style={{ height }}><ResponsiveContainer><BarChart data={data}>{grid}
    <XAxis dataKey={xKey} tick={tick} /><YAxis allowDecimals={false} tick={tick} width={32} />
    <Tooltip contentStyle={tooltipStyle} /><Bar isAnimationActive={false} dataKey={yKey} fill={color} radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>;
}
