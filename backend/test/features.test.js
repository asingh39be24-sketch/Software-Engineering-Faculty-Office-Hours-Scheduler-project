// Service-level tests for: meeting details, recurring availability, group sessions,
// waitlists, rescheduling, student swaps and the upcoming-booking limit.
// They call the services directly against a throw-away SQLite file (no HTTP server needed).
import './_env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../src/database/db.js';
import { publishSlots, previewSlots, listFacultySlots, listOpenSlots, listFullSlots, cancelSlot } from '../src/services/slotService.js';
import { createBooking, cancelBooking, rescheduleBooking, listBookings } from '../src/services/bookingService.js';
import { joinWaitlist, leaveWaitlist, listMyWaitlist } from '../src/services/waitlistService.js';
import { requestSwap, respondSwap, swapCandidates, listSwaps } from '../src/services/swapService.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohs-features-'));
const db = openDatabase(path.join(dir, 'features.db'));
let n = 0;
const user = (role, extra = {}) => {
  n++;
  const id = Number(
    db
      .prepare('INSERT INTO users (name, email, password_hash, role, office_location) VALUES (?,?,?,?,?)')
      .run(`${role} ${n}`, `${role}${n}@t.edu`, 'x', role, extra.office ?? null).lastInsertRowid
  );
  return { id, role, name: `${role} ${n}` };
};
const HOUR = 3600_000;
/** Publish `count` back-to-back 20-minute slots starting `hours` from now. */
const publish = (faculty, hours, count = 1, extra = {}) => {
  const start = new Date(Date.now() + hours * HOUR);
  const end = new Date(start.getTime() + count * 20 * 60_000);
  return publishSlots(db, faculty.id, { start: start.toISOString(), end: end.toISOString(), durationMinutes: 20, ...extra }).created;
};
const code = (c) => (e) => e.code === c;
const notificationsFor = (u) => db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id').all(u.id);
const slotRow = (id) => db.prepare('SELECT * FROM slots WHERE id = ?').get(id);

