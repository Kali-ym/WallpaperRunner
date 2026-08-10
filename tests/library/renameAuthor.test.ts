import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryStore } from '@main/library/store'
import { AuthorAvatarStore, authorKey } from '@main/library/authorAvatars'

async function seedGallery(
  root: string,
  store: LibraryStore,
  author: string,
  galleryId: string,
): Promise<void> {
  const dir = join(root, `xchina_${galleryId}_title`)
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'metadata.json'),
    JSON.stringify({
      source: 'xchina',
      galleryId,
      title: `Title ${galleryId}`,
      sourceUrl: 'https://example.com',
      author,
      tags: [],
      pageCount: 1,
      cover: '001.jpg',
      images: ['001.jpg'],
      downloadedAt: new Date().toISOString(),
    }),
  )
  await writeFile(join(dir, '001.jpg'), Buffer.from([1, 2, 3]))
  await store.rebuildIndex()
}

describe('renameAuthor', () => {
  let root = ''

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true })
  })

  it('updates author on all matching galleries', async () => {
    root = await mkdtemp(join(tmpdir(), 'rename-author-'))
    const store = new LibraryStore(root)
    await store.ensureRoot()
    await seedGallery(root, store, 'Old Name', 'a1')
    await seedGallery(root, store, 'Old Name', 'a2')
    await seedGallery(root, store, 'Other', 'b1')

    const n = await store.renameAuthor('old name', 'New Name')
    expect(n).toBe(2)

    const index = await store.loadIndex()
    const authors = index.map((e) => e.author).sort()
    expect(authors).toEqual(['New Name', 'New Name', 'Other'])

    const meta = await store.getGallery('xchina', 'a1')
    expect(meta?.author).toBe('New Name')
  })

  it('migrates author avatar index when author is renamed', async () => {
    root = await mkdtemp(join(tmpdir(), 'rename-avatar-'))
    const store = new LibraryStore(root)
    const avatars = new AuthorAvatarStore(root)
    await store.ensureRoot()
    await seedGallery(root, store, 'Alpha', 'a1')

    const key = authorKey('Alpha')
    await mkdir(join(root, '.author-avatars'), { recursive: true })
    await writeFile(join(root, '.author-avatars', `${key}.jpg`), Buffer.from([1, 2, 3]))
    await writeFile(
      join(root, 'author-avatars.json'),
      JSON.stringify({
        updatedAt: new Date().toISOString(),
        avatars: {
          [key]: {
            author: 'Alpha',
            fileName: `${key}.jpg`,
            relativePath: `.author-avatars/${key}.jpg`,
            source: 'xchina',
            galleryId: 'a1',
            imagePath: '001.jpg',
            crop: { x: 0, y: 0, width: 10, height: 10 },
            updatedAt: new Date().toISOString(),
          },
        },
      }),
    )

    expect(await avatars.get('Alpha')).not.toBeNull()

    await store.renameAuthor('Alpha', 'Beta')
    const moved = await avatars.renameAuthor('Alpha', 'Beta')
    expect(moved).toBe(true)

    expect(await avatars.get('Alpha')).toBeNull()
    const record = await avatars.get('Beta')
    expect(record?.author).toBe('Beta')

    const raw = JSON.parse(await readFile(join(root, 'author-avatars.json'), 'utf8')) as {
      avatars: Record<string, { author: string }>
    }
    expect(Object.keys(raw.avatars)).toHaveLength(1)
    expect(Object.values(raw.avatars)[0]?.author).toBe('Beta')
  })
})
