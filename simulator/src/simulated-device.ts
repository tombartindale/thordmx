import type {
  DeviceStatus,
  DeviceConfig,
  ConfigUpdate,
  FirmwareInfo,
  SimulatedDeviceConfig,
  SimulatorState,
  FaultInjection,
  LEDState,
} from './types.js';

function generateMac(): string {
  const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase();
  return `${hex()}:${hex()}:${hex()}:${hex()}:${hex()}:${hex()}`;
}

function getSignalQuality(rssi: number): 'excellent' | 'good' | 'fair' | 'poor' {
  if (rssi > -50) return 'excellent';
  if (rssi > -60) return 'good';
  if (rssi > -70) return 'fair';
  return 'poor';
}

export class SimulatedDevice {
  readonly id: string;
  readonly mac: string;

  private config: {
    deviceName: string;
    universe: number;
    wifiSsid: string;
    wifiPassword: string;
  };

  private state: SimulatorState;
  private firmwareVersion: string;
  private previousFirmwareVersion: string | null = null;
  private startTime: number;
  private port: number;
  private faultInjection: FaultInjection = {};
  private sacnSimulationInterval: ReturnType<typeof setInterval> | null = null;
  private heapDecayInterval: ReturnType<typeof setInterval> | null = null;

  constructor(deviceConfig: SimulatedDeviceConfig, port: number) {
    this.mac = deviceConfig.mac || generateMac();
    this.id = this.mac.replace(/:/g, '').toLowerCase();
    this.port = port;
    this.firmwareVersion = deviceConfig.firmwareVersion || '1.0.0';
    this.startTime = Date.now();

    const lastFourHex = this.mac.slice(-5).replace(':', '');
    this.config = {
      deviceName: deviceConfig.name || `DMX-Bridge-${lastFourHex}`,
      universe: deviceConfig.universe || 1,
      wifiSsid: 'SimulatedNetwork',
      wifiPassword: 'simulated123',
    };

    this.state = {
      wifiConnected: true,
      sacnReceiving: false,
      sacnSourceIp: null,
      sacnSourceName: null,
      sacnPriority: 100,
      lastPacketTime: null,
      packetsReceived: 0,
      packetsErrors: 0,
      dmxFps: 0,
      freeHeap: 180000,
      minFreeHeap: 165000,
      rebootCount: 0,
      lastRebootReason: 'power_on',
      ledState: 'LED_CONNECTED',
      isIdentifying: false,
      identifyEndTime: null,
      ...deviceConfig.initialState,
    };

    this.startBackgroundTasks();
  }

  private startBackgroundTasks(): void {
    // Simulate sACN reception
    this.sacnSimulationInterval = setInterval(() => {
      if (this.state.wifiConnected && !this.faultInjection.sacnSignalLoss) {
        if (!this.state.sacnReceiving) {
          this.state.sacnReceiving = true;
          this.state.sacnSourceIp = '192.168.1.10';
          this.state.sacnSourceName = 'Simulated sACN Source';
        }

        this.state.lastPacketTime = Date.now();
        this.state.packetsReceived++;
        this.state.dmxFps = 40 + Math.floor(Math.random() * 3) - 1;

        // Inject packet errors if configured
        if (this.faultInjection.sacnPacketErrors && Math.random() < this.faultInjection.sacnPacketErrors) {
          this.state.packetsErrors++;
        }
      } else if (this.state.sacnReceiving) {
        // Signal lost
        this.state.sacnReceiving = false;
        this.state.dmxFps = 0;
      }
    }, 25); // ~40Hz

    // Simulate heap decay (memory fragmentation over time)
    this.heapDecayInterval = setInterval(() => {
      if (this.faultInjection.heapExhaustion) {
        this.state.freeHeap = Math.max(10000, this.state.freeHeap - 100);
        this.state.minFreeHeap = Math.min(this.state.minFreeHeap, this.state.freeHeap);
      }
    }, 1000);
  }

  private stopBackgroundTasks(): void {
    if (this.sacnSimulationInterval) {
      clearInterval(this.sacnSimulationInterval);
      this.sacnSimulationInterval = null;
    }
    if (this.heapDecayInterval) {
      clearInterval(this.heapDecayInterval);
      this.heapDecayInterval = null;
    }
  }

