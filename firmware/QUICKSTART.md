# Quick Start Guide

Get your sACN to DMX Bridge up and running in 5 minutes!

## 1. Hardware Setup

Connect your ESP32-C6:

```
ESP32-C6          MAX485
GPIO 0    ───────> DI (Data In)
GND       ───────> GND

MAX485            DMX Connector
A         ───────> Pin 3 (Data+)
B         ───────> Pin 2 (Data-)
GND       ───────> Pin 1 (Ground)

Optional:
GPIO 8    ───────> WS2812 LED Data In
```

## 2. Software Setup

### Option A: Arduino IDE (Easiest)

1. **Install Arduino IDE 2.x** from https://www.arduino.cc/en/software

2. **Add ESP32 Boards**:
   - Open Preferences (Ctrl+Comma)
   - Add to "Additional Board Manager URLs":
     ```
     https://espressif.github.io/arduino-esp32/package_esp32_index.json
     ```
   - Open Board Manager (left sidebar)
   - Search "esp32" and install

3. **Install Libraries**:
   - Open Library Manager (left sidebar)
   - Install these libraries:
     - `ArduinoJson` by Benoit Blanchon
     - `FastLED` by Daniel Garcia
   - **Install sACN library** (not in library manager):
     - Download ZIP from https://github.com/sstaub/sACN
     - Go to **Sketch → Include Library → Add .ZIP Library**
     - Select the downloaded ZIP file

4. **Configure Board**:
   - Select **Tools → Board → ESP32 Arduino → ESP32C6 Dev Module**
   - Select **Tools → Partition Scheme → Minimal SPIFFS**
   - Select **Tools → USB CDC On Boot → Enabled**

5. **Upload**:
   - Open `DMX_Receiver.ino`
   - Connect ESP32-C6 via USB
   - Select correct port under **Tools → Port**
   - Click Upload (→) button

### Option B: PlatformIO (For Advanced Users)

1. Install VSCode + PlatformIO extension
2. Open this folder in VSCode
3. PlatformIO will auto-install dependencies
4. Click "Upload" in PlatformIO toolbar

## 3. First Configuration

### Via Captive Portal (Recommended)

1. **Power on device** (LED will pulse blue)

2. **Connect to WiFi network**:
   - Network name: `DMX-Bridge-XXXX`
   - No password

3. **Configure** (should auto-open, or go to `192.168.4.1`):
   - Enter your WiFi network name
   - Enter WiFi password
   - Set sACN universe (usually 1)
   - Click "Save & Connect"

4. **Done!** Device reboots and connects to your network

### Via Serial (For Testing)

1. Open Serial Monitor (115200 baud)
2. Send:
   ```
   CONFIG:{"wifi_ssid":"MyNetwork","wifi_password":"mypass123","sacn_universe":1}
   ```
3. Device saves and reboots

## 4. Test It

### Check Connection

Open Serial Monitor (115200 baud), you should see:
```
=================================
sACN to DMX Bridge
Firmware: v1.0.0
=================================

[WiFi] Connected!
  IP: 192.168.1.123
  RSSI: -45 dBm
[sACN] Listening on universe 1
[HTTP] Server started on port 80
```

### Check Status via API

```bash
# Replace with your device's IP or hostname
curl http://192.168.1.123/api/status

# Or use mDNS:
curl http://dmx-bridge-xxxx.local/api/status
```

### Send sACN Data

Use any sACN lighting software:

- **QLC+** (Free, Open Source)
  - Download from https://www.qlcplus.org/
  - Configure output: E1.31 (sACN) on universe 1
  - Create a simple scene and watch DMX output!

- **ETC Eos** (Professional)
- **GrandMA** (Professional)
- **Chamsys MagicQ** (Free version available)

## 5. Verify DMX Output

1. **With DMX Tester**: Connect to output, should see data

2. **With Fixture**: Connect a DMX light
   - Most fixtures default to DMX address 1
   - In your software, set channel 1-3 (typically RGB)
   - Light should respond!

3. **With Multimeter**:
   - Measure voltage between A and B
   - Should see ~2-5V differential when data is transmitting

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Can't see WiFi network | Wait 30 seconds after power-on for AP mode |
| Won't connect to WiFi | Check password, ensure 2.4GHz network |
| No DMX output | Check MAX485 wiring, verify connections |
| Can't access web interface | Try IP address instead of hostname |
| LED solid red | WiFi connection lost, device will retry |

## What's Next?

- **Configure Multiple Devices**: Use SmartConfig for bulk setup
- **Monitor Performance**: Check `/api/status` for packet counts
- **Update Firmware**: Use `/api/firmware` endpoint for OTA updates
- **Set Device Names**: Use `/api/config` to name each device

## Need Help?

1. Check full documentation in `README.md`
2. Review detailed spec in `sacn-dmx-spec.md`
3. Open Serial Monitor for debug messages
4. Check `/api/status` for system diagnostics

## Common sACN Software Setup

### QLC+ Configuration

1. **Inputs/Outputs** tab
2. Add output: **E1.31 (sACN)**
3. Set Universe: **1** (or your configured universe)
4. Set Multicast: **Enabled**
5. IP: Leave as multicast (239.255.0.1 for universe 1)
6. Click **OK**

### Lighting Console Setup

Most consoles:
1. Network settings → Add E1.31 output
2. Set universe number (must match device)
3. Use multicast mode (not unicast)
4. Start sending data!

---

**Congratulations! Your sACN to DMX Bridge is ready!** 🎭✨
