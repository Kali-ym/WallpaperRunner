import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryStore } from '@main/library/store'
import { AuthorAvatarStore } from '@main/library/authorAvatars'
import { syncWallpaperEngineProject } from '@main/wallpaper/exportWallpaper'

const dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

const tinyJpegBase64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQACEQADAP/Z'

describe('syncWallpaperEngineProject credit fields', () => {
  it('writes author and avatar path when avatar exists', async () => {
    const root = await mkdtemp(join(tmpdir(), 'we-credit-lib-'))
    const weDir = await mkdtemp(join(tmpdir(), 'we-credit-we-'))
    dirs.push(root, weDir)

    const store = new LibraryStore(root)
    await store.ensureRoot()
    await store.upsertGallery({
      source: 'xchina',
      galleryId: 'abc',
      title: '源标题',
      sourceUrl: 'https://example.com/a',
      author: '模特A',
      tags: [],
      pageCount: 1,
      cover: '001.jpg',
      images: ['001.jpg'],
      downloadedAt: '2026-09-24T00:00:00.000Z',
    })
    await store.renameGallery('xchina', 'abc', '显示名')

    const dirName = (await store.loadIndex())[0]!.dirName
    await mkdir(join(root, dirName), { recursive: true })
    await writeFile(join(root, dirName, '001.jpg'), 'x')

    const avatars = new AuthorAvatarStore(root)
    const record = await avatars.set('模特A', {
      source: 'xchina',
      galleryId: 'abc',
      dirName,
      imagePath: '001.jpg',
      crop: { x: 0, y: 0, width: 1, height: 1 },
      avatarJpegBase64: tinyJpegBase64,
    })

    await syncWallpaperEngineProject(store, weDir, 17989, undefined, avatars)

    const playlist = JSON.parse(await readFile(join(weDir, 'playlist.json'), 'utf8')) as {
      galleries: { title: string; author: string; avatar: string }[]
    }
    expect(playlist.galleries).toHaveLength(1)
    expect(playlist.galleries[0]!.title).toBe('显示名')
    expect(playlist.galleries[0]!.author).toBe('模特A')
    expect(playlist.galleries[0]!.avatar).toBe(record.relativePath.replace(/\\/g, '/'))
  })

  it('writes empty avatar and author when missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'we-credit-lib2-'))
    const weDir = await mkdtemp(join(tmpdir(), 'we-credit-we2-'))
    dirs.push(root, weDir)

    const store = new LibraryStore(root)
    await store.ensureRoot()
    await store.upsertGallery({
      source: 'local',
      galleryId: 'n1',
      title: '无作者',
      sourceUrl: '',
      author: '',
      tags: [],
      pageCount: 1,
      cover: '001.jpg',
      images: ['001.jpg'],
      downloadedAt: '2026-09-24T00:00:00.000Z',
    })
    const dirName = (await store.loadIndex())[0]!.dirName
    await mkdir(join(root, dirName), { recursive: true })
    await writeFile(join(root, dirName, '001.jpg'), 'x')

    await syncWallpaperEngineProject(store, weDir, 17989, undefined, new AuthorAvatarStore(root))

    const playlist = JSON.parse(await readFile(join(weDir, 'playlist.json'), 'utf8')) as {
      galleries: { author: string; avatar: string }[]
    }
    expect(playlist.galleries[0]!.author).toBe('')
    expect(playlist.galleries[0]!.avatar).toBe('')
  })
})
