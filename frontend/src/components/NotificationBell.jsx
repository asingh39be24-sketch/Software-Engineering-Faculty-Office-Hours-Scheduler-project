import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '../services/api.js';
import { invalidate, useQuery } from '../hooks/useQuery.js';
import { useToast } from '../context/ToastContext.jsx';
import { cn } from '../utils/cn.js';
import { NotificationItem } from './NotificationItem.jsx';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const ref = useRef(null);
  // Polls so reminders and other people's actions appear without a reload.
  const { data } = useQuery(() => api.notifications({ limit: 8 }), [], { tags: ['notifications'], pollMs: 30_000 });
  const unread = data?.unreadCount ?? 0;

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus(); } };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const markAll = async () => {
    try {
      await api.readAllNotifications();
      invalidate('notifications');
    } catch (e) {
      toast.error('Couldn’t update notifications', e.message);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        className={cn('relative inline-flex h-8 w-8 items-center justify-center rounded text-ink-600 hover:bg-ink-100 hover:text-ink-900', open && 'bg-ink-100 text-ink-900')}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-marigold-400 px-1 text-[10px] font-semibold text-ink-950" data-tabular>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Recent notifications" className="absolute right-0 top-10 z-40 w-[min(92vw,380px)] animate-rise-in overflow-hidden rounded-md bg-white shadow-pop">
          <div className="flex items-center justify-between border-b border-ink-100 px-3.5 py-2.5">
            <p className="text-sm font-semibold">Notifications</p>
            <button
              type="button"
              onClick={markAll}
              disabled={!unread}
              className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-pine-700 hover:bg-pine-50 disabled:text-ink-400 disabled:hover:bg-transparent"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          </div>
          <div className="scroll-thin max-h-[60vh] overflow-y-auto">
            {!data ? (
              <p className="px-4 py-8 text-center text-sm text-ink-500">Loading…</p>
            ) : data.items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-500">You’re all caught up.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {data.items.map((n) => <li key={n.id}><NotificationItem n={n} compact /></li>)}
              </ul>
            )}
          </div>
          <Link to="/notifications" onClick={() => setOpen(false)} className="block border-t border-ink-100 px-3.5 py-2.5 text-center text-sm font-medium text-ink-700 hover:bg-ink-50">
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
