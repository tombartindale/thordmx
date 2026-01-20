import { EventEmitter } from 'events'

// Dynamic imports for native modules to avoid bundling issues
let SerialPort: typeof import('serialport').SerialPort | null = null
let ReadlineParser: typeof import('@serialport/parser-readline').ReadlineParser | null = null

async function loadSerialPort(): Promise<boolean> {
  if (SerialPort && ReadlineParser) return true

  try {
    const serialportModule = await import('serialport')
    const parserModule = await import('@serialport/parser-readline')
    SerialPort = serialportModule.SerialPort
    ReadlineParser = parserModule.ReadlineParser
    console.log('[Serial] Native modules loaded successfully')
    return true
  } catch (e) {
    console.error('[Serial] Failed to load native modules:', e)
    return false
  }
}

export interface SerialDeviceInfo {
  path: string
  vendorId?: string
  productId?: string
  manufacturer?: string
  serialNumber?: string
}

export interface SerialDeviceStatus {
  device_name: string
  firmware_version: string
  wifi_connected: boolean
  wifi_ssid: string
  mac_address: string
  sacn_universe: number
}

export interface SerialProvisioningConfig {
  device_name: string
  wifi_ssid: string
  wifi_password: string
  sacn_universe: number
}

export interface SerialProvisioningResult {
  path: string
  success: boolean
  deviceName?: string
  macAddress?: string
  error?: string
}

export class SerialProvisioningService extends EventEmitter {
  private watchInterval: NodeJS.Timeout | null = null
  private knownDevices: Set<string> = new Set()
  private isWatching: boolean = false
  private pendingConfig: SerialProvisioningConfig | null = null
  private deviceCounter: number = 1
  private deviceNameTemplate: string = 'DMX-Device-{n}'

  /**
   * List all available serial ports that match ESP32 devices
   */
  async listDevices(): Promise<SerialDeviceInfo[]> {
    if (!await loadSerialPort() || !SerialPort) {
      console.error('[Serial] Cannot list devices - native module not loaded')
      return []
    }

    const ports = await SerialPort.list()

    // Filter for USB serial devices (ESP32 typically shows as usbmodem or usbserial)
    return ports
      .filter(port => {
        const path = port.path.toLowerCase()
        // Match common ESP32/USB serial patterns
        return path.includes('usbmodem') ||
               path.includes('usbserial') ||
               path.includes('ttyusb') ||
               path.includes('ttyacm') ||
               path.includes('cu.slab') ||
               path.includes('cu.wchusbserial')
      })
      .map(port => ({
        path: port.path,
        vendorId: port.vendorId,
        productId: port.productId,
        manufacturer: port.manufacturer,
        serialNumber: port.serialNumber
      }))
  }

