import { BellRing, CalendarCheck2, CalendarX2, CircleCheck, UserRound, CalendarPlus } from 'lucide-react';
import { api } from '../services/api.js';
import { invalidate } from '../hooks/useQuery.js';
import { useToast } from '../context/ToastContext.jsx';
import { cn } from '../utils/cn.js';
import { fmtRelative, fmtDateTime } from '../utils/format.js';

const ICON = {
  booking_confirmed: [CalendarCheck2, 'text-cobalt-500'],
  booking_received: [CalendarPlus, 'text-cobalt-500'],
  reminder: [BellRing, 'text-marigold-500'],
  booking_cancelled: [CalendarX2, 'text-brick-500'],
  outcome_recorded: [CircleCheck, 'text-pine-600'],
  account: [UserRound, 'text-ink-500'],
};

export function NotificationItem({ n, compact }) {
  const toast = useToast();
  const [Icon, color] = ICON[n.type] || ICON.account;
  const markRead = async () => {
    if (n.isRead) return;
    try {
      await api.readNotification(n.id);
      invalidate('notifications');
    } catch (e) {
      toast.error('Couldn’t mark as read', e.message);
    }
  };
  return (
    <div className={cn('group flex gap-3', compact ? 'px-3.5 py-3' : 'px-4 py-3.5', !n.isRead && 'bg-pine-50/40')}>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', color)} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className={cn('text-sm', n.isRead ? 'text-ink-700' : 'font-semibold text-ink-900')}>{n.title}</p>
          <time dateTime={n.createdAt} title={fmtDateTime(n.createdAt)} className="shrink-0 text-2xs text-ink-400">{fmtRelative(n.createdAt)}</time>
        </div>
        <p className={cn('mt-0.5 text-sm text-ink-600', compact && 'line-clamp-2')}>{n.message}</p>
        {!n.isRead && (
          <button type="button" onClick={markRead} className="mt-1 text-xs font-medium text-pine-700 hover:underline">
            Mark as read
          </button>
        )}
      </div>
      {!n.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-pine-500" aria-label="Unread" />}
    </div>
  );
}
