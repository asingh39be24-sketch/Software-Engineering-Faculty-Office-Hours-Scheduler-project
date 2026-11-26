import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, MapPin, Mail, CalendarX, Clock, CalendarDays, CheckCircle2, Video, Users, Hourglass, CalendarClock } from 'lucide-react';
import { api } from '../../services/api.js';
import { invalidate, useQuery } from '../../hooks/useQuery.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Avatar, Button, EmptyState, ErrorState, Modal, Skeleton, Textarea } from '../../components/ui/index.js';
import { BOOKING_TAGS } from '../../components/BookingDetail.jsx';
import { addDays, dayKey, fmtDateLong, fmtRange, fmtTime, startOfLocalDay, timeOfDay, plural } from '../../utils/format.js';
import { cn } from '../../utils/cn.js';

const DAYS_SHOWN = 7;
const PERIODS = [['morning', 'Morning'], ['afternoon', 'Afternoon'], ['evening', 'Evening']];
// Errors that mean "this particular slot can't be taken any more" (as opposed to a limit or a clash).
const SLOT_GONE = ['SLOT_UNAVAILABLE', 'SLOT_IN_PAST', 'FACULTY_INACTIVE'];

const groupByDay = (slots) => {
  const m = new Map();
  for (const s of slots || []) {
    const k = dayKey(s.start);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(s);
  }
  return m;
};

