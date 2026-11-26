import './_env.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, PASSWORD } from './_helpers.js';

let t;
before(async () => { t = await startTestServer(); });
after(() => t.close());

test('student registration returns a token and never exposes the password hash', async () => {
  const r = await t.api('POST', '/auth/register', {
    body: { name: 'Asha Student', email: 'Asha@Test.edu', password: PASSWORD, confirmPassword: PASSWORD, role: 'student' },
  });
  assert.equal(r.status, 201);
  assert.ok(r.body.token);
  assert.equal(r.body.user.role, 'student');
  assert.equal(r.body.user.email, 'asha@test.edu');
  assert.equal(r.body.user.password_hash, undefined);
  const stored = t.db.prepare('SELECT password_hash FROM users WHERE email = ?').get('asha@test.edu');
  assert.notEqual(stored.password_hash, PASSWORD);
  assert.match(stored.password_hash, /^\$2[aby]\$/); // bcrypt
});

test('faculty registration stores department and designation', async () => {
  const r = await t.api('POST', '/auth/register', {
    body: { name: 'Dr Faculty', email: 'fac@test.edu', password: PASSWORD, role: 'faculty', department: 'Physics', designation: 'Professor' },
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.role, 'faculty');
  assert.equal(r.body.user.department, 'Physics');
});

test('duplicate email is rejected (case-insensitive)', async () => {
  const r = await t.api('POST', '/auth/register', {
    body: { name: 'Dup', email: 'ASHA@test.edu', password: PASSWORD, role: 'student' },
  });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'EMAIL_TAKEN');
});

test('validation: bad email, weak password, mismatched confirmation, invalid role', async () => {
  const base = { name: 'V', email: 'v@test.edu', password: PASSWORD, role: 'student' };
  assert.equal((await t.api('POST', '/auth/register', { body: { ...base, name: 'Valid Name', email: 'not-an-email' } })).status, 400);
  const weak = await t.api('POST', '/auth/register', { body: { ...base, name: 'Valid Name', password: 'short' } });
  assert.equal(weak.status, 400);
  assert.match(weak.body.error, /8 characters/);
  assert.equal((await t.api('POST', '/auth/register', { body: { ...base, name: 'Valid Name', confirmPassword: 'Different1' } })).status, 400);
  assert.equal((await t.api('POST', '/auth/register', { body: { ...base, name: 'Valid Name', role: 'superuser' } })).status, 400);
});

test('login succeeds with correct credentials and fails with wrong password', async () => {
  const ok = await t.api('POST', '/auth/login', { body: { email: 'asha@test.edu', password: PASSWORD } });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);
  const bad = await t.api('POST', '/auth/login', { body: { email: 'asha@test.edu', password: 'WrongPass1' } });
  assert.equal(bad.status, 401);
  const unknown = await t.api('POST', '/auth/login', { body: { email: 'nobody@test.edu', password: PASSWORD } });
  assert.equal(unknown.status, 401);
  assert.equal(bad.body.error, unknown.body.error, 'does not reveal which emails exist');
});

test('prototype endpoints /signup and /login still work', async () => {
  const s = await t.api('POST', '/signup', { body: { name: 'Legacy User', email: 'legacy@test.edu', password: PASSWORD, role: 'student' } });
  assert.equal(s.status, 201);
  const l = await t.api('POST', '/login', { body: { email: 'legacy@test.edu', password: PASSWORD } });
  assert.equal(l.status, 200);
});

test('protected routes reject missing, invalid and wrong-role tokens', async () => {
  assert.equal((await t.api('GET', '/auth/me')).status, 401);
  assert.equal((await t.api('GET', '/auth/me', { token: 'garbage' })).status, 401);
  const student = await t.register('student');
  const me = await t.api('GET', '/auth/me', { token: student.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.id, student.user.id);
  assert.equal((await t.api('GET', '/admin/analytics', { token: student.token })).status, 403);
  assert.equal((await t.api('POST', '/slots', { token: student.token, body: {} })).status, 403);
  assert.equal((await t.api('GET', '/admin/users', { token: student.token })).status, 403);
});

test('admin self-registration requires the configured access code', async () => {
  const base = { name: 'Would-be Admin', email: 'wba@test.edu', password: PASSWORD, role: 'admin' };
  const noCode = await t.api('POST', '/auth/register', { body: base });
  assert.equal(noCode.status, 403);
  const wrong = await t.api('POST', '/auth/register', { body: { ...base, adminCode: 'guess' } });
  assert.equal(wrong.status, 403);
  assert.equal(t.db.prepare('SELECT COUNT(*) c FROM users WHERE email = ?').get('wba@test.edu').c, 0);
  const right = await t.api('POST', '/auth/register', { body: { ...base, adminCode: 'let-me-in-123' } });
  assert.equal(right.status, 201);
  assert.equal(right.body.user.role, 'admin');
});

test('a deactivated user cannot log in and existing tokens stop working', async () => {
  const admin = await t.makeAdmin();
  const s = await t.register('student');
  const r = await t.api('PATCH', `/admin/users/${s.user.id}`, { token: admin.token, body: { isActive: false } });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.isActive, false);
  assert.equal((await t.api('GET', '/auth/me', { token: s.token })).status, 401);
  const login = await t.api('POST', '/auth/login', { body: { email: s.email, password: PASSWORD } });
  assert.equal(login.status, 403);
});

test('profile update and password change', async () => {
  const f = await t.register('faculty');
  const upd = await t.api('PATCH', '/auth/me', { token: f.token, body: { name: 'Dr Updated', officeLocation: 'Room 9', bio: 'Hello' } });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.user.officeLocation, 'Room 9');
  const badPw = await t.api('POST', '/auth/change-password', { token: f.token, body: { currentPassword: 'nope', newPassword: 'NewPassw0rd' } });
  assert.equal(badPw.status, 400);
  const ok = await t.api('POST', '/auth/change-password', { token: f.token, body: { currentPassword: PASSWORD, newPassword: 'NewPassw0rd' } });
  assert.equal(ok.status, 200);
  assert.equal((await t.api('POST', '/auth/login', { body: { email: f.email, password: 'NewPassw0rd' } })).status, 200);
});
