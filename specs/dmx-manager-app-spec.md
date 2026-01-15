# DMX Bridge Manager Application Specification

## 1. Overview

### 1.1 Purpose
A cross-platform web application for managing fleets of ESP32 sACN-to-DMX bridge devices. The application enables technicians to discover, configure, monitor, debug, and update multiple devices from a single interface.

### 1.2 Target Users
- Lighting technicians deploying multiple DMX bridges in venues
- System integrators managing device fleets
- Developers debugging device firmware

### 1.3 Key Capabilities
- **Device Discovery**: Automatic mDNS-based discovery of all DMX bridges on the network
- **Batch Configuration**: Configure multiple devices simultaneously (universe, name, WiFi)
- **Fleet Status Monitoring**: Real-time dashboard showing health of all devices
- **Remote Firmware Updates**: OTA flash multiple devices in parallel
- **Debugging Tools**: Live device metrics, packet statistics, and log viewing

---

## 2. Architecture

### 2.1 Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Runtime | Node.js 20+ | Cross-platform, excellent network libraries |
| Framework | Electron or local web server | Native app feel with web technologies |
| Frontend | Vue 3 with TypeScript | Composition API, reactive, type-safe UI |
| Styling | Tailwind CSS | Rapid UI development, dark mode support |
| State | Pinia | Official Vue store, devtools integration |
| mDNS | bonjour-service (Node.js) | Cross-platform service discovery |
| HTTP Client | Axios or fetch | Device API communication |
| Build | Vite | First-class Vue support, fast HMR |

### 2.2 Deployment Options

**Option A: Electron Desktop App (Recommended)**
- Single executable for Windows, macOS, Linux
- Native mDNS access without browser restrictions
- File system access for firmware binaries
- Tray icon for background monitoring

**Option B: Local Web Server**
- Node.js backend with Express
- React frontend served locally
- Access via `http://localhost:3000`
- Requires Node.js installation

### 2.3 System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    DMX Bridge Manager App                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │  Discovery  │ │  Device API │ │  Firmware   │ │   WiFi    │ │
│  │  Service    │ │  Client     │ │  Uploader   │ │ Provision │ │
│  │  (mDNS)     │ │  (HTTP/JSON)│ │  (Multipart)│ │ (Native)  │ │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └─────┬─────┘ │
│         │               │               │              │        │
│         └───────────────┴───────────────┴──────────────┘        │
│                                │                                 │
│  ┌─────────────────────────────┴─────────────────────────────┐  │
│  │                     Vue UI Layer                         │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │  │
│  │  │ Device   │ │ Config   │ │ Firmware │ │ Provisioning │  │  │
│  │  │ List     │ │ Panel    │ │ Manager  │ │ Wizard       │  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │   Local Network       │
                    │   (WiFi/Ethernet)     │
                    └───────────┬───────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
   ┌────┴────┐            ┌────┴────┐            ┌────┴────┐
   │ DMX     │            │ DMX     │            │ DMX     │
   │ Bridge  │            │ Bridge  │            │ Bridge  │
   │ Device 1│            │ Device 2│            │ Device N│
   └─────────┘            └─────────┘            └─────────┘
