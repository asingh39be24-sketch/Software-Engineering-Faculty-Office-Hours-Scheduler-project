// Supersedes the prototype's src/booking.test.js: these tests exercise the REAL booking
// service and HTTP API (the prototype test re-implemented the logic inside the test).
import './_env.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestServer } from './_helpers.js';
import { createBooking } from '../src/services/bookingService.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let t, faculty;
before(async () => {
  t = await startTestServer();
  faculty = await t.register('faculty');
});
after(() => t.close());

test('a slot can only be booked once: Student A succeeds, Student B gets 409', async () => {
  const [slot] = await t.publish(faculty.token, { hoursAhead: 30, count: 1 });
  const a = await t.register('student');
  const b = await t.register('student');
  const ra = await t.api('POST', '/bookings', { token: a.token, body: { slot_id: slot.id } });
  assert.equal(ra.status, 201);
  assert.equal(ra.body.booking.status, 'confirmed');
  const rb = await t.api('POST', '/bookings', { token: b.token, body: { slot_id: slot.id } });
  assert.equal(rb.status, 409);
  assert.equal(rb.body.code, 'SLOT_UNAVAILABLE');
  const rows = t.db.prepare('SELECT * FROM bookings WHERE slot_id = ?').all(slot.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].student_id, a.user.id);
  assert.equal(t.db.prepare('SELECT status FROM slots WHERE id = ?').get(slot.id).status, 'booked');
});

test('booking a non-existent slot fails cleanly with 404', async () => {
  const s = await t.register('student');
  const r = await t.api('POST', '/bookings', { token: s.token, body: { slot_id: 999999 } });
  assert.equal(r.status, 404);
  const bad = await t.api('POST', '/bookings', { token: s.token, body: { slot_id: 'abc' } });
  assert.equal(bad.status, 400);
});

test('25 near-simultaneous HTTP booking requests for one slot -> exactly one booking', async () => {
  const [slot] = await t.publish(faculty.token, { hoursAhead: 40, count: 1 });
  const students = await Promise.all(Array.from({ length: 25 }, () => t.register('student')));
  const results = await Promise.all(
    students.map((s) => t.api('POST', '/bookings', { token: s.token, body: { slot_id: slot.id } }))
  );
  const codes = results.map((r) => r.status);
  assert.equal(codes.filter((c) => c === 201).length, 1, `statuses: ${codes}`);
  assert.equal(codes.filter((c) => c === 409).length, 24);
  assert.equal(t.db.prepare('SELECT COUNT(*) c FROM bookings WHERE slot_id = ?').get(slot.id).c, 1);
  assert.equal(t.db.prepare('SELECT status FROM slots WHERE id = ?').get(slot.id).status, 'booked');
});

test('8 separate OS processes racing on the same database file -> exactly one booking', async () => {
  const [slot] = await t.publish(faculty.token, { hoursAhead: 50, count: 1 });
  const students = await Promise.all(Array.from({ length: 8 }, () => t.register('student')));
  const goAt = Date.now() + 1500;
  const worker = path.join(here, 'fixtures', 'book-worker.js');
  const outputs = await Promise.all(
    students.map(
      (s) =>
        new Promise((resolve, reject) => {
          const p = spawn(process.execPath, [worker, t.dbFile, String(slot.id), String(s.user.id), String(goAt)]);
          let out = '';
          p.stdout.on('data', (d) => (out += d));
          p.stderr.on('data', (d) => process.stderr.write(d));
          p.on('close', () => { try { resolve(JSON.parse(out)); } catch (e) { reject(new Error(out || e.message)); } });
        })
    )
  );
  const wins = outputs.filter((o) => o.ok);
  assert.equal(wins.length, 1, JSON.stringify(outputs));
  assert.ok(outputs.filter((o) => !o.ok).every((o) => o.status === 409), JSON.stringify(outputs));
  assert.equal(t.db.prepare("SELECT COUNT(*) c FROM bookings WHERE slot_id = ? AND status <> 'cancelled'").get(slot.id).c, 1);
});

test('the database itself refuses a second active booking for a full slot (capacity trigger)', async () => {
  const [slot] = await t.publish(faculty.token, { hoursAhead: 60, count: 1 });
  const a = await t.register('student');
  const b = await t.register('student');
  createBooking(t.db, { slotId: slot.id, studentId: a.user.id });
  // Bypass the application logic entirely and write straight to the table.
  assert.throws(
    () => t.db.prepare('INSERT INTO bookings (slot_id, student_id) VALUES (?, ?)').run(slot.id, b.user.id),
    (e) => e.code === 'SQLITE_CONSTRAINT_TRIGGER' || /slot is full/.test(e.message)
  );
});

test('a failed booking rolls back: no partial slot update, no booking, no notifications', async () => {
  const [slot] = await t.publish(faculty.token, { hoursAhead: 70, count: 1 });
  const a = await t.register('student');
  // Force the INSERT to fail after the slot UPDATE has run, using a temporary trigger.
  t.db.exec(`CREATE TEMP TRIGGER fail_insert BEFORE INSERT ON bookings BEGIN SELECT RAISE(ABORT, 'boom'); END;`);
  const before = t.db.prepare('SELECT COUNT(*) c FROM notifications').get().c;
  assert.throws(() => createBooking(t.db, { slotId: slot.id, studentId: a.user.id }), /boom/);
  t.db.exec('DROP TRIGGER fail_insert');
  assert.equal(t.db.prepare('SELECT status FROM slots WHERE id = ?').get(slot.id).status, 'open');
  assert.equal(t.db.prepare('SELECT COUNT(*) c FROM bookings WHERE slot_id = ?').get(slot.id).c, 0);
  assert.equal(t.db.prepare('SELECT COUNT(*) c FROM notifications').get().c, before);
});

