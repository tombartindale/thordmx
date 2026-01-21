import { exec } from 'child_process'
import { promisify } from 'util'
import { WifiNetwork, WifiService, getSignalQuality } from './index'

const execAsync = promisify(exec)

// Swift code to scan WiFi networks using CoreWLAN
// Note: Scanning does NOT require location permissions - only getting the current SSID does
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
      // Use CoreWLAN to perform an active WiFi scan
      // This returns real SSIDs without requiring location permissions
      const { stdout } = await execAsync(`swift -e '${SWIFT_SCAN_CODE}'`, {
        timeout: 30000
      })
      return this.parseSwiftScanOutput(stdout)
    } catch (error) {
      console.error('[WiFi macOS] CoreWLAN scan failed:', error)
      return []
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
          security: 'unknown',
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
    // On modern macOS, we can't reliably get the current SSID without location permissions
    // Return null and let the UI fall back to getKnownNetworks()
    console.log('[WiFi macOS] getCurrentNetwork not available without location permissions')
    return null
  }

  async getStoredPassword(ssid: string): Promise<string | null> {
    // Escape double quotes in SSID for shell safety
    const escapedSsid = ssid.replace(/"/g, '\\"')

    // First, try the direct security command. This will work if:
    // 1. The app has been previously granted keychain access, or
    // 2. macOS shows a keychain access dialog that the user approves
    // The -w flag outputs just the password to stdout
    try {
      const { stdout } = await execAsync(
        `security find-generic-password -D "AirPort network password" -a "${escapedSsid}" -w`,
        { timeout: 30000 }
      )
      const password = stdout.trim()
      if (password) {
        console.log('[WiFi macOS] Password retrieved successfully')
        return password
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.log('[WiFi macOS] Account lookup failed, trying label lookup...', errorMsg)
    }

    // Try alternate lookup - sometimes the SSID is stored as the "label" (-l) instead of "account" (-a)
    try {
      const { stdout: stdout2 } = await execAsync(
        `security find-generic-password -D "AirPort network password" -l "${escapedSsid}" -w`,
        { timeout: 30000 }
      )
      const password = stdout2.trim()
      if (password) {
        console.log('[WiFi macOS] Password retrieved successfully (label lookup)')
        return password
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.log('[WiFi macOS] Label lookup also failed:', errorMsg)
    }

    // If direct access fails, try via osascript with System Events
    // This runs the command in a context that may have different keychain access
    console.log('[WiFi macOS] Trying via System Events AppleScript...')
    try {
      const script = `
tell application "System Events"
    set keychainPassword to do shell script "security find-generic-password -D 'AirPort network password' -a '${escapedSsid.replace(/'/g, "'\\''")}' -w 2>/dev/null || security find-generic-password -D 'AirPort network password' -l '${escapedSsid.replace(/'/g, "'\\''")}' -w 2>/dev/null || echo ''"
    return keychainPassword
end tell`
      const { stdout: stdout3 } = await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
        timeout: 30000
      })
      const password = stdout3.trim()
      if (password) {
        console.log('[WiFi macOS] Password retrieved via System Events')
        return password
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error('[WiFi macOS] System Events approach failed:', errorMsg)
    }

    console.error('[WiFi macOS] All password retrieval methods failed')
    return null
  }

  /**
   * Get list of known WiFi network SSIDs from the System keychain.
   * This doesn't require location permissions - just lists the SSIDs that have
   * stored passwords (no passwords are returned, just the network names).
   */
  async getKnownNetworks(): Promise<string[]> {
    try {
      // Dump the System keychain and extract SSIDs for AirPort network passwords
      // This works without any special permissions - we're just reading the account names
      const { stdout } = await execAsync(
        `security dump-keychain /Library/Keychains/System.keychain 2>/dev/null | grep -B5 'AirPort network password' | grep '"acct"' | sed 's/.*<blob>="\\([^"]*\\)".*/\\1/' | sort -u`,
        { timeout: 10000 }
      )
      const ssids = stdout.trim().split('\n').filter(s => s.length > 0)
      console.log(`[WiFi macOS] Found ${ssids.length} known networks in keychain`)
      return ssids
    } catch (error) {
      console.error('[WiFi macOS] Failed to get known networks:', error)
      return []
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

      // Verify connection by checking if we have an IP
      try {
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
        console.log('[WiFi macOS] Could not verify IP')
      }

      // If we got here and have no errors, assume success
      console.log('[WiFi macOS] Cannot verify connection, assuming success')
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
}
