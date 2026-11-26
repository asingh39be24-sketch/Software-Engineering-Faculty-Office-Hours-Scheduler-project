import bcrypt from 'bcryptjs';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { EMAIL_RE, passwordProblems, requireString, oneOf } from '../utils/validate.js';
import { logActivity } from './activityService.js';

export const ROLES = ['student', 'faculty', 'admin'];
const BCRYPT_ROUNDS = 10;

export function toPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: Boolean(row.is_active),
    department: row.department ?? null,
    designation: row.designation ?? null,
    officeLocation: row.office_location ?? null,
    bio: row.bio ?? null,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at ?? null,
  };
}

export function getUserRow(db, id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function getUser(db, id) {
  const row = getUserRow(db, id);
  if (!row) throw notFound('User not found');
  return toPublicUser(row);
}

export function validateNewUser({ name, email, password, role }) {
  const cleanName = requireString(name, 'Full name', { min: 2, max: 100 });
  const cleanEmail = requireString(email, 'Email', { max: 254 }).toLowerCase();
  if (!EMAIL_RE.test(cleanEmail)) throw badRequest('Enter a valid email address', { field: 'email' });
  const problems = passwordProblems(password);
  if (problems.length) throw badRequest(`Password needs ${problems.join(', ')}`, { field: 'password' });
  oneOf(role, ROLES, 'Role');
  return { name: cleanName, email: cleanEmail, password, role };
}

const optionalProfileText = (v, field, max) => requireString(v, field, { optional: true, max, min: 0 }) || null;

/** Low-level insert. Callers are responsible for deciding which roles are allowed. */
export function insertUser(db, input, { actorId = null, profile = {} } = {}) {
  const u = validateNewUser(input);
  const hash = bcrypt.hashSync(u.password, BCRYPT_ROUNDS);
  try {
    const info = db
      .prepare(
        `INSERT INTO users (name, email, password_hash, role, department, designation, office_location, bio)
         VALUES (?,?,?,?,?,?,?,?)`
      )
      .run(
        u.name,
        u.email,
        hash,
        u.role,
        optionalProfileText(profile.department, 'Department', 100),
        optionalProfileText(profile.designation, 'Designation', 100),
        optionalProfileText(profile.officeLocation, 'Office location', 120),
        optionalProfileText(profile.bio, 'Profile', 600)
      );
    const id = Number(info.lastInsertRowid);
    logActivity(db, {
      actorId: actorId ?? id,
      action: actorId ? 'user.created_by_admin' : 'user.registered',
      entityType: 'user',
      entityId: id,
      details: `${u.name} (${u.role})`,
    });
    return getUser(db, id);
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') throw conflict('An account with this email already exists', 'EMAIL_TAKEN');
    throw e;
  }
}

export function updateProfile(db, userId, body) {
  const row = getUserRow(db, userId);
  if (!row) throw notFound('User not found');
  const name = body.name !== undefined ? requireString(body.name, 'Full name', { min: 2, max: 100 }) : row.name;
  const isFaculty = row.role === 'faculty';
  const pick = (key, col, label, max) =>
    isFaculty && body[key] !== undefined ? optionalProfileText(body[key], label, max) : row[col];
  db.prepare(
    'UPDATE users SET name = ?, department = ?, designation = ?, office_location = ?, bio = ? WHERE id = ?'
  ).run(
    name,
    pick('department', 'department', 'Department', 100),
    pick('designation', 'designation', 'Designation', 100),
    pick('officeLocation', 'office_location', 'Office location', 120),
    pick('bio', 'bio', 'Profile', 600),
    userId
  );
  logActivity(db, { actorId: userId, action: 'user.profile_updated', entityType: 'user', entityId: userId });
  return getUser(db, userId);
}

export function changePassword(db, userId, { currentPassword, newPassword }) {
  const row = getUserRow(db, userId);
  if (!row) throw notFound('User not found');
  if (typeof currentPassword !== 'string' || !bcrypt.compareSync(currentPassword, row.password_hash)) {
    throw badRequest('Current password is incorrect', { field: 'currentPassword' });
  }
  const problems = passwordProblems(newPassword);
  if (problems.length) throw badRequest(`New password needs ${problems.join(', ')}`, { field: 'newPassword' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, BCRYPT_ROUNDS), userId);
  logActivity(db, { actorId: userId, action: 'user.password_changed', entityType: 'user', entityId: userId });
}

export function listUsers(db, { search = '', role = '', status = '' } = {}) {
  const where = [];
  const params = [];
  if (search) {
    where.push('(u.name LIKE ? OR u.email LIKE ? OR u.department LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  if (role) {
    oneOf(role, ROLES, 'role');
    where.push('u.role = ?');
    params.push(role);
  }
  if (status === 'active') where.push('u.is_active = 1');
  if (status === 'inactive') where.push('u.is_active = 0');
  const rows = db
    .prepare(
      `SELECT u.*,
        (SELECT COUNT(*) FROM bookings b WHERE b.student_id = u.id) AS student_bookings,
        (SELECT COUNT(*) FROM slots s WHERE s.faculty_id = u.id AND s.status <> 'cancelled') AS faculty_slots,
        (SELECT COUNT(*) FROM bookings b JOIN slots s ON s.id = b.slot_id WHERE s.faculty_id = u.id) AS faculty_bookings
       FROM users u ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY u.created_at DESC, u.id DESC`
    )
    .all(...params);
  return rows.map((r) => ({
    ...toPublicUser(r),
    stats: { bookings: r.role === 'student' ? r.student_bookings : r.faculty_bookings, slots: r.faculty_slots },
  }));
}

export function getUserDetail(db, id) {
  const user = getUser(db, id);
  let stats;
  if (user.role === 'student') {
    stats = db
      .prepare(
        `SELECT COUNT(*) total,
           SUM(status='confirmed') confirmed, SUM(status='completed') completed,
           SUM(status='no_show') noShow, SUM(status='cancelled') cancelled
         FROM bookings WHERE student_id = ?`
      )
      .get(id);
  } else if (user.role === 'faculty') {
    stats = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM slots WHERE faculty_id = ? AND status <> 'cancelled') slots,
           (SELECT COUNT(*) FROM slots WHERE faculty_id = ? AND status = 'open' AND slot_time > strftime('%Y-%m-%dT%H:%M:%fZ','now')) openUpcoming,
           COUNT(b.id) total, SUM(b.status='completed') completed, SUM(b.status='no_show') noShow,
           SUM(b.status='cancelled') cancelled, SUM(b.status='confirmed') confirmed
         FROM bookings b JOIN slots s ON s.id = b.slot_id WHERE s.faculty_id = ?`
      )
      .get(id, id, id);
  }
  const normalized = stats ? Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, v ?? 0])) : null;
  return { ...user, stats: normalized };
}

export function setUserActive(db, { actorId, userId, isActive }) {
  if (typeof isActive !== 'boolean') throw badRequest('isActive must be true or false');
  if (actorId === userId) throw forbidden('You cannot deactivate your own account');
  const target = getUserRow(db, userId);
  if (!target) throw notFound('User not found');
  if (target.role === 'admin' && !isActive) {
    const otherActiveAdmins = db
      .prepare("SELECT COUNT(*) c FROM users WHERE role='admin' AND is_active=1 AND id <> ?")
      .get(userId).c;
    if (otherActiveAdmins === 0) throw conflict('At least one administrator must remain active');
  }
  db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, userId);
  logActivity(db, {
    actorId,
    action: isActive ? 'user.activated' : 'user.deactivated',
    entityType: 'user',
    entityId: userId,
    details: target.name,
  });
  return getUserDetail(db, userId);
}
