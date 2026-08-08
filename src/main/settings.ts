import { app } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { setHttpProxy } from './http/client'

export interface AppSettings {
  downloadRoot: string
  imageConcurrency: number
  openAfterDownload: boolean
  /** HTTP(S) proxy, e.g. http://127.0.0.1:7890. Empty = direct. */
  proxyUrl: string
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
    imageConcurrency: 3,
    openAfterDownload: false,
    // Clash / common local proxy default; user can clear in settings
    proxyUrl: envProxy || 'http://127.0.0.1:7890',
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
      openAfterDownload: Boolean(parsed.openAfterDownload),
      proxyUrl:
        typeof parsed.proxyUrl === 'string' ? parsed.proxyUrl.trim() : defaults.proxyUrl,
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
  }
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(settingsPath(), JSON.stringify(next, null, 2), 'utf8')
  setHttpProxy(next.proxyUrl || null)
  return next
}
