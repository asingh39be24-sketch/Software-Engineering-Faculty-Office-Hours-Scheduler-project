import { badRequest } from './errors.js';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Returns a list of unmet password rules (empty when the password is acceptable). */
export function passwordProblems(pw) {
  const problems = [];
  if (typeof pw !== 'string' || pw.length < 8) problems.push('at least 8 characters');
  if (typeof pw === 'string' && pw.length > 128) problems.push('at most 128 characters');
  if (!/[a-z]/.test(pw || '')) problems.push('a lowercase letter');
  if (!/[A-Z]/.test(pw || '')) problems.push('an uppercase letter');
  if (!/[0-9]/.test(pw || '')) problems.push('a number');
  return problems;
}

export function requireString(value, field, { min = 1, max = 200, optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    throw badRequest(`${field} is required`, { field });
  }
  if (typeof value !== 'string') throw badRequest(`${field} must be text`, { field });
  const v = value.trim();
  if (v.length < min) throw badRequest(`${field} is required`, { field });
  if (v.length > max) throw badRequest(`${field} must be at most ${max} characters`, { field });
  return v;
}

export function requireInt(value, field, { min, max } = {}) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isInteger(n)) throw badRequest(`${field} must be a whole number`, { field });
  if (min !== undefined && n < min) throw badRequest(`${field} must be at least ${min}`, { field });
  if (max !== undefined && n > max) throw badRequest(`${field} must be at most ${max}`, { field });
  return n;
}

/** Parses an ISO date-time string and returns a Date, or throws a 400. */
export function requireDateTime(value, field) {
  if (typeof value !== 'string' || !value) throw badRequest(`${field} is required`, { field });
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw badRequest(`${field} is not a valid date/time`, { field });
  return d;
}

export function optionalDateTime(value, field) {
  if (value === undefined || value === null || value === '') return null;
  return requireDateTime(value, field);
}

export function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) throw badRequest(`${field} must be one of: ${allowed.join(', ')}`, { field });
  return value;
}
