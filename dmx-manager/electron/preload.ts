import { contextBridge, ipcRenderer } from 'electron'

export interface ElectronAPI {
  discovery: {
    start: () => Promise<{ success: boolean }>
    stop: () => Promise<{ success: boolean }>
    refresh: () => Promise<{ success: boolean }>
    getDevices: () => Promise<any[]>
    onDeviceFound: (callback: (device: any) => void) => void
    onDeviceRemoved: (callback: (deviceId: string) => void) => void
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
  }
})
