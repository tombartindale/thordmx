# ThorDMX Bridge System

A complete solution for wirelessly bridging sACN (E1.31) lighting data to DMX512 fixtures. The system consists of ESP32-based hardware devices and cross-platform management software for deploying and managing fleets of DMX bridges in professional lighting environments.

## Overview

The ThorDMX Bridge System enables lighting technicians to:

- **Receive sACN over WiFi** and output standard DMX512 signals
- **Discover and configure** multiple bridge devices from a single application
- **Provision new devices** by connecting to their WiFi access points
- **Monitor fleet health** with real-time status updates
- **Update firmware remotely** across multiple devices simultaneously

## Components

### Firmware (`/firmware`)

ESP32-C6 Arduino firmware that runs on the physical DMX bridge hardware.

**Key Features:**

- Receives sACN (E1.31) multicast packets over WiFi
- Outputs DMX512 signal via MAX485 transceiver (GPIO 0)
- Access Point mode for initial configuration with captive portal
- mDNS service advertisement (`_sacn-dmx._tcp`) for network discovery
- JSON REST API for remote configuration and monitoring
- OTA firmware updates with automatic rollback on failure
- WS2812 status LED for visual device state indication
- Serial interface for bulk provisioning during deployment

**Hardware Requirements:**

- ESP32-C6 microcontroller
- MAX485 differential transceiver for DMX output
- WS2812 RGB LED for status indication

**API Endpoints:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Device status and diagnostics |
| `/api/config` | GET/POST | Read or update configuration |
| `/api/reboot` | POST | Restart the device |
| `/api/identify` | POST | Flash LED for physical identification |
| `/api/firmware` | GET/POST | Firmware info and OTA updates |
| `/api/firmware/rollback` | POST | Revert to previous firmware |

---

### DMX Manager (`/dmx-manager`)

Cross-platform Electron desktop application for managing fleets of DMX bridge devices.

**Key Features:**

- **Automatic Discovery**: Finds devices on the network via mDNS
- **AP Provisioning**: Scans for unconfigured device access points and provisions them with WiFi credentials
- **Batch Configuration**: Configure multiple devices simultaneously with templated naming
- **Fleet Monitoring**: Real-time dashboard showing device health, signal strength, and sACN status
- **Remote Firmware Updates**: OTA flash multiple devices with progress tracking
- **Credential Auto-fill**: Retrieves current WiFi password from system keychain for easy provisioning

**Technology Stack:**

- Electron (cross-platform desktop)
- Vue 3 with TypeScript
- Tailwind CSS (dark mode optimized for lighting environments)
- Pinia for state management
- Native WiFi APIs (CoreWLAN on macOS, netsh on Windows, NetworkManager on Linux)

**Supported Platforms:**

- macOS 11+
- Windows 10+
- Linux (Ubuntu 20.04+)

---

### Simulator (`/simulator`)

A Node.js-based simulator for testing the DMX Manager application without physical hardware.

**Key Features:**

- Simulates multiple DMX bridge devices with full API compatibility
- mDNS service advertisement for discovery testing
- Fault injection for testing error handling scenarios
- Interactive CLI for runtime control
- Predefined scenarios for common testing situations

**Predefined Scenarios:**
| Scenario | Description |
|----------|-------------|
| `single-device` | One healthy device |
| `three-devices` | Three devices on different universes |
| `ten-devices` | Load testing with 10 devices |
| `mixed-health` | Mix of healthy and faulty devices |
| `production-like` | Realistic 8-device deployment |
| `signal-loss` | Devices losing sACN signal |
| `high-latency` | 2-second response delays |
| `network-timeout` | Non-responsive devices |

**Quick Start:**

```bash
cd simulator
npm install
npm run dev -- --scenario three-devices
```

---

## Getting Started

### Running the Manager Application

```bash
cd dmx-manager
npm install
npm run dev
```

### Flashing Firmware to Hardware

1. Open `/firmware/DMX_Receiver` in Arduino IDE or PlatformIO
2. Select ESP32-C6 as the target board
3. Upload to your device
4. On first boot, the device creates an access point named `THOR-BRIDGE-XXXX`
5. Use the DMX Manager app to provision the device with your WiFi credentials

### Using the Simulator for Development

```bash
cd simulator
npm install
npm run dev -- --scenario production-like
```

The simulator will advertise devices via mDNS, which the DMX Manager will automatically discover.

---

## Specifications

Detailed technical specifications are available in the `/specs` directory:

- **[sacn-dmx-spec.md](specs/sacn-dmx-spec.md)** - Firmware technical specification
- **[dmx-manager-app-spec.md](specs/dmx-manager-app-spec.md)** - Manager application specification

---

## Project Structure

```
DMX_Receiver/
├── firmware/           # ESP32 Arduino firmware
│   └── DMX_Receiver/   # Main firmware sketch
├── dmx-manager/        # Electron desktop application
│   ├── electron/       # Main process (discovery, WiFi control)
│   └── src/            # Vue frontend
├── simulator/          # Device simulator for testing
│   └── src/            # Simulator source
└── specs/              # Technical specifications
```
