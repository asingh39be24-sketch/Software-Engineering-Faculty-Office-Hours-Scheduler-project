// Helpers shared by the slot, booking and waitlist services.
// A slot has a capacity (1 for a normal one-to-one slot, more for a group session).
// Slot status 'booked' means "full"; 'open' means "has at least one place left".

export function countActive(db, slotId) {
  return db.prepare("SELECT COUNT(*) c FROM bookings WHERE slot_id = ? AND status <> 'cancelled'").get(slotId).c;
}

/** How many upcoming confirmed appointments a student holds (used for the booking limit). */
export function countUpcoming(db, studentId, now) {
  return db
    .prepare(
      `SELECT COUNT(*) c FROM bookings b JOIN slots s ON s.id = b.slot_id
       WHERE b.student_id = ? AND b.status = 'confirmed' AND s.slot_time > ?`
    )
    .get(studentId, now).c;
}

/**
 * Sets a non-withdrawn slot to 'booked' when it is full and back to 'open' when it has room.
 * Call it inside the same transaction as the booking change that affected the slot.
 */
export function syncSlotStatus(db, slotId) {
  db.prepare(
    `UPDATE slots SET status = CASE
       WHEN (SELECT COUNT(*) FROM bookings b WHERE b.slot_id = slots.id AND b.status <> 'cancelled') >= capacity
       THEN 'booked' ELSE 'open' END
     WHERE id = ? AND status <> 'cancelled'`
  ).run(slotId);
}

/** "Online (link shared in your booking)" / "Room 12" / null - the text students see before booking. */
export function whereText(slot, facultyOffice) {
  if (slot.mode === 'online') return 'Online';
  return slot.location || facultyOffice || null;
}
