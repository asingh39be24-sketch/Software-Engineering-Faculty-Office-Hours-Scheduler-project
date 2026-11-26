// Populates the database with clearly-labelled SAMPLE accounts and activity so the
// dashboards have something to show in a demo. All sample emails use example.edu.
// Usage: npm run db:seed            (refuses if the database already has users)
//        npm run db:seed -- --force (wipes all data first)
import bcrypt from 'bcryptjs';
import { config } from '../src/config.js';
import { openDatabase } from '../src/database/db.js';
import { createBooking } from '../src/services/bookingService.js';
import { zonedTime, localYmd } from './_zoned.js';

export const SAMPLE_PASSWORD = 'Demo@1234';
export const SAMPLE_ACCOUNTS = {
  admin: { name: 'Platform Admin', email: 'admin@example.edu' },
  faculty: [
    { name: 'Dr. Meera Iyer', email: 'meera.iyer@example.edu', department: 'Computer Science & Engineering', designation: 'Associate Professor', office: 'CSED Block, Room 214', bio: 'Office hours for Software Engineering and Database Systems. Bring your questions on design, SQL or project work.' },
    { name: 'Dr. Arjun Bhatia', email: 'arjun.bhatia@example.edu', department: 'Computer Science & Engineering', designation: 'Assistant Professor', office: 'CSED Block, Room 108', bio: 'Operating Systems and Computer Networks. Happy to go through lab assignments and past exam questions.' },
    { name: 'Prof. Kavita Rao', email: 'kavita.rao@example.edu', department: 'Mathematics', designation: 'Professor', office: 'Main Building, Room 31', bio: 'Discrete Mathematics and Probability & Statistics.' },
    { name: 'Rohan Sethi', email: 'rohan.sethi@example.edu', department: 'Electronics & Communication', designation: 'Teaching Assistant', office: 'ECED Lab 2', bio: 'TA for Digital Electronics and Signals & Systems lab sections.' },
  ],
  students: [
    { name: 'Aanya Kapoor', email: 'aanya.kapoor@example.edu' },
    { name: 'Kabir Malhotra', email: 'kabir.malhotra@example.edu' },
    { name: 'Ishita Verma', email: 'ishita.verma@example.edu' },
    { name: 'Dev Sharma', email: 'dev.sharma@example.edu' },
    { name: 'Nikita Joshi', email: 'nikita.joshi@example.edu' },
  ],
};

