import { describe, it, expect } from 'vitest'
import {
  extractXchinaId,
  normalizeXchinaGalleryUrl,
  buildXchinaPageUrl,
} from '@main/adapters/xchina/urls'

describe('xchina urls', () => {
  it('extracts id from canonical and paged urls', () => {
    expect(extractXchinaId('https://xchina.co/photo/id-63c799bf45baf.html')).toBe(
      '63c799bf45baf',
    )
    expect(extractXchinaId('https://xchina.co/photo/id-63c799bf45baf/2.html')).toBe(
      '63c799bf45baf',
    )
  })
  it('returns null for unknown hosts', () => {
    expect(extractXchinaId('https://example.com/photo/id-abc.html')).toBeNull()
  })
  it('builds page urls', () => {
    expect(buildXchinaPageUrl('63c799bf45baf', 1)).toBe(
      'https://xchina.co/photo/id-63c799bf45baf/1.html',
    )
  })
  it('normalizes to gallery base', () => {
    expect(normalizeXchinaGalleryUrl('https://xchina.co/photo/id-63c799bf45baf/3.html')).toBe(
      'https://xchina.co/photo/id-63c799bf45baf.html',
    )
  })
})
