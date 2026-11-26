import { cn } from '../../utils/cn.js';

const TONES = {
  neutral: 'bg-ink-100 text-ink-700 ring-ink-200',
  pine: 'bg-pine-50 text-pine-700 ring-pine-200',
  cobalt: 'bg-cobalt-50 text-cobalt-700 ring-cobalt-200',
  marigold: 'bg-marigold-50 text-marigold-600 ring-marigold-200',
  brick: 'bg-brick-50 text-brick-700 ring-brick-200',
  outline: 'bg-white text-ink-600 ring-ink-200',
};

export function Badge({ tone = 'neutral', dot = false, className, children }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-1.5 py-px text-xs font-medium ring-1 ring-inset', TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden />}
      {children}
    </span>
  );
}

const BOOKING = {
  confirmed: { tone: 'cobalt', label: 'Confirmed' },
  awaiting: { tone: 'marigold', label: 'Awaiting outcome' },
  completed: { tone: 'pine', label: 'Completed' },
  no_show: { tone: 'brick', label: 'No-show' },
  cancelled: { tone: 'neutral', label: 'Cancelled' },
};
const SLOT = {
  open: { tone: 'pine', label: 'Open' },
  booked: { tone: 'cobalt', label: 'Booked' },
  cancelled: { tone: 'neutral', label: 'Withdrawn' },
  expired: { tone: 'outline', label: 'Expired' },
};

/** Booking status, with "confirmed but already over" shown as awaiting an outcome. */
export function BookingStatus({ booking, status }) {
  let key = status || booking?.status;
  if (booking && key === 'confirmed' && !booking.isUpcoming) key = 'awaiting';
  const s = BOOKING[key] || { tone: 'neutral', label: key };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

export function SlotStatus({ status }) {
  const s = SLOT[status] || { tone: 'neutral', label: status };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}
