// Tab bar shared by the two pages of the admin Security Dashboard.
import { NavLink } from "react-router-dom";
import { Radar, ShieldCheck } from "lucide-react";

export default function SecurityTabs({ openThreats = 0 }) {
  const cls = ({ isActive }) =>
    `flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${isActive ? "bg-white text-brand-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}`;
  return (
    <div className="inline-flex rounded-2xl bg-paper-200/70 p-1">
      <NavLink to="/admin/security" end className={cls}><ShieldCheck size={16} /> Overview</NavLink>
      <NavLink to="/admin/security/threats" className={cls}>
        <Radar size={16} /> Threat Monitor
        {openThreats > 0 && <span className="rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">{openThreats}</span>}
      </NavLink>
    </div>
  );
}
