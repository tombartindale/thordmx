import { EventEmitter } from 'events'
import { Bonjour, Service } from 'bonjour-service'

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

export class DiscoveryService extends EventEmitter {
  private bonjour: InstanceType<typeof Bonjour> | null = null
  private browser: any = null
  private devices: Map<string, DiscoveredDevice> = new Map()
  private isRunning = false

  constructor() {
    super()
  }

  start(): void {
    if (this.isRunning) return

    this.bonjour = new Bonjour()
    this.browser = this.bonjour.find({ type: 'sacn-dmx' })

    this.browser.on('up', (service: Service) => {
      const device = this.parseService(service)
      if (device) {
        this.devices.set(device.id, device)
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
    return device
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
