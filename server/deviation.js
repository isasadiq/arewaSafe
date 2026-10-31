import db from './db.js';
import {
  CORRIDOR, DEVIATION_METERS, DEVIATION_MAX_KMH, DEVIATION_STRIKES, findNearestCorridor,
} from './config.js';
import { nearestOnPolyline, angleDiff } from './geo.js';

const strikes = new Map(); // tripId -> consecutive suspicious pings

/**
 * Call after each new ping is stored. Returns true once, when the
 * "left the road into the bush at slow speed" pattern is confirmed.
 */
export function checkDeviation(tripId, ping) {
  const match = findNearestCorridor(ping);
  const corridorPoints = match?.corridor?.points || CORRIDOR;
  const here = nearestOnPolyline(ping, corridorPoints);

  // Heading vs road direction, ignoring travel sense (0-90 deg scale).
  let offAxis = 0;
  if (Number.isFinite(ping.heading)) {
    const d = angleDiff(ping.heading, here.bearing);
    offAxis = Math.min(d, 180 - d);
  }

  const wasOnRoad = db
    .prepare('SELECT lat, lng FROM pings WHERE trip_id = ? ORDER BY ts DESC LIMIT 30')
    .all(tripId)
    .some((p) => nearestOnPolyline(p, corridorPoints).dist < 100);

  const suspicious =
    wasOnRoad &&
    here.dist > DEVIATION_METERS &&
    ping.speed < DEVIATION_MAX_KMH &&
    offAxis > 60;

  const count = suspicious ? (strikes.get(tripId) || 0) + 1 : 0;
  strikes.set(tripId, count);
  return count === DEVIATION_STRIKES;
}

export function clearDeviation(tripId) {
  strikes.delete(tripId);
}
