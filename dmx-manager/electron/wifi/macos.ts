import { exec } from 'child_process'
import { promisify } from 'util'
import { WifiNetwork, WifiService, getSignalQuality } from './index'

const execAsync = promisify(exec)

// Swift code to scan WiFi networks using CoreWLAN framework
// Compatible with macOS 10.13+ (High Sierra and later)
const SWIFT_SCAN_CODE = `
import Foundation
import CoreWLAN

guard let client = CWWiFiClient.shared().interface() else {
    print("[]")
    exit(0)
}

do {
    let networks = try client.scanForNetworks(withSSID: nil)
    var result: [[String: Any]] = []

    for network in networks {
        let net: [String: Any] = [
            "ssid": network.ssid ?? "",
            "bssid": network.bssid ?? "",
            "rssi": network.rssiValue,
            "channel": network.wlanChannel?.channelNumber ?? 0
        ]
        result.append(net)
    }

    let jsonData = try JSONSerialization.data(withJSONObject: result, options: [])
    if let jsonString = String(data: jsonData, encoding: .utf8) {
        print(jsonString)
    }
} catch {
    print("[]")
}
`

export class MacOSWifiService implements WifiService {
  private interface: string = 'en0'

  async scan(): Promise<WifiNetwork[]> {
    try {
      // Use Swift with CoreWLAN to perform an active WiFi scan
      // This works on all macOS versions including Sonoma+
      const { stdout } = await execAsync(`swift -e '${SWIFT_SCAN_CODE}'`, {
        timeout: 30000 // 30 second timeout for scan
      })
      return this.parseSwiftScanOutput(stdout)
    } catch (error) {
      console.error('[WiFi macOS] CoreWLAN scan failed:', error)
      // Fallback to system_profiler (passive, may not show all networks)
      try {
        const { stdout } = await execAsync('system_profiler SPAirPortDataType -json')
        return this.parseSystemProfilerOutput(stdout)
      } catch (fallbackError) {
        console.error('[WiFi macOS] System profiler fallback also failed:', fallbackError)
        return []
      }
    }
  }

  private parseSwiftScanOutput(output: string): WifiNetwork[] {
    try {
      const networks: WifiNetwork[] = []
      const data = JSON.parse(output.trim())

      for (const net of data) {
        if (!net.ssid) continue

        const rssi = net.rssi || -70
        const channel = net.channel || 0

        networks.push({
          ssid: net.ssid,
          bssid: net.bssid || '',
          signalStrength: rssi,
          signalQuality: getSignalQuality(rssi),
          security: net.security || 'unknown',
          channel,
          frequency: channel <= 14 ? 2400 : 5000
        })
      }

      return networks
    } catch (error) {
      console.error('[WiFi macOS] Failed to parse Swift scan output:', error)
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

  async getStoredPassword(ssid: string): Promise<string | null> {
    try {
      // Use the security command to retrieve WiFi password from Keychain
      // This will prompt the user for permission (Touch ID or password) on first access
      const { stdout } = await execAsync(
        `security find-generic-password -wa "${ssid}"`,
        { timeout: 30000 } // Allow time for user authentication
      )
      return stdout.trim() || null
    } catch (error) {
      // Error usually means password not found or user denied access
      console.error('[WiFi macOS] Get stored password failed:', error)
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
