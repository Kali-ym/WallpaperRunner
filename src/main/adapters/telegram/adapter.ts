import type { GalleryParseResult, ParseContext, SourceAdapter } from '../types'
import type { ResourceManifest } from '../../resources/types'
import { listManifestItems } from '../../resources/types'
import { discoverTelegramMany } from './merge'
import type { MediaHandle } from './discover'
import { matchTelegramUrl, isPrivateTelegramMessageUrl } from './urls'
import { telegramService } from '../../telegram/client'

export type { DiscoverTelegramResult, MediaHandle } from './discover'

export async function discoverTelegramWithClient(
  url: string,
  apiId: number,
  apiHash: string,
  ctx: ParseContext,
): Promise<{ manifest: ResourceManifest; handles: Map<string, MediaHandle> }> {
  return discoverTelegramUrlsWithClient([url], apiId, apiHash, ctx)
}

export async function discoverTelegramUrlsWithClient(
  urls: string[],
  apiId: number,
  apiHash: string,
  ctx: ParseContext,
): Promise<{ manifest: ResourceManifest; handles: Map<string, MediaHandle> }> {
  for (const url of urls) {
    if (isPrivateTelegramMessageUrl(url)) {
      throw new Error('暂不支持私密频道链接（t.me/c/...），请使用公开用户名链接')
    }
  }
  const client = await telegramService.getClient(apiId, apiHash)
  const status = telegramService.getStatus()
  if (status.state !== 'authorized') {
    throw new Error('请先在设置中登录 Telegram')
  }
  return discoverTelegramMany(client, urls, ctx.fetchText, ctx.signal)
}

export const telegramAdapter: SourceAdapter = {
  id: 'telegram',
  name: 'Telegram',
  match(url: string): boolean {
    return matchTelegramUrl(url) || isPrivateTelegramMessageUrl(url)
  },
  needsSelection(): boolean {
    return true
  },
  async discover(url: string, ctx: ParseContext): Promise<ResourceManifest> {
    if (!ctx.telegramApiId || !ctx.telegramApiHash) {
      throw new Error('请先在设置中填写 api_id / api_hash 并登录')
    }
    const { manifest } = await discoverTelegramWithClient(
      url,
      ctx.telegramApiId,
      ctx.telegramApiHash,
      ctx,
    )
    return manifest
  },
  async parseGallery(): Promise<GalleryParseResult> {
    throw new Error('Telegram 需要先解析并勾选资源后再下载')
  },
}

export function manifestToParseResult(manifest: ResourceManifest): GalleryParseResult {
  const items = listManifestItems(manifest)
  return {
    source: manifest.source,
    galleryId: manifest.galleryId,
    title: manifest.title,
    sourceUrl: manifest.sourceUrl,
    author: manifest.author ?? '',
    tags: [],
    pageCount: 1,
    coverUrl: null,
    images: items
      .filter((i) => i.downloadUrl)
      .map((i, idx) => ({ index: idx + 1, url: i.downloadUrl! })),
  }
}
