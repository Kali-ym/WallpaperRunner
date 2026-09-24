import type { TelegramClient } from 'telegram'
import { Api, utils } from 'telegram'
import type {
  CommentResourceGroup,
  ResourceItem,
  ResourceKind,
  ResourceManifest,
  TelegraphResourceGroup,
} from '../../resources/types'
import type { MediaHandle } from '../../resources/handles'
import { discoverTelegraphBestEffort } from '../telegraph/discover'
import { extractTelegraphUrlsFromText } from '../telegraph/urls'
import { normalizeTelegramMessageUrl, parseTelegramMessageUrl } from './urls'

export type {
  MediaHandle,
  TelegramMediaHandle,
  HttpMediaHandle,
  TelegramCachedMediaHandle,
} from '../../resources/handles'

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

export function findMegagroupChat(chats: Api.TypeChat[]): Api.Channel | undefined {
  for (const c of chats) {
    if (c instanceof Api.Channel && c.megagroup) return c
  }
  return undefined
}

/** GramJS / MTProto peer string for getMessages (username or -100… id). */
export function peerKeyFromChannel(chat: Api.Channel): string {
  const username = chat.username?.trim()
  if (username) return username
  return utils.getPeerId(chat).toString()
}

export function pickDiscussionRootMessage(
  result: { messages: Api.TypeMessage[]; chats: Api.TypeChat[] },
): Api.Message | undefined {
  const messages = result.messages.filter((m): m is Api.Message => m instanceof Api.Message)
  if (messages.length === 0) return undefined

  const megaGroupIds = new Set<string>()
  for (const c of result.chats) {
    if (c instanceof Api.Channel && c.megagroup) {
      megaGroupIds.add(c.id.toString())
    }
  }

  const inDiscussion = messages.filter((m) => {
    if (!(m.peerId instanceof Api.PeerChannel)) return false
    return megaGroupIds.has(m.peerId.channelId.toString())
  })

  if (inDiscussion.length === 0) return undefined
  // Thread anchor is the channel-post mirror (usually the newest message in the discussion).
  return inDiscussion.reduce((prev, cur) => (prev.id > cur.id ? prev : cur))
}

function peerKeyForMessage(fallbackPeer: string, msg: TgMessage): string {
  const m = msg as TgMessage & { chat?: Api.Channel; peerId?: Api.TypePeer }
  if (m.chat instanceof Api.Channel) {
    return peerKeyFromChannel(m.chat)
  }
  if (m.peerId instanceof Api.PeerChannel) {
    return utils.getPeerId(m.peerId, true).toString()
  }
  return fallbackPeer
}

/** Discussion supergroup + thread root id (GramJS getCommentData semantics). */
async function resolveCommentThread(
  client: TelegramClient,
  channelPeer: string,
  messageId: number,
): Promise<{ discussionEntity: unknown; replyTo: number; peerKey: string } | null> {
  const result = await client.invoke(
    new Api.messages.GetDiscussionMessage({
      peer: channelPeer,
      msgId: messageId,
    }),
  )

  const megagroup = findMegagroupChat(result.chats)
  if (!megagroup) return null

  const discussionEntity = await client.getEntity(megagroup)
  const peerKey = peerKeyFromChannel(megagroup)
  const root = pickDiscussionRootMessage(result)

  return {
    discussionEntity,
    replyTo: root?.id ?? 0,
    peerKey,
  }
}

/** GramJS iterMessages handles GetReplies pagination internally. */
async function iterReplyMessages(
  client: TelegramClient,
  entity: unknown,
  replyTo: number,
  maxMessages: number,
): Promise<TgMessage[]> {
  if (maxMessages <= 0) return []
  const batch = (await client.getMessages(entity, {
    replyTo,
    limit: maxMessages,
  })) as TgMessage[]
  return batch.filter((m): m is TgMessage => Boolean(m?.id)).sort((a, b) => a.id - b.id)
}

function commentFetchLimit(reported?: number): number {
  const want = (reported ?? 0) + 40
  return Math.min(Math.max(want, 80), 2000)
}

function albumFromBatch(batch: TgMessage[], center: TgMessage): TgMessage[] {
  if (!center.groupedId) return [center]
  const gid = String(center.groupedId)
  const album = batch
    .filter((m) => m.groupedId && String(m.groupedId) === gid)
    .sort((a, b) => a.id - b.id)
  return album.length > 0 ? album : [center]
}

type FetchedComment = { peer: string; msg: TgMessage }

