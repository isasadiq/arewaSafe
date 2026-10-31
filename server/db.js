import Database from 'better-sqlite3';

const db = new Database(process.env.DB_PATH || 'arewasafe.db');
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL,            -- ACTIVE | ALERT | ENDED
  started_at INTEGER NOT NULL,
  last_ping_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  speed REAL,                      -- km/h
  heading REAL,                    -- degrees, 0 = north
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pings_trip_ts ON pings(trip_id, ts);
CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL,
  type TEXT NOT NULL,              -- MANUAL | DEAD_MAN | BUSH_DEVIATION
  status TEXT NOT NULL,            -- ANALYZING | PENDING_CONFIRM | CONFIRMED | BROADCAST
  lat REAL,
  lng REAL,
  sitrep_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  details_json TEXT,
  ts INTEGER NOT NULL
);
`);

// Seed default authorized devices for field hardware, mobile units, and simulators
const seedDevice = db.prepare(`
  INSERT OR IGNORE INTO devices (id, label, token, created_at)
  VALUES (?, ?, ?, ?)
`);
const now = Date.now();
seedDevice.run('DEV-MOBILE-01', 'Commercial Transit Mobile Unit #1', 'AREWASAFE-DEV-MOBILE-01', now);
seedDevice.run('HW-BUS-01', 'ESP32 Under-Seat Blackbox Unit #1', 'AREWASAFE-HW-BUS-01', now);
seedDevice.run('DEMO-SIM-01', 'Tactical Demo & Simulation Driver', 'AREWASAFE-DEMO-SIM', now);

export default db;
