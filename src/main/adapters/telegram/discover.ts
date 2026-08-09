import bigIntLib from 'big-integer'
import type { TelegramClient } from 'telegram'
import { Api } from 'telegram'
import type {
  CommentResourceGroup,
  ResourceItem,
  ResourceKind,
  ResourceManifest,
  TelegraphResourceGroup,
} from '../../resources/types'
import type { MediaHandle } from '../../resources/handles'
import { discoverTelegraph } from '../telegraph/adapter'
import { discoverTelegraphViaTelegram } from '../telegraph/telegramCache'
import { extractTelegraphUrlsFromText } from '../telegraph/urls'
import { normalizeTelegramMessageUrl, parseTelegramMessageUrl } from './urls'

export type {
  MediaHandle,
  TelegramMediaHandle,
  HttpMediaHandle,
  TelegramCachedMediaHandle,
} from '../../resources/handles'

const bigInt =
  typeof bigIntLib === 'function'
    ? bigIntLib
    : ((bigIntLib as { default: typeof bigIntLib }).default as typeof bigIntLib)

/** Subset of GramJS custom Message helpers we rely on. */
interface TgMessage {
  id: number
  message?: string
  groupedId?: unknown
  photo?: unknown
  gif?: unknown
  video?: unknown
  document?: unknown
  chatId?: unknown
}

export interface DiscoverTelegramResult {
  manifest: ResourceManifest
  handles: Map<string, MediaHandle>
}

let seq = 0
function nextManifestId(): string {
  return `manifest_${Date.now()}_${seq++}`
}

function messageText(msg: TgMessage): string {
  return (msg.message ?? '').toString()
}

function classifyMessage(msg: TgMessage): ResourceKind | null {
  if (msg.photo) return 'photo'
  if (msg.gif) return 'animation'
  if (msg.video) return 'video'
  if (msg.document) {
    const doc = msg.document
    if (doc && typeof doc === 'object' && 'mimeType' in doc) {
      const mime = String((doc as { mimeType?: string }).mimeType ?? '')
      if (mime.startsWith('video/')) return 'video'
      if (mime === 'image/gif' || mime === 'image/webp') return 'animation'
      if (mime.startsWith('image/')) return 'photo'
    }
    return 'document'
  }
  return null
}

function fileMeta(msg: TgMessage): { fileName?: string; mimeType?: string; size?: number } {
  const doc = msg.document as
    | {
        mimeType?: string
        size?: { toJSNumber?: () => number } | number
        attributes?: Api.TypeDocumentAttribute[]
      }
    | undefined
  if (!doc || typeof doc !== 'object') return {}
  let fileName: string | undefined
  for (const attr of doc.attributes ?? []) {
    if (attr instanceof Api.DocumentAttributeFilename) {
      fileName = attr.fileName
    }
  }
  const sizeRaw = doc.size
  const size =
    typeof sizeRaw === 'number'
      ? sizeRaw
      : sizeRaw && typeof sizeRaw === 'object' && typeof sizeRaw.toJSNumber === 'function'
        ? sizeRaw.toJSNumber()
        : undefined
  return { fileName, mimeType: doc.mimeType, size }
}

function kindLabel(kind: ResourceKind): string {
  switch (kind) {
    case 'photo':
      return 'image'
    case 'video':
      return 'video'
    case 'animation':
      return 'animation'
    case 'document':
      return 'file'
    case 'telegraph_image':
      return 'telegraph image'
    case 'telegraph_file':
      return 'telegraph file'
    default:
      return kind
  }
}

function kindLabelZh(kind: ResourceKind): string {
  switch (kind) {
    case 'photo':
      return '图片'
    case 'video':
      return '视频'
    case 'animation':
      return '动图'
    case 'document':
      return '文件'
    case 'telegraph_image':
      return 'Telegraph 图片'
    case 'telegraph_file':
      return 'Telegraph 文件'
    default:
      return kindLabel(kind)
  }
}

