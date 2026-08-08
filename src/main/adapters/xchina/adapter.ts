import type { GalleryParseResult, ParsedImage, ParseContext, SourceAdapter } from '../types'
import { parseXchinaPage } from './parsePage'
import { buildXchinaPageUrl, extractXchinaId, normalizeXchinaGalleryUrl } from './urls'

export const xchinaAdapter: SourceAdapter = {
  id: 'xchina',
  name: 'xChina',
  match(url: string): boolean {
    return extractXchinaId(url) !== null
  },
  async parseGallery(url: string, ctx: ParseContext): Promise<GalleryParseResult> {
    const galleryId = extractXchinaId(url)
    if (!galleryId) {
      throw new Error(`无法从 URL 解析套图 ID: ${url}`)
    }

    const sourceUrl = normalizeXchinaGalleryUrl(url)!
    const firstHtml = await ctx.fetchText(buildXchinaPageUrl(galleryId, 1))
    const first = parseXchinaPage(firstHtml, buildXchinaPageUrl(galleryId, 1))

    const images: ParsedImage[] = []
    for (const img of first.images) {
      images.push({ index: images.length + 1, url: img.originalCandidate })
    }

    for (let page = 2; page <= first.pageCount; page++) {
      if (ctx.signal?.aborted) throw new Error('已取消')
      const pageUrl = buildXchinaPageUrl(galleryId, page)
      const html = await ctx.fetchText(pageUrl)
      const parsed = parseXchinaPage(html, pageUrl)
      for (const img of parsed.images) {
        images.push({ index: images.length + 1, url: img.originalCandidate })
      }
    }

    return {
      source: 'xchina',
      galleryId,
      title: first.title || galleryId,
      sourceUrl,
      author: first.author,
      tags: first.tags,
      pageCount: first.pageCount,
      coverUrl: images[0]?.url ?? null,
      images,
    }
  },
}
