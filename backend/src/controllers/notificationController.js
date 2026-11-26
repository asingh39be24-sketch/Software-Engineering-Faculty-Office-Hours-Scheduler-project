import { getDb } from '../database/db.js';
import * as notifications from '../services/notificationService.js';
import { requireInt } from '../utils/validate.js';

export const list = (req, res) =>
  res.json(
    notifications.listNotifications(getDb(), req.user.id, {
      unreadOnly: req.query.unread === '1' || req.query.unread === 'true',
      limit: Number.parseInt(req.query.limit, 10) || 50,
    })
  );
export const read = (req, res) => {
  notifications.markRead(getDb(), req.user.id, requireInt(req.params.id, 'id', { min: 1 }));
  res.json({ ok: true });
};
export const readAll = (req, res) => res.json({ ok: true, updated: notifications.markAllRead(getDb(), req.user.id) });
