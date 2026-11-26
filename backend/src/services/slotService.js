import { config } from '../config.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { requireDateTime, requireInt, requireString, oneOf } from '../utils/validate.js';
import { addMinutes, nowIso } from '../utils/time.js';
import { logActivity } from './activityService.js';
import { createNotification, dispatchEmails } from './notificationService.js';
import { voidSwapsForBooking } from './swapService.js';
import { formatSlotTime } from '../utils/time.js';
import { countActive } from './capacity.js';
import { expireWaitlist } from './waitlistService.js';

export const MAX_SLOTS_PER_PUBLISH = 48; // per date (window)
export const MAX_WINDOW_HOURS = 12;
export const MAX_WINDOWS = 60; // dates in one recurring publish
export const MAX_TOTAL_SLOTS = 300; // slots in one publish
export const MAX_CAPACITY = 50;
export const MODES = ['in_person', 'online'];

/**
 * Slot as sent to the client. The video link is private: it is only included where
 * `includeLink` is true (the faculty member's own lists). Students get it through
 * their booking instead.
 */
export function toSlot(r, { includeLink = false } = {}) {
  const capacity = r.capacity ?? 1;
  return {
    id: r.id,
    facultyId: r.faculty_id,
    start: r.slot_time,
    end: r.end_time,
    durationMinutes: r.duration_minutes,
    status: r.status,
    createdAt: r.created_at,
    mode: r.mode ?? 'in_person',
    location: r.location ?? null,
    capacity,
    ...(includeLink && { meetingLink: r.meeting_link ?? null }),
    ...(r.booked_count !== undefined && {
      bookedCount: r.booked_count,
      spotsLeft: Math.max(0, capacity - r.booked_count),
      isFull: r.booked_count >= capacity,
    }),
    ...(r.waitlist_count !== undefined && { waitlistCount: r.waitlist_count }),
    ...(r.viewer_booked !== undefined && { viewerBooked: Boolean(r.viewer_booked) }),
    ...(r.viewer_position !== undefined && { waitlistPosition: r.viewer_position || null }),
    ...(r.faculty_name !== undefined && { facultyName: r.faculty_name }),
  };
}

/** Meeting details and capacity chosen by the faculty member when publishing. */
export function parseSlotOptions(body = {}) {
  const blank = (v) => v === undefined || v === null || v === '';
  const mode = blank(body.mode) ? 'in_person' : oneOf(body.mode, MODES, 'mode');
  const location = requireString(body.location, 'Room / location', { optional: true, max: 120, min: 0 }) || null;
  const link = requireString(body.meetingLink, 'Meeting link', { optional: true, max: 300, min: 0 }) || null;
  if (link && !/^https?:\/\/\S+$/i.test(link)) {
    throw badRequest('The meeting link must start with http:// or https://', { field: 'meetingLink' });
  }
  if (mode === 'online' && !link) throw badRequest('Add a meeting link for an online session', { field: 'meetingLink' });
  const capacity = blank(body.capacity) ? 1 : requireInt(body.capacity, 'Capacity', { min: 1, max: MAX_CAPACITY });
  return {
    mode,
    location: mode === 'in_person' ? location : null,
    meetingLink: mode === 'online' ? link : null,
    capacity,
  };
}

/**
 * Splits [start, end) into back-to-back slots of `durationMinutes`.
 * Validation is shared by the preview and publish endpoints.
 */
export function generateSlots({ start, end, durationMinutes }) {
  const s = requireDateTime(start, 'Start time');
  const e = requireDateTime(end, 'End time');
  const dur = requireInt(durationMinutes, 'Appointment duration', { min: 5, max: 240 });
  if (e <= s) throw badRequest('End time must be after the start time', { field: 'end' });
  if (e - s > MAX_WINDOW_HOURS * 3600_000) {
    throw badRequest(`An availability window can be at most ${MAX_WINDOW_HOURS} hours`, { field: 'end' });
  }
  if (s.getTime() <= Date.now()) throw badRequest('Availability must start in the future', { field: 'start' });
  if (s.getTime() > Date.now() + config.maxPublishDaysAhead * 86400_000) {
    throw badRequest(`You can publish at most ${config.maxPublishDaysAhead} days ahead`, { field: 'start' });
  }
  const slots = [];
  for (let t = s; addMinutes(t, dur) <= e; t = addMinutes(t, dur)) {
    slots.push({ start: t.toISOString(), end: addMinutes(t, dur).toISOString() });
  }
  if (slots.length === 0) {
    throw badRequest('The time window is shorter than one appointment', { field: 'durationMinutes' });
  }
  if (slots.length > MAX_SLOTS_PER_PUBLISH) {
    throw badRequest(`That would create ${slots.length} slots; the maximum per publish is ${MAX_SLOTS_PER_PUBLISH}`);
  }
  const leftoverMinutes = Math.round((e - new Date(slots.at(-1).end)) / 60_000);
  return { slots, durationMinutes: dur, leftoverMinutes };
}

