import { describe, expect, it } from 'vitest'
import { nextImageStartIndex, isArchiveFileName } from '@main/library/imageIndex'

describe('isArchiveFileName', () => {
  it('detects zip 7z rar', () => {
    expect(isArchiveFileName('a.zip')).toBe(true)
    expect(isArchiveFileName('a.7z')).toBe(true)
    expect(isArchiveFileName('a.rar')).toBe(true)
    expect(isArchiveFileName('001.jpg')).toBe(false)
  })
})

describe('nextImageStartIndex', () => {
  it('starts at 1 when empty', () => {
    expect(nextImageStartIndex([])).toBe(1)
  })

  it('continues after max numeric prefix among images only', () => {
    expect(nextImageStartIndex(['001.jpg', '040.png', 'pack.zip'])).toBe(41)
  })

  it('ignores non-numbered image names', () => {
    expect(nextImageStartIndex(['cover.jpg', '002.webp'])).toBe(3)
  })
})
