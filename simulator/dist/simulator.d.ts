import { SimulatedDevice } from './simulated-device.js';
import type { SimulatedDeviceConfig, FaultInjection, SimulatorOptions } from './types.js';
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
export declare class DmxReceiverSimulator {
    private devices;
    private servers;
    private mdns;
    private options;
    private nextPort;
    private isRunning;
    constructor(options?: SimulatorOptions);
    /**
     * Load a predefined test scenario
     */
    loadScenario(scenarioId: string): Promise<void>;
    /**
     * Load a custom scenario
     */
    loadCustomScenario(deviceCount: number, options?: {
        namePrefix?: string;
        startUniverse?: number;
        faultInjection?: FaultInjection;
    }): Promise<void>;
    /**
     * Apply a scenario configuration
     */
    private applyScenario;
    /**
     * Add a single simulated device
     */
    addDevice(config: SimulatedDeviceConfig): Promise<string>;
    /**
     * Remove a simulated device
     */
    removeDevice(deviceId: string): Promise<void>;
    /**
     * Get information about all devices
     */
    getDevices(): DeviceInfo[];
    /**
     * Get a specific device by ID
     */
    getDevice(deviceId: string): SimulatedDevice | undefined;
    /**
     * Set fault injection on a specific device
     */
    setDeviceFault(deviceId: string, faults: FaultInjection): void;
    /**
     * Clear fault injection on a specific device
     */
    clearDeviceFault(deviceId: string): void;
    /**
     * Set fault injection on all devices
     */
    setGlobalFault(faults: FaultInjection): void;
    /**
     * Clear fault injection on all devices
     */
    clearGlobalFault(): void;
    /**
     * Simulate sACN signal loss on a device
     */
    simulateSignalLoss(deviceId: string): void;
    /**
     * Restore sACN signal on a device
     */
    restoreSignal(deviceId: string): void;
    /**
     * Simulate network failure (device goes offline)
     */
    simulateNetworkFailure(deviceId: string): void;
    /**
     * Restore network on a device
     */
    restoreNetwork(deviceId: string): void;
    /**
     * List available scenarios
     */
    listScenarios(): Array<{
        id: string;
        name: string;
        description: string;
        deviceCount: number;
    }>;
    /**
     * Stop all devices and clean up
     */
    stop(): Promise<void>;
    /**
     * Destroy the simulator completely
     */
    destroy(): void;
    /**
     * Check if simulator is running
     */
    isSimulatorRunning(): boolean;
    /**
     * Get device count
     */
    getDeviceCount(): number;
    private log;
}
export { scenarios, createCustomScenario, listScenarios } from './scenarios.js';
export { SimulatedDevice } from './simulated-device.js';
export type * from './types.js';
