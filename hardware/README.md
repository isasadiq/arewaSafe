# ArewaSafe Hardware Blackbox 📟🇳🇬

An autonomous, covert, under-seat vehicle telematics unit engineered for interstate passenger buses (e.g., Toyota HiAce, luxury commuter coaches, and Sharon transport fleets) traversing high-risk highway corridors in Northern Nigeria.

---

## 🎯 Purpose & Threat Model

During armed highway ambushes:
1. **Aggressors confiscate all mobile phones immediately.**
2. **Passengers and drivers are ordered out of the vehicle.**
3. **The vehicle is driven into unpaved bush paths to evade military patrol checkpoints.**

The **ArewaSafe Blackbox** is permanently concealed beneath passenger seating or within the dashboard chassis. Hardwired to the vehicle battery with an internal 18650 Li-ion backup, it operates completely autonomously without relying on passenger phones.

---

## ⚙️ Hardware Bill of Materials (BOM)

| Component | Specification | Purpose | Approx Cost (NGN) |
| :--- | :--- | :--- | :--- |
| **Microcontroller** | ESP32-WROOM-32 (NodeMCU-32S) | Main logic, dual UART hardware serial | ₦4,500 |
| **GPS Receiver** | u-blox NEO-6M / NEO-8M + Active Ceramic Patch Antenna | 10Hz position fix, speed (km/h), bearing | ₦3,800 |
| **Cellular Modem** | SIM800L GPRS / GSM Quad-Band Module | HTTP POST telemetry via 2G/GPRS | ₦3,200 |
| **SIM Card** | MTN Nigeria or Airtel Nigeria IoT Data SIM | GPRS connectivity (`web.gprs.mtnnigeria.net`) | ₦500 |
| **Power Buck Converter** | LM2596 DC-DC Step-Down (12V/24V to 4.2V/5V) | Vehicle alternator power conditioning | ₦1,200 |
| **Battery Backup** | 3.7V 2600mAh 18650 Li-ion + TP4056 with protection | Keeps device transmitting if vehicle battery is disconnected | ₦2,200 |
| **Driver Panic Switch** | Waterproof Foot Microswitch (Normally Open) | Silent driver distress trigger | ₦800 |
| **Enclosure** | IP65 ABS Weatherproof Box | Covert mounting beneath vehicle chassis | ₦1,500 |

---

## 🔌 Circuit Pinout Diagram

```
                 +-------------------+
                 |    ESP32 Board    |
                 +-------------------+
                         |
      +------------------+------------------+
      |                                     |
  UART 2 (GPS)                          UART 1 (GSM)
  GPIO 16 (RX2) <--- NEO-6M (TX)        GPIO 18 (RX1) <--- SIM800L (TXD)
  GPIO 17 (TX2) ---> NEO-6M (RX)        GPIO 19 (TX1) ---> SIM800L (RXD)
      |                                     |
      +------------------+------------------+
                         |
                  GPIO 4 (INPUT_PULLUP)
                         |
              [Foot Microswitch] ---> GND
```

---

## 🚀 How to Flash & Deploy

1. Open Arduino IDE or PlatformIO.
2. Install **ESP32 Board Support** (`https://dl.espressif.com/dl/package_esp32_index.json`).
3. Set your server IP address in `blackbox.ino`:
   ```cpp
   const char* SERVER_HOST = "YOUR_SERVER_IP"; // e.g. "192.168.1.150"
   const int   SERVER_PORT = 3000;
   ```
4. Insert an active SIM card with mobile data enabled into the SIM800L slot.
5. Select **ESP32 Dev Module** and click **Upload**.
6. Open Serial Monitor at **115200 baud** to verify GPS lock and GPRS network registration.
