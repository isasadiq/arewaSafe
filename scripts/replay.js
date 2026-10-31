#!/usr/bin/env node
/**
 * ArewaSafe Replay Driver
 * Demo simulator for travel-safety hackathon scenarios:
 * - deviation: normal driving, then perpendicular bush deviation at slow speed
 * - deadman: normal pings, then abrupt signal loss triggering dead-man's switch
 * - manual: normal driving, followed by silent 911= calculator trigger
 */

import { CORRIDOR, CORRIDORS, getCorridor } from '../server/config.js';

// CLI and Environment Config
const args = process.argv.slice(2);
const mode = args.find((a) => !a.startsWith('-')) || 'deviation';

function getArg(flag, envKey, defaultValue) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return process.env[envKey] || defaultValue;
}

const SERVER_URL = getArg('--url', 'SERVER_URL', 'http://localhost:3000').replace(/\/$/, '');
const INTERVAL_MS = Number(getArg('--interval', 'INTERVAL_MS', 2000));
const CORRIDOR_ID = getArg('--corridor', 'CORRIDOR', 'kaduna-zaria');
const ACTIVE_CORRIDOR = getCorridor(CORRIDOR_ID);
const corridorPoints = ACTIVE_CORRIDOR.points || CORRIDOR;

// Geodesic math helpers
const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

