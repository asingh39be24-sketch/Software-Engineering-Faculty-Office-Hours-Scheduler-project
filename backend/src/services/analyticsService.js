import { config } from '../config.js';
import { nowIso } from '../utils/time.js';
import { listActivity } from './activityService.js';
import { isEmailConfigured } from './emailService.js';
import { toPublicUser } from './userService.js';

function safeTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return tz;
  } catch {
    return config.appTimezone;
  }
}

/** YYYY-MM-DD for an instant, in the given time zone. */
function localDate(iso, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(iso)
  );
}

function addDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing ymd. */
function weekStart(ymd) {
  const d = new Date(`${ymd}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return addDays(ymd, -dow);
}

const pct = (num, den) => (den ? Math.round((num / den) * 1000) / 10 : null);

export function getAnalytics(db, { days = 30, tz } = {}) {
  const period = Math.min(Math.max(Number.parseInt(days, 10) || 30, 7), 365);
  const zone = safeTimeZone(tz || config.appTimezone);
  const now = nowIso();
  const today = localDate(now, zone);
  const firstDay = addDays(today, -(period - 1));
  // Generous UTC bound; exact local-day bucketing happens in JS below.
  const sinceIso = new Date(Date.now() - (period + 1) * 86400_000).toISOString();

  const users = db
    .prepare(
      `SELECT COUNT(*) total, SUM(role='student') students, SUM(role='faculty') faculty, SUM(role='admin') admins,
              SUM(is_active=0) inactive FROM users`
    )
    .get();
  const bookings = db
    .prepare(
      `SELECT COUNT(*) total,
              SUM(b.status='confirmed' AND s.end_time > @now) upcoming,
              SUM(b.status='confirmed' AND s.end_time <= @now) awaitingOutcome,
              SUM(b.status='completed') completed, SUM(b.status='no_show') noShow, SUM(b.status='cancelled') cancelled
       FROM bookings b JOIN slots s ON s.id = b.slot_id`
    )
    .get({ now });
  const slots = db
    .prepare(
      `SELECT SUM(status <> 'cancelled') published, SUM(status='booked') booked,
              SUM(status='open' AND slot_time > @now) openUpcoming, SUM(status='open' AND slot_time <= @now) openExpired,
              SUM(status='cancelled') cancelled
       FROM slots`
    )
    .get({ now });
  const lead = db
    .prepare(
      `SELECT AVG((julianday(s.slot_time) - julianday(b.booked_at)) * 24) hours
       FROM bookings b JOIN slots s ON s.id = b.slot_id WHERE b.status <> 'cancelled'`
    )
    .get();
  const n = (v) => v ?? 0;
  const resolved = n(bookings.completed) + n(bookings.noShow);
  const metrics = {
    users: {
      total: n(users.total),
      students: n(users.students),
      faculty: n(users.faculty),
      admins: n(users.admins),
      inactive: n(users.inactive),
    },
    bookings: {
      total: n(bookings.total),
      upcoming: n(bookings.upcoming),
      awaitingOutcome: n(bookings.awaitingOutcome),
      completed: n(bookings.completed),
      noShow: n(bookings.noShow),
      cancelled: n(bookings.cancelled),
    },
    slots: {
      published: n(slots.published),
      booked: n(slots.booked),
      openUpcoming: n(slots.openUpcoming),
      openExpired: n(slots.openExpired),
      cancelled: n(slots.cancelled),
    },
    // Share of concluded appointments (completed + no-show) where the student did not attend.
    noShowRate: pct(n(bookings.noShow), resolved),
    // Same definition as the prototype: booked / (booked + open) over non-cancelled slots.
    slotUtilization: pct(n(slots.booked), n(slots.booked) + n(slots.openUpcoming) + n(slots.openExpired)),
    cancellationRate: pct(n(bookings.cancelled), n(bookings.total)),
    avgLeadTimeHours: lead.hours == null ? null : Math.round(lead.hours * 10) / 10,
  };

  // --- Bookings over time (by day the booking was made / cancelled) ---
  const dayMap = new Map();
  for (let i = 0; i < period; i++) dayMap.set(addDays(firstDay, i), { date: addDays(firstDay, i), booked: 0, cancelled: 0 });
  for (const r of db.prepare('SELECT booked_at FROM bookings WHERE booked_at >= ?').all(sinceIso)) {
    const d = dayMap.get(localDate(r.booked_at, zone));
    if (d) d.booked++;
  }
  for (const r of db
    .prepare("SELECT status_changed_at FROM bookings WHERE status='cancelled' AND status_changed_at >= ?")
    .all(sinceIso)) {
    const d = dayMap.get(localDate(r.status_changed_at, zone));
    if (d) d.cancelled++;
  }

  // --- Weekly slot utilisation and no-show trend (by appointment date) ---
  const weeks = new Map();
  const lastWeek = weekStart(addDays(today, 14));
  for (let w = weekStart(firstDay); w <= lastWeek; w = addDays(w, 7)) {
    weeks.set(w, { week: w, booked: 0, unbooked: 0, completed: 0, noShow: 0 });
  }
  const horizonIso = new Date(Date.now() + 22 * 86400_000).toISOString();
  for (const r of db
    .prepare(
      `SELECT s.slot_time, s.status, b.status AS booking_status FROM slots s
       LEFT JOIN bookings b ON b.slot_id = s.id AND b.status <> 'cancelled'
       WHERE s.status <> 'cancelled' AND s.slot_time >= ? AND s.slot_time < ?`
    )
    .all(sinceIso, horizonIso)) {
    const w = weeks.get(weekStart(localDate(r.slot_time, zone)));
    if (!w) continue;
    if (r.status === 'booked') w.booked++;
    else w.unbooked++;
    if (r.booking_status === 'completed') w.completed++;
    if (r.booking_status === 'no_show') w.noShow++;
  }
  const weekly = [...weeks.values()].map((w) => ({
    ...w,
    utilization: pct(w.booked, w.booked + w.unbooked),
    noShowRate: pct(w.noShow, w.completed + w.noShow),
    isFuture: w.week > weekStart(today),
  }));

  const facultyActivity = db
    .prepare(
      `SELECT u.id, u.name,
         (SELECT COUNT(*) FROM slots s WHERE s.faculty_id = u.id AND s.status <> 'cancelled') AS published,
         (SELECT COUNT(*) FROM slots s WHERE s.faculty_id = u.id AND s.status = 'booked') AS booked,
         (SELECT COUNT(*) FROM bookings b JOIN slots s ON s.id = b.slot_id WHERE s.faculty_id = u.id AND b.status='completed') AS completed,
         (SELECT COUNT(*) FROM bookings b JOIN slots s ON s.id = b.slot_id WHERE s.faculty_id = u.id AND b.status='no_show') AS noShow
       FROM users u WHERE u.role = 'faculty'
       ORDER BY booked DESC, published DESC, u.name LIMIT 10`
    )
    .all()
    .filter((f) => f.published > 0 || f.booked > 0);

  return {
    generatedAt: now,
    periodDays: period,
    timeZone: zone,
    metrics,
    charts: {
      bookingsOverTime: [...dayMap.values()],
      statusDistribution: [
        { status: 'confirmed', count: metrics.bookings.upcoming + metrics.bookings.awaitingOutcome },
        { status: 'completed', count: metrics.bookings.completed },
        { status: 'no_show', count: metrics.bookings.noShow },
        { status: 'cancelled', count: metrics.bookings.cancelled },
      ],
      weekly,
      facultyActivity,
    },
  };
}

export function getMonitoring(db) {
  const recentBookings = db
    .prepare(
      `SELECT b.id, b.status, b.booked_at AS bookedAt, s.slot_time AS start, st.name AS studentName, f.name AS facultyName
       FROM bookings b JOIN slots s ON s.id = b.slot_id JOIN users st ON st.id = b.student_id JOIN users f ON f.id = s.faculty_id
       ORDER BY b.booked_at DESC, b.id DESC LIMIT 10`
    )
    .all();
  const recentCancellations = db
    .prepare(
      `SELECT b.id, b.status_changed_at AS cancelledAt, b.cancelled_by AS cancelledBy, b.cancel_reason AS reason,
              s.slot_time AS start, st.name AS studentName, f.name AS facultyName
       FROM bookings b JOIN slots s ON s.id = b.slot_id JOIN users st ON st.id = b.student_id JOIN users f ON f.id = s.faculty_id
       WHERE b.status = 'cancelled' ORDER BY b.status_changed_at DESC LIMIT 10`
    )
    .all();
  const recentRegistrations = db
    .prepare('SELECT * FROM users ORDER BY created_at DESC, id DESC LIMIT 10')
    .all()
    .map(toPublicUser);
  return {
    recentBookings,
    recentCancellations,
    recentRegistrations,
    activity: listActivity(db, { limit: 40 }),
    system: {
      emailConfigured: isEmailConfigured(),
      reminderLeadMinutes: config.reminderLeadMinutes,
      cancellationCutoffMinutes: config.cancellationCutoffMinutes,
      adminSelfRegistration: Boolean(config.adminRegistrationCode),
    },
  };
}
