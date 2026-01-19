import { exec } from 'child_process'
import { promisify } from 'util'
import { WifiNetwork, WifiService, getSignalQuality } from './index'

const execAsync = promisify(exec)

// Swift code to check and request location authorization
// This is required on macOS 10.15+ for WiFi SSID access
const SWIFT_CHECK_LOCATION_AUTH = `
import Foundation
import CoreLocation

class LocationDelegate: NSObject, CLLocationManagerDelegate {
    var authStatus: CLAuthorizationStatus = .notDetermined
    let semaphore = DispatchSemaphore(value: 0)

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        authStatus = manager.authorizationStatus
        semaphore.signal()
    }

    func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        authStatus = status
        semaphore.signal()
    }
}

let manager = CLLocationManager()
let delegate = LocationDelegate()
manager.delegate = delegate

let currentStatus = manager.authorizationStatus

if currentStatus == .notDetermined {
    manager.requestWhenInUseAuthorization()
    _ = delegate.semaphore.wait(timeout: .now() + 5)
    print(delegate.authStatus.rawValue)
} else {
    print(currentStatus.rawValue)
}
`

// Swift code to scan WiFi networks using CoreWLAN framework with CoreLocation
// Compatible with macOS 10.15+ (Catalina and later)
const SWIFT_SCAN_CODE = `
import Foundation
import CoreWLAN
import CoreLocation

// First ensure we have location authorization
let locationManager = CLLocationManager()
let status = locationManager.authorizationStatus

// Status: 0=notDetermined, 1=restricted, 2=denied, 3=authorizedAlways, 4=authorizedWhenInUse
if status == .denied || status == .restricted {
    print("{\\"error\\": \\"location_denied\\", \\"status\\": \\(status.rawValue)}")
    exit(1)
}

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

// Swift code to get current SSID with CoreLocation check
const SWIFT_GET_CURRENT_SSID = `
import Foundation
import CoreWLAN
import CoreLocation

// Check location authorization first
let locationManager = CLLocationManager()
let status = locationManager.authorizationStatus

if status == .denied || status == .restricted {
    fputs("location_denied:\\(status.rawValue)", stderr)
    print("")
    exit(0)
}

if status == .notDetermined {
    fputs("location_not_determined", stderr)
    print("")
    exit(0)
}

