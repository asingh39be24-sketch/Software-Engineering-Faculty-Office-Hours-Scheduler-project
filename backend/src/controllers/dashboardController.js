import { getDb } from '../database/db.js';
import * as dash from '../services/dashboardService.js';
import { optionalDateTime } from '../utils/validate.js';

export const student = (req, res) => res.json(dash.studentOverview(getDb(), req.user.id));
export const faculty = (req, res) =>
  res.json(
    dash.facultyOverview(getDb(), req.user.id, {
      dayStart: optionalDateTime(req.query.dayStart, 'dayStart')?.toISOString(),
      dayEnd: optionalDateTime(req.query.dayEnd, 'dayEnd')?.toISOString(),
    })
  );
