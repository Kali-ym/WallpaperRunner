import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { parseXchinaPage } from '@main/adapters/xchina/parsePage'

const fix = (name: string): string =>
  readFileSync(path.join(__dirname, '../../fixtures/xchina', name), 'utf8')

describe('parseXchinaPage', () => {
  it('reads metadata and skips ads on page 1', () => {
    const r = parseXchinaPage(fix('page1.html'), 'https://xchina.co/photo/id-63c799bf45baf/1.html')
    expect(r.title).toContain('黏黏团子兔')
    expect(r.author).toContain('咬一口兔娘')
    expect(r.tags.length).toBeGreaterThan(0)
    expect(r.pageCount).toBe(4)
    expect(r.images.length).toBe(4)
    expect(r.images.every((i) => !/ad|promo|妻社/i.test(i.originalCandidate))).toBe(true)
    expect(r.images[0].originalCandidate).toContain('/001.jpg')
    expect(r.images[0].originalCandidate).not.toContain('/thumb/')
  })

  it('parses later pages', () => {
    const r = parseXchinaPage(fix('page2.html'), 'https://xchina.co/photo/id-63c799bf45baf/2.html')
    expect(r.pageCount).toBe(4)
    expect(r.images.length).toBe(2)
    expect(r.images[0].originalCandidate).toContain('015.jpg')
  })
})
