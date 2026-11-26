import { useState } from 'react';
import { CalendarDays, Clock, MapPin, Video, Users, Mail, MessageSquareText, CheckCircle2, UserX, XCircle, CalendarClock, ArrowLeftRight } from 'lucide-react';
import { cancelledByText } from './CancelNote.jsx';
import { Modal, Button, BookingStatus, Avatar, ConfirmDialog } from './ui/index.js';
import { api } from '../services/api.js';
import { invalidate } from '../hooks/useQuery.js';
import { useToast } from '../context/ToastContext.jsx';
import { fmtDateLong, fmtRange, fmtDateTime } from '../utils/format.js';

export const BOOKING_TAGS = ['bookings', 'slots', 'dashboard', 'notifications', 'analytics'];

function Row({ icon: Icon, children }) {
  return (
    <div className="flex items-start gap-3 py-2 text-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden />
      <div className="min-w-0 text-ink-800">{children}</div>
    </div>
  );
}

/** Hook bundling booking mutations with toasts and cross-screen refresh. */
export function useBookingActions() {
  const toast = useToast();
  const [pending, setPending] = useState(null);
  const run = async (key, fn, success) => {
    setPending(key);
    try {
      const r = await fn();
      toast.success(success);
      return r;
    } catch (e) {
      toast.error('That didn’t work', e.message);
      throw e;
    } finally {
      setPending(null);
      invalidate(BOOKING_TAGS);
    }
  };
  return {
    pending,
    cancel: (b, reason) => run(`cancel-${b.id}`, () => api.cancelBooking(b.id, reason), 'Appointment cancelled'),
    complete: (b) => run(`completed-${b.id}`, () => api.setOutcome(b.id, 'completed'), `Marked ${b.student.name}’s appointment completed`),
    noShow: (b) => run(`no_show-${b.id}`, () => api.setOutcome(b.id, 'no_show'), `Recorded a no-show for ${b.student.name}`),
  };
}

export function canMarkNoShow(b) {
  return new Date(b.start).getTime() <= Date.now();
}

