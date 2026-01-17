import { EventEmitter } from 'events'
import { platform } from 'os'

export interface WifiNetwork {
  ssid: string
  bssid: string
  signalStrength: number
  signalQuality: 'excellent' | 'good' | 'fair' | 'poor'
  security: string
  channel: number
  frequency: number
}

export interface WifiService {
  scan(): Promise<WifiNetwork[]>
  getCurrentNetwork(): Promise<string | null>
  getStoredPassword(ssid: string): Promise<string | null>
  connect(ssid: string, password?: string): Promise<boolean>
  disconnect(): Promise<boolean>
}

// Signal quality thresholds (dBm)
export function getSignalQuality(rssi: number): 'excellent' | 'good' | 'fair' | 'poor' {
  if (rssi >= -50) return 'excellent'
  if (rssi >= -60) return 'good'
  if (rssi >= -70) return 'fair'
  return 'poor'
}

// Factory function to get platform-specific implementation
export async function createWifiService(): Promise<WifiService> {
  const os = platform()

  switch (os) {
    case 'darwin':
      const { MacOSWifiService } = await import('./macos')
      return new MacOSWifiService()
    case 'win32':
      const { WindowsWifiService } = await import('./windows')
      return new WindowsWifiService()
    case 'linux':
      const { LinuxWifiService } = await import('./linux')
      return new LinuxWifiService()
    default:
      throw new Error(`Unsupported platform: ${os}`)
  }
}

export class WifiProvisioningService extends EventEmitter {
  private wifiService: WifiService | null = null
  private originalNetwork: string | null = null

  async initialize(): Promise<void> {
    this.wifiService = await createWifiService()
    this.originalNetwork = await this.wifiService.getCurrentNetwork()
    console.log(`[WiFi] Initialized. Current network: ${this.originalNetwork}`)
  }

  async getCurrentNetworkCredentials(): Promise<{ ssid: string; password: string } | null> {
    if (!this.wifiService) throw new Error('WiFi service not initialized')

    const ssid = await this.wifiService.getCurrentNetwork()
    if (!ssid) return null

    const password = await this.wifiService.getStoredPassword(ssid)
    if (!password) return null

    return { ssid, password }
  }

  async scanNetworks(pattern?: string): Promise<WifiNetwork[]> {
    if (!this.wifiService) throw new Error('WiFi service not initialized')

    const networks = await this.wifiService.scan()

    if (!pattern) return networks

    // Filter by pattern (glob or regex)
    const regex = this.patternToRegex(pattern)
    return networks.filter(n => regex.test(n.ssid))
  }

  async connectToDeviceAP(ssid: string): Promise<boolean> {
    if (!this.wifiService) throw new Error('WiFi service not initialized')

    // Store current network for later reconnection
    this.originalNetwork = await this.wifiService.getCurrentNetwork()

    console.log(`[WiFi] Connecting to device AP: ${ssid}`)
    this.emit('connecting', { ssid })

    const success = await this.wifiService.connect(ssid) // No password for device APs

    if (success) {
      console.log(`[WiFi] Connected to ${ssid}`)
      this.emit('connected', { ssid })
    } else {
      console.error(`[WiFi] Failed to connect to ${ssid}`)
      this.emit('connection-failed', { ssid })
    }

    return success
  }

  async reconnectToOriginalNetwork(): Promise<boolean> {
    if (!this.wifiService) throw new Error('WiFi service not initialized')

    if (!this.originalNetwork) {
      console.log('[WiFi] No original network to reconnect to')
      return true
    }

    console.log(`[WiFi] Reconnecting to original network: ${this.originalNetwork}`)
    this.emit('reconnecting', { ssid: this.originalNetwork })

    // Most systems will auto-reconnect to known networks
    // Just disconnect from current and wait
    await this.wifiService.disconnect()

    // Wait for auto-reconnection
    await this.waitForNetwork(this.originalNetwork, 30000)

    const currentNetwork = await this.wifiService.getCurrentNetwork()
    return currentNetwork === this.originalNetwork
  }

  async connectToTargetNetwork(ssid: string, password: string): Promise<boolean> {
    if (!this.wifiService) throw new Error('WiFi service not initialized')

    console.log(`[WiFi] Connecting to target network: ${ssid}`)
    this.emit('connecting', { ssid })

    const success = await this.wifiService.connect(ssid, password)

    if (success) {
      console.log(`[WiFi] Connected to ${ssid}`)
      this.originalNetwork = ssid
      this.emit('connected', { ssid })
    } else {
      console.error(`[WiFi] Failed to connect to ${ssid}`)
      this.emit('connection-failed', { ssid })
    }

    return success
  }

  private async waitForNetwork(ssid: string, timeout: number): Promise<boolean> {
    const startTime = Date.now()
    const pollInterval = 1000

    while (Date.now() - startTime < timeout) {
      const currentNetwork = await this.wifiService?.getCurrentNetwork()
      if (currentNetwork === ssid) return true
      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }

    return false
  }

  private patternToRegex(pattern: string): RegExp {
    // Check if it's already a regex pattern
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      return new RegExp(pattern.slice(1, -1))
    }

    // Convert glob pattern to regex
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')

    return new RegExp(`^${escaped}$`, 'i')
  }
}
