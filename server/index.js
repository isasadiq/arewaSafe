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
import { rateLimiter, dispatcherAuth, deviceAuth, logAudit } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../dashboard')));

// System Health & Telemetry Metrics Endpoint
app.get('/health', (_req, res) => {
  const activeTrips = db.prepare("SELECT COUNT(*) AS c FROM trips WHERE status = 'ACTIVE'").get().c;
  const totalIncidents = db.prepare('SELECT COUNT(*) AS c FROM incidents').get().c;
  const totalPings = db.prepare('SELECT COUNT(*) AS c FROM pings').get().c;
  res.json({
    status: 'HEALTHY',
    service: 'ArewaSafe Tactical Engine',
    uptimeSeconds: Math.round(process.uptime()),
    database: 'CONNECTED_WAL',
    telemetry: {
      active_trips: activeTrips,
      total_incidents: totalIncidents,
      total_pings: totalPings,
    },
    timestamp: new Date().toISOString(),
  });
});

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

app.post('/trips/start', rateLimiter(60000, 30), deviceAuth, (_req, res) => {
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
app.post('/heartbeat', rateLimiter(60000, 120), deviceAuth, (req, res) => {
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
app.post('/alert', rateLimiter(60000, 20), deviceAuth, (req, res) => {
  const { tripId } = req.body;
  if (!tripId) return res.status(400).json({ error: 'tripId required' });
  logAudit('MANUAL_PANIC_TRIGGERED', req.ip || 'device', { tripId });
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

// Fleet Device Management & Security Endpoints
app.get('/devices', dispatcherAuth, (_req, res) => {
  res.json(db.prepare('SELECT id, label, token, created_at, last_seen_at FROM devices ORDER BY created_at DESC').all());
});

app.post('/devices', dispatcherAuth, (req, res) => {
  const { id, label, token } = req.body;
  if (!id || !label || !token) {
    return res.status(400).json({ error: 'id, label, and token are required' });
  }
  try {
    db.prepare('INSERT INTO devices (id, label, token, created_at) VALUES (?, ?, ?, ?)').run(id, label, token, Date.now());
    logAudit('DEVICE_REGISTERED', req.ip || 'dispatcher', { id, label });
    res.json({ ok: true, device: { id, label } });
  } catch (err) {
    res.status(409).json({ error: 'Device ID or token already exists' });
  }
});

// Tactical Security Audit Logs
app.get('/audit-logs', dispatcherAuth, (_req, res) => {
  const logs = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100').all();
  res.json(logs.map((l) => ({ ...l, details: l.details_json ? JSON.parse(l.details_json) : null })));
});

// Dashboard "Confirm & broadcast" button.
app.post('/incidents/:id/confirm', dispatcherAuth, (req, res) => {
  const result = confirmIncident(Number(req.params.id));
  if (!result) return res.status(409).json({ error: 'not ready or already broadcast' });
  logAudit('BROADCAST_AUTHORIZED', req.ip || 'dispatcher', { incidentId: Number(req.params.id), sent: result.sent });
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
