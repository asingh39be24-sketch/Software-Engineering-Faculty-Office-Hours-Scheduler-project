import { config } from '../config.js';
import { formatSlotTime, nowIso } from '../utils/time.js';
import { createNotification, dispatchEmails } from './notificationService.js';

/**
 * Sends one reminder to both the student and the faculty member for every confirmed
 * appointment starting within the next REMINDER_LEAD_MINUTES. Idempotent: each
 * booking is stamped with reminder_sent_at inside the same transaction.
 */
export function runReminderSweep(db, { now = nowIso(), leadMinutes = config.reminderLeadMinutes } = {}) {
  const until = new Date(new Date(now).getTime() + leadMinutes * 60_000).toISOString();
  const due = db
    .prepare(
      `SELECT b.id, b.student_id, s.faculty_id, s.slot_time, st.name AS student_name, f.name AS faculty_name, f.office_location
       FROM bookings b JOIN slots s ON s.id = b.slot_id
       JOIN users st ON st.id = b.student_id JOIN users f ON f.id = s.faculty_id
       WHERE b.status = 'confirmed' AND b.reminder_sent_at IS NULL AND s.slot_time > ? AND s.slot_time <= ?`
    )
    .all(now, until);
  const sent = [];
  const tx = db.transaction((b) => {
    const claimed = db
      .prepare('UPDATE bookings SET reminder_sent_at = ? WHERE id = ? AND reminder_sent_at IS NULL')
      .run(now, b.id);
    if (claimed.changes !== 1) return [];
    const when = formatSlotTime(b.slot_time);
    const where = b.office_location ? ` at ${b.office_location}` : '';
    return [
      createNotification(db, {
        userId: b.student_id,
        type: 'reminder',
        title: 'Upcoming appointment',
        message: `Reminder: your appointment with ${b.faculty_name} is on ${when}${where}.`,
        bookingId: b.id,
      }),
      createNotification(db, {
        userId: b.faculty_id,
        type: 'reminder',
        title: 'Upcoming appointment',
        message: `Reminder: ${b.student_name} is booked with you on ${when}.`,
        bookingId: b.id,
      }),
    ];
  });
  for (const b of due) {
    const ids = tx(b);
    if (ids.length) {
      sent.push(b.id);
      dispatchEmails(db, ids);
    }
  }
  return sent;
}

export function startReminderScheduler(db) {
  const tick = () => {
    try {
      const sent = runReminderSweep(db);
      if (sent.length) console.info(`[reminders] sent reminders for ${sent.length} appointment(s)`);
    } catch (e) {
      console.error('[reminders] sweep failed:', e);
    }
  };
  tick();
  const handle = setInterval(tick, config.reminderIntervalSeconds * 1000);
  handle.unref();
  return () => clearInterval(handle);
}
