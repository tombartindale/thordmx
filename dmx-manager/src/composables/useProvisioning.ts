import { ref, reactive, computed } from 'vue'
import { DeviceClient } from '@/api/client'
import type { Device } from '@/api/types'

export interface WifiNetwork {
  ssid: string
  bssid: string
  signalStrength: number
  signalQuality: 'excellent' | 'good' | 'fair' | 'poor'
  security: string
  channel: number
  frequency: number
}

export interface ProvisioningConfig {
  targetSsid: string
  targetPassword: string
  deviceNameTemplate: string
  startingNumber: number
  sacnUniverse: number
}

export type ProvisioningStepType =
  | 'idle'
  | 'scanning'
  | 'connecting_to_ap'
  | 'fetching_device_info'
  | 'sending_config'
  | 'waiting_for_reboot'
  | 'reconnecting'
  | 'verifying_device'
  | 'completed'
  | 'failed'

export interface ProvisioningResult {
  apSsid: string
  success: boolean
  assignedName?: string
  assignedUniverse?: number
  error?: string
  deviceIp?: string
}

export function useProvisioning() {
  const isInitialized = ref(false)
  const isScanning = ref(false)
  const isProvisioning = ref(false)
  const networks = ref<WifiNetwork[]>([])
  const selectedAPs = ref<string[]>([])
  const currentStep = ref<ProvisioningStepType>('idle')
  const currentDeviceIndex = ref(0)
  const currentDeviceSsid = ref('')
  const results = ref<ProvisioningResult[]>([])
  const error = ref<string | null>(null)

  const config = reactive<ProvisioningConfig>({
    targetSsid: '',
    targetPassword: '',
    deviceNameTemplate: 'DMX-Stage-{n}',
    startingNumber: 1,
    sacnUniverse: 1
  })

  const progress = computed(() => {
    if (selectedAPs.value.length === 0) return 0
    return Math.round((currentDeviceIndex.value / selectedAPs.value.length) * 100)
  })

  const completedCount = computed(() => results.value.filter(r => r.success).length)
  const failedCount = computed(() => results.value.filter(r => !r.success).length)

  // Check if we're in Electron
  const hasElectronAPI = computed(() => {
    return typeof window !== 'undefined' && 'electronAPI' in window
  })

  async function initialize(): Promise<boolean> {
    if (!hasElectronAPI.value) {
      error.value = 'WiFi provisioning requires the desktop application'
      return false
    }

    try {
      const result = await (window as any).electronAPI.wifi.initialize()
      if (result.success) {
        isInitialized.value = true
        setupEventListeners()
        return true
      } else {
        error.value = result.error || 'Failed to initialize WiFi service'
        return false
      }
    } catch (e) {
      error.value = (e as Error).message
      return false
    }
  }

  function setupEventListeners() {
    const api = (window as any).electronAPI.wifi

    api.onConnecting(({ ssid }: { ssid: string }) => {
      console.log(`[Provisioning] Connecting to ${ssid}`)
    })

    api.onConnected(({ ssid }: { ssid: string }) => {
      console.log(`[Provisioning] Connected to ${ssid}`)
    })

    api.onConnectionFailed(({ ssid }: { ssid: string }) => {
      console.log(`[Provisioning] Connection failed: ${ssid}`)
    })

    api.onReconnecting(({ ssid }: { ssid: string }) => {
      console.log(`[Provisioning] Reconnecting to ${ssid}`)
    })
  }

  async function scanNetworks(pattern?: string): Promise<WifiNetwork[]> {
    if (!hasElectronAPI.value) {
      error.value = 'WiFi scanning requires the desktop application'
      return []
    }

    isScanning.value = true
    error.value = null

    try {
      const result = await (window as any).electronAPI.wifi.scan(pattern)
      if (result.success && result.networks) {
        networks.value = result.networks
        return result.networks
      } else {
        error.value = result.error || 'Scan failed'
        return []
      }
    } catch (e) {
      error.value = (e as Error).message
      return []
    } finally {
      isScanning.value = false
    }
  }

  function toggleAPSelection(ssid: string) {
    const index = selectedAPs.value.indexOf(ssid)
    if (index === -1) {
      selectedAPs.value.push(ssid)
    } else {
      selectedAPs.value.splice(index, 1)
    }
  }

  function selectAllAPs() {
    selectedAPs.value = networks.value.map(n => n.ssid)
  }

  function deselectAllAPs() {
    selectedAPs.value = []
  }

  function generateDeviceName(index: number): string {
    return config.deviceNameTemplate.replace('{n}', String(config.startingNumber + index))
  }

  async function provisionDevice(apSsid: string, index: number): Promise<ProvisioningResult> {
    const api = (window as any).electronAPI.wifi
    const assignedName = generateDeviceName(index)

    try {
      // Step 1: Connect to device AP
      currentStep.value = 'connecting_to_ap'
      const connectResult = await api.connectDeviceAP(apSsid)
      if (!connectResult.success) {
        throw new Error(`Failed to connect to ${apSsid}`)
      }

      // Wait for connection to stabilize
      await sleep(2000)

      // Create client for device at AP mode IP
      const apDevice: Device = {
        id: apSsid,
        name: apSsid,
        hostname: '192.168.4.1',
        ip: '192.168.4.1',
        port: 80,
        mac: '',
        firmwareVersion: 'unknown',
        universe: 1,
        discoveredAt: new Date(),
        lastSeen: new Date(),
        isOnline: true,
        isManual: true
      }
      const client = new DeviceClient(apDevice)

      // Step 2: Fetch device info from 192.168.4.1
      currentStep.value = 'fetching_device_info'
      try {
        await client.getStatus()
      } catch (e) {
        console.warn('[Provisioning] Could not fetch device info, continuing anyway')
      }

      // Step 3: Send configuration
      currentStep.value = 'sending_config'
      await client.setConfig({
        deviceName: assignedName,
        sacnUniverse: config.sacnUniverse,
        wifiSsid: config.targetSsid,
        wifiPassword: config.targetPassword
      })

      // Step 4: Wait for device to reboot
      currentStep.value = 'waiting_for_reboot'
      await sleep(5000)

      // Step 5: Reconnect to target network
      currentStep.value = 'reconnecting'
      const reconnectResult = await api.connectTarget(config.targetSsid, config.targetPassword)
      if (!reconnectResult.success) {
        // Try reconnecting to original network
        await api.reconnectOriginal()
        throw new Error('Failed to connect to target network')
      }

      // Wait for network connection
      await sleep(3000)

      // Step 6: Verify device is online (optional - might take time for mDNS)
      currentStep.value = 'verifying_device'
      // We could try to discover the device here via mDNS, but it may take a while
      // For now, we'll consider it successful if we got this far

      return {
        apSsid,
        success: true,
        assignedName,
        assignedUniverse: config.sacnUniverse
      }
    } catch (e) {
      const errorMsg = (e as Error).message
      console.error(`[Provisioning] Failed to provision ${apSsid}:`, errorMsg)

      // Try to reconnect to original network
      try {
        await api.reconnectOriginal()
      } catch {
        // Ignore reconnection errors
      }

      return {
        apSsid,
        success: false,
        error: errorMsg
      }
    }
  }

  async function startProvisioning(): Promise<ProvisioningResult[]> {
    if (selectedAPs.value.length === 0) {
      error.value = 'No devices selected'
      return []
    }

    if (!config.targetSsid || !config.targetPassword) {
      error.value = 'Target WiFi credentials required'
      return []
    }

    isProvisioning.value = true
    currentDeviceIndex.value = 0
    results.value = []
    error.value = null

    for (let i = 0; i < selectedAPs.value.length; i++) {
      const apSsid = selectedAPs.value[i]
      currentDeviceIndex.value = i
      currentDeviceSsid.value = apSsid

      const result = await provisionDevice(apSsid, i)
      results.value.push(result)

      // Small delay between devices
      if (i < selectedAPs.value.length - 1) {
        await sleep(2000)
      }
    }

    currentDeviceIndex.value = selectedAPs.value.length
    currentStep.value = 'completed'
    isProvisioning.value = false

    return results.value
  }

  function cancelProvisioning() {
    isProvisioning.value = false
    currentStep.value = 'idle'
  }

  function reset() {
    isProvisioning.value = false
    currentStep.value = 'idle'
    currentDeviceIndex.value = 0
    currentDeviceSsid.value = ''
    results.value = []
    selectedAPs.value = []
    error.value = null
  }

  function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  return {
    // State
    isInitialized,
    isScanning,
    isProvisioning,
    networks,
    selectedAPs,
    currentStep,
    currentDeviceIndex,
    currentDeviceSsid,
    results,
    error,
    config,
    hasElectronAPI,

    // Computed
    progress,
    completedCount,
    failedCount,

    // Actions
    initialize,
    scanNetworks,
    toggleAPSelection,
    selectAllAPs,
    deselectAllAPs,
    startProvisioning,
    cancelProvisioning,
    reset
  }
}
