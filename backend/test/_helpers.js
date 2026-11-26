import './_env.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase, setDb } from '../src/database/db.js';
import { createApp } from '../src/app.js';
import { insertUser } from '../src/services/userService.js';

export const PASSWORD = 'Passw0rdOK';

/** Boots an isolated app + file-backed database; returns helpers for HTTP calls. */
export async function startTestServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohs-test-'));
  const dbFile = path.join(dir, 'test.db');
  const db = openDatabase(dbFile);
  setDb(db);
  const app = createApp({ serveFrontend: false });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;

  async function api(method, url, { token, body } = {}) {
    const res = await fetch(base + url, {
      method,
      headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, body: data };
  }

  let counter = 0;
  async function register(role = 'student', extra = {}) {
    counter++;
    const email = `${role}${counter}-${Date.now()}@test.edu`;
    const r = await api('POST', '/auth/register', {
      body: { name: `${role} ${counter}`, email, password: PASSWORD, confirmPassword: PASSWORD, role, ...extra },
    });
    if (r.status !== 201) throw new Error(`register failed: ${JSON.stringify(r.body)}`);
    return { token: r.body.token, user: r.body.user, email };
  }

  function makeAdmin() {
    const email = `admin${++counter}@test.edu`;
    insertUser(db, { name: 'Test Admin', email, password: PASSWORD, role: 'admin' });
    return api('POST', '/auth/login', { body: { email, password: PASSWORD } }).then((r) => ({ token: r.body.token, user: r.body.user }));
  }

  /** Publishes `count` 15-minute slots starting `hoursAhead` hours from now. */
  async function publish(token, { hoursAhead = 24, count = 2, duration = 15 } = {}) {
    const start = new Date(Date.now() + hoursAhead * 3600_000);
    start.setUTCSeconds(0, 0);
    const end = new Date(start.getTime() + count * duration * 60_000);
    const r = await api('POST', '/slots', { token, body: { start: start.toISOString(), end: end.toISOString(), durationMinutes: duration } });
    if (r.status !== 201) throw new Error(`publish failed: ${JSON.stringify(r.body)}`);
    return r.body.created;
  }

  async function close() {
    await new Promise((r) => server.close(r));
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }

  return { db, dbFile, api, register, makeAdmin, publish, close };
}
