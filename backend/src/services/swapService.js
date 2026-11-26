import { config } from '../config.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { requireInt } from '../utils/validate.js';
import { formatSlotTime, nowIso } from '../utils/time.js';
import { createNotification, dispatchEmails } from './notificationService.js';
import { logActivity } from './activityService.js';

const BOOKING = `
  SELECT b.id, b.slot_id, b.student_id, b.status, b.note,
         s.slot_time, s.end_time, s.faculty_id, f.name AS faculty_name, u.name AS student_name
  FROM bookings b
  JOIN slots s ON s.id = b.slot_id
  JOIN users f ON f.id = s.faculty_id
  JOIN users u ON u.id = b.student_id`;

const load = (db, id) => db.prepare(`${BOOKING} WHERE b.id = ?`).get(id);

/** Swaps (like cancellations) close shortly before the appointment starts. */
const cutoffIso = () => new Date(Date.now() + config.cancellationCutoffMinutes * 60_000).toISOString();

/** A student's other confirmed appointments that overlap [start, end), ignoring the given bookings. */
function clashFor(db, studentId, start, end, ignoreIds) {
  return db
    .prepare(
      `SELECT 1 FROM bookings b JOIN slots s ON s.id = b.slot_id
       WHERE b.student_id = ? AND b.status = 'confirmed' AND b.id NOT IN (${ignoreIds.map(() => '?').join(',')})
       AND s.slot_time < ? AND s.end_time > ?`
    )
    .get(studentId, ...ignoreIds, end, start);
}

function holdsPlace(db, studentId, slotId) {
  return db.prepare("SELECT 1 FROM bookings WHERE slot_id = ? AND student_id = ? AND status <> 'cancelled'").get(slotId, studentId);
}

/** Cancels pending swap requests that involve a booking that has changed or gone. */
export function voidSwapsForBooking(db, bookingId, exceptSwapId = 0) {
  db.prepare(
    `UPDATE swap_requests SET status = 'cancelled', resolved_at = ?
     WHERE status = 'pending' AND id <> ? AND (requester_booking = ? OR target_booking = ?)`
  ).run(nowIso(), exceptSwapId, bookingId, bookingId);
}

/** Other students' upcoming appointments with the same faculty member as the student's booking. */
export function swapCandidates(db, { bookingId, studentId }) {
  const id = requireInt(bookingId, 'booking_id', { min: 1 });
  const mine = load(db, id);
  if (!mine || mine.student_id !== studentId || mine.status !== 'confirmed') throw notFound('Booking not found');
  return db
    .prepare(
      `SELECT b.id AS bookingId, s.slot_time AS start, s.end_time AS end, u.name AS studentName
       FROM bookings b JOIN slots s ON s.id = b.slot_id JOIN users u ON u.id = b.student_id
       WHERE s.faculty_id = ? AND b.status = 'confirmed' AND b.student_id <> ? AND s.slot_time > ?
         AND b.slot_id <> ?
       ORDER BY s.slot_time LIMIT 100`
    )
    .all(mine.faculty_id, studentId, cutoffIso(), mine.slot_id);
}