/** Detail view for a booking; `viewer` is 'student' or 'faculty'. */
/** `onReschedule` / `onSwap` are optional; when given, students get those buttons while the appointment can still change. */
export function BookingDetailModal({ booking: b, viewer, onClose, onReschedule, onSwap }) {
  const actions = useBookingActions();
  const [confirmCancel, setConfirmCancel] = useState(false);
  if (!b) return null;
  const other = viewer === 'student' ? b.faculty : b.student;
  const facultyCanAct = viewer === 'faculty' && b.status !== 'cancelled';

  const doOutcome = async (fn) => { try { await fn(b); onClose(); } catch { /* toast shown */ } };

  const footer = (
    <>
      {viewer === 'student' && b.status === 'confirmed' && b.canStudentChange && onReschedule && (
        <Button variant="secondary" icon={CalendarClock} onClick={() => onReschedule(b)}>Reschedule</Button>
      )}
      {viewer === 'student' && b.status === 'confirmed' && b.canStudentChange && onSwap && (
        <Button variant="secondary" icon={ArrowLeftRight} onClick={() => onSwap(b)}>Swap</Button>
      )}
      {viewer === 'student' && b.status === 'confirmed' && (
        <Button variant="danger" icon={XCircle} onClick={() => setConfirmCancel(true)} disabled={!b.canStudentCancel}
          title={b.canStudentCancel ? undefined : 'The cancellation window has closed'}>
          Cancel appointment
        </Button>
      )}
      {facultyCanAct && b.status === 'confirmed' && (
        <Button variant="danger" icon={XCircle} onClick={() => setConfirmCancel(true)}>Cancel</Button>
      )}
      {facultyCanAct && b.status !== 'no_show' && (
        <Button variant="secondary" icon={UserX} disabled={!canMarkNoShow(b)} loading={actions.pending === `no_show-${b.id}`}
          title={canMarkNoShow(b) ? undefined : 'Available once the appointment has started'} onClick={() => doOutcome(actions.noShow)}>
          Mark no-show
        </Button>
      )}
      {facultyCanAct && b.status !== 'completed' && (
        <Button icon={CheckCircle2} loading={actions.pending === `completed-${b.id}`} onClick={() => doOutcome(actions.complete)}>
          Mark completed
        </Button>
      )}
      {!(viewer === 'faculty' && facultyCanAct) && <Button variant="secondary" onClick={onClose}>Close</Button>}
    </>
  );

  return (
    <>
      <Modal open={!confirmCancel} onClose={onClose} title="Appointment details" size="md" footer={footer}>
        <div className="flex items-center gap-3">
          <Avatar name={other.name} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink-900">{other.name}</p>
            <p className="truncate text-sm text-ink-500">
              {viewer === 'student' ? [b.faculty.designation, b.faculty.department].filter(Boolean).join(' · ') || 'Faculty' : b.student.email}
            </p>
          </div>
          <BookingStatus booking={b} />
        </div>
        <div className="mt-4 divide-y divide-ink-100 border-t border-ink-100">
          <Row icon={CalendarDays}>{fmtDateLong(b.start)}</Row>
          <Row icon={Clock}><span data-tabular>{fmtRange(b.start, b.end)}</span> <span className="text-ink-500">· {b.durationMinutes} min</span></Row>
          {b.capacity > 1 && <Row icon={Users}>Group session · up to {b.capacity} students</Row>}
          <Row icon={b.mode === 'online' ? Video : MapPin}>
            {b.mode === 'online' ? (
              b.meetingLink
                ? <a className="link break-all" href={b.meetingLink} target="_blank" rel="noopener noreferrer">Join the online meeting</a>
                : <span>Online</span>
            ) : (b.where || <span className="text-ink-400">Location not provided</span>)}
          </Row>
          <Row icon={Mail}><a className="link" href={`mailto:${other.email}`}>{other.email}</a></Row>
          <Row icon={MessageSquareText}>{b.note ? <span>“{b.note}”</span> : <span className="text-ink-400">No topic added</span>}</Row>
        </div>
        <p className="mt-3 text-xs text-ink-500">
          Booked {fmtDateTime(b.bookedAt)}{b.rescheduledFrom && <> · rescheduled from an earlier time</>}
          {b.status === 'cancelled' && b.statusChangedAt && <> · {cancelledByText(b, viewer).toLowerCase()} {fmtDateTime(b.statusChangedAt)}{b.cancelReason && <> (“{b.cancelReason}”)</>}</>}
          {(b.status === 'completed' || b.status === 'no_show') && b.statusChangedAt && <> · outcome recorded {fmtDateTime(b.statusChangedAt)}</>}
        </p>
        {viewer === 'student' && b.status === 'confirmed' && !b.canStudentCancel && b.isUpcoming && (
          <p className="mt-3 rounded bg-marigold-50 px-3 py-2 text-xs text-ink-700">This appointment is too close to its start time to cancel online. Please contact the faculty member directly.</p>
        )}
      </Modal>
      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancel this appointment?"
        description={
          viewer === 'student'
            ? `Your ${fmtRange(b.start, b.end)} appointment with ${b.faculty.name} will be cancelled and the slot reopened for others.`
            : `${b.student.name} will be notified, and this slot will be withdrawn.`
        }
        confirmLabel="Cancel appointment"
        withReason
        onConfirm={async (reason) => {
          try { await actions.cancel(b, reason); setConfirmCancel(false); onClose(); } catch { /* toast shown */ }
        }}
      />
    </>
  );
}

/** Calendar-page style date block used in lists. */
export function DateBlock({ iso, muted }) {
  const d = new Date(iso);
  return (
    <div className={`flex w-12 shrink-0 flex-col items-center rounded border py-1 ${muted ? 'border-ink-150 bg-ink-50 text-ink-500' : 'border-ink-200 bg-white text-ink-900'}`}>
      <span className="text-2xs font-medium uppercase tracking-wider text-ink-500">{d.toLocaleDateString(undefined, { month: 'short' })}</span>
      <span className="text-lg font-semibold leading-6" data-tabular>{d.getDate()}</span>
      <span className="text-2xs text-ink-500">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
    </div>
  );
}
