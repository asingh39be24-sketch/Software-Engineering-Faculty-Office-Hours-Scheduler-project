import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { badRequest, forbidden, unauthorized } from '../utils/errors.js';
import { insertUser, toPublicUser } from './userService.js';
import { logActivity } from './activityService.js';
import { createNotification } from './notificationService.js';

export function signToken(user) {
  return jwt.sign({ sub: String(user.id), role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

function codesMatch(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * Public registration. Students and faculty can self-register. Admin accounts can
 * only be self-registered with the ADMIN_REGISTRATION_CODE (if the operator set one);
 * otherwise admins are created with `npm run create-admin` or by an existing admin.
 */
export function register(db, body = {}) {
  const { name, email, password, confirmPassword, role, adminCode, department, designation } = body;
  if (confirmPassword !== undefined && confirmPassword !== password) {
    throw badRequest('Passwords do not match', { field: 'confirmPassword' });
  }
  if (role === 'admin') {
    if (!config.adminRegistrationCode) {
      throw forbidden('Administrator accounts cannot be self-registered. Ask an existing administrator.');
    }
    if (!adminCode || !codesMatch(adminCode, config.adminRegistrationCode)) {
      throw forbidden('Invalid administrator access code');
    }
  }
  const user = insertUser(
    db,
    { name, email, password, role },
    { profile: role === 'faculty' ? { department, designation } : {} }
  );
  createNotification(db, {
    userId: user.id,
    type: 'account',
    title: 'Welcome to Office Hours',
    message:
      user.role === 'student'
        ? 'Your account is ready. Find a faculty member and book your first appointment.'
        : user.role === 'faculty'
          ? 'Your account is ready. Complete your profile and publish your first availability.'
          : 'Your administrator account is ready.',
  });
  db.prepare("UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(user.id);
  return { token: signToken(user), user };
}

// Pre-computed so failed logins for unknown emails take the same time as wrong passwords.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export function login(db, { email, password } = {}) {
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    throw badRequest('Email and password are required');
  }
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  const ok = bcrypt.compareSync(password, row ? row.password_hash : DUMMY_HASH);
  if (!row || !ok) throw unauthorized('Incorrect email or password');
  if (!row.is_active) throw forbidden('This account has been deactivated. Contact an administrator.');
  db.prepare("UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(row.id);
  logActivity(db, { actorId: row.id, action: 'user.login', entityType: 'user', entityId: row.id });
  const user = toPublicUser({ ...row, last_login_at: new Date().toISOString() });
  return { token: signToken(user), user };
}