/**
 * One window ({start, end}) or a recurring publish ({windows: [{start, end}, ...]}).
 * The browser works out each repeat date in the faculty member's own time zone and
 * sends the exact instants, so daylight-saving changes cannot shift a recurring slot.
 */
export function generateAll(body = {}) {
  let windows;
  if (Array.isArray(body.windows)) {
    if (body.windows.length === 0) throw badRequest('Choose at least one date', { field: 'windows' });
    if (body.windows.length > MAX_WINDOWS) {
      throw badRequest(`You can publish at most ${MAX_WINDOWS} dates at once`, { field: 'windows' });
    }
    windows = body.windows.map((w) => ({ start: w?.start, end: w?.end }));
  } else {
    windows = [{ start: body.start, end: body.end }];
  }
  const generated = windows.map((w) => generateSlots({ ...w, durationMinutes: body.durationMinutes }));
  const slots = generated.flatMap((g) => g.slots).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  if (slots.length > MAX_TOTAL_SLOTS) {
    throw badRequest(`That would create ${slots.length} slots; the maximum per publish is ${MAX_TOTAL_SLOTS}`);
  }
  for (let i = 1; i < slots.length; i++) {
    if (slots[i].start < slots[i - 1].end) throw badRequest('Two of the chosen dates overlap each other');
  }
  return {
    slots,
    durationMinutes: generated[0].durationMinutes,
    leftoverMinutes: Math.max(...generated.map((g) => g.leftoverMinutes)),
    windowCount: windows.length,
  };
}

/** Existing live slots of this faculty member that overlap any of the new slots. */
function findConflicts(db, facultyId, slots) {
  if (!slots.length) return [];
  const rows = db
    .prepare(
      `SELECT * FROM slots WHERE faculty_id = ? AND status <> 'cancelled'
       AND slot_time < ? AND end_time > ? ORDER BY slot_time`
    )
    .all(facultyId, slots.at(-1).end, slots[0].start)
    .map((r) => toSlot(r));
  return rows.filter((r) => slots.some((s) => r.start < s.end && r.end > s.start));
}

export function previewSlots(db, facultyId, body) {
  const gen = generateAll(body);
  return { ...gen, conflicts: findConflicts(db, facultyId, gen.slots) };
}

export function publishSlots(db, facultyId, body) {
  const gen = generateAll(body);
  const opts = parseSlotOptions(body);
  const skipConflicts = body?.skipConflicts === true;
  const publish = db.transaction(() => {
    // Checked inside the transaction so two simultaneous publishes cannot both pass.
    const overlaps = findConflicts(db, facultyId, gen.slots);
    let toCreate = gen.slots;
    if (overlaps.length) {
      if (skipConflicts) {
        toCreate = gen.slots.filter((s) => !overlaps.some((c) => c.start < s.end && c.end > s.start));
      }
      if (!skipConflicts || toCreate.length === 0) {
        const err = conflict(
          `This overlaps ${overlaps.length} slot${overlaps.length > 1 ? 's' : ''} you have already published`,
          'SLOT_OVERLAP'
        );
        err.details = { conflicts: overlaps };
        throw err;
      }
    }
    const insert = db.prepare(
      `INSERT INTO slots (faculty_id, slot_time, end_time, duration_minutes, mode, location, meeting_link, capacity)
       VALUES (?,?,?,?,?,?,?,?)`
    );
    const ids = toCreate.map((s) =>
      Number(insert.run(facultyId, s.start, s.end, gen.durationMinutes, opts.mode, opts.location, opts.meetingLink, opts.capacity).lastInsertRowid)
    );
    logActivity(db, {
      actorId: facultyId,
      action: 'slots.published',
      entityType: 'slot',
      entityId: ids[0],
      details: `${ids.length} slot${ids.length > 1 ? 's' : ''} from ${toCreate[0].start}${gen.windowCount > 1 ? ` over ${gen.windowCount} dates` : ''}`,
    });
    return { ids, skipped: gen.slots.length - toCreate.length };
  });
  let result;
  try {
    result = publish.immediate();
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') throw conflict('You already have a slot at this time', 'DUPLICATE_SLOT');
    throw e;
  }
  const { ids, skipped } = result;
  const rows = db.prepare(`SELECT * FROM slots WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY slot_time`).all(...ids);
  return { created: rows.map((r) => toSlot(r, { includeLink: true })), leftoverMinutes: gen.leftoverMinutes, skipped };
}

