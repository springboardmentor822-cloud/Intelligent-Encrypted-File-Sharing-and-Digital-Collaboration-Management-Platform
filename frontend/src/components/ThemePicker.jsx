// Little palette button in the header: pick a colour theme (saved in the browser).
import { useState } from "react";
import { Check, Palette } from "lucide-react";
import { THEMES, useTheme } from "../lib/theme";

export default function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button className="rounded-xl border border-paper-300 bg-white p-2.5 text-slate-600 transition hover:border-brand-300 hover:text-brand-700" title="Change colour theme" onClick={() => setOpen(!open)}>
        <Palette size={18} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-64 rounded-2xl border border-paper-200 bg-white p-2 shadow-2xl">
            <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Colour theme</div>
            {Object.entries(THEMES).map(([id, t]) => (
              <button key={id} onClick={() => { setTheme(id); setOpen(false); }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-paper-100 ${theme === id ? "bg-brand-50" : ""}`}>
                <span className="flex -space-x-1.5">{t.swatch.map((c) => <span key={c} className="h-5 w-5 rounded-full ring-2 ring-white" style={{ background: c }} />)}</span>
                <span className="flex-1"><span className="block text-sm font-semibold text-ink-950">{t.name}</span><span className="text-xs text-slate-500">{t.sub}</span></span>
                {theme === id && <Check size={16} className="text-brand-600" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
