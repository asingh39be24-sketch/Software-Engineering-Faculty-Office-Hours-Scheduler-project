import { getDb } from '../database/db.js';
import * as slots from '../services/slotService.js';
import { optionalDateTime, requireInt, requireDateTime } from '../utils/validate.js';
import { addMinutes } from '../utils/time.js';

/** Accepts the new {start, end, durationMinutes} body or the prototype's {slot_time}. */
function normalise(body = {}) {
  if (body.slot_time && !body.start) {
    const start = requireDateTime(body.slot_time, 'slot_time');
    const durationMinutes = body.durationMinutes ?? 15;
    return { start: start.toISOString(), end: addMinutes(start, Number(durationMinutes)).toISOString(), durationMinutes };
  }
  return body;
}

export const listOpen = (req, res) => {
  const from = optionalDateTime(req.query.from, 'from');
  const to = optionalDateTime(req.query.to, 'to');
  const facultyId = req.query.facultyId ? requireInt(req.query.facultyId, 'facultyId', { min: 1 }) : undefined;
  res.json({ slots: slots.listOpenSlots(getDb(), { facultyId, from: from?.toISOString(), to: to?.toISOString(), viewerId: req.user.id }) });
};
export const preview = (req, res) => res.json(slots.previewSlots(getDb(), req.user.id, normalise(req.body)));
export const publish = (req, res) => res.status(201).json(slots.publishSlots(getDb(), req.user.id, normalise(req.body)));
export const mine = (req, res) => {
  const scope = ['upcoming', 'past', 'all'].includes(req.query.scope) ? req.query.scope : 'upcoming';
  const status = ['open', 'booked', 'cancelled'].includes(req.query.status) ? req.query.status : undefined;
  res.json({ slots: slots.listFacultySlots(getDb(), req.user.id, { scope, status }) });
};
export const cancel = (req, res) =>
  res.json({ slot: slots.cancelSlot(getDb(), req.user.id, requireInt(req.params.id, 'id', { min: 1 })) });
