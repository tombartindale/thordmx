import { contextBridge, ipcRenderer } from 'electron'

export interface WifiNetwork {
  ssid: string
  bssid: string
  signalStrength: number
  signalQuality: 'excellent' | 'good' | 'fair' | 'poor'
  security: string
  channel: number
  frequency: number
}

export interface SerialDeviceInfo {
  path: string
  vendorId?: string
  productId?: string
  manufacturer?: string
  serialNumber?: string
}

export interface SerialDeviceStatus {
  device_name: string
  firmware_version: string
  wifi_connected: boolean
  wifi_ssid: string
  mac_address: string
  sacn_universe: number
}

export interface SerialProvisioningResult {
  path: string
  success: boolean
  deviceName?: string
  macAddress?: string
  error?: string
}

export interface ElectronAPI {
  discovery: {
    start: () => Promise<{ success: boolean }>
    stop: () => Promise<{ success: boolean }>
    refresh: () => Promise<{ success: boolean }>
    getDevices: () => Promise<any[]>
    removeDevice: (deviceId: string) => Promise<{ success: boolean }>
    clearOffline: () => Promise<{ success: boolean; count: number }>
    addManual: (ip: string, name: string, port?: number) => Promise<{ success: boolean; device?: any }>
    onDeviceFound: (callback: (device: any) => void) => void
    onDeviceRemoved: (callback: (deviceId: string) => void) => void
  }
  wifi: {
    initialize: () => Promise<{ success: boolean; error?: string }>
    scan: (pattern?: string) => Promise<{ success: boolean; networks?: WifiNetwork[]; error?: string }>
    getCurrentCredentials: () => Promise<{ success: boolean; credentials?: { ssid: string; password: string | null } | null; error?: string }>
    getKnownNetworks: () => Promise<{ success: boolean; networks?: string[]; error?: string }>
    getPasswordForNetwork: (ssid: string) => Promise<{ success: boolean; password?: string | null; error?: string }>
    connectDeviceAP: (ssid: string) => Promise<{ success: boolean; error?: string }>
    connectTarget: (ssid: string, password: string) => Promise<{ success: boolean; error?: string }>
    reconnectOriginal: () => Promise<{ success: boolean; error?: string }>
    checkLocationAuthorization: () => Promise<{ success: boolean; authorized: boolean; status: number; error?: string }>
    onConnecting: (callback: (data: { ssid: string }) => void) => void
    onConnected: (callback: (data: { ssid: string }) => void) => void
    onConnectionFailed: (callback: (data: { ssid: string }) => void) => void
    onReconnecting: (callback: (data: { ssid: string }) => void) => void
  }
  serial: {
    initialize: () => Promise<{ success: boolean; error?: string }>
    listDevices: () => Promise<{ success: boolean; devices?: SerialDeviceInfo[]; error?: string }>
    getDeviceStatus: (portPath: string) => Promise<{ success: boolean; status?: SerialDeviceStatus; error?: string }>
    provision: (portPath: string, config: {
      device_name: string
      wifi_ssid: string
      wifi_password: string
      sacn_universe: number
    }) => Promise<SerialProvisioningResult>
    startWatching: (config?: {
      deviceNameTemplate: string
      startingNumber: number
      wifi_ssid: string
      wifi_password: string
      sacn_universe: number
    }) => Promise<{ success: boolean; error?: string }>
    stopWatching: () => Promise<{ success: boolean; error?: string }>
    onDeviceConnected: (callback: (data: SerialDeviceInfo) => void) => void
    onDeviceDisconnected: (callback: (data: { path: string }) => void) => void
    onProvisioningStarted: (callback: (data: { path: string; deviceName: string }) => void) => void
    onProvisioningCompleted: (callback: (data: SerialProvisioningResult) => void) => void
    onProvisioningFailed: (callback: (data: SerialProvisioningResult) => void) => void
  }
}

