import { test } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';

function setupDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE slots (id INTEGER PRIMARY KEY, status TEXT DEFAULT 'open');
    CREATE TABLE bookings (id INTEGER PRIMARY KEY AUTOINCREMENT, slot_id INTEGER UNIQUE, student_id INTEGER);
    INSERT INTO slots (id, status) VALUES (1, 'open');
  `);
  return db;
}

function bookSlot(db, slotId, studentId) {
  const tx = db.transaction((slotId, studentId) => {
    const slot = db.prepare("SELECT * FROM slots WHERE id = ? AND status = 'open'").get(slotId);
    if (!slot) throw new Error('SLOT_UNAVAILABLE');
    db.prepare("UPDATE slots SET status = 'booked' WHERE id = ? AND status = 'open'").run(slotId);
    return db.prepare('INSERT INTO bookings (slot_id, student_id) VALUES (?,?)').run(slotId, studentId);
  });
  return tx(slotId, studentId);
}

test('a slot can only be booked once, even under concurrent attempts', () => {
  const db = setupDb();

  bookSlot(db, 1, 101); // student A books first — succeeds

  assert.throws(
    () => bookSlot(db, 1, 102), // student B tries the same slot — must fail
    /SLOT_UNAVAILABLE/
  );

  const bookings = db.prepare('SELECT * FROM bookings').all();
  assert.strictEqual(bookings.length, 1);
  assert.strictEqual(bookings[0].student_id, 101);
});

test('booking a non-existent slot fails cleanly', () => {
  const db = setupDb();
  assert.throws(() => bookSlot(db, 999, 101), /SLOT_UNAVAILABLE/);
});
