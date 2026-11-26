import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarX2, MapPin, Search, Video, Users, CalendarClock, ArrowLeftRight } from 'lucide-react';
import { api } from '../../services/api.js';
import { useQuery } from '../../hooks/useQuery.js';
import { CancelNote } from '../../components/CancelNote.jsx';
import { PageHeader, Tabs, BookingStatus, EmptyState, ErrorState, SkeletonRows, Button, ConfirmDialog } from '../../components/ui/index.js';
import { BookingDetailModal, DateBlock, useBookingActions } from '../../components/BookingDetail.jsx';
import { SwapDialog, SwapRequests, WaitlistCard } from '../../components/Swaps.jsx';
import { fmtRange } from '../../utils/format.js';

const TABS = [
  { value: 'upcoming', label: 'Upcoming', key: 'upcoming' },
  { value: 'completed', label: 'Completed', key: 'completed' },
  { value: 'no_show', label: 'No-show', key: 'noShow' },
  { value: 'cancelled', label: 'Cancelled', key: 'cancelled' },
  { value: 'all', label: 'All history', key: 'total' },
];
const EMPTY = {
  upcoming: ['No upcoming appointments', 'Find a faculty member to book your next session.'],
  completed: ['No completed appointments yet', 'Appointments appear here once faculty mark them completed.'],
  no_show: ['No missed appointments', 'Good — keep it that way.'],
  cancelled: ['No cancelled appointments', null],
  all: ['No bookings yet', 'Your full booking history will appear here.'],
};

export default function MyBookings() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('upcoming');
  const [selected, setSelected] = useState(null);
  const [toCancel, setToCancel] = useState(null);
  const [toSwap, setToSwap] = useState(null);
  const actions = useBookingActions();
  const { data, error, loading, refetch } = useQuery(() => api.bookings({ scope: tab }), [tab], { tags: ['bookings'] });
  const counts = useQuery(() => api.studentDashboard(), [], { tags: ['bookings', 'dashboard'] }).data?.counts;
  const items = TABS.map((t) => ({ ...t, count: counts?.[t.key] }));

  // Rescheduling happens on the faculty member's schedule page, in "reschedule" mode.
  const reschedule = (b) => navigate(`/student/faculty/${b.faculty.id}?reschedule=${b.id}`);

  return (
    <>
      <PageHeader title="My bookings" description="Every appointment you’ve made, by status." onRefresh={refetch} refreshing={loading && !!data}
        actions={<Link to="/student/faculty"><Button icon={Search}>Book an appointment</Button></Link>} />
      {tab === 'upcoming' && <><SwapRequests /><WaitlistCard /></>}
      <Tabs label="Booking status" value={tab} onChange={setTab} items={items} className="mb-4" />
      <div className="card overflow-hidden" role="tabpanel" aria-labelledby={`tab-Booking status-${tab}`}>
        {error && !data ? <ErrorState error={error} onRetry={refetch} /> : !data ? <SkeletonRows rows={4} /> : data.bookings.length === 0 ? (
          <EmptyState icon={CalendarX2} title={EMPTY[tab][0]} action={tab === 'upcoming' && <Link to="/student/faculty"><Button variant="secondary" size="sm">Find faculty</Button></Link>}>{EMPTY[tab][1]}</EmptyState>
        ) : (
          <ul className="divide-y divide-ink-100">
            {data.bookings.map((b) => (
              <li key={b.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <DateBlock iso={b.start} muted={!b.isUpcoming || b.status === 'cancelled'} />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{b.faculty.name}</p>
                    <p className="text-sm text-ink-500" data-tabular>{fmtRange(b.start, b.end)} · {b.durationMinutes} min</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-500">
                      {b.where && (
                        <span className="inline-flex items-center gap-1">
                          {b.mode === 'online' ? <Video className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}{b.where}
                        </span>
                      )}
                      {b.capacity > 1 && <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />Group session</span>}
                    </p>
                    <CancelNote booking={b} viewer="student" className="mt-0.5" />
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-[60px] sm:pl-0">
                  <BookingStatus booking={b} />
                  <div className="ml-auto flex flex-wrap justify-end gap-1.5 sm:ml-3">
                    <Button variant="secondary" size="sm" onClick={() => setSelected(b)}>Details</Button>
                    {b.status === 'confirmed' && b.canStudentChange && (
                      <>
                        <Button variant="secondary" size="sm" icon={CalendarClock} onClick={() => reschedule(b)}>Reschedule</Button>
                        <Button variant="secondary" size="sm" icon={ArrowLeftRight} onClick={() => setToSwap(b)}>Swap</Button>
                      </>
                    )}
                    {b.status === 'confirmed' && b.canStudentCancel && (
                      <Button variant="danger" size="sm" onClick={() => setToCancel(b)}>Cancel</Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {selected && (
        <BookingDetailModal
          booking={selected}
          viewer="student"
          onClose={() => setSelected(null)}
          onReschedule={(b) => { setSelected(null); reschedule(b); }}
          onSwap={(b) => { setSelected(null); setToSwap(b); }}
        />
      )}
      {toSwap && <SwapDialog booking={toSwap} onClose={() => setToSwap(null)} />}
      <ConfirmDialog
        open={!!toCancel}
        onClose={() => setToCancel(null)}
        title="Cancel this appointment?"
        description={toCancel && `Your ${fmtRange(toCancel.start, toCancel.end)} appointment with ${toCancel.faculty.name} will be cancelled and the place offered to others.`}
        confirmLabel="Cancel appointment"
        withReason
        onConfirm={async (reason) => { try { await actions.cancel(toCancel, reason); setToCancel(null); } catch { /* toast shown */ } }}
      />
    </>
  );
}
