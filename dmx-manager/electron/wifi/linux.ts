import { exec } from 'child_process'
import { promisify } from 'util'
import { WifiNetwork, WifiService, getSignalQuality } from './index'

const execAsync = promisify(exec)

export class LinuxWifiService implements WifiService {
  private useNmcli: boolean = true

  async scan(): Promise<WifiNetwork[]> {
    try {
      // Try nmcli first (NetworkManager)
      const { stdout } = await execAsync(
        'nmcli -t -f SSID,BSSID,SIGNAL,CHAN,SECURITY device wifi list --rescan yes'
      )
      return this.parseNmcliOutput(stdout)
    } catch (error) {
      // Fallback to iwlist
      try {
        const { stdout } = await execAsync('sudo iwlist wlan0 scan')
        return this.parseIwlistOutput(stdout)
      } catch (iwError) {
        console.error('[WiFi Linux] Scan failed:', error, iwError)
        return []
      }
    }
  }

  async getCurrentNetwork(): Promise<string | null> {
    try {
      // Try nmcli
      const { stdout } = await execAsync(
        'nmcli -t -f active,ssid dev wifi | grep "^yes"'
      )
      const parts = stdout.trim().split(':')
      return parts[1] || null
    } catch (error) {
      // Fallback to iwgetid
      try {
        const { stdout } = await execAsync('iwgetid -r')
        return stdout.trim() || null
      } catch (iwError) {
        console.error('[WiFi Linux] Get current network failed:', error)
        return null
      }
    }
  }

  async getStoredPassword(ssid: string): Promise<string | null> {
    try {
      // Use nmcli to get stored password (requires root or appropriate permissions)
      const { stdout } = await execAsync(
        `nmcli -s -g 802-11-wireless-security.psk connection show "${ssid}"`
      )
      return stdout.trim() || null
    } catch (error) {
      console.error('[WiFi Linux] Get stored password failed:', error)
      return null
    }
  }

  async connect(ssid: string, password?: string): Promise<boolean> {
    try {
      if (password) {
        // Connect with password using nmcli
        await execAsync(`nmcli device wifi connect "${ssid}" password "${password}"`)
      } else {
        // Connect to open network
        await execAsync(`nmcli device wifi connect "${ssid}"`)
      }

      // Verify connection
      await new Promise(resolve => setTimeout(resolve, 5000))
      const currentNetwork = await this.getCurrentNetwork()
      return currentNetwork === ssid
    } catch (error) {
      console.error('[WiFi Linux] Connect failed:', error)
      return false
    }
  }

  async disconnect(): Promise<boolean> {
    try {
      // Get current WiFi device
      const { stdout: devices } = await execAsync('nmcli -t -f DEVICE,TYPE dev | grep wifi')
      const device = devices.split(':')[0]?.trim()

      if (device) {
        await execAsync(`nmcli device disconnect ${device}`)
      }
      return true
    } catch (error) {
      console.error('[WiFi Linux] Disconnect failed:', error)
      return false
    }
  }

  private parseNmcliOutput(output: string): WifiNetwork[] {
    const networks: WifiNetwork[] = []
    const lines = output.trim().split('\n')

    for (const line of lines) {
      if (!line.trim()) continue

      // Format: SSID:BSSID:SIGNAL:CHAN:SECURITY
      const parts = line.split(':')
      if (parts.length >= 5) {
        const ssid = parts[0]
        const bssid = parts[1]
        const signalPercent = parseInt(parts[2]) || 0
        const channel = parseInt(parts[3]) || 0
        const security = parts[4] || 'Open'

        if (ssid) {
          // Convert percentage to approximate dBm
          const rssi = Math.round((signalPercent / 2) - 100)

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

  private parseIwlistOutput(output: string): WifiNetwork[] {
    const networks: WifiNetwork[] = []
    const cells = output.split(/Cell \d+ - /)

    for (const cell of cells.slice(1)) {
      const addressMatch = cell.match(/Address:\s*([A-Fa-f0-9:]+)/)
      const ssidMatch = cell.match(/ESSID:"([^"]*)"/)
      const channelMatch = cell.match(/Channel:(\d+)/)
      const signalMatch = cell.match(/Signal level[=:](-?\d+)\s*dBm/)
      const qualityMatch = cell.match(/Quality[=:](\d+)\/(\d+)/)
      const encryptionMatch = cell.match(/Encryption key:(on|off)/)

      if (ssidMatch && addressMatch) {
        let rssi = -100
        if (signalMatch) {
          rssi = parseInt(signalMatch[1])
        } else if (qualityMatch) {
          const quality = parseInt(qualityMatch[1]) / parseInt(qualityMatch[2])
          rssi = Math.round(quality * 60 - 100)
        }

        const channel = channelMatch ? parseInt(channelMatch[1]) : 0

        networks.push({
          ssid: ssidMatch[1],
          bssid: addressMatch[1],
          signalStrength: rssi,
          signalQuality: getSignalQuality(rssi),
          security: encryptionMatch?.[1] === 'on' ? 'Encrypted' : 'Open',
          channel,
          frequency: channel <= 14 ? 2400 : 5000
        })
      }
    }

    return networks
  }
}
