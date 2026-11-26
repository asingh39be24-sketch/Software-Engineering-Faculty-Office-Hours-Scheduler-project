import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, AlertTriangle, CalendarClock, Trash2, Info } from 'lucide-react';
import { api } from '../../services/api.js';
import { invalidate, useDebounced, useQuery } from '../../hooks/useQuery.js';
import { useToast } from '../../context/ToastContext.jsx';
import { PageHeader, Section, Input, Select, Button, Tabs, Badge, SlotStatus, BookingStatus, EmptyState, ErrorState, SkeletonRows, ConfirmDialog } from '../../components/ui/index.js';
import { addDays, dayKey, fmtDateLong, fmtRange, fmtTime, localToIso, plural } from '../../utils/format.js';
import { cn } from '../../utils/cn.js';

const DURATIONS = [10, 15, 20, 30, 45, 60];
const CAPACITIES = [1, 2, 3, 4, 5, 8, 10, 15, 20, 30, 50];
const REPEAT_WEEKS = [1, 2, 3, 4, 6, 8, 10, 12];
const WEEKDAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];
const LINK_RE = /^https?:\/\/\S+$/i;
const MAX_CHIPS = 12;

export default function Availability() {
  const toast = useToast();
  const [form, setForm] = useState({
    date: dayKey(addDays(new Date(), 1)), start: '14:00', end: '16:00', duration: '20',
    mode: 'in_person', location: '', meetingLink: '', capacity: '1', weeks: '1', repeatDays: [],
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState('upcoming');
  const [toCancel, setToCancel] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const weeks = Number(form.weeks);
  const baseDay = form.date ? new Date(`${form.date}T00:00`).getDay() : 0;
  const activeDays = form.repeatDays.length ? form.repeatDays : [baseDay];
  const toggleDay = (d) => setForm((f) => {
    const cur = f.repeatDays.length ? f.repeatDays : [baseDay];
    const next = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d];
    return { ...f, repeatDays: next.length ? next : cur }; // at least one day stays selected
  });

  // Client-side checks for instant feedback; the server re-validates everything.
  const localError = useMemo(() => {
    if (!form.date || !form.start || !form.end) return 'Choose a date, start and end time.';
    const s = new Date(`${form.date}T${form.start}`);
    const e = new Date(`${form.date}T${form.end}`);
    if (e <= s) return 'End time must be after the start time.';
    if (s <= new Date()) return 'Availability must start in the future.';
    if ((e - s) / 60000 < Number(form.duration)) return 'The window is shorter than one appointment.';
    return null;
  }, [form]);

  const detailsError = form.mode === 'online' && !LINK_RE.test(form.meetingLink.trim())
    ? 'Add the meeting link. It must start with https://' : null;

  // One window per date. The browser works out each date in the faculty member's own
  // time zone, so a repeat across a daylight-saving change keeps the same local time.
  const dayKeyList = activeDays.join(',');
  const windows = useMemo(() => {
    if (localError) return [];
    const first = new Date(`${form.date}T00:00`);
    const out = [];
    for (let i = 0; i < (weeks > 1 ? weeks * 7 : 1); i++) {
      const d = addDays(first, i);
      if (weeks > 1 && !dayKeyList.split(',').includes(String(d.getDay()))) continue;
      const k = dayKey(d);
      out.push({ start: localToIso(k, form.start), end: localToIso(k, form.end) });
    }
    return out;
  }, [form.date, form.start, form.end, weeks, dayKeyList, localError]);

  const body = useMemo(() => (localError ? null : {
    windows, durationMinutes: Number(form.duration), skipConflicts: weeks > 1,
  }), [windows, form.duration, weeks, localError]);
  const debouncedBody = useDebounced(body, 300);

  const [preview, setPreview] = useState({ data: null, error: null });
  useEffect(() => {
    if (!debouncedBody) { setPreview({ data: null, error: null }); return; }
    let alive = true;
    api.previewSlots(debouncedBody)
      .then((data) => alive && setPreview({ data, error: null }))
      .catch((error) => alive && setPreview({ data: null, error }));
    return () => { alive = false; };
  }, [debouncedBody]);

  const slots = useQuery(() => api.mySlots({ scope }), [scope], { tags: ['slots'] });

  const pv = preview.data;
  const conflicts = pv?.conflicts || [];
  const clashCount = pv ? pv.slots.filter((s) => conflicts.some((c) => c.start < s.end && c.end > s.start)).length : 0;
  const blocked = pv && (weeks > 1 ? clashCount === pv.slots.length : conflicts.length > 0);

  const publish = async (e) => {
    e.preventDefault();
    const problem = localError || detailsError;
    if (problem) { setErrors({ form: problem }); return; }
    setErrors({});
    setBusy(true);
    try {
      const r = await api.publishSlots({
        ...body,
        mode: form.mode,
        location: form.mode === 'in_person' ? form.location.trim() || undefined : undefined,
        meetingLink: form.mode === 'online' ? form.meetingLink.trim() : undefined,
        capacity: Number(form.capacity),
      });
      const first = r.created[0];
      const detail = windows.length > 1
        ? `${plural(windows.length, 'date')}, starting ${fmtDateLong(first.start)}`
        : `${fmtDateLong(first.start)}, ${fmtTime(first.start)} – ${fmtTime(r.created.at(-1).end)}`;
      toast.success(`Published ${plural(r.created.length, 'slot')}`, r.skipped ? `${detail}. ${plural(r.skipped, 'slot')} skipped because they overlapped existing ones.` : detail);
      invalidate('slots', 'dashboard', 'analytics');
      setPreview({ data: null, error: null });
      setScope('upcoming');
    } catch (err) {
      setErrors({ form: err.message });
      toast.error('Couldn’t publish', err.message);
    } finally {
      setBusy(false);
    }
  };

  const cancelSlot = async () => {
    try {
      await api.cancelSlot(toCancel.id);
      toast.success('Slot withdrawn', `${fmtDateLong(toCancel.start)}, ${fmtTime(toCancel.start)}`);
      setToCancel(null);
    } catch (e) {
      toast.error('Couldn’t withdraw slot', e.message);
    } finally {
      invalidate('slots', 'dashboard', 'analytics');
    }
  };

  const grouped = useMemo(() => {
    const m = new Map();
    for (const s of slots.data?.slots || []) {
      const k = dayKey(s.start);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(s);
    }
    return [...m.entries()];
  }, [slots.data]);

  const chips = pv ? (pv.windowCount > 1 ? pv.slots.slice(0, MAX_CHIPS) : pv.slots) : [];

  return (
    <>
      <PageHeader title="Availability" description="Publish windows of time; students book individual slots within them." onRefresh={slots.refetch} refreshing={slots.loading && !!slots.data} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr] lg:items-start">
        <Section title="Publish a window" className="lg:sticky lg:top-20">
          <form onSubmit={publish} noValidate className="space-y-4 p-4">
            <Input label="Date" type="date" min={dayKey(new Date())} value={form.date} onChange={set('date')} required />
            <div className="grid grid-cols-2 gap-3">
              <Input label="From" type="time" value={form.start} onChange={set('start')} required step={300} />
              <Input label="To" type="time" value={form.end} onChange={set('end')} required step={300} />
            </div>
            <Select label="Appointment length" value={form.duration} onChange={set('duration')}>
              {DURATIONS.map((d) => <option key={d} value={d}>{d} minutes</option>)}
            </Select>

            <Select label="Repeat" value={form.weeks} onChange={set('weeks')}>
              {REPEAT_WEEKS.map((n) => <option key={n} value={n}>{n === 1 ? 'Does not repeat' : `Weekly for ${n} weeks`}</option>)}
            </Select>
            {weeks > 1 && (
              <div role="group" aria-label="Repeat on">
                <p className="mb-1.5 text-sm font-medium text-ink-800">Repeat on</p>
                <div className="flex gap-1">
                  {WEEKDAYS.map(([d, label]) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={activeDays.includes(d)}
                      onClick={() => toggleDay(d)}
                      className={cn(
                        'h-8 flex-1 rounded border text-xs font-medium transition-colors',
                        activeDays.includes(d) ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50'
                      )}
                    >{label}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Select label="Meeting type" value={form.mode} onChange={set('mode')}>
                <option value="in_person">In person</option>
                <option value="online">Online</option>
              </Select>
              <Select label="Students per slot" value={form.capacity} onChange={set('capacity')}>
                {CAPACITIES.map((n) => <option key={n} value={n}>{n === 1 ? '1 (one-to-one)' : `${n} (group)`}</option>)}
              </Select>
            </div>
            {form.mode === 'online' ? (
              <Input label="Meeting link" type="url" value={form.meetingLink} onChange={set('meetingLink')} placeholder="https://meet.example.edu/your-room" maxLength={300}
                hint="Only students who book a slot can see this link." error={form.meetingLink && detailsError ? detailsError : undefined} />
            ) : (
              <Input label="Room / location (optional)" value={form.location} onChange={set('location')} placeholder="e.g. Block C, Room 204" maxLength={120}
                hint="Leave blank to use your office location from your profile." />
            )}

            <div className="rounded border border-ink-150 bg-ink-50/70 p-3" aria-live="polite">
              {localError ? (
                <p className="flex items-start gap-2 text-sm text-ink-600"><Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />{localError}</p>
              ) : preview.error ? (
                <p className="flex items-start gap-2 text-sm text-brick-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{preview.error.message}</p>
              ) : !pv ? (
                <p className="text-sm text-ink-500">Calculating slots…</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-ink-900">
                    {plural(pv.slots.length, 'slot')} of {pv.durationMinutes} minutes{pv.windowCount > 1 ? ` on ${plural(pv.windowCount, 'date')}` : ''}
                    {Number(form.capacity) > 1 ? ` · up to ${form.capacity} students each` : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {chips.map((s) => {
                      const clash = conflicts.some((c) => c.start < s.end && c.end > s.start);
                      return <span key={s.start} className={`rounded-sm px-1.5 py-0.5 font-mono text-2xs ${clash ? 'bg-brick-100 text-brick-700 line-through' : 'bg-white text-ink-700 ring-1 ring-inset ring-ink-200'}`}>{fmtTime(s.start)}</span>;
                    })}
                    {pv.slots.length > chips.length && <span className="px-1 py-0.5 text-2xs text-ink-500">+{pv.slots.length - chips.length} more</span>}
                  </div>
                  {pv.leftoverMinutes > 0 && <p className="mt-2 text-xs text-ink-500">The last {pv.leftoverMinutes} minutes of a day don’t fit a full appointment and won’t be published.</p>}
                  {clashCount > 0 && weeks > 1 && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-600"><Info className="mt-px h-3.5 w-3.5 shrink-0" />{plural(clashCount, 'slot')} overlap ones you’ve already published and will be skipped.</p>
                  )}
                  {conflicts.length > 0 && weeks === 1 && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-brick-700"><AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />Overlaps {plural(conflicts.length, 'slot')} you’ve already published. Adjust the window to continue.</p>
                  )}
                  {blocked && weeks > 1 && <p className="mt-2 text-xs text-brick-700">Every one of these slots overlaps existing ones. Choose different dates or times.</p>}
                </>
              )}
            </div>
            {errors.form && <p role="alert" className="text-sm text-brick-600">{errors.form}</p>}
            <Button type="submit" icon={CalendarPlus} className="w-full" loading={busy} disabled={!!localError || !!detailsError || !pv || !!blocked}>
              {pv ? `Publish ${plural(pv.slots.length - (weeks > 1 ? clashCount : 0), 'slot')}` : 'Publish'}
            </Button>
          </form>
        </Section>

        <div>
          <Tabs label="Slot range" value={scope} onChange={setScope} className="mb-4"
            items={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }, { value: 'all', label: 'All' }]} />
          <div className="card overflow-hidden">
            {slots.error && !slots.data ? <ErrorState error={slots.error} onRetry={slots.refetch} /> : !slots.data ? <SkeletonRows rows={6} /> : grouped.length === 0 ? (
              <EmptyState icon={CalendarClock} title={scope === 'past' ? 'No past slots' : 'No published slots yet'}>
                {scope === 'past' ? 'Slots appear here after their time has passed.' : 'Use the form to publish your first window of availability.'}
              </EmptyState>
            ) : (
              <div className="divide-y divide-ink-150">
                {grouped.map(([k, list]) => {
                  const booked = list.filter((s) => s.bookedCount > 0).length;
                  const open = list.filter((s) => s.status === 'open' && !s.bookedCount).length;
                  return (
                    <div key={k}>
                      <div className="flex items-center justify-between bg-ink-50 px-4 py-2">
                        <p className="text-sm font-semibold">{fmtDateLong(`${k}T12:00`)}</p>
                        <p className="text-xs text-ink-500">{booked} booked · {open} open</p>
                      </div>
                      <ul className="divide-y divide-ink-100">
                        {list.map((s) => {
                          const past = new Date(s.end) < new Date();
                          const group = s.capacity > 1;
                          const names = (s.bookings || []).map((b) => b.studentName);
                          const who = group
                            ? (names.length ? `${names.slice(0, 2).join(', ')}${names.length > 2 ? ` +${names.length - 2}` : ''}` : null)
                            : s.booking ? s.booking.studentName : null;
                          return (
                            <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                              <span className="w-32 shrink-0 text-sm text-ink-800" data-tabular>{fmtRange(s.start, s.end)}</span>
                              <div className="min-w-0 flex-1 truncate text-sm text-ink-600">
                                {who || (s.status === 'cancelled' ? <span className="text-ink-400">Withdrawn</span> : <span className="text-ink-400">—</span>)}
                                {s.waitlistCount > 0 && <span className="ml-2 text-xs text-marigold-600">{s.waitlistCount} waiting</span>}
                                <span className="ml-2 hidden text-xs text-ink-400 sm:inline">{s.mode === 'online' ? 'Online' : s.location}</span>
                              </div>
                              {s.status === 'cancelled' ? (
                                <SlotStatus status="cancelled" />
                              ) : group ? (
                                <Badge tone={s.status === 'booked' ? 'cobalt' : s.bookedCount ? 'pine' : 'outline'} dot>{s.bookedCount}/{s.capacity} booked</Badge>
                              ) : s.booking ? (
                                <BookingStatus status={s.booking.status === 'confirmed' && past ? 'awaiting' : s.booking.status} />
                              ) : (
                                <SlotStatus status={s.status === 'open' && past ? 'expired' : s.status} />
                              )}
                              {s.status === 'open' && !past && !s.bookedCount ? (
                                <button type="button" onClick={() => setToCancel(s)} className="rounded p-1.5 text-ink-400 hover:bg-brick-50 hover:text-brick-600" aria-label={`Withdraw slot at ${fmtTime(s.start)}`} title="Withdraw slot">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              ) : <span className="w-[26px]" />}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={!!toCancel}
        onClose={() => setToCancel(null)}
        title="Withdraw this slot?"
        description={toCancel && `${fmtDateLong(toCancel.start)}, ${fmtRange(toCancel.start, toCancel.end)} will no longer be bookable.`}
        confirmLabel="Withdraw slot"
        onConfirm={cancelSlot}
      />
    </>
  );
}
