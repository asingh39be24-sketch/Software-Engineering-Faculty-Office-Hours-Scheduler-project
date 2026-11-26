import { useState } from 'react';
import { CalendarX2, Users as UsersIcon, Video, MapPin, Ban, X } from 'lucide-react';
import { api } from '../../services/api.js';
import { invalidate, useQuery } from '../../hooks/useQuery.js';
import { useToast } from '../../context/ToastContext.jsx';
import { PageHeader, Tabs, Select, SlotStatus, EmptyState, ErrorState, SkeletonRows, Button, Modal, Textarea } from '../../components/ui/index.js';
import { fmtDate, fmtRange, plural } from '../../utils/format.js';

/** "A", "A and B", "A, B and C" (falsy items dropped). */
const listJoin = (items) => {
  const xs = items.filter(Boolean);
  return xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
};

/** A modal that will not confirm without a reason, because the people affected are shown it. */
function ReasonDialog({ open, title, description, confirmLabel, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => { if (!busy) { setReason(''); setError(''); onClose(); } };
  const confirm = async () => {
    if (reason.trim().length < 3) { setError('Give a short reason. The people affected will see it.'); return; }
    setBusy(true);
    try {
      await onConfirm(reason.trim());
      setReason(''); setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={close} closeDisabled={busy} title={title} size="sm"
      footer={<>
        <Button variant="secondary" onClick={close} disabled={busy}>Keep it</Button>
        <Button variant="danger-solid" onClick={confirm} loading={busy}>{confirmLabel}</Button>
      </>}>
      {description && <div className="text-sm text-ink-600">{description}</div>}
      <div className="mt-4">
        <Textarea label="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={2}
          placeholder="e.g. Department meeting at this time" error={error} data-autofocus />
      </div>
    </Modal>
  );
}

export default function AdminSlots() {
  const toast = useToast();
  const [scope, setScope] = useState('upcoming');
  const [facultyId, setFacultyId] = useState('');
  const [status, setStatus] = useState('');
  const [withdraw, setWithdraw] = useState(null); // slot
  const [cancel, setCancel] = useState(null); // { slot, booking }

  const facultyList = useQuery(() => api.users({ role: 'faculty' }), [], { tags: ['users'] });
  const { data, error, loading, refetch } = useQuery(
    () => api.adminSlots({ scope, facultyId, status }),
    [scope, facultyId, status],
    { tags: ['slots', 'bookings'] }
  );
  const refreshAll = () => invalidate('slots', 'bookings', 'analytics', 'notifications');

  const doWithdraw = async (reason) => {
    const r = await api.adminCancelSlot(withdraw.id, reason);
    toast.success('Slot withdrawn', r.cancelledBookings
      ? `${plural(r.cancelledBookings, 'appointment')} cancelled. The faculty member and students were notified.`
      : 'The faculty member was notified.');
    setWithdraw(null);
    refreshAll();
  };
  const doCancel = async (reason) => {
    await api.cancelBooking(cancel.booking.id, reason);
    toast.success('Appointment cancelled', `${cancel.booking.studentName} and ${cancel.slot.facultyName} were notified.`);
    setCancel(null);
    refreshAll();
  };

  const isUpcoming = (s) => new Date(s.start) > new Date();

  return (
    <>
      <PageHeader title="Slots" description="Every faculty member's office-hour slots. Withdraw a slot or cancel an appointment; everyone affected is notified with your reason."
        onRefresh={refetch} refreshing={loading && !!data} />
      <div className="card overflow-hidden">
        <div className="border-b border-ink-100 px-3 pt-3">
          <Tabs label="Slot range" value={scope} onChange={setScope}
            items={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }, { value: 'all', label: 'All' }]} />
        </div>
        <div className="grid gap-2 border-b border-ink-100 p-3 sm:grid-cols-[1fr_180px]">
          <Select aria-label="Filter by faculty" value={facultyId} onChange={(e) => setFacultyId(e.target.value)}>
            <option value="">All faculty</option>
            {(facultyList.data?.users || []).map((f) => <option key={f.id} value={f.id}>{f.name}{f.isActive ? '' : ' (deactivated)'}</option>)}
          </Select>
          <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option><option value="open">Open</option><option value="booked">Full</option><option value="cancelled">Withdrawn</option>
          </Select>
        </div>
        {error && !data ? <ErrorState error={error} onRetry={refetch} /> : !data ? <SkeletonRows rows={6} /> : data.slots.length === 0 ? (
          <EmptyState icon={CalendarX2} title="No slots match">Try another faculty member, range or status.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <caption className="sr-only">Office-hour slots</caption>
              <thead>
                <tr className="border-b border-ink-100 text-left text-xs text-ink-500">
                  <th scope="col" className="px-4 py-2.5 font-medium">Date</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Time</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Faculty</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Where</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Booked</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {data.slots.map((s) => (
                  <tr key={s.id} className="align-top hover:bg-ink-50/70">
                    <td className="whitespace-nowrap px-4 py-2.5 text-ink-700">{fmtDate(s.start)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-ink-700" data-tabular>{fmtRange(s.start, s.end)}</td>
                    <td className="px-4 py-2.5">
                      <span className="block font-medium">{s.facultyName}</span>
                      {s.facultyDepartment && <span className="block text-xs text-ink-500">{s.facultyDepartment}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-ink-600">
                      <span className="inline-flex items-center gap-1">
                        {s.mode === 'online' ? <><Video className="h-3.5 w-3.5" />Online</> : <><MapPin className="h-3.5 w-3.5" />{s.location || 'Office'}</>}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-ink-600" data-tabular>{s.bookedCount}/{s.capacity}</span>
                      {s.waitlistCount > 0 && <span className="ml-2 text-xs text-ink-500">+{s.waitlistCount} waiting</span>}
                      {s.bookings.length > 0 && (
                        <ul className="mt-1 space-y-1">
                          {s.bookings.map((b) => (
                            <li key={b.id} className="flex items-center gap-2 text-xs">
                              <UsersIcon className="h-3 w-3 text-ink-400" aria-hidden />
                              <span className="truncate">{b.studentName}</span>
                              {b.status === 'confirmed' && s.status !== 'cancelled' && (
                                <button type="button" onClick={() => setCancel({ slot: s, booking: b })}
                                  className="inline-flex items-center gap-0.5 rounded px-1 text-brick-600 hover:bg-brick-50"
                                  aria-label={`Cancel ${b.studentName}'s appointment`}>
                                  <X className="h-3 w-3" />Cancel
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-4 py-2.5"><SlotStatus status={s.status === 'booked' ? 'booked' : s.status} /></td>
                    <td className="px-4 py-2.5 text-right">
                      {s.status !== 'cancelled' && isUpcoming(s) && (
                        <Button size="xs" variant="danger" icon={Ban} onClick={() => setWithdraw(s)}>Withdraw</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ReasonDialog open={!!withdraw} onClose={() => setWithdraw(null)} confirmLabel="Withdraw slot"
        title={withdraw ? `Withdraw ${withdraw.facultyName}'s slot?` : ''}
        description={withdraw && (
          <>
            <p>{fmtDate(withdraw.start)}, {fmtRange(withdraw.start, withdraw.end)}. Students will no longer be able to book it.</p>
            {withdraw.bookings.length > 0 && (
              <p className="mt-2 font-medium text-brick-600">
                {plural(withdraw.bookings.length, 'appointment')} will be cancelled: {withdraw.bookings.map((b) => b.studentName).join(', ')}.
              </p>
            )}
            <p className="mt-2">{listJoin([withdraw.facultyName, withdraw.bookings.length && 'the booked students', withdraw.waitlistCount && 'everyone on the waitlist'])} will be notified.</p>
          </>
        )}
        onConfirm={doWithdraw} />

      <ReasonDialog open={!!cancel} onClose={() => setCancel(null)} confirmLabel="Cancel appointment"
        title={cancel ? `Cancel ${cancel.booking.studentName}'s appointment?` : ''}
        description={cancel && (
          <p>With {cancel.slot.facultyName} on {fmtDate(cancel.slot.start)}, {fmtRange(cancel.slot.start, cancel.slot.end)}.
            The place is freed (and offered to the waitlist). Both {cancel.booking.studentName} and {cancel.slot.facultyName} will be notified.</p>
        )}
        onConfirm={doCancel} />
    </>
  );
}
