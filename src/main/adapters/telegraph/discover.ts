import type { TelegramClient } from 'telegram'
import type { ResourceManifest } from '../../resources/types'
import type { MediaHandle } from '../../resources/handles'
import type { ParseContext } from '../types'
import { discoverTelegraph } from './adapter'
import { discoverTelegraphViaTelegram } from './telegramCache'

export interface DiscoverTelegraphResult {
  manifest: ResourceManifest
  handles: Map<string, MediaHandle>
  cacheUsed: boolean
}

/** Prefer Telegram cached media; fall back to scraping telegra.ph when cache is unavailable. */
export async function discoverTelegraphBestEffort(
  url: string,
  ctx: ParseContext,
  client?: TelegramClient | null,
): Promise<DiscoverTelegraphResult> {
  if (client) {
    try {
      const cached = await discoverTelegraphViaTelegram(client, url)
      const cachedItems = cached?.manifest.groups.telegraph[0]?.items.length ?? 0
      if (cached && cachedItems > 0) {
        console.info(`[telegraph] using Telegram cache: ${cachedItems} items`)
        return { manifest: cached.manifest, handles: cached.handles, cacheUsed: true }
      }
      console.warn('[telegraph] no telegram cache, falling back to HTTP scrape')
    } catch (err) {
      console.warn('[telegraph] telegram cache failed, falling back to HTTP scrape', err)
    }
  }

  const manifest = await discoverTelegraph(url, ctx)
  const handles = new Map<string, MediaHandle>()
  for (const g of manifest.groups.telegraph) {
    for (const item of g.items) {
      if (item.downloadUrl) {
        handles.set(item.id, { kind: 'http', url: item.downloadUrl })
      }
    }
  }
  return { manifest, handles, cacheUsed: false }
}
