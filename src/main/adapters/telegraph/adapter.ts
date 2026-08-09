import type { GalleryParseResult, ParseContext, SourceAdapter } from '../types'
import type { ResourceItem, ResourceManifest } from '../../resources/types'
import { parseTelegraphHtml } from './parse'
import { extractTelegraphSlug, matchTelegraphUrl, normalizeTelegraphUrl } from './urls'

let seq = 0

function nextManifestId(): string {
  return `manifest_${Date.now()}_${seq++}`
}

export async function discoverTelegraph(
  url: string,
  ctx: ParseContext,
): Promise<ResourceManifest> {
  const slug = extractTelegraphSlug(url)
  if (!slug) throw new Error(`无法解析 Telegraph URL: ${url}`)
  const sourceUrl = normalizeTelegraphUrl(url)!
  const html = await ctx.fetchText(sourceUrl)
  if (ctx.signal?.aborted) throw new Error('已取消')
  const parsed = parseTelegraphHtml(html, sourceUrl)

  const items: ResourceItem[] = parsed.assets.map((asset, i) => ({
    id: `telegraph:${slug}:${i}`,
    origin: 'telegraph' as const,
    kind: asset.kind,
    label: `Telegraph · ${asset.kind === 'telegraph_image' ? '图片' : '文件'} ${i + 1}`,
    fileName: asset.fileName,
    downloadUrl: asset.url,
  }))

  return {
    id: nextManifestId(),
    source: 'telegraph',
    sourceUrl,
    title: parsed.title || slug,
    author: parsed.author || undefined,
    galleryId: slug,
    groups: {
      post: [],
      comments: [],
      telegraph: [{ url: sourceUrl, title: parsed.title, items }],
    },
  }
}

export const telegraphAdapter: SourceAdapter = {
  id: 'telegraph',
  name: 'Telegraph',
  match(url: string): boolean {
    return matchTelegraphUrl(url)
  },
  needsSelection(): boolean {
    return true
  },
  async discover(url: string, ctx: ParseContext): Promise<ResourceManifest> {
    return discoverTelegraph(url, ctx)
  },
  async parseGallery(url: string, ctx: ParseContext): Promise<GalleryParseResult> {
    const manifest = await discoverTelegraph(url, ctx)
    const assets = manifest.groups.telegraph.flatMap((g) => g.items)
    return {
      source: 'telegraph',
      galleryId: manifest.galleryId,
      title: manifest.title,
      sourceUrl: manifest.sourceUrl,
      author: manifest.author ?? '',
      tags: [],
      pageCount: 1,
      coverUrl: assets.find((a) => a.kind === 'telegraph_image')?.downloadUrl ?? null,
      images: assets
        .filter((a) => a.downloadUrl)
        .map((a, i) => ({ index: i + 1, url: a.downloadUrl! })),
    }
  },
}
