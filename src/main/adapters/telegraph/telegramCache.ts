import type { TelegramClient } from 'telegram'
import { Api } from 'telegram'
import type { ResourceItem, ResourceManifest } from '../../resources/types'
import type { MediaHandle, TelegramCachedMediaHandle } from '../../resources/handles'
import { extractTelegraphSlug, normalizeTelegraphUrl } from './urls'
import { collectTelegraphPageMedia } from './pageMedia'

let seq = 0
function nextManifestId(): string {
  return `manifest_${Date.now()}_${seq++}`
}

export interface DiscoverTelegraphCachedResult {
  manifest: ResourceManifest
  handles: Map<string, MediaHandle>
}

/**
 * Resolve Telegraph via messages.getWebPage — Telegram often caches page photos
 * even when external hosts (imgbb etc.) are already 404.
 */
export async function discoverTelegraphViaTelegram(
  client: TelegramClient,
  url: string,
): Promise<DiscoverTelegraphCachedResult | null> {
  const slug = extractTelegraphSlug(url)
  if (!slug) return null
  const sourceUrl = normalizeTelegraphUrl(url)!

  const res = await client.invoke(new Api.messages.GetWebPage({ url: sourceUrl, hash: 0 }))
  const wp = res.webpage
  if (!(wp instanceof Api.WebPage) || !wp.cachedPage) {
    return null
  }

  const page = wp.cachedPage
  const handles = new Map<string, MediaHandle>()
  const items: ResourceItem[] = []

  const media = collectTelegraphPageMedia(page, wp.photo)
  for (let i = 0; i < media.length; i++) {
    const entry = media[i]
    const id = `telegraph:tgcache:${slug}:${entry.kind}:${i}`
    if (entry.kind === 'photo') {
      items.push({
        id,
        origin: 'telegraph',
        kind: 'telegraph_image',
        label: `Telegraph · 图片 ${i + 1}`,
      })
      const handle: TelegramCachedMediaHandle = { kind: 'telegram_media', media: entry.media }
      handles.set(id, handle)
      continue
    }

    const doc = entry.media
    const mime = doc.mimeType ?? ''
    const isImage = mime.startsWith('image/')
    let fileName: string | undefined
    for (const attr of doc.attributes ?? []) {
      if (attr instanceof Api.DocumentAttributeFilename) fileName = attr.fileName
    }
    items.push({
      id,
      origin: 'telegraph',
      kind: isImage ? 'telegraph_image' : 'telegraph_file',
      label: `Telegraph · ${isImage ? '图片' : '文件'} ${i + 1}`,
      fileName,
      mimeType: mime,
      size: typeof doc.size === 'number' ? doc.size : Number(doc.size),
    })
    handles.set(id, { kind: 'telegram_media', media: doc })
  }

  if (items.length === 0) return null

  const title = wp.title || slug
  const author = wp.author || undefined

  return {
    manifest: {
      id: nextManifestId(),
      source: 'telegraph',
      sourceUrl,
      title,
      author,
      galleryId: slug,
      groups: {
        post: [],
        comments: [],
        telegraph: [{ url: sourceUrl, title, items }],
      },
    },
    handles,
  }
}
