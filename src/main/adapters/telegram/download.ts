import { createWriteStream } from 'node:fs'
import { mkdir, rename, stat, truncate, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { once } from 'node:events'
import { finished } from 'node:stream/promises'
import bigInt from 'big-integer'
import { Api, type TelegramClient } from 'telegram'
import type { GalleryMetadata, LibraryStore } from '../../library/store'
import { galleryFolderName } from '../../library/paths'
import { downloadFile, extensionFromUrlOrType } from '../../downloader/downloadFile'
import type { ResourceItem, ResourceManifest } from '../../resources/types'
import { listManifestItems } from '../../resources/types'
import type { MediaHandle } from '../../resources/handles'
import { telegramService } from '../../telegram/client'

const TG_CHUNK = 512 * 1024
const TG_ALIGN = 4096

export interface DownloadSelectedOptions {
  concurrency: number
  signal?: AbortSignal
  overwrite?: boolean
  onProgress?: (progress: {
    done: number
    total: number
    failed?: number
    lastError?: string
    file?: {
      id: string
      name: string
      status: 'pending' | 'downloading' | 'done' | 'failed'
      error?: string
      bytesReceived?: number
      bytesTotal?: number
    }
    bytesDelta?: number
    bytesReceived?: number
    bytesTotal?: number
  }) => void
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function toNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (v && typeof (v as { toJSNumber?: () => number }).toJSNumber === 'function') {
    const n = (v as { toJSNumber: () => number }).toJSNumber()
    return Number.isFinite(n) ? n : 0
  }
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function isTransientTelegramError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /CONNECTION_NOT_INITED|TIMEOUT|ECONNRESET|ECONNREFUSED|ETIMEDOUT|Not connected|CONNECTION_ERROR|Timed out|NetworkError|FILE_REFERENCE|FILEREF|FLOOD_WAIT/i.test(
    msg,
  )
}

type TgDownloadSource =
  | Parameters<TelegramClient['downloadMedia']>[0]
  | Api.Document
  | Api.Photo
  | Api.TypeDocument
  | Api.TypePhoto

function extractDocument(media: TgDownloadSource): Api.Document | null {
  let cur: unknown = media
  if (cur && typeof cur === 'object' && 'media' in (cur as object)) {
    cur = (cur as { media?: unknown }).media
  }
  if (cur instanceof Api.MessageMediaDocument) {
    cur = cur.document
  }
  return cur instanceof Api.Document ? cur : null
}

function extForItem(item: ResourceItem, contentType: string | null): string {
  if (item.fileName) {
    const m = item.fileName.match(/(\.[a-z0-9]+)$/i)
    if (m) return m[1].toLowerCase()
  }
  if (item.kind === 'video' || item.mimeType?.startsWith('video/')) return '.mp4'
  if (item.kind === 'animation') return '.mp4'
  if (item.kind === 'document' && item.mimeType?.includes('zip')) return '.zip'
  if (item.kind === 'document' && item.mimeType?.includes('7z')) return '.7z'
  if (item.kind === 'document' && item.mimeType?.includes('rar')) return '.rar'
  if (item.downloadUrl) return extensionFromUrlOrType(item.downloadUrl, contentType)
  if (contentType?.includes('png')) return '.png'
  if (contentType?.includes('webp')) return '.webp'
  if (contentType?.includes('gif')) return '.gif'
  if (contentType?.includes('mp4')) return '.mp4'
  return '.jpg'
}

async function alignedPartialSize(partPath: string): Promise<number> {
  try {
    const size = (await stat(partPath)).size
    const aligned = Math.floor(size / TG_ALIGN) * TG_ALIGN
    if (aligned < size) {
      await truncate(partPath, aligned)
      return aligned
    }
    return size
  } catch {
    return 0
  }
}

/** Resumable document download via iterDownload; keeps .part across reconnects. */
async function downloadDocumentResumable(
  client: TelegramClient,
  doc: Api.Document,
  destPath: string,
  opts?: {
    signal?: AbortSignal
    onProgress?: (received: number, total: number) => void
  },
): Promise<number> {
  const partPath = `${destPath}.part`
  const fileSize = toNumber(doc.size)
  let downloaded = await alignedPartialSize(partPath)

  if (fileSize > 0 && downloaded >= fileSize) {
    await rename(partPath, destPath)
    opts?.onProgress?.(fileSize, fileSize)
    return fileSize
  }

  opts?.onProgress?.(downloaded, fileSize)

  if (!client.connected) await client.connect()

  const location = new Api.InputDocumentFileLocation({
    id: doc.id,
    accessHash: doc.accessHash,
    fileReference: doc.fileReference,
    thumbSize: '',
  })

  const stream = createWriteStream(partPath, {
    flags: downloaded > 0 ? 'a' : 'w',
  })

  let lastEmit = 0
  try {
    for await (const chunk of client.iterDownload({
      file: location,
      offset: bigInt(downloaded),
      requestSize: TG_CHUNK,
      fileSize: fileSize > 0 ? bigInt(fileSize) : undefined,
      dcId: doc.dcId,
    })) {
      if (opts?.signal?.aborted) throw new Error('已取消')
      if (!chunk?.length) continue
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      if (!stream.write(buf)) {
        await once(stream, 'drain')
      }
      downloaded += buf.byteLength
      const now = Date.now()
      if (now - lastEmit >= 200 || (fileSize > 0 && downloaded >= fileSize)) {
        lastEmit = now
        opts?.onProgress?.(downloaded, fileSize)
      }
    }
    stream.end()
    await finished(stream)
  } catch (err) {
    stream.destroy()
    throw err
  }

  const st = await stat(partPath)
  if (fileSize > 0 && st.size < fileSize) {
    throw new Error(`下载不完整: ${st.size}/${fileSize}`)
  }
  await unlink(destPath).catch(() => undefined)
  await rename(partPath, destPath)
  opts?.onProgress?.(st.size, fileSize > 0 ? fileSize : st.size)
  return st.size
}

/** Fallback for photos / non-document media (usually small). */
async function downloadMediaOnceToFile(
  client: TelegramClient,
  media: Parameters<TelegramClient['downloadMedia']>[0],
  destPath: string,
  opts?: {
    signal?: AbortSignal
    onProgress?: (received: number, total: number) => void
  },
): Promise<number> {
  await unlink(destPath).catch(() => undefined)
  let lastReceived = 0
  let lastEmit = 0
  const progressCallback = ((received: unknown, total: unknown) => {
    if (opts?.signal?.aborted) {
      progressCallback.isCanceled = true
      throw new Error('已取消')
    }
    const r = toNumber(received)
    const t = toNumber(total)
    const now = Date.now()
    if (now - lastEmit < 200 && r < lastReceived + 256 * 1024 && (t <= 0 || r < t)) return
    lastEmit = now
    lastReceived = r
    opts?.onProgress?.(r, t > 0 ? t : 0)
  }) as ((received: unknown, total: unknown) => void) & { isCanceled?: boolean }

  const onAbort = () => {
    progressCallback.isCanceled = true
  }
  opts?.signal?.addEventListener('abort', onAbort, { once: true })
  try {
    if (!client.connected) await client.connect()
    const result = await client.downloadMedia(media, {
      outputFile: destPath,
      progressCallback,
    })
    if (result === undefined) throw new Error('下载媒体失败（空结果）')
    const st = await stat(destPath)
    if (st.size < 32) throw new Error('下载文件过小')
    opts?.onProgress?.(st.size, st.size)
    return st.size
  } finally {
    opts?.signal?.removeEventListener('abort', onAbort)
  }
}

async function downloadTelegramMediaToFile(
  client: TelegramClient,
  media: TgDownloadSource,
  destPath: string,
  opts?: {
    signal?: AbortSignal
    onProgress?: (received: number, total: number) => void
    refreshMedia?: () => Promise<TgDownloadSource>
  },
  retries = 12,
): Promise<number> {
  let lastError: unknown
  let current = media
  const partPath = `${destPath}.part`

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (opts?.signal?.aborted) throw new Error('已取消')
      if (attempt > 0 && opts?.refreshMedia) {
        current = await opts.refreshMedia()
      }

      const doc = extractDocument(current)
      if (doc) {
        return await downloadDocumentResumable(client, doc, destPath, opts)
      }
      // Non-document: no reliable resume — full replace.
      return await downloadMediaOnceToFile(
        client,
        current as Parameters<TelegramClient['downloadMedia']>[0],
        destPath,
        opts,
      )
    } catch (err) {
      lastError = err
      if (opts?.signal?.aborted) throw err instanceof Error ? err : new Error('已取消')
      // Keep .part for resume; only wipe final dest if any.
      await unlink(destPath).catch(() => undefined)
      if (attempt >= retries - 1 || !isTransientTelegramError(err)) {
        break
      }
      try {
        await telegramService.recoverConnection()
      } catch {
        /* continue retry */
      }
      await sleep(2000 * 2 ** Math.min(attempt, 3))
    }
  }

  // Leave .part on disk so the next enqueue can resume.
  void partPath
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export async function downloadSelectedResources(
  client: TelegramClient | null,
  manifest: ResourceManifest,
  handles: Map<string, MediaHandle>,
  selectedIds: string[],
  store: LibraryStore,
  opts: DownloadSelectedOptions,
): Promise<GalleryMetadata> {
  const selected = new Set(selectedIds)
  const items = listManifestItems(manifest).filter((i) => selected.has(i.id))
  if (items.length === 0) throw new Error('未选择任何资源')

  const exists = await store.galleryExists(manifest.source, manifest.galleryId)
  if (exists && !opts.overwrite) {
    throw new Error(`套图已存在: ${manifest.source}/${manifest.galleryId}`)
  }

  const dirName = galleryFolderName(manifest.source, manifest.galleryId, manifest.title)
  const dir = join(store.root, dirName)
  await mkdir(dir, { recursive: true })

  const total = items.length
  let done = 0
  let failed = 0
  const imageNames: string[] = []
  const errors: string[] = []

  for (let i = 0; i < items.length; i++) {
    if (opts.signal?.aborted) throw new Error('已取消')
    const item = items[i]
    const handle = handles.get(item.id)
    const baseName = String(i + 1).padStart(3, '0')
    const displayName = item.fileName || item.label || baseName
    let lastByteMark = 0

    const emitByteProgress = (received: number, fileTotal: number) => {
      let delta = 0
      if (received < lastByteMark) {
        // Reconnect retry restarts from 0 — refresh UI without double-counting.
        lastByteMark = received
        delta = 0
      } else {
        delta = received - lastByteMark
        lastByteMark = received
      }
      opts.onProgress?.({
        done,
        total,
        failed,
        bytesDelta: delta,
        bytesReceived: received,
        bytesTotal: fileTotal > 0 ? fileTotal : undefined,
        file: {
          id: item.id,
          name: displayName,
          status: 'downloading',
          bytesReceived: received,
          bytesTotal: fileTotal > 0 ? fileTotal : undefined,
        },
      })
    }

    opts.onProgress?.({
      done,
      total,
      failed,
      file: { id: item.id, name: displayName, status: 'downloading' },
    })

    try {
      if (!handle) throw new Error(`缺少下载句柄: ${item.id}`)

      let bytesDelta = 0
      if (handle.kind === 'http') {
        const tentative = extensionFromUrlOrType(handle.url, null)
        const dest = join(dir, `${baseName}${tentative}`)
        const result = await downloadFile(handle.url, dest, {
          signal: opts.signal,
          referer: 'https://telegra.ph/',
          headers: {
            Accept: '*/*',
          },
          onProgress: ({ received, total: fileTotal }) => {
            emitByteProgress(received, fileTotal ?? 0)
          },
        })
        bytesDelta = Math.max(0, result.bytes - lastByteMark)
        const finalExt = extForItem(item, result.contentType)
        let finalName = `${baseName}${finalExt}`
        if (finalExt !== tentative) {
          const finalPath = join(dir, finalName)
          await rename(dest, finalPath).catch(() => {
            finalName = `${baseName}${tentative}`
          })
        }
        imageNames.push(finalName)
      } else {
        if (!client) throw new Error('Telegram 未登录')
        const knownSize = item.size && item.size > 0 ? item.size : 0
        const mediaProgress = (received: number, fileTotal: number) => {
          emitByteProgress(received, fileTotal > 0 ? fileTotal : knownSize)
        }
        const ext = extForItem(item, null)
        const finalName = `${baseName}${ext}`
        const dest = join(dir, finalName)

        if (handle.kind === 'telegram_media') {
          const size = await downloadTelegramMediaToFile(client, handle.media as TgDownloadSource, dest, {
            signal: opts.signal,
            onProgress: mediaProgress,
          })
          bytesDelta = Math.max(0, size - lastByteMark)
          imageNames.push(finalName)
        } else {
          const loadMsg = async () => {
            const msgs = await client.getMessages(handle.peer, { ids: handle.messageId })
            const msg = msgs[0]
            if (!msg) throw new Error(`消息不存在: ${handle.peer}/${handle.messageId}`)
            return msg
          }
          const msg = await loadMsg()
          const size = await downloadTelegramMediaToFile(client, msg, dest, {
            signal: opts.signal,
            onProgress: mediaProgress,
            refreshMedia: loadMsg,
          })
          bytesDelta = Math.max(0, size - lastByteMark)
          imageNames.push(finalName)
        }
      }
      done += 1
      const finalBytes = lastByteMark > 0 ? lastByteMark : bytesDelta
      opts.onProgress?.({
        done,
        total,
        failed,
        bytesDelta,
        file: {
          id: item.id,
          name: displayName,
          status: 'done',
          bytesReceived: finalBytes > 0 ? finalBytes : undefined,
          bytesTotal: finalBytes > 0 ? finalBytes : undefined,
        },
      })
    } catch (err) {
      failed += 1
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${item.label}: ${msg}`)
      opts.onProgress?.({
        done,
        total,
        failed,
        lastError: msg,
        file: { id: item.id, name: displayName, status: 'failed', error: msg },
      })
      continue
    }
  }

  if (imageNames.length === 0) {
    throw new Error(`全部下载失败: ${errors.slice(0, 3).join('; ')}`)
  }

  const meta: GalleryMetadata = {
    source: manifest.source,
    galleryId: manifest.galleryId,
    title: manifest.title,
    sourceUrl: manifest.sourceUrl,
    author: manifest.author ?? '',
    tags: [],
    pageCount: 1,
    cover: imageNames[0] ?? null,
    images: imageNames,
    downloadedAt: new Date().toISOString(),
  }
  await store.upsertGallery(meta)
  return meta
}
