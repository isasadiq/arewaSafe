import * as Location from 'expo-location';
import { Linking } from 'react-native';
import { SERVER_URL, HEARTBEAT_MS, COMMAND_CENTER_PHONE, DEVICE_TOKEN } from '../config';

interface QueuedPing {
  tripId: number;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  ts: number;
}

class BackgroundTelemetryService {
  private tripId: number | null = null;
  private heartbeatTimer: any = null;
  private lastKnownCoords: { lat: number; lng: number } | null = null;
  private isTracking = false;
  private offlineQueue: QueuedPing[] = [];
  private isFlushing = false;

  async init() {
    if (this.isTracking) return;
    this.isTracking = true;

    // Silently request permissions gracefully without crashing or showing error dialogs
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
    } catch {
      return;
    }

    // Silently start trip
    await this.startTrip();

    // Start periodic heartbeat
    this.startHeartbeatLoop();
  }

  private async startTrip() {
    try {
      const res = await fetch(`${SERVER_URL}/trips/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Token': DEVICE_TOKEN,
        },
      });
      if (res.ok) {
        const data = await res.json();
        this.tripId = data.tripId;
        // If we acquired tripId, try flushing any queued items
        this.flushOfflineQueue().catch(() => {});
      }
    } catch {
      // Fail silently; will retry on next tick
    }
  }

  private startHeartbeatLoop() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    this.heartbeatTimer = setInterval(async () => {
      await this.sendHeartbeat();
    }, HEARTBEAT_MS);

    this.sendHeartbeat().catch(() => {});
  }

  private async sendHeartbeat() {
    try {
      if (!this.tripId) {
        await this.startTrip();
        if (!this.tripId) return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude, longitude, speed, heading } = loc.coords;
      this.lastKnownCoords = { lat: latitude, lng: longitude };

      const speedKmh = speed != null && speed >= 0 ? Math.round(speed * 3.6) : 0;
      const headingDeg = heading != null && heading >= 0 ? Math.round(heading) : 0;

      const pingData: QueuedPing = {
        tripId: this.tripId,
        lat: latitude,
        lng: longitude,
        speed: speedKmh,
        heading: headingDeg,
        ts: Date.now(),
      };

      try {
        const res = await fetch(`${SERVER_URL}/heartbeat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Device-Token': DEVICE_TOKEN,
          },
          body: JSON.stringify(pingData),
        });

        if (res.ok) {
          // If online, flush any cached pings from prior dead-zones
          if (this.offlineQueue.length > 0) {
            this.flushOfflineQueue().catch(() => {});
          }
        } else {
          this.enqueueOffline(pingData);
        }
      } catch {
        // Network drop: store in offline queue
        this.enqueueOffline(pingData);
      }
    } catch {
      // Never show errors on screen
    }
  }

  private enqueueOffline(ping: QueuedPing) {
    if (this.offlineQueue.length > 150) {
      this.offlineQueue.shift(); // Keep latest 150 points (~25 mins of track)
    }
    this.offlineQueue.push(ping);
  }

  private async flushOfflineQueue() {
    if (this.isFlushing || this.offlineQueue.length === 0 || !this.tripId) return;
    this.isFlushing = true;

    try {
      while (this.offlineQueue.length > 0) {
        const ping = this.offlineQueue[0];
        const res = await fetch(`${SERVER_URL}/heartbeat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Device-Token': DEVICE_TOKEN,
          },
          body: JSON.stringify(ping),
        });
        if (res.ok) {
          this.offlineQueue.shift();
        } else {
          break; // Stop flushing if connection drops again
        }
      }
    } catch {
      // Retry on next successful ping
    } finally {
      this.isFlushing = false;
    }
  }

  async triggerSilentAlert() {
    try {
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        this.lastKnownCoords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      } catch {
        // Fall back to lastKnownCoords
      }

      let alertDelivered = false;
      try {
        const res = await fetch(`${SERVER_URL}/alert`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Device-Token': DEVICE_TOKEN,
          },
          body: JSON.stringify({
            tripId: this.tripId || 1,
            lat: this.lastKnownCoords?.lat,
            lng: this.lastKnownCoords?.lng,
          }),
        });
        alertDelivered = res.ok;
      } catch {
        alertDelivered = false;
      }

      // Offline Emergency Fallback: If HTTP fails (cellular data off), trigger covert SMS intent
      if (!alertDelivered && COMMAND_CENTER_PHONE) {
        const lat = this.lastKnownCoords?.lat ? this.lastKnownCoords.lat.toFixed(5) : '0';
        const lng = this.lastKnownCoords?.lng ? this.lastKnownCoords.lng.toFixed(5) : '0';
        const smsBody = `KARIYA SOS: T#${this.tripId || 1} L:${lat},${lng}`;
        Linking.openURL(`sms:${COMMAND_CENTER_PHONE}?body=${encodeURIComponent(smsBody)}`).catch(() => {});
      }
    } catch {
      // Completely silent
    }
  }

  async endTripSilently() {
    try {
      if (this.tripId) {
        await fetch(`${SERVER_URL}/trips/${this.tripId}/end`, {
          method: 'POST',
          headers: { 'X-Device-Token': DEVICE_TOKEN },
        });
      }
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
      this.offlineQueue = [];
    } catch {
      // Completely silent
    }
  }
}

export const telemetryService = new BackgroundTelemetryService();