function haversine(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function bearing(a, b) {
  const dLng = rad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(dLng);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

function move(pt, distanceMeters, bearingDeg) {
  const bRad = rad(bearingDeg);
  const dLat = (distanceMeters * Math.cos(bRad)) / 110540;
  const dLng = (distanceMeters * Math.sin(bRad)) / (111320 * Math.cos(rad(pt.lat)));
  return { lat: Number((pt.lat + dLat).toFixed(6)), lng: Number((pt.lng + dLng).toFixed(6)) };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(path, options = {}) {
  const res = await fetch(`${SERVER_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} from ${path}: ${text}`);
  }
  return res.json();
}

function printUsage() {
  console.log(`
ArewaSafe Replay Driver
Usage: node scripts/replay.js <mode> [options]

Modes:
  deviation   Drive along corridor at 80 km/h, turn perpendicular into bush at 10 km/h
  deadman     Send a few normal heartbeats, then drop signal to trigger dead-man's switch
  manual      Send normal heartbeats, then trigger silent 911= panic alert

Options:
  --url <url>        Server URL (default: http://localhost:3000, env: SERVER_URL)
  --interval <ms>    Heartbeat interval in ms (default: 2000, env: INTERVAL_MS)
  --corridor <id>    Corridor: kaduna-zaria, abuja-kaduna, birnin-gwari, kano-katsina
  --help             Show this help message
`);
}

async function main() {
  if (args.includes('--help') || !['deviation', 'deadman', 'manual'].includes(mode)) {
    printUsage();
    process.exit(args.includes('--help') ? 0 : 1);
  }

  console.log(`=======================================================`);
  console.log(` ArewaSafe Demo Driver: [${mode.toUpperCase()}]`);
  console.log(` Target Server: ${SERVER_URL}`);
  console.log(` Ping Interval: ${INTERVAL_MS}ms`);
  console.log(`=======================================================\n`);

  // Step 1: Start Trip
  console.log(`[1/3] Starting new trip via POST /trips/start...`);
  const { tripId } = await api('/trips/start', { method: 'POST' });
  console.log(`✓ Trip #${tripId} started successfully.\n`);

  // Corridor base trajectory
  const startPt = { ...corridorPoints[0] };
  const midPt = { ...corridorPoints[1] };
  const roadBearing = Math.round(bearing(startPt, midPt));
  console.log(`Highway Corridor: ${ACTIVE_CORRIDOR.name} [Risk: ${ACTIVE_CORRIDOR.risk_level}]`);
  console.log(`Heading along corridor: ${roadBearing}°`);

  let currentPos = { ...startPt };
  let pingCount = 0;

  async function sendHeartbeat(pos, speed, heading, label = '') {
    pingCount++;
    console.log(
      `[Ping #${pingCount}] Trip #${tripId} | Lat: ${pos.lat.toFixed(5)}, Lng: ${pos.lng.toFixed(5)} | Speed: ${Math.round(speed)} km/h | Heading: ${Math.round(heading)}° ${label}`
    );
    await api('/heartbeat', {
      method: 'POST',
      body: JSON.stringify({
        tripId,
        lat: pos.lat,
        lng: pos.lng,
        speed: Math.round(speed),
        heading: Math.round(heading),
      }),
    });
  }

  // Phase 1: Normal driving along highway corridor
  console.log(`\n[2/3] Driving along highway corridor at ~80 km/h...`);
  const normalSpeed = 80; // km/h
  const stepDistNormal = (normalSpeed / 3.6) * (INTERVAL_MS / 1000); // meters per tick (~44.4m)

  const normalPings = mode === 'deviation' ? 4 : 3;
  for (let i = 0; i < normalPings; i++) {
    currentPos = move(currentPos, stepDistNormal, roadBearing);
    await sendHeartbeat(currentPos, normalSpeed, roadBearing, '(ON HIGHWAY)');
    await sleep(INTERVAL_MS);
  }

  // Phase 2: Scenario branch
  console.log(`\n[3/3] Triggering scenario: ${mode.toUpperCase()}...`);

  if (mode === 'deviation') {
    // Ambush / deviation scenario:
    // Turn perpendicular (roadBearing + 90) into the bush at ~10 km/h
    const perpBearing = (roadBearing + 90) % 360;
    const slowSpeed = 10; // km/h (< DEVIATION_MAX_KMH 25)

    console.log(`⚠️  Vehicle abruptly turning 90° off highway into bush at ${slowSpeed} km/h (Heading ${perpBearing}°)!`);

    // In a real demo, we want the deviation detector (>300m off corridor, 2 strikes) to trigger promptly.
    // Jump distance slightly into bush then send consecutive slow pings off road:
    // 1st off-road ping just crossing threshold (~320m)
    currentPos = move(currentPos, 320, perpBearing);
    await sendHeartbeat(currentPos, slowSpeed, perpBearing, '⚠️  [OFF-ROAD 320m - STRIKE 1]');
    await sleep(INTERVAL_MS);

    // 2nd off-road ping deeper into bush (~380m) -> Triggers BUSH_DEVIATION!
    currentPos = move(currentPos, 60, perpBearing);
    await sendHeartbeat(currentPos, slowSpeed, perpBearing, '🚨 [OFF-ROAD 380m - STRIKE 2 -> ALERT FIRED!]');
    await sleep(INTERVAL_MS);

    // 3rd off-road ping confirming movement deep in bush
    currentPos = move(currentPos, 50, perpBearing);
    await sendHeartbeat(currentPos, slowSpeed, perpBearing, '🚨 [OFF-ROAD 430m deep in bush]');

    console.log(`\n=======================================================`);
    console.log(`✓ BUSH_DEVIATION event should now be visible on the dashboard!`);
    console.log(`Open ${SERVER_URL} to view the SitRep and click "Confirm & broadcast".`);
    console.log(`=======================================================`);

  } else if (mode === 'deadman') {
    console.log(`⚠️  Vehicle stopped sending heartbeats unexpectedly (SIMULATING SIGNAL LOSS / PHONE SEIZED).`);
    console.log(`The trip was NOT ended with POST /trips/:id/end.`);
    console.log(`Watchdog server will check active trips and trigger DEAD_MAN incident after:`);
    console.log(`HEARTBEAT_MS * MISSED_BEFORE_ALARM.`);
    console.log(`Monitoring for incident creation on server...`);

    let detected = false;
    for (let sec = 1; sec <= 30; sec++) {
      process.stdout.write(`\rWaiting for watchdog alert... ${sec}s elapsed`);
      await sleep(1000);
      try {
        const incidents = await api('/incidents');
        const deadManInc = incidents.find((inc) => inc.trip_id === tripId && inc.type === 'DEAD_MAN');
        if (deadManInc) {
          detected = true;
          console.log(`\n\n🚨 DEAD_MAN incident #${deadManInc.id} triggered on server! Status: ${deadManInc.status}`);
          break;
        }
      } catch {
        // server busy or restarting
      }
    }

    if (!detected) {
      console.log(`\n(If server HEARTBEAT_MS is high, check ${SERVER_URL} shortly).`);
    }

  } else if (mode === 'manual') {
    console.log(`⚠️  User silently entered "911=" on the disguise calculator!`);
    console.log(`Dispatching silent POST /alert with location...`);

    const alertResult = await api('/alert', {
      method: 'POST',
      body: JSON.stringify({
        tripId,
        lat: currentPos.lat,
        lng: currentPos.lng,
      }),
    });

    console.log(`✓ POST /alert acknowledged by server:`, alertResult);
    console.log(`🚨 MANUAL alert created! SitRep is generating with ranked headings.`);
    console.log(`Open ${SERVER_URL} to view the incident on the dashboard.`);
  }
}

main().catch((err) => {
  console.error(`\n❌ Error:`, err.message);
  process.exit(1);
});
