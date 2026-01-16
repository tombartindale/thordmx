"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  discovery: {
    start: () => electron.ipcRenderer.invoke("discovery:start"),
    stop: () => electron.ipcRenderer.invoke("discovery:stop"),
    refresh: () => electron.ipcRenderer.invoke("discovery:refresh"),
    getDevices: () => electron.ipcRenderer.invoke("discovery:get-devices"),
    onDeviceFound: (callback) => {
      electron.ipcRenderer.on("device-found", (_event, device) => callback(device));
    },
    onDeviceRemoved: (callback) => {
      electron.ipcRenderer.on("device-removed", (_event, deviceId) => callback(deviceId));
    }
  }
});
