import { HttpError } from '../utils/errors.js';
import { config } from '../config.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `No API route for ${req.method} ${req.originalUrl}`, code: 'NOT_FOUND' });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code, ...(err.details && { details: err.details }) });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON', code: 'BAD_JSON' });
  }
  if (err.code === 'SQLITE_BUSY') {
    return res.status(503).json({ error: 'The server is busy. Please try again.', code: 'BUSY' });
  }
  if (config.env !== 'test') console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.', code: 'INTERNAL' });
}