test('students cannot book past slots, overlapping appointments, or as faculty', async () => {
  const s = await t.register('student');
  // a slot whose time has passed
  const past = t.db
    .prepare("INSERT INTO slots (faculty_id, slot_time, end_time, duration_minutes) VALUES (?,?,?,15)")
    .run(faculty.user.id, new Date(Date.now() - 7200_000).toISOString(), new Date(Date.now() - 6300_000).toISOString());
  const rp = await t.api('POST', '/bookings', { token: s.token, body: { slot_id: Number(past.lastInsertRowid) } });
  assert.equal(rp.status, 409);
  assert.equal(rp.body.code, 'SLOT_IN_PAST');

  const f2 = await t.register('faculty');
  const [x] = await t.publish(faculty.token, { hoursAhead: 80, count: 1 });
  const [y] = await t.publish(f2.token, { hoursAhead: 80, count: 1 }); // same time, other faculty
  assert.equal((await t.api('POST', '/bookings', { token: s.token, body: { slot_id: x.id } })).status, 201);
  const clash = await t.api('POST', '/bookings', { token: s.token, body: { slot_id: y.id } });
  assert.equal(clash.status, 409);
  assert.equal(clash.body.code, 'STUDENT_TIME_CLASH');

  assert.equal((await t.api('POST', '/bookings', { token: faculty.token, body: { slot_id: y.id } })).status, 403);
});

test('booking creates notifications for both student and faculty', async () => {
  const [slot] = await t.publish(faculty.token, { hoursAhead: 90, count: 1 });
  const s = await t.register('student');
  const r = await t.api('POST', '/bookings', { token: s.token, body: { slot_id: slot.id, note: 'Chapter 4 doubts' } });
  const sn = await t.api('GET', '/notifications', { token: s.token });
  assert.ok(sn.body.items.some((n) => n.type === 'booking_confirmed' && n.bookingId === r.body.booking.id));
  const fn = await t.api('GET', '/notifications', { token: faculty.token });
  const received = fn.body.items.find((n) => n.type === 'booking_received' && n.bookingId === r.body.booking.id);
  assert.ok(received);
  assert.match(received.message, /Chapter 4 doubts/);
});

test('student cancellation re-opens the slot, which can then be booked again', async () => {
  const [slot] = await t.publish(faculty.token, { hoursAhead: 100, count: 1 });
  const a = await t.register('student');
  const b = await t.register('student');
  const ra = await t.api('POST', '/bookings', { token: a.token, body: { slot_id: slot.id } });
  // B cannot cancel A's booking
  assert.equal((await t.api('POST', `/bookings/${ra.body.booking.id}/cancel`, { token: b.token })).status, 404);
  const c = await t.api('POST', `/bookings/${ra.body.booking.id}/cancel`, { token: a.token, body: { reason: 'Clash with lab' } });
  assert.equal(c.status, 200);
  assert.equal(c.body.booking.status, 'cancelled');
  assert.equal(t.db.prepare('SELECT status FROM slots WHERE id = ?').get(slot.id).status, 'open');
  // cancelling twice is rejected
  assert.equal((await t.api('POST', `/bookings/${ra.body.booking.id}/cancel`, { token: a.token })).status, 409);
  const rb = await t.api('POST', '/bookings', { token: b.token, body: { slot_id: slot.id } });
  assert.equal(rb.status, 201);
  assert.equal(t.db.prepare("SELECT COUNT(*) c FROM bookings WHERE slot_id = ? AND status <> 'cancelled'").get(slot.id).c, 1);
  const fn = await t.api('GET', '/notifications', { token: faculty.token });
  assert.ok(fn.body.items.some((n) => n.type === 'booking_cancelled' && /Clash with lab/.test(n.message)));
});

test('students cannot cancel inside the cancellation cut-off window', async () => {
  const [slot] = await t.publish(faculty.token, { hoursAhead: 0.5, count: 1 }); // starts in 30 minutes; cut-off is 60
  const s = await t.register('student');
  const r = await t.api('POST', '/bookings', { token: s.token, body: { slot_id: slot.id } });
  assert.equal(r.body.booking.canStudentCancel, false);
  const c = await t.api('POST', `/bookings/${r.body.booking.id}/cancel`, { token: s.token });
  assert.equal(c.status, 409);
  assert.equal(c.body.code, 'CANCELLATION_WINDOW_CLOSED');
});

test('student booking list is scoped to the student and split by status', async () => {
  const s = await t.register('student');
  const other = await t.register('student');
  const slots = await t.publish(faculty.token, { hoursAhead: 110, count: 2 });
  await t.api('POST', '/bookings', { token: s.token, body: { slot_id: slots[0].id } });
  await t.api('POST', '/bookings', { token: other.token, body: { slot_id: slots[1].id } });
  const mine = await t.api('GET', '/bookings?scope=upcoming', { token: s.token });
  assert.equal(mine.body.bookings.length, 1);
  assert.equal(mine.body.bookings[0].student.id, s.user.id);
  const overview = await t.api('GET', '/dashboard/student', { token: s.token });
  assert.equal(overview.body.counts.total, 1);
  assert.equal(overview.body.counts.upcoming, 1);
  assert.equal(overview.body.nextAppointment.slotId, slots[0].id);
});
