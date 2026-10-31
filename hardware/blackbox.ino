/**
 * ArewaSafe Blackbox Firmware (ESP32 / Arduino + SIM800L + NEO-6M GPS)
 * ------------------------------------------------------------------
 * Under-seat covert vehicle telematics unit for commercial interstate transit
 * across Northern Nigerian highways.
 *
 * Hardware Stack:
 * - ESP32 NodeMCU (or Arduino Mega / Pro Mini)
 * - u-blox NEO-6M / NEO-8M GPS Module (UART Serial2)
 * - SIM800L GPRS/GSM Quad-band Cellular Module (UART Serial1)
 * - Onboard 3.7V 18650 Li-ion battery backup with TP4056 charger
 * - Covert driver foot microswitch (Panic Alert trigger)
 * - Hardware Watchdog Timer (WDT) to prevent GSM lockup
 */

#include <Arduino.h>
#include <HardwareSerial.h>
#include <esp_task_wdt.h>

// Configuration & Server Endpoint
const char* APN = "web.gprs.mtnnigeria.net"; // MTN Nigeria APN (or "internet.ng.airtel.com")
const char* APN_USER = "";
const char* APN_PASS = "";
const char* SERVER_HOST = "api.arewasafe.ng"; // Or laptop IP, e.g. "192.168.1.150"
const int   SERVER_PORT = 3000;
const char* DEVICE_TOKEN = "AREWASAFE-HW-BUS-01";

const unsigned long HEARTBEAT_INTERVAL_MS = 10000; // 10s ping interval
const int FOOT_SWITCH_PIN = 4; // Pull-up microswitch wired under driver footwell
const int IGNITION_ACC_PIN = 34; // 12V ACC sensed through optocoupler (HIGH = engine running)
const int WDT_TIMEOUT_SECONDS = 30; // Auto-reboot ESP32 if stuck for 30s

// Serial Interfaces on ESP32
HardwareSerial SerialGPS(2);  // RX2: GPIO 16, TX2: GPIO 17
HardwareSerial SerialGSM(1);  // RX1: GPIO 18, TX1: GPIO 19

// Telemetry State
int tripId = 0;
unsigned long lastPingTime = 0;
float currentLat = 0.0;
float currentLng = 0.0;
float currentSpeedKmh = 0.0;
float currentHeading = 0.0;
bool gpsFixAcquired = false;

// Forward Declarations
void initModem();
bool sendGsmCommand(const String& cmd, const String& expected, unsigned long timeoutMs = 2000);
void parseNmeaSentence(const String& sentence);
void sendHeartbeat();
void sendEmergencyAlert();
void startTripSession();

void setup() {
  Serial.begin(115200);
  pinMode(FOOT_SWITCH_PIN, INPUT_PULLUP);
  pinMode(IGNITION_ACC_PIN, INPUT);

  Serial.println(F("[ArewaSafe Blackbox] Booting Covert Vehicle Telematics..."));

  // 1. Initialize Hardware Watchdog (30s)
  esp_task_wdt_init(WDT_TIMEOUT_SECONDS, true);
  esp_task_wdt_add(NULL);

  // 2. Initialize GPS Serial (9600 baud standard for NEO-6M)
  SerialGPS.begin(9600, SERIAL_8N1, 16, 17);

  // 3. Initialize GSM Modem Serial (9600 baud for SIM800L)
  SerialGSM.begin(9600, SERIAL_8N1, 18, 19);
  delay(3000);

  initModem();
  startTripSession();
  esp_task_wdt_reset();
}

void loop() {
  // Reset watchdog timer on every main loop iteration
  esp_task_wdt_reset();

  // 1. Ingest NMEA GPS Stream
  while (SerialGPS.available()) {
    String nmea = SerialGPS.readStringUntil('\n');
    parseNmeaSentence(nmea);
  }

  // 2. Check Covert Driver Foot Switch (Active LOW)
  if (digitalRead(FOOT_SWITCH_PIN) == LOW) {
    Serial.println(F("⚠️ [ALARM] Covert foot-switch triggered by driver!"));
    sendEmergencyAlert();
    delay(2000); // Debounce
  }

  // 3. Periodic Telemetry Heartbeat
  if (millis() - lastPingTime >= HEARTBEAT_INTERVAL_MS) {
    lastPingTime = millis();
    if (gpsFixAcquired && tripId > 0) {
      sendHeartbeat();
    }
  }
}

/**
 * Configure SIM800L GPRS Connection
 */
void initModem() {
  Serial.println(F("[GSM] Initializing SIM800L GPRS..."));
  sendGsmCommand("AT", "OK");
  sendGsmCommand("ATE0", "OK"); // Echo off
  sendGsmCommand("AT+CPIN?", "READY"); // Verify SIM
  sendGsmCommand("AT+SAPBR=3,1,\"Contype\",\"GPRS\"", "OK");
  sendGsmCommand("AT+SAPBR=3,1,\"APN\",\"" + String(APN) + "\"", "OK");
  sendGsmCommand("AT+SAPBR=1,1", "OK", 6000); // Open bearer
  sendGsmCommand("AT+SAPBR=2,1", "OK"); // Query IP
  sendGsmCommand("AT+HTTPINIT", "OK");
  Serial.println(F("[GSM] Modem ready and online."));
}

