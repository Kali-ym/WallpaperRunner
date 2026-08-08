import { describe, it, expect } from 'vitest'
import { sanitizeFolderName } from '@main/library/sanitize'

describe('sanitizeFolderName', () => {
  it('strips illegal path characters', () => {
    expect(sanitizeFolderName('a/b:c*?"<>|')).toBe('a_b_c______')
  })
  it('trims and collapses whitespace', () => {
    expect(sanitizeFolderName('  咬一口  兔兔  ')).toBe('咬一口 兔兔')
  })
})
