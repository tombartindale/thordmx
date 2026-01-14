# sACN to DMX Bridge

A wireless sACN (E1.31) to DMX512 bridge built on the ESP32-C6 microcontroller. The device receives sACN packets over WiFi and outputs a standard DMX512 signal for controlling lighting fixtures.

## Features

- **WiFi Connectivity**: Automatic AP mode fallback with captive portal for easy setup
- **SmartConfig Support**: Bulk provisioning using ESP-Touch protocol
- **Serial Configuration**: Command-line interface for manufacturing and bulk deployment
- **sACN/E1.31 Reception**: Standard multicast sACN with priority handling
- **DMX512 Output**: Full 512-channel DMX at 40Hz refresh rate
- **JSON REST API**: Complete control and monitoring via HTTP
- **OTA Updates**: Over-the-air firmware updates with automatic rollback
- **mDNS Discovery**: Easy network discovery via Bonjour/Avahi
- **Status LED**: WS2812 RGB LED for visual status indication

## Hardware Requirements

- **Microcontroller**: ESP32-C6
- **DMX Output**: GPIO 0 connected to MAX485 transceiver (DI pin)
- **Status LED**: WS2812 RGB LED on GPIO 8
- **Power**: 5V USB or external power supply

## Arduino IDE Setup

### 1. Install ESP32 Board Support

1. Open Arduino IDE
2. Go to **File → Preferences**
3. Add this URL to "Additional Board Manager URLs":
   ```
   https://espressif.github.io/arduino-esp32/package_esp32_index.json
   ```
4. Go to **Tools → Board → Boards Manager**
5. Search for "esp32" and install **esp32 by Espressif Systems**
6. Select **Tools → Board → ESP32 Arduino → ESP32C6 Dev Module**

### 2. Install Required Libraries

Open **Tools → Manage Libraries** and install:

- **ArduinoJson** by Benoit Blanchon (v6.x or later)
- **FastLED** by Daniel Garcia
- **sACN** by sstaub (https://github.com/sstaub/sACN) - Install from ZIP or Git URL

**Note**: The following libraries are built-in with ESP32 Arduino core:
- WiFi
- WebServer
- ESPmDNS
- Preferences
- Update
- esp_dmx

### 3. Board Configuration

Set the following in Arduino IDE under **Tools**:

- **Board**: ESP32C6 Dev Module
- **Upload Speed**: 921600
- **USB CDC On Boot**: Enabled
- **Flash Size**: 4MB (or your board's flash size)
- **Partition Scheme**: Minimal SPIFFS (1.9MB APP with OTA/190KB SPIFFS)

## Building and Uploading

1. Open `DMX_Receiver.ino` in Arduino IDE
2. Connect your ESP32-C6 via USB
3. Select the correct COM port under **Tools → Port**
4. Click **Upload** button or press `Ctrl+U`

## First-Time Setup

### Method 1: Captive Portal (Recommended for Single Device)

1. Power on the device
2. The device will create a WiFi network named `DMX-Bridge-XXXX` (where XXXX is the last 4 digits of MAC address)
3. Connect to this network from your phone or computer
4. A configuration page should open automatically (or navigate to `192.168.4.1`)
5. Enter your WiFi credentials and desired sACN universe
6. Click "Save & Connect"
7. The device will reboot and connect to your network

### Method 2: SmartConfig (For Multiple Devices)

1. Power on all unconfigured devices
2. Download ESP-Touch app:
   - **iOS**: [EspressifTouchV2](https://apps.apple.com/app/espressif-esptouch/id1071176700)
   - **Android**: [EspTouch](https://github.com/EspressifApp/EsptouchForAndroid/releases)
3. Connect your phone to the target WiFi network
4. Open the app and enter WiFi credentials
5. Press "Confirm" to broadcast credentials
6. All devices will receive credentials and connect
7. Configure individual universe numbers via API or serial

### Method 3: Serial Configuration (For Manufacturing)

1. Connect device via USB
2. Open Serial Monitor at 115200 baud
3. Send configuration command:
   ```
   CONFIG:{"wifi_ssid":"YourNetwork","wifi_password":"password123","sacn_universe":1,"device_name":"Stage-Left"}
   ```
4. Device will save settings and reboot

#### Serial Commands

- `STATUS` - Get current device status
- `CONFIG:{json}` - Update configuration
- `REBOOT` - Restart device
- `FACTORY_RESET` - Clear all settings and reboot

## Usage

### Finding Your Device

After connecting to WiFi, find your device using:

**macOS/Linux:**
```bash
dns-sd -B _sacn-dmx._tcp local
```

**Or access directly:**
```
http://dmx-bridge-xxxx.local/api/status
```

### API Endpoints

#### GET /api/status
Returns comprehensive device status including WiFi, sACN stats, and system info.

```bash
curl http://dmx-bridge-xxxx.local/api/status
```

#### GET /api/config
Returns current configuration (WiFi SSID, universe, device name).

```bash
curl http://dmx-bridge-xxxx.local/api/config
```

#### POST /api/config
Update device configuration.

```bash
curl -X POST http://dmx-bridge-xxxx.local/api/config \
  -H "Content-Type: application/json" \
  -d '{"sacn_universe":2,"device_name":"Stage-Right"}'
```

#### POST /api/reboot
Reboot the device.

```bash
curl -X POST http://dmx-bridge-xxxx.local/api/reboot
```

#### POST /api/firmware
Upload new firmware for OTA update.

```bash
curl -X POST -F "firmware=@firmware.bin" http://dmx-bridge-xxxx.local/api/firmware
```

#### POST /api/firmware/rollback
Rollback to previous firmware version.

```bash
curl -X POST http://dmx-bridge-xxxx.local/api/firmware/rollback
```

## LED Status Indicators

| State | LED Behavior |
|-------|-------------|
| AP mode active | Pulsing blue (1 second cycle) |
| Connecting to WiFi | Pulsing yellow (0.5 second cycle) |
| Connected successfully | Solid green for 2 seconds, then off |
| Receiving sACN | Off (normal operation) |
| WiFi connection lost | Solid red |
| SmartConfig listening | Pulsing blue |
| SmartConfig received | Two rapid green flashes |

## Troubleshooting

### Device Won't Connect to WiFi

1. Try factory reset: Send `FACTORY_RESET` via serial
2. Check WiFi credentials are correct
3. Ensure 2.4GHz network (ESP32 doesn't support 5GHz)
4. Check signal strength (should be >-70 dBm)

### No DMX Output

1. Verify MAX485 transceiver connections:
   - ESP32 GPIO 0 → MAX485 DI
   - MAX485 DE and RE tied together (to GPIO or high)
   - MAX485 A and B to DMX connector
2. Check DMX cable polarity
3. Verify sACN packets are being sent to correct universe
4. Check `/api/status` for `sacn_packets_received` counter

### Can't Access Web Interface

1. Ensure device is connected to network (LED should be off, not pulsing)
2. Try accessing by IP instead of hostname
3. Check mDNS is working: `ping dmx-bridge-xxxx.local`
4. Firewall may be blocking port 80

### OTA Update Fails

1. Ensure firmware binary is valid (.bin file from Arduino IDE)
2. Check available heap: should be >100KB free
3. Try smaller firmware or different partition scheme
4. Power cycle and try again

## Development

### Project Structure

```
DMX_Receiver/
├── DMX_Receiver.ino         # Main sketch with setup() and loop()
├── wifi_manager.ino         # WiFi and SmartConfig handling
├── serial_config.ino        # Serial command interface
├── sacn_receiver.ino        # sACN/E1.31 packet processing
├── dmx_output.ino           # DMX512 transmission
├── api_server.ino           # JSON REST API endpoints
├── captive_portal.ino       # HTML captive portal
├── led_controller.ino       # WS2812 status LED
└── README.md                # This file
```

### Task Architecture

The application uses FreeRTOS tasks for concurrent operation:

1. **WiFi Task** (Core 0) - Connection management, AP mode, SmartConfig
2. **sACN Task** (Core 1) - UDP multicast reception and parsing
3. **DMX Task** (Core 1) - DMX512 frame transmission at 40Hz
4. **LED Task** (Core 0) - Status LED animation
5. **Serial Task** (Core 0) - Serial command processing

### Memory Considerations

- DMX buffer: 512 bytes (shared between sACN and DMX tasks)
- Task stacks: ~24KB total
- HTTP server buffer: ~4KB
- sACN library: ~8KB
- Minimum free heap during operation: ~100KB

## License

This project is provided as-is for educational and commercial use.

## Credits

- **ESPAsyncE131** library by forkineye
- **FastLED** library by Daniel Garcia
- **ArduinoJson** library by Benoit Blanchon
- **esp_dmx** library (ESP32 Arduino Core)

## Support

For issues, questions, or contributions, please refer to the specification document: `sacn-dmx-spec.md`

## Version History

- **1.0.0** - Initial release
  - WiFi connectivity with AP fallback
  - SmartConfig provisioning
  - Serial configuration interface
  - sACN/E1.31 reception
  - DMX512 output
  - JSON REST API
  - OTA firmware updates
  - mDNS discovery
  - WS2812 status LED