async function fetchCommentMessages(
  client: TelegramClient,
  channelPeer: string,
  messageId: number,
  reported?: number,
): Promise<FetchedComment[]> {
  const limit = commentFetchLimit(reported)
  const merged = new Map<number, FetchedComment>()

  const absorb = (peer: string, batch: TgMessage[]): void => {
    for (const m of batch) {
      if (merged.has(m.id)) continue
      merged.set(m.id, { peer, msg: m })
    }
  }

  let thread: Awaited<ReturnType<typeof resolveCommentThread>> = null
  try {
    thread = await resolveCommentThread(client, channelPeer, messageId)
    if (thread && thread.replyTo > 0) {
      absorb(
        thread.peerKey,
        await iterReplyMessages(client, thread.discussionEntity, thread.replyTo, limit),
      )
    }
  } catch (err) {
    console.warn('[telegram] discussion thread comments failed', err)
  }

  const needChannelFallback =
    merged.size === 0 ||
    (reported != null &&
      reported > 0 &&
      merged.size < Math.min(reported, limit) * 0.85)

  if (needChannelFallback) {
    try {
      // Public link form: t.me/channel/5257?comment=37731 — comment ids live in the linked group.
      const peerForHandles = thread?.peerKey
      if (!peerForHandles) {
        console.warn(
          `[telegram] linked discussion chat not found for ${channelPeer}/${messageId}; comment download peer may be wrong`,
        )
      }
      absorb(
        peerForHandles ?? channelPeer,
        await iterReplyMessages(client, channelPeer, messageId, limit),
      )
    } catch (err) {
      console.warn('[telegram] channel replyTo comments failed', err)
    }
  }

  if (merged.size === 0) {
    console.warn(
      `[telegram] no comment messages for ${channelPeer}/${messageId} (discussion may be private or empty)`,
    )
  }

  return [...merged.values()].sort((a, b) => a.msg.id - b.msg.id)
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

  let telegramReportedComments: number | undefined
  const mainApi = main as Api.Message
  if (mainApi.replies instanceof Api.MessageReplies && mainApi.replies.replies > 0) {
    telegramReportedComments = mainApi.replies.replies
  }

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
  const commentMsgs = await fetchCommentMessages(
    client,
    peer,
    ref.messageId,
    telegramReportedComments,
  )
  if (signal?.aborted) throw new Error('已取消')

  const commentBatch = commentMsgs.map((c) => c.msg)
  let commentIndex = 0
  const seenCommentGroups = new Set<string>()
  for (const { peer: commentPeer, msg: cmsg } of commentMsgs) {
    const groupKey = cmsg.groupedId ? `g:${String(cmsg.groupedId)}` : `m:${cmsg.id}`
    if (seenCommentGroups.has(groupKey)) continue
    seenCommentGroups.add(groupKey)

    let album = albumFromBatch(commentBatch, cmsg)
    if (cmsg.groupedId && album.length === 1) {
      album = await collectAlbumMessages(client, peerKeyForMessage(commentPeer, cmsg), cmsg)
    }

    const hasMedia = album.some((m) => classifyMessage(m) != null)
    const text = messageText(cmsg)
    if (!hasMedia && extractTelegraphUrlsFromText(text).length === 0) continue

    commentIndex += 1
    const items: ResourceItem[] = []
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
      const id = `tg:comment:${msg.id}:${kind}`
      const meta = fileMeta(msg)
      items.push({
        id,
        origin: 'comment',
        kind,
        label: `评论 #${commentIndex} · ${kindLabelZh(kind)} ${n}`,
        commentId: String(cmsg.id),
        commentIndex,
        fileName: meta.fileName,
        mimeType: meta.mimeType,
        size: meta.size,
      })
      handles.set(id, {
        kind: 'telegram',
        peer: peerKeyForMessage(commentPeer, msg),
        messageId: msg.id,
      })
    }

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
  for (const { msg: cmsg } of commentMsgs) {
    allTexts.push({
      text: messageText(cmsg),
      origin: 'comment',
      commentId: String(cmsg.id),
    })
  }

  const seenTgph = new Set<string>()
  for (const entry of allTexts) {
    for (const tgUrl of extractTelegraphUrlsFromText(entry.text)) {
      if (seenTgph.has(tgUrl)) continue
      seenTgph.add(tgUrl)
      if (signal?.aborted) throw new Error('已取消')
      try {
        const discovered = await discoverTelegraphBestEffort(tgUrl, { fetchText, signal }, client)
        const sub = discovered.manifest
        const items = sub.groups.telegraph.flatMap((g) =>
          g.items.map((item, i) => {
            const id = `tg:telegraph:${sub.galleryId}:${i}:${entry.origin}`
            const next: ResourceItem = {
              ...item,
              id,
              origin: 'telegraph',
              label: item.label.startsWith('Telegraph') ? item.label : `Telegraph · ${item.label}`,
            }
            const h = discovered.handles.get(item.id)
            if (h) handles.set(id, h)
            return next
          }),
        )
        if (items.length === 0) continue
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

  const commentMediaItems = comments.reduce((n, c) => n + c.items.length, 0)

  const manifest: ResourceManifest = {
    id: nextManifestId(),
    source: 'telegram',
    sourceUrl,
    title,
    author: ref.channel,
    galleryId: `${ref.channel}_${ref.messageId}`,
    meta: {
      telegramReportedComments,
      telegramFetchedComments: commentMsgs.length,
      telegramCommentGroupsWithMedia: comments.filter((c) => c.items.length > 0).length,
    },
    groups: {
      post: postItems,
      comments,
      telegraph: telegraphGroups,
    },
  }

  if (
    telegramReportedComments &&
    commentMsgs.length > 0 &&
    commentMsgs.length < telegramReportedComments * 0.5
  ) {
    console.warn(
      `[telegram] comment fetch partial for ${peer}/${ref.messageId}: reported=${telegramReportedComments} fetched=${commentMsgs.length} mediaItems=${commentMediaItems}`,
    )
  }

  return { manifest, handles }
}