async function collectAlbumMessages(
  client: TelegramClient,
  peer: string,
  center: TgMessage,
): Promise<TgMessage[]> {
  if (!center.groupedId) return [center]
  const id = center.id
  const around = (await client.getMessages(peer, {
    minId: Math.max(1, id - 20),
    maxId: id + 20,
    limit: 50,
  })) as TgMessage[]
  const gid = center.groupedId
  const album = around
    .filter((m) => m && m.groupedId && String(m.groupedId) === String(gid))
    .sort((a, b) => a.id - b.id)
  return album.length > 0 ? album : [center]
}

async function fetchCommentMessages(
  client: TelegramClient,
  channelPeer: string,
  messageId: number,
): Promise<{ peer: string; messages: TgMessage[] }> {
  try {
    const discussion = await client.invoke(
      new Api.messages.GetDiscussionMessage({
        peer: channelPeer,
        msgId: messageId,
      }),
    )
    const discussionMsg = discussion.messages.find((m) => m instanceof Api.Message) as
      | Api.Message
      | undefined
    if (!discussionMsg) {
      return { peer: channelPeer, messages: [] }
    }

    const discussionPeer = discussionMsg.peerId
    const replies = await client.invoke(
      new Api.messages.GetReplies({
        peer: discussionPeer,
        msgId: discussionMsg.id,
        offsetId: 0,
        offsetDate: 0,
        addOffset: 0,
        limit: 100,
        maxId: 0,
        minId: 0,
        hash: bigInt(0),
      }),
    )

    if (
      !(replies instanceof Api.messages.ChannelMessages || replies instanceof Api.messages.Messages)
    ) {
      return { peer: channelPeer, messages: [] }
    }

    const ids = replies.messages
      .map((m) => ('id' in m ? Number(m.id) : null))
      .filter((id): id is number => typeof id === 'number' && id > 0)

    const entity = await client.getEntity(discussionPeer)
    const msgs = ids.length
      ? ((await client.getMessages(entity, { ids })) as TgMessage[]).filter(Boolean)
      : []

    const ent = entity as { username?: string; id?: { toString: () => string } }
    const peerKey = ent.username ? String(ent.username) : String(ent.id ?? discussionPeer)
    return { peer: peerKey, messages: msgs }
  } catch {
    return { peer: channelPeer, messages: [] }
  }
}

