import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import { DiscoveryService } from "./discovery";
import { WifiProvisioningService } from "./wifi";
import { SerialProvisioningService } from "./serial";

// Request location permission on macOS (required for WiFi SSID access)
async function requestLocationPermission(): Promise<{ authorized: boolean; status: number }> {
  if (process.platform !== "darwin") {
    return { authorized: true, status: 4 };
  }

  console.log("[Permission] Checking location authorization for WiFi SSID detection");

  const { exec } = require("child_process");
  const { promisify } = require("util");
  const execAsync = promisify(exec);

  // Swift code that properly requests and waits for location authorization
  const swiftCode = `
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
    // Request authorization and wait for response
    manager.requestWhenInUseAuthorization()

    // Run the run loop to process the authorization request
    CFRunLoopRunInMode(.defaultMode, 5.0, false)

    print(manager.authorizationStatus.rawValue)
} else {
    print(currentStatus.rawValue)
}
`;

  try {
    const { stdout } = await execAsync(`swift -e '${swiftCode}'`, { timeout: 10000 });
    const status = parseInt(stdout.trim(), 10);
    const authorized = status === 3 || status === 4; // authorizedAlways or authorizedWhenInUse

    const statusNames: Record<number, string> = {
      0: "notDetermined",
      1: "restricted",
      2: "denied",
      3: "authorizedAlways",
      4: "authorizedWhenInUse",
    };

    console.log(`[Permission] Location authorization: ${statusNames[status] || "unknown"} (${status})`);

    if (!authorized && status !== 0) {
      console.warn("[Permission] Location access not authorized. WiFi SSID detection may not work.");
      console.warn("[Permission] Please grant location access in System Settings > Privacy & Security > Location Services");
    }

    return { authorized, status };
  } catch (error) {
    console.error("[Permission] Failed to check location authorization:", error);
    return { authorized: false, status: 0 };
  }
}

let mainWindow: BrowserWindow | null = null;
let discoveryService: DiscoveryService | null = null;
let wifiService: WifiProvisioningService | null = null;
let serialService: SerialProvisioningService | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: "#181534ff",
    titleBarStyle: "hiddenInset",
    show: false,
  });

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Initialize discovery service
  discoveryService = new DiscoveryService();
  discoveryService.on("device-found", (device) => {
    mainWindow?.webContents.send("device-found", device);
  });
  discoveryService.on("device-removed", (deviceId) => {
    mainWindow?.webContents.send("device-removed", deviceId);
  });
}

app.whenReady().then(async () => {
  // Request location permission on macOS before creating window
  await requestLocationPermission();

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  discoveryService?.stop();
  // Quit on all platforms (including macOS) since this is a single-window utility app
  app.quit();
});

app.on("before-quit", () => {
  discoveryService?.stop();
});

// IPC Handlers
ipcMain.handle("discovery:start", () => {
  discoveryService?.start();
  return { success: true };
});

ipcMain.handle("discovery:stop", () => {
  discoveryService?.stop();
  return { success: true };
});

ipcMain.handle("discovery:refresh", () => {
  discoveryService?.refresh();
  return { success: true };
});

ipcMain.handle("discovery:remove-device", (_event, deviceId: string) => {
  const success = discoveryService?.removeDevice(deviceId) ?? false;
  return { success };
});

ipcMain.handle("discovery:clear-offline", () => {
  const count = discoveryService?.clearOfflineDevices() ?? 0;
  return { success: true, count };
});

ipcMain.handle("discovery:add-manual", (_event, ip: string, name: string, port?: number) => {
  const device = discoveryService?.addManualDevice(ip, name, port);
  return { success: !!device, device };
});

ipcMain.handle("discovery:get-devices", () => {
  return discoveryService?.getDevices() || [];
});

