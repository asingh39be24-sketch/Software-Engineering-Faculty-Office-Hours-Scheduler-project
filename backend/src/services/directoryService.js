import { notFound } from '../utils/errors.js';
import { nowIso } from '../utils/time.js';
import { listFullSlots, listOpenSlots } from './slotService.js';

const HORIZON_DAYS = 60;

function profile(r) {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    department: r.department,
    designation: r.designation,
    officeLocation: r.office_location,
    bio: r.bio,
  };
}

/**
 * Active faculty with their open future slots (start/end only, next 60 days).
 * Name/department filtering happens here; date and time-of-day filtering is done
 * by the client because it depends on the viewer's local time zone.
 */
export function listFaculty(db, { search = '', department = '' } = {}) {
  const where = ["u.role = 'faculty'", 'u.is_active = 1'];
  const params = [];
  if (search) {
    where.push('(u.name LIKE ? OR u.department LIKE ? OR u.designation LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (department) {
    where.push('u.department = ?');
    params.push(department);
  }
  const faculty = db
    .prepare(`SELECT * FROM users u WHERE ${where.join(' AND ')} ORDER BY u.name COLLATE NOCASE`)
    .all(...params);
  if (!faculty.length) return [];

  const now = nowIso();
  const horizon = new Date(Date.now() + HORIZON_DAYS * 86400_000).toISOString();
  const slotRows = db
    .prepare(
      `SELECT faculty_id, slot_time, end_time FROM slots
       WHERE status = 'open' AND slot_time > ? AND slot_time < ?
       AND faculty_id IN (${faculty.map(() => '?').join(',')}) ORDER BY slot_time`
    )
    .all(now, horizon, ...faculty.map((f) => f.id));
  const byFaculty = new Map();
  for (const s of slotRows) {
    if (!byFaculty.has(s.faculty_id)) byFaculty.set(s.faculty_id, []);
    byFaculty.get(s.faculty_id).push({ start: s.slot_time, end: s.end_time });
  }
  return faculty.map((f) => ({ ...profile(f), openSlots: byFaculty.get(f.id) || [] }));
}

export function listDepartments(db) {
  return db
    .prepare(
      `SELECT DISTINCT department FROM users
       WHERE role = 'faculty' AND is_active = 1 AND department IS NOT NULL AND department <> ''
       ORDER BY department COLLATE NOCASE`
    )
    .all()
    .map((r) => r.department);
}

/**
 * One faculty member with their bookable slots and, separately, the full ones a student
 * can join the waitlist for. `viewerId` adds "you are booked / you are Nth in the queue".
 */
export function getFacultyWithSlots(db, id, viewerId) {
  const f = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'faculty' AND is_active = 1").get(id);
  if (!f) throw notFound('Faculty member not found');
  return {
    ...profile(f),
    slots: listOpenSlots(db, { facultyId: id, viewerId }),
    fullSlots: listFullSlots(db, { facultyId: id, viewerId }),
  };
}
