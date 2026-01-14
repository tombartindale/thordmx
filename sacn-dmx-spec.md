# sACN to DMX Bridge — Technical Specification

## Overview

A wireless sACN (E1.31) to DMX512 bridge built on the ESP32-C6 microcontroller. The device receives sACN packets over WiFi and outputs a standard DMX512 signal for controlling lighting fixtures.

## Hardware Platform

- **Microcontroller:** ESP32-C6
- **Development framework:** Arduino (ESP32 Arduino Core)
- **DMX output pin:** GPIO 0 (directly feeds a MAX485 differential transceiver)
- **Status LED:** WS2812 RGB LED on GPIO 8

## Functional Requirements

### F1: WiFi Connectivity

- **F1.1:** On first boot or when no known network is available, the device shall enter Access Point (AP) mode.
- **F1.2:** AP mode SSID shall be `DMX-Bridge-XXXX` where `XXXX` is the last four hexadecimal digits of the device MAC address.
- **F1.3:** The AP shall be open (no password) for ease of initial configuration.
- **F1.4:** In AP mode, the device shall serve a captive portal on `192.168.4.1` presenting a web form to configure WiFi credentials and sACN universe.
- **F1.5:** Upon successful configuration, credentials shall be saved and the device shall reboot into station mode.
- **F1.6:** The device shall automatically reconnect to the configured network on subsequent power cycles.
- **F1.7:** If the configured network becomes unavailable, the device shall retry connection for 30 seconds, then fall back to AP mode.

### F1A: Serial Configuration Interface

A serial interface for bulk provisioning during manufacturing or deployment.

- **F1A.1:** The device shall listen on the USB serial port at 115200 baud for configuration commands.
- **F1A.2:** Serial configuration shall be available in all device states (AP mode, connecting, connected).
- **F1A.3:** The device shall accept a JSON configuration object as a single line of text.

**Serial command format:**
```
CONFIG:{"wifi_ssid":"NetworkName","wifi_password":"password123","sacn_universe":1,"device_name":"Stage-Left"}
```

- **F1A.4:** All fields in the JSON object are optional. Only provided fields shall be updated.
- **F1A.5:** The device shall respond with a JSON status line:

**Success response:**
```
OK:{"message":"Configuration saved","reboot_required":true}
```

**Error response:**
```
ERROR:{"message":"Invalid JSON format"}
```

- **F1A.6:** If WiFi credentials are changed, the device shall automatically reboot 2 seconds after sending the success response.
- **F1A.7:** The device shall also accept the following serial commands:
  - `STATUS` — returns current device status as JSON (same format as GET /api/status)
  - `REBOOT` — triggers immediate device restart
  - `FACTORY_RESET` — clears all saved configuration and reboots into AP mode

**Example provisioning session:**
```
> STATUS
< OK:{"device_name":"DMX-Bridge-A1B2","wifi_connected":false,"sacn_universe":1,...}
> CONFIG:{"wifi_ssid":"VenueWiFi","wifi_password":"secret","sacn_universe":5}
< OK:{"message":"Configuration saved","reboot_required":true}
< REBOOTING...
```

### F1B: SmartConfig Provisioning

Support for Espressif SmartConfig (ESP-Touch) protocol for bulk WiFi provisioning.

- **F1B.1:** When in AP mode, the device shall simultaneously listen for SmartConfig broadcasts.
- **F1B.2:** SmartConfig shall use the ESP-Touch V2 protocol (AES encrypted).
- **F1B.3:** Upon receiving valid SmartConfig credentials, the device shall:
  1. Save the WiFi credentials to NVS
  2. Flash the status LED green twice rapidly to confirm receipt
  3. Reboot and attempt connection to the provided network
- **F1B.4:** SmartConfig shall have a 2-minute timeout when in AP mode. After timeout, the device remains in AP mode and restarts SmartConfig listening.
- **F1B.5:** SmartConfig only provisions WiFi credentials. Other settings (universe, device name) must be configured via API or serial after network connection.

**LED behaviour during SmartConfig:**
| State | LED Behaviour |
|-------|---------------|
| Listening for SmartConfig | Pulsing blue (same as AP mode) |
| SmartConfig credentials received | Two rapid green flashes, then reboot |

