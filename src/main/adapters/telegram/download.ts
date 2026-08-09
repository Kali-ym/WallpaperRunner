import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { TelegramClient } from 'telegram'
import type { GalleryMetadata, LibraryStore } from '../../library/store'
import { galleryFolderName } from '../../library/paths'
import { downloadFile, extensionFromUrlOrType } from '../../downloader/downloadFile'
import type { ResourceItem, ResourceManifest } from '../../resources/types'
import { listManifestItems } from '../../resources/types'
import type { MediaHandle } from '../../resources/handles'

export interface DownloadSelectedOptions {
  concurrency: number
  signal?: AbortSignal
  overwrite?: boolean
  onProgress?: (progress: {
    done: number
    total: number
    failed?: number
    lastError?: string
    file?: { id: string; name: string; status: 'pending' | 'downloading' | 'done' | 'failed'; error?: string }
    bytesDelta?: number
  }) => void
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function extForItem(item: ResourceItem, contentType: string | null): string {
  if (item.fileName) {
    const m = item.fileName.match(/(\.[a-z0-9]+)$/i)
    if (m) return m[1].toLowerCase()
  }
  if (item.kind === 'video' || item.mimeType?.startsWith('video/')) return '.mp4'
  if (item.kind === 'animation') return '.mp4'
  if (item.kind === 'document' && item.mimeType?.includes('zip')) return '.zip'
  if (item.downloadUrl) return extensionFromUrlOrType(item.downloadUrl, contentType)
  if (contentType?.includes('png')) return '.png'
  if (contentType?.includes('webp')) return '.webp'
  if (contentType?.includes('gif')) return '.gif'
  if (contentType?.includes('mp4')) return '.mp4'
  return '.jpg'
}

async function downloadTelegramMedia(
  client: TelegramClient,
  media: Parameters<TelegramClient['downloadMedia']>[0],
  retries = 4,
): Promise<Buffer> {
  let lastError: unknown
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const buffer = await client.downloadMedia(media, {})
      if (!buffer || typeof buffer === 'string') {
        throw new Error('下载媒体失败（空结果）')
      }
      const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer)
      if (buf.byteLength < 32) throw new Error('下载文件过小')
      return buf
    } catch (err) {
      lastError = err
      if (attempt < retries - 1) await sleep(600 * 2 ** attempt)
    }
  }
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
        })
        bytesDelta = result.bytes ?? 0
        const finalExt = extForItem(item, result.contentType)
        let finalName = `${baseName}${finalExt}`
        if (finalExt !== tentative) {
          const { rename } = await import('node:fs/promises')
          const finalPath = join(dir, finalName)
          await rename(dest, finalPath).catch(() => {
            finalName = `${baseName}${tentative}`
          })
        }
        imageNames.push(finalName)
      } else {
        if (!client) throw new Error('Telegram 未登录')
        if (handle.kind === 'telegram_media') {
          const buf = await downloadTelegramMedia(client, handle.media)
          bytesDelta = buf.byteLength
          const ext = extForItem(item, null)
          const finalName = `${baseName}${ext}`
          await writeFile(join(dir, finalName), buf)
          imageNames.push(finalName)
        } else {
          const msgs = await client.getMessages(handle.peer, { ids: handle.messageId })
          const msg = msgs[0]
          if (!msg) throw new Error(`消息不存在: ${handle.peer}/${handle.messageId}`)
          const buf = await downloadTelegramMedia(client, msg)
          bytesDelta = buf.byteLength
          const ext = extForItem(item, null)
          const finalName = `${baseName}${ext}`
          await writeFile(join(dir, finalName), buf)
          imageNames.push(finalName)
        }
      }
      done += 1
      opts.onProgress?.({
        done,
        total,
        failed,
        bytesDelta,
        file: { id: item.id, name: displayName, status: 'done' },
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
