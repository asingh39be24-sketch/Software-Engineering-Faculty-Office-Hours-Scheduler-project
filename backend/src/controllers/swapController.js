import { getDb } from '../database/db.js';
import * as swaps from '../services/swapService.js';

export const candidates = (req, res) =>
  res.json({ candidates: swaps.swapCandidates(getDb(), { bookingId: req.query.booking_id, studentId: req.user.id }) });

export const request = (req, res) =>
  res.status(201).json({
    swap: swaps.requestSwap(getDb(), {
      myBookingId: req.body?.my_booking_id,
      targetBookingId: req.body?.target_booking_id,
      studentId: req.user.id,
    }),
  });

export const list = (req, res) => res.json(swaps.listSwaps(getDb(), req.user.id));

export const respond = (req, res) =>
  res.json({ swap: swaps.respondSwap(getDb(), { swapId: req.params.id, studentId: req.user.id, action: req.params.action }) });
