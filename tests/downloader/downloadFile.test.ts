import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@main/http/client', () => ({
  httpFetch: vi.fn(),
  setHttpProxy: vi.fn(),
  getHttpProxy: vi.fn(() => null),
}))

import { httpFetch } from '@main/http/client'
import { downloadFile, extensionFromUrlOrType } from '@main/downloader/downloadFile'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('downloadFile helpers', () => {
  const dirs: string[] = []
  afterEach(async () => {
    vi.mocked(httpFetch).mockReset()
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
    const bytes = Buffer.alloc(2048, 1)
    bytes[0] = 0xff
    bytes[1] = 0xd8

    vi.mocked(httpFetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: async () => bytes,
    } as unknown as Response)

    const result = await downloadFile('https://example.com/a.jpg', dest, { retries: 1 })
    expect(result.bytes).toBe(2048)
    const written = await readFile(dest)
    expect(Buffer.compare(written, bytes)).toBe(0)
  })
})
