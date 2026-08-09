import { createHash } from 'node:crypto'
import type { TelegramClient } from 'telegram'
import type {
  MessageResourceGroup,
  ResourceItem,
  ResourceManifest,
} from '../../resources/types'
import type { MediaHandle } from '../../resources/handles'
import {
  normalizeTelegramMessageUrl,
  parseTelegramMessageUrl,
  type TelegramMessageRef,
} from './urls'
import { discoverTelegramMessage, type DiscoverTelegramResult } from './discover'

export function normalizeMergeUrls(urls: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of urls) {
    const n = normalizeTelegramMessageUrl(raw)
    if (!n || seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out.sort((a, b) => a.localeCompare(b))
}

export function mergeGalleryId(urls: string[]): string {
  const normalized = normalizeMergeUrls(urls)
  if (normalized.length === 0) throw new Error('请至少提供一条 Telegram 链接')
  if (normalized.length === 1) {
    const ref = parseTelegramMessageUrl(normalized[0])!
    return `telegram_${ref.channel}_${ref.messageId}`
  }

  const refs = normalized.map((u) => parseTelegramMessageUrl(u)!) as TelegramMessageRef[]
  const sameChannel = refs.every((r) => r.channel === refs[0].channel)
  if (sameChannel) {
    const firstId = Math.min(...refs.map((r) => r.messageId))
    return `telegram_${refs[0].channel}_${firstId}_n${refs.length}`
  }

  const hash = createHash('sha1').update(normalized.join('|')).digest('hex').slice(0, 12)
  return `telegram_merge_${hash}`
}

function prefixIds(
  items: ResourceItem[],
  prefix: string,
  handles: Map<string, MediaHandle>,
  outHandles: Map<string, MediaHandle>,
): ResourceItem[] {
  return items.map((item) => {
    const id = `${prefix}:${item.id}`
    const h = handles.get(item.id)
    if (h) outHandles.set(id, h)
    return {
      ...item,
      id,
      commentId: item.commentId ? `${prefix}:${item.commentId}` : item.commentId,
    }
  })
}

export async function discoverTelegramMany(
  client: TelegramClient,
  urls: string[],
  fetchText: (u: string) => Promise<string>,
  signal?: AbortSignal,
): Promise<DiscoverTelegramResult> {
  const normalized = normalizeMergeUrls(urls)
  if (normalized.length === 0) throw new Error('请至少提供一条 Telegram 链接')

  if (normalized.length === 1) {
    return discoverTelegramMessage(client, normalized[0], fetchText, signal)
  }

  const galleryId = mergeGalleryId(normalized)
  const handles = new Map<string, MediaHandle>()
  const messageGroups: MessageResourceGroup[] = []
  const allPost: ResourceItem[] = []
  const allComments: ResourceManifest['groups']['comments'] = []
  const allTelegraph: ResourceManifest['groups']['telegraph'] = []

  // Discover in user paste order (not sorted) for 消息 1..N labeling
  const ordered: string[] = []
  const seen = new Set<string>()
  for (const raw of urls) {
    const n = normalizeTelegramMessageUrl(raw)
    if (!n || seen.has(n)) continue
    seen.add(n)
    ordered.push(n)
  }

  for (let i = 0; i < ordered.length; i++) {
    if (signal?.aborted) throw new Error('已取消')
    const url = ordered[i]
    const prefix = `m${i + 1}`
    const part = await discoverTelegramMessage(client, url, fetchText, signal)
    const post = prefixIds(part.manifest.groups.post, prefix, part.handles, handles)
    const comments = part.manifest.groups.comments.map((c) => ({
      ...c,
      commentId: `${prefix}:${c.commentId}`,
      items: prefixIds(c.items, prefix, part.handles, handles),
    }))
    const telegraph = part.manifest.groups.telegraph.map((g) => ({
      ...g,
      items: prefixIds(g.items, prefix, part.handles, handles),
    }))

    messageGroups.push({
      messageIndex: i + 1,
      sourceUrl: url,
      title: part.manifest.title,
      post,
      comments,
      telegraph,
    })
    allPost.push(...post)
    allComments.push(...comments)
    allTelegraph.push(...telegraph)
  }

  const title =
    messageGroups[0]?.title && ordered.length > 1
      ? `${messageGroups[0].title} 等 ${ordered.length} 条消息`
      : messageGroups[0]?.title || galleryId

  const manifest: ResourceManifest = {
    id: `manifest_${Date.now()}_merge`,
    source: 'telegram',
    sourceUrl: JSON.stringify(ordered),
    title,
    author: parseTelegramMessageUrl(ordered[0])?.channel,
    galleryId,
    groups: {
      post: allPost,
      comments: allComments,
      telegraph: allTelegraph,
    },
    messageGroups,
  }

  return { manifest, handles }
}
