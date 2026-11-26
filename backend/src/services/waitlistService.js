import { config } from '../config.js';
import { conflict, notFound } from '../utils/errors.js';
import { requireInt } from '../utils/validate.js';
import { formatSlotTime, nowIso } from '../utils/time.js';
import { countActive, countUpcoming, syncSlotStatus } from './capacity.js';
import { createNotification } from './notificationService.js';
import { logActivity } from './activityService.js';

function studentClash(db, studentId, slot) {
  return db
    .prepare(
      `SELECT 1 FROM bookings b JOIN slots s ON s.id = b.slot_id
       WHERE b.student_id = ? AND b.status = 'confirmed' AND s.slot_time < ? AND s.end_time > ?`
    )
    .get(studentId, slot.end_time, slot.slot_time);
}

/** A student joins the queue for a FULL slot. First come, first served. */
export function joinWaitlist(db, { slotId, studentId }) {
  const sid = requireInt(slotId, 'slot id', { min: 1 });
  const tx = db.transaction(() => {
    const now = nowIso();
    const slot = db
      .prepare(
        `SELECT s.*, u.name AS faculty_name, u.is_active AS faculty_active
         FROM slots s JOIN users u ON u.id = s.faculty_id WHERE s.id = ?`
      )
      .get(sid);
    if (!slot) throw notFound('This slot does not exist');
    if (slot.status === 'cancelled') throw conflict('This slot is no longer available', 'SLOT_UNAVAILABLE');
    if (slot.slot_time <= now) throw conflict('This slot has already started', 'SLOT_IN_PAST');
    if (!slot.faculty_active) throw conflict('This faculty member is not accepting bookings', 'FACULTY_INACTIVE');
    if (countActive(db, sid) < slot.capacity) {
      throw conflict('This slot has space. Book it instead of joining the waitlist.', 'SLOT_HAS_SPACE');
    }
    if (db.prepare("SELECT 1 FROM bookings WHERE slot_id = ? AND student_id = ? AND status <> 'cancelled'").get(sid, studentId)) {
      throw conflict('You already have a place in this slot', 'ALREADY_BOOKED');
    }
    if (studentClash(db, studentId, slot)) {
      throw conflict('You already have another appointment at this time', 'STUDENT_TIME_CLASH');
    }
    if (countUpcoming(db, studentId, now) >= config.maxUpcomingBookings) {
      throw conflict(`You can hold at most ${config.maxUpcomingBookings} upcoming bookings. Cancel one first.`, 'LIMIT_REACHED');
    }
    if (db.prepare("SELECT 1 FROM waitlist WHERE slot_id = ? AND student_id = ? AND status = 'waiting'").get(sid, studentId)) {
      throw conflict('You are already on the waitlist for this slot', 'ALREADY_WAITING');
    }
    const id = Number(db.prepare('INSERT INTO waitlist (slot_id, student_id) VALUES (?,?)').run(sid, studentId).lastInsertRowid);
    const position = db.prepare("SELECT COUNT(*) c FROM waitlist WHERE slot_id = ? AND status = 'waiting' AND id <= ?").get(sid, id).c;
    logActivity(db, {
      actorId: studentId,
      action: 'waitlist.joined',
      entityType: 'slot',
      entityId: sid,
      details: `with ${slot.faculty_name} at ${slot.slot_time}`,
    });
    return { id, slotId: sid, position };
  });
  return tx.immediate();
}

export function leaveWaitlist(db, { slotId, studentId }) {
  const sid = requireInt(slotId, 'slot id', { min: 1 });
  const info = db
    .prepare("UPDATE waitlist SET status = 'left', resolved_at = ? WHERE slot_id = ? AND student_id = ? AND status = 'waiting'")
    .run(nowIso(), sid, studentId);
  if (info.changes === 0) throw notFound('You are not on the waitlist for this slot');
  logActivity(db, { actorId: studentId, action: 'waitlist.left', entityType: 'slot', entityId: sid });
  return { ok: true };
}

