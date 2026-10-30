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
`);

export default db;
