import './_env.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './_helpers.js';

let t;
before(async () => { t = await startTestServer(); });
after(() => t.close());

test('read / unread / mark all read, scoped per user', async () => {
  const s = await t.register('student'); // welcome notification
  const other = await t.register('student');
  const f = await t.register('faculty');
  const [slot] = await t.publish(f.token, { hoursAhead: 20, count: 1 });
  await t.api('POST', '/bookings', { token: s.token, body: { slot_id: slot.id } });

  let list = await t.api('GET', '/notifications', { token: s.token });
  assert.equal(list.body.unreadCount, 2);
  assert.ok(list.body.items[0].createdAt);
  const first = list.body.items[0];

  // another user cannot mark it
  assert.equal((await t.api('POST', `/notifications/${first.id}/read`, { token: other.token })).status, 404);
  assert.equal((await t.api('POST', `/notifications/${first.id}/read`, { token: s.token })).status, 200);
  list = await t.api('GET', '/notifications', { token: s.token });
  assert.equal(list.body.unreadCount, 1);
  assert.equal(list.body.items.find((n) => n.id === first.id).isRead, true);

  const unread = await t.api('GET', '/notifications?unread=1', { token: s.token });
  assert.equal(unread.body.items.length, 1);

  const all = await t.api('POST', '/notifications/read-all', { token: s.token });
  assert.equal(all.body.updated, 1);
  list = await t.api('GET', '/notifications', { token: s.token });
  assert.equal(list.body.unreadCount, 0);
  // other user's notifications untouched
  assert.equal((await t.api('GET', '/notifications', { token: other.token })).body.unreadCount, 1);
});
