import { HttpError } from '../utils/errors.js';

/**
 * Minimal in-memory limiter for failed login attempts (per IP + email).
 * Adequate for a single-process deployment; use a shared store if you scale out.
 */
export function loginAttemptLimiter({ max = 10, windowMs = 15 * 60_000 } = {}) {
  const attempts = new Map();
  const key = (req) => `${req.ip}|${String(req.body?.email || '').toLowerCase()}`;
  const middleware = (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    const entry = attempts.get(k);
    if (entry && entry.resetAt > now && entry.count >= max) {
      const mins = Math.ceil((entry.resetAt - now) / 60_000);
      return next(new HttpError(429, `Too many failed attempts. Try again in ${mins} minute${mins > 1 ? 's' : ''}.`, { code: 'RATE_LIMITED' }));
    }
    res.on('finish', () => {
      if (res.statusCode === 401) {
        const e = attempts.get(k);
        if (!e || e.resetAt <= Date.now()) attempts.set(k, { count: 1, resetAt: Date.now() + windowMs });
        else e.count++;
      } else if (res.statusCode < 300) {
        attempts.delete(k);
      }
    });
    next();
  };
  return middleware;
}
