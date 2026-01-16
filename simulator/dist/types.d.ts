export interface DeviceStatus {
    device_name: string;
    firmware_version: string;
    wifi_connected: boolean;
    wifi_ssid: string;
    wifi_rssi: number;
    wifi_signal_quality: 'excellent' | 'good' | 'fair' | 'poor';
    ip_address: string;
    mac_address: string;
    sacn_universe: number;
    sacn_packets_received: number;
    sacn_packets_errors: number;
    sacn_source_ip?: string;
    sacn_source_name?: string;
    sacn_priority?: number;
    last_packet_ms_ago?: number;
    dmx_fps: number;
    uptime_seconds: number;
    free_heap_bytes: number;
    min_free_heap_bytes: number;
    reboot_count: number;
    last_reboot_reason: 'power_on' | 'software' | 'watchdog' | 'crash' | 'brownout';
}
export interface DeviceConfig {
    device_name: string;
    sacn_universe: number;
    wifi_ssid: string;
}
export interface ConfigUpdate {
    device_name?: string;
    sacn_universe?: number;
    wifi_ssid?: string;
    wifi_password?: string;
}
export interface ApiResponse {
    success: boolean;
    message?: string;
    error?: string;
    reboot_required?: boolean;
}
export interface FirmwareInfo {
    current_version: string;
    rollback_available: boolean;
    update_confirmed: boolean;
    partition_scheme: string;
}
export interface IdentifyResponse extends ApiResponse {
    duration_seconds: number;
}
export type LEDState = 'LED_OFF' | 'LED_AP_MODE' | 'LED_CONNECTING' | 'LED_CONNECTED' | 'LED_ERROR' | 'LED_SMARTCONFIG' | 'LED_IDENTIFY';
export interface TestScenario {
    name: string;
    description: string;
    deviceConfigs: SimulatedDeviceConfig[];
    faultInjection?: FaultInjection;
}
export interface SimulatedDeviceConfig {
    name: string;
    mac?: string;
    universe?: number;
    port?: number;
    firmwareVersion?: string;
    initialState?: Partial<SimulatorState>;
}
export interface SimulatorState {
    wifiConnected: boolean;
    sacnReceiving: boolean;
    sacnSourceIp: string | null;
    sacnSourceName: string | null;
    sacnPriority: number;
    lastPacketTime: number | null;
    packetsReceived: number;
    packetsErrors: number;
    dmxFps: number;
    freeHeap: number;
    minFreeHeap: number;
    rebootCount: number;
    lastRebootReason: DeviceStatus['last_reboot_reason'];
    ledState: LEDState;
    isIdentifying: boolean;
    identifyEndTime: number | null;
}
export interface FaultInjection {
    dropPacketRate?: number;
    responseDelay?: number;
    networkTimeout?: boolean;
    sacnSignalLoss?: boolean;
    sacnPacketErrors?: number;
    randomReboot?: number;
    heapExhaustion?: boolean;
    watchdogTrigger?: boolean;
}
export interface SimulatorOptions {
    basePort?: number;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    enableMdns?: boolean;
    sacnSimulation?: boolean;
}