contextBridge.exposeInMainWorld('electronAPI', {
  discovery: {
    start: () => ipcRenderer.invoke('discovery:start'),
    stop: () => ipcRenderer.invoke('discovery:stop'),
    refresh: () => ipcRenderer.invoke('discovery:refresh'),
    getDevices: () => ipcRenderer.invoke('discovery:get-devices'),
    removeDevice: (deviceId: string) => ipcRenderer.invoke('discovery:remove-device', deviceId),
    clearOffline: () => ipcRenderer.invoke('discovery:clear-offline'),
    addManual: (ip: string, name: string, port?: number) => ipcRenderer.invoke('discovery:add-manual', ip, name, port),
    onDeviceFound: (callback: (device: any) => void) => {
      ipcRenderer.on('device-found', (_event, device) => callback(device))
    },
    onDeviceRemoved: (callback: (deviceId: string) => void) => {
      ipcRenderer.on('device-removed', (_event, deviceId) => callback(deviceId))
    }
  },
  wifi: {
    initialize: () => ipcRenderer.invoke('wifi:initialize'),
    scan: (pattern?: string) => ipcRenderer.invoke('wifi:scan', pattern),
    getCurrentCredentials: () => ipcRenderer.invoke('wifi:get-current-credentials'),
    getKnownNetworks: () => ipcRenderer.invoke('wifi:get-known-networks'),
    getPasswordForNetwork: (ssid: string) => ipcRenderer.invoke('wifi:get-password-for-network', ssid),
    connectDeviceAP: (ssid: string) => ipcRenderer.invoke('wifi:connect-device-ap', ssid),
    connectTarget: (ssid: string, password: string) => ipcRenderer.invoke('wifi:connect-target', ssid, password),
    reconnectOriginal: () => ipcRenderer.invoke('wifi:reconnect-original'),
    checkLocationAuthorization: () => ipcRenderer.invoke('wifi:check-location-authorization'),
    onConnecting: (callback: (data: { ssid: string }) => void) => {
      ipcRenderer.on('wifi:connecting', (_event, data) => callback(data))
    },
    onConnected: (callback: (data: { ssid: string }) => void) => {
      ipcRenderer.on('wifi:connected', (_event, data) => callback(data))
    },
    onConnectionFailed: (callback: (data: { ssid: string }) => void) => {
      ipcRenderer.on('wifi:connection-failed', (_event, data) => callback(data))
    },
    onReconnecting: (callback: (data: { ssid: string }) => void) => {
      ipcRenderer.on('wifi:reconnecting', (_event, data) => callback(data))
    }
  },
  serial: {
    initialize: () => ipcRenderer.invoke('serial:initialize'),
    listDevices: () => ipcRenderer.invoke('serial:list-devices'),
    getDeviceStatus: (portPath: string) => ipcRenderer.invoke('serial:get-device-status', portPath),
    provision: (portPath: string, config: {
      device_name: string
      wifi_ssid: string
      wifi_password: string
      sacn_universe: number
    }) => ipcRenderer.invoke('serial:provision', portPath, config),
    startWatching: (config?: {
      deviceNameTemplate: string
      startingNumber: number
      wifi_ssid: string
      wifi_password: string
      sacn_universe: number
    }) => ipcRenderer.invoke('serial:start-watching', config),
    stopWatching: () => ipcRenderer.invoke('serial:stop-watching'),
    onDeviceConnected: (callback: (data: any) => void) => {
      ipcRenderer.on('serial:device-connected', (_event, data) => callback(data))
    },
    onDeviceDisconnected: (callback: (data: { path: string }) => void) => {
      ipcRenderer.on('serial:device-disconnected', (_event, data) => callback(data))
    },
    onProvisioningStarted: (callback: (data: { path: string; deviceName: string }) => void) => {
      ipcRenderer.on('serial:provisioning-started', (_event, data) => callback(data))
    },
    onProvisioningCompleted: (callback: (data: any) => void) => {
      ipcRenderer.on('serial:provisioning-completed', (_event, data) => callback(data))
    },
    onProvisioningFailed: (callback: (data: any) => void) => {
      ipcRenderer.on('serial:provisioning-failed', (_event, data) => callback(data))
    }
  }
})
