import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

const STARTUP_NAME = 'GalleryWeMediaServer.cmd'

export function windowsStartupDir(): string {
  return join(
    process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'),
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    'Startup',
  )
}

export function startupShortcutPath(): string {
  return join(windowsStartupDir(), STARTUP_NAME)
}

export function isWallpaperMediaStartupInstalled(): boolean {
  return existsSync(startupShortcutPath())
}

/**
 * Install a Startup entry that runs the media server from the WE project folder
 * without launching the Electron gallery app.
 */
export async function installWallpaperMediaStartup(wallpaperDir: string): Promise<string> {
  const dir = wallpaperDir.trim()
  if (!dir) throw new Error('WE 工程目录为空')

  const serverJs = join(dir, 'media-server.mjs')
  const launcherCmd = join(dir, 'start-media-server.cmd')
  const startupDir = windowsStartupDir()
  await mkdir(startupDir, { recursive: true })

  // Hidden-ish start: use cmd that launches node minimized
  const cmdBody =
    `@echo off\r\n` +
    `cd /d "${dir}"\r\n` +
    `where node >nul 2>nul\r\n` +
    `if errorlevel 1 (\r\n` +
    `  echo Node.js not found in PATH. Install Node or start the gallery app once.\r\n` +
    `  exit /b 1\r\n` +
    `)\r\n` +
    `start "Gallery WE Media" /MIN node "${serverJs}"\r\n`

  await writeFile(launcherCmd, cmdBody, 'utf8')

  const startupBody =
    `@echo off\r\n` +
    `cd /d "${dir}"\r\n` +
    `start "Gallery WE Media" /MIN node "${serverJs}"\r\n`

  const shortcut = startupShortcutPath()
  await writeFile(shortcut, startupBody, 'utf8')
  return shortcut
}

export async function uninstallWallpaperMediaStartup(): Promise<boolean> {
  const shortcut = startupShortcutPath()
  if (!existsSync(shortcut)) return false
  await unlink(shortcut)
  return true
}
