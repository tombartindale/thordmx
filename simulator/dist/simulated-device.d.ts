import type { DeviceStatus, DeviceConfig, ConfigUpdate, FirmwareInfo, SimulatedDeviceConfig, SimulatorState, FaultInjection, LEDState } from './types.js';
export declare class SimulatedDevice {
    readonly id: string;
    readonly mac: string;
    private config;
    private state;
    private firmwareVersion;
    private previousFirmwareVersion;
    private startTime;
    private port;
    private faultInjection;
    private sacnSimulationInterval;
    private heapDecayInterval;
    constructor(deviceConfig: SimulatedDeviceConfig, port: number);
    private startBackgroundTasks;
    private stopBackgroundTasks;
    setFaultInjection(faults: FaultInjection): void;
    clearFaultInjection(): void;
    getFaultInjection(): FaultInjection;
    shouldDropRequest(): boolean;
    getResponseDelay(): number;
    shouldRandomReboot(): boolean;
    isNetworkTimeout(): boolean;
    getStatus(): DeviceStatus;
    getConfig(): DeviceConfig;
    updateConfig(update: ConfigUpdate): {
        success: boolean;
        message?: string;
        error?: string;
        rebootRequired: boolean;
    };
    reboot(reason?: SimulatorState['lastRebootReason']): Promise<void>;
    identify(durationSeconds?: number): {
        duration: number;
    };
    getFirmwareInfo(): FirmwareInfo;
    uploadFirmware(): Promise<{
        success: boolean;
        previousVersion: string;
    }>;
    rollbackFirmware(): Promise<{
        success: boolean;
        error?: string;
    }>;
    getMdnsInfo(): {
        name: string;
        type: string;
        port: number;
        txt: Record<string, string>;
    };
    getPort(): number;
    getName(): string;
    getUniverse(): number;
    getLedState(): LEDState;
    isReceivingSacn(): boolean;
    destroy(): void;
}
