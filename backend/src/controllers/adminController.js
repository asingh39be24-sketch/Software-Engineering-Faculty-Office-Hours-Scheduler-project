import { getDb } from '../database/db.js';
import * as analytics from '../services/analyticsService.js';
import * as users from '../services/userService.js';
import * as slots from '../services/slotService.js';
import { optionalDateTime, requireInt } from '../utils/validate.js';

const str = (v) => (typeof v === 'string' ? v.trim().slice(0, 100) : '');

export const getAnalytics = (req, res) =>
  res.json(analytics.getAnalytics(getDb(), { days: req.query.days, tz: str(req.query.tz) }));

/** Prototype endpoint, kept for compatibility: the three original metrics plus the full report. */
export const legacyAnalytics = (req, res) => {
  const a = analytics.getAnalytics(getDb(), { days: 30 });
  res.json({
    totalBookings: a.metrics.bookings.total,
    noShowRate: a.metrics.noShowRate ?? 0,
    slotUtilization: a.metrics.slotUtilization ?? 0,
    report: a,
  });
};

export const monitoring = (_req, res) => res.json(analytics.getMonitoring(getDb()));
export const listUsers = (req, res) =>
  res.json({ users: users.listUsers(getDb(), { search: str(req.query.search), role: str(req.query.role), status: str(req.query.status) }) });
export const userDetail = (req, res) => res.json({ user: users.getUserDetail(getDb(), requireInt(req.params.id, 'id', { min: 1 })) });
export const setActive = (req, res) =>
  res.json({
    user: users.setUserActive(getDb(), {
      actorId: req.user.id,
      userId: requireInt(req.params.id, 'id', { min: 1 }),
      isActive: req.body?.isActive,
    }),
  });
export const createUser = (req, res) => {
  const { name, email, password, role, department, designation } = req.body || {};
  const user = users.insertUser(getDb(), { name, email, password, role }, { actorId: req.user.id, profile: { department, designation } });
  res.status(201).json({ user });
};

/** Admin override: every faculty member's slots, and withdrawing any of them. */
export const listSlots = (req, res) => {
  const scope = ['upcoming', 'past', 'all'].includes(req.query.scope) ? req.query.scope : 'upcoming';
  const status = ['open', 'booked', 'cancelled'].includes(req.query.status) ? req.query.status : undefined;
  const facultyId = req.query.facultyId ? requireInt(req.query.facultyId, 'facultyId', { min: 1 }) : undefined;
  const from = optionalDateTime(req.query.from, 'from')?.toISOString();
  const to = optionalDateTime(req.query.to, 'to')?.toISOString();
  res.json({ slots: slots.adminListSlots(getDb(), { facultyId, scope, status, from, to }) });
};
export const cancelSlot = (req, res) =>
  res.json(
    slots.adminCancelSlot(getDb(), {
      adminId: req.user.id,
      slotId: req.params.id,
      reason: req.body?.reason,
    })
  );