```

---

## 3. Features & Functional Requirements

### 3.1 Device Discovery

#### 3.1.1 Automatic Discovery (Network Mode)
- Continuously browse for `_sacn-dmx._tcp` mDNS services
- Parse TXT records for universe, MAC, and firmware version
- Resolve IP addresses and hostnames
- Display devices within 2 seconds of appearing on network

#### 3.1.2 AP Discovery & Provisioning
Discover and provision unconfigured devices that are broadcasting their own WiFi access points.

**AP Network Pattern**
- Default device AP SSID format: `DMX-Bridge-XXXX` (where XXXX is last 4 hex digits of MAC)
- Configurable pattern matching: `DMX-Bridge-*` (glob) or `DMX-Bridge-[A-F0-9]{4}` (regex)
- AP has no password by default
- Device IP in AP mode: `192.168.4.1`

**Discovery Process**
1. Scan for WiFi networks matching the configured pattern
2. Display list of discovered AP networks with signal strength
3. User selects which APs to provision (multi-select)
4. Application connects to each AP sequentially and retrieves device info

**Provisioning Workflow**
```
┌─────────────────────────────────────────────────────────────────┐
│                    AP Provisioning Wizard                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Step 1: Scan for Device APs                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Pattern: [DMX-Bridge-*        ]  [Scan Networks]          │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Found 3 device access points:                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  ☑ DMX-Bridge-A1B2    -45 dBm  ████████░░  Excellent       │ │
│  │  ☑ DMX-Bridge-C3D4    -62 dBm  █████░░░░░  Good            │ │
│  │  ☑ DMX-Bridge-E5F6    -78 dBm  ██░░░░░░░░  Fair            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Step 2: Configure WiFi Credentials                             │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Target Network SSID:     [VenueWiFi                    ]  │ │
│  │  Target Network Password: [••••••••••••                 ]  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Step 3: Device Configuration (Optional)                        │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Device Name Template:    [Stage-{n}                    ]  │ │
│  │  sACN Universe:           [1         ]                     │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│                              [Cancel]  [Provision 3 Devices]    │
└─────────────────────────────────────────────────────────────────┘
```

**Per-Device Provisioning Sequence**
For each selected device AP:
1. **Disconnect** from current WiFi network
2. **Connect** to device AP (e.g., `DMX-Bridge-A1B2`)
3. **Verify** connection by fetching `GET http://192.168.4.1/api/status`
4. **Configure** device via `POST http://192.168.4.1/api/config`:
   - WiFi SSID and password (required)
   - Device name (from template)
   - sACN universe (from sequence)
5. **Wait** for device to reboot and connect to target network
6. **Reconnect** to original/target network
7. **Verify** device appears on network via mDNS discovery
8. **Repeat** for next device

**Provisioning Progress UI**
```
┌─────────────────────────────────────────────────────────────────┐
│                    Provisioning Progress                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Overall: ████████████░░░░░░░░  2/3 devices (67%)               │
│                                                                  │
│  ✓ DMX-Bridge-A1B2 → Stage-1                                    │
│    Connected to network, universe 1                             │
│                                                                  │
│  ● DMX-Bridge-C3D4 → Stage-2                          [Working] │
│    ├─ ✓ Connected to device AP                                  │
│    ├─ ✓ Retrieved device info                                   │
│    ├─ ✓ Sent configuration                                      │
│    ├─ ○ Waiting for device reboot...                            │
│    └─ ○ Verifying on target network                             │
│                                                                  │
│  ○ DMX-Bridge-E5F6 → Stage-3                          [Pending] │
│                                                                  │
│                                            [Cancel Remaining]    │
└─────────────────────────────────────────────────────────────────┘
```

**Platform Requirements**
- **Electron (Required)**: Native WiFi scanning and connection requires OS-level APIs
  - macOS: CoreWLAN framework via native Node addon
  - Windows: WlanAPI via native Node addon
  - Linux: NetworkManager D-Bus API or iwlist
- **Library**: `node-wifi` or custom native bindings
- **Permissions**: May require administrator/root privileges for WiFi control

**Error Handling**
| Error | Recovery |
|-------|----------|
| Cannot connect to device AP | Skip device, add to retry list |
| Device API unreachable at 192.168.4.1 | Retry connection, then skip |
| WiFi credentials rejected by target network | Abort provisioning, notify user |
| Device doesn't appear on target network | Wait longer (30s timeout), then mark as failed |
| Lost connection during provisioning | Attempt to reconnect and resume |

