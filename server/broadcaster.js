import { readFileSync } from 'node:fs';
import { haversine } from './geo.js';
import { emit } from './events.js';

const RECIPIENTS = JSON.parse(readFileSync(new URL('./recipients.json', import.meta.url), 'utf8'));

/**
 * STUB. Picks recipients inside the radius and logs/pushes the message.
 * Swap the body for a real Flash SMS / voice provider later; the
 * signature stays the same so nothing else changes.
 */
export function broadcast({ message, lat, lng, radiusKm }) {
  const hits = RECIPIENTS.filter((r) => haversine({ lat, lng }, r) <= radiusKm * 1000);
  console.log(`[broadcast] ${hits.length} recipient(s) within ${radiusKm}km: ${message}`);
  const result = { sent: hits.length, recipients: hits.map((r) => r.name), message };
  emit('broadcast', result);
  return result;
}
