import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { parseXchinaPage, upgradeThumbToOriginal } from '@main/adapters/xchina/parsePage'

const fix = (name: string): string =>
  readFileSync(path.join(__dirname, '../../fixtures/xchina', name), 'utf8')

describe('upgradeThumbToOriginal', () => {
  it('strips xchina size suffix to jpg', () => {
    expect(
      upgradeThumbToOriginal('https://img.xchina.io/photos/abc/0001_600x0.webp'),
    ).toBe('https://img.xchina.io/photos/abc/0001.jpg')
    expect(
      upgradeThumbToOriginal('https://img.xchina.io/photos2/abc/0001_600x0.webp'),
    ).toBe('https://img.xchina.io/photos2/abc/0001.jpg')
  })
})

describe('parseXchinaPage', () => {
  it('reads metadata and photo backgrounds on page 1', () => {
    const r = parseXchinaPage(fix('page1.html'), 'https://xchina.co/photo/id-63c799bf45baf/1.html')
    expect(r.title).toContain('黏黏团子兔')
    expect(r.author).toContain('咬一口兔娘')
    expect(r.tags).toEqual(expect.arrayContaining(['国模套图']))
    expect(r.pageCount).toBe(4)
    expect(r.images.length).toBe(5)
    expect(r.images[0].originalCandidate).toBe(
      'https://img.xchina.io/photos/63c799bf45baf/0001.jpg',
    )
    expect(r.images[0].thumbOrLink).toContain('_600x0.webp')
    expect(r.images[4].originalCandidate).toBe(
      'https://img.xchina.io/photos2/demo/0005.jpg',
    )
  })

  it('parses live photos2 CDN gallery', () => {
    let live: string
    try {
      live = fix('debug-64f6fc33f1832.html')
    } catch {
      return
    }
    const r = parseXchinaPage(live, 'https://xchina.co/photo/id-64f6fc33f1832/1.html')
    expect(r.title).toContain('喵小吉')
    expect(r.images.length).toBeGreaterThan(0)
    expect(r.images[0].originalCandidate).toContain('/photos2/')
    expect(r.images[0].originalCandidate).toMatch(/\.jpg$/)
  })

  it('parses later pages', () => {
    const r = parseXchinaPage(fix('page2.html'), 'https://xchina.co/photo/id-63c799bf45baf/2.html')
    expect(r.pageCount).toBe(4)
    expect(r.images.length).toBe(2)
    expect(r.images[0].originalCandidate).toContain('0015.jpg')
  })

  it('parses captured live HTML when present', () => {
    let live: string
    try {
      live = fix('live-page1.html')
    } catch {
      return
    }
    const r = parseXchinaPage(live, 'https://xchina.co/photo/id-63c799bf45baf/1.html')
    expect(r.title).toContain('黏黏团子兔')
    expect(r.pageCount).toBe(4)
    expect(r.images.length).toBeGreaterThanOrEqual(10)
    expect(r.images.every((i) => i.originalCandidate.endsWith('.jpg'))).toBe(true)
  })
})
