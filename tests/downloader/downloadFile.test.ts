import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@main/http/client', () => ({
  httpFetch: vi.fn(),
  setHttpProxy: vi.fn(),
  getHttpProxy: vi.fn(() => null),
  getPreferCurl: vi.fn(() => false),
  curlDownloadToFile: vi.fn(),
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
    expect(extensionFromUrlOrType('https://a/pack.zip', null)).toBe('.zip')
    expect(extensionFromUrlOrType('https://a/x', 'application/zip')).toBe('.zip')
  })

  it('extensionFromMagic detects zip header', async () => {
    const { extensionFromMagic } = await import('@main/downloader/downloadFile')
    expect(extensionFromMagic(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]))).toBe('.zip')
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

  it('reports stream progress when body reader is available', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dl-prog-'))
    dirs.push(root)
    const dest = join(root, 'pack.bin')
    const part1 = Buffer.alloc(1500, 2)
    const part2 = Buffer.alloc(1500, 3)
    const chunks = [part1, part2]
    let i = 0
    const events: { received: number; total: number | null }[] = []

    vi.mocked(httpFetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (k: string) => (k.toLowerCase() === 'content-length' ? '3000' : 'application/octet-stream'),
      },
      body: {
        getReader: () => ({
          read: async () => {
            if (i >= chunks.length) return { done: true, value: undefined }
            const value = chunks[i++]
            return { done: false, value }
          },
          cancel: async () => undefined,
          releaseLock: () => undefined,
        }),
      },
      arrayBuffer: async () => Buffer.concat(chunks),
    } as unknown as Response)

    const result = await downloadFile('https://example.com/pack.rar', dest, {
      retries: 1,
      onProgress: (p) => events.push({ ...p }),
    })
    expect(result.bytes).toBe(3000)
    expect(events.length).toBeGreaterThan(0)
    expect(events[events.length - 1]?.received).toBe(3000)
    expect(events.some((e) => e.total === 3000)).toBe(true)
  })

  it('resumes from .part with Range header', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dl-part-'))
    dirs.push(root)
    const dest = join(root, '001.jpg')
    const partPath = `${dest}.part`
    const existing = Buffer.alloc(1024, 9)
    await writeFile(partPath, existing)

    const rest = Buffer.alloc(1024, 8)
    const calls: Array<{ headers?: Record<string, string> }> = []
    vi.mocked(httpFetch).mockImplementation(async (_url, init) => {
      calls.push({ headers: init?.headers as Record<string, string> })
      let done = false
      return {
        ok: true,
        status: 206,
        headers: {
          get: (k: string) => {
            const key = k.toLowerCase()
            if (key === 'content-length') return '1024'
            if (key === 'content-type') return 'image/jpeg'
            return null
          },
        },
        body: {
          getReader: () => ({
            read: async () => {
              if (done) return { done: true, value: undefined }
              done = true
              return { done: false, value: rest }
            },
            cancel: async () => undefined,
            releaseLock: () => undefined,
          }),
        },
        arrayBuffer: async () => rest,
      } as unknown as Response
    })

    const result = await downloadFile('https://example.com/a.jpg', dest, { retries: 1 })
    expect(result.bytes).toBe(2048)
    expect(JSON.stringify(calls[0]?.headers)).toMatch(/bytes=1024-/)
    const written = await readFile(dest)
    expect(written.byteLength).toBe(2048)
    await expect(readFile(partPath)).rejects.toThrow()
  })
})
