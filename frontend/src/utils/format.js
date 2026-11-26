// All dates arrive as ISO UTC strings and are shown in the viewer's local time zone.
const loc = undefined; // browser default locale

export const fmtTime = (iso) => new Date(iso).toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' });
export const fmtDate = (iso, opts = {}) =>
  new Date(iso).toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'short', ...opts });
export const fmtDateLong = (iso) =>
  new Date(iso).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const fmtDateTime = (iso) => `${fmtDate(iso)}, ${fmtTime(iso)}`;
export const fmtRange = (start, end) => `${fmtTime(start)} – ${fmtTime(end)}`;

export function fmtRelative(iso) {
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(loc, { numeric: 'auto' });
  if (abs < 60_000) return 'just now';
  if (abs < 3600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86400_000) return rtf.format(Math.round(diff / 3600_000), 'hour');
  if (abs < 7 * 86400_000) return rtf.format(Math.round(diff / 86400_000), 'day');
  return fmtDate(iso, { year: 'numeric' });
}

/** Local calendar key YYYY-MM-DD for an instant. */
export function dayKey(dateLike) {
  const d = new Date(dateLike);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function startOfLocalDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/** Build an ISO instant from a local date (YYYY-MM-DD) and time (HH:MM). */
export const localToIso = (date, time) => new Date(`${date}T${time}`).toISOString();

export const timeOfDay = (iso) => {
  const h = new Date(iso).getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
};

export const plural = (n, word, pl = `${word}s`) => `${n} ${n === 1 ? word : pl}`;
export const initials = (name = '') =>
  name.replace(/^(Dr|Prof|Mr|Ms|Mrs)\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