// Deterministic PRNG so every seed run produces the same pattern.
let state = 20261126;
const rand = () => ((state = (state * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

export function seed({ force = false, db = openDatabase(), quiet = false } = {}) {
  const log = quiet ? () => {} : console.log;
  const count = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (count > 0 && !force) {
    log('Database already has users; skipping seed. Use `npm run db:seed -- --force` to wipe and re-seed.');
    return false;
  }
  db.exec('DELETE FROM activity_log; DELETE FROM notifications; DELETE FROM bookings; DELETE FROM slots; DELETE FROM users; DELETE FROM sqlite_sequence;');

  const tz = config.appTimezone;
  const hash = bcrypt.hashSync(SAMPLE_PASSWORD, 10);
  const daysAgo = (n) => new Date(Date.now() - n * 86400_000).toISOString();
  const insertUser = db.prepare(
    `INSERT INTO users (name,email,password_hash,role,department,designation,office_location,bio,created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  );
  const activity = db.prepare('INSERT INTO activity_log (actor_id, action, entity_type, entity_id, details, created_at) VALUES (?,?,?,?,?,?)');
  const addUser = (u, role, created) => {
    const id = Number(insertUser.run(u.name, u.email, hash, role, u.department ?? null, u.designation ?? null, u.office ?? null, u.bio ?? null, created).lastInsertRowid);
    activity.run(id, 'user.registered', 'user', id, `${u.name} (${role})`, created);
    return id;
  };

  const tx = db.transaction(() => {
    addUser(SAMPLE_ACCOUNTS.admin, 'admin', daysAgo(70));
    const facultyIds = SAMPLE_ACCOUNTS.faculty.map((f, i) => addUser(f, 'faculty', daysAgo(65 - i * 3)));
    const studentIds = SAMPLE_ACCOUNTS.students.map((s, i) => addUser(s, 'student', daysAgo(55 - i * 6)));

    const insertSlot = db.prepare('INSERT INTO slots (faculty_id, slot_time, end_time, duration_minutes, status, created_at) VALUES (?,?,?,?,?,?)');
    const insertBooking = db.prepare('INSERT INTO bookings (slot_id, student_id, booked_at, status, status_changed_at, cancelled_by, reminder_sent_at) VALUES (?,?,?,?,?,?,?)');
    const today = localYmd(new Date(), tz);
    const ymdOffset = (n) => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const isWeekday = (ymd) => { const d = new Date(`${ymd}T12:00:00Z`).getUTCDay(); return d !== 0 && d !== 6; };

    // ---- History: past six weeks ----
    for (let back = 42; back >= 1; back--) {
      const ymd = ymdOffset(-back);
      if (!isWeekday(ymd)) continue;
      facultyIds.forEach((fid, fi) => {
        if (rand() > 0.45) return;
        const startHour = [10, 14, 11, 15][fi];
        for (let k = 0; k < 4; k++) {
          const start = zonedTime(ymd, startHour, k * 20, tz);
          const end = new Date(start.getTime() + 20 * 60_000);
          if (end.getTime() > Date.now()) continue;
          const created = new Date(start.getTime() - (3 + Math.floor(rand() * 5)) * 86400_000).toISOString();
          const r = rand();
          let slotStatus = 'open', bStatus = null;
          if (r < 0.68) {
            const o = rand();
            bStatus = o < 0.74 ? 'completed' : o < 0.9 ? 'no_show' : 'cancelled';
            slotStatus = bStatus === 'cancelled' ? 'open' : 'booked';
          }
          const slotId = Number(insertSlot.run(fid, start.toISOString(), end.toISOString(), 20, slotStatus, created).lastInsertRowid);
          if (bStatus) {
            const sid = pick(studentIds);
            const bookedAt = new Date(start.getTime() - (2 + Math.floor(rand() * 70)) * 3600_000);
            const bookedIso = new Date(Math.max(bookedAt.getTime(), new Date(created).getTime() + 3600_000)).toISOString();
            const changed = bStatus === 'cancelled'
              ? new Date((new Date(bookedIso).getTime() + start.getTime()) / 2).toISOString()
              : end.toISOString();
            const bid = Number(insertBooking.run(slotId, sid, bookedIso, bStatus, changed, bStatus === 'cancelled' ? 'student' : null, bStatus === 'cancelled' ? null : bookedIso).lastInsertRowid);
            activity.run(sid, 'booking.created', 'booking', bid, `at ${start.toISOString()}`, bookedIso);
            if (bStatus === 'cancelled') activity.run(sid, 'booking.cancelled', 'booking', bid, 'by student', changed);
            else activity.run(fid, bStatus === 'completed' ? 'booking.completed' : 'booking.no_show', 'booking', bid, null, changed);
          }
        }
      });
    }

    // ---- Upcoming availability: next ten days ----
    for (let ahead = 1; ahead <= 10; ahead++) {
      const ymd = ymdOffset(ahead);
      if (!isWeekday(ymd)) continue;
      facultyIds.forEach((fid, fi) => {
        if (rand() > 0.6) return;
        const startHour = [10, 14, 11, 15][fi];
        const duration = fi === 2 ? 30 : 20;
        const count = fi === 2 ? 4 : 6;
        for (let k = 0; k < count; k++) {
          const start = zonedTime(ymd, startHour, k * duration, tz);
          insertSlot.run(fid, start.toISOString(), new Date(start.getTime() + duration * 60_000).toISOString(), duration, 'open', daysAgo(1));
        }
        activity.run(fid, 'slots.published', 'slot', null, `${count} slots on ${ymd}`, daysAgo(1));
      });
    }
  });
  tx();

  // A few upcoming bookings made through the real booking engine.
  const upcoming = db.prepare("SELECT id FROM slots WHERE status = 'open' AND slot_time > ? ORDER BY slot_time").all(new Date().toISOString());
  const studentIds = db.prepare("SELECT id FROM users WHERE role = 'student' ORDER BY id").all().map((r) => r.id);
  let made = 0;
  for (let i = 0; i < upcoming.length && made < 6; i += 5) {
    try {
      createBooking(db, { slotId: upcoming[i].id, studentId: studentIds[made % studentIds.length], note: pick(['Doubts on the last assignment', 'Project proposal feedback', 'Revision before the quiz', null]) });
      made++;
    } catch { /* skip clashes */ }
  }

  const totals = db.prepare("SELECT (SELECT COUNT(*) FROM users) u, (SELECT COUNT(*) FROM slots) s, (SELECT COUNT(*) FROM bookings) b").get();
  log(`Seeded sample data: ${totals.u} users, ${totals.s} slots, ${totals.b} bookings.`);
  log(`All sample accounts use the password ${SAMPLE_PASSWORD}`);
  log(`  admin    ${SAMPLE_ACCOUNTS.admin.email}`);
  log(`  faculty  ${SAMPLE_ACCOUNTS.faculty.map((f) => f.email).join(', ')}`);
  log(`  students ${SAMPLE_ACCOUNTS.students.map((s) => s.email).join(', ')}`);
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed({ force: process.argv.includes('--force') });
}
