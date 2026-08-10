import { app, BrowserWindow, protocol } from 'electron'
import { appendFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { initAppServices, registerIpc, registerProtocols } from './ipc'

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
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.on('ready-to-show', () => win.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
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
