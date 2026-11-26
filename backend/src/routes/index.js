import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { loginAttemptLimiter } from '../middleware/rateLimit.js';
import * as authC from '../controllers/authController.js';
import * as dirC from '../controllers/directoryController.js';
import * as slotC from '../controllers/slotController.js';
import * as bookingC from '../controllers/bookingController.js';
import * as waitlistC from '../controllers/waitlistController.js';
import * as swapC from '../controllers/swapController.js';
import * as dashC from '../controllers/dashboardController.js';
import * as notifC from '../controllers/notificationController.js';
import * as adminC from '../controllers/adminController.js';

export function buildRouter() {
  const r = Router();
  const limiter = loginAttemptLimiter();
  const student = requireRole('student');
  const faculty = requireRole('faculty');
  const admin = requireRole('admin');

  r.get('/health', (_req, res) => res.json({ ok: true }));

  // --- Auth ---
  r.get('/auth/config', authC.publicConfig);
  r.post('/auth/register', authC.register);
  r.post('/auth/login', limiter, authC.login);
  r.post('/signup', authC.register); // prototype path
  r.post('/login', limiter, authC.login); // prototype path
  r.get('/auth/me', authenticate, authC.me);
  r.patch('/auth/me', authenticate, authC.updateMe);
  r.post('/auth/change-password', authenticate, authC.changePassword);

  // --- Faculty directory ---
  r.get('/faculty', authenticate, dirC.list);
  r.get('/faculty/departments', authenticate, dirC.departments);
  r.get('/faculty/:id', authenticate, dirC.detail);

  // --- Slots ---
  r.get('/slots', authenticate, slotC.listOpen);
  r.get('/slots/mine', authenticate, faculty, slotC.mine);
  r.post('/slots/preview', authenticate, faculty, slotC.preview);
  r.post('/slots', authenticate, faculty, slotC.publish);
  r.post('/slots/:id/cancel', authenticate, faculty, slotC.cancel);

  // --- Waitlist (full slots) ---
  r.get('/waitlist', authenticate, student, waitlistC.mine);
  r.post('/slots/:id/waitlist', authenticate, student, waitlistC.join);
  r.delete('/slots/:id/waitlist', authenticate, student, waitlistC.leave);

  // --- Bookings ---
  r.post('/bookings', authenticate, student, bookingC.create);
  r.get('/bookings', authenticate, bookingC.list);
  r.get('/bookings/:id', authenticate, bookingC.detail);
  r.post('/bookings/:id/cancel', authenticate, requireRole('student', 'faculty', 'admin'), bookingC.cancel);
  r.post('/bookings/:id/reschedule', authenticate, student, bookingC.reschedule);
  r.patch('/bookings/:id', authenticate, faculty, bookingC.outcome); // prototype path, now ownership-checked

  // --- Swaps between students ---
  r.get('/swaps/candidates', authenticate, student, swapC.candidates);
  r.get('/swaps', authenticate, student, swapC.list);
  r.post('/swaps', authenticate, student, swapC.request);
  r.post('/swaps/:id/:action', authenticate, student, swapC.respond);

  // --- Dashboards ---
  r.get('/dashboard/student', authenticate, student, dashC.student);
  r.get('/dashboard/faculty', authenticate, faculty, dashC.faculty);

  // --- Notifications ---
  r.get('/notifications', authenticate, notifC.list);
  r.post('/notifications/read-all', authenticate, notifC.readAll);
  r.post('/notifications/:id/read', authenticate, notifC.read);

  // --- Admin ---
  r.get('/analytics', authenticate, admin, adminC.legacyAnalytics); // prototype path
  r.get('/admin/analytics', authenticate, admin, adminC.getAnalytics);
  r.get('/admin/monitoring', authenticate, admin, adminC.monitoring);
  r.get('/admin/users', authenticate, admin, adminC.listUsers);
  r.post('/admin/users', authenticate, admin, adminC.createUser);
  r.get('/admin/users/:id', authenticate, admin, adminC.userDetail);
  r.patch('/admin/users/:id', authenticate, admin, adminC.setActive);
  r.get('/admin/slots', authenticate, admin, adminC.listSlots);
  r.post('/admin/slots/:id/cancel', authenticate, admin, adminC.cancelSlot);

  return r;
}
