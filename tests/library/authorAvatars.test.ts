import { describe, expect, it } from 'vitest'
import { authorKey } from '../../src/main/library/authorAvatars'

describe('authorKey', () => {
  it('is stable and case-insensitive', () => {
    expect(authorKey('Alice')).toBe(authorKey('alice'))
    expect(authorKey(' Alice ')).toBe(authorKey('alice'))
  })
})