  setFaultInjection(faults: FaultInjection): void {
    this.faultInjection = { ...this.faultInjection, ...faults };

    if (faults.sacnSignalLoss) {
      this.state.sacnReceiving = false;
      this.state.sacnSourceIp = null;
      this.state.sacnSourceName = null;
      this.state.lastPacketTime = null;
      this.state.dmxFps = 0;
    }

    if (faults.networkTimeout) {
      this.state.wifiConnected = false;
      this.state.sacnReceiving = false;
      this.state.ledState = 'LED_ERROR';
    }
  }

  clearFaultInjection(): void {
    const wasNetworkTimeout = this.faultInjection.networkTimeout;
    this.faultInjection = {};

    if (wasNetworkTimeout) {
      this.state.wifiConnected = true;
      this.state.ledState = 'LED_CONNECTED';
    }
  }

  getFaultInjection(): FaultInjection {
    return { ...this.faultInjection };
  }

  shouldDropRequest(): boolean {
    return this.faultInjection.dropPacketRate !== undefined &&
           Math.random() < this.faultInjection.dropPacketRate;
  }

  getResponseDelay(): number {
    return this.faultInjection.responseDelay || 0;
  }

  shouldRandomReboot(): boolean {
    return this.faultInjection.randomReboot !== undefined &&
           Math.random() < this.faultInjection.randomReboot;
  }

  isNetworkTimeout(): boolean {
    return this.faultInjection.networkTimeout === true;
  }

  getStatus(): DeviceStatus {
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    const rssi = -45 - Math.floor(Math.random() * 20);

    // Check if identify has ended
    if (this.state.isIdentifying && this.state.identifyEndTime && Date.now() > this.state.identifyEndTime) {
      this.state.isIdentifying = false;
      this.state.identifyEndTime = null;
      this.state.ledState = this.state.wifiConnected ? 'LED_CONNECTED' : 'LED_ERROR';
    }

    const status: DeviceStatus = {
      device_name: this.config.deviceName,
      firmware_version: this.firmwareVersion,
      wifi_connected: this.state.wifiConnected,
      wifi_ssid: this.config.wifiSsid,
      wifi_rssi: rssi,
      wifi_signal_quality: getSignalQuality(rssi),
      ip_address: `127.0.0.1`,
      mac_address: this.mac,
      sacn_universe: this.config.universe,
      sacn_packets_received: this.state.packetsReceived,
      sacn_packets_errors: this.state.packetsErrors,
      dmx_fps: this.state.dmxFps,
      uptime_seconds: uptimeSeconds,
      free_heap_bytes: this.state.freeHeap,
      min_free_heap_bytes: this.state.minFreeHeap,
      reboot_count: this.state.rebootCount,
      last_reboot_reason: this.state.lastRebootReason,
    };

    if (this.state.sacnReceiving && this.state.lastPacketTime) {
      status.sacn_source_ip = this.state.sacnSourceIp!;
      status.sacn_source_name = this.state.sacnSourceName!;
      status.sacn_priority = this.state.sacnPriority;
      status.last_packet_ms_ago = Date.now() - this.state.lastPacketTime;
    }

    return status;
  }

  getConfig(): DeviceConfig {
    return {
      device_name: this.config.deviceName,
      sacn_universe: this.config.universe,
      wifi_ssid: this.config.wifiSsid,
    };
  }

