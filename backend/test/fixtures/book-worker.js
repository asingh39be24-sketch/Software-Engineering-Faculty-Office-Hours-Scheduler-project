// Child process used by the concurrency test: opens its OWN connection to the shared
// database file, waits until a common start instant, then tries to book the slot.
import '../_env.js';
import { openDatabase } from '../../src/database/db.js';
import { createBooking } from '../../src/services/bookingService.js';

const [dbFile, slotId, studentId, goAt] = process.argv.slice(2);
const db = openDatabase(dbFile);
while (Date.now() < Number(goAt)) { /* spin so all workers fire together */ }
try {
  const b = createBooking(db, { slotId: Number(slotId), studentId: Number(studentId) });
  process.stdout.write(JSON.stringify({ ok: true, id: b.id }));
} catch (e) {
  process.stdout.write(JSON.stringify({ ok: false, status: e.status, code: e.code || e.message }));
}
db.close();
