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
    onDeviceFound: (callback: (device: any) => void) => void
    onDeviceRemoved: (callback: (deviceId: string) => void) => void
  }
  wifi: {
    initialize: () => Promise<{ success: boolean; error?: string }>
    scan: (pattern?: string) => Promise<{ success: boolean; networks?: WifiNetwork[]; error?: string }>
    connectDeviceAP: (ssid: string) => Promise<{ success: boolean; error?: string }>
    connectTarget: (ssid: string, password: string) => Promise<{ success: boolean; error?: string }>
    reconnectOriginal: () => Promise<{ success: boolean; error?: string }>
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
    connectDeviceAP: (ssid: string) => ipcRenderer.invoke('wifi:connect-device-ap', ssid),
    connectTarget: (ssid: string, password: string) => ipcRenderer.invoke('wifi:connect-target', ssid, password),
    reconnectOriginal: () => ipcRenderer.invoke('wifi:reconnect-original'),
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