/** Faculty's own slots, each with the people booked into it (one entry for a normal slot). */
export function listFacultySlots(db, facultyId, { scope = 'upcoming', status } = {}) {
  const now = nowIso();
  const where = ['s.faculty_id = ?'];
  const params = [facultyId];
  if (scope === 'upcoming') {
    where.push('s.end_time > ?');
    params.push(now);
  } else if (scope === 'past') {
    where.push('s.end_time <= ?');
    params.push(now);
  }
  if (status) {
    where.push('s.status = ?');
    params.push(status);
  }
  const rows = db
    .prepare(
      `SELECT s.*,
         (SELECT COUNT(*) FROM bookings b WHERE b.slot_id = s.id AND b.status <> 'cancelled') AS booked_count,
         (SELECT COUNT(*) FROM waitlist w WHERE w.slot_id = s.id AND w.status = 'waiting') AS waitlist_count
       FROM slots s WHERE ${where.join(' AND ')}
       ORDER BY s.slot_time ${scope === 'past' ? 'DESC' : 'ASC'} LIMIT 500`
    )
    .all(...params);
  if (!rows.length) return [];
  const people = db
    .prepare(
      `SELECT b.id, b.slot_id, b.status, b.student_id, u.name AS student_name
       FROM bookings b JOIN users u ON u.id = b.student_id
       WHERE b.status <> 'cancelled' AND b.slot_id IN (${rows.map(() => '?').join(',')})
       ORDER BY b.booked_at, b.id`
    )
    .all(...rows.map((r) => r.id));
  const bySlot = new Map();
  for (const p of people) {
    if (!bySlot.has(p.slot_id)) bySlot.set(p.slot_id, []);
    bySlot.get(p.slot_id).push({ id: p.id, status: p.status, studentId: p.student_id, studentName: p.student_name });
  }
  return rows.map((r) => {
    const bookings = bySlot.get(r.id) || [];
    return { ...toSlot(r, { includeLink: true }), bookings, booking: bookings[0] || null };
  });
}

/** Withdraws a slot that has nobody booked into it. */
export function cancelSlot(db, facultyId, slotId) {
  const tx = db.transaction(() => {
    const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(slotId);
    if (!slot) throw notFound('Slot not found');
    if (slot.faculty_id !== facultyId) throw forbidden('This slot belongs to another faculty member');
    if (slot.status === 'cancelled') throw conflict('This slot is already cancelled', 'ALREADY_CANCELLED');
    if (slot.status === 'booked' || countActive(db, slotId) > 0) {
      throw conflict('This slot has a booking. Cancel the appointment instead.', 'SLOT_BOOKED');
    }
    // Conditional update: only succeeds if nobody booked it in the meantime.
    const info = db
      .prepare("UPDATE slots SET status = 'cancelled', cancelled_at = ? WHERE id = ? AND status = 'open'")
      .run(nowIso(), slotId);
    if (info.changes !== 1) throw conflict('This slot was just booked. Cancel the appointment instead.', 'SLOT_BOOKED');
    const notes = expireWaitlist(db, slotId);
    logActivity(db, { actorId: facultyId, action: 'slot.cancelled', entityType: 'slot', entityId: slotId, details: slot.slot_time });
    return { slot, notes };
  });
  const { slot, notes } = tx.immediate();
  dispatchEmails(db, notes);
  return toSlot({ ...slot, status: 'cancelled' }, { includeLink: true });
}