export default function FacultySchedule() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const { data, error, refetch } = useQuery(() => api.facultyDetail(id), [id], { tags: ['slots'], pollMs: 30_000 });
  const [weekStart, setWeekStart] = useState(() => startOfLocalDay());
  const [pick, setPick] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [queueBusy, setQueueBusy] = useState(null);
  const [justBooked, setJustBooked] = useState(null);

  // "Reschedule mode": opened from My bookings with ?reschedule=<booking id>.
  const rescheduleId = params.get('reschedule');
  const resched = useQuery(() => api.booking(rescheduleId), [rescheduleId], { enabled: !!rescheduleId });
  const moving = resched.data?.booking;

  const byDay = useMemo(() => groupByDay(data?.faculty.slots), [data]);
  const fullByDay = useMemo(() => groupByDay(data?.faculty.fullSlots), [data]);

  const selectedDay = params.get('date') || dayKey(new Date());
  const setDay = (k) => { const p = new URLSearchParams(params); p.set('date', k); setParams(p, { replace: true }); };

  // Keep the selected day visible in the strip.
  useEffect(() => {
    const sel = new Date(`${selectedDay}T00:00`);
    if (sel < weekStart || sel >= addDays(weekStart, DAYS_SHOWN)) {
      const today = startOfLocalDay();
      setWeekStart(sel < today ? today : startOfLocalDay(sel));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay]);

  const days = Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(weekStart, i));
  const daySlots = byDay.get(selectedDay) || [];
  const dayFull = moving || rescheduleId ? [] : fullByDay.get(selectedDay) || [];
  const nextDayWithSlots = [...byDay.keys()].sort().find((k) => k > selectedDay);
  const canGoBack = weekStart > startOfLocalDay();

  const book = async () => {
    setBusy(true);
    try {
      if (moving) {
        const { booking } = await api.rescheduleBooking(moving.id, pick.id, note.trim() || undefined);
        toast.success('Appointment rescheduled', `${fmtDateLong(booking.start)}, ${fmtRange(booking.start, booking.end)}`);
        invalidate(BOOKING_TAGS, 'swaps', 'waitlist');
        navigate('/student/bookings');
        return;
      }
      const { booking } = await api.book(pick.id, note.trim() || undefined);
      setJustBooked(booking);
      toast.success('Booking confirmed', `${fmtDateLong(booking.start)}, ${fmtRange(booking.start, booking.end)}`);
      setPick(null);
      setNote('');
    } catch (e) {
      if (SLOT_GONE.includes(e.code) || e.status === 404) {
        toast.error('That slot is no longer available', e.message + '. The list has been refreshed.');
        setPick(null);
      } else {
        toast.error(moving ? 'Couldn’t reschedule' : 'Booking failed', e.message);
      }
    } finally {
      setBusy(false);
      invalidate(BOOKING_TAGS);
      refetch({ silent: true });
    }
  };

  const joinQueue = async (s) => {
    setQueueBusy(s.id);
    try {
      const { waitlist } = await api.joinWaitlist(s.id);
      toast.success('You’re on the waitlist', `Number ${waitlist.position} in line. You’ll be booked automatically if a place opens up.`);
    } catch (e) {
      toast.error('Couldn’t join the waitlist', e.message);
    } finally {
      setQueueBusy(null);
      invalidate('waitlist', 'slots');
      refetch({ silent: true });
    }
  };

  const leaveQueue = async (s) => {
    setQueueBusy(s.id);
    try {
      await api.leaveWaitlist(s.id);
      toast.success('Removed from the waitlist');
    } catch (e) {
      toast.error('Couldn’t leave the waitlist', e.message);
    } finally {
      setQueueBusy(null);
      invalidate('waitlist', 'slots');
      refetch({ silent: true });
    }
  };

  if (error && !data) return <div className="card"><ErrorState error={error} onRetry={refetch} /></div>;
  const f = data?.faculty;

  return (
    <>
      <Link to="/student/faculty" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> All faculty
      </Link>

      <div className="card mb-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        {!f ? <Skeleton className="h-14 w-72" /> : (
          <>
            <Avatar name={f.name} size="xl" />
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold tracking-tight">{f.name}</h1>
              <p className="text-sm text-ink-500">{[f.designation, f.department].filter(Boolean).join(' · ') || 'Faculty'}</p>
              {f.bio && <p className="mt-2 max-w-2xl text-sm text-ink-700">{f.bio}</p>}
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-600">
                {f.officeLocation && <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-ink-400" />{f.officeLocation}</span>}
                <a href={`mailto:${f.email}`} className="inline-flex items-center gap-1.5 hover:text-ink-900"><Mail className="h-3.5 w-3.5 text-ink-400" />{f.email}</a>
              </div>
            </div>
            <div className="text-sm text-ink-500 sm:text-right">
              <p className="text-2xl font-semibold text-ink-900" data-tabular>{f.slots.length}</p>
              <p>open {f.slots.length === 1 ? 'slot' : 'slots'}</p>
            </div>
          </>
        )}
      </div>

      {rescheduleId && (
        <div role="status" className="mb-4 flex flex-col gap-2 rounded-md border border-cobalt-200 bg-cobalt-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          {resched.error ? (
            <p className="text-sm text-brick-700">Couldn’t load the appointment to reschedule: {resched.error.message}</p>
          ) : (
            <p className="flex items-center gap-2 text-sm text-ink-900">
              <CalendarClock className="h-4 w-4 text-cobalt-500" />
              {moving
                ? <>Rescheduling your {fmtDateLong(moving.start)}, {fmtRange(moving.start, moving.end)} appointment. Pick a new time below.</>
                : 'Loading your appointment…'}
            </p>
          )}
          <Link to="/student/bookings" className="text-sm font-medium text-cobalt-700 underline-offset-2 hover:underline">Keep the current time</Link>
        </div>
      )}

      {justBooked && (
        <div role="status" className="mb-4 flex flex-col gap-2 rounded-md border border-pine-200 bg-pine-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm text-pine-900">
            <CheckCircle2 className="h-4 w-4 text-pine-600" />
            Booked for {fmtDateLong(justBooked.start)}, {fmtRange(justBooked.start, justBooked.end)}.
          </p>
          <Link to="/student/bookings" className="text-sm font-medium text-pine-800 underline-offset-2 hover:underline">View in My bookings</Link>
        </div>
      )}

      <section className="card" aria-label="Choose a date and time">
        <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
          <h2 className="text-sm font-semibold">Choose a date</h2>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setWeekStart(addDays(weekStart, -DAYS_SHOWN))} disabled={!canGoBack}
              className="rounded p-1.5 text-ink-500 hover:bg-ink-100 disabled:opacity-30" aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => setWeekStart(addDays(weekStart, DAYS_SHOWN))}
              className="rounded p-1.5 text-ink-500 hover:bg-ink-100" aria-label="Next week"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 p-2 sm:gap-2 sm:p-3" role="radiogroup" aria-label="Dates">
          {days.map((d) => {
            const k = dayKey(d);
            const n = byDay.get(k)?.length || 0;
            const nFull = rescheduleId ? 0 : fullByDay.get(k)?.length || 0;
            const active = k === selectedDay;
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={`${fmtDateLong(d)}, ${plural(n, 'open slot')}${nFull ? `, ${plural(nFull, 'full slot')}` : ''}`}
                onClick={() => setDay(k)}
                className={cn(
                  'flex flex-col items-center rounded border px-1 py-2 transition-colors',
                  active ? 'border-ink-900 bg-ink-900 text-white' : n ? 'border-ink-150 bg-white hover:border-ink-300' : 'border-transparent text-ink-400 hover:bg-ink-50'
                )}
              >
                <span className={cn('text-2xs font-medium uppercase tracking-wider', active ? 'text-ink-300' : 'text-ink-500')}>{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                <span className="text-lg font-semibold leading-7" data-tabular>{d.getDate()}</span>
                <span className={cn('mt-0.5 h-1.5 w-1.5 rounded-full', n ? (active ? 'bg-marigold-300' : 'bg-pine-500') : nFull ? 'bg-marigold-300' : 'bg-transparent')} aria-hidden />
              </button>
            );
          })}
        </div>

        <div className="border-t border-ink-100 px-4 py-4">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold">{fmtDateLong(`${selectedDay}T12:00`)}</h3>
            <span className="text-xs text-ink-500">Times shown in your time zone</span>
          </div>
          {!data ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : daySlots.length === 0 ? (
            <EmptyState compact icon={CalendarX} title="No open slots on this day"
              action={nextDayWithSlots && <Button variant="secondary" size="sm" onClick={() => setDay(nextDayWithSlots)}>Jump to {fmtDateLong(`${nextDayWithSlots}T12:00`)}</Button>}>
              {dayFull.length ? 'Everything on this day is full. You can join a waitlist below.' : nextDayWithSlots ? 'There’s availability on a later date.' : 'This faculty member has no other open slots right now.'}
            </EmptyState>
          ) : (
            <div className="space-y-4">
              {PERIODS.map(([key, label]) => {
                const list = daySlots.filter((s) => timeOfDay(s.start) === key);
                if (!list.length) return null;
                return (
                  <div key={key}>
                    <p className="label-caps mb-2">{label}</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                      {list.map((s) => {
                        const mine = s.viewerBooked;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            data-slot-id={s.id}
                            disabled={mine}
                            onClick={() => setPick(s)}
                            className={cn(
                              'group flex h-11 items-center justify-between gap-2 rounded border px-3 text-sm font-medium transition-colors',
                              mine
                                ? 'cursor-not-allowed border-ink-150 bg-ink-50 text-ink-400'
                                : 'border-pine-200 bg-pine-50/60 text-pine-800 hover:border-pine-600 hover:bg-pine-700 hover:text-white'
                            )}
                            aria-label={mine ? `Your booking, ${fmtRange(s.start, s.end)}` : `Book ${fmtRange(s.start, s.end)}${s.mode === 'online' ? ', online' : ''}`}
                          >
                            <span data-tabular>{fmtTime(s.start)}</span>
                            <span className={cn('inline-flex items-center gap-1 text-xs font-normal', mine ? 'text-ink-400' : 'text-pine-600 group-hover:text-pine-100')}>
                              {s.mode === 'online' && <Video className="h-3 w-3" aria-hidden />}
                              {mine ? 'Yours' : s.capacity > 1 ? `${s.spotsLeft} left` : `${s.durationMinutes} min`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {dayFull.length > 0 && (
            <div className="mt-6 border-t border-ink-100 pt-4">
              <p className="label-caps mb-1">Full</p>
              <p className="mb-3 text-xs text-ink-500">These are taken. Join the waitlist and you’ll be booked automatically if a place opens up.</p>
              <ul className="divide-y divide-ink-100 rounded border border-ink-150">
                {dayFull.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-sm">
                    <span className="w-28 shrink-0 text-ink-800" data-tabular>{fmtRange(s.start, s.end)}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-ink-500">
                      {s.waitlistCount ? `${plural(s.waitlistCount, 'student')} waiting` : 'No one waiting yet'}
                    </span>
                    {s.viewerBooked ? (
                      <span className="text-xs font-medium text-pine-700">Your booking</span>
                    ) : s.waitlistPosition ? (
                      <>
                        <span className="text-xs font-medium text-marigold-600">Number {s.waitlistPosition} in line</span>
                        <Button size="xs" variant="secondary" loading={queueBusy === s.id} onClick={() => leaveQueue(s)}>Leave</Button>
                      </>
                    ) : (
                      <Button size="xs" variant="secondary" icon={Hourglass} loading={queueBusy === s.id} onClick={() => joinQueue(s)}>Join waitlist</Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <Modal
        open={!!pick}
        onClose={() => !busy && setPick(null)}
        closeDisabled={busy}
        title={moving ? 'Confirm your new time' : 'Confirm your booking'}
        description={moving ? 'Your current appointment is released as soon as you confirm.' : 'Check the details, then confirm to reserve this slot.'}
        footer={<><Button variant="secondary" onClick={() => setPick(null)} disabled={busy}>Back</Button><Button onClick={book} loading={busy} data-autofocus>{moving ? 'Confirm new time' : 'Confirm booking'}</Button></>}
      >
        {pick && f && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded border border-ink-150 bg-ink-50 p-3">
              <Avatar name={f.name} size="lg" />
              <div>
                <p className="font-semibold">{f.name}</p>
                <p className="text-sm text-ink-500">{[f.designation, f.department].filter(Boolean).join(' · ')}</p>
              </div>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="flex items-center gap-1.5 text-ink-500"><CalendarDays className="h-4 w-4" />Date</dt><dd className="font-medium">{fmtDateLong(pick.start)}</dd>
              <dt className="flex items-center gap-1.5 text-ink-500"><Clock className="h-4 w-4" />Time</dt><dd className="font-medium" data-tabular>{fmtRange(pick.start, pick.end)} ({pick.durationMinutes} min)</dd>
              <dt className="flex items-center gap-1.5 text-ink-500">{pick.mode === 'online' ? <Video className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}Where</dt>
              <dd>{pick.mode === 'online' ? 'Online. The meeting link appears in your booking details.' : pick.location || f.officeLocation || 'Not specified'}</dd>
              {pick.capacity > 1 && (
                <>
                  <dt className="flex items-center gap-1.5 text-ink-500"><Users className="h-4 w-4" />Session</dt>
                  <dd>Group session · {pick.spotsLeft} of {pick.capacity} places left</dd>
                </>
              )}
            </dl>
            <Textarea
              label={moving ? 'Update the topic (optional)' : 'What would you like to discuss? (optional)'}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="e.g. Questions on assignment 3"
              hint={moving ? 'Leave blank to keep the same topic.' : 'Shared with the faculty member.'}
            />
          </div>
        )}
      </Modal>
    </>
  );
}
