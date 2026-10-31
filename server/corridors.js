/**
 * Northern Nigerian Interstate Highway Corridors Database
 * Defines critical transit corridors, risk assessments, and GPS checkpoint waypoints.
 */

import { nearestOnPolyline } from './geo.js';

export const CORRIDORS = {
  'kaduna-zaria': {
    id: 'kaduna-zaria',
    name: 'Kaduna–Zaria Highway',
    risk_level: 'HIGH',
    state: 'Kaduna State',
    total_km: 78,
    checkpoints: [
      { name: 'Kaduna City (Kawo)', lat: 10.5605, lng: 7.4420 },
      { name: 'Rigachikun Checkpoint', lat: 10.6430, lng: 7.4820 },
      { name: 'Maraban Jos Junction', lat: 10.7420, lng: 7.5250 },
      { name: 'Jaji Military Cantonment', lat: 10.8350, lng: 7.5780 },
      { name: 'Zaria Toll Gate (Sabon Gari)', lat: 11.0855, lng: 7.7199 }
    ],
    points: [
      { lat: 10.5105, lng: 7.4165 },
      { lat: 10.6030, lng: 7.4620 },
      { lat: 10.7420, lng: 7.5250 },
      { lat: 10.8350, lng: 7.5780 },
      { lat: 10.9600, lng: 7.6400 },
      { lat: 11.0855, lng: 7.7199 }
    ]
  },

  'abuja-kaduna': {
    id: 'abuja-kaduna',
    name: 'Abuja–Kaduna Expressway',
    risk_level: 'CRITICAL',
    state: 'FCT / Niger / Kaduna',
    total_km: 160,
    checkpoints: [
      { name: 'Zuba (Abuja Departure)', lat: 9.1120, lng: 7.2140 },
      { name: 'Tafa Toll Checkpoint', lat: 9.2450, lng: 7.2780 },
      { name: 'Jere Junction', lat: 9.5310, lng: 7.3750 },
      { name: 'Katari Transit Post', lat: 9.7820, lng: 7.4320 },
      { name: 'Rijana Outpost', lat: 9.9850, lng: 7.4720 },
      { name: 'Kakau Checkpoint', lat: 10.3550, lng: 7.4350 },
      { name: 'Kaduna South (Command Gate)', lat: 10.4850, lng: 7.4200 }
    ],
    points: [
      { lat: 9.1120, lng: 7.2140 },
      { lat: 9.2450, lng: 7.2780 },
      { lat: 9.5310, lng: 7.3750 },
      { lat: 9.7820, lng: 7.4320 },
      { lat: 9.9850, lng: 7.4720 },
      { lat: 10.2100, lng: 7.4550 },
      { lat: 10.3550, lng: 7.4350 },
      { lat: 10.4850, lng: 7.4200 }
    ]
  },

  'birnin-gwari': {
    id: 'birnin-gwari',
    name: 'Kaduna–Birnin Gwari Highway',
    risk_level: 'SEVERE',
    state: 'Kaduna State',
    total_km: 120,
    checkpoints: [
      { name: 'Kaduna West Outpost', lat: 10.5250, lng: 7.3850 },
      { name: 'Buruku Forest Gate', lat: 10.6200, lng: 7.1500 },
      { name: 'Udawa Security Post', lat: 10.6900, lng: 6.9200 },
      { name: 'Birnin Gwari Central', lat: 10.6650, lng: 6.5400 }
    ],
    points: [
      { lat: 10.5250, lng: 7.3850 },
      { lat: 10.6200, lng: 7.1500 },
      { lat: 10.6900, lng: 6.9200 },
      { lat: 10.6650, lng: 6.5400 }
    ]
  },

  'kano-katsina': {
    id: 'kano-katsina',
    name: 'Kano–Katsina Highway',
    risk_level: 'MODERATE',
    state: 'Kano / Katsina',
    total_km: 135,
    checkpoints: [
      { name: 'Kano City (Dawanau)', lat: 12.0022, lng: 8.5120 },
      { name: 'Dambatta Hub', lat: 12.4350, lng: 8.5150 },
      { name: 'Kazaure Checkpoint', lat: 12.6500, lng: 8.4100 },
      { name: 'Katsina Central Gate', lat: 12.9850, lng: 7.6000 }
    ],
    points: [
      { lat: 12.0022, lng: 8.5120 },
      { lat: 12.4350, lng: 8.5150 },
      { lat: 12.6500, lng: 8.4100 },
      { lat: 12.8200, lng: 8.0100 },
      { lat: 12.9850, lng: 7.6000 }
    ]
  }
};

/**
 * Automatically determine the closest highway corridor for a given coordinate.
 */
export function findNearestCorridor(point) {
  let best = null;
  let minDistance = Infinity;

  for (const corridor of Object.values(CORRIDORS)) {
    const res = nearestOnPolyline(point, corridor.points);
    if (res.dist < minDistance) {
      minDistance = res.dist;
      best = { corridor, distance: res.dist, bearing: res.bearing };
    }
  }

  return best;
}

export function getCorridor(id) {
  return CORRIDORS[id] || CORRIDORS['kaduna-zaria'];
}