bool sendGsmCommand(const String& cmd, const String& expected, unsigned long timeoutMs) {
  SerialGSM.println(cmd);
  unsigned long start = millis();
  String resp = "";
  while (millis() - start < timeoutMs) {
    esp_task_wdt_reset();
    while (SerialGSM.available()) {
      char c = SerialGSM.read();
      resp += c;
    }
    if (resp.indexOf(expected) != -1) return true;
  }
  return false;
}

/**
 * Register vehicle trip on server boot
 */
void startTripSession() {
  Serial.println(F("[API] Initiating trip session via POST /trips/start..."));
  String url = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) + "/trips/start";
  sendGsmCommand("AT+HTTPPARA=\"CID\",1", "OK");
  sendGsmCommand("AT+HTTPPARA=\"URL\",\"" + url + "\"", "OK");
  sendGsmCommand("AT+HTTPPARA=\"CONTENT\",\"application/json\"", "OK");
  sendGsmCommand("AT+HTTPPARA=\"USERDATA\",\"X-Device-Token: " + String(DEVICE_TOKEN) + "\"", "OK");
  sendGsmCommand("AT+HTTPDATA=2,2000", "DOWNLOAD");
  SerialGSM.print("{}");
  delay(500);
  sendGsmCommand("AT+HTTPACTION=1", "+HTTPACTION: 1,200", 6000);

  if (tripId <= 0) tripId = 1;
  Serial.println(F("[API] Trip session active."));
}

/**
 * Transmit vehicle GPS coordinates, speed (km/h), and heading
 */
void sendHeartbeat() {
  String url = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) + "/heartbeat";
  String payload = "{\"tripId\":" + String(tripId) +
                   ",\"lat\":" + String(currentLat, 6) +
                   ",\"lng\":" + String(currentLng, 6) +
                   ",\"speed\":" + String((int)currentSpeedKmh) +
                   ",\"heading\":" + String((int)currentHeading) + "}";

  sendGsmCommand("AT+HTTPPARA=\"URL\",\"" + url + "\"", "OK");
  sendGsmCommand("AT+HTTPPARA=\"CONTENT\",\"application/json\"", "OK");
  sendGsmCommand("AT+HTTPDATA=" + String(payload.length()) + ",2000", "DOWNLOAD");
  SerialGSM.print(payload);
  delay(300);
  sendGsmCommand("AT+HTTPACTION=1", "OK", 3000);
  Serial.println("[Telemetry] Ping sent: " + payload);
}

/**
 * Trigger silent emergency alarm
 */
void sendEmergencyAlert() {
  String url = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) + "/alert";
  String payload = "{\"tripId\":" + String(tripId) +
                   ",\"lat\":" + String(currentLat, 6) +
                   ",\"lng\":" + String(currentLng, 6) + "}";

  sendGsmCommand("AT+HTTPPARA=\"URL\",\"" + url + "\"", "OK");
  sendGsmCommand("AT+HTTPPARA=\"CONTENT\",\"application/json\"", "OK");
  sendGsmCommand("AT+HTTPDATA=" + String(payload.length()) + ",2000", "DOWNLOAD");
  SerialGSM.print(payload);
  delay(300);
  sendGsmCommand("AT+HTTPACTION=1", "OK", 3000);
  Serial.println("[Alarm] Silent distress dispatched to tactical dashboard!");
}

/**
 * Lightweight NMEA $GPRMC Parser (Position, Speed in knots->km/h, Heading)
 */
void parseNmeaSentence(const String& sentence) {
  if (!sentence.startsWith("$GPRMC") && !sentence.startsWith("$GNRMC")) return;

  int idx = 0;
  String tokens[12];
  int tIdx = 0;
  for (int i = 0; i < sentence.length() && tIdx < 12; i++) {
    if (sentence[i] == ',' || sentence[i] == '*') {
      tokens[tIdx++] = sentence.substring(idx, i);
      idx = i + 1;
    }
  }

  if (tIdx > 7 && tokens[2] == "A") { // Status 'A' = Valid Fix
    gpsFixAcquired = true;

    // Latitude (DDMM.MMMM -> Decimal Degrees)
    float rawLat = tokens[3].toFloat();
    int degLat = (int)(rawLat / 100);
    float minLat = rawLat - (degLat * 100);
    currentLat = degLat + (minLat / 60.0);
    if (tokens[4] == "S") currentLat = -currentLat;

    // Longitude (DDDMM.MMMM -> Decimal Degrees)
    float rawLng = tokens[5].toFloat();
    int degLng = (int)(rawLng / 100);
    float minLng = rawLng - (degLng * 100);
    currentLng = degLng + (minLng / 60.0);
    if (tokens[6] == "W") currentLng = -currentLng;

    // Speed (Knots -> km/h: multiply by 1.852)
    currentSpeedKmh = tokens[7].toFloat() * 1.852;

    // Track angle (Course in degrees)
    currentHeading = tokens[8].toFloat();
  }
}
