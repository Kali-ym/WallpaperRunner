import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadFile, extensionFromUrlOrType } from '@main/downloader/downloadFile'

describe('downloadFile helpers', () => {
  const dirs: string[] = []
  afterEach(async () => {
    vi.unstubAllGlobals()
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  })

  it('extensionFromUrlOrType prefers url then content-type', () => {
    expect(extensionFromUrlOrType('https://a/x.PNG', null)).toBe('.png')
    expect(extensionFromUrlOrType('https://a/x', 'image/webp')).toBe('.webp')
  })

  it('writes bytes from fetch', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dl-'))
    dirs.push(root)
    const dest = join(root, '001.jpg')
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9])

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => 'image/jpeg' },
        arrayBuffer: async () => bytes,
      })),
    )

    const result = await downloadFile('https://example.com/a.jpg', dest, { retries: 1 })
    expect(result.bytes).toBe(4)
    const written = await readFile(dest)
    expect(Buffer.compare(written, bytes)).toBe(0)
  })
})
