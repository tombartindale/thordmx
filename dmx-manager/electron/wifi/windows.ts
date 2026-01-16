import { exec } from 'child_process'
import { promisify } from 'util'
import { WifiNetwork, WifiService, getSignalQuality } from './index'

const execAsync = promisify(exec)

export class WindowsWifiService implements WifiService {
  async scan(): Promise<WifiNetwork[]> {
    try {
      // Use netsh to scan for networks
      const { stdout } = await execAsync('netsh wlan show networks mode=bssid', {
        encoding: 'utf8'
      })

      return this.parseNetshOutput(stdout)
    } catch (error) {
      console.error('[WiFi Windows] Scan failed:', error)
      return []
    }
  }

  async getCurrentNetwork(): Promise<string | null> {
    try {
      const { stdout } = await execAsync('netsh wlan show interfaces', {
        encoding: 'utf8'
      })

      const match = stdout.match(/^\s*SSID\s*:\s*(.+)$/m)
      return match ? match[1].trim() : null
    } catch (error) {
      console.error('[WiFi Windows] Get current network failed:', error)
      return null
    }
  }

  async connect(ssid: string, password?: string): Promise<boolean> {
    try {
      if (password) {
        // Create a temporary profile for networks with passwords
        const profileXml = this.createProfileXml(ssid, password)
        const tempFile = `${process.env.TEMP}\\wifi_profile_${Date.now()}.xml`

        // Write profile to temp file
        const fs = await import('fs/promises')
        await fs.writeFile(tempFile, profileXml, 'utf8')

        // Add profile and connect
        await execAsync(`netsh wlan add profile filename="${tempFile}"`)
        await execAsync(`netsh wlan connect name="${ssid}"`)

        // Clean up temp file
        await fs.unlink(tempFile).catch(() => {})
      } else {
        // For open networks, just connect directly
        await execAsync(`netsh wlan connect name="${ssid}"`)
      }

      // Verify connection
      await new Promise(resolve => setTimeout(resolve, 5000))
      const currentNetwork = await this.getCurrentNetwork()
      return currentNetwork === ssid
    } catch (error) {
      console.error('[WiFi Windows] Connect failed:', error)
      return false
    }
  }

  async disconnect(): Promise<boolean> {
    try {
      await execAsync('netsh wlan disconnect')
      return true
    } catch (error) {
      console.error('[WiFi Windows] Disconnect failed:', error)
      return false
    }
  }

  private parseNetshOutput(output: string): WifiNetwork[] {
    const networks: WifiNetwork[] = []
    const blocks = output.split(/\nSSID \d+ :/).slice(1)

    for (const block of blocks) {
      const lines = block.split('\n')
      const ssid = lines[0]?.trim() || ''

      if (!ssid) continue

      // Parse BSSID entries (there can be multiple for same SSID)
      const bssidMatches = block.matchAll(/BSSID \d+\s*:\s*([a-f0-9:]+)/gi)
      const signalMatches = block.matchAll(/Signal\s*:\s*(\d+)%/gi)
      const channelMatches = block.matchAll(/Channel\s*:\s*(\d+)/gi)
      const authMatches = block.matchAll(/Authentication\s*:\s*(.+)/gi)

      const bssids = [...bssidMatches].map(m => m[1])
      const signals = [...signalMatches].map(m => parseInt(m[1]))
      const channels = [...channelMatches].map(m => parseInt(m[1]))
      const auths = [...authMatches].map(m => m[1].trim())

      // Use first BSSID entry
      if (bssids.length > 0) {
        const signalPercent = signals[0] || 0
        // Convert percentage to approximate dBm
        const rssi = Math.round((signalPercent / 2) - 100)
        const channel = channels[0] || 0

        networks.push({
          ssid,
          bssid: bssids[0],
          signalStrength: rssi,
          signalQuality: getSignalQuality(rssi),
          security: auths[0] || 'Open',
          channel,
          frequency: channel <= 14 ? 2400 : 5000
        })
      }
    }

    return networks
  }

  private createProfileXml(ssid: string, password: string): string {
    return `<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
  <name>${this.escapeXml(ssid)}</name>
  <SSIDConfig>
    <SSID>
      <name>${this.escapeXml(ssid)}</name>
    </SSID>
  </SSIDConfig>
  <connectionType>ESS</connectionType>
  <connectionMode>auto</connectionMode>
  <MSM>
    <security>
      <authEncryption>
        <authentication>WPA2PSK</authentication>
        <encryption>AES</encryption>
        <useOneX>false</useOneX>
      </authEncryption>
      <sharedKey>
        <keyType>passPhrase</keyType>
        <protected>false</protected>
        <keyMaterial>${this.escapeXml(password)}</keyMaterial>
      </sharedKey>
    </security>
  </MSM>
</WLANProfile>`
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }
}
