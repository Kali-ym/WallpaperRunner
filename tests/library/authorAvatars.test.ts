import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { authorKey, AuthorAvatarStore } from '../../src/main/library/authorAvatars'

describe('authorKey', () => {
  it('is stable and case-insensitive', () => {
    expect(authorKey('Alice')).toBe(authorKey('alice'))
    expect(authorKey(' Alice ')).toBe(authorKey('alice'))
  })
})

describe('AuthorAvatarStore.set', () => {
  it('writes renderer-cropped JPEG to avatar file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wr-avatar-'))
    const dirName = 'gallery-1'
    const imagePath = '001.webp'
    await mkdir(join(root, dirName), { recursive: true })
    await writeFile(join(root, dirName, imagePath), 'placeholder')

    const avatarJpegBase64 =
      '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQACEQADAP/Z'

    const store = new AuthorAvatarStore(root)
    const record = await store.set('Alice', {
      source: 'xchina',
      galleryId: 'g1',
      dirName,
      imagePath,
      crop: { x: 0, y: 0, width: 1, height: 1 },
      avatarJpegBase64,
    })

    const saved = await readFile(join(root, record.relativePath))
    expect(saved.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]))
    expect(record.author).toBe('Alice')
  })
})
