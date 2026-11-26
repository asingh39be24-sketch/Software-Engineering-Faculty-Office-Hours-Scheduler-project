import './_env.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './_helpers.js';
import { runReminderSweep } from '../src/services/reminderService.js';

let t, f;
before(async () => {
  t = await startTestServer();
  f = await t.register('faculty');
});
after(() => t.close());

const at = (hours) => {
  const d = new Date(Date.now() + hours * 3600_000);
  d.setUTCSeconds(0, 0);
  return d;
};
const window = (h, minutes, duration) => ({
  start: at(h).toISOString(),
  end: new Date(at(h).getTime() + minutes * 60_000).toISOString(),
  durationMinutes: duration,
});

test('publishing a 2-hour window with 20-minute appointments generates 6 slots', async () => {
  const preview = await t.api('POST', '/slots/preview', { token: f.token, body: window(48, 120, 20) });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.slots.length, 6);
  assert.equal(preview.body.conflicts.length, 0);
  const r = await t.api('POST', '/slots', { token: f.token, body: window(48, 120, 20) });
  assert.equal(r.status, 201);
  assert.equal(r.body.created.length, 6);
  assert.ok(r.body.created.every((s) => s.status === 'open' && s.durationMinutes === 20));
  const mine = await t.api('GET', '/slots/mine?scope=upcoming', { token: f.token });
  assert.equal(mine.body.slots.length, 6);
});

test('leftover minutes that do not fit a full appointment are reported, not published', async () => {
  const r = await t.api('POST', '/slots', { token: f.token, body: window(200, 50, 20) });
  assert.equal(r.status, 201);
  assert.equal(r.body.created.length, 2);
  assert.equal(r.body.leftoverMinutes, 10);
});

test('duplicate and overlapping availability is rejected', async () => {
  const dup = await t.api('POST', '/slots', { token: f.token, body: window(48, 120, 20) });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.code, 'SLOT_OVERLAP');
  const overlap = await t.api('POST', '/slots', { token: f.token, body: window(48.5, 60, 15) });
  assert.equal(overlap.status, 409);
  assert.ok(overlap.body.details.conflicts.length > 0);
  const preview = await t.api('POST', '/slots/preview', { token: f.token, body: window(48.5, 60, 15) });
  assert.ok(preview.body.conflicts.length > 0);
  // Adjacent (touching) windows are fine.
  const adjacent = await t.api('POST', '/slots', { token: f.token, body: window(50, 30, 15) });
  assert.equal(adjacent.status, 201);
  // The legacy single-slot body is a duplicate too.
  const legacy = await t.api('POST', '/slots', { token: f.token, body: { slot_time: at(48).toISOString() } });
  assert.equal(legacy.status, 409);
  // A different faculty member may publish the same time.
  const f2 = await t.register('faculty');
  assert.equal((await t.api('POST', '/slots', { token: f2.token, body: window(48, 60, 20) })).status, 201);
});

test('invalid time ranges and past times are rejected', async () => {
  const cases = [
    { body: { ...window(300, 60, 20), end: at(299).toISOString() }, re: /after the start/ },
    { body: window(-2, 60, 20), re: /future/ },
    { body: window(300, 10, 20), re: /shorter than one appointment/ },
    { body: window(300, 60, 2), re: /at least 5/ },
    { body: window(300, 13 * 60, 30), re: /at most 12 hours/ },
    { body: { start: 'yesterday-ish', end: at(1).toISOString(), durationMinutes: 15 }, re: /valid date/ },
  ];
  for (const c of cases) {
    const r = await t.api('POST', '/slots', { token: f.token, body: c.body });
    assert.equal(r.status, 400, JSON.stringify(c.body));
    assert.match(r.body.error, c.re);
  }
});

test('faculty can cancel an unbooked slot but not a booked one; cancelled times can be re-published', async () => {
  const created = (await t.api('POST', '/slots', { token: f.token, body: window(400, 30, 15) })).body.created;
  const s = await t.register('student');
  await t.api('POST', '/bookings', { token: s.token, body: { slot_id: created[1].id } });
  const ok = await t.api('POST', `/slots/${created[0].id}/cancel`, { token: f.token });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.slot.status, 'cancelled');
  const booked = await t.api('POST', `/slots/${created[1].id}/cancel`, { token: f.token });
  assert.equal(booked.status, 409);
  assert.equal(booked.body.code, 'SLOT_BOOKED');
  // another faculty member can't touch it
  const other = await t.register('faculty');
  assert.equal((await t.api('POST', `/slots/${created[0].id}/cancel`, { token: other.token })).status, 403);
  // students no longer see the cancelled slot
  const open = await t.api('GET', `/faculty/${f.user.id}`, { token: s.token });
  assert.ok(!open.body.faculty.slots.some((x) => x.id === created[0].id));
  // re-publish the withdrawn 15 minutes
  const again = await t.api('POST', '/slots', { token: f.token, body: window(400, 15, 15) });
  assert.equal(again.status, 201);
});