**Provisioning workflow for multiple devices:**
1. Power on all unconfigured devices (all enter AP mode, listening for SmartConfig)
2. Use ESP-Touch app (iOS/Android) or esptool to broadcast credentials
3. All devices receive credentials simultaneously and reboot
4. Use JSON API discovery (mDNS) to find devices and configure universes/names

### F2: sACN Reception

The device shall use the ESPAsyncE131 library (https://github.com/forkineye/ESPAsyncE131) for sACN packet handling.

- **F2.1:** The device shall listen for E1.31 (sACN) multicast packets on the standard port (5568).
- **F2.2:** The device shall subscribe to the multicast group for the configured universe (default: universe 1).
- **F2.3:** Supported universe range: 1–63999.
- **F2.4:** The device shall extract all 512 DMX channel values from received sACN packets.
- **F2.5:** The device shall handle sACN priority correctly — if packets from multiple sources are received, the highest priority source shall take precedence.
- **F2.6:** If sACN packets stop arriving, the device shall hold the last received DMX values indefinitely (no timeout fade).

**ESPAsyncE131 usage notes:**
- Use multicast mode (`E131_MULTICAST`) for standard sACN reception.
- The library handles universe subscription and multicast group joining automatically.
- Access packet data via `e131.data` array after checking `e131.isEmpty()`.
- Source name available via `e131.packet->source_name` for status reporting.

### F3: DMX Output

- **F3.1:** The device shall output a DMX512 signal conforming to ANSI E1.11 (DMX512-A).
- **F3.2:** Output shall be on GPIO 0, driving a MAX485 transceiver.
- **F3.3:** All 512 channels shall be transmitted in each DMX packet.
- **F3.4:** DMX refresh rate shall be approximately 40Hz (~25ms per frame).
- **F3.5:** DMX output shall begin immediately on boot with all channels at zero until sACN data is received.

### F3A: mDNS Discovery

The device shall advertise itself via mDNS (Bonjour/Avahi) for easy discovery on the network.

- **F3A.1:** The device shall advertise an mDNS hostname of `{device_name}.local` (e.g., `dmx-bridge-a1b2.local`).
- **F3A.2:** The device shall advertise a service of type `_sacn-dmx._tcp` on port 80.
- **F3A.3:** The service TXT record shall include:
  - `universe={configured_universe}` — current sACN universe
  - `mac={mac_address}` — device MAC address
  - `version={firmware_version}` — firmware version string

**Example mDNS advertisement:**
```
Service: _sacn-dmx._tcp.local
Host: dmx-bridge-a1b2.local
Port: 80
TXT: universe=1, mac=AA:BB:CC:DD:A1:B2, version=1.0.0
```

- **F3A.4:** mDNS shall be active whenever the device is connected to WiFi in station mode.
- **F3A.5:** The hostname shall update if the device name is changed (requires reboot).

**Discovery commands:**

On macOS/Linux:
```bash
dns-sd -B _sacn-dmx._tcp local
# or
avahi-browse -rt _sacn-dmx._tcp
```

On Windows (with Bonjour installed):
```bash
dns-sd -B _sacn-dmx._tcp local
```

**Programmatic discovery (Python example):**
```python
from zeroconf import ServiceBrowser, Zeroconf

class Listener:
    def add_service(self, zc, type, name):
        info = zc.get_service_info(type, name)
        print(f"Found: {info.server} at {info.parsed_addresses()[0]}")
        print(f"  Universe: {info.properties[b'universe'].decode()}")

zeroconf = Zeroconf()
browser = ServiceBrowser(zeroconf, "_sacn-dmx._tcp.local.", Listener())
```

### F4: Configuration Persistence

- **F4.1:** All configuration settings shall be stored in non-volatile storage (NVS/flash).
- **F4.2:** Persisted settings include:
  - WiFi SSID
  - WiFi password
  - sACN universe number
  - Device name
- **F4.3:** Settings shall survive power cycles and firmware updates where possible.

### F5: JSON API

The device shall expose an HTTP JSON API on port 80 when connected to WiFi in station mode.

#### F5.1: GET /api/status

Returns current device status including diagnostic information.

**Response:**
```json
{
  "device_name": "DMX-Bridge-A1B2",
  "firmware_version": "1.0.0",
  "wifi_connected": true,
  "wifi_ssid": "LightingNetwork",
  "wifi_rssi": -52,
  "wifi_signal_quality": "good",
  "ip_address": "192.168.1.50",
  "mac_address": "AA:BB:CC:DD:A1:B2",
  "sacn_universe": 1,
  "sacn_packets_received": 123456,
  "sacn_packets_errors": 12,
  "sacn_source_ip": "192.168.1.10",
  "sacn_source_name": "ETC Eos",
  "sacn_priority": 100,
  "last_packet_ms_ago": 12,
  "dmx_fps": 40,
  "uptime_seconds": 3600,
  "free_heap_bytes": 180000,
  "min_free_heap_bytes": 165000,
  "cpu_temperature_c": 42.5,
  "reboot_count": 3,
  "last_reboot_reason": "power_on"
}
```

**Field descriptions:**

| Field | Description |
|-------|-------------|
| `wifi_rssi` | WiFi signal strength in dBm (typical range: -30 excellent to -90 poor) |
| `wifi_signal_quality` | Human-readable signal quality: "excellent" (>-50), "good" (-50 to -60), "fair" (-60 to -70), "poor" (<-70) |
| `sacn_packets_errors` | Count of malformed or dropped sACN packets since boot |
| `sacn_priority` | Priority value from current sACN source (0-200) |
| `dmx_fps` | Actual DMX output frames per second (rolling average) |
| `free_heap_bytes` | Current free heap memory in bytes |
| `min_free_heap_bytes` | Lowest free heap since boot (indicates memory pressure) |
| `cpu_temperature_c` | ESP32 internal temperature sensor reading (if available) |
| `reboot_count` | Number of reboots since factory reset (stored in NVS) |
| `last_reboot_reason` | Reason for last reboot: "power_on", "software", "watchdog", "crash", "brownout" |

#### F5.2: GET /api/config

Returns current configuration.

**Response:**
```json
{
  "device_name": "DMX-Bridge-A1B2",
  "sacn_universe": 1,
  "wifi_ssid": "LightingNetwork"
}
```

Note: WiFi password shall never be returned by the API.

#### F5.3: POST /api/config

Batch update configuration settings.

**Request body (all fields optional):**
```json
{
  "device_name": "Stage-Left-DMX",
  "sacn_universe": 2,
  "wifi_ssid": "NewNetwork",
  "wifi_password": "newpassword123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Configuration updated. Reboot required for WiFi changes.",
  "reboot_required": true
}
```

**Validation:**
- `sacn_universe`: integer, 1–63999
- `device_name`: string, 1–32 characters, alphanumeric and hyphens only
- `wifi_ssid`: string, 1–32 characters
- `wifi_password`: string, 8–63 characters (WPA2 requirement)

#### F5.4: POST /api/reboot

Triggers a device restart.

**Request body:** None required.

**Response:**
```json
{
  "success": true,
  "message": "Rebooting in 1 second."
}
```

The device shall delay 1 second before rebooting to allow the HTTP response to complete.

#### F5.5: POST /api/firmware

Upload new firmware binary to update the device.

**Request:**
- Content-Type: `multipart/form-data`
- Field name: `firmware`
- File: compiled firmware binary (.bin file)

**Example using curl:**
```bash
curl -X POST -F "firmware=@firmware_v1.1.0.bin" http://dmx-bridge-a1b2.local/api/firmware
```

**Response (success):**
```json
{
  "success": true,
  "message": "Firmware uploaded successfully. Validating...",
  "new_version": "1.1.0",
  "previous_version": "1.0.0",
  "rebooting": true
}
```

**Response (validation failed):**
```json
{
  "success": false,
  "error": "Firmware validation failed: invalid magic bytes"
}
```

**Update process:**
1. Device receives firmware binary and writes to OTA partition.
2. Device validates firmware (magic bytes, size, checksum if available).
3. If valid, device marks new partition as bootable and stores current version for rollback.
4. Device responds with success and reboots after 2 seconds.
5. On first boot after update, device runs self-test (WiFi connects, DMX output starts).
6. If self-test passes, update is marked as confirmed.
7. If self-test fails or device crashes within 60 seconds, watchdog triggers rollback.

**Validation checks:**
- Firmware binary has valid ESP32 application header
- Binary size is within flash partition limits
- Optional: SHA256 checksum if provided in request

#### F5.6: POST /api/firmware/rollback

Manually trigger a rollback to the previous firmware version.

**Request body:** None required.

**Response (success):**
```json
{
  "success": true,
  "message": "Rolling back to previous firmware",
  "current_version": "1.1.0",
  "rollback_version": "1.0.0",
  "rebooting": true
}
```

**Response (no rollback available):**
```json
{
  "success": false,
  "error": "No previous firmware available for rollback"
}
```

#### F5.7: GET /api/firmware

Returns current firmware information and rollback status.

**Response:**
```json
{
  "current_version": "1.1.0",
  "previous_version": "1.0.0",
  "rollback_available": true,
  "last_update": "2024-01-15T14:32:00Z",
  "update_confirmed": true,
  "partition_scheme": "ota_0 (active), ota_1 (previous)"
}
```

#### F5.8: API Error Handling

All error responses shall use appropriate HTTP status codes and include a JSON body:

```json
{
  "success": false,
  "error": "Invalid universe number. Must be 1-63999."
}
```

| Scenario | HTTP Status |
|----------|-------------|
| Malformed JSON | 400 |
| Invalid parameter value | 400 |
| Endpoint not found | 404 |
| Internal error | 500 |

### F6: Status LED Behaviour

The WS2812 LED on GPIO 8 shall indicate device state as follows:

| State | LED Behaviour |
|-------|---------------|
| AP mode active | Pulsing blue (1 second cycle) |
| Connecting to WiFi | Pulsing yellow (0.5 second cycle) |
| Connected, awaiting first sACN packet | Solid green for 2 seconds, then off |
| Receiving sACN normally | Off |
| WiFi connection lost | Solid red until reconnected or AP mode entered |
| Error (unrecoverable) | Fast flashing red (4Hz) |

**Rationale:** In normal installed operation, the LED remains off to avoid unwanted light pollution in performance environments.

### F7: Captive Portal Web Interface

The captive portal served in AP mode shall provide a minimal, functional HTML form.

#### F7.1: Page Structure

- Device name/identifier displayed at top
- Current firmware version displayed
- Form fields:
  - WiFi SSID (text input, required)
  - WiFi Password (password input, required)
  - sACN Universe (number input, default 1, range 1–63999)
- Submit button labelled "Save & Connect"

#### F7.2: Behaviour

- On submission, validate inputs client-side where practical.
- Display success message and indicate device will reboot.
- Device saves settings and reboots after 2 seconds.

#### F7.3: Styling

- Simple, functional appearance suitable for mobile browsers.
- No external CSS or JavaScript dependencies (fully self-contained).

## Non-Functional Requirements

### NF1: Performance

- **NF1.1:** sACN packet processing latency shall be <5ms from packet receipt to DMX output update.
- **NF1.2:** The device shall handle sACN packets at up to 44Hz without packet loss.
- **NF1.3:** DMX output shall be jitter-free under normal operation.

### NF2: Reliability

- **NF2.1:** The device shall operate continuously without requiring manual restart.
- **NF2.2:** The device shall recover gracefully from temporary WiFi dropouts.
- **NF2.3:** Watchdog timer shall be enabled to recover from software hangs.

### NF3: Memory

- **NF3.1:** RAM usage shall remain stable over time (no memory leaks).
- **NF3.2:** The application shall fit within the ESP32-C6 flash constraints.
- **NF3.3:** Flash partition layout shall include two OTA partitions for firmware updates and rollback capability.

## Software Architecture

### Recommended Task Structure

The application should use FreeRTOS tasks (available via Arduino ESP32 core):

1. **WiFi Management Task** — handles connection, reconnection, AP mode fallback, and SmartConfig listening.
2. **sACN Receiver Task** — listens for UDP multicast, parses E1.31 packets, updates DMX buffer.
3. **DMX Output Task** — continuously transmits DMX frames from buffer at 40Hz.
4. **HTTP Server Task** — serves API endpoints and captive portal.
5. **LED Controller Task** — manages WS2812 status indication.
6. **Serial Command Task** — monitors USB serial for configuration commands.

### Shared Data

- A 512-byte DMX channel buffer shared between sACN receiver and DMX output.
- Use mutex or atomic operations to prevent torn reads/writes.

### Recommended Libraries

| Function | Suggested Library |
|----------|-------------------|
| WiFi & AP mode | Built-in WiFi.h |
| SmartConfig | Built-in WiFi.h (WiFi.beginSmartConfig()) |
| mDNS | ESPmDNS (built-in) |
| HTTP server | WebServer (built-in) or ESPAsyncWebServer |
| NVS storage | Preferences.h (built-in) |
| WS2812 LED | Adafruit NeoPixel or FastLED |
| sACN/E1.31 | ESPAsyncE131 (https://github.com/forkineye/ESPAsyncE131) |
| DMX output | esp_dmx or manual UART configuration |

Note: Evaluate library compatibility with ESP32-C6 specifically, as some older libraries may not support this chip.

## Pin Assignment Summary

| GPIO | Function |
|------|----------|
| 0 | DMX output (TX to MAX485 DI pin) |
| 8 | WS2812 status LED data |

## Configuration Defaults

| Parameter | Default Value |
|-----------|---------------|
| sACN Universe | 1 |
| Device Name | `DMX-Bridge-XXXX` (from MAC) |
| DMX Refresh Rate | 40Hz |
| AP Mode IP | 192.168.4.1 |
| API Port | 80 |

## Testing Criteria

### TC1: WiFi Provisioning
- [ ] Device enters AP mode on first boot.
- [ ] Captive portal is accessible at 192.168.4.1.
- [ ] WiFi credentials can be submitted and are saved.
- [ ] Device connects to configured network after reboot.
- [ ] Device falls back to AP mode if configured network unavailable.

### TC1A: Serial Configuration
- [ ] Device accepts CONFIG command with valid JSON.
- [ ] Device rejects malformed JSON with appropriate error.
- [ ] STATUS command returns current device state.
- [ ] REBOOT command triggers restart.
- [ ] FACTORY_RESET clears all config and enters AP mode.
- [ ] Partial configuration updates only specified fields.
- [ ] Serial commands work in all device states.

### TC1B: SmartConfig Provisioning
- [ ] Device listens for SmartConfig while in AP mode.
- [ ] Device receives credentials from ESP-Touch app.
- [ ] LED flashes green twice on successful SmartConfig receipt.
- [ ] Device connects to network after SmartConfig provisioning.
- [ ] Multiple devices can be provisioned simultaneously.

### TC2: sACN Reception
- [ ] Device receives sACN packets on configured universe.
- [ ] Changing universe via API updates subscription correctly.
- [ ] Device handles standard sACN sources (ETC Eos, QLC+, etc.).
- [ ] Priority handling works when multiple sources transmit.

### TC3: DMX Output
- [ ] DMX output is valid per E1.11 (test with DMX analyser).
- [ ] All 512 channels are transmitted.
- [ ] Output updates promptly when sACN data changes.
- [ ] Output holds last values when sACN stops.

### TC4: JSON API
- [ ] GET /api/status returns correct information.
- [ ] GET /api/config returns current settings.
- [ ] POST /api/config updates settings correctly.
- [ ] POST /api/reboot triggers restart.
- [ ] Invalid requests return appropriate errors.

### TC5: Status LED
- [ ] LED pulses blue in AP mode.
- [ ] LED pulses yellow while connecting.
- [ ] LED shows green briefly on connection, then turns off.
- [ ] LED remains off during normal operation.
- [ ] LED shows red on connection loss.

## Future Considerations (Out of Scope)

The following features are not included in this specification but may be considered for future versions:

- RDM passthrough
- Multiple universe output
- Art-Net input support
- Static IP configuration
- Web-based DMX monitor/debug view
- Pull-based firmware updates (device fetches from URL)
- Log streaming endpoint for remote debugging

---

*Specification version: 1.0*
*Target platform: ESP32-C6 with Arduino framework*
