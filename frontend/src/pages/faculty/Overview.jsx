import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, ClipboardList, CheckCircle2, UserX, CalendarClock, AlertCircle, ArrowRight } from 'lucide-react';
import { api } from '../../services/api.js';
import { useQuery } from '../../hooks/useQuery.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { PageHeader, StatGroup, Stat, Section, EmptyState, ErrorState, SkeletonRows, Button, SlotStatus, BookingStatus } from '../../components/ui/index.js';
import { BookingDetailModal, useBookingActions, canMarkNoShow } from '../../components/BookingDetail.jsx';
import { addDays, fmtDate, fmtRange, fmtTime, startOfLocalDay } from '../../utils/format.js';
import { greeting } from '../student/Overview.jsx';
import { cn } from '../../utils/cn.js';

export default function FacultyOverview() {
  const { user } = useAuth();
  const dayStart = startOfLocalDay().toISOString();
  const dayEnd = addDays(startOfLocalDay(), 1).toISOString();
  const { data, error, loading, refetch } = useQuery(() => api.facultyDashboard({ dayStart, dayEnd }), [dayStart], { tags: ['dashboard', 'bookings', 'slots'] });
  const [selected, setSelected] = useState(null);
  const actions = useBookingActions();
  const c = data?.counts;

  const openBooking = async (bookingId) => {
    try { setSelected((await api.booking(bookingId)).booking); } catch { /* ignore */ }
  };
  const now = Date.now();

  return (
    <>
      <PageHeader
        eyebrow="Faculty"
        title={<span className="font-serif text-3xl font-normal">{greeting()}, {user.name.replace(/^(Dr|Prof)\.?\s+/i, '').split(' ')[0]}.</span>}
        description={!user.department || !user.officeLocation ? <>Add your department and office location in <Link to="/profile" className="link">your profile</Link> so students know where to find you.</> : 'Your schedule and appointments at a glance.'}
        onRefresh={refetch}
        refreshing={loading && !!data}
        actions={<Link to="/faculty/availability"><Button icon={CalendarPlus}>Publish availability</Button></Link>}
      />

      {error && !data ? <div className="card"><ErrorState error={error} onRetry={refetch} /></div> : (
        <div className="space-y-6">
          <StatGroup className="grid-cols-2 lg:grid-cols-4">
            <Stat label="Total appointments" value={c?.total} icon={ClipboardList} loading={!c} sub={c && `${c.cancelled} cancelled`} />
            <Stat label="Upcoming" value={c?.upcoming} icon={CalendarClock} accent="text-cobalt-500" loading={!c} sub={data && `${data.slots.openUpcoming} open slots published`} />
            <Stat label="Completed" value={c?.completed} icon={CheckCircle2} accent="text-pine-600" loading={!c} />
            <Stat label="No-shows" value={c?.noShow} icon={UserX} accent="text-brick-500" loading={!c} sub={c && c.completed + c.noShow ? `${Math.round((c.noShow / (c.completed + c.noShow)) * 100)}% of concluded` : undefined} />
          </StatGroup>

          <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
            <Section title="Today’s schedule" description={new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}>
              {!data ? <SkeletonRows rows={4} /> : data.today.length === 0 ? (
                <EmptyState compact icon={CalendarClock} title="Nothing scheduled today"
                  action={<Link to="/faculty/availability"><Button variant="secondary" size="sm">Publish availability</Button></Link>}>
                  Slots you publish for today will appear here.
                </EmptyState>
              ) : (
                <ol className="px-4 py-3">
                  {data.today.map((s) => {
                    const past = new Date(s.end).getTime() < now;
                    const live = new Date(s.start).getTime() <= now && !past;
                    return (
                      <li key={s.id} className="grid grid-cols-[64px_14px_1fr] gap-2">
                        <span className={cn('pt-2.5 text-right text-sm', past ? 'text-ink-400' : 'text-ink-700')} data-tabular>{fmtTime(s.start)}</span>
                        <span className="relative flex justify-center">
                          <span className="absolute inset-y-0 w-px bg-ink-150" aria-hidden />
                          <span className={cn('relative mt-3.5 h-2 w-2 rounded-full ring-2 ring-white', live ? 'bg-marigold-400' : s.bookingId ? 'bg-cobalt-500' : 'bg-ink-300')} aria-hidden />
                        </span>
                        <div className={cn('my-1 flex items-center justify-between gap-3 rounded border px-3 py-2', s.bookingId ? 'border-ink-150 bg-white' : 'border-dashed border-ink-200 bg-ink-50/50')}>
                          {s.bookingId ? (
                            <button type="button" onClick={() => openBooking(s.bookingId)} className="min-w-0 text-left">
                              <p className="truncate text-sm font-medium hover:underline">{s.studentName}</p>
                              <p className="truncate text-xs text-ink-500">{s.note || s.studentEmail}</p>
                            </button>
                          ) : <p className="text-sm text-ink-500">Open, not booked</p>}
                          <div className="flex shrink-0 items-center gap-2">
                            {live && <span className="text-2xs font-semibold uppercase tracking-wider text-marigold-500">Now</span>}
                            {s.bookingId ? <BookingStatus status={s.bookingStatus === 'confirmed' && past ? 'awaiting' : s.bookingStatus} /> : <SlotStatus status={past ? 'expired' : 'open'} />}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Section>

            <Section title="Needs an outcome" description="Past appointments not yet marked"
              actions={<Link to="/faculty/appointments?tab=awaiting" className="inline-flex items-center gap-1 text-sm font-medium text-pine-700 hover:underline">View all <ArrowRight className="h-3.5 w-3.5" /></Link>}>
              {!data ? <SkeletonRows rows={3} /> : data.awaitingOutcome.length === 0 ? (
                <EmptyState compact icon={CheckCircle2} title="You’re up to date">Every past appointment has an outcome recorded.</EmptyState>
              ) : (
                <ul className="divide-y divide-ink-100">
                  {data.awaitingOutcome.map((b) => (
                    <li key={b.id} className="flex items-center gap-3 px-4 py-3">
                      <AlertCircle className="h-4 w-4 shrink-0 text-marigold-400" aria-hidden />
                      <button type="button" onClick={() => setSelected(b)} className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-medium hover:underline">{b.student.name}</p>
                        <p className="text-xs text-ink-500" data-tabular>{fmtDate(b.start)} · {fmtRange(b.start, b.end)}</p>
                      </button>
                      <div className="flex shrink-0 gap-1">
                        <Button size="xs" variant="secondary" disabled={!canMarkNoShow(b)} loading={actions.pending === `no_show-${b.id}`} onClick={() => actions.noShow(b).catch(() => {})}>No-show</Button>
                        <Button size="xs" loading={actions.pending === `completed-${b.id}`} onClick={() => actions.complete(b).catch(() => {})}>Completed</Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        </div>
      )}
      {selected && <BookingDetailModal booking={selected} viewer="faculty" onClose={() => setSelected(null)} />}
    </>
  );
}
