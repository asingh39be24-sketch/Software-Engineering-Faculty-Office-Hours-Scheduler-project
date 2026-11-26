// Database schema. All timestamps are stored as ISO-8601 UTC strings
// (e.g. 2026-11-26T09:30:00.000Z) so they sort and compare lexicographically.

export const SCHEMA_VERSION = 2;

const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";

export const schemaSql = `
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  email           TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash   TEXT    NOT NULL,
  role            TEXT    NOT NULL CHECK (role IN ('student','faculty','admin')),
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  department      TEXT,
  designation     TEXT,
  office_location TEXT,
  bio             TEXT,
  created_at      TEXT    NOT NULL DEFAULT ${NOW},
  last_login_at   TEXT
);

CREATE TABLE IF NOT EXISTS slots (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  faculty_id       INTEGER NOT NULL REFERENCES users(id),
  slot_time        TEXT    NOT NULL,             -- start (kept from the prototype schema)
  end_time         TEXT    NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 5 AND 240),
  status           TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open','booked','cancelled')),
  created_at       TEXT    NOT NULL DEFAULT ${NOW},
  cancelled_at     TEXT,
  -- Meeting details (schema v2). When capacity > 1 the slot is a group session;
  -- status 'booked' then means "full".
  mode             TEXT    NOT NULL DEFAULT 'in_person' CHECK (mode IN ('in_person','online')),
  location         TEXT,                         -- room / place (in-person)
  meeting_link     TEXT,                         -- video link (online)
  capacity         INTEGER NOT NULL DEFAULT 1 CHECK (capacity BETWEEN 1 AND 50),
  CHECK (end_time > slot_time)
);

-- One live slot per faculty member per start time. Cancelled slots are excluded so a
-- faculty member can re-publish a time they previously withdrew.
CREATE UNIQUE INDEX IF NOT EXISTS ux_slots_faculty_time_live
  ON slots(faculty_id, slot_time) WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS ix_slots_status_time ON slots(status, slot_time);

CREATE TABLE IF NOT EXISTS bookings (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  slot_id          INTEGER NOT NULL REFERENCES slots(id),
  student_id       INTEGER NOT NULL REFERENCES users(id),
  booked_at        TEXT    NOT NULL DEFAULT ${NOW},
  status           TEXT    NOT NULL DEFAULT 'confirmed'
                   CHECK (status IN ('confirmed','completed','no_show','cancelled')),
  note             TEXT,                         -- optional topic the student wants to discuss
  status_changed_at TEXT,
  cancelled_by     TEXT CHECK (cancelled_by IN ('student','faculty','admin')),
  cancel_reason    TEXT,
  reminder_sent_at TEXT,
  rescheduled_from INTEGER REFERENCES bookings(id) ON DELETE SET NULL   -- schema v2: the booking this one replaced
);

-- THE overbooking guarantee (schema v2). A slot has a capacity (1 for a normal
-- one-to-one slot). The trigger below rejects any INSERT that would push a slot past
-- its capacity, even for code that bypasses the booking service, and the unique index
-- stops one student holding two active places in the same slot. (Schema v1 used a
-- unique index on slot_id alone, which only works for capacity 1.)
CREATE UNIQUE INDEX IF NOT EXISTS ux_bookings_slot_student_active
  ON bookings(slot_id, student_id) WHERE status <> 'cancelled';

CREATE TRIGGER IF NOT EXISTS trg_bookings_capacity
BEFORE INSERT ON bookings
WHEN NEW.status <> 'cancelled'
BEGIN
  SELECT RAISE(ABORT, 'slot is full')
  WHERE (SELECT COUNT(*) FROM bookings WHERE slot_id = NEW.slot_id AND status <> 'cancelled')
        >= (SELECT capacity FROM slots WHERE id = NEW.slot_id);
END;

CREATE INDEX IF NOT EXISTS ix_bookings_student ON bookings(student_id);

CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  type        TEXT    NOT NULL CHECK (type IN ('booking_confirmed','booking_received','reminder',
                                               'booking_cancelled','outcome_recorded','account')),
  title       TEXT    NOT NULL,
  message     TEXT    NOT NULL,
  booking_id  INTEGER REFERENCES bookings(id),
  is_read     INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0,1)),
  created_at  TEXT    NOT NULL DEFAULT ${NOW},
  read_at     TEXT
);
CREATE INDEX IF NOT EXISTS ix_notifications_user ON notifications(user_id, is_read, created_at);

CREATE TABLE IF NOT EXISTS activity_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    INTEGER REFERENCES users(id),
  action      TEXT    NOT NULL,
  entity_type TEXT,
  entity_id   INTEGER,
  details     TEXT,
  created_at  TEXT    NOT NULL DEFAULT ${NOW}
);
CREATE INDEX IF NOT EXISTS ix_activity_created ON activity_log(created_at);

-- Students waiting for a place in a full slot, first come first served (schema v2).
CREATE TABLE IF NOT EXISTS waitlist (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slot_id     INTEGER NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
  student_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT    NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','promoted','left','expired')),
  created_at  TEXT    NOT NULL DEFAULT ${NOW},
  resolved_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_waitlist_slot_student_waiting
  ON waitlist(slot_id, student_id) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS ix_waitlist_slot ON waitlist(slot_id, status, created_at);
CREATE INDEX IF NOT EXISTS ix_waitlist_student ON waitlist(student_id, status);

-- A student asks a classmate to exchange appointments with the same faculty member (schema v2).
-- If the other student accepts, the two bookings change hands in one transaction.
CREATE TABLE IF NOT EXISTS swap_requests (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_booking INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  target_booking    INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  status            TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','cancelled')),
  created_at        TEXT    NOT NULL DEFAULT ${NOW},
  resolved_at       TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_swap_pending_pair
  ON swap_requests(requester_booking, target_booking) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS ix_swap_target ON swap_requests(target_booking, status);
`;

/**
 * Upgrades a database created by an older version of the app (run BEFORE schemaSql).
 * Safe to run on every start: each step checks first. Existing data is kept.
 */
export function migrate(db) {
  const columns = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);

  const slotCols = columns('slots');
  if (slotCols.length) {
    if (!slotCols.includes('mode')) {
      db.exec("ALTER TABLE slots ADD COLUMN mode TEXT NOT NULL DEFAULT 'in_person' CHECK (mode IN ('in_person','online'))");
    }
    if (!slotCols.includes('location')) db.exec('ALTER TABLE slots ADD COLUMN location TEXT');
    if (!slotCols.includes('meeting_link')) db.exec('ALTER TABLE slots ADD COLUMN meeting_link TEXT');
    if (!slotCols.includes('capacity')) {
      db.exec('ALTER TABLE slots ADD COLUMN capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity BETWEEN 1 AND 50)');
    }
  }
  const bookingCols = columns('bookings');
  if (bookingCols.length && !bookingCols.includes('rescheduled_from')) {
    db.exec('ALTER TABLE bookings ADD COLUMN rescheduled_from INTEGER REFERENCES bookings(id)');
  }
  // v1's one-booking-per-slot index would block group sessions; the trigger replaces it.
  const oldIndex = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'ux_bookings_slot_active'").get();
  if (oldIndex) db.exec('DROP INDEX ux_bookings_slot_active');
}
