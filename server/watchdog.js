import db from './db.js';
import { HEARTBEAT_MS, MISSED_BEFORE_ALARM } from './config.js';
import { createIncident } from './incidents.js';

// Dead-man's switch: active trips that stopped pinging raise an alarm
// at the last known position. Ended trips are ignored (no false alarms).
export function startWatchdog() {
  setInterval(() => {
    const cutoff = Date.now() - HEARTBEAT_MS * MISSED_BEFORE_ALARM;
    const stale = db
      .prepare("SELECT id FROM trips WHERE status = 'ACTIVE' AND last_ping_at < ?")
      .all(cutoff);
    for (const t of stale) {
      createIncident(t.id, 'DEAD_MAN').catch((e) => console.error('[watchdog]', e));
    }
  }, 5000);
}
