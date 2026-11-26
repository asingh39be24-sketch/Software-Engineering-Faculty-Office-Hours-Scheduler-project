import { config } from '../config.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { requireInt, requireString, oneOf } from '../utils/validate.js';
import { formatSlotTime, nowIso } from '../utils/time.js';
import { createNotification, dispatchEmails } from './notificationService.js';
import { logActivity } from './activityService.js';
import { countActive, countUpcoming, syncSlotStatus } from './capacity.js';
import { expireWaitlist, promoteFromWaitlist } from './waitlistService.js';
import { voidSwapsForBooking } from './swapService.js';

const BOOKING_SELECT = `
  SELECT b.id, b.status, b.note, b.booked_at, b.status_changed_at, b.cancelled_by, b.cancel_reason, b.rescheduled_from,
         s.id AS slot_id, s.slot_time, s.end_time, s.duration_minutes, s.status AS slot_status,
         s.mode, s.location, s.meeting_link, s.capacity,
         f.id AS faculty_id, f.name AS faculty_name, f.email AS faculty_email, f.department, f.designation, f.office_location,
         st.id AS student_id, st.name AS student_name, st.email AS student_email
  FROM bookings b
  JOIN slots s  ON s.id = b.slot_id
  JOIN users f  ON f.id = s.faculty_id
  JOIN users st ON st.id = b.student_id`;

export function toBooking(r, now = nowIso()) {
  const cutoff = new Date(Date.now() + config.cancellationCutoffMinutes * 60_000).toISOString();
  return {
    id: r.id,
    status: r.status,
    note: r.note,
    bookedAt: r.booked_at,
    statusChangedAt: r.status_changed_at,
    cancelledBy: r.cancelled_by,
    cancelReason: r.cancel_reason,
    start: r.slot_time,
    end: r.end_time,
    durationMinutes: r.duration_minutes,
    slotId: r.slot_id,
    isUpcoming: r.end_time > now,
    canStudentCancel: r.status === 'confirmed' && r.slot_time > cutoff,
    canStudentChange: r.status === 'confirmed' && r.slot_time > cutoff, // reschedule or swap
    rescheduledFrom: r.rescheduled_from ?? null,
    mode: r.mode ?? 'in_person',
    room: r.location ?? null,
    // Where to go: "Online", the room set for the slot, or else the faculty member's office.
    where: r.mode === 'online' ? 'Online' : r.location || r.office_location || null,
    meetingLink: r.mode === 'online' ? r.meeting_link ?? null : null,
    capacity: r.capacity ?? 1,
    faculty: {
      id: r.faculty_id,
      name: r.faculty_name,
      email: r.faculty_email,
      department: r.department,
      designation: r.designation,
      officeLocation: r.office_location,
    },
    student: { id: r.student_id, name: r.student_name, email: r.student_email },
  };
}

function loadBooking(db, id) {
  const row = db.prepare(`${BOOKING_SELECT} WHERE b.id = ?`).get(id);
  if (!row) throw notFound('Booking not found');
  return row;
}

/** Extra line for confirmation messages: the room, or a pointer to the video link. */
function placeText(slot, office) {
  if (slot.mode === 'online') return ' It is an online session; the meeting link is in your booking details.';
  const place = slot.location || office;
  return place ? ` Location: ${place}.` : '';
}

/**
 * Every rule that decides whether a student may take a place in a slot.
 * Shared by booking and rescheduling. `ignoreBookingId` is the appointment being moved
 * (it must not count as a clash with itself).
 */
