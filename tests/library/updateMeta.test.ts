import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryStore } from '@main/library/store'

describe('updateGalleryMeta', () => {
  let root = ''

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true })
  })

  it('updates displayTitle author and tags', async () => {
    root = await mkdtemp(join(tmpdir(), 'meta-'))
    const store = new LibraryStore(root)
    await store.ensureRoot()
    const dir = join(root, 'xchina_abc_title')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'metadata.json'),
      JSON.stringify({
        source: 'xchina',
        galleryId: 'abc',
        title: 'Original',
        sourceUrl: 'https://example.com',
        author: 'A',
        tags: ['t1'],
        pageCount: 1,
        cover: null,
        images: ['001.jpg'],
        downloadedAt: new Date().toISOString(),
      }),
    )
    await writeFile(join(dir, '001.jpg'), Buffer.from([1, 2, 3]))
    await store.rebuildIndex()

    const meta = await store.updateGalleryMeta('xchina', 'abc', {
      displayTitle: 'New title',
      author: 'B',
      tags: ['x', 'y'],
    })

    expect(meta.displayTitle).toBe('New title')
    expect(meta.author).toBe('B')
    expect(meta.tags).toEqual(['x', 'y'])
  })
})
