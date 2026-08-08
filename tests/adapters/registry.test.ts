import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import type { SourceAdapter } from '@main/adapters/types'
import { clearAdapters, registerAdapter, resolveAdapter } from '@main/adapters/registry'
import { xchinaAdapter } from '@main/adapters/xchina/adapter'

const fix = (name: string): string =>
  readFileSync(path.join(__dirname, '../../fixtures/xchina', name), 'utf8')

const fake: SourceAdapter = {
  id: 'fake',
  name: 'Fake',
  match: (u) => u.includes('fake.test'),
  parseGallery: async () => {
    throw new Error('not used')
  },
}

describe('registry', () => {
  beforeEach(() => clearAdapters())

  it('resolves matching adapter', () => {
    registerAdapter(fake)
    expect(resolveAdapter('https://fake.test/a')?.id).toBe('fake')
  })

  it('returns null when unsupported', () => {
    expect(resolveAdapter('https://nope.example/')).toBeNull()
  })
})

describe('xchinaAdapter.parseGallery', () => {
  it('merges pages via fetchText fixtures', async () => {
    const result = await xchinaAdapter.parseGallery(
      'https://xchina.co/photo/id-63c799bf45baf.html',
      {
        fetchText: async (url) => {
          if (url.includes('/1.html')) return fix('page1.html')
          if (url.includes('/2.html')) return fix('page2.html')
          if (url.includes('/3.html') || url.includes('/4.html')) {
            return `<html><body><h1>黏黏团子兔《粉嫩JK》</h1><div class="pager"><a href="/photo/id-63c799bf45baf/4.html">4</a></div><div class="photos"></div></body></html>`
          }
          throw new Error(`unexpected url ${url}`)
        },
      },
    )

    expect(result.source).toBe('xchina')
    expect(result.galleryId).toBe('63c799bf45baf')
    expect(result.pageCount).toBe(4)
    expect(result.images.length).toBe(7)
    expect(result.images[0].index).toBe(1)
    expect(result.images.at(-1)?.index).toBe(7)
  })
})
