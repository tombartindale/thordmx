import { exec } from 'child_process'
import { promisify } from 'util'
import { WifiNetwork, WifiService, getSignalQuality } from './index'

const execAsync = promisify(exec)

export class MacOSWifiService implements WifiService {
  private interface: string = 'en0'

  async scan(): Promise<WifiNetwork[]> {
    try {
      // Use system_profiler to get available networks (works on macOS Sonoma+)
      // This requires triggering a scan first via networksetup
      const { stdout } = await execAsync(
        'system_profiler SPAirPortDataType -json'
      )

      return this.parseSystemProfilerOutput(stdout)
    } catch (error) {
      console.error('[WiFi macOS] Scan failed:', error)
      // Fallback: try using wdutil if available (requires sudo, so likely won't work)
      return []
    }
  }

  async getCurrentNetwork(): Promise<string | null> {
    try {
      // Use networksetup to get current network - works on all macOS versions
      const { stdout } = await execAsync(
        `networksetup -getairportnetwork ${this.interface}`
      )

      // Output format: "Current Wi-Fi Network: NetworkName" or "You are not associated with an AirPort network."
      const match = stdout.match(/Current Wi-Fi Network:\s*(.+)/)
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

  private parseSystemProfilerOutput(jsonOutput: string): WifiNetwork[] {
    try {
      const data = JSON.parse(jsonOutput)
      const networks: WifiNetwork[] = []

      // Navigate to SPAirPortDataType
      const airportData = data.SPAirPortDataType
      if (!airportData || !Array.isArray(airportData)) {
        return networks
      }

      for (const iface of airportData) {
        // Look for "Other Local Wi-Fi Networks" or similar
        const otherNetworks = iface.spairport_airport_other_local_wireless_networks
        if (Array.isArray(otherNetworks)) {
          for (const net of otherNetworks) {
            const ssid = net._name || net.spairport_network_name
            if (ssid) {
              const rssi = net.spairport_signal_noise ? parseInt(net.spairport_signal_noise) : -70
              const channel = net.spairport_network_channel ? parseInt(net.spairport_network_channel) : 0

              networks.push({
                ssid,
                bssid: net.spairport_network_bssid || '',
                signalStrength: rssi,
                signalQuality: getSignalQuality(rssi),
                security: net.spairport_security_mode || 'unknown',
                channel,
                frequency: channel <= 14 ? 2400 : 5000
              })
            }
          }
        }

        // Also check current network info
        const currentNetwork = iface.spairport_current_network_information
        if (currentNetwork) {
          const ssid = currentNetwork._name
          if (ssid) {
            const rssi = currentNetwork.spairport_signal_noise ? parseInt(currentNetwork.spairport_signal_noise) : -50
            const channel = currentNetwork.spairport_network_channel ? parseInt(currentNetwork.spairport_network_channel) : 0

            // Add current network if not already in list
            if (!networks.find(n => n.ssid === ssid)) {
              networks.push({
                ssid,
                bssid: currentNetwork.spairport_network_bssid || '',
                signalStrength: rssi,
                signalQuality: getSignalQuality(rssi),
                security: currentNetwork.spairport_security_mode || 'unknown',
                channel,
                frequency: channel <= 14 ? 2400 : 5000
              })
            }
          }
        }
      }

      return networks
    } catch (error) {
      console.error('[WiFi macOS] Failed to parse system_profiler output:', error)
      return []
    }
  }
}