**Provisioning Templates**
Save and reuse provisioning configurations:
```typescript
interface ProvisioningTemplate {
  name: string;                    // Template name
  apPattern: string;               // AP SSID pattern (glob or regex)
  targetSsid: string;              // Target WiFi network
  targetPassword?: string;         // Optionally save password (encrypted)
  deviceNameTemplate: string;      // e.g., "Stage-{n}"
  sacnUniverse: number;            // Same universe for all devices
}
```

#### 3.1.3 Manual Discovery
- Add device by IP address or hostname
- Support for devices on different subnets (with known IP)
- Persist manually added devices between sessions

#### 3.1.4 Device List
- Show all discovered devices in sortable table
- Columns: Name, IP, Universe, Status, Signal, Firmware
- Visual indicators: Online (green), Offline (red), Updating (yellow)
- Filter by: Online/Offline, Universe, Firmware version
- Search by device name or IP

### 3.2 Batch Configuration

#### 3.2.1 Multi-Select
- Checkbox selection of multiple devices
- "Select All" / "Select None" / "Select Filtered"
- Selection persists across tab navigation

#### 3.2.2 Batch Settings Panel
When multiple devices selected, show configuration form:

| Setting | Input Type | Validation | Notes |
|---------|------------|------------|-------|
| Device Name | Text + template | 1-32 chars | Support `{n}` for sequential numbering |
| sACN Universe | Number | 1-63999 | Same universe applied to all selected devices |
| WiFi SSID | Text | 1-32 chars | Optional - only if changing networks |
| WiFi Password | Password | 8-63 chars | Required if SSID provided |

#### 3.2.3 Configuration Templates
- Sequential naming: `Stage-{n}` → Stage-1, Stage-2, Stage-3...
- Common universe: All devices receive the same sACN universe
- Preview changes before applying
- Save templates for reuse

#### 3.2.4 Batch Apply Process
1. Validate all settings client-side
2. Show confirmation dialog with affected devices
3. Apply to each device sequentially (configurable parallel limit)
4. Show progress bar and per-device status
5. Retry failed devices with exponential backoff
6. Generate summary report (success/failed counts)

### 3.3 Fleet Status Monitoring

#### 3.3.1 Dashboard View
Overview cards showing:
- Total devices discovered
- Online vs offline count
- Devices receiving sACN data
- Average WiFi signal strength
- Firmware version distribution (pie chart)

#### 3.3.2 Device Detail Panel
Click device to show expanded status:
```
┌─────────────────────────────────────────────────────────┐
│  DMX-Bridge-A1B2                              ● Online  │
├─────────────────────────────────────────────────────────┤
│  Network                                                │
│  ├─ IP: 192.168.1.50                                   │
│  ├─ SSID: VenueWiFi                                    │
│  ├─ Signal: -52 dBm (Good)                             │
│  └─ MAC: AA:BB:CC:DD:A1:B2                             │
│                                                         │
│  sACN Status                                           │
│  ├─ Universe: 1                                        │
│  ├─ Source: ETC Eos (192.168.1.10)                     │
│  ├─ Priority: 100                                       │
│  ├─ Packets: 1,234,567 received                        │
│  ├─ Errors: 12 (0.001%)                                │
│  └─ Last Packet: 15ms ago                              │
│                                                         │
│  System                                                 │
│  ├─ Firmware: 1.0.0                                    │
│  ├─ Uptime: 3h 24m 15s                                 │
│  ├─ Free Heap: 180KB / 350KB                           │
│  ├─ Reboots: 3                                         │
│  └─ Last Reset: Power cycle                            │
└─────────────────────────────────────────────────────────┘
```

#### 3.3.3 Auto-Refresh
- Poll device status every 5 seconds (configurable)
- Efficient: only poll visible/selected devices
- Show "last updated" timestamp
- Manual refresh button

#### 3.3.4 Alerts & Notifications
- Device goes offline → Desktop notification
- High packet error rate (>1%) → Warning indicator
- Low WiFi signal (<-75 dBm) → Warning indicator
- Memory low (<50KB free) → Warning indicator

