# Calculator (ArewaSafe Mobile Client)

An ordinary-looking Casio fx-82 style scientific calculator application built with React Native and Expo. Beneath the calculator lies a silent travel-safety telemetry engine and emergency panic trigger.

---

## Features

- **Disguised UI**: Realistic Casio-style scientific calculator (arithmetic, parentheses, trigonometric functions `sin`/`cos`/`tan`, powers, square roots, percentages, and dual-line LCD display).
- **Silent Emergency Trigger**: Entering `911=` triggers an instant emergency alert (`POST /alert`) with GPS coordinates, leaving the calculator display completely unaffected.
- **Silent Safe Arrival**: Entering `000=` silently ends the active trip (`POST /trips/:id/end`).
- **Passive Background Telemetry**: Silently registers trips and sends periodic GPS telemetry (`POST /heartbeat`) including speed and heading. Fails silently if offline or without GPS fix, without alerting an aggressor.

---

## How to Run on a Phone with Expo Go

### 1. Prerequisites
- Install **Expo Go** on your physical Android device (via Google Play Store) or iPhone (via Apple App Store).
- Make sure your phone and development computer are connected to the **same local Wi-Fi network**.

### 2. Configure Local Server IP
1. Find your computer's local Wi-Fi IP address:
   - On Windows, run in terminal: `ipconfig` (look for *IPv4 Address* under Wi-Fi, e.g. `192.168.1.150`).
2. Open `mobile/src/config.ts` and set `SERVER_URL`:
   ```typescript
   export const SERVER_URL = 'http://192.168.1.150:3000'; // Replace with your LAN IP
   export const HEARTBEAT_MS = 10000; // 10 seconds
   ```

### 3. Install Dependencies
```bash
cd mobile
npm install
```

### 4. Start Expo Development Server
```bash
npx expo start
```

### 5. Open on Your Phone
- **Android**: Open the **Expo Go** app and tap **Scan QR code**, then point the camera at the QR code displayed in your terminal.
- **iOS**: Open the native **Camera** app, point at the terminal QR code, and tap the prompt to open in Expo Go.

---

## Testing Triggers

| Action | Key Sequence | Effect |
| :--- | :--- | :--- |
| **Panic Alert** | `9` `1` `1` `=` | Sends silent `POST /alert` with live GPS fix. Display shows `911`. |
| **Safe Arrival** | `0` `0` `0` `=` | Sends silent `POST /trips/:id/end`. Display shows `0`. |
| **All Clear** | `AC` | Clears display and formula. |