export function requestSwap(db, { myBookingId, targetBookingId, studentId }) {
  const mineId = requireInt(myBookingId, 'my_booking_id', { min: 1 });
  const targetId = requireInt(targetBookingId, 'target_booking_id', { min: 1 });
  const tx = db.transaction(() => {
    const mine = load(db, mineId);
    const target = load(db, targetId);
    if (!mine || mine.student_id !== studentId) throw notFound('Booking not found');
    if (!target) throw notFound('The other booking was not found');
    if (target.student_id === studentId) throw badRequest('You cannot swap with yourself');
    if (mine.faculty_id !== target.faculty_id) {
      throw badRequest('Swaps are only possible between appointments with the same faculty member', { code: 'DIFFERENT_FACULTY' });
    }
    if (mine.slot_id === target.slot_id) throw badRequest('Both of you are already in the same slot');
    if (mine.status !== 'confirmed' || target.status !== 'confirmed') {
      throw conflict('Both appointments must be confirmed', 'NOT_ACTIVE');
    }
    const limit = cutoffIso();
    if (mine.slot_time <= limit || target.slot_time <= limit) {
      throw conflict(`Appointments can only be swapped up to ${config.cancellationCutoffMinutes} minutes before they start`, 'SWAP_WINDOW_CLOSED');
    }
    if (db.prepare("SELECT 1 FROM swap_requests WHERE status = 'pending' AND requester_booking = ? AND target_booking = ?").get(mineId, targetId)) {
      throw conflict('You already sent this request', 'DUPLICATE_SWAP');
    }
    const id = Number(db.prepare('INSERT INTO swap_requests (requester_booking, target_booking) VALUES (?,?)').run(mineId, targetId).lastInsertRowid);
    const note = createNotification(db, {
      userId: target.student_id,
      type: 'booking_received',
      title: 'Swap request',
      message: `${mine.student_name} would like to swap their ${formatSlotTime(mine.slot_time)} appointment with your ${formatSlotTime(target.slot_time)} appointment with ${target.faculty_name}.`,
      bookingId: targetId,
    });
    logActivity(db, { actorId: studentId, action: 'swap.requested', entityType: 'booking', entityId: mineId, details: `with booking ${targetId}` });
    return { id, notes: [note] };
  });
  const { id, notes } = tx.immediate();
  dispatchEmails(db, notes);
  return { id, status: 'pending' };
}

const SWAP_LIST = `
  SELECT w.id, w.status, w.created_at,
         a.id AS from_booking, sa.slot_time AS from_start, sa.end_time AS from_end, ua.name AS from_student, ua.id AS from_student_id,
         b.id AS to_booking,   sb.slot_time AS to_start,   sb.end_time AS to_end,   ub.name AS to_student,   ub.id AS to_student_id,
         f.name AS faculty_name
  FROM swap_requests w
  JOIN bookings a ON a.id = w.requester_booking JOIN slots sa ON sa.id = a.slot_id JOIN users ua ON ua.id = a.student_id
  JOIN bookings b ON b.id = w.target_booking    JOIN slots sb ON sb.id = b.slot_id JOIN users ub ON ub.id = b.student_id
  JOIN users f ON f.id = sa.faculty_id`;

const toSwap = (r) => ({
  id: r.id,
  status: r.status,
  createdAt: r.created_at,
  facultyName: r.faculty_name,
  from: { bookingId: r.from_booking, student: r.from_student, start: r.from_start, end: r.from_end },
  to: { bookingId: r.to_booking, student: r.to_student, start: r.to_start, end: r.to_end },
});

/** Pending swap requests: those asked of the student and those the student sent. */
export function listSwaps(db, studentId) {
  const now = nowIso();
  const rows = (where) =>
    db
      .prepare(`${SWAP_LIST} WHERE w.status = 'pending' AND ${where} AND sa.slot_time > @now AND sb.slot_time > @now ORDER BY w.id DESC LIMIT 50`)
      .all({ id: studentId, now })
      .map(toSwap);
  return { incoming: rows('ub.id = @id'), outgoing: rows('ua.id = @id') };
}

