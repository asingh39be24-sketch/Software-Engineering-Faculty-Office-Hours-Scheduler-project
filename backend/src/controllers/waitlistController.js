import { getDb } from '../database/db.js';
import * as waitlist from '../services/waitlistService.js';

export const mine = (req, res) => res.json({ waitlist: waitlist.listMyWaitlist(getDb(), req.user.id) });

export const join = (req, res) =>
  res.status(201).json({ waitlist: waitlist.joinWaitlist(getDb(), { slotId: req.params.id, studentId: req.user.id }) });

export const leave = (req, res) => res.json(waitlist.leaveWaitlist(getDb(), { slotId: req.params.id, studentId: req.user.id }));
