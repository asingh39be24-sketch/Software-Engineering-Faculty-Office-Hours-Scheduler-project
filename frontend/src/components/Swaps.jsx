import { useState } from 'react';
import { ArrowLeftRight, Hourglass, Check, X } from 'lucide-react';
import { api } from '../services/api.js';
import { invalidate, useQuery } from '../hooks/useQuery.js';
import { useToast } from '../context/ToastContext.jsx';
import { Button, EmptyState, Modal, Section, Select, Skeleton } from './ui/index.js';
import { BOOKING_TAGS } from './BookingDetail.jsx';
import { fmtDateTime, fmtRange, fmtDate } from '../utils/format.js';

/** Ask a classmate to exchange appointments with the same faculty member. */
export function SwapDialog({ booking, onClose }) {
  const toast = useToast();
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, error } = useQuery(() => api.swapCandidates(booking.id), [booking.id]);
  const candidates = data?.candidates || [];
  const chosen = target || (candidates[0] ? String(candidates[0].bookingId) : '');

  const send = async () => {
    setBusy(true);
    try {
      await api.requestSwap(booking.id, Number(chosen));
      toast.success('Swap request sent', 'They’ll be notified and can accept or decline.');
      invalidate(BOOKING_TAGS, 'swaps');
      onClose();
    } catch (e) {
      toast.error('Couldn’t send the request', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      closeDisabled={busy}
      title="Swap this appointment"
      description={`Your ${fmtDate(booking.start)}, ${fmtRange(booking.start, booking.end)} slot with ${booking.faculty.name}. If a classmate accepts, you exchange appointments.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Back</Button>
          <Button icon={ArrowLeftRight} onClick={send} loading={busy} disabled={!chosen}>Send request</Button>
        </>
      }
    >
      {error ? (
        <p role="alert" className="text-sm text-brick-600">{error.message}</p>
      ) : !data ? (
        <Skeleton className="h-9 w-full" />
      ) : candidates.length === 0 ? (
        <EmptyState compact icon={ArrowLeftRight} title="No one to swap with">
          No other student has an upcoming appointment with this faculty member.
        </EmptyState>
      ) : (
        <Select label="Swap with" value={chosen} onChange={(e) => setTarget(e.target.value)}>
          {candidates.map((c) => (
            <option key={c.bookingId} value={c.bookingId}>
              {fmtDate(c.start)}, {fmtRange(c.start, c.end)} · {c.studentName}
            </option>
          ))}
        </Select>
      )}
    </Modal>
  );
}

/** Pending swap requests: asked of me (accept / decline) and sent by me (withdraw). */
export function SwapRequests() {
  const toast = useToast();
  const [busyId, setBusyId] = useState(null);
  const { data } = useQuery(() => api.swaps(), [], { tags: ['swaps', 'bookings'], pollMs: 30_000 });
  const incoming = data?.incoming || [];
  const outgoing = data?.outgoing || [];
  if (!incoming.length && !outgoing.length) return null;

  const act = async (swap, action, done) => {
    setBusyId(`${action}-${swap.id}`);
    try {
      await api.respondSwap(swap.id, action);
      toast.success(done);
    } catch (e) {
      toast.error('That didn’t work', e.message);
    } finally {
      setBusyId(null);
      invalidate(BOOKING_TAGS, 'swaps');
    }
  };

  return (
    <Section title="Swap requests" description="Exchanges with classmates for the same faculty member." className="mb-4">
      <ul className="divide-y divide-ink-100">
        {incoming.map((w) => (
          <li key={`in-${w.id}`} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
            <p className="min-w-0 flex-1 text-sm text-ink-800">
              <span className="font-medium">{w.from.student}</span> would like your <span data-tabular>{fmtDateTime(w.to.start)}</span> slot
              in exchange for their <span data-tabular>{fmtDateTime(w.from.start)}</span> slot with {w.facultyName}.
            </p>
            <div className="flex gap-1.5">
              <Button size="sm" icon={Check} loading={busyId === `accept-${w.id}`} onClick={() => act(w, 'accept', 'Swap accepted')}>Accept</Button>
              <Button size="sm" variant="secondary" icon={X} loading={busyId === `reject-${w.id}`} onClick={() => act(w, 'reject', 'Request declined')}>Decline</Button>
            </div>
          </li>
        ))}
        {outgoing.map((w) => (
          <li key={`out-${w.id}`} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
            <p className="min-w-0 flex-1 text-sm text-ink-700">
              Waiting for <span className="font-medium">{w.to.student}</span> to answer your request: your <span data-tabular>{fmtDateTime(w.from.start)}</span> slot
              for their <span data-tabular>{fmtDateTime(w.to.start)}</span> slot.
            </p>
            <Button size="sm" variant="secondary" loading={busyId === `cancel-${w.id}`} onClick={() => act(w, 'cancel', 'Request withdrawn')}>Withdraw</Button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Slots the student is queuing for, with their place in line. */
export function WaitlistCard() {
  const toast = useToast();
  const [busyId, setBusyId] = useState(null);
  const { data } = useQuery(() => api.myWaitlist(), [], { tags: ['waitlist', 'bookings', 'slots'], pollMs: 30_000 });
  const items = data?.waitlist || [];
  if (!items.length) return null;

  const leave = async (w) => {
    setBusyId(w.id);
    try {
      await api.leaveWaitlist(w.slotId);
      toast.success('Removed from the waitlist');
    } catch (e) {
      toast.error('Couldn’t leave the waitlist', e.message);
    } finally {
      setBusyId(null);
      invalidate('waitlist', 'slots');
    }
  };

  return (
    <Section title="On the waitlist" description="You’re booked automatically if a place opens up." className="mb-4">
      <ul className="divide-y divide-ink-100">
        {items.map((w) => (
          <li key={w.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Hourglass className="h-4 w-4 shrink-0 text-marigold-500" aria-hidden />
              <div className="min-w-0">
                <p className="truncate font-medium">{w.faculty.name}</p>
                <p className="text-sm text-ink-500" data-tabular>{fmtDate(w.start)}, {fmtRange(w.start, w.end)} · you are number {w.position} in line</p>
              </div>
            </div>
            <Button size="sm" variant="secondary" loading={busyId === w.id} onClick={() => leave(w)}>Leave</Button>
          </li>
        ))}
      </ul>
    </Section>
  );
}