if let iface = CWWiFiClient.shared().interface(), let ssid = iface.ssid() {
    print(ssid)
} else {
    print("")
}
`

export class MacOSWifiService implements WifiService {
  private interface: string = 'en0'
  private locationAuthorized: boolean = false

  /**
   * Check and request location authorization
   * Returns the authorization status:
   * 0 = notDetermined, 1 = restricted, 2 = denied, 3 = authorizedAlways, 4 = authorizedWhenInUse
   */
  async checkLocationAuthorization(): Promise<number> {
    try {
      const { stdout } = await execAsync(`swift -e '${SWIFT_CHECK_LOCATION_AUTH}'`, {
        timeout: 10000
      })
      const status = parseInt(stdout.trim(), 10)
      console.log(`[WiFi macOS] Location authorization status: ${status}`)
      this.locationAuthorized = status === 3 || status === 4 // authorizedAlways or authorizedWhenInUse
      return status
    } catch (error) {
      console.error('[WiFi macOS] Failed to check location authorization:', error)
      return 0
    }
  }

  async scan(): Promise<WifiNetwork[]> {
    // Ensure location is authorized first
    if (!this.locationAuthorized) {
      await this.checkLocationAuthorization()
    }

    try {
      // Use Swift with CoreWLAN to perform an active WiFi scan
      // This works on all macOS versions including Sonoma+
      const { stdout } = await execAsync(`swift -e '${SWIFT_SCAN_CODE}'`, {
        timeout: 30000 // 30 second timeout for scan
      })

      // Check for location error
      if (stdout.includes('location_denied')) {
        console.error('[WiFi macOS] Location access denied - cannot scan WiFi networks')
        return []
      }

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
    // Ensure location is authorized first
    if (!this.locationAuthorized) {
      const status = await this.checkLocationAuthorization()
      if (status === 2 || status === 1) {
        console.error('[WiFi macOS] Location access denied/restricted - cannot get current SSID')
        // Fall through to try networksetup anyway
      }
    }

    // Try CoreWLAN with CoreLocation first (works best on modern macOS)
    try {
      const { stdout, stderr } = await execAsync(`swift -e '${SWIFT_GET_CURRENT_SSID}'`, { timeout: 10000 })

      // Check for location issues in stderr
      if (stderr && stderr.includes('location_denied')) {
        console.log('[WiFi macOS] Location denied, falling back to networksetup...')
      } else if (stderr && stderr.includes('location_not_determined')) {
        console.log('[WiFi macOS] Location not determined, requesting authorization...')
        await this.checkLocationAuthorization()
      } else {
        const ssid = stdout.trim()
        if (ssid) {
          console.log(`[WiFi macOS] Current network (CoreWLAN): ${ssid}`)
          return ssid
        }
      }
    } catch (error) {
      console.log('[WiFi macOS] CoreWLAN getCurrentNetwork failed, trying networksetup...')
    }

    // Fallback to networksetup
    try {
      const { stdout } = await execAsync(
        `networksetup -getairportnetwork ${this.interface}`
      )

      // Output format: "Current Wi-Fi Network: NetworkName" or "You are not associated with an AirPort network."
      const match = stdout.match(/Current Wi-Fi Network:\s*(.+)/)
      const ssid = match ? match[1].trim() : null
      console.log(`[WiFi macOS] Current network (networksetup): ${ssid}`)
      return ssid
    } catch (error) {
      console.error('[WiFi macOS] Get current network failed:', error)
      return null
    }
  }

  async getStoredPassword(ssid: string): Promise<string | null> {
    try {
      // Use the security command to retrieve WiFi password from System keychain
      // WiFi passwords are stored with kind "AirPort network password"
      // The -a flag specifies the account name (SSID), -w outputs just the password
      // This will prompt the user for permission (Touch ID or password) on first access
      const { stdout } = await execAsync(
        `security find-generic-password -D "AirPort network password" -a "${ssid}" -w`,
        { timeout: 30000 } // Allow time for user authentication
      )
      return stdout.trim() || null
    } catch {
      // Try alternate lookup - sometimes the SSID is stored as the "label" (-l) instead of "account" (-a)
      try {
        const { stdout: stdout2 } = await execAsync(
          `security find-generic-password -D "AirPort network password" -l "${ssid}" -w`,
          { timeout: 30000 }
        )
        return stdout2.trim() || null
      } catch (error) {
        // Error usually means password not found or user denied access
        console.error('[WiFi macOS] Get stored password failed:', error)
        return null
      }
    }
  }

  async connect(ssid: string, password?: string): Promise<boolean> {
    try {
      // Use networksetup to connect to WiFi
      const cmd = password
        ? `networksetup -setairportnetwork ${this.interface} "${ssid}" "${password}"`
        : `networksetup -setairportnetwork ${this.interface} "${ssid}"`

      console.log(`[WiFi macOS] Connecting to: ${ssid}`)
      const { stderr } = await execAsync(cmd, { timeout: 30000 })

      // networksetup returns an error message if connection fails
      // Success usually returns empty or the network name
      if (stderr && stderr.includes('Error')) {
        console.error(`[WiFi macOS] Connection error: ${stderr}`)
        return false
      }

      // Wait for connection to establish
      await new Promise(resolve => setTimeout(resolve, 3000))

      // Try to verify connection, but don't fail if we can't check SSID
      // (location permission may prevent SSID access even if connected)
      try {
        // Use a simple connectivity check instead of SSID verification
        // Try to ping the default gateway or check if we have an IP
        const { stdout: ipOutput } = await execAsync(
          `ipconfig getifaddr ${this.interface}`,
          { timeout: 5000 }
        )
        const hasIp = ipOutput.trim().length > 0
        console.log(`[WiFi macOS] Connected, IP: ${ipOutput.trim() || 'none'}`)

        if (hasIp) {
          // For device APs (no password), verify we can reach 192.168.4.1
          if (!password) {
            try {
              await execAsync('ping -c 1 -W 2000 192.168.4.1', { timeout: 5000 })
              console.log('[WiFi macOS] Device AP reachable at 192.168.4.1')
              return true
            } catch {
              console.log('[WiFi macOS] Cannot ping 192.168.4.1, but have IP - assuming connected')
              return true
            }
          }
          return true
        }
      } catch (e) {
        console.log('[WiFi macOS] Could not verify IP, checking SSID...')
      }

      // Fallback to SSID check
      const currentNetwork = await this.getCurrentNetwork()
      if (currentNetwork === ssid) {
        return true
      }

      // If we got here and have no errors, assume success
      // (the connection command succeeded, we just can't verify the SSID)
      console.log('[WiFi macOS] Cannot verify SSID, assuming connection succeeded')
      return true
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