const SLOT_SELECT = `
  SELECT s.*, u.name AS faculty_name,
    (SELECT COUNT(*) FROM bookings b WHERE b.slot_id = s.id AND b.status <> 'cancelled') AS booked_count,
    (SELECT COUNT(*) FROM waitlist w WHERE w.slot_id = s.id AND w.status = 'waiting') AS waitlist_count,
    EXISTS (SELECT 1 FROM bookings b WHERE b.slot_id = s.id AND b.student_id = @viewer AND b.status <> 'cancelled') AS viewer_booked,
    (SELECT COUNT(*) FROM waitlist w2 WHERE w2.slot_id = s.id AND w2.status = 'waiting'
       AND w2.id <= (SELECT w3.id FROM waitlist w3 WHERE w3.slot_id = s.id AND w3.student_id = @viewer AND w3.status = 'waiting')) AS viewer_position
  FROM slots s JOIN users u ON u.id = s.faculty_id`;

function listFutureSlots(db, status, { facultyId, from, to, viewerId } = {}) {
  const where = ['s.status = @status', 's.slot_time > @now', 'u.is_active = 1'];
  const params = { status, now: nowIso(), viewer: viewerId ?? 0 };
  if (facultyId) {
    where.push('s.faculty_id = @facultyId');
    params.facultyId = facultyId;
  }
  if (from) {
    where.push('s.slot_time >= @from');
    params.from = from;
  }
  if (to) {
    where.push('s.slot_time < @to');
    params.to = to;
  }
  return db
    .prepare(`${SLOT_SELECT} WHERE ${where.join(' AND ')} ORDER BY s.slot_time ASC LIMIT 1000`)
    .all(params)
    .map((r) => toSlot(r));
}

/** Future slots that still have a place free, from active faculty (student booking screens). */
export const listOpenSlots = (db, opts) => listFutureSlots(db, 'open', opts);

/** Future slots that are full, so a student can join the waitlist. */
export const listFullSlots = (db, opts) => listFutureSlots(db, 'booked', opts);

// ---------------------------------------------------------------------------
// Admin override
// ---------------------------------------------------------------------------

/**
 * Every faculty member's slots for the admin "Slots" screen, each with the students
 * booked into it. Filters: facultyId, scope (upcoming | past | all), status, from/to.
 */
export function adminListSlots(db, { facultyId, scope = 'upcoming', status, from, to } = {}) {
  const now = nowIso();
  const where = ['1 = 1'];
  const params = [];
  if (facultyId) {
    where.push('s.faculty_id = ?');
    params.push(facultyId);
  }
  if (scope === 'upcoming') {
    where.push('s.end_time > ?');
    params.push(now);
  } else if (scope === 'past') {
    where.push('s.end_time <= ?');
    params.push(now);
  }
  if (status) {
    where.push('s.status = ?');
    params.push(status);
  }
  if (from) {
    where.push('s.slot_time >= ?');
    params.push(from);
  }
  if (to) {
    where.push('s.slot_time < ?');
    params.push(to);
  }
  const rows = db
    .prepare(
      `SELECT s.*, u.name AS faculty_name, u.department AS faculty_department,
         (SELECT COUNT(*) FROM bookings b WHERE b.slot_id = s.id AND b.status <> 'cancelled') AS booked_count,
         (SELECT COUNT(*) FROM waitlist w WHERE w.slot_id = s.id AND w.status = 'waiting') AS waitlist_count
       FROM slots s JOIN users u ON u.id = s.faculty_id
       WHERE ${where.join(' AND ')}
       ORDER BY s.slot_time ${scope === 'past' ? 'DESC' : 'ASC'} LIMIT 500`
    )
    .all(...params);
  if (!rows.length) return [];
  const people = db
    .prepare(
      `SELECT b.id, b.slot_id, b.status, b.student_id, u.name AS student_name, u.email AS student_email
       FROM bookings b JOIN users u ON u.id = b.student_id
       WHERE b.status <> 'cancelled' AND b.slot_id IN (${rows.map(() => '?').join(',')})
       ORDER BY b.booked_at, b.id`
    )
    .all(...rows.map((r) => r.id));
  const bySlot = new Map();
  for (const p of people) {
    if (!bySlot.has(p.slot_id)) bySlot.set(p.slot_id, []);
    bySlot.get(p.slot_id).push({
      id: p.id,
      status: p.status,
      studentId: p.student_id,
      studentName: p.student_name,
      studentEmail: p.student_email,
    });
  }
  return rows.map((r) => ({
    ...toSlot(r, { includeLink: true }),
    facultyDepartment: r.faculty_department,
    bookings: bySlot.get(r.id) || [],
  }));
}