  updateConfig(update: ConfigUpdate): { success: boolean; message?: string; error?: string; rebootRequired: boolean } {
    let rebootRequired = false;
    const errors: string[] = [];

    if (update.device_name !== undefined) {
      if (update.device_name.length < 1 || update.device_name.length > 32) {
        errors.push('Device name must be 1-32 characters');
      } else if (!/^[a-zA-Z0-9-]+$/.test(update.device_name)) {
        errors.push('Device name must be alphanumeric with hyphens only');
      } else {
        this.config.deviceName = update.device_name;
        rebootRequired = true;
      }
    }

    if (update.sacn_universe !== undefined) {
      if (update.sacn_universe < 1 || update.sacn_universe > 63999) {
        errors.push('Universe must be 1-63999');
      } else {
        this.config.universe = update.sacn_universe;
        rebootRequired = true;
      }
    }

    if (update.wifi_ssid !== undefined) {
      if (update.wifi_ssid.length < 1 || update.wifi_ssid.length > 32) {
        errors.push('WiFi SSID must be 1-32 characters');
      } else {
        this.config.wifiSsid = update.wifi_ssid;
        rebootRequired = true;
      }
    }

    if (update.wifi_password !== undefined) {
      if (update.wifi_password.length < 8 || update.wifi_password.length > 63) {
        errors.push('WiFi password must be 8-63 characters');
      } else {
        this.config.wifiPassword = update.wifi_password;
        rebootRequired = true;
      }
    }

    if (errors.length > 0) {
      return { success: false, error: errors.join('. '), rebootRequired: false };
    }

    return {
      success: true,
      message: rebootRequired
        ? 'Configuration updated. Reboot required for changes to take effect.'
        : 'Configuration updated.',
      rebootRequired,
    };
  }

  async reboot(reason: SimulatorState['lastRebootReason'] = 'software'): Promise<void> {
    this.stopBackgroundTasks();

    // Simulate reboot delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    this.startTime = Date.now();
    this.state.rebootCount++;
    this.state.lastRebootReason = reason;
    this.state.wifiConnected = true;
    this.state.sacnReceiving = false;
    this.state.sacnSourceIp = null;
    this.state.sacnSourceName = null;
    this.state.lastPacketTime = null;
    this.state.packetsReceived = 0;
    this.state.packetsErrors = 0;
    this.state.dmxFps = 0;
    this.state.freeHeap = 180000;
    this.state.minFreeHeap = 165000;
    this.state.ledState = 'LED_CONNECTED';
    this.state.isIdentifying = false;
    this.state.identifyEndTime = null;

    this.startBackgroundTasks();
  }

  identify(durationSeconds: number = 5): { duration: number } {
    const duration = Math.max(1, Math.min(30, durationSeconds));
    this.state.isIdentifying = true;
    this.state.identifyEndTime = Date.now() + duration * 1000;
    this.state.ledState = 'LED_IDENTIFY';
    return { duration };
  }

  getFirmwareInfo(): FirmwareInfo {
    return {
      current_version: this.firmwareVersion,
      rollback_available: this.previousFirmwareVersion !== null,
      update_confirmed: true,
      partition_scheme: 'ota_0 (active), ota_1 (previous)',
    };
  }

  async uploadFirmware(): Promise<{ success: boolean; previousVersion: string }> {
    const previousVersion = this.firmwareVersion;
    this.previousFirmwareVersion = previousVersion;

    // Simulate version bump
    const parts = this.firmwareVersion.split('.');
    parts[2] = String(parseInt(parts[2], 10) + 1);
    this.firmwareVersion = parts.join('.');

    // Reboot after firmware update
    await this.reboot('software');

    return { success: true, previousVersion };
  }

  async rollbackFirmware(): Promise<{ success: boolean; error?: string }> {
    if (!this.previousFirmwareVersion) {
      return { success: false, error: 'No previous firmware available for rollback' };
    }

    this.firmwareVersion = this.previousFirmwareVersion;
    this.previousFirmwareVersion = null;

    await this.reboot('software');

    return { success: true };
  }

  getMdnsInfo(): { name: string; type: string; port: number; txt: Record<string, string> } {
    return {
      name: this.config.deviceName,
      type: 'sacn-dmx',
      port: this.port,
      txt: {
        universe: String(this.config.universe),
        mac: this.mac,
        version: this.firmwareVersion,
      },
    };
  }

  getPort(): number {
    return this.port;
  }

  getName(): string {
    return this.config.deviceName;
  }

  getUniverse(): number {
    return this.config.universe;
  }

  getLedState(): LEDState {
    return this.state.ledState;
  }

  isReceivingSacn(): boolean {
    return this.state.sacnReceiving;
  }

  destroy(): void {
    this.stopBackgroundTasks();
  }
}
