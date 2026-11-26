import { getDb } from '../database/db.js';
import * as directory from '../services/directoryService.js';
import { requireInt } from '../utils/validate.js';

const str = (v) => (typeof v === 'string' ? v.trim().slice(0, 100) : '');

export const list = (req, res) =>
  res.json({ faculty: directory.listFaculty(getDb(), { search: str(req.query.search), department: str(req.query.department) }) });
export const departments = (_req, res) => res.json({ departments: directory.listDepartments(getDb()) });
export const detail = (req, res) =>
  res.json({ faculty: directory.getFacultyWithSlots(getDb(), requireInt(req.params.id, 'id', { min: 1 }), req.user.id) });