function assertSlotBookable(db, slot, studentId, now, ignoreBookingId = 0) {
  if (slot.status === 'cancelled') throw conflict('This slot is no longer available', 'SLOT_UNAVAILABLE');
  if (countActive(db, slot.id) >= slot.capacity) {
    throw conflict(slot.capacity > 1 ? 'This session is already full' : 'This slot was just booked by someone else', 'SLOT_UNAVAILABLE');
  }
  if (slot.slot_time <= now) throw conflict('This slot has already started', 'SLOT_IN_PAST');
  if (!slot.faculty_active) throw conflict('This faculty member is not accepting bookings', 'FACULTY_INACTIVE');
  if (db.prepare("SELECT 1 FROM bookings WHERE slot_id = ? AND student_id = ? AND status <> 'cancelled'").get(slot.id, studentId)) {
    throw conflict('You already have a place in this slot', 'ALREADY_BOOKED');
  }
  const clash = db
    .prepare(
      `SELECT s.slot_time FROM bookings b JOIN slots s ON s.id = b.slot_id
       WHERE b.student_id = ? AND b.status = 'confirmed' AND b.id <> ? AND s.slot_time < ? AND s.end_time > ?`
    )
    .get(studentId, ignoreBookingId, slot.end_time, slot.slot_time);
  if (clash) throw conflict('You already have another appointment at this time', 'STUDENT_TIME_CLASH');
}

const SLOT_FOR_BOOKING = `
  SELECT s.*, u.name AS faculty_name, u.is_active AS faculty_active, u.office_location
  FROM slots s JOIN users u ON u.id = s.faculty_id WHERE s.id = ?`;

/**
 * THE BOOKING ENGINE.
 *
 * Integrity is enforced in layers, all inside one IMMEDIATE transaction
 * (which takes SQLite's write lock up front, so concurrent bookers - even from
 * separate processes - are serialised):
 *   1. availability checks  - slot live, has a free place, in the future, faculty active,
 *                             no clash, student under the upcoming-booking limit
 *   2. the INSERT           - trg_bookings_capacity refuses a booking beyond the slot's
 *                             capacity, and a unique index stops a student holding two
 *                             places in one slot, even for code that bypasses this function
 *   3. status sync          - the slot flips to 'booked' once its last place is taken
 * Any failure throws, which rolls back every write in the transaction.
 */
export function createBooking(db, { slotId, studentId, note }) {
  const sid = requireInt(slotId, 'slot_id', { min: 1 });
  const cleanNote = requireString(note, 'Note', { optional: true, max: 500, min: 0 });

  const tx = db.transaction(() => {
    const now = nowIso();
    const slot = db.prepare(SLOT_FOR_BOOKING).get(sid);
    if (!slot) throw notFound('This slot does not exist');
    assertSlotBookable(db, slot, studentId, now);
    if (countUpcoming(db, studentId, now) >= config.maxUpcomingBookings) {
      throw conflict(`You can hold at most ${config.maxUpcomingBookings} upcoming bookings. Cancel one first.`, 'LIMIT_REACHED');
    }

    const bookingId = Number(
      db.prepare('INSERT INTO bookings (slot_id, student_id, note) VALUES (?,?,?)').run(sid, studentId, cleanNote).lastInsertRowid
    );
    syncSlotStatus(db, sid);

    const student = db.prepare('SELECT name FROM users WHERE id = ?').get(studentId);
    const when = formatSlotTime(slot.slot_time);
    const notes = [
      createNotification(db, {
        userId: studentId,
        type: 'booking_confirmed',
        title: 'Booking confirmed',
        message: `Your appointment with ${slot.faculty_name} on ${when} is confirmed.${placeText(slot, slot.office_location)}`,
        bookingId,
      }),
      createNotification(db, {
        userId: slot.faculty_id,
        type: 'booking_received',
        title: 'New appointment booked',
        message: `${student.name} booked your slot on ${when}.${cleanNote ? ` Topic: ${cleanNote}` : ''}`,
        bookingId,
      }),
    ];
    logActivity(db, {
      actorId: studentId,
      action: 'booking.created',
      entityType: 'booking',
      entityId: bookingId,
      details: `with ${slot.faculty_name} at ${slot.slot_time}`,
    });
    return { bookingId, notes };
  });

  let result;
  try {
    result = tx.immediate();
  } catch (e) {
    if (/slot is full/.test(e.message)) throw conflict('This slot was just booked by someone else', 'SLOT_UNAVAILABLE');
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') throw conflict('You already have a place in this slot', 'ALREADY_BOOKED');
    throw e;
  }
  dispatchEmails(db, result.notes);
  return toBooking(loadBooking(db, result.bookingId));
}

/**
 * Moves a confirmed appointment to another slot with the SAME faculty member.
 * The new place is taken and the old one released in one transaction, so a student
 * never ends up with both or neither. The old place goes to the waitlist, if any.
 */