test('mark completed, mark no-show, ownership and invalid status', async () => {
  const [slot] = (await t.api('POST', '/slots', { token: f.token, body: window(500, 15, 15) })).body.created;
  const s = await t.register('student');
  const b = (await t.api('POST', '/bookings', { token: s.token, body: { slot_id: slot.id } })).body.booking;

  const other = await t.register('faculty');
  assert.equal((await t.api('PATCH', `/bookings/${b.id}`, { token: other.token, body: { status: 'completed' } })).status, 404);
  assert.equal((await t.api('PATCH', `/bookings/${b.id}`, { token: f.token, body: { status: 'deleted' } })).status, 400);
  assert.equal((await t.api('PATCH', `/bookings/${b.id}`, { token: s.token, body: { status: 'completed' } })).status, 403);
  // no-show before the appointment starts is not allowed
  const early = await t.api('PATCH', `/bookings/${b.id}`, { token: f.token, body: { status: 'no_show' } });
  assert.equal(early.status, 409);

  const done = await t.api('PATCH', `/bookings/${b.id}`, { token: f.token, body: { status: 'completed' } });
  assert.equal(done.status, 200);
  assert.equal(done.body.booking.status, 'completed');
  assert.equal(t.db.prepare('SELECT status FROM bookings WHERE id = ?').get(b.id).status, 'completed');
  const sn = await t.api('GET', '/notifications', { token: s.token });
  assert.ok(sn.body.items.some((n) => n.type === 'outcome_recorded'));

  // no-show on an appointment that has started
  const past = t.db
    .prepare('INSERT INTO slots (faculty_id, slot_time, end_time, duration_minutes, status) VALUES (?,?,?,15,?)')
    .run(f.user.id, new Date(Date.now() - 3600_000).toISOString(), new Date(Date.now() - 2700_000).toISOString(), 'booked');
  const pb = t.db.prepare('INSERT INTO bookings (slot_id, student_id) VALUES (?,?)').run(Number(past.lastInsertRowid), s.user.id);
  const awaiting = await t.api('GET', '/bookings?scope=awaiting', { token: f.token });
  assert.ok(awaiting.body.bookings.some((x) => x.id === Number(pb.lastInsertRowid)));
  const ns = await t.api('PATCH', `/bookings/${pb.lastInsertRowid}`, { token: f.token, body: { status: 'no_show' } });
  assert.equal(ns.status, 200);
  assert.equal(ns.body.booking.status, 'no_show');
});

test('faculty cancelling an appointment withdraws the slot and notifies the student', async () => {
  const [slot] = (await t.api('POST', '/slots', { token: f.token, body: window(600, 15, 15) })).body.created;
  const s = await t.register('student');
  const b = (await t.api('POST', '/bookings', { token: s.token, body: { slot_id: slot.id } })).body.booking;
  const c = await t.api('POST', `/bookings/${b.id}/cancel`, { token: f.token, body: { reason: 'Department meeting' } });
  assert.equal(c.status, 200);
  assert.equal(c.body.booking.cancelledBy, 'faculty');
  assert.equal(t.db.prepare('SELECT status FROM slots WHERE id = ?').get(slot.id).status, 'cancelled');
  const sn = await t.api('GET', '/notifications', { token: s.token });
  assert.ok(sn.body.items.some((n) => n.type === 'booking_cancelled' && /Department meeting/.test(n.message)));
  // and the completed outcome can't be set on a cancelled booking
  assert.equal((await t.api('PATCH', `/bookings/${b.id}`, { token: f.token, body: { status: 'completed' } })).status, 409);
});

test('faculty overview counts and today schedule come from the database', async () => {
  const fac = await t.register('faculty');
  const [slot] = (await t.api('POST', '/slots', { token: fac.token, body: window(3, 15, 15) })).body.created;
  const s = await t.register('student');
  await t.api('POST', '/bookings', { token: s.token, body: { slot_id: slot.id } });
  const dayStart = new Date(Date.now() - 3600_000).toISOString();
  const dayEnd = new Date(Date.now() + 23 * 3600_000).toISOString();
  const o = await t.api('GET', `/dashboard/faculty?dayStart=${dayStart}&dayEnd=${dayEnd}`, { token: fac.token });
  assert.equal(o.status, 200);
  assert.equal(o.body.counts.total, 1);
  assert.equal(o.body.counts.upcoming, 1);
  assert.equal(o.body.today.length, 1);
  assert.equal(o.body.today[0].studentName, s.user.name);
});

test('reminder sweep notifies both parties once per appointment', async () => {
  const fac = await t.register('faculty');
  const [slot] = (await t.api('POST', '/slots', { token: fac.token, body: window(0.5, 15, 15) })).body.created;
  const s = await t.register('student');
  const b = (await t.api('POST', '/bookings', { token: s.token, body: { slot_id: slot.id } })).body.booking;
  const first = runReminderSweep(t.db, { leadMinutes: 60 });
  assert.ok(first.includes(b.id));
  const second = runReminderSweep(t.db, { leadMinutes: 60 });
  assert.ok(!second.includes(b.id), 'not sent twice');
  const count = t.db.prepare("SELECT COUNT(*) c FROM notifications WHERE booking_id = ? AND type = 'reminder'").get(b.id).c;
  assert.equal(count, 2);
});
