import { EventEmitter } from 'events'
import { Bonjour, Service } from 'bonjour-service'
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

export interface DiscoveredDevice {
  id: string
  name: string
  hostname: string
  ip: string
  port: number
  mac: string
  firmwareVersion: string
  universe: number
  discoveredAt: Date
  lastSeen: Date
  isOnline: boolean
  isManual: boolean
}

interface StoredDevice {
  id: string
  name: string
  hostname: string
  ip: string
  port: number
  mac: string
  firmwareVersion: string
  universe: number
  discoveredAt: string
  lastSeen: string
  isManual: boolean
}

export class DiscoveryService extends EventEmitter {
  private bonjour: InstanceType<typeof Bonjour> | null = null
  private browser: any = null
  private devices: Map<string, DiscoveredDevice> = new Map()
  private isRunning = false
  private storePath: string

  constructor() {
    super()
    // Use Electron's userData path for storage
    const userDataPath = app.getPath('userData')
    this.storePath = path.join(userDataPath, 'devices.json')
    this.loadKnownDevices()
  }

  private loadKnownDevices(): void {
    try {
      if (fs.existsSync(this.storePath)) {
        const data = fs.readFileSync(this.storePath, 'utf-8')
        const storedDevices: StoredDevice[] = JSON.parse(data)
        console.log(`[Discovery] Loading ${storedDevices.length} known devices from storage`)

        for (const stored of storedDevices) {
          const device: DiscoveredDevice = {
            ...stored,
            discoveredAt: new Date(stored.discoveredAt),
            lastSeen: new Date(stored.lastSeen),
            isOnline: false // Mark as offline until discovered
          }
          this.devices.set(device.id, device)
        }
      } else {
        console.log('[Discovery] No stored devices found')
      }
    } catch (error) {
      console.error('[Discovery] Failed to load devices:', error)
    }
  }

  private saveKnownDevices(): void {
    try {
      const devicesToStore: StoredDevice[] = Array.from(this.devices.values()).map(device => ({
        id: device.id,
        name: device.name,
        hostname: device.hostname,
        ip: device.ip,
        port: device.port,
        mac: device.mac,
        firmwareVersion: device.firmwareVersion,
        universe: device.universe,
        discoveredAt: device.discoveredAt.toISOString(),
        lastSeen: device.lastSeen.toISOString(),
        isManual: device.isManual
      }))

      fs.writeFileSync(this.storePath, JSON.stringify(devicesToStore, null, 2), 'utf-8')
      console.log(`[Discovery] Saved ${devicesToStore.length} devices to storage`)
    } catch (error) {
      console.error('[Discovery] Failed to save devices:', error)
    }
  }

  start(): void {
    if (this.isRunning) return

    this.bonjour = new Bonjour()
    this.browser = this.bonjour.find({ type: 'sacn-dmx' })

    this.browser.on('up', (service: Service) => {
      const device = this.parseService(service)
      if (device) {
        // Check if this is a known device coming back online
        const existingDevice = this.devices.get(device.id)
        if (existingDevice) {
          // Update existing device info but keep original discoveredAt
          device.discoveredAt = existingDevice.discoveredAt
        }

        this.devices.set(device.id, device)
        this.saveKnownDevices() // Persist to storage
        this.emit('device-found', device)
        console.log(`[Discovery] Device found: ${device.name} at ${device.ip}:${device.port}`)
      }
    })

    this.browser.on('down', (service: Service) => {
      const deviceId = this.getDeviceId(service)
      if (deviceId && this.devices.has(deviceId)) {
        const device = this.devices.get(deviceId)!
        device.isOnline = false
        device.lastSeen = new Date()
        this.saveKnownDevices() // Persist offline status
        this.emit('device-removed', deviceId)
        console.log(`[Discovery] Device offline: ${device.name}`)
      }
    })

    this.isRunning = true
    console.log('[Discovery] Service started, browsing for _sacn-dmx._tcp')
  }

  stop(): void {
    if (!this.isRunning) return

    this.browser?.stop()
    this.bonjour?.destroy()
    this.bonjour = null
    this.browser = null
    this.isRunning = false
    this.saveKnownDevices() // Save on stop
    console.log('[Discovery] Service stopped')
  }

  refresh(): void {
    if (this.isRunning) {
      this.stop()
      setTimeout(() => this.start(), 500)
    }
  }

  getDevices(): DiscoveredDevice[] {
    return Array.from(this.devices.values())
  }

  addManualDevice(ip: string, name: string, port: number = 80): DiscoveredDevice {
    const device: DiscoveredDevice = {
      id: `manual-${ip}:${port}`,
      name,
      hostname: ip,
      ip,
      port,
      mac: '',
      firmwareVersion: 'unknown',
      universe: 1,
      discoveredAt: new Date(),
      lastSeen: new Date(),
      isOnline: true,
      isManual: true
    }
    this.devices.set(device.id, device)
    this.saveKnownDevices()
    return device
  }

  removeDevice(deviceId: string): boolean {
    if (this.devices.has(deviceId)) {
      this.devices.delete(deviceId)
      this.saveKnownDevices()
      console.log(`[Discovery] Device removed: ${deviceId}`)
      return true
    }
    return false
  }

  clearOfflineDevices(): number {
    let removed = 0
    for (const [id, device] of this.devices) {
      if (!device.isOnline) {
        this.devices.delete(id)
        removed++
      }
    }
    if (removed > 0) {
      this.saveKnownDevices()
      console.log(`[Discovery] Cleared ${removed} offline devices`)
    }
    return removed
  }

  private parseService(service: Service): DiscoveredDevice | null {
    try {
      const txt = service.txt || {}
      const mac = txt.mac || this.extractMacFromName(service.name)
      const addresses = service.addresses || []
      const ip = addresses.find((addr: string) => !addr.includes(':')) || ''
      const port = service.port || 80

      if (!ip) {
        console.log('[Discovery] Skipping service without IP:', service.name)
        return null
      }

      // Use ip:port as unique ID to support multiple simulated devices on same IP
      const id = `${ip}:${port}`

      return {
        id,
        name: service.name,
        hostname: service.host || `${service.name}.local`,
        ip,
        port,
        mac: mac || id, // Use id as fallback if no MAC
        firmwareVersion: txt.version || 'unknown',
        universe: parseInt(txt.universe) || 1,
        discoveredAt: new Date(),
        lastSeen: new Date(),
        isOnline: true,
        isManual: false
      }
    } catch (err) {
      console.error('[Discovery] Error parsing service:', err)
      return null
    }
  }

  private getDeviceId(service: Service): string | null {
    const addresses = service.addresses || []
    const ip = addresses.find((addr: string) => !addr.includes(':')) || ''
    const port = service.port || 80
    if (!ip) return null
    return `${ip}:${port}`
  }

  private extractMacFromName(name: string): string | null {
    // Extract MAC from names like "DMX-Bridge-A1B2"
    const match = name.match(/([A-Fa-f0-9]{2}:){5}[A-Fa-f0-9]{2}/)
    if (match) return match[0]

    // Try to extract last 4 hex digits from name
    const hexMatch = name.match(/[A-Fa-f0-9]{4}$/)
    if (hexMatch) return `XX:XX:XX:XX:${hexMatch[0].slice(0, 2)}:${hexMatch[0].slice(2, 4)}`

    return name // Use name as fallback ID
  }
}
