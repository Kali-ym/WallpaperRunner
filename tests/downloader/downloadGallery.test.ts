import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@main/http/client', () => ({
  httpFetch: vi.fn(),
  setHttpProxy: vi.fn(),
  getHttpProxy: vi.fn(() => null),
  getPreferCurl: vi.fn(() => false),
  curlDownloadToFile: vi.fn(),
}))

import { httpFetch } from '@main/http/client'
import { downloadGallery } from '@main/downloader/downloadGallery'
import { LibraryStore } from '@main/library/store'

function jpegBytes(): Buffer {
  const bytes = Buffer.alloc(2048, 1)
  bytes[0] = 0xff
  bytes[1] = 0xd8
  bytes[2] = 0xff
  return bytes
}

describe('downloadGallery', () => {
  const dirs: string[] = []
  afterEach(async () => {
    vi.mocked(httpFetch).mockReset()
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  })

  it('sends a browser image Accept header so xChina CDN does not 403', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gal-'))
    dirs.push(root)
    const bytes = jpegBytes()
    const calls: Array<Record<string, string>> = []

    vi.mocked(httpFetch).mockImplementation(async (_url, init) => {
      calls.push((init?.headers ?? {}) as Record<string, string>)
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'image/jpeg' },
        arrayBuffer: async () => bytes,
      } as unknown as Response
    })

    await downloadGallery(
      {
        source: 'xchina',
        galleryId: '6a880bfec909d',
        title: '情色泡泡浴',
        sourceUrl: 'https://xchina.co/photo/id-6a880bfec909d.html',
        author: '',
        tags: [],
        pageCount: 1,
        coverUrl: 'https://img.xchina.io/photos/6a880bfec909d/00001.jpg',
        images: [{ index: 1, url: 'https://img.xchina.io/photos/6a880bfec909d/00001.jpg' }],
      },
      new LibraryStore(root),
      { concurrency: 1, failedRetries: 0 },
    )

    const accept = calls[0]?.Accept ?? calls[0]?.accept
    expect(accept).toMatch(/image\//)
    expect(accept).not.toBe('*/*')
  })
})
