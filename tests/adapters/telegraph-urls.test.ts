import { describe, it, expect } from 'vitest'
import {
  extractTelegraphSlug,
  normalizeTelegraphUrl,
  matchTelegraphUrl,
  extractTelegraphUrlsFromText,
} from '@main/adapters/telegraph/urls'

describe('telegraph urls', () => {
  it('extracts slug and normalizes', () => {
    expect(extractTelegraphSlug('https://telegra.ph/Some-Article-01-02')).toBe(
      'Some-Article-01-02',
    )
    expect(normalizeTelegraphUrl('https://www.telegra.ph/Some-Article-01-02?foo=1')).toBe(
      'https://telegra.ph/Some-Article-01-02',
    )
  })

  it('rejects non-telegraph', () => {
    expect(matchTelegraphUrl('https://t.me/durov/1')).toBe(false)
  })

  it('extracts unique links from text', () => {
    const text =
      'see https://telegra.ph/Foo-01 and https://telegra.ph/Foo-01 again https://telegra.ph/Bar-02'
    expect(extractTelegraphUrlsFromText(text)).toEqual([
      'https://telegra.ph/Foo-01',
      'https://telegra.ph/Bar-02',
    ])
  })
})
