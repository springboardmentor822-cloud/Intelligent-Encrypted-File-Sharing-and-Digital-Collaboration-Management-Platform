import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import clsx from 'clsx';
import { Bell, CheckCheck } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { formatDate, timeAgo } from '@/lib/format';
import { useToast } from './Toast';
import { Badge, EmptyState, ErrorNote, PageLoader } from './ui';

const TONE = { share: 'blue', download: 'purple', access: 'amber', security: 'red', expiry: 'amber', system: 'slate' };

/** Task 3: full notification history with read/unread state. */
export default function NotificationsPage() {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('all');
  const [error, setError] = useState('');
  const load = useCallback(() => api.get('/notifications', { params: { limit: 100 } }).then((r) => setData(r.data)).catch((e) => setError(errorMessage(e))), []);
  useEffect(() => { load(); }, [load]);

  const read = async (n) => { if (!n.is_read) { await api.post(`/notifications/${n.id}/read`).catch(() => {}); load(); } };
  const open = async (n) => { await read(n); if (n.link) router.push(n.link); };
  const readAll = async () => { try { await api.post('/notifications/read-all'); toast('All notifications marked as read'); load(); } catch (e) { toast(errorMessage(e), 'error'); } };

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <PageLoader />;
  const items = tab === 'unread' ? data.items.filter((n) => !n.is_read) : data.items;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1" role="tablist">
          {[['all', 'All'], ['unread', `Unread (${data.unread})`]].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={clsx('rounded-lg px-4 py-2 text-sm font-semibold', tab === k ? 'bg-white shadow-sm' : 'text-ink-soft')}>{l}</button>)}
        </div>
        <button className="btn-secondary" onClick={readAll} disabled={!data.unread}><CheckCheck className="h-4 w-4" />Mark all as read</button>
      </div>
      <div className="card overflow-hidden">
        {items.length === 0 ? <EmptyState icon={Bell} title={tab === 'unread' ? 'No unread notifications' : 'No notifications yet'} hint="Shares, downloads, security alerts and link reminders will appear here." /> : (
          <ul className="divide-y divide-slate-100">{items.map((n) => (
            <li key={n.id} className={clsx('flex items-start gap-4 px-5 py-4', !n.is_read && 'bg-brand-50/40')}>
              <span className={clsx('mt-2 h-2.5 w-2.5 shrink-0 rounded-full', n.is_read ? 'bg-transparent' : 'bg-brand-600')} aria-label={n.is_read ? 'Read' : 'Unread'} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{n.title}</span><Badge tone={TONE[n.type] || 'slate'}>{n.type}</Badge></div>
                <p className="mt-0.5 text-sm text-ink-soft">{n.message}</p>
                <p className="mt-1 text-xs text-ink-faint" title={formatDate(n.created_at, true)}>{formatDate(n.created_at, true)} · {timeAgo(n.created_at)}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                {n.link && <button className="btn-secondary !px-3 !py-1.5 !text-xs" onClick={() => open(n)}>Open</button>}
                {!n.is_read && <button className="btn-ghost !px-3 !py-1.5 !text-xs" onClick={() => read(n)}>Mark read</button>}
              </div>
            </li>))}</ul>)}
      </div>
      <p className="text-xs text-ink-faint">Showing your latest 100 notifications.</p>
    </div>
  );
}
