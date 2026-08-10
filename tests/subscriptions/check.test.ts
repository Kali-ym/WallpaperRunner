import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearAdapters, registerAdapter } from '@main/adapters/registry'
import type { SourceAdapter } from '@main/adapters/types'
import { LibraryStore } from '@main/library/store'
import { DownloadQueue } from '@main/queue/downloadQueue'
import { checkAllSubscriptions, checkSubscription } from '@main/subscriptions/check'
import { SubscriptionStore } from '@main/subscriptions/store'

describe('SubscriptionStore', () => {
  const dirs: string[] = []
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  })

  it('adds and removes subscriptions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sub-'))
    dirs.push(root)
    const store = new SubscriptionStore(join(root, 'subscriptions.json'))
    const a = await store.add('https://example.com/a')
    expect(a.url).toBe('https://example.com/a')
    expect(await store.list()).toHaveLength(1)
    await store.setEnabled(a.id, false)
    expect((await store.list())[0]?.enabled).toBe(false)
    expect(await store.remove(a.id)).toBe(true)
    expect(await store.list()).toHaveLength(0)
  })
})

describe('checkSubscription', () => {
  const dirs: string[] = []

  beforeEach(() => {
    clearAdapters()
  })

  afterEach(async () => {
    clearAdapters()
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  })

  it('enqueues when gallery missing and marks updated', async () => {
    const root = await mkdtemp(join(tmpdir(), 'subc-'))
    dirs.push(root)
    const lib = new LibraryStore(root)
    const queue = new DownloadQueue({ store: lib, imageConcurrency: 1 })
    queue.pause()

    const fake: SourceAdapter = {
      id: 'fake',
      name: 'Fake',
      match: (u) => u.includes('fake.test'),
      parseGallery: async (url) => ({
        source: 'fake',
        galleryId: 'g1',
        title: '套图',
        sourceUrl: url,
        author: '',
        tags: [],
        pageCount: 2,
        coverUrl: null,
        images: [
          { index: 1, url: 'https://example.com/1.jpg' },
          { index: 2, url: 'https://example.com/2.jpg' },
        ],
      }),
    }
    registerAdapter(fake)

    const subs = new SubscriptionStore(join(root, 'subscriptions.json'))
    const sub = await subs.add('https://fake.test/g')
    const result = await checkSubscription(sub, subs, {
      store: lib,
      queue,
      fetchText: async () => '',
    })
    expect(result.enqueued).toBe(true)
    expect(result.subscription.lastStatus).toBe('updated')
    expect(queue.listTasks().some((t) => t.status === 'queued')).toBe(true)
  })

  it('skips needsSelection sources', async () => {
    const root = await mkdtemp(join(tmpdir(), 'subs-'))
    dirs.push(root)
    const lib = new LibraryStore(root)
    const queue = new DownloadQueue({ store: lib, imageConcurrency: 1 })
    queue.pause()

    registerAdapter({
      id: 'sel',
      name: 'Sel',
      match: (u) => u.includes('sel.test'),
      needsSelection: () => true,
      parseGallery: async () => {
        throw new Error('should not parse')
      },
    })

    const subs = new SubscriptionStore(join(root, 'subscriptions.json'))
    const sub = await subs.add('https://sel.test/x')
    const result = await checkSubscription(sub, subs, {
      store: lib,
      queue,
      fetchText: async () => '',
    })
    expect(result.enqueued).toBe(false)
    expect(result.subscription.lastStatus).toBe('skipped')
  })

  it('marks ok when local already complete', async () => {
    const root = await mkdtemp(join(tmpdir(), 'subo-'))
    dirs.push(root)
    const lib = new LibraryStore(root)
    await lib.upsertGallery({
      source: 'fake',
      galleryId: 'g1',
      title: '套图',
      sourceUrl: 'https://fake.test/g',
      author: '',
      tags: [],
      pageCount: 2,
      cover: null,
      images: ['001.jpg', '002.jpg'],
      downloadedAt: new Date().toISOString(),
    })
    const queue = new DownloadQueue({ store: lib, imageConcurrency: 1 })
    queue.pause()

    registerAdapter({
      id: 'fake',
      name: 'Fake',
      match: (u) => u.includes('fake.test'),
      parseGallery: async (url) => ({
        source: 'fake',
        galleryId: 'g1',
        title: '套图',
        sourceUrl: url,
        author: '',
        tags: [],
        pageCount: 2,
        coverUrl: null,
        images: [
          { index: 1, url: 'https://example.com/1.jpg' },
          { index: 2, url: 'https://example.com/2.jpg' },
        ],
      }),
    })

    const subs = new SubscriptionStore(join(root, 'subscriptions.json'))
    const sub = await subs.add('https://fake.test/g')
    const result = await checkAllSubscriptions(subs, {
      store: lib,
      queue,
      fetchText: async () => '',
    })
    expect(result.enqueued).toBe(0)
    expect(result.results[0]?.subscription.lastStatus).toBe('ok')
  })
})
