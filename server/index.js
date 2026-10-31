import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from './db.js';
import { PORT, CORRIDORS } from './config.js';
import { addClient, removeClient, emit } from './events.js';
import { checkDeviation, clearDeviation } from './deviation.js';
import { createIncident, confirmIncident } from './incidents.js';
import { startWatchdog } from './watchdog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../dashboard')));

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

app.post('/trips/start', (_req, res) => {
  const now = Date.now();
  const id = Number(
    db.prepare("INSERT INTO trips (status, started_at, last_ping_at) VALUES ('ACTIVE', ?, ?)").run(now, now).lastInsertRowid
  );
  emit('trip', { id, status: 'ACTIVE' });
  res.json({ tripId: id });
});

app.post('/trips/:id/end', (req, res) => {
  const id = Number(req.params.id);
  db.prepare("UPDATE trips SET status = 'ENDED' WHERE id = ?").run(id);
  clearDeviation(id);
  emit('trip', { id, status: 'ENDED' });
  res.json({ ok: true });
});

// body: { tripId, lat, lng, speed (km/h), heading (deg) }
app.post('/heartbeat', (req, res) => {
  const { tripId } = req.body;
  const lat = num(req.body.lat), lng = num(req.body.lng);
  if (!tripId || lat === null || lng === null) return res.status(400).json({ error: 'tripId, lat, lng required' });

  const trip = db.prepare('SELECT status FROM trips WHERE id = ?').get(tripId);
  if (!trip || trip.status === 'ENDED') return res.status(404).json({ error: 'trip not active' });

  const ping = { lat, lng, speed: num(req.body.speed), heading: num(req.body.heading), ts: Date.now() };
  db.prepare('INSERT INTO pings (trip_id, lat, lng, speed, heading, ts) VALUES (?,?,?,?,?,?)')
    .run(tripId, ping.lat, ping.lng, ping.speed, ping.heading, ping.ts);
  db.prepare('UPDATE trips SET last_ping_at = ? WHERE id = ?').run(ping.ts, tripId);
  emit('ping', { tripId, ...ping });

  if (checkDeviation(tripId, ping)) {
    createIncident(tripId, 'BUSH_DEVIATION').catch((e) => console.error(e));
  }
  res.json({ ok: true });
});

// The calculator's silent "911=" trigger. body: { tripId, lat?, lng? }
app.post('/alert', (req, res) => {
  const { tripId } = req.body;
  if (!tripId) return res.status(400).json({ error: 'tripId required' });
  createIncident(tripId, 'MANUAL', { lat: num(req.body.lat), lng: num(req.body.lng) })
    .catch((e) => console.error(e));
  res.json({ ok: true }); // generic reply, nothing for an attacker to see
});

app.get('/incidents', (_req, res) => {
  const rows = db.prepare('SELECT * FROM incidents ORDER BY id DESC LIMIT 50').all();
  res.json(rows.map((r) => ({ ...r, sitrep: r.sitrep_json ? JSON.parse(r.sitrep_json) : null })));
});

app.get('/trips', (_req, res) => {
  res.json(db.prepare("SELECT id, status, started_at, last_ping_at FROM trips WHERE status != 'ENDED' ORDER BY id").all());
});

app.get('/corridors', (_req, res) => {
  res.json(CORRIDORS);
});

app.get('/trips/:id/track', (req, res) => {
  res.json(db.prepare('SELECT lat, lng, speed, heading, ts FROM pings WHERE trip_id = ? ORDER BY ts').all(Number(req.params.id)));
});

// Dashboard "Confirm & broadcast" button.
app.post('/incidents/:id/confirm', (req, res) => {
  const result = confirmIncident(Number(req.params.id));
  if (!result) return res.status(409).json({ error: 'not ready or already broadcast' });
  res.json(result);
});

app.get('/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  addClient(res);
  req.on('close', () => removeClient(res));
});

startWatchdog();
app.listen(PORT, () => console.log(`ArewaSafe server on :${PORT}`));
