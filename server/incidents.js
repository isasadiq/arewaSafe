import db from './db.js';
import { emit } from './events.js';
import { generateSitrep } from './dispatcher.js';
import { broadcast } from './broadcaster.js';
import { haversine, bearing } from './geo.js';
import { BROADCAST_RADIUS_KM, ROAD_NAME, findNearestCorridor } from './config.js';

function summarize(type, pings, pos) {
  const lastPing = pings.at(-1);
  const first = pings[0];
  const moved = first && lastPing ? haversine(first, lastPing) : 0;
  const speeds = pings.map((p) => p.speed).filter(Number.isFinite);
  const corridorMatch = findNearestCorridor(pos);
  const road = corridorMatch?.corridor?.name || ROAD_NAME;
  return {
    incident_type: type,
    road,
    last_position: { lat: pos.lat, lng: pos.lng },
    seconds_since_last_ping: lastPing ? Math.round((Date.now() - lastPing.ts) / 1000) : null,
    pings_considered: pings.length,
    avg_speed_kmh: speeds.length ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : null,
    last_speed_kmh: lastPing?.speed ?? null,
    track_bearing_deg: moved > 30 ? Math.round(bearing(first, lastPing)) : lastPing?.heading ?? null,
    distance_covered_m: Math.round(moved),
    local_time: new Date().toLocaleTimeString('en-GB', { timeZone: 'Africa/Lagos' }),
  };
}

export async function createIncident(tripId, type, override) {
  // One incident per trip per type.
  const existing = db.prepare('SELECT id FROM incidents WHERE trip_id = ? AND type = ?').get(tripId, type);
  if (existing) return existing.id;

  const pings = db
    .prepare('SELECT * FROM pings WHERE trip_id = ? ORDER BY ts DESC LIMIT 10')
    .all(tripId)
    .reverse();
  const pos = override?.lat != null ? override : pings.at(-1);
  if (!pos) return null; // no location known yet

  const id = Number(
    db
      .prepare('INSERT INTO incidents (trip_id, type, status, lat, lng, created_at) VALUES (?,?,?,?,?,?)')
      .run(tripId, type, 'ANALYZING', pos.lat, pos.lng, Date.now()).lastInsertRowid
  );
  db.prepare("UPDATE trips SET status = 'ALERT' WHERE id = ?").run(tripId);
  emit('incident', { id, tripId, type, lat: pos.lat, lng: pos.lng, status: 'ANALYZING' });

  const sitrep = await generateSitrep(summarize(type, pings, pos));

  // Safety gate: a second, different signal on the same trip auto-confirms.
  const others = db
    .prepare('SELECT COUNT(*) AS c FROM incidents WHERE trip_id = ? AND id != ?')
    .get(tripId, id).c;
  const status = others > 0 ? 'CONFIRMED' : 'PENDING_CONFIRM';

  db.prepare('UPDATE incidents SET sitrep_json = ?, status = ? WHERE id = ?').run(JSON.stringify(sitrep), status, id);
  emit('incident:update', { id, tripId, type, lat: pos.lat, lng: pos.lng, status, sitrep });

  if (status === 'CONFIRMED') confirmIncident(id);
  return id;
}

export function confirmIncident(id) {
  const inc = db.prepare('SELECT * FROM incidents WHERE id = ?').get(id);
  if (!inc || inc.status === 'BROADCAST' || !inc.sitrep_json) return null;
  const sitrep = JSON.parse(inc.sitrep_json);
  const result = broadcast({
    message: `${sitrep.hausa_warning} / ${sitrep.english_warning}`,
    lat: inc.lat,
    lng: inc.lng,
    radiusKm: BROADCAST_RADIUS_KM,
  });
  db.prepare("UPDATE incidents SET status = 'BROADCAST' WHERE id = ?").run(id);
  emit('incident:update', { id, tripId: inc.trip_id, type: inc.type, lat: inc.lat, lng: inc.lng, status: 'BROADCAST', sitrep });
  return result;
}
