import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { mergeGalleryId, normalizeMergeUrls } from '@main/adapters/telegram/merge'

describe('mergeGalleryId', () => {
  it('is stable regardless of input order', () => {
    const a = mergeGalleryId(['https://t.me/fooo/2', 'https://t.me/fooo/1'])
    const b = mergeGalleryId(['https://t.me/fooo/1', 'https://t.me/fooo/2'])
    expect(a).toBe(b)
  })

  it('uses readable id when all same channel', () => {
    const id = mergeGalleryId(['https://t.me/fooo/10', 'https://t.me/fooo/3'])
    expect(id).toBe('telegram_fooo_3_n2')
  })

  it('uses hash when channels differ', () => {
    const urls = ['https://t.me/aaaa/1', 'https://t.me/bbbb/2']
    const id = mergeGalleryId(urls)
    const sorted = normalizeMergeUrls(urls)
    const hash = createHash('sha1').update(sorted.join('|')).digest('hex').slice(0, 12)
    expect(id).toBe(`telegram_merge_${hash}`)
  })

  it('returns single-message gallery id for one url', () => {
    expect(mergeGalleryId(['https://t.me/fooo/99'])).toBe('telegram_fooo_99')
  })
})
