import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryStore } from '@main/library/store'

describe('LibraryStore', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  })

  it('upserts metadata, searches by tag, and rebuilds', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gal-lib-'))
    dirs.push(root)
    const store = new LibraryStore(root)

    await store.upsertGallery({
      source: 'xchina',
      galleryId: 'abc',
      title: '测试套图',
      sourceUrl: 'https://xchina.co/photo/id-abc.html',
      author: '模特A',
      tags: ['国模套图', 'JK'],
      pageCount: 1,
      cover: '001.jpg',
      images: ['001.jpg', '002.jpg'],
      downloadedAt: '2026-08-08T00:00:00.000Z',
    })

    expect(await store.galleryExists('xchina', 'abc')).toBe(true)
    const found = await store.search('JK')
    expect(found).toHaveLength(1)
    expect(found[0].title).toBe('测试套图')

    const meta = await store.getGallery('xchina', 'abc')
    expect(meta?.images).toEqual(['001.jpg', '002.jpg'])

    const rebuilt = await store.rebuildIndex()
    expect(rebuilt).toHaveLength(1)
  })
})
