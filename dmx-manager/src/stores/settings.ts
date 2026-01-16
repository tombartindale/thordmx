import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export interface AppSettings {
  // Discovery
  discoveryEnabled: boolean
  discoveryInterval: number

  // Status
  statusPollInterval: number
  pollOnlyVisible: boolean

  // Updates
  maxConcurrentUpdates: number
  updateRetryCount: number
  updateRetryDelay: number

  // UI
  theme: 'dark' | 'light' | 'system'
  showOfflineDevices: boolean
  confirmDestructiveActions: boolean

  // Notifications
  notifyDeviceOffline: boolean
  notifyUpdateComplete: boolean
}

const defaultSettings: AppSettings = {
  discoveryEnabled: true,
  discoveryInterval: 5000,
  statusPollInterval: 5000,
  pollOnlyVisible: true,
  maxConcurrentUpdates: 3,
  updateRetryCount: 3,
  updateRetryDelay: 1000,
  theme: 'dark',
  showOfflineDevices: true,
  confirmDestructiveActions: true,
  notifyDeviceOffline: true,
  notifyUpdateComplete: true
}

export const useSettingsStore = defineStore('settings', () => {
  // Load settings from localStorage
  const loadSettings = (): AppSettings => {
    try {
      const stored = localStorage.getItem('dmx-manager-settings')
      if (stored) {
        return { ...defaultSettings, ...JSON.parse(stored) }
      }
    } catch (e) {
      console.warn('Failed to load settings from localStorage')
    }
    return defaultSettings
  }

  const settings = ref<AppSettings>(loadSettings())

  // Save settings to localStorage when they change
  watch(settings, (newSettings) => {
    try {
      localStorage.setItem('dmx-manager-settings', JSON.stringify(newSettings))
    } catch (e) {
      console.warn('Failed to save settings to localStorage')
    }
  }, { deep: true })

  function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    settings.value[key] = value
  }

  function resetSettings() {
    settings.value = { ...defaultSettings }
  }

  return {
    settings,
    updateSetting,
    resetSettings
  }
})