### 3.4 Remote Firmware Updates

#### 3.4.1 Firmware Management
- Select `.bin` firmware file from local filesystem
- Display firmware file info (size, hash)
- Store recently used firmware files
- Validate firmware file format before upload

#### 3.4.2 Batch OTA Update
1. Select target devices (filter by current version)
2. Choose firmware file
3. Confirm update (show current vs new version)
4. Upload to devices (configurable parallelism: 1-5 concurrent)
5. Progress tracking per device:
   - Uploading (0-100%)
   - Verifying
   - Rebooting
   - Confirming new version
6. Automatic rollback detection if device fails to come online

#### 3.4.3 Update Queue
- Queue updates for offline devices
- Retry when device comes online
- Timeout after configurable period (default: 1 hour)

#### 3.4.4 Rollback Support
- Show if rollback partition available per device
- Batch rollback to previous firmware
- Confirm before rollback

### 3.5 Debugging Tools

#### 3.5.1 Live Metrics View
Real-time charts (last 60 seconds):
- sACN packets per second
- WiFi RSSI over time
- Free heap memory
- DMX output FPS

#### 3.5.2 Packet Statistics
- Total packets received
- Error count and rate
- Source IP and name
- Priority level
- Packet rate (Hz)

#### 3.5.3 Device Actions
| Action | Description |
|--------|-------------|
| Reboot | Restart device immediately |
| Factory Reset | Clear all settings (requires confirmation) |
| Identify | Flash LED pattern to physically locate device |
| Export Config | Download device configuration as JSON |
| Import Config | Upload configuration JSON to device |

#### 3.5.4 Batch Diagnostics
- Export fleet status report (CSV/JSON)
- Batch reboot selected devices
- Connectivity test (ping all devices)

---

## 4. User Interface Design

### 4.1 Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  ┌─────┐  DMX Bridge Manager              [Settings] [?]       │
│  │ ≡   │                                                        │
├──┴─────┴────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  [🔍 Search...]           [Filter ▼]  [↻ Refresh]        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────┬────────────────────────┐   │
│  │                                 │                         │   │
│  │      Device List                │    Detail Panel         │   │
│  │      (Master View)              │    (Selected Device)    │   │
│  │                                 │                         │   │
│  │  ☑ DMX-Stage-1    192.168.1.50 │    Status, Config,      │   │
│  │  ☑ DMX-Stage-2    192.168.1.51 │    Firmware, Debug      │   │
│  │  ☐ DMX-Stage-3    192.168.1.52 │    tabs                 │   │
│  │  ☐ DMX-Balcony    192.168.1.53 │                         │   │
│  │                                 │                         │   │
│  └─────────────────────────────────┴────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  [Configure Selected (2)]  [Update Firmware]  [Reboot]   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Views / Tabs

1. **Devices** (default) - List and manage all devices
2. **Provision** - AP discovery and device provisioning wizard
3. **Dashboard** - Fleet overview with statistics
4. **Firmware** - Manage firmware files and updates
5. **Settings** - Application preferences

### 4.3 Theme
- Dark mode by default (lighting technicians work in dark environments)
- Light mode option
- High contrast status indicators
- Accessible color palette (colorblind-friendly)

### 4.4 Responsive Design
- Minimum width: 1024px
- Collapsible side panels
- Mobile-friendly for tablet use on-site

---

## 5. API Integration

### 5.1 Device API Client

