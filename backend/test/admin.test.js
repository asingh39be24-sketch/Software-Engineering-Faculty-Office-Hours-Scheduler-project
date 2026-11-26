import './_env.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './_helpers.js';

let t, admin;
before(async () => {
  t = await startTestServer();
  admin = await t.makeAdmin();
});
after(() => t.close());

test('analytics reflect the actual database contents', async () => {
  const empty = await t.api('GET', '/admin/analytics?days=30&tz=UTC', { token: admin.token });
  assert.equal(empty.status, 200);
  assert.equal(empty.body.metrics.bookings.total, 0);
  assert.equal(empty.body.metrics.noShowRate, null);
  assert.equal(empty.body.charts.bookingsOverTime.length, 30);

  const f = await t.register('faculty');
  const slots = await t.publish(f.token, { hoursAhead: 24, count: 4 });
  const s1 = await t.register('student');
  const s2 = await t.register('student');
  const b1 = (await t.api('POST', '/bookings', { token: s1.token, body: { slot_id: slots[0].id } })).body.booking;
  await t.api('POST', '/bookings', { token: s2.token, body: { slot_id: slots[1].id } });
  await t.api('PATCH', `/bookings/${b1.id}`, { token: f.token, body: { status: 'completed' } });

  const a = await t.api('GET', '/admin/analytics?days=7&tz=Asia/Kolkata', { token: admin.token });
  const m = a.body.metrics;
  assert.equal(m.users.students, 2);
  assert.equal(m.users.faculty, 1);
  assert.equal(m.users.admins, 1);
  assert.equal(m.users.total, 4);
  assert.equal(m.bookings.total, 2);
  assert.equal(m.bookings.completed, 1);
  assert.equal(m.bookings.upcoming, 1);
  assert.equal(m.slots.published, 4);
  assert.equal(m.slots.booked, 2);
  assert.equal(m.slots.openUpcoming, 2);
  assert.equal(m.slotUtilization, 50);
  assert.equal(m.noShowRate, 0);
  const todayBucket = a.body.charts.bookingsOverTime.at(-1);
  assert.equal(todayBucket.booked, 2);
  assert.equal(a.body.charts.facultyActivity[0].booked, 2);
  assert.deepEqual(
    a.body.charts.statusDistribution.map((d) => d.count),
    [1, 1, 0, 0]
  );

  const legacy = await t.api('GET', '/analytics', { token: admin.token });
  assert.equal(legacy.body.totalBookings, 2);
  assert.equal(legacy.body.slotUtilization, 50);
});

test('user list, search and role/status filters', async () => {
  await t.register('student', { name: 'Zara Unique' });
  const all = await t.api('GET', '/admin/users', { token: admin.token });
  assert.equal(all.status, 200);
  assert.ok(all.body.users.length >= 5);
  assert.ok(all.body.users.every((u) => u.password_hash === undefined && u.passwordHash === undefined));
  const search = await t.api('GET', '/admin/users?search=zara', { token: admin.token });
  assert.equal(search.body.users.length, 1);
  assert.equal(search.body.users[0].name, 'Zara Unique');
  const faculty = await t.api('GET', '/admin/users?role=faculty', { token: admin.token });
  assert.ok(faculty.body.users.length >= 1 && faculty.body.users.every((u) => u.role === 'faculty'));
  const inactive = await t.api('GET', '/admin/users?status=inactive', { token: admin.token });
  assert.equal(inactive.body.users.length, 0);
});

test('user detail, deactivate/reactivate, self-protection', async () => {
  const s = await t.register('student');
  const d = await t.api('GET', `/admin/users/${s.user.id}`, { token: admin.token });
  assert.equal(d.status, 200);
  assert.equal(d.body.user.stats.total, 0);
  assert.equal((await t.api('PATCH', `/admin/users/${s.user.id}`, { token: admin.token, body: { isActive: false } })).body.user.isActive, false);
  assert.equal((await t.api('PATCH', `/admin/users/${s.user.id}`, { token: admin.token, body: { isActive: true } })).body.user.isActive, true);
  assert.equal((await t.api('PATCH', `/admin/users/${admin.user.id}`, { token: admin.token, body: { isActive: false } })).status, 403);
  assert.equal((await t.api('PATCH', `/admin/users/${s.user.id}`, { token: admin.token, body: { isActive: 'no' } })).status, 400);
});

test('deactivated faculty disappear from the directory and cannot be booked', async () => {
  const f = await t.register('faculty');
  const [slot] = await t.publish(f.token, { hoursAhead: 30, count: 1 });
  const s = await t.register('student');
  await t.api('PATCH', `/admin/users/${f.user.id}`, { token: admin.token, body: { isActive: false } });
  const dir = await t.api('GET', '/faculty', { token: s.token });
  assert.ok(!dir.body.faculty.some((x) => x.id === f.user.id));
  const r = await t.api('POST', '/bookings', { token: s.token, body: { slot_id: slot.id } });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'FACULTY_INACTIVE');
});

test('admins can create another administrator; non-admins cannot', async () => {
  const body = { name: 'Second Admin', email: 'second@test.edu', password: 'Adm1nPassword', role: 'admin' };
  const r = await t.api('POST', '/admin/users', { token: admin.token, body });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.role, 'admin');
  const s = await t.register('student');
  assert.equal((await t.api('POST', '/admin/users', { token: s.token, body: { ...body, email: 'x@test.edu' } })).status, 403);
});

test('monitoring lists recent registrations, bookings, cancellations and activity', async () => {
  const r = await t.api('GET', '/admin/monitoring', { token: admin.token });
  assert.equal(r.status, 200);
  assert.ok(r.body.recentRegistrations.length > 0);
  assert.ok(r.body.recentBookings.length > 0);
  assert.ok(Array.isArray(r.body.recentCancellations));
  assert.ok(r.body.activity.some((a) => a.action === 'booking.created'));
  assert.equal(r.body.system.emailConfigured, false);
});
