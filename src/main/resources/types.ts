export type ResourceKind =
  | 'photo'
  | 'video'
  | 'animation'
  | 'document'
  | 'telegraph_image'
  | 'telegraph_file'

export type ResourceOrigin = 'post' | 'comment' | 'telegraph'

export interface ResourceItem {
  id: string
  origin: ResourceOrigin
  kind: ResourceKind
  label: string
  commentId?: string
  commentIndex?: number
  mimeType?: string
  fileName?: string
  size?: number
  previewUrl?: string
  /** HTTP URL for Telegraph (and any future HTTP-backed) resources */
  downloadUrl?: string
}

export interface CommentResourceGroup {
  commentId: string
  index: number
  author?: string
  textPreview?: string
  items: ResourceItem[]
}

export interface TelegraphResourceGroup {
  url: string
  title?: string
  fromOrigin?: ResourceOrigin
  fromCommentId?: string
  items: ResourceItem[]
}

export interface ResourceManifestMeta {
  /** Comment count shown on the channel post in Telegram. */
  telegramReportedComments?: number
  /** Reply messages fetched from the discussion thread. */
  telegramFetchedComments?: number
  /** Comment groups that contain at least one image/video/file. */
  telegramCommentGroupsWithMedia?: number
}

export interface ResourceManifest {
  id: string
  source: 'telegram' | 'telegraph'
  sourceUrl: string
  title: string
  author?: string
  galleryId: string
  meta?: ResourceManifestMeta
  groups: {
    post: ResourceItem[]
    comments: CommentResourceGroup[]
    telegraph: TelegraphResourceGroup[]
  }
  /** Present when multiple Telegram message URLs were merged */
  messageGroups?: MessageResourceGroup[]
}

export interface MessageResourceGroup {
  messageIndex: number
  sourceUrl: string
  title?: string
  post: ResourceItem[]
  comments: CommentResourceGroup[]
  telegraph: TelegraphResourceGroup[]
}

export function listManifestItems(manifest: ResourceManifest): ResourceItem[] {
  const items: ResourceItem[] = [...manifest.groups.post]
  for (const c of manifest.groups.comments) items.push(...c.items)
  for (const t of manifest.groups.telegraph) items.push(...t.items)
  return items
}
