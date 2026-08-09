import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const STARTUP_VBS = 'GalleryWeMediaServer.vbs'
const STARTUP_CMD_LEGACY = 'GalleryWeMediaServer.cmd'

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
  return join(windowsStartupDir(), STARTUP_VBS)
}

function legacyStartupShortcutPath(): string {
  return join(windowsStartupDir(), STARTUP_CMD_LEGACY)
}

export function isWallpaperMediaStartupInstalled(): boolean {
  return existsSync(startupShortcutPath()) || existsSync(legacyStartupShortcutPath())
}

function vbsEscape(path: string): string {
  return path.replace(/"/g, '""')
}

/** Hidden launcher: WindowStyle 0 = no console window. */
function buildHiddenVbs(wallpaperDir: string, serverJs: string): string {
  const dir = vbsEscape(wallpaperDir)
  const script = vbsEscape(serverJs)
  return (
    `Set sh = CreateObject("WScript.Shell")\r\n` +
    `sh.CurrentDirectory = "${dir}"\r\n` +
    `sh.Run "node ""${script}""", 0, False\r\n`
  )
}

/** Write project-dir launchers used by sync + startup install (no visible console). */
export async function writeWallpaperMediaLaunchers(wallpaperDir: string): Promise<void> {
  const dir = wallpaperDir.trim()
  if (!dir) throw new Error('WE 工程目录为空')
  const serverJs = join(dir, 'media-server.mjs')
  await writeFile(join(dir, 'start-media-server-hidden.vbs'), buildHiddenVbs(dir, serverJs), 'utf8')
  await writeFile(
    join(dir, 'start-media-server.cmd'),
    `@echo off\r\n` +
      `where node >nul 2>nul\r\n` +
      `if errorlevel 1 (\r\n` +
      `  echo Node.js not found in PATH. Install Node or start the gallery app once.\r\n` +
      `  pause\r\n` +
      `  exit /b 1\r\n` +
      `)\r\n` +
      `wscript //nologo "%~dp0start-media-server-hidden.vbs"\r\n`,
    'utf8',
  )
}

/**
 * Install a Startup entry that runs the media server from the WE project folder
 * without launching the Electron gallery app, and without a visible console.
 */
export async function installWallpaperMediaStartup(wallpaperDir: string): Promise<string> {
  const dir = wallpaperDir.trim()
  if (!dir) throw new Error('WE 工程目录为空')

  await mkdir(windowsStartupDir(), { recursive: true })
  await writeWallpaperMediaLaunchers(dir)

  const legacy = legacyStartupShortcutPath()
  if (existsSync(legacy)) {
    try {
      await unlink(legacy)
    } catch {
      /* ignore */
    }
  }

  const shortcut = startupShortcutPath()
  await writeFile(shortcut, buildHiddenVbs(dir, join(dir, 'media-server.mjs')), 'utf8')
  return shortcut
}

export async function uninstallWallpaperMediaStartup(): Promise<boolean> {
  let removed = false
  for (const p of [startupShortcutPath(), legacyStartupShortcutPath()]) {
    if (!existsSync(p)) continue
    await unlink(p)
    removed = true
  }
  return removed
}
