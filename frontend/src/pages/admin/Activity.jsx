import { Mail, BellRing, Timer, ShieldCheck, Activity as ActivityIcon } from 'lucide-react';
import { api } from '../../services/api.js';
import { useQuery } from '../../hooks/useQuery.js';
import { PageHeader, Section, Badge, BookingStatus, EmptyState, ErrorState, SkeletonRows } from '../../components/ui/index.js';
import { fmtDateTime, fmtRelative, fmtDate, fmtTime } from '../../utils/format.js';

const ACTION = {
  'user.registered': 'registered', 'user.created_by_admin': 'created an account', 'user.login': 'signed in',
  'user.activated': 'reactivated an account', 'user.deactivated': 'deactivated an account', 'user.profile_updated': 'updated their profile',
  'user.password_changed': 'changed their password', 'slots.published': 'published availability', 'slot.cancelled': 'withdrew a slot',
  'booking.created': 'booked an appointment', 'booking.cancelled': 'cancelled an appointment', 'booking.completed': 'marked an appointment completed',
  'booking.no_show': 'recorded a no-show',
};

function Time({ iso }) {
  return <time dateTime={iso} title={fmtDateTime(iso)} className="shrink-0 text-xs text-ink-400">{fmtRelative(iso)}</time>;
}

export default function Activity() {
  const { data, error, loading, refetch } = useQuery(() => api.monitoring(), [], { tags: ['analytics', 'users', 'bookings'], pollMs: 30_000 });
  if (error && !data) return <div className="card"><ErrorState error={error} onRetry={refetch} /></div>;
  const sys = data?.system;
  return (
    <>
      <PageHeader title="System activity" description="Recent events across the platform. Updates every 30 seconds." onRefresh={refetch} refreshing={loading && !!data} />

      <div className="mb-6 grid gap-px overflow-hidden rounded-md border border-ink-150 bg-ink-150 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [Mail, 'Email delivery', sys ? (sys.emailConfigured ? <Badge tone="pine" dot>Configured</Badge> : <Badge tone="neutral" dot>Not configured</Badge>) : null, sys && !sys.emailConfigured ? 'In-app notifications only' : 'SMTP'],
          [BellRing, 'Reminders', sys && `${sys.reminderLeadMinutes} min before`, 'In-app, to both parties'],
          [Timer, 'Student cancellation', sys && `Until ${sys.cancellationCutoffMinutes} min before`, 'Cut-off window'],
          [ShieldCheck, 'Admin self-registration', sys ? (sys.adminSelfRegistration ? <Badge tone="marigold" dot>Access code</Badge> : <Badge tone="pine" dot>Disabled</Badge>) : null, 'Public sign-up'],
        ].map(([Icon, label, value, sub]) => (
          <div key={label} className="bg-white px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs text-ink-500"><Icon className="h-3.5 w-3.5" />{label}</p>
            <div className="mt-1.5 text-sm font-medium text-ink-900">{value ?? <span className="skeleton inline-block h-4 w-20" />}</div>
            <p className="mt-0.5 text-xs text-ink-400">{sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Recent bookings">
          {!data ? <SkeletonRows rows={4} /> : data.recentBookings.length === 0 ? <EmptyState compact title="No bookings yet" /> : (
            <ul className="divide-y divide-ink-100">
              {data.recentBookings.map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate"><span className="font-medium">{b.studentName}</span> <span className="text-ink-500">with</span> {b.facultyName}</p>
                    <p className="text-xs text-ink-500" data-tabular>For {fmtDate(b.start)}, {fmtTime(b.start)}</p>
                  </div>
                  <BookingStatus status={b.status} />
                  <Time iso={b.bookedAt} />
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Recent registrations">
          {!data ? <SkeletonRows rows={4} /> : (
            <ul className="divide-y divide-ink-100">
              {data.recentRegistrations.map((u) => (
                <li key={u.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{u.name}</p>
                    <p className="truncate text-xs text-ink-500">{u.email}</p>
                  </div>
                  <Badge tone={u.role === 'faculty' ? 'pine' : u.role === 'admin' ? 'marigold' : 'outline'}>{u.role}</Badge>
                  <Time iso={u.createdAt} />
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Recent cancellations">
          {!data ? <SkeletonRows rows={3} /> : data.recentCancellations.length === 0 ? <EmptyState compact title="No cancellations" /> : (
            <ul className="divide-y divide-ink-100">
              {data.recentCancellations.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate"><span className="font-medium">{c.studentName}</span> <span className="text-ink-500">with</span> {c.facultyName}</p>
                    <p className="truncate text-xs text-ink-500">Cancelled by {c.cancelledBy}{c.reason ? ` · “${c.reason}”` : ''}</p>
                  </div>
                  <Time iso={c.cancelledAt} />
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Activity log" bodyClassName="scroll-thin max-h-[420px] overflow-y-auto">
          {!data ? <SkeletonRows rows={6} /> : data.activity.length === 0 ? <EmptyState compact icon={ActivityIcon} title="No activity yet" /> : (
            <ol className="divide-y divide-ink-100">
              {data.activity.map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p><span className="font-medium">{a.actorName || 'System'}</span> <span className="text-ink-600">{ACTION[a.action] || a.action}</span></p>
                    {a.details && !a.action.startsWith('user.') && <p className="truncate text-xs text-ink-400">{a.details.replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, (m) => fmtDateTime(m))}</p>}
                  </div>
                  <Time iso={a.createdAt} />
                </li>
              ))}
            </ol>
          )}
        </Section>
      </div>
    </>
  );
}
