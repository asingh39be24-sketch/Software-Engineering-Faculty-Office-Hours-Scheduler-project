import { config } from '../config.js';

export const nowIso = () => new Date().toISOString();
export const toIso = (d) => new Date(d).toISOString();
export const addMinutes = (d, m) => new Date(new Date(d).getTime() + m * 60_000);

/** "Thu, 26 Nov 2026, 10:30 am" in the configured application time zone. */
export function formatSlotTime(iso) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: config.appTimezone,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
