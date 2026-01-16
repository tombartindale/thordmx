import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { DiscoveryService } from './discovery'

let mainWindow: BrowserWindow | null = null
let discoveryService: DiscoveryService | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: '#111827',
    titleBarStyle: 'hiddenInset',
    show: false
  })

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Initialize discovery service
  discoveryService = new DiscoveryService()
  discoveryService.on('device-found', (device) => {
    mainWindow?.webContents.send('device-found', device)
  })
  discoveryService.on('device-removed', (deviceId) => {
    mainWindow?.webContents.send('device-removed', deviceId)
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  discoveryService?.stop()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// IPC Handlers
ipcMain.handle('discovery:start', () => {
  discoveryService?.start()
  return { success: true }
})

ipcMain.handle('discovery:stop', () => {
  discoveryService?.stop()
  return { success: true }
})

ipcMain.handle('discovery:refresh', () => {
  discoveryService?.refresh()
  return { success: true }
})

ipcMain.handle('discovery:get-devices', () => {
  return discoveryService?.getDevices() || []
})
