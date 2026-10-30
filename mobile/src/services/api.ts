import * as Location from 'expo-location';
import { SERVER_URL, HEARTBEAT_MS } from '../config';

class BackgroundTelemetryService {
  private tripId: number | null = null;
  private heartbeatTimer: any = null;
  private lastKnownCoords: { lat: number; lng: number } | null = null;
  private isTracking = false;

  async init() {
    if (this.isTracking) return;
    this.isTracking = true;

    // Silently request permissions gracefully without crashing or showing error dialogs
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        // Permissions not granted yet; keep running calculator normally
        return;
      }
    } catch {
      // Ignore error silently
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
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        this.tripId = data.tripId;
      }
    } catch {
      // Fail silently; will retry on next tick or alert
    }
  }

  private startHeartbeatLoop() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    this.heartbeatTimer = setInterval(async () => {
      await this.sendHeartbeat();
    }, HEARTBEAT_MS);

    // Immediate first ping
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

      // expo-location gives speed in m/s; convert to km/h (speed * 3.6)
      const speedKmh = speed != null && speed >= 0 ? Math.round(speed * 3.6) : 0;
      const headingDeg = heading != null && heading >= 0 ? Math.round(heading) : 0;

      await fetch(`${SERVER_URL}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tripId: this.tripId,
          lat: latitude,
          lng: longitude,
          speed: speedKmh,
          heading: headingDeg,
        }),
      });
    } catch {
      // Never show errors on screen; silently retry on next tick
    }
  }

  async triggerSilentAlert() {
    try {
      // Refresh current position if available
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        this.lastKnownCoords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      } catch {
        // Fall back to lastKnownCoords
      }

      await fetch(`${SERVER_URL}/alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tripId: this.tripId || 1,
          lat: this.lastKnownCoords?.lat,
          lng: this.lastKnownCoords?.lng,
        }),
      });
    } catch {
      // Completely silent
    }
  }

  async endTripSilently() {
    try {
      if (this.tripId) {
        await fetch(`${SERVER_URL}/trips/${this.tripId}/end`, {
          method: 'POST',
        });
      }
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
    } catch {
      // Completely silent
    }
  }
}

export const telemetryService = new BackgroundTelemetryService();
