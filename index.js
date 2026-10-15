import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = 'dev-secret-change-in-production';
const app = express();
app.use(cors());
app.use(express.json());

const db = new Database('scheduler.db');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('student', 'faculty', 'admin'))
  );

  CREATE TABLE IF NOT EXISTS slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    faculty_id INTEGER NOT NULL REFERENCES users(id),
    slot_time TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','booked','cancelled')),
    UNIQUE(faculty_id, slot_time)
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slot_id INTEGER NOT NULL UNIQUE REFERENCES slots(id),
    student_id INTEGER NOT NULL REFERENCES users(id),
    booked_at TEXT NOT NULL DEFAULT (datetime('now')),
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','completed','no_show','cancelled'))
  );
`);

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
}

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = jwt.verify(header.replace('Bearer ', ''), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) return res.status(403).json({ error: `Only ${role} can do this` });
    next();
  };
}

// --- Auth ---
app.post('/api/signup', (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) return res.status(400).json({ error: 'Missing fields' });
  const hash = bcrypt.hashSync(password, 10);
  try {
    const info = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)')
      .run(name, email, hash, role);
    const user = { id: info.lastInsertRowid, role, name };
    res.json({ token: signToken(user) });
  } catch (e) {
    res.status(400).json({ error: 'Email already registered' });
  }
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  res.json({ token: signToken(user) });
});

// --- Faculty: publish slots ---
app.post('/api/slots', auth, requireRole('faculty'), (req, res) => {
  const { slot_time } = req.body;
  try {
    const info = db.prepare('INSERT INTO slots (faculty_id, slot_time) VALUES (?,?)')
      .run(req.user.id, slot_time);
    res.json({ id: info.lastInsertRowid, slot_time, status: 'open' });
  } catch (e) {
    res.status(409).json({ error: 'You already have a slot at this time' });
  }
});

// --- Anyone: browse open slots ---
app.get('/api/slots', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT slots.id, slots.slot_time, slots.status, users.name AS faculty_name
    FROM slots JOIN users ON users.id = slots.faculty_id
    WHERE slots.status = 'open'
    ORDER BY slots.slot_time ASC
  `).all();
  res.json(rows);
});

// --- Student: book a slot (the core, transactional operation) ---
app.post('/api/bookings', auth, requireRole('student'), (req, res) => {
  const { slot_id } = req.body;

  const bookSlot = db.transaction((slotId, studentId) => {
    const slot = db.prepare("SELECT * FROM slots WHERE id = ? AND status = 'open'").get(slotId);
    if (!slot) throw new Error('SLOT_UNAVAILABLE');

    db.prepare("UPDATE slots SET status = 'booked' WHERE id = ? AND status = 'open'").run(slotId);
    const info = db.prepare('INSERT INTO bookings (slot_id, student_id) VALUES (?,?)').run(slotId, studentId);
    return info.lastInsertRowid;
  });

  try {
    const bookingId = bookSlot(slot_id, req.user.id);
    res.json({ id: bookingId, status: 'confirmed' });
  } catch (e) {
    if (e.message === 'SLOT_UNAVAILABLE' || e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'This slot was just booked by someone else' });
    }
    res.status(500).json({ error: 'Booking failed' });
  }
});

// --- Faculty: mark outcome ---
app.patch('/api/bookings/:id', auth, requireRole('faculty'), (req, res) => {
  const { status } = req.body; // 'completed' | 'no_show'
  db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ok: true });
});

// --- Admin: analytics ---
app.get('/api/analytics', auth, requireRole('admin'), (req, res) => {
  const total = db.prepare('SELECT COUNT(*) c FROM bookings').get().c;
  const noShows = db.prepare("SELECT COUNT(*) c FROM bookings WHERE status = 'no_show'").get().c;
  const openSlots = db.prepare("SELECT COUNT(*) c FROM slots WHERE status = 'open'").get().c;
  const bookedSlots = db.prepare("SELECT COUNT(*) c FROM slots WHERE status = 'booked'").get().c;
  res.json({
    totalBookings: total,
    noShowRate: total ? +(noShows / total * 100).toFixed(1) : 0,
    slotUtilization: (openSlots + bookedSlots) ? +(bookedSlots / (openSlots + bookedSlots) * 100).toFixed(1) : 0
  });
});

const PORT = 4000;
app.listen(PORT, () => console.log(`Scheduler backend running on http://localhost:${PORT}`));