```typescript
interface DeviceClient {
  // Discovery
  discoverDevices(): AsyncGenerator<Device>;

  // Status
  getStatus(device: Device): Promise<DeviceStatus>;
  getConfig(device: Device): Promise<DeviceConfig>;

  // Configuration
  setConfig(device: Device, config: Partial<DeviceConfig>): Promise<void>;
  batchSetConfig(devices: Device[], configs: Partial<DeviceConfig>[]): Promise<BatchResult>;

  // Firmware
  getFirmwareInfo(device: Device): Promise<FirmwareInfo>;
  uploadFirmware(device: Device, firmware: Buffer, onProgress: (p: number) => void): Promise<void>;
  rollbackFirmware(device: Device): Promise<void>;

  // Actions
  reboot(device: Device): Promise<void>;
  factoryReset(device: Device): Promise<void>;
}

interface ProvisioningService {
  // WiFi Network Scanning
  scanWifiNetworks(): Promise<WifiNetwork[]>;
  filterByPattern(networks: WifiNetwork[], pattern: string): WifiNetwork[];

  // WiFi Connection Management
  getCurrentNetwork(): Promise<string | null>;
  connectToNetwork(ssid: string, password?: string): Promise<void>;
  disconnectFromNetwork(): Promise<void>;

  // Provisioning Operations
  provisionDevice(
    apSsid: string,
    config: ProvisioningConfig,
    onProgress: (step: ProvisioningStep) => void
  ): Promise<ProvisioningResult>;

  batchProvision(
    apSsids: string[],
    config: BatchProvisioningConfig,
    onProgress: (deviceIndex: number, step: ProvisioningStep) => void
  ): Promise<BatchProvisioningResult>;

  // Template Management
  saveTemplate(template: ProvisioningTemplate): Promise<void>;
  getTemplates(): Promise<ProvisioningTemplate[]>;
  deleteTemplate(name: string): Promise<void>;
}
```

### 5.2 Device Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/status` | GET | Fetch device status and metrics |
| `/api/config` | GET | Fetch current configuration |
| `/api/config` | POST | Update configuration |
| `/api/reboot` | POST | Restart device |
| `/api/firmware` | GET | Get firmware status |
| `/api/firmware` | POST | Upload new firmware |
| `/api/firmware/rollback` | POST | Revert to previous firmware |

### 5.3 Error Handling

| Error Type | Handling |
|------------|----------|
| Network timeout | Retry with backoff, mark device as unreachable |
| 400 Bad Request | Display validation error to user |
| 404 Not Found | Device may have old firmware, show warning |
| 500 Server Error | Log error, suggest device reboot |
| Device offline | Queue operation, retry when online |

---

## 6. Data Models

### 6.1 Device

```typescript
interface Device {
  id: string;              // MAC address (unique identifier)
  name: string;            // Device name
  hostname: string;        // mDNS hostname
  ip: string;              // IP address
  port: number;            // HTTP port (80)
  mac: string;             // MAC address
  firmwareVersion: string; // Current firmware version
  universe: number;        // sACN universe
  discoveredAt: Date;      // When first discovered
  lastSeen: Date;          // Last successful communication
  isOnline: boolean;       // Current connectivity status
  isManual: boolean;       // Manually added vs discovered
}
```

### 6.2 DeviceStatus

```typescript
interface DeviceStatus {
  // WiFi
  wifiConnected: boolean;
  wifiSsid: string;
  wifiRssi: number;
  wifiSignalQuality: 'excellent' | 'good' | 'fair' | 'poor';
  ipAddress: string;

  // sACN
  sacnUniverse: number;
  sacnPacketsReceived: number;
  sacnPacketErrors: number;
  sacnSourceIp: string | null;
  sacnSourceName: string | null;
  sacnPriority: number;
  lastPacketMsAgo: number;

  // DMX
  dmxFps: number;

  // System
  firmwareVersion: string;
  uptimeSeconds: number;
  freeHeapBytes: number;
  minFreeHeapBytes: number;
  rebootCount: number;
  lastRebootReason: string;
}
```

### 6.3 DeviceConfig

```typescript
interface DeviceConfig {
  deviceName: string;
  sacnUniverse: number;
  wifiSsid?: string;
  wifiPassword?: string;
}
```

### 6.4 BatchOperation

