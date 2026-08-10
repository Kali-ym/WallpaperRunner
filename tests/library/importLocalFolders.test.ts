import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { importLocalFolders } from '@main/library/importLocalFolders'
import { LibraryStore } from '@main/library/store'

describe('importLocalFolders', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  })

  it('imports current folder when no image subdirs', async () => {
    const src = await mkdtemp(join(tmpdir(), 'imp-flat-'))
    dirs.push(src)
    await writeFile(join(src, 'a.jpg'), Buffer.alloc(16, 1))
    await writeFile(join(src, 'b.png'), Buffer.alloc(16, 2))

    const libRoot = await mkdtemp(join(tmpdir(), 'imp-lib-'))
    dirs.push(libRoot)
    const store = new LibraryStore(libRoot)
    const result = await importLocalFolders(store, [src])

    expect(result.imported).toHaveLength(1)
    expect(result.imported[0]?.source).toBe('local')
    expect(result.imported[0]?.images).toEqual(['001.jpg', '002.png'])
    expect(await store.galleryExists('local', result.imported[0]!.galleryId)).toBe(true)
  })

  it('imports each immediate image subfolder as a gallery', async () => {
    const src = await mkdtemp(join(tmpdir(), 'imp-nest-'))
    dirs.push(src)
    const a = join(src, 'set-a')
    const b = join(src, 'set-b')
    const empty = join(src, 'empty')
    await mkdir(a)
    await mkdir(b)
    await mkdir(empty)
    await writeFile(join(a, '1.jpg'), Buffer.alloc(8, 1))
    await writeFile(join(b, '2.jpg'), Buffer.alloc(8, 2))
    await writeFile(join(src, 'root.jpg'), Buffer.alloc(8, 3))

    const libRoot = await mkdtemp(join(tmpdir(), 'imp-lib2-'))
    dirs.push(libRoot)
    const store = new LibraryStore(libRoot)
    const result = await importLocalFolders(store, [src])

    expect(result.imported).toHaveLength(2)
    const titles = result.imported.map((g) => g.title).sort()
    expect(titles).toEqual(['set-a', 'set-b'])
  })
})
