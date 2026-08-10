import { app, BrowserWindow, Menu, nativeImage, protocol } from 'electron'
import { appendFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { initAppServices, registerIpc, registerProtocols } from './ipc'
import { resolveAppIconPath } from './appIcon'

async function appendMainLog(line: string): Promise<void> {
  try {
    const p = join(app.getPath('userData'), 'logs', 'main.log')
    await mkdir(dirname(p), { recursive: true })
    await appendFile(p, `[${new Date().toISOString()}] ${line}\n`, 'utf8')
  } catch {
    /* ignore logging failures */
  }
}

function registerProcessLogHandlers(): void {
  process.on('unhandledRejection', (reason) => {
    void appendMainLog(
      `unhandledRejection ${reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)}`,
    )
  })
  process.on('uncaughtException', (err) => {
    void appendMainLog(`uncaughtException ${err.stack ?? err.message}`)
  })
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'gallery-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

function createWindow(): void {
  const frameless = process.platform === 'win32' || process.platform === 'linux'
  const iconPath = resolveAppIconPath()
  const icon = iconPath ? nativeImage.createFromPath(iconPath) : undefined
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: !frameless,
    title: 'WallpaperRunner',
    backgroundColor: '#14110f',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (frameless) {
    Menu.setApplicationMenu(null)
    win.on('maximize', () => win.webContents.send('window:maximized', true))
    win.on('unmaximize', () => win.webContents.send('window:maximized', false))
  }

  win.on('ready-to-show', () => win.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.wallpaperrunner.app')
  }
  const iconPath = resolveAppIconPath()
  if (iconPath) {
    const icon = nativeImage.createFromPath(iconPath)
    if (!icon.isEmpty()) app.dock?.setIcon(icon)
  }
  registerProcessLogHandlers()
  await initAppServices()
  registerProtocols()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