```typescript
interface BatchOperation {
  id: string;
  type: 'config' | 'firmware' | 'reboot';
  devices: Device[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;        // 0-100
  results: BatchResult[];
  startedAt: Date;
  completedAt?: Date;
}

interface BatchResult {
  device: Device;
  success: boolean;
  error?: string;
  duration: number;        // milliseconds
}
```

### 6.5 Provisioning Models

```typescript
interface WifiNetwork {
  ssid: string;
  bssid: string;           // MAC address of AP
  signalStrength: number;  // dBm
  signalQuality: 'excellent' | 'good' | 'fair' | 'poor';
  security: 'open' | 'wep' | 'wpa' | 'wpa2' | 'wpa3';
  channel: number;
  frequency: number;       // MHz (2.4GHz or 5GHz)
}

interface ProvisioningTemplate {
  id: string;
  name: string;                    // User-friendly template name
  apPattern: string;               // SSID pattern (glob or regex)
  apPatternType: 'glob' | 'regex';
  targetSsid: string;              // Target WiFi network SSID
  targetPassword?: string;         // Encrypted password (optional storage)
  deviceNameTemplate: string;      // e.g., "Stage-{n}", "DMX-{mac4}"
  sacnUniverse: number;            // Same universe for all devices
  createdAt: Date;
  updatedAt: Date;
}

interface ProvisioningConfig {
  targetSsid: string;
  targetPassword: string;
  deviceName?: string;
  sacnUniverse?: number;
}

interface BatchProvisioningConfig {
  targetSsid: string;
  targetPassword: string;
  deviceNameTemplate: string;      // Supports {n}, {mac4}, {mac6}
  startingNumber: number;          // For {n} placeholder
  sacnUniverse: number;            // Same universe for all devices
}

type ProvisioningStep =
  | { type: 'disconnecting' }
  | { type: 'connecting_to_ap'; ssid: string }
  | { type: 'connected_to_ap' }
  | { type: 'fetching_device_info' }
  | { type: 'device_info_received'; mac: string; firmware: string }
  | { type: 'sending_config' }
  | { type: 'config_sent' }
  | { type: 'waiting_for_reboot'; timeoutMs: number }
  | { type: 'reconnecting_to_network'; ssid: string }
  | { type: 'verifying_device_online'; timeoutMs: number }
  | { type: 'device_online'; ip: string }
  | { type: 'completed' }
  | { type: 'failed'; error: string };

interface ProvisioningResult {
  success: boolean;
  apSsid: string;
  device?: Device;         // Populated if successful
  assignedName?: string;
  assignedUniverse?: number;
  error?: string;
  duration: number;        // Total time in ms
}

interface BatchProvisioningResult {
  total: number;
  successful: number;
  failed: number;
  results: ProvisioningResult[];
  duration: number;        // Total batch time in ms
}

interface ProvisioningSession {
  id: string;
  status: 'scanning' | 'configuring' | 'provisioning' | 'completed' | 'cancelled';
  template?: ProvisioningTemplate;
  discoveredAPs: WifiNetwork[];
  selectedAPs: string[];   // SSIDs selected for provisioning
  config: BatchProvisioningConfig;
  currentDeviceIndex: number;
  results: ProvisioningResult[];
  startedAt: Date;
  completedAt?: Date;
}
```

---

## 7. Non-Functional Requirements

### 7.1 Performance
- Device discovery latency: <2 seconds
- Status refresh: <500ms per device
- UI responsiveness: <100ms for interactions
- Support 100+ devices without degradation

### 7.2 Reliability
- Graceful handling of network failures
- No data loss on application crash
- Automatic reconnection to devices

### 7.3 Security
- No sensitive data transmitted to external servers
- WiFi passwords not stored in application (only sent to devices)
- HTTPS support for devices (future enhancement)

