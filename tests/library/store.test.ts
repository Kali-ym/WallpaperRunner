import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  applyLibraryFilters,
  aggregateTagStats,
  mergeTags,
  normalizeImageRange,
  type FilterableEntry,
} from '@main/library/filters'
import { LibraryStore } from '@main/library/store'

const base = (over: Partial<FilterableEntry> = {}): FilterableEntry => ({
  source: 'xchina',
  author: 'A',
  title: 'T',
  tags: [],
  imageCount: 2,
  downloadedAt: '2026-08-08T12:00:00.000Z',
  favorite: false,
  ...over,
})

describe('library filters helpers', () => {
  it('AND tags and OR sources', () => {
    const entries = [
      base({ title: '1', tags: ['jk', '国模'], source: 'xchina' }),
      base({ title: '2', tags: ['jk'], source: 'telegram' }),
      base({ title: '3', tags: ['jk', '国模'], source: 'telegram' }),
    ]
    const and = applyLibraryFilters(entries, '', { tags: ['JK', '国模'] })
    expect(and.map((e) => e.title)).toEqual(['1', '3'])
    const src = applyLibraryFilters(entries, '', { sources: ['telegram'] })
    expect(src.map((e) => e.title)).toEqual(['2', '3'])
  })

  it('date and image range (swaps min>max)', () => {
    const entries = [
      base({ title: 'early', downloadedAt: '2026-08-01T00:00:00.000Z', imageCount: 1 }),
      base({ title: 'mid', downloadedAt: '2026-08-08T12:00:00.000Z', imageCount: 5 }),
      base({ title: 'late', downloadedAt: '2026-08-15T00:00:00.000Z', imageCount: 10 }),
    ]
    const dated = applyLibraryFilters(entries, '', {
      downloadedFrom: '2026-08-08',
      downloadedTo: '2026-08-08',
    })
    expect(dated.map((e) => e.title)).toEqual(['mid'])
    const ranged = applyLibraryFilters(entries, '', { minImages: 10, maxImages: 4 })
    expect(normalizeImageRange(10, 4)).toEqual({ min: 4, max: 10 })
    expect(ranged.map((e) => e.title).sort()).toEqual(['late', 'mid'])
  })

  it('aggregates tag stats and mergeTags dedupes case-insensitively', () => {
    const stats = aggregateTagStats([
      base({ tags: ['JK', '国模'] }),
      base({ tags: ['jk', '街拍'] }),
    ])
    expect(stats[0]).toEqual({ tag: 'JK', count: 2 })
    expect(mergeTags(['JK'], ['jk', '街拍'])).toEqual(['JK', '街拍'])
  })
})

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

    await store.renameGallery('xchina', 'abc', '显示名')
    await store.setFavorite('xchina', 'abc', true)
    const renamed = await store.getGallery('xchina', 'abc')
    expect(renamed?.displayTitle).toBe('显示名')
    expect(renamed?.favorite).toBe(true)
    const favOnly = await store.search('', { favoriteOnly: true })
    expect(favOnly).toHaveLength(1)

    const rebuilt = await store.rebuildIndex()
    expect(rebuilt).toHaveLength(1)
    expect(rebuilt[0].favorite).toBe(true)
  })

  it('filters by tags AND and addTags merges', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gal-lib-f-'))
    dirs.push(root)
    const store = new LibraryStore(root)
    await store.upsertGallery({
      source: 'xchina',
      galleryId: 'a',
      title: 'A',
      sourceUrl: 'https://xchina.co/photo/id-a.html',
      author: '',
      tags: ['jk', '国模'],
      pageCount: 1,
      cover: null,
      images: ['001.jpg'],
      downloadedAt: '2026-08-08T00:00:00.000Z',
    })
    await store.upsertGallery({
      source: 'telegram',
      galleryId: 'b',
      title: 'B',
      sourceUrl: 'https://t.me/x/1',
      author: '',
      tags: ['jk'],
      pageCount: 1,
      cover: null,
      images: ['001.jpg', '002.jpg', '003.jpg'],
      downloadedAt: '2026-08-10T00:00:00.000Z',
    })

    const both = await store.search('', { tags: ['jk', '国模'] })
    expect(both.map((e) => e.galleryId)).toEqual(['a'])

    const stats = await store.listTagStats()
    expect(stats.find((s) => s.tag.toLowerCase() === 'jk')?.count).toBe(2)

    const n = await store.addTags([{ source: 'telegram', galleryId: 'b' }], ['JK', '街拍'])
    expect(n).toBe(1)
    const meta = await store.getGallery('telegram', 'b')
    expect(meta?.tags.map((t) => t.toLowerCase()).sort()).toEqual(['jk', '街拍'])
  })

  it('finds duplicates by cover fingerprint', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gal-dup-'))
    dirs.push(root)
    const store = new LibraryStore(root)
    const bytes = Buffer.from('dup-cover-bytes')

    async function seed(id: string, title: string): Promise<void> {
      const dir = store.resolveGalleryDir('local', id, title)
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, '001.jpg'), bytes)
      await store.upsertGallery({
        source: 'local',
        galleryId: id,
        title,
        sourceUrl: `file://${dir}`,
        author: '',
        tags: [],
        pageCount: 1,
        cover: '001.jpg',
        images: ['001.jpg'],
        downloadedAt: new Date().toISOString(),
      })
    }

    await seed('g1', '一套')
    await seed('g2', '二套')
    const groups = await store.findDuplicates()
    expect(groups).toHaveLength(1)
    expect(groups[0]?.galleries).toHaveLength(2)
  })
})
