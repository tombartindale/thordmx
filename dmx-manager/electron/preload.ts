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
    connectDeviceAP: (ssid: string) => Promise<{ success: boolean; error?: string }>
    connectTarget: (ssid: string, password: string) => Promise<{ success: boolean; error?: string }>
    reconnectOriginal: () => Promise<{ success: boolean; error?: string }>
    checkLocationAuthorization: () => Promise<{ success: boolean; authorized: boolean; status: number; error?: string }>
    onConnecting: (callback: (data: { ssid: string }) => void) => void
    onConnected: (callback: (data: { ssid: string }) => void) => void
    onConnectionFailed: (callback: (data: { ssid: string }) => void) => void
    onReconnecting: (callback: (data: { ssid: string }) => void) => void
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
  }
})
