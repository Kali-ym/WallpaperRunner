import { app } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { setHttpProxy } from './http/client'

export type ThemePreference = 'system' | 'light' | 'dark'

export interface AppSettings {
  downloadRoot: string
  imageConcurrency: number
  /** HTTP(S) proxy, e.g. http://127.0.0.1:7890. Empty = direct. */
  proxyUrl: string
  /** Local Wallpaper Engine web wallpaper project directory */
  wallpaperEngineDir: string
  /** Rewrite playlist.json when library changes */
  wallpaperAutoSync: boolean
  /** Local HTTP port for WE to load images (junctions are blocked by WE) */
  wallpaperMediaPort: number
  /** Telegram MTProto api_id from my.telegram.org */
  telegramApiId: string
  /** Telegram MTProto api_hash from my.telegram.org */
  telegramApiHash: string
  /** Appearance: follow OS / force light / force dark */
  theme: ThemePreference
}

function defaultSettings(): AppSettings {
  const envProxy =
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy ||
    ''
  return {
    downloadRoot: join(homedir(), 'Pictures', 'gallery-library'),
    imageConcurrency: 2,
    // Clash / common local proxy default; user can clear in settings
    proxyUrl: envProxy || 'http://127.0.0.1:7890',
    wallpaperEngineDir: join(homedir(), 'Documents', 'gallery-we-wallpaper'),
    wallpaperAutoSync: true,
    wallpaperMediaPort: 17989,
    telegramApiId: '',
    telegramApiHash: '',
    theme: 'system',
  }
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export async function loadSettings(): Promise<AppSettings> {
  const defaults = defaultSettings()
  try {
    const raw = await readFile(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    const settings: AppSettings = {
      downloadRoot: parsed.downloadRoot || defaults.downloadRoot,
      imageConcurrency:
        typeof parsed.imageConcurrency === 'number' && parsed.imageConcurrency > 0
          ? Math.floor(parsed.imageConcurrency)
          : defaults.imageConcurrency,
      proxyUrl:
        typeof parsed.proxyUrl === 'string' ? parsed.proxyUrl.trim() : defaults.proxyUrl,
      wallpaperEngineDir:
        typeof parsed.wallpaperEngineDir === 'string' && parsed.wallpaperEngineDir.trim()
          ? parsed.wallpaperEngineDir.trim()
          : defaults.wallpaperEngineDir,
      wallpaperAutoSync:
        typeof parsed.wallpaperAutoSync === 'boolean'
          ? parsed.wallpaperAutoSync
          : defaults.wallpaperAutoSync,
      wallpaperMediaPort:
        typeof parsed.wallpaperMediaPort === 'number' && parsed.wallpaperMediaPort > 0
          ? Math.floor(parsed.wallpaperMediaPort)
          : defaults.wallpaperMediaPort,
      telegramApiId:
        typeof parsed.telegramApiId === 'string' ? parsed.telegramApiId.trim() : '',
      telegramApiHash:
        typeof parsed.telegramApiHash === 'string' ? parsed.telegramApiHash.trim() : '',
      theme:
        parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system'
          ? parsed.theme
          : defaults.theme,
    }
    setHttpProxy(settings.proxyUrl || null)
    return settings
  } catch {
    setHttpProxy(defaults.proxyUrl || null)
    return defaults
  }
}

export async function saveSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadSettings()
  const next: AppSettings = {
    ...current,
    ...partial,
    imageConcurrency:
      typeof partial.imageConcurrency === 'number' && partial.imageConcurrency > 0
        ? Math.floor(partial.imageConcurrency)
        : current.imageConcurrency,
    proxyUrl:
      typeof partial.proxyUrl === 'string' ? partial.proxyUrl.trim() : current.proxyUrl,
    wallpaperEngineDir:
      typeof partial.wallpaperEngineDir === 'string' && partial.wallpaperEngineDir.trim()
        ? partial.wallpaperEngineDir.trim()
        : current.wallpaperEngineDir,
    wallpaperAutoSync:
      typeof partial.wallpaperAutoSync === 'boolean'
        ? partial.wallpaperAutoSync
        : current.wallpaperAutoSync,
    wallpaperMediaPort:
      typeof partial.wallpaperMediaPort === 'number' && partial.wallpaperMediaPort > 0
        ? Math.floor(partial.wallpaperMediaPort)
        : current.wallpaperMediaPort,
    telegramApiId:
      typeof partial.telegramApiId === 'string'
        ? partial.telegramApiId.trim()
        : current.telegramApiId,
    telegramApiHash:
      typeof partial.telegramApiHash === 'string'
        ? partial.telegramApiHash.trim()
        : current.telegramApiHash,
    theme:
      partial.theme === 'light' || partial.theme === 'dark' || partial.theme === 'system'
        ? partial.theme
        : current.theme,
  }
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(settingsPath(), JSON.stringify(next, null, 2), 'utf8')
  setHttpProxy(next.proxyUrl || null)
  return next
}