// WiFi Provisioning IPC Handlers
ipcMain.handle("wifi:initialize", async () => {
  try {
    wifiService = new WifiProvisioningService();
    await wifiService.initialize();

    // Forward events to renderer
    wifiService.on("connecting", (data) => {
      mainWindow?.webContents.send("wifi:connecting", data);
    });
    wifiService.on("connected", (data) => {
      mainWindow?.webContents.send("wifi:connected", data);
    });
    wifiService.on("connection-failed", (data) => {
      mainWindow?.webContents.send("wifi:connection-failed", data);
    });
    wifiService.on("reconnecting", (data) => {
      mainWindow?.webContents.send("wifi:reconnecting", data);
    });

    return { success: true };
  } catch (error) {
    console.error("[WiFi] Initialization failed:", error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle("wifi:scan", async (_event, pattern?: string) => {
  try {
    if (!wifiService) {
      return { success: false, error: "WiFi service not initialized" };
    }
    const networks = await wifiService.scanNetworks(pattern);
    return { success: true, networks };
  } catch (error) {
    console.error("[WiFi] Scan failed:", error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle("wifi:get-current-credentials", async () => {
  console.log("[WiFi] get-current-credentials called");
  try {
    if (!wifiService) {
      console.log("[WiFi] wifiService is null");
      return { success: false, error: "WiFi service not initialized" };
    }
    console.log("[WiFi] Calling getCurrentNetworkCredentials...");
    const credentials = await wifiService.getCurrentNetworkCredentials();
    console.log("[WiFi] Credentials result:", credentials);
    return { success: true, credentials };
  } catch (error) {
    console.error("[WiFi] Get credentials failed:", error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle("wifi:get-known-networks", async () => {
  console.log("[WiFi] get-known-networks called");
  try {
    if (!wifiService) {
      return { success: false, error: "WiFi service not initialized" };
    }
    const networks = await wifiService.getKnownNetworks();
    console.log(`[WiFi] Found ${networks.length} known networks`);
    return { success: true, networks };
  } catch (error) {
    console.error("[WiFi] Get known networks failed:", error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle("wifi:get-password-for-network", async (_event, ssid: string) => {
  console.log(`[WiFi] get-password-for-network called for: ${ssid}`);
  try {
    if (!wifiService) {
      return { success: false, error: "WiFi service not initialized" };
    }
    const password = await wifiService.getPasswordForNetwork(ssid);
    console.log(`[WiFi] Password retrieved: ${password ? 'yes' : 'no'}`);
    return { success: true, password };
  } catch (error) {
    console.error("[WiFi] Get password for network failed:", error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle("wifi:connect-device-ap", async (_event, ssid: string) => {
  try {
    if (!wifiService) {
      return { success: false, error: "WiFi service not initialized" };
    }
    const success = await wifiService.connectToDeviceAP(ssid);
    return { success };
  } catch (error) {
    console.error("[WiFi] Connect to device AP failed:", error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle(
  "wifi:connect-target",
  async (_event, ssid: string, password: string) => {
    try {
      if (!wifiService) {
        return { success: false, error: "WiFi service not initialized" };
      }
      const success = await wifiService.connectToTargetNetwork(ssid, password);
      return { success };
    } catch (error) {
      console.error("[WiFi] Connect to target network failed:", error);
      return { success: false, error: (error as Error).message };
    }
  }
);

ipcMain.handle("wifi:reconnect-original", async () => {
  try {
    if (!wifiService) {
      return { success: false, error: "WiFi service not initialized" };
    }
    const success = await wifiService.reconnectToOriginalNetwork();
    return { success };
  } catch (error) {
    console.error("[WiFi] Reconnect failed:", error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle("wifi:check-location-authorization", async () => {
  try {
    if (!wifiService) {
      // If WiFi service not initialized, use the standalone check
      const result = await requestLocationPermission();
      return { success: true, ...result };
    }
    const result = await wifiService.checkLocationAuthorization();
    return { success: true, ...result };
  } catch (error) {
    console.error("[WiFi] Check location authorization failed:", error);
    return { success: false, authorized: false, status: 0, error: (error as Error).message };
  }
});

// Serial Provisioning IPC Handlers
ipcMain.handle("serial:initialize", async () => {
  console.log("[Serial] Initializing serial service...");
  try {
    serialService = new SerialProvisioningService();
    console.log("[Serial] SerialProvisioningService created");

    // Forward events to renderer
    serialService.on("device-connected", (data) => {
      mainWindow?.webContents.send("serial:device-connected", data);
    });
    serialService.on("device-disconnected", (data) => {
      mainWindow?.webContents.send("serial:device-disconnected", data);
    });
    serialService.on("provisioning-started", (data) => {
      mainWindow?.webContents.send("serial:provisioning-started", data);
    });
    serialService.on("provisioning-completed", (data) => {
      mainWindow?.webContents.send("serial:provisioning-completed", data);
    });
    serialService.on("provisioning-failed", (data) => {
      mainWindow?.webContents.send("serial:provisioning-failed", data);
    });

    console.log("[Serial] Serial service initialized successfully");
    return { success: true };
  } catch (error) {
    console.error("[Serial] Initialization failed:", error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle("serial:list-devices", async () => {
  try {
    if (!serialService) {
      return { success: false, error: "Serial service not initialized" };
    }
    const devices = await serialService.listDevices();
    return { success: true, devices };
  } catch (error) {
    console.error("[Serial] List devices failed:", error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle("serial:get-device-status", async (_event, portPath: string) => {
  try {
    if (!serialService) {
      return { success: false, error: "Serial service not initialized" };
    }
    const status = await serialService.getDeviceStatus(portPath);
    return { success: !!status, status };
  } catch (error) {
    console.error("[Serial] Get device status failed:", error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle("serial:provision", async (_event, portPath: string, config: {
  device_name: string;
  wifi_ssid: string;
  wifi_password: string;
  sacn_universe: number;
}) => {
  try {
    if (!serialService) {
      return { success: false, error: "Serial service not initialized" };
    }
    const result = await serialService.manualProvision(portPath, config);
    return result;
  } catch (error) {
    console.error("[Serial] Provision failed:", error);
    return { success: false, path: portPath, error: (error as Error).message };
  }
});

ipcMain.handle("serial:start-watching", async (_event, config?: {
  deviceNameTemplate: string;
  startingNumber: number;
  wifi_ssid: string;
  wifi_password: string;
  sacn_universe: number;
}) => {
  try {
    // Auto-initialize if not already done
    if (!serialService) {
      console.log("[Serial] Auto-initializing serial service for start-watching...");
      serialService = new SerialProvisioningService();

      // Forward events to renderer
      serialService.on("device-connected", (data) => {
        mainWindow?.webContents.send("serial:device-connected", data);
      });
      serialService.on("device-disconnected", (data) => {
        mainWindow?.webContents.send("serial:device-disconnected", data);
      });
      serialService.on("provisioning-started", (data) => {
        mainWindow?.webContents.send("serial:provisioning-started", data);
      });
      serialService.on("provisioning-completed", (data) => {
        mainWindow?.webContents.send("serial:provisioning-completed", data);
      });
      serialService.on("provisioning-failed", (data) => {
        mainWindow?.webContents.send("serial:provisioning-failed", data);
      });
      console.log("[Serial] Serial service auto-initialized");
    }

    if (config) {
      console.log("[Serial] Received config:", JSON.stringify(config, null, 2));
      serialService.setAutoProvisionConfig(config);
    } else {
      console.log("[Serial] No config provided, using defaults");
    }

    serialService.startWatching();
    return { success: true };
  } catch (error) {
    console.error("[Serial] Start watching failed:", error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle("serial:stop-watching", async () => {
  try {
    if (!serialService) {
      return { success: false, error: "Serial service not initialized" };
    }
    serialService.stopWatching();
    return { success: true };
  } catch (error) {
    console.error("[Serial] Stop watching failed:", error);
    return { success: false, error: (error as Error).message };
  }
});
