import { useState } from 'react';
import { CheckCheck, Inbox } from 'lucide-react';
import { api } from '../services/api.js';
import { invalidate, useQuery } from '../hooks/useQuery.js';
import { useToast } from '../context/ToastContext.jsx';
import { PageHeader, Tabs, Button, EmptyState, ErrorState, SkeletonRows } from '../components/ui/index.js';
import { NotificationItem } from '../components/NotificationItem.jsx';

export default function Notifications() {
  const [filter, setFilter] = useState('all');
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const { data, error, loading, refetch } = useQuery(() => api.notifications({ unread: filter === 'unread' ? 1 : undefined, limit: 100 }), [filter], { tags: ['notifications'] });
  const markAll = async () => {
    setBusy(true);
    try {
      const r = await api.readAllNotifications();
      toast.success(r.updated ? `Marked ${r.updated} as read` : 'Nothing to mark');
      invalidate('notifications');
    } catch (e) {
      toast.error('Couldn’t update notifications', e.message);
    } finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader title="Notifications" description="Bookings, reminders, cancellations and outcomes." onRefresh={refetch} refreshing={loading && !!data}
        actions={<Button variant="secondary" icon={CheckCheck} onClick={markAll} loading={busy} disabled={!data?.unreadCount}>Mark all read</Button>} />
      <Tabs label="Notification filter" value={filter} onChange={setFilter} className="mb-4"
        items={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread', count: data?.unreadCount }]} />
      <div className="card overflow-hidden">
        {error && !data ? <ErrorState error={error} onRetry={refetch} /> : !data ? <SkeletonRows rows={5} /> : data.items.length === 0 ? (
          <EmptyState icon={Inbox} title={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}>You’ll be notified about bookings, reminders and changes here.</EmptyState>
        ) : (
          <ul className="divide-y divide-ink-100">{data.items.map((n) => <li key={n.id}><NotificationItem n={n} /></li>)}</ul>
        )}
      </div>
    </>
  );
}