### 7.4 Compatibility
- **Operating Systems**: Windows 10+, macOS 11+, Linux (Ubuntu 20.04+)
- **Node.js**: 20 LTS or later
- **Browsers** (if web mode): Chrome 100+, Firefox 100+, Safari 15+

---

## 8. Configuration & Persistence

### 8.1 Application Settings

```typescript
interface AppSettings {
  // Discovery
  discoveryEnabled: boolean;
  discoveryInterval: number;     // ms between scans

  // Status
  statusPollInterval: number;    // ms between status refreshes
  pollOnlyVisible: boolean;      // Optimize for large fleets

  // Updates
  maxConcurrentUpdates: number;  // Parallel firmware uploads
  updateRetryCount: number;
  updateRetryDelay: number;      // ms

  // Provisioning
  defaultApPattern: string;      // Default SSID pattern (e.g., "DMX-Bridge-*")
  apPatternType: 'glob' | 'regex';
  provisioningTimeout: number;   // ms to wait for device to join network
  provisioningRetryCount: number;
  saveProvisioningPasswords: boolean;  // Store WiFi passwords (encrypted)

  // UI
  theme: 'dark' | 'light' | 'system';
  showOfflineDevices: boolean;
  confirmDestructiveActions: boolean;

  // Notifications
  notifyDeviceOffline: boolean;
  notifyUpdateComplete: boolean;
  notifyProvisioningComplete: boolean;
}
```

### 8.2 Persistent Storage
- **Electron**: electron-store (JSON file in app data)
- **Web**: localStorage + IndexedDB for larger data

### 8.3 Stored Data
- Application settings
- Manually added devices
- Recent firmware files
- Configuration templates
- Window size/position

---

## 9. Implementation Phases

### Phase 1: Core Functionality
- [ ] Project setup (Vite + Vue 3 + TypeScript + Electron)
- [ ] mDNS discovery service
- [ ] Device list UI with status indicators
- [ ] Single device status view
- [ ] Single device configuration
- [ ] Manual device addition

### Phase 2: AP Provisioning
- [ ] Native WiFi module setup (platform-specific bindings)
- [ ] WiFi network scanning with pattern matching
- [ ] AP list UI with signal strength indicators
- [ ] Provisioning wizard flow (3-step form)
- [ ] Sequential device provisioning with progress tracking
- [ ] Provisioning template save/load
- [ ] Error handling and retry for failed provisions

### Phase 3: Batch Operations
- [ ] Multi-device selection
- [ ] Batch configuration UI
- [ ] Configuration templates
- [ ] Batch apply with progress tracking
- [ ] Error handling and retry logic

### Phase 4: Firmware Management
- [ ] Firmware file selection
- [ ] Single device OTA update
- [ ] Batch firmware updates
- [ ] Progress tracking per device
- [ ] Rollback support

### Phase 5: Advanced Features
- [ ] Dashboard with fleet statistics
- [ ] Live metrics charts
- [ ] Desktop notifications
- [ ] Export/import configurations
- [ ] Fleet diagnostics report

### Phase 6: Polish
- [ ] Dark/light theme toggle
- [ ] Keyboard shortcuts
- [ ] Comprehensive error messages
- [ ] Help documentation
- [ ] Performance optimization

---

## 10. File Structure

