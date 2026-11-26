import { getDb } from '../database/db.js';
import * as bookings from '../services/bookingService.js';
import { optionalDateTime, requireInt } from '../utils/validate.js';

export const create = (req, res) => {
  const slotId = req.body?.slot_id ?? req.body?.slotId;
  const booking = bookings.createBooking(getDb(), { slotId, studentId: req.user.id, note: req.body?.note });
  res.status(201).json({ booking, id: booking.id, status: booking.status });
};

export const list = (req, res) => {
  const { role, id } = req.user;
  const from = optionalDateTime(req.query.from, 'from')?.toISOString();
  const to = optionalDateTime(req.query.to, 'to')?.toISOString();
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
  res.json({
    bookings: bookings.listBookings(getDb(), {
      studentId: role === 'student' ? id : undefined,
      facultyId: role === 'faculty' ? id : undefined,
      scope: req.query.scope || 'all',
      search,
      from,
      to,
    }),
  });
};

export const detail = (req, res) =>
  res.json({ booking: bookings.getBookingForUser(getDb(), requireInt(req.params.id, 'id', { min: 1 }), req.user) });

export const cancel = (req, res) =>
  res.json({ booking: bookings.cancelBooking(getDb(), { bookingId: req.params.id, user: req.user, reason: req.body?.reason }) });

export const reschedule = (req, res) => {
  const slotId = req.body?.slot_id ?? req.body?.slotId;
  const booking = bookings.rescheduleBooking(getDb(), {
    bookingId: req.params.id,
    studentId: req.user.id,
    newSlotId: slotId,
    note: req.body?.note,
  });
  res.json({ booking });
};

export const outcome = (req, res) =>
  res.json({
    ok: true,
    booking: bookings.recordOutcome(getDb(), { bookingId: req.params.id, facultyId: req.user.id, status: req.body?.status }),
  });
