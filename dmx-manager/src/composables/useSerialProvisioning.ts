import { ref, reactive, computed } from "vue";

export interface SerialDevice {
  path: string;
  vendorId?: string;
  productId?: string;
  manufacturer?: string;
  serialNumber?: string;
}

export interface SerialDeviceStatus {
  device_name: string;
  firmware_version: string;
  wifi_connected: boolean;
  wifi_ssid: string;
  mac_address: string;
  sacn_universe: number;
}

export interface SerialProvisioningConfig {
  targetSsid: string;
  targetPassword: string;
  deviceNameTemplate: string;
  startingNumber: number;
  sacnUniverse: number;
}

export interface SerialProvisioningResult {
  path: string;
  success: boolean;
  deviceName?: string;
  macAddress?: string;
  error?: string;
}

export function useSerialProvisioning() {
  const isInitialized = ref(false);
  const isWatching = ref(false);
  const devices = ref<SerialDevice[]>([]);
  const results = ref<SerialProvisioningResult[]>([]);
  const error = ref<string | null>(null);
  const currentProvisioningDevice = ref<string | null>(null);

  const config = reactive<SerialProvisioningConfig>({
    targetSsid: "",
    targetPassword: "",
    deviceNameTemplate: "DMX-Device-{n}",
    startingNumber: 1,
    sacnUniverse: 1,
  });

  const hasElectronAPI = computed(() => {
    return typeof window !== "undefined" && "electronAPI" in window;
  });

  const completedCount = computed(
    () => results.value.filter((r) => r.success).length
  );

  const failedCount = computed(
    () => results.value.filter((r) => !r.success).length
  );

  async function initialize(): Promise<boolean> {
    if (!hasElectronAPI.value) {
      error.value = "Serial provisioning requires the desktop application";
      return false;
    }

    try {
      const result = await (window as any).electronAPI.serial.initialize();
      if (result.success) {
        isInitialized.value = true;
        setupEventListeners();
        return true;
      } else {
        error.value = result.error || "Failed to initialize serial service";
        return false;
      }
    } catch (e) {
      error.value = (e as Error).message;
      return false;
    }
  }

  function setupEventListeners() {
    const api = (window as any).electronAPI.serial;

    api.onDeviceConnected((device: SerialDevice) => {
      console.log(`[Serial] Device connected: ${device.path}`);
      // Add to devices list if not already present
      if (!devices.value.find((d) => d.path === device.path)) {
        devices.value.push(device);
      }
    });

    api.onDeviceDisconnected(({ path }: { path: string }) => {
      console.log(`[Serial] Device disconnected: ${path}`);
      devices.value = devices.value.filter((d) => d.path !== path);
    });

    api.onProvisioningStarted(
      ({ path, deviceName }: { path: string; deviceName: string }) => {
        console.log(`[Serial] Provisioning started: ${path} as ${deviceName}`);
        currentProvisioningDevice.value = path;
      }
    );

    api.onProvisioningCompleted((result: SerialProvisioningResult) => {
      console.log(`[Serial] Provisioning completed: ${result.path}`);
      results.value.push(result);
      currentProvisioningDevice.value = null;
    });

    api.onProvisioningFailed((result: SerialProvisioningResult) => {
      console.log(`[Serial] Provisioning failed: ${result.path} - ${result.error}`);
      results.value.push(result);
      currentProvisioningDevice.value = null;
    });
  }

  async function listDevices(): Promise<SerialDevice[]> {
    if (!hasElectronAPI.value) {
      error.value = "Serial provisioning requires the desktop application";
      return [];
    }

    try {
      const result = await (window as any).electronAPI.serial.listDevices();
      if (result.success && result.devices) {
        devices.value = result.devices;
        return result.devices;
      } else {
        error.value = result.error || "Failed to list devices";
        return [];
      }
    } catch (e) {
      error.value = (e as Error).message;
      return [];
    }
  }

  async function getDeviceStatus(
    portPath: string
  ): Promise<SerialDeviceStatus | null> {
    if (!hasElectronAPI.value) {
      return null;
    }

    try {
      const result = await (
        window as any
      ).electronAPI.serial.getDeviceStatus(portPath);
      if (result.success && result.status) {
        return result.status;
      }
      return null;
    } catch (e) {
      console.error("[Serial] Failed to get device status:", e);
      return null;
    }
  }

  async function provisionDevice(
    portPath: string,
    deviceName: string
  ): Promise<SerialProvisioningResult> {
    if (!hasElectronAPI.value) {
      return {
        path: portPath,
        success: false,
        error: "Serial provisioning requires the desktop application",
      };
    }

    if (!config.targetSsid || !config.targetPassword) {
      return {
        path: portPath,
        success: false,
        error: "Target WiFi credentials required",
      };
    }

    try {
      currentProvisioningDevice.value = portPath;
      const result = await (window as any).electronAPI.serial.provision(
        portPath,
        {
          device_name: deviceName,
          wifi_ssid: config.targetSsid,
          wifi_password: config.targetPassword,
          sacn_universe: config.sacnUniverse,
        }
      );
      results.value.push(result);
      currentProvisioningDevice.value = null;
      return result;
    } catch (e) {
      currentProvisioningDevice.value = null;
      const result: SerialProvisioningResult = {
        path: portPath,
        success: false,
        error: (e as Error).message,
      };
      results.value.push(result);
      return result;
    }
  }

  async function startAutoProvisioning(): Promise<boolean> {
    if (!hasElectronAPI.value) {
      error.value = "Serial provisioning requires the desktop application";
      return false;
    }

    if (!config.targetSsid || !config.targetPassword) {
      error.value = "Target WiFi credentials required";
      return false;
    }

    try {
      const result = await (window as any).electronAPI.serial.startWatching({
        deviceNameTemplate: config.deviceNameTemplate,
        startingNumber: config.startingNumber,
        wifi_ssid: config.targetSsid,
        wifi_password: config.targetPassword,
        sacn_universe: config.sacnUniverse,
      });

      if (result.success) {
        isWatching.value = true;
        error.value = null;
        return true;
      } else {
        error.value = result.error || "Failed to start auto-provisioning";
        return false;
      }
    } catch (e) {
      error.value = (e as Error).message;
      return false;
    }
  }

  async function stopAutoProvisioning(): Promise<boolean> {
    if (!hasElectronAPI.value) {
      return false;
    }

    try {
      const result = await (window as any).electronAPI.serial.stopWatching();
      if (result.success) {
        isWatching.value = false;
        return true;
      }
      return false;
    } catch (e) {
      console.error("[Serial] Failed to stop auto-provisioning:", e);
      return false;
    }
  }

  function reset() {
    results.value = [];
    currentProvisioningDevice.value = null;
    error.value = null;
  }

  return {
    // State
    isInitialized,
    isWatching,
    devices,
    results,
    error,
    config,
    currentProvisioningDevice,
    hasElectronAPI,

    // Computed
    completedCount,
    failedCount,

    // Actions
    initialize,
    listDevices,
    getDeviceStatus,
    provisionDevice,
    startAutoProvisioning,
    stopAutoProvisioning,
    reset,
  };
}
