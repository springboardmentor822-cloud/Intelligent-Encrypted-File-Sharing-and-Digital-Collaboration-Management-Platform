import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { shortDay } from '@/lib/format';

export const COLORS = {
  documents: '#0b63f3', images: '#12b886', videos: '#f0506e', others: '#9b6cf5',
  direct: '#4c9bff', link: '#12b886', internal: '#9b6cf5',
  success: '#12b886', failed: '#f0506e', unauthorized: '#f0506e', blocked: '#0b63f3',
  total: '#0b63f3', unique_users: '#12b886', shared: '#f0506e',
};
const axis = { fontSize: 11, fill: '#8a95b0' };
const tip = { contentStyle: { borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 8px 24px rgba(15,27,61,.1)' }, labelFormatter: shortDay };

export function ChartCard({ title, right, children, className = '' }) {
  return (
    <section className={`card p-5 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-bold">{title}</h2>{right}
      </div>
      {children}
    </section>
  );
}

export function Donut({ data, center, height = 190 }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const shown = total ? data : [{ name: 'Empty', value: 1, color: '#e8edf7' }];
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={shown} dataKey="value" innerRadius="66%" outerRadius="100%" paddingAngle={total ? 2 : 0} stroke="none">
            {shown.map((d) => <Cell key={d.name} fill={d.color} />)}
          </Pie>
          {total > 0 && <Tooltip formatter={(v, n) => [v, n]} contentStyle={tip.contentStyle} />}
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>
    </div>
  );
}

const cap = (s) => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export function StackedBars({ data, keys, height = 220, stacked = true }) {
  return (
    <ResponsiveContainer height={height}>
      <BarChart data={data} margin={{ left: -18, right: 4, top: 4 }}>
        <CartesianGrid vertical={false} stroke="#eef1f8" />
        <XAxis dataKey="date" tickFormatter={shortDay} tick={axis} tickLine={false} axisLine={false} minTickGap={28} />
        <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip {...tip} cursor={{ fill: 'rgba(11,99,243,.05)' }} />
        <Legend iconType="circle" iconSize={8} formatter={cap} wrapperStyle={{ fontSize: 12 }} />
        {keys.map((k) => <Bar key={k} dataKey={k} stackId={stacked ? 's' : undefined} fill={COLORS[k]} radius={stacked ? 0 : [3, 3, 0, 0]} maxBarSize={14} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Trend({ data, keys, height = 220, area = false }) {
  const Chart = area ? AreaChart : LineChart;
  return (
    <ResponsiveContainer height={height}>
      <Chart data={data} margin={{ left: -18, right: 8, top: 4 }}>
        <CartesianGrid vertical={false} stroke="#eef1f8" />
        <XAxis dataKey="date" tickFormatter={shortDay} tick={axis} tickLine={false} axisLine={false} minTickGap={28} />
        <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip {...tip} />
        <Legend iconType="circle" iconSize={8} formatter={cap} wrapperStyle={{ fontSize: 12 }} />
        {keys.map((k) => area
          ? <Area key={k} type="monotone" dataKey={k} stroke={COLORS[k]} fill={COLORS[k]} fillOpacity={0.12} strokeWidth={2} dot={false} />
          : <Line key={k} type="monotone" dataKey={k} stroke={COLORS[k]} strokeWidth={2} dot={false} />)}
      </Chart>
    </ResponsiveContainer>
  );
}
