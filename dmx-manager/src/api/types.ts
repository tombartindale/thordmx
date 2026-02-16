// Device types
export interface Device {
  id: string
  name: string
  hostname: string
  ip: string
  port: number
  mac: string
  firmwareVersion: string
  universe: number
  discoveredAt: Date
  lastSeen: Date
  isOnline: boolean
  isManual: boolean
}

export interface DeviceStatus {
  device_name: string
  firmware_version: string
  wifi_connected: boolean
  wifi_ssid: string
  wifi_rssi: number
  wifi_signal_quality: 'excellent' | 'good' | 'fair' | 'poor'
  ip_address: string
  mac_address: string
  sacn_universe: number
  dmx_start_channel: number
  sacn_packets_received: number
  sacn_packets_errors: number
  sacn_source_ip?: string
  sacn_source_name?: string
  sacn_priority?: number
  last_packet_ms_ago?: number
  dmx_fps: number
  uptime_seconds: number
  free_heap_bytes: number
  min_free_heap_bytes: number
  reboot_count: number
  last_reboot_reason: string
}

export interface DeviceConfig {
  device_name: string
  sacn_universe: number
  dmx_start_channel: number
  wifi_ssid: string
}

export interface ConfigUpdate {
  device_name?: string
  sacn_universe?: number
  dmx_start_channel?: number
  wifi_ssid?: string
  wifi_password?: string
}

export interface FirmwareInfo {
  current_version: string
  rollback_available: boolean
  update_confirmed: boolean
  partition_scheme?: string
}

export interface ApiResponse {
  success: boolean
  message?: string
  error?: string
  reboot_required?: boolean
}

// Batch operation types
export interface BatchOperation {
  id: string
  type: 'config' | 'firmware' | 'reboot' | 'identify'
  devices: Device[]
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  results: BatchResult[]
  startedAt: Date
  completedAt?: Date
}

export interface BatchResult {
  device: Device
  success: boolean
  error?: string
  duration: number
}
