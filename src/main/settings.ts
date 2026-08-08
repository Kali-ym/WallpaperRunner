import { app } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

export interface AppSettings {
  downloadRoot: string
  imageConcurrency: number
  openAfterDownload: boolean
}

function defaultSettings(): AppSettings {
  return {
    downloadRoot: join(homedir(), 'Pictures', 'gallery-library'),
    imageConcurrency: 3,
    openAfterDownload: false,
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
    return {
      downloadRoot: parsed.downloadRoot || defaults.downloadRoot,
      imageConcurrency:
        typeof parsed.imageConcurrency === 'number' && parsed.imageConcurrency > 0
          ? Math.floor(parsed.imageConcurrency)
          : defaults.imageConcurrency,
      openAfterDownload: Boolean(parsed.openAfterDownload),
    }
  } catch {
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
  }
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(settingsPath(), JSON.stringify(next, null, 2), 'utf8')
  return next
}
