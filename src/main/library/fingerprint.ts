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