/**
 * An administrator withdraws ANY faculty member's upcoming slot, even one with bookings.
 * In one transaction: every confirmed booking in it is cancelled (cancelled_by = 'admin'),
 * pending swaps on those bookings are voided, the waitlist is closed, and the slot is
 * withdrawn. The faculty member, every booked student and everyone on the waitlist is told,
 * with the reason. A reason is required for that reason.
 */
export function adminCancelSlot(db, { adminId, slotId, reason }) {
  const id = requireInt(slotId, 'Slot id', { min: 1 });
  const why = requireString(reason, 'Reason', { optional: true, max: 300, min: 0 });
  if (!why || why.trim().length < 3) {
    throw badRequest('Give a reason; the faculty member and any booked students will see it', { field: 'reason' });
  }
  const tx = db.transaction(() => {
    const now = nowIso();
    const slot = db
      .prepare('SELECT s.*, u.name AS faculty_name FROM slots s JOIN users u ON u.id = s.faculty_id WHERE s.id = ?')
      .get(id);
    if (!slot) throw notFound('Slot not found');
    if (slot.status === 'cancelled') throw conflict('This slot is already withdrawn', 'ALREADY_CANCELLED');
    if (slot.slot_time <= now) throw conflict('This slot has already started and cannot be withdrawn', 'SLOT_IN_PAST');

    const booked = db
      .prepare(
        `SELECT b.id, b.student_id, u.name AS student_name FROM bookings b JOIN users u ON u.id = b.student_id
         WHERE b.slot_id = ? AND b.status = 'confirmed'`
      )
      .all(id);
    const when = formatSlotTime(slot.slot_time);
    const notes = [];
    const cancel = db.prepare(
      `UPDATE bookings SET status = 'cancelled', status_changed_at = ?, cancelled_by = 'admin', cancel_reason = ?
       WHERE id = ? AND status = 'confirmed'`
    );
    for (const b of booked) {
      cancel.run(now, why, b.id);
      voidSwapsForBooking(db, b.id);
      notes.push(
        createNotification(db, {
          userId: b.student_id,
          type: 'booking_cancelled',
          title: 'Appointment cancelled by administrator',
          message: `An administrator withdrew ${slot.faculty_name}'s slot on ${when}, so your appointment is cancelled. Reason: ${why}`,
          bookingId: b.id,
        })
      );
    }
    const info = db
      .prepare("UPDATE slots SET status = 'cancelled', cancelled_at = ? WHERE id = ? AND status <> 'cancelled'")
      .run(now, id);
    if (info.changes !== 1) throw conflict('This slot was changed by someone else. Refresh and try again.');
    notes.push(...expireWaitlist(db, id));

    const affected = booked.length
      ? ` ${booked.length} booked student${booked.length > 1 ? 's were' : ' was'} notified: ${booked.map((b) => b.student_name).join(', ')}.`
      : '';
    notes.push(
      createNotification(db, {
        userId: slot.faculty_id,
        type: 'booking_cancelled',
        title: 'Slot withdrawn by administrator',
        message: `An administrator withdrew your slot on ${when}.${affected} Reason: ${why}`,
      })
    );
    logActivity(db, {
      actorId: adminId,
      action: 'slot.cancelled',
      entityType: 'slot',
      entityId: id,
      details: `by admin (${slot.faculty_name}, ${slot.slot_time}, ${booked.length} booking${booked.length === 1 ? '' : 's'} cancelled): ${why}`,
    });
    return { notes, cancelledBookings: booked.length };
  });
  const { notes, cancelledBookings } = tx.immediate();
  dispatchEmails(db, notes);
  const row = db.prepare('SELECT * FROM slots WHERE id = ?').get(id);
  return { slot: toSlot(row, { includeLink: true }), cancelledBookings };
}
