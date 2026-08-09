import { extname } from 'node:path'

const ARCHIVE_EXT = new Set(['.zip', '.7z', '.rar'])
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])

export function isArchiveFileName(name: string): boolean {
  return ARCHIVE_EXT.has(extname(name).toLowerCase())
}

export function isImageFileName(name: string): boolean {
  return IMAGE_EXT.has(extname(name).toLowerCase())
}

/** Next 1-based index for `NNN.ext` image files (archives ignored). */
export function nextImageStartIndex(existingNames: string[]): number {
  let max = 0
  for (const name of existingNames) {
    if (!isImageFileName(name)) continue
    const m = /^(\d+)/.exec(name)
    if (!m) continue
    const n = Number.parseInt(m[1], 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  return max + 1
}
