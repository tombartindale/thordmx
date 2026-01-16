import { exec } from 'child_process'
import { promisify } from 'util'
import { WifiNetwork, WifiService, getSignalQuality } from './index'

const execAsync = promisify(exec)

export class MacOSWifiService implements WifiService {
  private interface: string = 'en0'

  async scan(): Promise<WifiNetwork[]> {
    try {
      // Use airport utility to scan for networks
      const { stdout } = await execAsync(
        '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -s'
      )

      return this.parseAirportOutput(stdout)
    } catch (error) {
      console.error('[WiFi macOS] Scan failed:', error)
      return []
    }
  }

  async getCurrentNetwork(): Promise<string | null> {
    try {
      const { stdout } = await execAsync(
        '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I'
      )

      const match = stdout.match(/\s+SSID:\s+(.+)/)
      return match ? match[1].trim() : null
    } catch (error) {
      console.error('[WiFi macOS] Get current network failed:', error)
      return null
    }
  }

  async connect(ssid: string, password?: string): Promise<boolean> {
    try {
      // Use networksetup to connect to WiFi
      const cmd = password
        ? `networksetup -setairportnetwork ${this.interface} "${ssid}" "${password}"`
        : `networksetup -setairportnetwork ${this.interface} "${ssid}"`

      await execAsync(cmd)

      // Verify connection
      await new Promise(resolve => setTimeout(resolve, 3000))
      const currentNetwork = await this.getCurrentNetwork()
      return currentNetwork === ssid
    } catch (error) {
      console.error('[WiFi macOS] Connect failed:', error)
      return false
    }
  }

  async disconnect(): Promise<boolean> {
    try {
      await execAsync(`networksetup -setairportpower ${this.interface} off`)
      await new Promise(resolve => setTimeout(resolve, 1000))
      await execAsync(`networksetup -setairportpower ${this.interface} on`)
      return true
    } catch (error) {
      console.error('[WiFi macOS] Disconnect failed:', error)
      return false
    }
  }

  private parseAirportOutput(output: string): WifiNetwork[] {
    const lines = output.trim().split('\n')
    if (lines.length < 2) return []

    // Skip header line
    const networks: WifiNetwork[] = []

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      // airport output format: SSID BSSID RSSI CHANNEL HT CC SECURITY
      // Fields are space-separated but SSID can have spaces (left-padded to 32 chars)
      const parts = line.trim().split(/\s+/)

      if (parts.length >= 7) {
        // Work backwards from known fixed-width fields
        const security = parts.slice(-1)[0]
        const cc = parts.slice(-2)[0]
        const ht = parts.slice(-3)[0]
        const channel = parseInt(parts.slice(-4)[0]) || 0
        const rssi = parseInt(parts.slice(-5)[0]) || -100
        const bssid = parts.slice(-6)[0]
        const ssid = parts.slice(0, -6).join(' ').trim()

        if (ssid && bssid) {
          networks.push({
            ssid,
            bssid,
            signalStrength: rssi,
            signalQuality: getSignalQuality(rssi),
            security,
            channel,
            frequency: channel <= 14 ? 2400 : 5000
          })
        }
      }
    }

    return networks
  }
}
