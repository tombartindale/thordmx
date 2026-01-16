import { SimulatedDevice } from './simulated-device.js';
import { DeviceServer } from './device-server.js';
import { MdnsAdvertiser } from './mdns-advertiser.js';
import { scenarios, createCustomScenario, listScenarios } from './scenarios.js';
import type {
  TestScenario,
  SimulatedDeviceConfig,
  FaultInjection,
  SimulatorOptions,
} from './types.js';

export interface DeviceInfo {
  id: string;
  name: string;
  mac: string;
  port: number;
  universe: number;
  isReceivingSacn: boolean;
  ledState: string;
  faults: FaultInjection;
}

export class DmxReceiverSimulator {
  private devices: Map<string, SimulatedDevice> = new Map();
  private servers: Map<string, DeviceServer> = new Map();
  private mdns: MdnsAdvertiser;
  private options: Required<SimulatorOptions>;
  private nextPort: number;
  private isRunning = false;

  constructor(options: SimulatorOptions = {}) {
    this.options = {
      basePort: options.basePort ?? 8080,
      logLevel: options.logLevel ?? 'info',
      enableMdns: options.enableMdns ?? true,
      sacnSimulation: options.sacnSimulation ?? true,
    };
    this.nextPort = this.options.basePort;
    this.mdns = new MdnsAdvertiser();
  }

  /**
   * Load a predefined test scenario
   */
  async loadScenario(scenarioId: string): Promise<void> {
    const scenario = scenarios[scenarioId];
    if (!scenario) {
      throw new Error(`Unknown scenario: ${scenarioId}. Available: ${Object.keys(scenarios).join(', ')}`);
    }

    await this.applyScenario(scenario);
  }

  /**
   * Load a custom scenario
   */
  async loadCustomScenario(
    deviceCount: number,
    options?: { namePrefix?: string; startUniverse?: number; faultInjection?: FaultInjection }
  ): Promise<void> {
    const scenario = createCustomScenario(deviceCount, options);
    await this.applyScenario(scenario);
  }

  /**
   * Apply a scenario configuration
   */
  private async applyScenario(scenario: TestScenario): Promise<void> {
    // Stop any existing simulation
    await this.stop();

    this.log('info', `Loading scenario: ${scenario.name}`);
    this.log('info', `Description: ${scenario.description}`);

    // Create devices
    for (const config of scenario.deviceConfigs) {
      await this.addDevice(config);
    }

    // Apply fault injection to specific devices based on scenario
    if (scenario.faultInjection) {
      // For scenarios like 'mixed-health', apply faults to specific devices
      if (scenario.name === 'Mixed Health') {
        const deviceArray = Array.from(this.devices.values());
        // Signal Lost (device at index 2)
        deviceArray[2]?.setFaultInjection({ sacnSignalLoss: true });
        // Slow Response (device at index 3)
        deviceArray[3]?.setFaultInjection({ responseDelay: 2000 });
        // Flaky Network (device at index 4)
        deviceArray[4]?.setFaultInjection({ dropPacketRate: 0.3 });
      } else {
        // Apply faults to all devices
        for (const device of this.devices.values()) {
          device.setFaultInjection(scenario.faultInjection);
        }
      }
    }

    this.isRunning = true;
    this.log('info', `Scenario loaded with ${this.devices.size} devices`);
  }

  /**
   * Add a single simulated device
   */
  async addDevice(config: SimulatedDeviceConfig): Promise<string> {
    const port = config.port ?? this.nextPort++;
    const device = new SimulatedDevice(config, port);
    const server = new DeviceServer(device);

    await server.start();
    this.devices.set(device.id, device);
    this.servers.set(device.id, server);

    if (this.options.enableMdns) {
      this.mdns.advertise(device);
    }

    this.log('info', `Device ${device.getName()} started on port ${port} (MAC: ${device.mac})`);

    return device.id;
  }

  /**
   * Remove a simulated device
   */
  async removeDevice(deviceId: string): Promise<void> {
    const server = this.servers.get(deviceId);
    const device = this.devices.get(deviceId);

    if (server) {
      await server.stop();
      this.servers.delete(deviceId);
    }

    if (device) {
      this.mdns.unpublish(deviceId);
      device.destroy();
      this.devices.delete(deviceId);
      this.log('info', `Device ${device.getName()} removed`);
    }
  }