export function rescheduleBooking(db, { bookingId, studentId, newSlotId, note }) {
  const id = requireInt(bookingId, 'Booking id', { min: 1 });
  const sid = requireInt(newSlotId, 'slot_id', { min: 1 });
  const cleanNote = requireString(note, 'Note', { optional: true, max: 500, min: 0 });
  const tx = db.transaction(() => {
    const now = nowIso();
    const old = loadBooking(db, id);
    if (old.student_id !== studentId) throw notFound('Booking not found');
    if (old.status !== 'confirmed') throw conflict('Only confirmed appointments can be rescheduled', 'NOT_CANCELLABLE');
    if (!toBooking(old).canStudentChange) {
      throw conflict(
        `Appointments can only be rescheduled up to ${config.cancellationCutoffMinutes} minutes before they start`,
        'CANCELLATION_WINDOW_CLOSED'
      );
    }
    if (sid === old.slot_id) throw badRequest('Choose a different time to move to', { field: 'slot_id' });
    const slot = db.prepare(SLOT_FOR_BOOKING).get(sid);
    if (!slot) throw notFound('This slot does not exist');
    if (slot.faculty_id !== old.faculty_id) {
      throw badRequest('You can only reschedule to another time with the same faculty member', { field: 'slot_id' });
    }
    assertSlotBookable(db, slot, studentId, now, id);

    const newId = Number(
      db
        .prepare('INSERT INTO bookings (slot_id, student_id, note, rescheduled_from) VALUES (?,?,?,?)')
        .run(sid, studentId, cleanNote ?? old.note, id).lastInsertRowid
    );
    const released = db
      .prepare(
        `UPDATE bookings SET status = 'cancelled', status_changed_at = ?, cancelled_by = 'student', cancel_reason = 'Rescheduled'
         WHERE id = ? AND status = 'confirmed'`
      )
      .run(now, id);
    if (released.changes !== 1) throw conflict('This booking was changed by someone else. Refresh and try again.');
    syncSlotStatus(db, sid);
    syncSlotStatus(db, old.slot_id);
    voidSwapsForBooking(db, id);

    const from = formatSlotTime(old.slot_time);
    const to = formatSlotTime(slot.slot_time);
    const notes = [
      createNotification(db, {
        userId: studentId,
        type: 'booking_confirmed',
        title: 'Appointment rescheduled',
        message: `Your appointment with ${slot.faculty_name} moved from ${from} to ${to}.${placeText(slot, slot.office_location)}`,
        bookingId: newId,
      }),
      createNotification(db, {
        userId: slot.faculty_id,
        type: 'booking_received',
        title: 'Appointment rescheduled',
        message: `${old.student_name} moved their appointment from ${from} to ${to}.`,
        bookingId: newId,
      }),
      ...promoteFromWaitlist(db, old.slot_id),
    ];
    logActivity(db, {
      actorId: studentId,
      action: 'booking.rescheduled',
      entityType: 'booking',
      entityId: newId,
      details: `from ${old.slot_time} to ${slot.slot_time}`,
    });
    return { newId, notes };
  });
  let result;
  try {
    result = tx.immediate();
  } catch (e) {
    if (/slot is full/.test(e.message)) throw conflict('That slot was just taken by someone else', 'SLOT_UNAVAILABLE');
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') throw conflict('You already have a place in this slot', 'ALREADY_BOOKED');
    throw e;
  }
  dispatchEmails(db, result.notes);
  return toBooking(loadBooking(db, result.newId));
}

export function getBookingForUser(db, id, user) {
  const row = loadBooking(db, id);
  if (user.role === 'student' && row.student_id !== user.id) throw notFound('Booking not found');
  if (user.role === 'faculty' && row.faculty_id !== user.id) throw notFound('Booking not found');
  return toBooking(row);
}

const SCOPES = {
  upcoming: "b.status = 'confirmed' AND s.end_time > @now",
  // confirmed but the time has passed and the faculty has not recorded an outcome yet
  awaiting: "b.status = 'confirmed' AND s.end_time <= @now",
  completed: "b.status = 'completed'",
  no_show: "b.status = 'no_show'",
  cancelled: "b.status = 'cancelled'",
  all: '1 = 1',
};

