import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import { DiscoveryService } from "./discovery";
import { WifiProvisioningService } from "./wifi";

let mainWindow: BrowserWindow | null = null;
let discoveryService: DiscoveryService | null = null;
let wifiService: WifiProvisioningService | null = null;

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

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  discoveryService?.stop();
  if (process.platform !== "darwin") {
    app.quit();
  }
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
  try {
    if (!wifiService) {
      return { success: false, error: "WiFi service not initialized" };
    }
    const credentials = await wifiService.getCurrentNetworkCredentials();
    return { success: true, credentials };
  } catch (error) {
    console.error("[WiFi] Get credentials failed:", error);
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