/** action: 'accept' | 'reject' (the student asked) or 'cancel' (the student who sent it). */
export function respondSwap(db, { swapId, studentId, action }) {
  const id = requireInt(swapId, 'Swap id', { min: 1 });
  if (!['accept', 'reject', 'cancel'].includes(action)) throw badRequest('Unknown action');
  const tx = db.transaction(() => {
    const now = nowIso();
    const sw = db.prepare('SELECT * FROM swap_requests WHERE id = ?').get(id);
    if (!sw) throw notFound('Swap request not found');
    if (sw.status !== 'pending') throw conflict('This request was already handled', 'NOT_PENDING');
    const a = load(db, sw.requester_booking);
    const b = load(db, sw.target_booking);
    const close = (status) => db.prepare('UPDATE swap_requests SET status = ?, resolved_at = ? WHERE id = ?').run(status, now, id);

    if (action === 'cancel') {
      if (a.student_id !== studentId) throw forbidden('This is not your request');
      close('cancelled');
      return { status: 'cancelled', notes: [] };
    }
    if (b.student_id !== studentId) throw forbidden('Only the student who was asked can respond');
    if (action === 'reject') {
      close('rejected');
      return {
        status: 'rejected',
        notes: [
          createNotification(db, {
            userId: a.student_id,
            type: 'booking_cancelled',
            title: 'Swap request declined',
            message: `${b.student_name} declined your request to swap for ${formatSlotTime(b.slot_time)}.`,
            bookingId: a.id,
          }),
        ],
      };
    }

    // accept: re-check everything, because time has passed since the request was made
    const stale = (msg) => {
      close('cancelled'); // committed, because we return instead of throwing
      return { voided: msg, notes: [] };
    };
    if (a.status !== 'confirmed' || b.status !== 'confirmed') return stale('One of the appointments is no longer active, so this request was closed.');
    const limit = cutoffIso();
    if (a.slot_time <= limit || b.slot_time <= limit) {
      return stale(`It is too close to the start time to swap (limit ${config.cancellationCutoffMinutes} minutes), so this request was closed.`);
    }
    if (holdsPlace(db, b.student_id, a.slot_id) || holdsPlace(db, a.student_id, b.slot_id)) {
      return stale('One of you already has a place in the other slot, so this request was closed.');
    }
    if (clashFor(db, a.student_id, b.slot_time, b.end_time, [a.id, b.id]) || clashFor(db, b.student_id, a.slot_time, a.end_time, [a.id, b.id])) {
      throw conflict('Swapping would give one of you two appointments at the same time', 'STUDENT_TIME_CLASH');
    }
    // Exchange the students (and their topics) between the two bookings; reminders restart for the new owners.
    const give = db.prepare('UPDATE bookings SET student_id = ?, note = ?, reminder_sent_at = NULL, status_changed_at = ? WHERE id = ? AND status = \'confirmed\'');
    if (give.run(b.student_id, b.note, now, a.id).changes !== 1 || give.run(a.student_id, a.note, now, b.id).changes !== 1) {
      throw conflict('One of the appointments changed. Please try again.');
    }
    close('accepted');
    voidSwapsForBooking(db, a.id, id);
    voidSwapsForBooking(db, b.id, id);
    const notes = [
      createNotification(db, {
        userId: a.student_id,
        type: 'booking_confirmed',
        title: 'Swap accepted',
        message: `${b.student_name} accepted. You now have the ${formatSlotTime(b.slot_time)} appointment with ${a.faculty_name}.`,
        bookingId: b.id,
      }),
      createNotification(db, {
        userId: b.student_id,
        type: 'booking_confirmed',
        title: 'Swap completed',
        message: `You now have the ${formatSlotTime(a.slot_time)} appointment with ${a.faculty_name}.`,
        bookingId: a.id,
      }),
      createNotification(db, {
        userId: a.faculty_id,
        type: 'booking_received',
        title: 'Two students swapped appointments',
        message: `${a.student_name} and ${b.student_name} swapped: ${b.student_name} now has ${formatSlotTime(a.slot_time)} and ${a.student_name} has ${formatSlotTime(b.slot_time)}.`,
        bookingId: a.id,
      }),
    ];
    logActivity(db, { actorId: studentId, action: 'swap.accepted', entityType: 'booking', entityId: a.id, details: `with booking ${b.id}` });
    return { status: 'accepted', notes };
  });
  const result = tx.immediate();
  dispatchEmails(db, result.notes);
  if (result.voided) throw conflict(result.voided, 'NOT_ACTIVE');
  return { id, status: result.status };
}