  /**
   * Get information about all devices
   */
  getDevices(): DeviceInfo[] {
    return Array.from(this.devices.values()).map(device => ({
      id: device.id,
      name: device.getName(),
      mac: device.mac,
      port: device.getPort(),
      universe: device.getUniverse(),
      isReceivingSacn: device.isReceivingSacn(),
      ledState: device.getLedState(),
      faults: device.getFaultInjection(),
    }));
  }

  /**
   * Get a specific device by ID
   */
  getDevice(deviceId: string): SimulatedDevice | undefined {
    return this.devices.get(deviceId);
  }

  /**
   * Set fault injection on a specific device
   */
  setDeviceFault(deviceId: string, faults: FaultInjection): void {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }
    device.setFaultInjection(faults);
    this.log('info', `Fault injection set on ${device.getName()}: ${JSON.stringify(faults)}`);
  }

  /**
   * Clear fault injection on a specific device
   */
  clearDeviceFault(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }
    device.clearFaultInjection();
    this.log('info', `Fault injection cleared on ${device.getName()}`);
  }

  /**
   * Set fault injection on all devices
   */
  setGlobalFault(faults: FaultInjection): void {
    for (const device of this.devices.values()) {
      device.setFaultInjection(faults);
    }
    this.log('info', `Global fault injection set: ${JSON.stringify(faults)}`);
  }

  /**
   * Clear fault injection on all devices
   */
  clearGlobalFault(): void {
    for (const device of this.devices.values()) {
      device.clearFaultInjection();
    }
    this.log('info', 'Global fault injection cleared');
  }

  /**
   * Simulate sACN signal loss on a device
   */
  simulateSignalLoss(deviceId: string): void {
    this.setDeviceFault(deviceId, { sacnSignalLoss: true });
  }

  /**
   * Restore sACN signal on a device
   */
  restoreSignal(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      const faults = device.getFaultInjection();
      delete faults.sacnSignalLoss;
      device.clearFaultInjection();
      if (Object.keys(faults).length > 0) {
        device.setFaultInjection(faults);
      }
    }
  }

  /**
   * Simulate network failure (device goes offline)
   */
  simulateNetworkFailure(deviceId: string): void {
    this.setDeviceFault(deviceId, { networkTimeout: true });
    // Also remove from mDNS
    this.mdns.unpublish(deviceId);
  }

  /**
   * Restore network on a device
   */
  restoreNetwork(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.clearFaultInjection();
      if (this.options.enableMdns) {
        this.mdns.advertise(device);
      }
    }
  }

  /**
   * List available scenarios
   */
  listScenarios(): Array<{ id: string; name: string; description: string; deviceCount: number }> {
    return listScenarios();
  }

  /**
   * Stop all devices and clean up
   */
  async stop(): Promise<void> {
    this.log('info', 'Stopping simulator...');

    // Stop all servers
    for (const server of this.servers.values()) {
      await server.stop();
    }
    this.servers.clear();

    // Destroy all devices
    for (const device of this.devices.values()) {
      device.destroy();
    }
    this.devices.clear();

    // Clear mDNS
    this.mdns.unpublishAll();

    // Reset port counter
    this.nextPort = this.options.basePort;
    this.isRunning = false;

    this.log('info', 'Simulator stopped');
  }

  /**
   * Destroy the simulator completely
   */
  destroy(): void {
    this.stop();
    this.mdns.destroy();
  }

  /**
   * Check if simulator is running
   */
  isSimulatorRunning(): boolean {
    return this.isRunning && this.devices.size > 0;
  }

  /**
   * Get device count
   */
  getDeviceCount(): number {
    return this.devices.size;
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    if (levels[level] >= levels[this.options.logLevel]) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    }
  }
}

// Export everything needed
export { scenarios, createCustomScenario, listScenarios } from './scenarios.js';
export { SimulatedDevice } from './simulated-device.js';
export type * from './types.js';