export function listBookings(db, { studentId, facultyId, scope = 'all', search = '', from, to, limit = 500 }) {
  if (!SCOPES[scope]) throw badRequest(`scope must be one of: ${Object.keys(SCOPES).join(', ')}`);
  const where = [SCOPES[scope]];
  const params = { now: nowIso(), limit };
  if (studentId) {
    where.push('b.student_id = @studentId');
    params.studentId = studentId;
  }
  if (facultyId) {
    where.push('s.faculty_id = @facultyId');
    params.facultyId = facultyId;
  }
  if (search) {
    where.push('(st.name LIKE @q OR st.email LIKE @q OR f.name LIKE @q OR b.note LIKE @q)');
    params.q = `%${search}%`;
  }
  if (from) {
    where.push('s.slot_time >= @from');
    params.from = from;
  }
  if (to) {
    where.push('s.slot_time < @to');
    params.to = to;
  }
  const asc = scope === 'upcoming' || (from && to);
  return db
    .prepare(`${BOOKING_SELECT} WHERE ${where.join(' AND ')} ORDER BY s.slot_time ${asc ? 'ASC' : 'DESC'} LIMIT @limit`)
    .all(params)
    .map((r) => toBooking(r, params.now));
}

/**
 * Cancels a confirmed booking.
 *  - student: own booking, at least CANCELLATION_CUTOFF_MINUTES before start; the slot re-opens.
 *  - faculty: booking on own slot; the slot is withdrawn (cancelled).
 *  - admin:   any confirmed booking, reason required; the place is freed and offered to the waitlist.
 *            Both the student and the faculty member are notified.
 */
export function cancelBooking(db, { bookingId, user, reason }) {
  const id = requireInt(bookingId, 'Booking id', { min: 1 });
  const cleanReason = requireString(reason, 'Reason', { optional: true, max: 300, min: 0 });
  const tx = db.transaction(() => {
    const row = loadBooking(db, id);
    const now = nowIso();
    if (user.role === 'student') {
      if (row.student_id !== user.id) throw notFound('Booking not found');
      if (row.status !== 'confirmed') throw conflict('Only confirmed appointments can be cancelled', 'NOT_CANCELLABLE');
      if (!toBooking(row).canStudentCancel) {
        throw conflict(
          `Appointments can only be cancelled up to ${config.cancellationCutoffMinutes} minutes before they start`,
          'CANCELLATION_WINDOW_CLOSED'
        );
      }
    } else if (user.role === 'faculty') {
      if (row.faculty_id !== user.id) throw notFound('Booking not found');
      if (row.status !== 'confirmed') throw conflict('Only confirmed appointments can be cancelled', 'NOT_CANCELLABLE');
    } else if (user.role === 'admin') {
      // Admin override: any confirmed appointment, but a reason is required because both
      // the student and the faculty member are shown it.
      if (row.status !== 'confirmed') throw conflict('Only confirmed appointments can be cancelled', 'NOT_CANCELLABLE');
      if (!cleanReason || cleanReason.trim().length < 3) {
        throw badRequest('Give a reason; the student and the faculty member will see it', { field: 'reason' });
      }
    } else {
      throw forbidden();
    }

    const upd = db
      .prepare(
        `UPDATE bookings SET status = 'cancelled', status_changed_at = ?, cancelled_by = ?, cancel_reason = ?
         WHERE id = ? AND status = 'confirmed'`
      )
      .run(now, user.role, cleanReason, id);
    if (upd.changes !== 1) throw conflict('This booking was changed by someone else. Refresh and try again.');

    voidSwapsForBooking(db, id);
    const notes = [];
    if (user.role === 'faculty' && row.capacity === 1) {
      // A faculty cancellation of a one-to-one slot withdraws the slot (and closes its waitlist).
      db.prepare("UPDATE slots SET status = 'cancelled', cancelled_at = ? WHERE id = ?").run(now, row.slot_id);
      notes.push(...expireWaitlist(db, row.slot_id));
    } else {
      // Otherwise just one place is freed: re-open the slot and offer it to the waitlist.
      syncSlotStatus(db, row.slot_id);
      if (row.slot_time > now) notes.push(...promoteFromWaitlist(db, row.slot_id));
    }

    const when = formatSlotTime(row.slot_time);
    const reasonText = cleanReason ? ` Reason: ${cleanReason}` : '';
    const freed = row.capacity > 1 ? 'A place is free again.' : 'The slot is open again.';
    if (user.role === 'student') {
      notes.push(
        createNotification(db, {
          userId: row.faculty_id,
          type: 'booking_cancelled',
          title: 'Appointment cancelled by student',
          message: `${row.student_name} cancelled their appointment on ${when}. ${freed}${reasonText}`,
          bookingId: id,
        }),
        createNotification(db, {
          userId: row.student_id,
          type: 'booking_cancelled',
          title: 'Appointment cancelled',
          message: `You cancelled your appointment with ${row.faculty_name} on ${when}.`,
          bookingId: id,
        })
      );
    } else if (user.role === 'admin') {
      notes.push(
        createNotification(db, {
          userId: row.student_id,
          type: 'booking_cancelled',
          title: 'Appointment cancelled by administrator',
          message: `An administrator cancelled your appointment with ${row.faculty_name} on ${when}.${reasonText}`,
          bookingId: id,
        }),
        createNotification(db, {
          userId: row.faculty_id,
          type: 'booking_cancelled',
          title: 'Appointment cancelled by administrator',
          message: `An administrator cancelled ${row.student_name}'s appointment with you on ${when}. ${freed}${reasonText}`,
          bookingId: id,
        })
      );
    } else {
      notes.push(
        createNotification(db, {
          userId: row.student_id,
          type: 'booking_cancelled',
          title: 'Appointment cancelled by faculty',
          message: `${row.faculty_name} cancelled your appointment on ${when}.${reasonText}`,
          bookingId: id,
        })
      );
    }
    logActivity(db, {
      actorId: user.id,
      action: 'booking.cancelled',
      entityType: 'booking',
      entityId: id,
      details: `by ${user.role}${cleanReason ? `: ${cleanReason}` : ''}`,
    });
    return notes;
  });
  const notes = tx.immediate();
  dispatchEmails(db, notes);
  return toBooking(loadBooking(db, id));
}