  /**
   * Get device status via serial port
   */
  async getDeviceStatus(portPath: string): Promise<SerialDeviceStatus | null> {
    if (!await loadSerialPort() || !SerialPort || !ReadlineParser) {
      console.error('[Serial] Cannot get device status - native module not loaded')
      return null
    }

    const SP = SerialPort
    const RP = ReadlineParser

    return new Promise((resolve) => {
      let port: InstanceType<typeof SP> | null = null
      let timeoutId: NodeJS.Timeout | null = null

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId)
        if (port?.isOpen) {
          port.close()
        }
      }

      try {
        port = new SP({
          path: portPath,
          baudRate: 115200,
          autoOpen: false
        })

        const parser = port.pipe(new RP({ delimiter: '\n' }))

        parser.on('data', (line: string) => {
          const trimmed = line.trim()
          if (trimmed.startsWith('OK:')) {
            try {
              const json = trimmed.substring(3)
              const status = JSON.parse(json) as SerialDeviceStatus
              cleanup()
              resolve(status)
            } catch (e) {
              console.error('[Serial] Failed to parse status response:', e)
            }
          }
        })

        port.on('error', (err) => {
          console.error('[Serial] Port error:', err)
          cleanup()
          resolve(null)
        })

        port.open((err) => {
          if (err) {
            console.error('[Serial] Failed to open port:', err)
            resolve(null)
            return
          }

          // Wait for device to be ready
          setTimeout(() => {
            port?.write('STATUS\n')
          }, 500)
        })

        // Timeout after 5 seconds
        timeoutId = setTimeout(() => {
          console.warn('[Serial] Status request timed out')
          cleanup()
          resolve(null)
        }, 5000)

      } catch (e) {
        console.error('[Serial] Error getting device status:', e)
        cleanup()
        resolve(null)
      }
    })
  }

  /**
   * Provision a device via serial port
   */
  async provisionDevice(portPath: string, config: SerialProvisioningConfig): Promise<SerialProvisioningResult> {
    if (!await loadSerialPort() || !SerialPort || !ReadlineParser) {
      console.error('[Serial] Cannot provision device - native module not loaded')
      return {
        path: portPath,
        success: false,
        error: 'Serial port native module not loaded'
      }
    }

    const SP = SerialPort
    const RP = ReadlineParser

    return new Promise((resolve) => {
      let port: InstanceType<typeof SP> | null = null
      let timeoutId: NodeJS.Timeout | null = null
      let macAddress: string | undefined

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId)
        if (port?.isOpen) {
          port.close()
        }
      }

      try {
        port = new SP({
          path: portPath,
          baudRate: 115200,
          autoOpen: false
        })

        const parser = port.pipe(new RP({ delimiter: '\n' }))

        parser.on('data', (line: string) => {
          const trimmed = line.trim()
          console.log(`[Serial] ${portPath}: ${trimmed}`)

          if (trimmed.startsWith('OK:')) {
            try {
              const json = trimmed.substring(3)
              const response = JSON.parse(json)

              // Check if this is a status response (has mac_address)
              if (response.mac_address) {
                macAddress = response.mac_address
                // Now send the config
                const configJson = JSON.stringify({
                  device_name: config.device_name,
                  wifi_ssid: config.wifi_ssid,
                  wifi_password: config.wifi_password,
                  sacn_universe: config.sacn_universe
                })
                console.log(`[Serial] Sending config: CONFIG:${configJson}`)
                port?.write(`CONFIG:${configJson}\n`)
              } else if (response.message) {
                // Config response
                cleanup()
                resolve({
                  path: portPath,
                  success: true,
                  deviceName: config.device_name,
                  macAddress
                })
              }
            } catch (e) {
              console.error('[Serial] Failed to parse response:', e)
            }
          } else if (trimmed.startsWith('ERROR:')) {
            try {
              const json = trimmed.substring(6)
              const error = JSON.parse(json)
              cleanup()
              resolve({
                path: portPath,
                success: false,
                error: error.message || 'Unknown error'
              })
            } catch (e) {
              cleanup()
              resolve({
                path: portPath,
                success: false,
                error: trimmed.substring(6)
              })
            }
          } else if (trimmed === 'REBOOTING...') {
            // Device is rebooting, consider it successful
            cleanup()
            resolve({
              path: portPath,
              success: true,
              deviceName: config.device_name,
              macAddress
            })
          }
        })

        port.on('error', (err) => {
          console.error('[Serial] Port error:', err)
          cleanup()
          resolve({
            path: portPath,
            success: false,
            error: err.message
          })
        })

        port.open((err) => {
          if (err) {
            console.error('[Serial] Failed to open port:', err)
            resolve({
              path: portPath,
              success: false,
              error: `Failed to open port: ${err.message}`
            })
            return
          }

          console.log(`[Serial] Port ${portPath} opened, requesting status...`)

          // Wait for device to be ready, then get status first
          setTimeout(() => {
            port?.write('STATUS\n')
          }, 500)
        })

        // Timeout after 10 seconds
        timeoutId = setTimeout(() => {
          console.warn('[Serial] Provisioning request timed out')
          cleanup()
          resolve({
            path: portPath,
            success: false,
            error: 'Provisioning timed out'
          })
        }, 10000)

      } catch (e) {
        console.error('[Serial] Error provisioning device:', e)
        cleanup()
        resolve({
          path: portPath,
          success: false,
          error: (e as Error).message
        })
      }
    })
  }

  /**
   * Set the configuration to use for auto-provisioning
   */
  setAutoProvisionConfig(config: Omit<SerialProvisioningConfig, 'device_name'> & {
    deviceNameTemplate: string
    startingNumber: number
  }): void {
    this.deviceNameTemplate = config.deviceNameTemplate
    this.deviceCounter = config.startingNumber
    this.pendingConfig = {
      device_name: '', // Will be generated per device
      wifi_ssid: config.wifi_ssid,
      wifi_password: config.wifi_password,
      sacn_universe: config.sacn_universe
    }
    console.log('[Serial] Auto-provision config set:', {
      template: this.deviceNameTemplate,
      startingNumber: this.deviceCounter,
      ssid: config.wifi_ssid
    })
  }

  /**
   * Generate device name from template
   */
  private generateDeviceName(): string {
    const name = this.deviceNameTemplate.replace('{n}', String(this.deviceCounter))
    this.deviceCounter++
    return name
  }

  /**
   * Start watching for new USB serial devices
   */
  startWatching(): void {
    if (this.isWatching) return

    this.isWatching = true
    console.log('[Serial] Starting device watch...')

    // Initial scan
    this.scanForNewDevices()

    // Poll every 2 seconds for new devices
    this.watchInterval = setInterval(() => {
      this.scanForNewDevices()
    }, 2000)
  }

  /**
   * Stop watching for devices
   */
  stopWatching(): void {
    if (this.watchInterval) {
      clearInterval(this.watchInterval)
      this.watchInterval = null
    }
    this.isWatching = false
    this.knownDevices.clear()
    this.pendingConfig = null  // Clear config to prevent auto-provisioning
    console.log('[Serial] Stopped device watch')
  }

  /**
   * Scan for new devices and auto-provision if configured
   */
  private async scanForNewDevices(): Promise<void> {
    try {
      const devices = await this.listDevices()

      for (const device of devices) {
        if (!this.knownDevices.has(device.path)) {
          this.knownDevices.add(device.path)
          console.log(`[Serial] New device detected: ${device.path}`)

          this.emit('device-connected', device)

          // Auto-provision if config is set
          if (this.pendingConfig) {
            await this.autoProvisionDevice(device.path)
          }
        }
      }

      // Check for disconnected devices
      const currentPaths = new Set(devices.map(d => d.path))
      for (const knownPath of this.knownDevices) {
        if (!currentPaths.has(knownPath)) {
          this.knownDevices.delete(knownPath)
          console.log(`[Serial] Device disconnected: ${knownPath}`)
          this.emit('device-disconnected', { path: knownPath })
        }
      }
    } catch (e) {
      console.error('[Serial] Error scanning for devices:', e)
    }
  }

  /**
   * Auto-provision a newly connected device
   */
  private async autoProvisionDevice(portPath: string): Promise<void> {
    if (!this.pendingConfig) return

    // Wait a moment for the device to fully initialize
    await new Promise(resolve => setTimeout(resolve, 1000))

    const deviceName = this.generateDeviceName()
    const config: SerialProvisioningConfig = {
      ...this.pendingConfig,
      device_name: deviceName
    }

    console.log(`[Serial] Auto-provisioning ${portPath} as "${deviceName}"...`)
    this.emit('provisioning-started', { path: portPath, deviceName })

    const result = await this.provisionDevice(portPath, config)

    if (result.success) {
      console.log(`[Serial] Successfully provisioned ${portPath} as "${deviceName}"`)
      this.emit('provisioning-completed', result)
    } else {
      console.error(`[Serial] Failed to provision ${portPath}: ${result.error}`)
      // Decrement counter so we can retry with same name
      this.deviceCounter--
      this.emit('provisioning-failed', result)
    }
  }

  /**
   * Manually provision a specific device
   */
  async manualProvision(portPath: string, config: SerialProvisioningConfig): Promise<SerialProvisioningResult> {
    console.log(`[Serial] Manual provisioning ${portPath}...`)
    this.emit('provisioning-started', { path: portPath, deviceName: config.device_name })

    const result = await this.provisionDevice(portPath, config)

    if (result.success) {
      this.emit('provisioning-completed', result)
    } else {
      this.emit('provisioning-failed', result)
    }

    return result
  }
}
