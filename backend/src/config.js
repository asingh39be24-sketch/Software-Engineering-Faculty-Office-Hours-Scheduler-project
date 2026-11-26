import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
export const BACKEND_ROOT = path.resolve(here, '..');

// Load backend/.env if present. Real environment variables always win.
dotenv.config({ path: path.join(BACKEND_ROOT, '.env'), quiet: true });

function int(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

const resolveFromRoot = (p) => (path.isAbsolute(p) ? p : path.join(BACKEND_ROOT, p));

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: int('PORT', 4000),
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  dbPath: process.env.DB_PATH === ':memory:' ? ':memory:' : resolveFromRoot(process.env.DB_PATH || 'data/scheduler.db'),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  // Admin self-registration is disabled unless this code is set.
  adminRegistrationCode: process.env.ADMIN_REGISTRATION_CODE || '',
  // Students can cancel a confirmed booking up to this many minutes before it starts.
  cancellationCutoffMinutes: int('CANCELLATION_CUTOFF_MINUTES', 60),
  // A student can hold at most this many upcoming confirmed appointments at once.
  maxUpcomingBookings: int('MAX_UPCOMING_BOOKINGS', 3),
  // Reminders are sent this many minutes before an appointment.
  reminderLeadMinutes: int('REMINDER_LEAD_MINUTES', 60),
  reminderIntervalSeconds: int('REMINDER_INTERVAL_SECONDS', 60),
  // Faculty can publish at most this many days ahead.
  maxPublishDaysAhead: int('MAX_PUBLISH_DAYS_AHEAD', 120),
  // Used only to format times inside notification / email text. The web UI always
  // shows times in the viewer's own browser time zone.
  appTimezone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: int('SMTP_PORT', 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.EMAIL_FROM || '',
  },
  frontendDist: resolveFromRoot(process.env.FRONTEND_DIST || '../frontend/dist'),
};

export function assertRuntimeConfig() {
  if (!config.jwtSecret || config.jwtSecret.length < 32) {
    throw new Error(
      'JWT_SECRET is missing or shorter than 32 characters. Run `npm run setup` (creates backend/.env) ' +
        'or set JWT_SECRET in the environment.'
    );
  }
}