/**
 * Faculty records the outcome of an appointment.
 * 'completed' can be recorded at any time (a meeting can happen early);
 * 'no_show' only once the appointment's start time has passed.
 * Outcomes can be corrected (completed <-> no_show); cancelled bookings cannot be changed.
 */
export function recordOutcome(db, { bookingId, facultyId, status }) {
  const id = requireInt(bookingId, 'Booking id', { min: 1 });
  oneOf(status, ['completed', 'no_show'], 'status');
  const tx = db.transaction(() => {
    const row = loadBooking(db, id);
    if (row.faculty_id !== facultyId) throw notFound('Booking not found');
    if (row.status === 'cancelled') throw conflict('Cancelled appointments cannot be updated', 'BOOKING_CANCELLED');
    if (row.status === status) return null;
    if (status === 'no_show' && row.slot_time > nowIso()) {
      throw conflict('You can only mark a no-show after the appointment has started', 'TOO_EARLY');
    }
    db.prepare('UPDATE bookings SET status = ?, status_changed_at = ? WHERE id = ? AND status <> ?').run(
      status,
      nowIso(),
      id,
      'cancelled'
    );
    const when = formatSlotTime(row.slot_time);
    const note = createNotification(db, {
      userId: row.student_id,
      type: 'outcome_recorded',
      title: status === 'completed' ? 'Appointment completed' : 'Marked as no-show',
      message:
        status === 'completed'
          ? `${row.faculty_name} marked your appointment on ${when} as completed.`
          : `${row.faculty_name} recorded that you did not attend your appointment on ${when}.`,
      bookingId: id,
    });
    logActivity(db, {
      actorId: facultyId,
      action: status === 'completed' ? 'booking.completed' : 'booking.no_show',
      entityType: 'booking',
      entityId: id,
      details: row.student_name,
    });
    return note;
  });
  const note = tx.immediate();
  if (note) dispatchEmails(db, [note]);
  return toBooking(loadBooking(db, id));
}
