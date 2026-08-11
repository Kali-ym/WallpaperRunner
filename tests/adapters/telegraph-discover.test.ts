import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResourceManifest } from '@main/resources/types'

const discoverTelegraphViaTelegram = vi.fn()
const discoverTelegraph = vi.fn()

vi.mock('@main/adapters/telegraph/telegramCache', () => ({
  discoverTelegraphViaTelegram: (...args: unknown[]) => discoverTelegraphViaTelegram(...args),
}))

vi.mock('@main/adapters/telegraph/adapter', () => ({
  discoverTelegraph: (...args: unknown[]) => discoverTelegraph(...args),
}))

import { discoverTelegraphBestEffort } from '@main/adapters/telegraph/discover'

const URL = 'https://telegra.ph/Sample-Title-01-01'

function httpManifest(): ResourceManifest {
  return {
    id: 'manifest_http',
    source: 'telegraph',
    sourceUrl: URL,
    title: 'Sample',
    galleryId: 'Sample-Title-01-01',
    groups: {
      post: [],
      comments: [],
      telegraph: [
        {
          url: URL,
          title: 'Sample',
          items: [
            {
              id: 'telegraph:Sample-Title-01-01:0',
              origin: 'telegraph',
              kind: 'telegraph_image',
              label: 'Telegraph · 图片 1',
              downloadUrl: 'https://example.com/a.jpg',
            },
          ],
        },
      ],
    },
  }
}

describe('discoverTelegraphBestEffort', () => {
  beforeEach(() => {
    discoverTelegraphViaTelegram.mockReset()
    discoverTelegraph.mockReset()
  })

  it('uses telegram cache when client is available and cache has items', async () => {
    const cachedHandles = new Map([['telegraph:tgcache:Sample-Title-01-01:photo:0', { kind: 'telegram_media' as const, media: {} }]])
    discoverTelegraphViaTelegram.mockResolvedValue({
      manifest: httpManifest(),
      handles: cachedHandles,
    })

    const result = await discoverTelegraphBestEffort(URL, { fetchText: vi.fn() }, {} as never)

    expect(result.cacheUsed).toBe(true)
    expect(result.manifest.title).toBe('Sample')
    expect(result.handles).toBe(cachedHandles)
    expect(discoverTelegraph).not.toHaveBeenCalled()
  })

  it('falls back to HTTP scrape when telegram cache is empty', async () => {
    discoverTelegraphViaTelegram.mockResolvedValue(null)
    discoverTelegraph.mockResolvedValue(httpManifest())

    const result = await discoverTelegraphBestEffort(URL, { fetchText: vi.fn() }, {} as never)

    expect(result.cacheUsed).toBe(false)
    expect(discoverTelegraph).toHaveBeenCalledWith(URL, { fetchText: expect.any(Function) })
    expect(result.handles.get('telegraph:Sample-Title-01-01:0')).toEqual({
      kind: 'http',
      url: 'https://example.com/a.jpg',
    })
  })

  it('falls back to HTTP scrape when telegram cache throws', async () => {
    discoverTelegraphViaTelegram.mockRejectedValue(new Error('network'))
    discoverTelegraph.mockResolvedValue(httpManifest())

    const result = await discoverTelegraphBestEffort(URL, { fetchText: vi.fn() }, {} as never)

    expect(result.cacheUsed).toBe(false)
    expect(discoverTelegraph).toHaveBeenCalled()
  })

  it('uses HTTP scrape directly when no telegram client is provided', async () => {
    discoverTelegraph.mockResolvedValue(httpManifest())

    const result = await discoverTelegraphBestEffort(URL, { fetchText: vi.fn() })

    expect(result.cacheUsed).toBe(false)
    expect(discoverTelegraphViaTelegram).not.toHaveBeenCalled()
    expect(discoverTelegraph).toHaveBeenCalled()
  })
})
