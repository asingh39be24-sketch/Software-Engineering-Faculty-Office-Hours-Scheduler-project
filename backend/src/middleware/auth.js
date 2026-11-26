import { getDb } from '../database/db.js';
import { verifyToken } from '../services/authService.js';
import { toPublicUser } from '../services/userService.js';
import { forbidden, unauthorized } from '../utils/errors.js';

/**
 * Verifies the bearer token AND re-loads the user from the database on every request,
 * so a deactivated account or a role change takes effect immediately rather than
 * when the token expires.
 */
export function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next(unauthorized('Missing or malformed Authorization header'));
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return next(unauthorized('Your session has expired. Please sign in again.'));
  }
  const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(Number(payload.sub));
  if (!row) return next(unauthorized('Account no longer exists'));
  if (!row.is_active) return next(unauthorized('This account has been deactivated'));
  req.user = toPublicUser(row);
  next();
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden(`This action is only available to: ${roles.join(', ')}`));
    next();
  };
}
