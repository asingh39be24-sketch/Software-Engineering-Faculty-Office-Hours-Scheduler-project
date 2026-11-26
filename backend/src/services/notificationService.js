import { sendEmail } from './emailService.js';
import { notFound } from '../utils/errors.js';

/**
 * Inserts an in-app notification. Safe to call inside a transaction.
 * Returns the new notification id; pass collected ids to dispatchEmails()
 * *after* the transaction commits so we never email about a rolled-back change.
 */
export function createNotification(db, { userId, type, title, message, bookingId = null }) {
  const info = db
    .prepare('INSERT INTO notifications (user_id, type, title, message, booking_id) VALUES (?,?,?,?,?)')
    .run(userId, type, title, message, bookingId);
  return Number(info.lastInsertRowid);
}

export function dispatchEmails(db, ids) {
  if (!ids?.length) return;
  const rows = db
    .prepare(
      `SELECT n.title, n.message, u.email FROM notifications n JOIN users u ON u.id = n.user_id
       WHERE n.id IN (${ids.map(() => '?').join(',')})`
    )
    .all(...ids);
  for (const r of rows) {
    // fire-and-forget; sendEmail never throws
    sendEmail({ to: r.email, subject: `[Office Hours] ${r.title}`, text: r.message });
  }
}

export function listNotifications(db, userId, { unreadOnly = false, limit = 50 } = {}) {
  const items = db
    .prepare(
      `SELECT id, type, title, message, booking_id AS bookingId, is_read AS isRead, created_at AS createdAt, read_at AS readAt
       FROM notifications WHERE user_id = ? ${unreadOnly ? 'AND is_read = 0' : ''}
       ORDER BY created_at DESC, id DESC LIMIT ?`
    )
    .all(userId, Math.min(Math.max(limit, 1), 200))
    .map((n) => ({ ...n, isRead: Boolean(n.isRead) }));
  const unreadCount = db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND is_read = 0').get(userId).c;
  return { items, unreadCount };
}

export function markRead(db, userId, id) {
  const info = db
    .prepare(
      "UPDATE notifications SET is_read = 1, read_at = COALESCE(read_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = ? AND user_id = ?"
    )
    .run(id, userId);
  if (info.changes === 0) throw notFound('Notification not found');
}

export function markAllRead(db, userId) {
  const info = db
    .prepare(
      "UPDATE notifications SET is_read = 1, read_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND is_read = 0"
    )
    .run(userId);
  return info.changes;
}
