import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { isoDate } from '@/lib/format';

const make = (days) => { const end = new Date(); const start = new Date(); start.setDate(end.getDate() - (days - 1)); return { start: isoDate(start), end: isoDate(end) }; };

export function useRange(days = 30) {
  const [range, setRange] = useState(() => make(days));
  return [range, setRange];
}

export function DateRange({ range, onChange }) {
  const preset = (d) => onChange(make(d));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5">
        <CalendarDays className="h-4 w-4 text-ink-faint" aria-hidden="true" />
        <input type="date" aria-label="Start date" className="bg-transparent text-sm focus:outline-none" value={range.start} max={range.end}
          onChange={(e) => e.target.value && onChange({ ...range, start: e.target.value })} />
        <span className="text-ink-faint">–</span>
        <input type="date" aria-label="End date" className="bg-transparent text-sm focus:outline-none" value={range.end} min={range.start} max={isoDate(new Date())}
          onChange={(e) => e.target.value && onChange({ ...range, end: e.target.value })} />
      </div>
      {[7, 30, 90].map((d) => <button key={d} className="btn-secondary !px-3 !py-1.5 !text-xs" onClick={() => preset(d)}>Last {d} days</button>)}
    </div>
  );
}