export async function discoverTelegramMessage(
  client: TelegramClient,
  url: string,
  fetchText: (u: string) => Promise<string>,
  signal?: AbortSignal,
): Promise<DiscoverTelegramResult> {
  const ref = parseTelegramMessageUrl(url)
  if (!ref) throw new Error(`无法解析 Telegram URL: ${url}`)
  const sourceUrl = normalizeTelegramMessageUrl(url)!
  const peer = ref.channel

  const messages = (await client.getMessages(peer, { ids: ref.messageId })) as TgMessage[]
  const main = messages[0]
  if (!main) throw new Error(`未找到消息: ${sourceUrl}`)
  if (signal?.aborted) throw new Error('已取消')

  const album = await collectAlbumMessages(client, peer, main)
  const handles = new Map<string, MediaHandle>()
  const postItems: ResourceItem[] = []
  let photoIdx = 0
  let videoIdx = 0
  let animIdx = 0
  let docIdx = 0

  for (const msg of album) {
    const kind = classifyMessage(msg)
    if (!kind) continue
    let n = 0
    if (kind === 'photo') n = ++photoIdx
    else if (kind === 'video') n = ++videoIdx
    else if (kind === 'animation') n = ++animIdx
    else n = ++docIdx
    const id = `tg:post:${msg.id}:${kind}`
    const meta = fileMeta(msg)
    postItems.push({
      id,
      origin: 'post',
      kind,
      label: `主帖 · ${kindLabelZh(kind)} ${n}`,
      fileName: meta.fileName,
      mimeType: meta.mimeType,
      size: meta.size,
    })
    handles.set(id, { kind: 'telegram', peer, messageId: msg.id })
  }

  const comments: CommentResourceGroup[] = []
  const { peer: commentPeer, messages: commentMsgs } = await fetchCommentMessages(
    client,
    peer,
    ref.messageId,
  )
  if (signal?.aborted) throw new Error('已取消')

  let commentIndex = 0
  for (const cmsg of commentMsgs) {
    commentIndex += 1
    const items: ResourceItem[] = []
    const kind = classifyMessage(cmsg)
    if (kind) {
      const id = `tg:comment:${cmsg.id}:${kind}`
      const meta = fileMeta(cmsg)
      items.push({
        id,
        origin: 'comment',
        kind,
        label: `评论 #${commentIndex} · ${kindLabelZh(kind)}`,
        commentId: String(cmsg.id),
        commentIndex,
        fileName: meta.fileName,
        mimeType: meta.mimeType,
        size: meta.size,
      })
      handles.set(id, {
        kind: 'telegram',
        peer: commentPeer,
        messageId: cmsg.id,
      })
    }

    const text = messageText(cmsg)
    const preview = text.slice(0, 80)
    if (items.length > 0 || extractTelegraphUrlsFromText(text).length > 0) {
      comments.push({
        commentId: String(cmsg.id),
        index: commentIndex,
        textPreview: preview || undefined,
        items,
      })
    }
  }

  const telegraphGroups: TelegraphResourceGroup[] = []
  const allTexts: { text: string; origin: 'post' | 'comment'; commentId?: string }[] = [
    { text: messageText(main), origin: 'post' },
  ]
  for (const c of comments) {
    const cmsg = commentMsgs.find((m) => String(m.id) === c.commentId)
    if (cmsg) {
      allTexts.push({
        text: messageText(cmsg),
        origin: 'comment',
        commentId: c.commentId,
      })
    }
  }

  const seenTgph = new Set<string>()
  for (const entry of allTexts) {
    for (const tgUrl of extractTelegraphUrlsFromText(entry.text)) {
      if (seenTgph.has(tgUrl)) continue
      seenTgph.add(tgUrl)
      if (signal?.aborted) throw new Error('已取消')
      try {
        const cached = await discoverTelegraphViaTelegram(client, tgUrl)
        if (cached && cached.manifest.groups.telegraph[0]?.items.length) {
          const items = cached.manifest.groups.telegraph.flatMap((g) =>
            g.items.map((item, i) => {
              const id = `tg:telegraph:${cached.manifest.galleryId}:${i}:${entry.origin}`
              const next: ResourceItem = {
                ...item,
                id,
                origin: 'telegraph',
                label: item.label.startsWith('Telegraph')
                  ? item.label
                  : `Telegraph · ${item.label}`,
              }
              const h = cached.handles.get(item.id)
              if (h) handles.set(id, h)
              return next
            }),
          )
          telegraphGroups.push({
            url: tgUrl,
            title: cached.manifest.title,
            fromOrigin: entry.origin,
            fromCommentId: entry.commentId,
            items,
          })
          continue
        }

        const sub = await discoverTelegraph(tgUrl, { fetchText, signal })
        const items = sub.groups.telegraph.flatMap((g) =>
          g.items.map((item, i) => {
            const id = `tg:telegraph:${sub.galleryId}:${i}:${entry.origin}`
            const next: ResourceItem = {
              ...item,
              id,
              origin: 'telegraph',
              label: `Telegraph · ${item.label.replace(/^Telegraph · /, '')}`,
            }
            if (item.downloadUrl) {
              handles.set(id, { kind: 'http', url: item.downloadUrl })
            }
            return next
          }),
        )
        telegraphGroups.push({
          url: tgUrl,
          title: sub.title,
          fromOrigin: entry.origin,
          fromCommentId: entry.commentId,
          items,
        })
      } catch {
        /* skip failed telegraph pages */
      }
    }
  }

  const title =
    messageText(main).split('\n')[0]?.slice(0, 80).trim() ||
    `${ref.channel}/${ref.messageId}`

  const manifest: ResourceManifest = {
    id: nextManifestId(),
    source: 'telegram',
    sourceUrl,
    title,
    author: ref.channel,
    galleryId: `${ref.channel}_${ref.messageId}`,
    groups: {
      post: postItems,
      comments,
      telegraph: telegraphGroups,
    },
  }

  return { manifest, handles }
}