/** The student's own active waitlist entries for upcoming slots, with their place in the queue. */
export function listMyWaitlist(db, studentId) {
  return db
    .prepare(
      `SELECT w.id, w.slot_id, w.created_at,
              s.slot_time, s.end_time, s.duration_minutes, s.mode, s.location, s.capacity,
              f.id AS faculty_id, f.name AS faculty_name, f.office_location,
              (SELECT COUNT(*) FROM waitlist w2 WHERE w2.slot_id = w.slot_id AND w2.status = 'waiting' AND w2.id <= w.id) AS position
       FROM waitlist w
       JOIN slots s ON s.id = w.slot_id
       JOIN users f ON f.id = s.faculty_id
       WHERE w.student_id = ? AND w.status = 'waiting' AND s.status <> 'cancelled' AND s.slot_time > ?
       ORDER BY s.slot_time`
    )
    .all(studentId, nowIso())
    .map((r) => ({
      id: r.id,
      slotId: r.slot_id,
      joinedAt: r.created_at,
      start: r.slot_time,
      end: r.end_time,
      durationMinutes: r.duration_minutes,
      mode: r.mode,
      location: r.location,
      capacity: r.capacity,
      position: r.position,
      faculty: { id: r.faculty_id, name: r.faculty_name, officeLocation: r.office_location },
    }));
}

/**
 * Fills free places in a slot from its waitlist, oldest request first.
 * Call it inside the transaction that freed a place. Returns notification ids for
 * dispatchEmails() once that transaction has committed.
 * A student who now has a clashing appointment, or is at the booking limit, is skipped and stays on the list.
 */
export function promoteFromWaitlist(db, slotId) {
  const noteIds = [];
  const now = nowIso();
  const slot = db
    .prepare(
      `SELECT s.*, f.name AS faculty_name, f.is_active AS faculty_active
       FROM slots s JOIN users f ON f.id = s.faculty_id WHERE s.id = ?`
    )
    .get(slotId);
  if (!slot || slot.status === 'cancelled' || slot.slot_time <= now || !slot.faculty_active) return noteIds;

  const waiting = db
    .prepare(
      `SELECT w.id, w.student_id, u.name AS student_name, u.is_active
       FROM waitlist w JOIN users u ON u.id = w.student_id
       WHERE w.slot_id = ? AND w.status = 'waiting' ORDER BY w.id`
    )
    .all(slotId);
  const when = formatSlotTime(slot.slot_time);
  for (const w of waiting) {
    if (countActive(db, slotId) >= slot.capacity) break;
    if (!w.is_active) {
      db.prepare("UPDATE waitlist SET status = 'expired', resolved_at = ? WHERE id = ?").run(now, w.id);
      continue;
    }
    if (studentClash(db, w.student_id, slot)) continue;
    if (countUpcoming(db, w.student_id, now) >= config.maxUpcomingBookings) continue; // at their limit: stays waiting
    const bookingId = Number(
      db.prepare('INSERT INTO bookings (slot_id, student_id) VALUES (?,?)').run(slotId, w.student_id).lastInsertRowid
    );
    db.prepare("UPDATE waitlist SET status = 'promoted', resolved_at = ? WHERE id = ?").run(now, w.id);
    noteIds.push(
      createNotification(db, {
        userId: w.student_id,
        type: 'booking_confirmed',
        title: 'A place opened up: you are booked',
        message: `A place opened up in the slot you were waiting for with ${slot.faculty_name} on ${when}. Your appointment is confirmed.`,
        bookingId,
      }),
      createNotification(db, {
        userId: slot.faculty_id,
        type: 'booking_received',
        title: 'New appointment booked',
        message: `${w.student_name} was moved from the waitlist into your slot on ${when}.`,
        bookingId,
      })
    );
    logActivity(db, {
      actorId: w.student_id,
      action: 'booking.created',
      entityType: 'booking',
      entityId: bookingId,
      details: `from waitlist, with ${slot.faculty_name} at ${slot.slot_time}`,
    });
  }
  syncSlotStatus(db, slotId);
  return noteIds;
}

/** Closes the queue of a withdrawn slot and tells everyone who was waiting. */
export function expireWaitlist(db, slotId) {
  const now = nowIso();
  const rows = db
    .prepare(
      `SELECT w.id, w.student_id, s.slot_time, f.name AS faculty_name
       FROM waitlist w JOIN slots s ON s.id = w.slot_id JOIN users f ON f.id = s.faculty_id
       WHERE w.slot_id = ? AND w.status = 'waiting'`
    )
    .all(slotId);
  const ids = [];
  for (const r of rows) {
    db.prepare("UPDATE waitlist SET status = 'expired', resolved_at = ? WHERE id = ?").run(now, r.id);
    ids.push(
      createNotification(db, {
        userId: r.student_id,
        type: 'booking_cancelled',
        title: 'Waitlisted slot withdrawn',
        message: `${r.faculty_name} withdrew the slot on ${formatSlotTime(r.slot_time)} that you were waiting for.`,
      })
    );
  }
  return ids;
}