```
dmx-manager/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── electron/                    # Electron main process
│   ├── main.ts
│   ├── preload.ts
│   ├── discovery.ts             # mDNS service
│   └── wifi/                    # Native WiFi control
│       ├── index.ts             # Platform detection & routing
│       ├── macos.ts             # CoreWLAN bindings
│       ├── windows.ts           # WlanAPI bindings
│       └── linux.ts             # NetworkManager D-Bus
├── src/
│   ├── main.ts                  # Vue entry point
│   ├── App.vue
│   ├── api/
│   │   ├── client.ts            # HTTP client for device API
│   │   ├── discovery.ts         # mDNS discovery (renderer)
│   │   ├── provisioning.ts      # Provisioning service
│   │   └── types.ts             # API response types
│   ├── components/
│   │   ├── DeviceList/
│   │   │   ├── DeviceList.vue
│   │   │   └── DeviceRow.vue
│   │   ├── DeviceDetail/
│   │   │   └── DeviceDetail.vue
│   │   ├── ConfigPanel/
│   │   │   └── ConfigPanel.vue
│   │   ├── FirmwareManager/
│   │   │   └── FirmwareManager.vue
│   │   ├── Dashboard/
│   │   │   └── Dashboard.vue
│   │   ├── Provisioning/        # AP provisioning wizard
│   │   │   ├── ProvisioningWizard.vue
│   │   │   ├── APScanner.vue    # WiFi network scanner
│   │   │   ├── APList.vue       # Discovered AP list
│   │   │   ├── ConfigForm.vue   # WiFi + device config form
│   │   │   ├── ProgressView.vue # Provisioning progress
│   │   │   └── TemplateManager.vue
│   │   └── common/
│   │       ├── BaseButton.vue
│   │       ├── BaseInput.vue
│   │       └── StatusIndicator.vue
│   ├── composables/             # Vue composables (like React hooks)
│   │   ├── useDevices.ts
│   │   ├── useDeviceStatus.ts
│   │   ├── useBatchOperation.ts
│   │   ├── useWifiNetworks.ts   # WiFi scanning composable
│   │   └── useProvisioning.ts   # Provisioning workflow composable
│   ├── stores/                  # Pinia stores
│   │   ├── devices.ts
│   │   ├── settings.ts
│   │   ├── operations.ts
│   │   └── provisioning.ts      # Provisioning state
│   ├── utils/
│   │   ├── formatting.ts
│   │   ├── validation.ts
│   │   └── ssidPattern.ts       # Glob/regex matching for SSIDs
│   ├── views/                   # Page-level components
│   │   ├── DevicesView.vue
│   │   ├── ProvisionView.vue
│   │   ├── DashboardView.vue
│   │   ├── FirmwareView.vue
│   │   └── SettingsView.vue
│   ├── router/
│   │   └── index.ts             # Vue Router configuration
│   └── styles/
│       └── globals.css
├── public/
│   └── icons/
└── dist/                        # Build output
```

---

## 11. Future Enhancements

The following features are out of scope for initial release but may be considered for future versions:

- **Device Groups**: Organize devices into logical groups (e.g., "Stage Left", "House")
- **Scheduling**: Schedule configuration changes or reboots
- **Audit Log**: Track all configuration changes with timestamps
- **Multi-User**: Support for multiple users with role-based permissions
- **Cloud Sync**: Optional sync of device registry across installations
- **Firmware Repository**: Automatic firmware version checking and downloads
- **DMX Monitor**: View live DMX channel values per device
- **Network Topology**: Visual map of device locations
- **API for Automation**: REST API for scripting and CI/CD integration
- **Localization**: Multi-language support

---

## 12. Appendix

### A. Device API Reference

See [sacn-dmx-spec.md](sacn-dmx-spec.md) for complete device API documentation.

### B. mDNS Service Format

```
Service: _sacn-dmx._tcp.local
Port: 80
TXT Records:
  - universe=<1-63999>
  - mac=<AA:BB:CC:DD:EE:FF>
  - version=<firmware_version>
```

### C. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + R` | Refresh device list |
| `Ctrl/Cmd + A` | Select all devices |
| `Ctrl/Cmd + D` | Deselect all devices |
| `Ctrl/Cmd + F` | Focus search box |
| `Ctrl/Cmd + P` | Open provisioning wizard |
| `Ctrl/Cmd + Shift + S` | Scan for device APs |
| `Ctrl/Cmd + ,` | Open settings |
| `Delete` | Remove selected manual device |
| `Enter` | Open device detail panel |
| `Escape` | Close dialogs/panels |
