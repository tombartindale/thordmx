# DMX Receiver Simulator

A configurable simulator for testing the dmx-manager application. Simulates multiple DMX receiver devices with full JSON API and mDNS support, including fault injection for testing error scenarios.

## Quick Start

```bash
cd simulator
npm install
npm run dev
```

This starts 3 simulated devices by default.

## Usage

### Command Line Options

```bash
# Load a predefined scenario
npm run dev -- --scenario production-like

# Create custom number of devices
npm run dev -- --devices 10

# Custom starting port (default: 8080)
npm run dev -- --devices 5 --port 9000

# Disable mDNS (useful when running multiple simulators)
npm run dev -- --scenario three-devices --no-mdns
```

### Predefined Scenarios

| Scenario | Description | Devices |
|----------|-------------|---------|
| `single-device` | One healthy device | 1 |
| `three-devices` | Three devices on different universes | 3 |
| `ten-devices` | Load testing setup | 10 |
| `signal-loss` | Devices losing sACN signal | 2 |
| `packet-drop` | 30% packet drop rate | 2 |
| `high-latency` | 2 second response delay | 2 |
| `network-timeout` | Devices that don't respond | 2 |
| `packet-errors` | Corrupted sACN packets | 2 |
| `unstable` | Random device reboots | 2 |
| `low-memory` | Heap exhaustion simulation | 1 |
| `mixed-health` | Mix of healthy and faulty devices | 5 |
| `production-like` | Realistic 8-device setup | 8 |

### Interactive Commands

Once running, you can control the simulator interactively:

```
list                  List all devices with status
scenarios             List available scenarios
load <scenario>       Switch to a different scenario
fault <id> <type>     Inject fault on a device
clear <id>            Clear faults on a device
clear-all             Clear all faults
signal-loss <id>      Simulate sACN signal loss
restore <id>          Restore signal/network
offline <id>          Take device completely offline
add [name] [universe] Add a new device
remove <id>           Remove a device
status <id>           Show full device status JSON
exit                  Stop simulator and exit
```

### Fault Types

| Type | Effect |
|------|--------|
| `signal-loss` | Device stops receiving sACN, dmx_fps drops to 0 |
| `timeout` | Device stops responding to all HTTP requests |
| `slow` | 2 second delay on all responses |
| `drop` | 30% of requests are silently dropped |
| `errors` | 10% of sACN packets are marked as errors |

## API Endpoints

Each simulated device exposes the same API as the real firmware:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Full device status |
| `/api/config` | GET | Device configuration |
| `/api/config` | POST | Update configuration |
| `/api/reboot` | POST | Trigger device reboot |
| `/api/identify` | POST | Flash LED for identification |
| `/api/firmware` | GET | Firmware info |
| `/api/firmware` | POST | Upload firmware (multipart) |
| `/api/firmware/rollback` | POST | Rollback to previous firmware |

### Example API Calls

```bash
# Get device status
curl http://localhost:8080/api/status

# Update universe
curl -X POST http://localhost:8080/api/config \
  -H "Content-Type: application/json" \
  -d '{"sacn_universe": 5}'

# Identify device (flash LED for 10 seconds)
curl -X POST http://localhost:8080/api/identify \
  -H "Content-Type: application/json" \
  -d '{"duration": 10}'

# Reboot device
curl -X POST http://localhost:8080/api/reboot
```

## mDNS Discovery

Devices advertise themselves via mDNS as `_sacn-dmx._tcp` services.

```bash
# macOS
dns-sd -B _sacn-dmx._tcp local

# Linux
avahi-browse -rt _sacn-dmx._tcp
```

Each service includes TXT records:
- `universe` - sACN universe number
- `mac` - Device MAC address
- `version` - Firmware version

## Programmatic Usage

You can also use the simulator as a library in your tests:

```typescript
import { DmxReceiverSimulator } from './simulator.js';

const simulator = new DmxReceiverSimulator({
  basePort: 8080,
  enableMdns: true,
});

// Load a scenario
await simulator.loadScenario('three-devices');

// Or create custom devices
await simulator.addDevice({
  name: 'Test-Device',
  universe: 1,
});

// Inject faults
simulator.setDeviceFault(deviceId, {
  sacnSignalLoss: true,
});

// Clear faults
simulator.clearDeviceFault(deviceId);

// Get device info
const devices = simulator.getDevices();

// Cleanup
await simulator.stop();
simulator.destroy();
```

## Test Scenarios

### Testing Device Discovery

```bash
npm run dev -- --scenario three-devices
```

Then open dmx-manager - it should discover all 3 devices via mDNS.

### Testing Error Handling

```bash
npm run dev -- --scenario mixed-health
```

This creates 5 devices with various faults to test how the manager handles:
- Healthy devices (2)
- Signal loss (1)
- Slow responses (1)
- Packet drops (1)

### Testing Bulk Operations

```bash
npm run dev -- --devices 20
```

Use to test batch configuration updates and firmware upgrades.

### Testing Offline Recovery

```bash
# Start simulator
npm run dev -- --scenario three-devices

# Take a device offline
simulator> offline stage-left

# Verify manager shows device as offline
# Then restore it
simulator> restore stage-left
```

## Development

```bash
# Build TypeScript
npm run build

# Run from compiled JS
npm start

# Run directly with tsx
npm run dev
```

## Architecture

```
simulator/
├── src/
│   ├── index.ts           # CLI entry point
│   ├── simulator.ts       # Main simulator orchestrator
│   ├── simulated-device.ts # Device state machine
│   ├── device-server.ts   # Express HTTP server per device
│   ├── mdns-advertiser.ts # Bonjour mDNS service
│   ├── scenarios.ts       # Predefined test scenarios
│   └── types.ts           # TypeScript interfaces
├── package.json
├── tsconfig.json
└── README.md
```
