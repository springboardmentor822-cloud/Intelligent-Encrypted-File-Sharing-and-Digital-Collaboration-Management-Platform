import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

/** Drop-down of all users, for admin report and audit filters. */
export function UserSelect({ value, onChange, label = 'User', id = 'f-user' }) {
  const [users, setUsers] = useState([]);
  useEffect(() => { api.get('/admin/users', { params: { page_size: 100 } }).then((r) => setUsers(r.data.items)).catch(() => {}); }, []);
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All users</option>
        {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
      </select>
    </div>
  );
}

export function SelectField({ id, label, value, onChange, options }) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

/** Drop empty filter values so they are not sent as query parameters. */
export const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v != null));

/** Save rows (an array of flat objects) as a CSV file in the browser. */
export function downloadCsv(filename, rows) {
  if (!rows?.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export const FILE_TYPES = [['', 'All file types'], ['documents', 'Documents'], ['images', 'Images'], ['videos', 'Videos'], ['others', 'Others']];
