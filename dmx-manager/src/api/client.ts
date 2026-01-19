import axios, { AxiosInstance } from 'axios'
import type { DeviceStatus, DeviceConfig, ConfigUpdate, FirmwareInfo, ApiResponse, Device } from './types'

export class DeviceClient {
  private axios: AxiosInstance

  constructor(private device: Device) {
    this.axios = axios.create({
      baseURL: `http://${device.ip}:${device.port}`,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }

  async getStatus(): Promise<DeviceStatus> {
    const response = await this.axios.get<DeviceStatus>('/api/status')
    return response.data
  }

  async getConfig(): Promise<DeviceConfig> {
    const response = await this.axios.get<DeviceConfig>('/api/config')
    return response.data
  }

  async setConfig(config: ConfigUpdate): Promise<ApiResponse> {
    try {
      const response = await this.axios.post<ApiResponse>('/api/config', config)
      return response.data
    } catch (error: any) {
      // Handle axios errors - extract the error message from the response body
      if (error.response?.data) {
        // Device returned an error response (e.g., 400 Bad Request)
        return error.response.data as ApiResponse
      }
      // Network error or other issue
      return {
        success: false,
        error: error.message || 'Failed to send configuration'
      }
    }
  }

  async reboot(): Promise<ApiResponse> {
    const response = await this.axios.post<ApiResponse>('/api/reboot')
    return response.data
  }

  async identify(durationSeconds: number = 5): Promise<ApiResponse> {
    const response = await this.axios.post<ApiResponse>('/api/identify', {
      duration: durationSeconds
    })
    return response.data
  }

  async getFirmwareInfo(): Promise<FirmwareInfo> {
    const response = await this.axios.get<FirmwareInfo>('/api/firmware')
    return response.data
  }

  async uploadFirmware(
    firmware: ArrayBuffer,
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse> {
    const formData = new FormData()
    formData.append('firmware', new Blob([firmware]), 'firmware.bin')

    const response = await this.axios.post<ApiResponse>('/api/firmware', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      timeout: 120000, // 2 minutes for firmware upload
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          onProgress(progress)
        }
      }
    })

    return response.data
  }

  async rollbackFirmware(): Promise<ApiResponse> {
    const response = await this.axios.post<ApiResponse>('/api/firmware/rollback')
    return response.data
  }
}

// Factory function for creating device clients
export function createDeviceClient(device: Device): DeviceClient {
  return new DeviceClient(device)
}

// Utility to check if device is reachable
export async function checkDeviceOnline(device: Device): Promise<boolean> {
  try {
    const client = new DeviceClient(device)
    await client.getStatus()
    return true
  } catch {
    return false
  }
}
