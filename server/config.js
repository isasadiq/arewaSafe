const n = (v, d) => (v !== undefined && v !== '' ? Number(v) : d);

export const PORT = n(process.env.PORT, 3000);
export const HEARTBEAT_MS = n(process.env.HEARTBEAT_MS, 60000);
export const MISSED_BEFORE_ALARM = n(process.env.MISSED_BEFORE_ALARM, 2);
export const BROADCAST_RADIUS_KM = n(process.env.BROADCAST_RADIUS_KM, 5);

export const DEVIATION_METERS = n(process.env.DEVIATION_METERS, 300);
export const DEVIATION_MAX_KMH = n(process.env.DEVIATION_MAX_KMH, 25);
export const DEVIATION_STRIKES = n(process.env.DEVIATION_STRIKES, 2);

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
export const GEMMA_MODEL = process.env.GEMMA_MODEL || '';

// Security & Authentication
export const DISPATCH_PIN = process.env.DISPATCH_PIN || '';
export const REQUIRE_DEVICE_AUTH = process.env.REQUIRE_DEVICE_AUTH === 'true';

export const ROAD_NAME = 'Kaduna–Zaria highway';

export { CORRIDORS, findNearestCorridor, getCorridor } from './corridors.js';

// Default corridor points
export const CORRIDOR = [
  { lat: 10.5105, lng: 7.4165 }, // Kaduna
  { lat: 10.8, lng: 7.57 },      // midpoint (approx)
  { lat: 11.0855, lng: 7.7199 }, // Zaria
];
