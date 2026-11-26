import './_env.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './_helpers.js';

let t, admin, faculty;
before(async () => {
  t = await startTestServer();
  admin = await t.makeAdmin();
  faculty = await t.register('faculty');
});
after(() => t.close());

const notes = async (who) => (await t.api('GET', '/notifications', { token: who.token })).body.items;

test('admin sees every faculty member\'s slots, with who is booked; others cannot', async () => {
  const f2 = await t.register('faculty');
  const [a] = await t.publish(faculty.token, { hoursAhead: 30, count: 1 });
  await t.publish(f2.token, { hoursAhead: 31, count: 1 });
  const s = await t.register('student');
  await t.api('POST', '/bookings', { token: s.token, body: { slot_id: a.id } });

  const all = await t.api('GET', '/admin/slots', { token: admin.token });
  assert.equal(all.status, 200);
  const facIds = new Set(all.body.slots.map((x) => x.facultyId));
  assert.ok(facIds.has(faculty.user.id) && facIds.has(f2.user.id));
  const row = all.body.slots.find((x) => x.id === a.id);
  assert.equal(row.facultyName, faculty.user.name);
  assert.equal(row.bookings.length, 1);
  assert.equal(row.bookings[0].studentName, s.user.name);

  const one = await t.api('GET', `/admin/slots?facultyId=${f2.user.id}`, { token: admin.token });
  assert.ok(one.body.slots.every((x) => x.facultyId === f2.user.id));

  assert.equal((await t.api('GET', '/admin/slots', { token: faculty.token })).status, 403);
  assert.equal((await t.api('GET', '/admin/slots', { token: s.token })).status, 403);
});

test('admin withdraws a booked slot: bookings cancelled, teacher, students and waitlist all told', async () => {
  // A 2-place group slot, filled by two students, with a third on the waitlist.
  const start = new Date(Date.now() + 40 * 3600_000);
  start.setUTCSeconds(0, 0);
  const pub = await t.api('POST', '/slots', {
    token: faculty.token,
    body: { start: start.toISOString(), end: new Date(start.getTime() + 30 * 60_000).toISOString(), durationMinutes: 30, capacity: 2 },
  });
  const slot = pub.body.created[0];
  const [s1, s2, s3] = [await t.register('student'), await t.register('student'), await t.register('student')];
  const b1 = (await t.api('POST', '/bookings', { token: s1.token, body: { slot_id: slot.id } })).body.booking;
  const b2 = (await t.api('POST', '/bookings', { token: s2.token, body: { slot_id: slot.id } })).body.booking;
  assert.equal((await t.api('POST', `/slots/${slot.id}/waitlist`, { token: s3.token })).status, 201);

  // Reason is required, and only admins may do this.
  assert.equal((await t.api('POST', `/admin/slots/${slot.id}/cancel`, { token: admin.token, body: {} })).status, 400);
  assert.equal((await t.api('POST', `/admin/slots/${slot.id}/cancel`, { token: faculty.token, body: { reason: 'x y z' } })).status, 403);

  const r = await t.api('POST', `/admin/slots/${slot.id}/cancel`, { token: admin.token, body: { reason: 'Department meeting' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.slot.status, 'cancelled');
  assert.equal(r.body.cancelledBookings, 2);

  // Both bookings show who cancelled and why, to the student AND the faculty member.
  for (const [who, b] of [[s1, b1], [s2, b2], [faculty, b1]]) {
    const d = (await t.api('GET', `/bookings/${b.id}`, { token: who.token })).body.booking;
    assert.equal(d.status, 'cancelled');
    assert.equal(d.cancelledBy, 'admin');
    assert.equal(d.cancelReason, 'Department meeting');
  }
  assert.ok((await notes(s1)).some((n) => n.title === 'Appointment cancelled by administrator' && n.message.includes('Department meeting')));
  assert.ok((await notes(s2)).some((n) => n.title === 'Appointment cancelled by administrator'));
  const fn = (await notes(faculty)).find((n) => n.title === 'Slot withdrawn by administrator');
  assert.ok(fn && fn.message.includes(s1.user.name) && fn.message.includes(s2.user.name));
  assert.ok((await notes(s3)).some((n) => n.title === 'Waitlisted slot withdrawn'));
  assert.equal(t.db.prepare("SELECT COUNT(*) c FROM waitlist WHERE slot_id = ? AND status = 'waiting'").get(slot.id).c, 0);

  // Can't be booked any more, and can't be withdrawn twice.
  const s4 = await t.register('student');
  assert.equal((await t.api('POST', '/bookings', { token: s4.token, body: { slot_id: slot.id } })).status, 409);
  assert.equal((await t.api('POST', `/admin/slots/${slot.id}/cancel`, { token: admin.token, body: { reason: 'again' } })).status, 409);

  // The action is in the activity log.
  const log = t.db.prepare("SELECT * FROM activity_log WHERE action = 'slot.cancelled' AND entity_id = ?").get(slot.id);
  assert.equal(log.actor_id, admin.user.id);
});

test('admin withdraws an empty slot; the faculty member is told', async () => {
  const [slot] = await t.publish(faculty.token, { hoursAhead: 50, count: 1 });
  const r = await t.api('POST', `/admin/slots/${slot.id}/cancel`, { token: admin.token, body: { reason: 'Room closed' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.cancelledBookings, 0);
  assert.ok((await notes(faculty)).some((n) => n.title === 'Slot withdrawn by administrator' && n.message.includes('Room closed')));
});

test('admin cancels one appointment: place freed for the waitlist, both sides told', async () => {
  const [slot] = await t.publish(faculty.token, { hoursAhead: 60, count: 1 });
  const s1 = await t.register('student');
  const s2 = await t.register('student');
  const b = (await t.api('POST', '/bookings', { token: s1.token, body: { slot_id: slot.id } })).body.booking;
  await t.api('POST', `/slots/${slot.id}/waitlist`, { token: s2.token });

  assert.equal((await t.api('POST', `/bookings/${b.id}/cancel`, { token: admin.token, body: {} })).status, 400); // reason required
  const r = await t.api('POST', `/bookings/${b.id}/cancel`, { token: admin.token, body: { reason: 'Student requested via office' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.booking.cancelledBy, 'admin');

  assert.ok((await notes(s1)).some((n) => n.title === 'Appointment cancelled by administrator'));
  assert.ok((await notes(faculty)).some((n) => n.title === 'Appointment cancelled by administrator' && n.message.includes(s1.user.name)));
  // The freed place went to the waitlisted student.
  const s2b = (await t.api('GET', '/bookings?scope=upcoming', { token: s2.token })).body.bookings;
  assert.ok(s2b.some((x) => x.slotId === slot.id));
});

test('admin cannot withdraw a slot that has already started', async () => {
  const past = t.db
    .prepare('INSERT INTO slots (faculty_id, slot_time, end_time, duration_minutes) VALUES (?,?,?,15)')
    .run(faculty.user.id, new Date(Date.now() - 3600_000).toISOString(), new Date(Date.now() - 2700_000).toISOString());
  const r = await t.api('POST', `/admin/slots/${Number(past.lastInsertRowid)}/cancel`, { token: admin.token, body: { reason: 'too late' } });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'SLOT_IN_PAST');
});
