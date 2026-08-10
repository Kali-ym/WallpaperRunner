import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export function resolveAppIconPath(): string | undefined {
  const candidates = [
    join(process.resourcesPath, 'icon.png'),
    join(app.getAppPath(), 'build', 'icon.png'),
    join(__dirname, '../../build/icon.png'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return undefined
}
