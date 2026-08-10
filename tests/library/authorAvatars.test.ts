import { describe, expect, it } from 'vitest'
import {
  authorKey,
  buildAuthorCoverMap,
  defaultAuthorCoverEntry,
} from '../../src/main/library/authorAvatars'
import type { LibraryIndexEntry } from '../../src/main/library/store'

function entry(
  partial: Partial<LibraryIndexEntry> & Pick<LibraryIndexEntry, 'author' | 'downloadedAt'>,
): LibraryIndexEntry {
  return {
    source: 'x',
    galleryId: '1',
    title: 't',
    tags: [],
    cover: 'cover.jpg',
    imageCount: 1,
    dirName: 'dir',
    favorite: false,
    ...partial,
  }
}

describe('authorKey', () => {
  it('is stable and case-insensitive', () => {
    expect(authorKey('Alice')).toBe(authorKey('alice'))
    expect(authorKey(' Alice ')).toBe(authorKey('alice'))
  })
})

describe('defaultAuthorCoverEntry', () => {
  it('picks earliest downloaded gallery with cover', () => {
    const lib = [
      entry({ author: 'A', downloadedAt: '2024-02-01', galleryId: '2', title: 'second' }),
      entry({ author: 'A', downloadedAt: '2024-01-01', galleryId: '1', title: 'first' }),
    ]
    const hit = defaultAuthorCoverEntry(lib, 'A')
    expect(hit?.galleryId).toBe('1')
  })
})

describe('buildAuthorCoverMap', () => {
  it('maps each author to first downloaded cover', () => {
    const lib = [
      entry({ author: 'A', downloadedAt: '2024-02-01', galleryId: '2' }),
      entry({ author: 'A', downloadedAt: '2024-01-01', galleryId: '1' }),
      entry({ author: 'B', downloadedAt: '2024-03-01', galleryId: '3' }),
    ]
    const map = buildAuthorCoverMap(lib)
    expect(map.get('A')?.galleryId).toBe('1')
    expect(map.get('B')?.galleryId).toBe('3')
  })
})
