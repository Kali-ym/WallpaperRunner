import { describe, expect, it, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PlaylistStore } from '@main/library/playlists'

describe('PlaylistStore', () => {
  const dirs: string[] = []
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  })

  it('creates and lists playlists', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pl-'))
    dirs.push(root)
    const store = new PlaylistStore(root)
    const a = await store.create('竖图')
    expect(a.id.startsWith('pl_')).toBe(true)
    expect(a.name).toBe('竖图')
    const list = await store.list()
    expect(list).toHaveLength(1)
  })

  it('setMembers dedupes and pruneMissing drops dead refs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pl-'))
    dirs.push(root)
    const store = new PlaylistStore(root)
    const pl = await store.create('A')
    await store.setMembers(pl.id, [
      { source: 'xchina', galleryId: '1' },
      { source: 'xchina', galleryId: '1' },
      { source: 'telegram', galleryId: '2' },
    ])
    const loaded = (await store.list())[0]
    expect(loaded.galleryRefs).toHaveLength(2)

    const removed = await store.pruneMissing([
      {
        source: 'xchina',
        galleryId: '1',
        title: 't',
        author: '',
        tags: [],
        cover: null,
        imageCount: 1,
        dirName: 'd',
        downloadedAt: new Date().toISOString(),
        favorite: false,
      },
    ])
    expect(removed).toBe(1)
    expect((await store.list())[0].galleryRefs).toEqual([{ source: 'xchina', galleryId: '1' }])
  })
})
