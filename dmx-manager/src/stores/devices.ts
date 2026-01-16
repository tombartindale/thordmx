import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Device, DeviceStatus } from '../api/types'
import { createDeviceClient } from '../api/client'

declare global {
  interface Window {
    electronAPI?: {
      discovery: {
        start: () => Promise<{ success: boolean }>
        stop: () => Promise<{ success: boolean }>
        refresh: () => Promise<{ success: boolean }>
        getDevices: () => Promise<Device[]>
        onDeviceFound: (callback: (device: Device) => void) => void
        onDeviceRemoved: (callback: (deviceId: string) => void) => void
      }
    }
  }
}

export const useDevicesStore = defineStore('devices', () => {
  const devices = ref<Map<string, Device>>(new Map())
  const deviceStatuses = ref<Map<string, DeviceStatus>>(new Map())
  const selectedDeviceIds = ref<Set<string>>(new Set())
  const isDiscovering = ref(false)
  const statusPollingInterval = ref<number | null>(null)

  // Computed properties
  const deviceList = computed(() => Array.from(devices.value.values()))
  const onlineDevices = computed(() => deviceList.value.filter(d => d.isOnline))
  const offlineDevices = computed(() => deviceList.value.filter(d => !d.isOnline))
  const selectedDevices = computed(() =>
    deviceList.value.filter(d => selectedDeviceIds.value.has(d.id))
  )

  // Actions
  function addDevice(device: Device) {
    devices.value.set(device.id, device)
  }

  function removeDevice(deviceId: string) {
    devices.value.delete(deviceId)
    deviceStatuses.value.delete(deviceId)
    selectedDeviceIds.value.delete(deviceId)
  }

  function updateDevice(deviceId: string, updates: Partial<Device>) {
    const device = devices.value.get(deviceId)
    if (device) {
      devices.value.set(deviceId, { ...device, ...updates })
    }
  }

  function setDeviceStatus(deviceId: string, status: DeviceStatus) {
    deviceStatuses.value.set(deviceId, status)
  }

  function toggleDeviceSelection(deviceId: string) {
    if (selectedDeviceIds.value.has(deviceId)) {
      selectedDeviceIds.value.delete(deviceId)
    } else {
      selectedDeviceIds.value.add(deviceId)
    }
  }

  function selectAll() {
    deviceList.value.forEach(d => selectedDeviceIds.value.add(d.id))
  }

  function selectNone() {
    selectedDeviceIds.value.clear()
  }

  async function startDiscovery() {
    if (window.electronAPI) {
      // Electron environment - use native mDNS
      window.electronAPI.discovery.onDeviceFound((device) => {
        addDevice(device)
      })
      window.electronAPI.discovery.onDeviceRemoved((deviceId) => {
        updateDevice(deviceId, { isOnline: false })
      })
      await window.electronAPI.discovery.start()
      isDiscovering.value = true
    } else {
      // Browser environment - no mDNS support
      console.warn('mDNS discovery not available in browser mode')
    }
  }

  async function stopDiscovery() {
    if (window.electronAPI) {
      await window.electronAPI.discovery.stop()
    }
    isDiscovering.value = false
  }

  async function refreshDiscovery() {
    if (window.electronAPI) {
      await window.electronAPI.discovery.refresh()
    }
  }

  async function fetchDeviceStatus(device: Device): Promise<DeviceStatus | null> {
    try {
      const client = createDeviceClient(device)
      const status = await client.getStatus()
      setDeviceStatus(device.id, status)
      updateDevice(device.id, { isOnline: true, lastSeen: new Date() })
      return status
    } catch (error) {
      updateDevice(device.id, { isOnline: false })
      return null
    }
  }

  async function fetchAllStatuses() {
    const promises = onlineDevices.value.map(device => fetchDeviceStatus(device))
    await Promise.allSettled(promises)
  }

  function startStatusPolling(intervalMs: number = 5000) {
    stopStatusPolling()
    statusPollingInterval.value = window.setInterval(() => {
      fetchAllStatuses()
    }, intervalMs)
  }

  function stopStatusPolling() {
    if (statusPollingInterval.value) {
      clearInterval(statusPollingInterval.value)
      statusPollingInterval.value = null
    }
  }

  function addManualDevice(ip: string, name: string) {
    const device: Device = {
      id: `manual-${ip}`,
      name,
      hostname: ip,
      ip,
      port: 80,
      mac: '',
      firmwareVersion: 'unknown',
      universe: 1,
      discoveredAt: new Date(),
      lastSeen: new Date(),
      isOnline: true,
      isManual: true
    }
    addDevice(device)
    fetchDeviceStatus(device)
    return device
  }

  return {
    // State
    devices,
    deviceStatuses,
    selectedDeviceIds,
    isDiscovering,

    // Computed
    deviceList,
    onlineDevices,
    offlineDevices,
    selectedDevices,

    // Actions
    addDevice,
    removeDevice,
    updateDevice,
    setDeviceStatus,
    toggleDeviceSelection,
    selectAll,
    selectNone,
    startDiscovery,
    stopDiscovery,
    refreshDiscovery,
    fetchDeviceStatus,
    fetchAllStatuses,
    startStatusPolling,
    stopStatusPolling,
    addManualDevice
  }
})
