/**
 * App Configuration
 * Update SERVER_URL with your laptop's LAN IP (e.g. 'http://192.168.1.150:3000')
 * when testing on a physical phone via Expo Go.
 */
export const SERVER_URL = 'http://10.0.2.2:3000'; // Change to laptop LAN IP, e.g. http://192.168.1.x:3000

// Heartbeat interval in milliseconds (default 10s for demos, 60s for real-world)
export const HEARTBEAT_MS = 10000;

// Command Center Emergency GSM SMS Gateway (for data-off/rural blackouts)
export const COMMAND_CENTER_PHONE = '+2348000000000';

// Optional Pre-Shared Device Authentication Token
export const DEVICE_TOKEN = 'AREWASAFE-DEV-MOBILE-01';
