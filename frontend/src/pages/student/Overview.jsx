import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarCheck, CalendarClock, CheckCircle2, UserX, MapPin, Search, Clock } from 'lucide-react';
import { api } from '../../services/api.js';
import { useQuery } from '../../hooks/useQuery.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { PageHeader, StatGroup, Stat, Section, EmptyState, ErrorState, SkeletonRows, Avatar, BookingStatus } from '../../components/ui/index.js';
import { BookingDetailModal, DateBlock } from '../../components/BookingDetail.jsx';
import { fmtDateLong, fmtRange, fmtRelative, fmtDate } from '../../utils/format.js';

const ACTION_TEXT = {
  'user.registered': 'Created your account',
  'booking.created': 'Booked an appointment',
  'booking.cancelled': 'Cancelled an appointment',
  'user.profile_updated': 'Updated your profile',
  'user.password_changed': 'Changed your password',
};

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function StudentOverview() {
  const { user } = useAuth();
  const { data, error, loading, refetch } = useQuery(() => api.studentDashboard(), [], { tags: ['dashboard', 'bookings'] });
  const [selected, setSelected] = useState(null);
  const next = data?.nextAppointment;
  const c = data?.counts;

  return (
    <>
      <PageHeader
        eyebrow="Student"
        title={<span className="font-serif text-3xl font-normal">{greeting()}, {user.name.split(' ')[0]}.</span>}
        description="Here’s where your office-hour appointments stand."
        onRefresh={refetch}
        refreshing={loading && !!data}
      />

      {error && !data ? <div className="card"><ErrorState error={error} onRetry={refetch} /></div> : (
        <div className="space-y-6">
          {/* Next appointment */}
          <section aria-labelledby="next-h" className="overflow-hidden rounded-md border border-ink-150 bg-white shadow-xs">
            <div className="grid md:grid-cols-[1fr_auto]">
              <div className="p-5">
                <p id="next-h" className="label-caps">Next appointment</p>
                {!data ? <div className="skeleton mt-3 h-14 w-2/3" /> : next ? (
                  <div className="mt-3 flex items-start gap-4">
                    <Avatar name={next.faculty.name} size="xl" className="hidden sm:inline-flex" />
                    <div className="min-w-0">
                      <p className="text-xl font-semibold tracking-tight">{next.faculty.name}</p>
                      <p className="mt-0.5 text-sm text-ink-500">{[next.faculty.designation, next.faculty.department].filter(Boolean).join(' · ')}</p>
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-700">
                        <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-4 w-4 text-ink-400" />{fmtDateLong(next.start)}</span>
                        <span className="inline-flex items-center gap-1.5" data-tabular><Clock className="h-4 w-4 text-ink-400" />{fmtRange(next.start, next.end)}</span>
                        {next.faculty.officeLocation && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-ink-400" />{next.faculty.officeLocation}</span>}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3">
                    <p className="text-lg font-medium">Nothing booked yet.</p>
                    <p className="mt-1 text-sm text-ink-500">Find a faculty member and reserve a time that suits you.</p>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 border-t border-ink-100 bg-ink-50/70 px-5 py-4 md:flex-col md:items-stretch md:justify-center md:border-l md:border-t-0">
                {next && <p className="text-sm font-medium text-pine-700 md:text-center">Starts {fmtRelative(next.start)}</p>}
                {next ? (
                  <button onClick={() => setSelected(next)} className="inline-flex h-9 items-center justify-center rounded border border-ink-200 bg-white px-3.5 text-sm font-medium hover:bg-ink-50">View details</button>
                ) : null}
                <Link to="/student/faculty" className="inline-flex h-9 items-center justify-center gap-1.5 rounded bg-pine-700 px-3.5 text-sm font-medium text-white hover:bg-pine-800">
                  <Search className="h-3.5 w-3.5" /> Find faculty
                </Link>
              </div>
            </div>
          </section>

          <StatGroup className="grid-cols-2 lg:grid-cols-4">
            <Stat label="Total bookings" value={c?.total} icon={CalendarCheck} loading={!c} sub={c && `${c.cancelled} cancelled`} />
            <Stat label="Pending (upcoming)" value={c?.upcoming} icon={CalendarClock} accent="text-cobalt-500" loading={!c} sub={c?.awaitingOutcome ? `${c.awaitingOutcome} awaiting outcome` : 'Confirmed, not yet held'} />
            <Stat label="Completed" value={c?.completed} icon={CheckCircle2} accent="text-pine-600" loading={!c} />
            <Stat label="No-shows" value={c?.noShow} icon={UserX} accent="text-brick-500" loading={!c} />
          </StatGroup>

          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Section title="Upcoming" actions={<Link to="/student/bookings" className="inline-flex items-center gap-1 text-sm font-medium text-pine-700 hover:underline">All bookings <ArrowRight className="h-3.5 w-3.5" /></Link>}>
              {!data ? <SkeletonRows rows={3} /> : data.upcoming.length === 0 ? (
                <EmptyState compact icon={CalendarClock} title="No upcoming appointments">Booked appointments will appear here.</EmptyState>
              ) : (
                <ul className="divide-y divide-ink-100">
                  {data.upcoming.map((b) => (
                    <li key={b.id}>
                      <button onClick={() => setSelected(b)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-ink-50">
                        <DateBlock iso={b.start} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{b.faculty.name}</p>
                          <p className="text-sm text-ink-500" data-tabular>{fmtRange(b.start, b.end)}{b.faculty.officeLocation && ` · ${b.faculty.officeLocation}`}</p>
                        </div>
                        <BookingStatus booking={b} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Recent activity">
              {!data ? <SkeletonRows rows={4} /> : data.recentActivity.length === 0 ? (
                <EmptyState compact title="No activity yet" />
              ) : (
                <ol className="px-4 py-2">
                  {data.recentActivity.map((a) => (
                    <li key={a.id} className="relative flex gap-3 py-2 pl-4 before:absolute before:left-0 before:top-[13px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-ink-300">
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="text-ink-800">{ACTION_TEXT[a.action] || a.action}</p>
                        {a.action.startsWith('booking') && a.details && <p className="truncate text-xs text-ink-500">{a.details.replace(/ at \S+$/, '')}</p>}
                      </div>
                      <time className="shrink-0 text-xs text-ink-400" dateTime={a.createdAt} title={fmtDate(a.createdAt)}>{fmtRelative(a.createdAt)}</time>
                    </li>
                  ))}
                </ol>
              )}
            </Section>
          </div>
        </div>
      )}
      {selected && <BookingDetailModal booking={selected} viewer="student" onClose={() => setSelected(null)} />}
    </>
  );
}
