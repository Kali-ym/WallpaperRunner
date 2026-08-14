import { Api } from 'telegram'

export type TelegraphPageMedia =
  | { kind: 'photo'; media: Api.Photo }
  | { kind: 'document'; media: Api.Document }

function photoIdKey(id: unknown): string {
  return String(id)
}

function photoById(page: Api.Page, extra?: Api.Photo | null): Map<string, Api.Photo> {
  const map = new Map<string, Api.Photo>()
  for (const p of page.photos ?? []) {
    if (p instanceof Api.Photo) map.set(photoIdKey(p.id), p)
  }
  if (extra) map.set(photoIdKey(extra.id), extra)
  return map
}

function documentById(page: Api.Page): Map<string, Api.Document> {
  const map = new Map<string, Api.Document>()
  for (const d of page.documents ?? []) {
    if (d instanceof Api.Document) map.set(photoIdKey(d.id), d)
  }
  return map
}

function walkBlocks(
  blocks: unknown[] | undefined,
  photos: Map<string, Api.Photo>,
  docs: Map<string, Api.Document>,
  out: TelegraphPageMedia[],
  seen: Set<string>,
): void {
  if (!blocks) return
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue
    const b = block as Record<string, unknown>
    const className = String(b.className ?? '')

    const pushPhoto = (photoId: unknown): void => {
      const key = photoIdKey(photoId)
      const photo = photos.get(key)
      if (!photo || seen.has(`photo:${key}`)) return
      seen.add(`photo:${key}`)
      out.push({ kind: 'photo', media: photo })
    }

    const pushDoc = (docId: unknown): void => {
      const key = photoIdKey(docId)
      const doc = docs.get(key)
      if (!doc || seen.has(`doc:${key}`)) return
      seen.add(`doc:${key}`)
      out.push({ kind: 'document', media: doc })
    }

    if (className === 'PageBlockPhoto' && b.photoId != null) {
      pushPhoto(b.photoId)
      continue
    }
    if (className === 'PageBlockVideo' && b.videoId != null) {
      pushDoc(b.videoId)
      continue
    }
    if (className === 'PageBlockAudio' && b.audioId != null) {
      pushDoc(b.audioId)
      continue
    }
    if (className === 'PageBlockDocument' && b.documentId != null) {
      pushDoc(b.documentId)
      continue
    }
    if (className === 'PageBlockCover' && b.cover != null) {
      walkBlocks([b.cover], photos, docs, out, seen)
      continue
    }
    if (className === 'PageBlockCollage' && Array.isArray(b.items)) {
      walkBlocks(b.items as unknown[], photos, docs, out, seen)
      continue
    }
    if (className === 'PageBlockSlideshow' && Array.isArray(b.blocks)) {
      walkBlocks(b.blocks as unknown[], photos, docs, out, seen)
      continue
    }
    if (className === 'PageBlockList' && Array.isArray(b.items)) {
      walkBlocks(b.items as unknown[], photos, docs, out, seen)
      continue
    }
    if (className === 'PageBlockOrderedList' && Array.isArray(b.items)) {
      walkBlocks(b.items as unknown[], photos, docs, out, seen)
      continue
    }
    if (className === 'PageBlockDetails' && Array.isArray(b.blocks)) {
      walkBlocks(b.blocks as unknown[], photos, docs, out, seen)
      continue
    }
    if (className === 'PageBlockEmbedPost' && Array.isArray(b.blocks)) {
      walkBlocks(b.blocks as unknown[], photos, docs, out, seen)
      continue
    }
    if (className === 'PageBlockEmbed' && b.posterPhotoId != null) {
      pushPhoto(b.posterPhotoId)
    }
  }
}

function poolPhotos(page: Api.Page, previewPhoto?: Api.Photo | null): Api.Photo[] {
  const list = (page.photos ?? []).filter((p): p is Api.Photo => p instanceof Api.Photo)
  if (!previewPhoto) return list
  const key = photoIdKey(previewPhoto.id)
  if (list.some((p) => photoIdKey(p.id) === key)) return list
  return [previewPhoto, ...list]
}

function mergeOrphanPoolPhotos(
  page: Api.Page,
  blockOrder: TelegraphPageMedia[],
  previewPhoto?: Api.Photo | null,
): TelegraphPageMedia[] {
  const blockPhotoIds = new Set(
    blockOrder.filter((m) => m.kind === 'photo').map((m) => photoIdKey(m.media.id)),
  )
  const pool = poolPhotos(page, previewPhoto ?? null)
  const orphans: TelegraphPageMedia[] = []
  for (const photo of pool) {
    const key = photoIdKey(photo.id)
    if (blockPhotoIds.has(key)) continue
    orphans.push({ kind: 'photo', media: photo })
  }
  if (orphans.length === 0) return blockOrder

  const firstBlockPoolIdx = pool.findIndex((p) => blockPhotoIds.has(photoIdKey(p.id)))
  const leading: TelegraphPageMedia[] = []
  const trailing: TelegraphPageMedia[] = []
  for (const orphan of orphans) {
    const idx = pool.findIndex((p) => photoIdKey(p.id) === photoIdKey(orphan.media.id))
    if (firstBlockPoolIdx >= 0 && idx >= 0 && idx < firstBlockPoolIdx) leading.push(orphan)
    else trailing.push(orphan)
  }
  return [...leading, ...blockOrder, ...trailing]
}

function mergeOrphanImageDocs(page: Api.Page, items: TelegraphPageMedia[]): TelegraphPageMedia[] {
  const seenDocIds = new Set(
    items.filter((m) => m.kind === 'document').map((m) => photoIdKey(m.media.id)),
  )
  const out = [...items]
  for (const doc of page.documents ?? []) {
    if (!(doc instanceof Api.Document)) continue
    const mime = doc.mimeType ?? ''
    if (!mime.startsWith('image/')) continue
    const key = photoIdKey(doc.id)
    if (seenDocIds.has(key)) continue
    seenDocIds.add(key)
    out.push({ kind: 'document', media: doc })
  }
  return out
}

/** Collect page media in article order; include covers and pool photos blocks omit. */
export function collectTelegraphPageMedia(
  page: Api.Page,
  previewPhoto?: Api.TypePhoto | null,
): TelegraphPageMedia[] {
  const preview = previewPhoto instanceof Api.Photo ? previewPhoto : null
  const photos = photoById(page, preview)
  const docs = documentById(page)
  const out: TelegraphPageMedia[] = []
  const seen = new Set<string>()

  walkBlocks(page.blocks as unknown[] | undefined, photos, docs, out, seen)

  let merged =
    out.length > 0
      ? mergeOrphanPoolPhotos(page, out, preview)
      : poolPhotos(page, preview).map((media) => ({ kind: 'photo' as const, media }))

  merged = mergeOrphanImageDocs(page, merged)

  if (preview) {
    const key = photoIdKey(preview.id)
    const hasPreview = merged.some(
      (m) => m.kind === 'photo' && photoIdKey(m.media.id) === key,
    )
    if (!hasPreview) merged = [{ kind: 'photo', media: preview }, ...merged]
  }

  return merged
}
