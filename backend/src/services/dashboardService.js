import { nowIso } from '../utils/time.js';
import { listBookings } from './bookingService.js';
import { listActivity } from './activityService.js';

const zero = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v ?? 0]));

export function studentOverview(db, studentId) {
  const now = nowIso();
  const counts = zero(
    db
      .prepare(
        `SELECT COUNT(*) total,
           SUM(b.status = 'confirmed' AND s.end_time > @now) upcoming,
           SUM(b.status = 'confirmed' AND s.end_time <= @now) awaitingOutcome,
           SUM(b.status = 'completed') completed,
           SUM(b.status = 'no_show') noShow,
           SUM(b.status = 'cancelled') cancelled
         FROM bookings b JOIN slots s ON s.id = b.slot_id WHERE b.student_id = @id`
      )
      .get({ id: studentId, now })
  );
  const upcoming = listBookings(db, { studentId, scope: 'upcoming', limit: 5 });
  return {
    counts,
    nextAppointment: upcoming[0] || null,
    upcoming,
    recentActivity: listActivity(db, { actorId: studentId, limit: 8 }).filter((a) => a.action !== 'user.login'),
  };
}

export function facultyOverview(db, facultyId, { dayStart, dayEnd } = {}) {
  const now = nowIso();
  const counts = zero(
    db
      .prepare(
        `SELECT COUNT(b.id) total,
           SUM(b.status = 'confirmed' AND s.end_time > @now) upcoming,
           SUM(b.status = 'confirmed' AND s.end_time <= @now) awaitingOutcome,
           SUM(b.status = 'completed') completed,
           SUM(b.status = 'no_show') noShow,
           SUM(b.status = 'cancelled') cancelled
         FROM bookings b JOIN slots s ON s.id = b.slot_id WHERE s.faculty_id = @id`
      )
      .get({ id: facultyId, now })
  );
  const slots = zero(
    db
      .prepare(
        `SELECT SUM(status = 'open' AND slot_time > @now) openUpcoming,
                SUM(status = 'booked' AND end_time > @now) bookedUpcoming
         FROM slots WHERE faculty_id = @id`
      )
      .get({ id: facultyId, now })
  );
  // "Today" is defined by the client's local day, passed as ISO bounds.
  const start = dayStart || now.slice(0, 10) + 'T00:00:00.000Z';
  const end = dayEnd || new Date(new Date(start).getTime() + 86400_000).toISOString();
  const todaySlots = db
    .prepare(
      `SELECT s.id, s.slot_time AS start, s.end_time AS end, s.status,
              b.id AS bookingId, b.status AS bookingStatus, b.note, u.name AS studentName, u.email AS studentEmail
       FROM slots s
       LEFT JOIN bookings b ON b.slot_id = s.id AND b.status <> 'cancelled'
       LEFT JOIN users u ON u.id = b.student_id
       WHERE s.faculty_id = ? AND s.status <> 'cancelled' AND s.slot_time >= ? AND s.slot_time < ?
       ORDER BY s.slot_time`
    )
    .all(facultyId, start, end);
  return {
    counts,
    slots,
    today: todaySlots,
    awaitingOutcome: listBookings(db, { facultyId, scope: 'awaiting', limit: 10 }),
  };
}
