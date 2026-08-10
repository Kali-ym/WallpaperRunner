import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access } from 'node:fs/promises'

/** SHA1 of entire file contents. */
export function hashFileSha1(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha1')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

export async function fingerprintFile(filePath: string): Promise<string | null> {
  try {
    await access(filePath)
    return await hashFileSha1(filePath)
  } catch {
    return null
  }
}

/** Group entries that share the same fingerprint (size ≥ 2). */
export function groupDuplicatesByFingerprint<T extends { contentFingerprint?: string | null }>(
  items: T[],
): Array<{ fingerprint: string; items: T[] }> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const fp = item.contentFingerprint?.trim()
    if (!fp) continue
    const list = map.get(fp)
    if (list) list.push(item)
    else map.set(fp, [item])
  }
  return [...map.entries()]
    .filter(([, group]) => group.length >= 2)
    .map(([fingerprint, group]) => ({ fingerprint, items: group }))
    .sort((a, b) => b.items.length - a.items.length)
}