test('migration: an old (v1) database keeps its data and gains the new columns, trigger and tables', () => {
  const file = path.join(dir, 'old.db');
  const old = openDatabase(file);
  // Rebuild v1's slots/bookings shape by hand (no new columns, one-booking-per-slot index).
  old.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TRIGGER trg_bookings_capacity; DROP TABLE bookings; DROP TABLE slots; DROP TABLE waitlist; DROP TABLE swap_requests;
    CREATE TABLE slots (id INTEGER PRIMARY KEY AUTOINCREMENT, faculty_id INTEGER NOT NULL, slot_time TEXT NOT NULL, end_time TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z', cancelled_at TEXT);
    CREATE TABLE bookings (id INTEGER PRIMARY KEY AUTOINCREMENT, slot_id INTEGER NOT NULL, student_id INTEGER NOT NULL, booked_at TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z',
      status TEXT NOT NULL DEFAULT 'confirmed', note TEXT, status_changed_at TEXT, cancelled_by TEXT, cancel_reason TEXT, reminder_sent_at TEXT);
    CREATE UNIQUE INDEX ux_bookings_slot_active ON bookings(slot_id) WHERE status <> 'cancelled';
    INSERT INTO users (name,email,password_hash,role) VALUES ('f','f@old.edu','x','faculty'),('s','s@old.edu','x','student');
    INSERT INTO slots (faculty_id, slot_time, end_time, duration_minutes, status) VALUES (1,'2030-01-01T10:00:00.000Z','2030-01-01T10:20:00.000Z',20,'booked');
    INSERT INTO bookings (slot_id, student_id, note) VALUES (1,2,'old note');
  `);
  old.close();

  const upgraded = openDatabase(file);
  const slotCols = upgraded.prepare('PRAGMA table_info(slots)').all().map((c) => c.name);
  for (const c of ['mode', 'location', 'meeting_link', 'capacity']) assert.ok(slotCols.includes(c), `slots.${c}`);
  assert.ok(upgraded.prepare('PRAGMA table_info(bookings)').all().some((c) => c.name === 'rescheduled_from'));
  const names = upgraded.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','trigger','index')").all().map((r) => r.name);
  for (const x of ['waitlist', 'swap_requests', 'trg_bookings_capacity', 'ux_bookings_slot_student_active']) assert.ok(names.includes(x), x);
  assert.ok(!names.includes('ux_bookings_slot_active'));
  const slot = upgraded.prepare('SELECT * FROM slots WHERE id = 1').get();
  assert.equal(slot.capacity, 1);
  assert.equal(slot.mode, 'in_person');
  assert.equal(upgraded.prepare('SELECT note FROM bookings WHERE id = 1').get().note, 'old note');
  upgraded.close();
  assert.doesNotThrow(() => openDatabase(file).close(), 'opening an upgraded database again is a no-op');
});

test('meeting details: online needs a link, the link stays private until booked', () => {
  const f = user('faculty', { office: 'Block C, 204' });
  const s = user('student');
  assert.throws(() => publish(f, 200, 1, { mode: 'online' }), code('BAD_REQUEST'));
  assert.throws(() => publish(f, 200, 1, { mode: 'online', meetingLink: 'ftp://nope' }), code('BAD_REQUEST'));
  assert.throws(() => publish(f, 200, 1, { mode: 'hybrid' }), code('BAD_REQUEST'));

  const [online] = publish(f, 200, 1, { mode: 'online', meetingLink: 'https://meet.example.edu/abc', location: 'ignored' });
  const [room] = publish(f, 202, 1, { mode: 'in_person', location: 'Lab 3', meetingLink: 'https://ignored.example' });
  assert.equal(online.mode, 'online');
  assert.equal(online.meetingLink, 'https://meet.example.edu/abc');
  assert.equal(online.location, null);
  assert.equal(room.location, 'Lab 3');
  assert.equal(room.meetingLink, null);

  // Browsing students see the mode and room but never the link.
  const listed = listOpenSlots(db, { facultyId: f.id });
  const pub = listed.find((x) => x.id === online.id);
  assert.equal(pub.mode, 'online');
  assert.equal('meetingLink' in pub, false);
  // Faculty's own list includes it.
  assert.equal(listFacultySlots(db, f.id).find((x) => x.id === online.id).meetingLink, 'https://meet.example.edu/abc');

  const b = createBooking(db, { slotId: online.id, studentId: s.id });
  assert.equal(b.meetingLink, 'https://meet.example.edu/abc');
  assert.equal(b.where, 'Online');
  const b2 = createBooking(db, { slotId: room.id, studentId: s.id });
  assert.equal(b2.where, 'Lab 3');
  assert.equal(b2.meetingLink, null);
  // Without a room set, the faculty member's office is used.
  const [plain] = publish(f, 204, 1);
  assert.equal(createBooking(db, { slotId: plain.id, studentId: user('student').id }).where, 'Block C, 204');
});

test('recurring availability: several dates in one publish, overlaps can be skipped', () => {
  const f = user('faculty');
  const win = (days) => {
    const start = new Date(Date.now() + days * 24 * HOUR + 300 * HOUR);
    return { start: start.toISOString(), end: new Date(start.getTime() + 60 * 60_000).toISOString() };
  };
  const windows = [0, 7, 14, 21].map(win);
  const pv = previewSlots(db, f.id, { windows, durationMinutes: 20 });
  assert.equal(pv.slots.length, 12);
  assert.equal(pv.windowCount, 4);
  assert.equal(pv.conflicts.length, 0);

  const first = publishSlots(db, f.id, { windows, durationMinutes: 20, capacity: 1 });
  assert.equal(first.created.length, 12);
  assert.equal(first.skipped, 0);

  // Publishing the same dates again conflicts, unless the faculty member asks to skip clashes.
  assert.throws(() => publishSlots(db, f.id, { windows, durationMinutes: 20 }), code('SLOT_OVERLAP'));
  const more = [...windows, win(28)];
  const again = publishSlots(db, f.id, { windows: more, durationMinutes: 20, skipConflicts: true });
  assert.equal(again.created.length, 3);
  assert.equal(again.skipped, 12);
  // Skipping cannot publish nothing.
  assert.throws(() => publishSlots(db, f.id, { windows, durationMinutes: 20, skipConflicts: true }), code('SLOT_OVERLAP'));

  assert.throws(() => publishSlots(db, f.id, { windows: [], durationMinutes: 20 }), code('BAD_REQUEST'));
  const w0 = win(60);
  assert.throws(() => previewSlots(db, f.id, { windows: [w0, w0], durationMinutes: 20 }), /overlap each other/);
});

test('group session: places are counted, never exceeded, and the slot fills up', () => {
  const f = user('faculty');
  const [slot] = publish(f, 100, 1, { capacity: 3 });
  const [a, b, c, d] = [user('student'), user('student'), user('student'), user('student')];
  createBooking(db, { slotId: slot.id, studentId: a.id });
  createBooking(db, { slotId: slot.id, studentId: b.id });
  assert.equal(slotRow(slot.id).status, 'open');
  assert.equal(listOpenSlots(db, { facultyId: f.id }).find((x) => x.id === slot.id).spotsLeft, 1);
  assert.throws(() => createBooking(db, { slotId: slot.id, studentId: a.id }), code('ALREADY_BOOKED'));
  createBooking(db, { slotId: slot.id, studentId: c.id });
  assert.equal(slotRow(slot.id).status, 'booked');
  assert.throws(() => createBooking(db, { slotId: slot.id, studentId: d.id }), code('SLOT_UNAVAILABLE'));
  assert.equal(listFullSlots(db, { facultyId: f.id }).length, 1);

  // The database itself refuses a fourth place, even when the service is bypassed.
  assert.throws(
    () => db.prepare('INSERT INTO bookings (slot_id, student_id) VALUES (?,?)').run(slot.id, d.id),
    (e) => e.code === 'SQLITE_CONSTRAINT_TRIGGER' || /slot is full/.test(e.message)
  );

  // The faculty list shows everyone booked; the slot cannot be withdrawn while people are in it.
  const mine = listFacultySlots(db, f.id).find((x) => x.id === slot.id);
  assert.equal(mine.bookings.length, 3);
  assert.equal(mine.bookedCount, 3);
  assert.throws(() => cancelSlot(db, f.id, slot.id), code('SLOT_BOOKED'));

  // One student leaving frees exactly one place; faculty cancelling one student does not withdraw the slot.
  const bk = listBookings(db, { studentId: b.id, scope: 'upcoming' })[0];
  cancelBooking(db, { bookingId: bk.id, user: b });
  assert.equal(slotRow(slot.id).status, 'open');
  const ak = listBookings(db, { studentId: a.id, scope: 'upcoming' })[0];
  cancelBooking(db, { bookingId: ak.id, user: f });
  assert.equal(slotRow(slot.id).status, 'open');
  assert.equal(db.prepare("SELECT COUNT(*) c FROM bookings WHERE slot_id = ? AND status <> 'cancelled'").get(slot.id).c, 1);
});

test('waitlist: join a full slot, first in line is promoted automatically when a place frees up', () => {
  const f = user('faculty');
  const [slot] = publish(f, 110, 1);
  const [a, w1, w2] = [user('student'), user('student'), user('student')];
  const [free] = publish(f, 112, 1);
  assert.throws(() => joinWaitlist(db, { slotId: free.id, studentId: w1.id }), code('SLOT_HAS_SPACE'));

  const first = createBooking(db, { slotId: slot.id, studentId: a.id });
  assert.throws(() => joinWaitlist(db, { slotId: slot.id, studentId: a.id }), code('ALREADY_BOOKED'));
  assert.equal(joinWaitlist(db, { slotId: slot.id, studentId: w1.id }).position, 1);
  assert.equal(joinWaitlist(db, { slotId: slot.id, studentId: w2.id }).position, 2);
  assert.throws(() => joinWaitlist(db, { slotId: slot.id, studentId: w1.id }), code('ALREADY_WAITING'));
  assert.equal(listMyWaitlist(db, w2.id)[0].position, 2);
  assert.equal(listOpenSlots(db, { facultyId: f.id, viewerId: w2.id }).some((x) => x.id === slot.id), false);
  assert.equal(listFullSlots(db, { facultyId: f.id, viewerId: w2.id })[0].waitlistPosition, 2);

  leaveWaitlist(db, { slotId: slot.id, studentId: w1.id });
  assert.throws(() => leaveWaitlist(db, { slotId: slot.id, studentId: w1.id }), code('NOT_FOUND'));
  joinWaitlist(db, { slotId: slot.id, studentId: w1.id }); // back, now behind w2

  cancelBooking(db, { bookingId: first.id, user: a });
  const owner = db.prepare("SELECT student_id FROM bookings WHERE slot_id = ? AND status = 'confirmed'").get(slot.id);
  assert.equal(owner.student_id, w2.id, 'w2 was ahead of w1');
  assert.equal(slotRow(slot.id).status, 'booked');
  assert.ok(notificationsFor(w2).some((x) => x.title.startsWith('A place opened up')));
  assert.equal(db.prepare("SELECT status FROM waitlist WHERE student_id = ? AND slot_id = ? ORDER BY id DESC").get(w2.id, slot.id).status, 'promoted');
  assert.equal(listMyWaitlist(db, w1.id)[0].position, 1);
});

test('waitlist: students with a clash or at the booking limit are skipped; withdrawn slots close the queue', () => {
  const f = user('faculty');
  const g = user('faculty');
  const [slot] = publish(f, 120, 1);
  const [a, clashy, ok] = [user('student'), user('student'), user('student')];
  const held = createBooking(db, { slotId: slot.id, studentId: a.id });
  joinWaitlist(db, { slotId: slot.id, studentId: clashy.id });
  joinWaitlist(db, { slotId: slot.id, studentId: ok.id });
  // clashy books another faculty member at the very same time after joining the queue
  const sameTime = publishSlots(db, g.id, {
    start: slot.start, end: slot.end, durationMinutes: 20,
  }).created[0];
  createBooking(db, { slotId: sameTime.id, studentId: clashy.id });
  cancelBooking(db, { bookingId: held.id, user: a });
  assert.equal(db.prepare("SELECT student_id FROM bookings WHERE slot_id = ? AND status = 'confirmed'").get(slot.id).student_id, ok.id);
  assert.equal(listMyWaitlist(db, clashy.id).length, 1, 'clashy stays on the list');

  // Faculty withdrawing a slot that still has a waitlist (nobody booked) notifies and closes it.
  const [lonely] = publish(f, 130, 1, { capacity: 1 });
  const x = user('student');
  const y = user('student');
  const bx = createBooking(db, { slotId: lonely.id, studentId: x.id });
  joinWaitlist(db, { slotId: lonely.id, studentId: y.id });
  cancelBooking(db, { bookingId: bx.id, user: f }); // faculty cancels a one-to-one slot -> withdrawn
  assert.equal(slotRow(lonely.id).status, 'cancelled');
  assert.equal(listMyWaitlist(db, y.id).length, 0);
  assert.ok(notificationsFor(y).some((m) => m.title === 'Waitlisted slot withdrawn'));
});

test('upcoming-booking limit: a fourth upcoming appointment is refused until one is cancelled', () => {
  const f = user('faculty');
  const s = user('student');
  const slots = [140, 141, 142, 143].map((h) => publish(f, h, 1)[0]);
  const made = slots.slice(0, 3).map((x) => createBooking(db, { slotId: x.id, studentId: s.id }));
  assert.throws(() => createBooking(db, { slotId: slots[3].id, studentId: s.id }), code('LIMIT_REACHED'));
  assert.equal(slotRow(slots[3].id).status, 'open', 'a refused booking changes nothing');
  cancelBooking(db, { bookingId: made[0].id, user: s });
  assert.doesNotThrow(() => createBooking(db, { slotId: slots[3].id, studentId: s.id }));
  // The limit also applies to joining a waitlist.
  const [full] = publish(f, 150, 1);
  createBooking(db, { slotId: full.id, studentId: user('student').id });
  assert.throws(() => joinWaitlist(db, { slotId: full.id, studentId: s.id }), code('LIMIT_REACHED'));
});

test('rescheduling: moves to another slot of the same faculty atomically', () => {
  const f = user('faculty');
  const other = user('faculty');
  const s = user('student');
  const [s1, s2] = publish(f, 160, 2);
  const [theirs] = publish(other, 161, 1);
  const w = user('student');
  const b = createBooking(db, { slotId: s1.id, studentId: s.id, note: 'topic A' });

  assert.throws(() => rescheduleBooking(db, { bookingId: b.id, studentId: s.id, newSlotId: s1.id }), code('BAD_REQUEST'));
  assert.throws(() => rescheduleBooking(db, { bookingId: b.id, studentId: s.id, newSlotId: theirs.id }), code('BAD_REQUEST'));
  assert.throws(() => rescheduleBooking(db, { bookingId: b.id, studentId: w.id, newSlotId: s2.id }), code('NOT_FOUND'));

  const moved = rescheduleBooking(db, { bookingId: b.id, studentId: s.id, newSlotId: s2.id });
  assert.equal(moved.slotId, s2.id);
  assert.equal(moved.note, 'topic A', 'the topic carries over');
  assert.equal(moved.rescheduledFrom, b.id);
  assert.equal(slotRow(s1.id).status, 'open');
  assert.equal(slotRow(s2.id).status, 'booked');
  const oldRow = db.prepare('SELECT status, cancel_reason FROM bookings WHERE id = ?').get(b.id);
  assert.deepEqual({ ...oldRow }, { status: 'cancelled', cancel_reason: 'Rescheduled' });
  assert.equal(listBookings(db, { studentId: s.id, scope: 'upcoming' }).length, 1);
  assert.ok(notificationsFor(f).some((x) => x.title === 'Appointment rescheduled'));

  // A full slot cannot be moved into; a failed move changes nothing.
  const [s3] = publish(f, 163, 1);
  createBooking(db, { slotId: s3.id, studentId: w.id });
  assert.throws(() => rescheduleBooking(db, { bookingId: moved.id, studentId: s.id, newSlotId: s3.id }), code('SLOT_UNAVAILABLE'));
  assert.equal(db.prepare('SELECT status FROM bookings WHERE id = ?').get(moved.id).status, 'confirmed');

  // The place a student gives up goes to the waitlist.
  const q = user('student');
  joinWaitlist(db, { slotId: s3.id, studentId: q.id });
  const [s4] = publish(f, 165, 1);
  const wb = listBookings(db, { studentId: w.id, scope: 'upcoming' })[0];
  rescheduleBooking(db, { bookingId: wb.id, studentId: w.id, newSlotId: s4.id });
  assert.equal(db.prepare("SELECT student_id FROM bookings WHERE slot_id = ? AND status = 'confirmed'").get(s3.id).student_id, q.id);

  // Too close to the start: same cut-off as cancelling.
  const [soon] = publish(f, 0.5, 1);
  const [later] = publish(f, 170, 1);
  const bs = createBooking(db, { slotId: soon.id, studentId: user('student').id });
  assert.throws(() => rescheduleBooking(db, { bookingId: bs.id, studentId: bs.student.id, newSlotId: later.id }), code('CANCELLATION_WINDOW_CLOSED'));
});

test('swaps: two students exchange appointments with the same faculty member', () => {
  const f = user('faculty');
  const g = user('faculty');
  const [a, b, c] = [user('student'), user('student'), user('student')];
  const [s1, s2] = publish(f, 180, 2);
  const [s3] = publish(f, 185, 1);
  const ba = createBooking(db, { slotId: s1.id, studentId: a.id, note: 'A topic' });
  const bb = createBooking(db, { slotId: s2.id, studentId: b.id, note: 'B topic' });
  const bc = createBooking(db, { slotId: s3.id, studentId: c.id });

  const cands = swapCandidates(db, { bookingId: ba.id, studentId: a.id });
  assert.deepEqual(cands.map((x) => x.bookingId).sort(), [bb.id, bc.id].sort());
  assert.throws(() => swapCandidates(db, { bookingId: ba.id, studentId: b.id }), code('NOT_FOUND'));

  assert.throws(() => requestSwap(db, { myBookingId: ba.id, targetBookingId: ba.id, studentId: a.id }), code('BAD_REQUEST'));
  assert.throws(() => requestSwap(db, { myBookingId: bb.id, targetBookingId: ba.id, studentId: a.id }), code('NOT_FOUND'));
  const swap = requestSwap(db, { myBookingId: ba.id, targetBookingId: bb.id, studentId: a.id });
  assert.throws(() => requestSwap(db, { myBookingId: ba.id, targetBookingId: bb.id, studentId: a.id }), code('DUPLICATE_SWAP'));
  assert.equal(listSwaps(db, b.id).incoming.length, 1);
  assert.equal(listSwaps(db, a.id).outgoing.length, 1);
  assert.ok(notificationsFor(b).some((x) => x.title === 'Swap request'));

  assert.throws(() => respondSwap(db, { swapId: swap.id, studentId: a.id, action: 'accept' }), code('FORBIDDEN'));
  assert.throws(() => respondSwap(db, { swapId: swap.id, studentId: b.id, action: 'explode' }), code('BAD_REQUEST'));
  assert.equal(respondSwap(db, { swapId: swap.id, studentId: b.id, action: 'accept' }).status, 'accepted');
  const owner = (id) => db.prepare('SELECT student_id, note FROM bookings WHERE id = ?').get(id);
  assert.deepEqual({ ...owner(ba.id) }, { student_id: b.id, note: 'B topic' });
  assert.deepEqual({ ...owner(bb.id) }, { student_id: a.id, note: 'A topic' });
  assert.throws(() => respondSwap(db, { swapId: swap.id, studentId: b.id, action: 'accept' }), code('NOT_PENDING'));
  assert.ok(notificationsFor(f).some((x) => x.title === 'Two students swapped appointments'));

  // Different faculty, a cancelled booking, decline and withdraw.
  const [gs] = publish(g, 190, 1);
  const bg = createBooking(db, { slotId: gs.id, studentId: c.id });
  assert.throws(() => requestSwap(db, { myBookingId: ba.id, targetBookingId: bg.id, studentId: b.id }), code('BAD_REQUEST'));
  const r1 = requestSwap(db, { myBookingId: bc.id, targetBookingId: ba.id, studentId: c.id });
  assert.equal(respondSwap(db, { swapId: r1.id, studentId: b.id, action: 'reject' }).status, 'rejected');
  const r2 = requestSwap(db, { myBookingId: bc.id, targetBookingId: ba.id, studentId: c.id });
  assert.equal(respondSwap(db, { swapId: r2.id, studentId: c.id, action: 'cancel' }).status, 'cancelled');

  // A booking that is cancelled voids the pending requests that mention it.
  const r3 = requestSwap(db, { myBookingId: bc.id, targetBookingId: ba.id, studentId: c.id });
  cancelBooking(db, { bookingId: ba.id, user: b });
  assert.equal(db.prepare('SELECT status FROM swap_requests WHERE id = ?').get(r3.id).status, 'cancelled');
});

test('swaps: refused when a swap would double-book someone, or time has run out', () => {
  const f = user('faculty');
  const g = user('faculty');
  const [a, b] = [user('student'), user('student')];
  const base = Date.now() + 200 * HOUR;
  const at = (fac, ms) => publishSlots(db, fac.id, { start: new Date(ms).toISOString(), end: new Date(ms + 20 * 60_000).toISOString(), durationMinutes: 20 }).created[0];
  const early = at(f, base);
  const late = at(f, base + 2 * HOUR);
  const clash = at(g, base + 2 * HOUR); // same time as `late`, different faculty member
  const ba = createBooking(db, { slotId: early.id, studentId: a.id });
  const bb = createBooking(db, { slotId: late.id, studentId: b.id });
  createBooking(db, { slotId: clash.id, studentId: a.id });
  const sw = requestSwap(db, { myBookingId: ba.id, targetBookingId: bb.id, studentId: a.id });
  assert.throws(() => respondSwap(db, { swapId: sw.id, studentId: b.id, action: 'accept' }), code('STUDENT_TIME_CLASH'));
  assert.equal(db.prepare('SELECT student_id FROM bookings WHERE id = ?').get(ba.id).student_id, a.id, 'nothing changed');

  // Inside the cut-off window a swap cannot even be requested.
  const [soon] = publish(f, 0.4, 1);
  const bs = createBooking(db, { slotId: soon.id, studentId: user('student').id });
  assert.throws(() => requestSwap(db, { myBookingId: bs.id, targetBookingId: bb.id, studentId: bs.student.id }), code('SWAP_WINDOW_CLOSED'));
});
