// One line explaining who cancelled an appointment and why, shown to students and faculty.
const WHO = {
  student: { student: 'You cancelled', faculty: 'Cancelled by the student', admin: 'Cancelled by the student' },
  faculty: { student: 'Cancelled by the faculty member', faculty: 'You cancelled', admin: 'Cancelled by the faculty member' },
  admin: { student: 'Cancelled by an administrator', faculty: 'Cancelled by an administrator', admin: 'Cancelled by an administrator' },
};

/** Readable "cancelled by" text for a booking, from the point of view of `viewer` (a role). */
export function cancelledByText(booking, viewer) {
  return WHO[booking.cancelledBy]?.[viewer] || 'Cancelled';
}

export function CancelNote({ booking, viewer, className = '' }) {
  if (booking?.status !== 'cancelled') return null;
  const admin = booking.cancelledBy === 'admin';
  return (
    <p className={`text-xs ${admin ? 'text-brick-600' : 'text-ink-500'} ${className}`}>
      {cancelledByText(booking, viewer)}
      {booking.cancelReason && <> · “{booking.cancelReason}”</>}
    </p>
  );
}
