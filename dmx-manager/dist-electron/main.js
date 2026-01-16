"use strict";
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
const electron = require("electron");
const path = require("path");
const events = require("events");
const Bonjour = require("bonjour-service");
class DiscoveryService extends events.EventEmitter {
  constructor() {
    super();
    __publicField(this, "bonjour", null);
    __publicField(this, "browser", null);
    __publicField(this, "devices", /* @__PURE__ */ new Map());
    __publicField(this, "isRunning", false);
  }
  start() {
    if (this.isRunning) return;
    this.bonjour = new Bonjour();
    this.browser = this.bonjour.find({ type: "sacn-dmx" });
    this.browser.on("up", (service) => {
      const device = this.parseService(service);
      if (device) {
        this.devices.set(device.id, device);
        this.emit("device-found", device);
        console.log(`[Discovery] Device found: ${device.name} at ${device.ip}`);
      }
    });
    this.browser.on("down", (service) => {
      const mac = this.extractMac(service);
      if (mac && this.devices.has(mac)) {
        const device = this.devices.get(mac);
        device.isOnline = false;
        device.lastSeen = /* @__PURE__ */ new Date();
        this.emit("device-removed", mac);
        console.log(`[Discovery] Device offline: ${device.name}`);
      }
    });
    this.isRunning = true;
    console.log("[Discovery] Service started, browsing for _sacn-dmx._tcp");
  }
  stop() {
    var _a, _b;
    if (!this.isRunning) return;
    (_a = this.browser) == null ? void 0 : _a.stop();
    (_b = this.bonjour) == null ? void 0 : _b.destroy();
    this.bonjour = null;
    this.browser = null;
    this.isRunning = false;
    console.log("[Discovery] Service stopped");
  }
  refresh() {
    if (this.isRunning) {
      this.stop();
      setTimeout(() => this.start(), 500);
    }
  }
  getDevices() {
    return Array.from(this.devices.values());
  }
  addManualDevice(ip, name) {
    const device = {
      id: `manual-${ip}`,
      name,
      hostname: ip,
      ip,
      port: 80,
      mac: "",
      firmwareVersion: "unknown",
      universe: 1,
      discoveredAt: /* @__PURE__ */ new Date(),
      lastSeen: /* @__PURE__ */ new Date(),
      isOnline: true,
      isManual: true
    };
    this.devices.set(device.id, device);
    return device;
  }
  parseService(service) {
    try {
      const txt = service.txt || {};
      const mac = txt.mac || this.extractMacFromName(service.name);
      const addresses = service.addresses || [];
      const ip = addresses.find((addr) => !addr.includes(":")) || "";
      if (!mac || !ip) {
        console.log("[Discovery] Skipping service without MAC or IP:", service.name);
        return null;
      }
      return {
        id: mac,
        name: service.name,
        hostname: service.host || `${service.name}.local`,
        ip,
        port: service.port || 80,
        mac,
        firmwareVersion: txt.version || "unknown",
        universe: parseInt(txt.universe) || 1,
        discoveredAt: /* @__PURE__ */ new Date(),
        lastSeen: /* @__PURE__ */ new Date(),
        isOnline: true,
        isManual: false
      };
    } catch (err) {
      console.error("[Discovery] Error parsing service:", err);
      return null;
    }
  }
  extractMac(service) {
    var _a;
    return ((_a = service.txt) == null ? void 0 : _a.mac) || this.extractMacFromName(service.name);
  }
  extractMacFromName(name) {
    const match = name.match(/([A-Fa-f0-9]{2}:){5}[A-Fa-f0-9]{2}/);
    if (match) return match[0];
    const hexMatch = name.match(/[A-Fa-f0-9]{4}$/);
    if (hexMatch) return `XX:XX:XX:XX:${hexMatch[0].slice(0, 2)}:${hexMatch[0].slice(2, 4)}`;
    return name;
  }
}
let mainWindow = null;
let discoveryService = null;
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: "#111827",
    titleBarStyle: "hiddenInset",
    show: false
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
  mainWindow.once("ready-to-show", () => {
    mainWindow == null ? void 0 : mainWindow.show();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  discoveryService = new DiscoveryService();
  discoveryService.on("device-found", (device) => {
    mainWindow == null ? void 0 : mainWindow.webContents.send("device-found", device);
  });
  discoveryService.on("device-removed", (deviceId) => {
    mainWindow == null ? void 0 : mainWindow.webContents.send("device-removed", deviceId);
  });
}
electron.app.whenReady().then(() => {
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
electron.app.on("window-all-closed", () => {
  discoveryService == null ? void 0 : discoveryService.stop();
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.ipcMain.handle("discovery:start", () => {
  discoveryService == null ? void 0 : discoveryService.start();
  return { success: true };
});
electron.ipcMain.handle("discovery:stop", () => {
  discoveryService == null ? void 0 : discoveryService.stop();
  return { success: true };
});
electron.ipcMain.handle("discovery:refresh", () => {
  discoveryService == null ? void 0 : discoveryService.refresh();
  return { success: true };
});
electron.ipcMain.handle("discovery:get-devices", () => {
  return (discoveryService == null ? void 0 : discoveryService.getDevices()) || [];
});
