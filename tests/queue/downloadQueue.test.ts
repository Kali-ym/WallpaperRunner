import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAdapters, registerAdapter } from '@main/adapters/registry'
import type { SourceAdapter } from '@main/adapters/types'
import { LibraryStore } from '@main/library/store'
import { DownloadQueue } from '@main/queue/downloadQueue'

describe('DownloadQueue', () => {
  const dirs: string[] = []

  beforeEach(() => {
    clearAdapters()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => 'image/jpeg' },
        arrayBuffer: async () => Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      })),
    )
  })

  afterEach(async () => {
    clearAdapters()
    vi.unstubAllGlobals()
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  })

  it('fails unsupported sources and completes fake adapter downloads', async () => {
    const root = await mkdtemp(join(tmpdir(), 'q-'))
    dirs.push(root)
    const store = new LibraryStore(root)

    const fake: SourceAdapter = {
      id: 'fake',
      name: 'Fake',
      match: (u) => u.includes('fake.test'),
      parseGallery: async (url) => ({
        source: 'fake',
        galleryId: 'g1',
        title: '假套图',
        sourceUrl: url,
        author: 'A',
        tags: ['t'],
        pageCount: 1,
        coverUrl: 'https://example.com/1.jpg',
        images: [
          { index: 1, url: 'https://example.com/1.jpg' },
          { index: 2, url: 'https://example.com/2.jpg' },
        ],
      }),
    }
    registerAdapter(fake)

    const queue = new DownloadQueue({ store, imageConcurrency: 2 })

    await new Promise<void>((resolve) => {
      queue.on('idle', () => resolve())
      queue.enqueue(['https://nope.example/x', 'https://fake.test/gallery'])
    })

    const tasks = queue.listTasks()
    expect(tasks[0].status).toBe('failed')
    expect(tasks[0].error).toBe('暂不支持该来源')
    expect(tasks[1].status).toBe('completed')
    expect(tasks[1].done).toBe(2)
    expect(await store.galleryExists('fake', 'g1')).toBe(true)
  })
})
