import { join } from 'node:path'
import { readdir, unlink } from 'node:fs/promises'
import type { GalleryParseResult } from '../adapters/types'
import type { GalleryMetadata, LibraryStore } from '../library/store'
import { galleryFolderName } from '../library/paths'
import { downloadFile, extensionFromUrlOrType, extensionFromMagic } from './downloadFile'

export class GalleryExistsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GalleryExistsError'
  }
}

export interface DownloadGalleryOptions {
  concurrency: number
  signal?: AbortSignal
  overwrite?: boolean
  onProgress?: (progress: {
    done: number
    total: number
    failed?: number
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

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let next = 0

  async function run(): Promise<void> {
    while (next < items.length) {
      const i = next++
      try {
        const value = await worker(items[i], i)
        results[i] = { status: 'fulfilled', value }
      } catch (reason) {
        results[i] = { status: 'rejected', reason }
      }
    }
  }

  const runners = Array.from({ length: Math.max(1, concurrency) }, () => run())
  await Promise.all(runners)
  return results
}

async function clearImageFiles(dir: string): Promise<void> {
  let files: string[] = []
  try {
    files = await readdir(dir)
  } catch {
    return
  }
  await Promise.all(
    files
      .filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f))
      .map((f) => unlink(join(dir, f)).catch(() => undefined)),
  )
}

export async function downloadGallery(
  result: GalleryParseResult,
  store: LibraryStore,
  opts: DownloadGalleryOptions,
): Promise<GalleryMetadata> {
  const exists = await store.galleryExists(result.source, result.galleryId)
  if (exists && !opts.overwrite) {
    throw new GalleryExistsError(
      `套图已存在: ${result.source}/${result.galleryId}`,
    )
  }

  const existing = await store.getGallery(result.source, result.galleryId)
  const existingEntry = (await store.loadIndex()).find(
    (e) => e.source === result.source && e.galleryId === result.galleryId,
  )
  const dirName =
    existingEntry?.dirName ??
    galleryFolderName(result.source, result.galleryId, result.title)
  const dir = join(store.root, dirName)

  if (opts.overwrite) {
    await clearImageFiles(dir)
  }

  const total = result.images.length
  let doneCount = 0
  let failedCount = 0
  const imageNames: (string | null)[] = new Array(total).fill(null)
  const errors: string[] = []

  // Keep concurrency modest — too many parallel curl/proxy calls drop files under load.
  const concurrency = Math.min(Math.max(1, opts.concurrency), 8)

  const settled = await mapPool(result.images, concurrency, async (img, index) => {
    if (opts.signal?.aborted) throw new Error('已取消')
    const fileId = `img_${index}`
    const tentativeExt = extensionFromUrlOrType(img.url, null)
    const baseName = String(index + 1).padStart(3, '0')
    const name = `${baseName}${tentativeExt}`
    let lastByteMark = 0
    opts.onProgress?.({
      done: doneCount,
      total,
      failed: failedCount,
      file: { id: fileId, name, status: 'downloading' },
    })
    try {
      const dest = join(dir, name)
      const downloaded = await downloadFile(img.url, dest, {
        signal: opts.signal,
        // Prefer page referer for hotlink; fall back to gallery url
        referer: result.sourceUrl.replace(/\.html$/i, '/1.html'),
        retries: 4,
        headers: {
          Accept: '*/*',
        },
        onProgress: ({ received, total: fileTotal }) => {
          const delta = Math.max(0, received - lastByteMark)
          lastByteMark = received
          opts.onProgress?.({
            done: doneCount,
            total,
            failed: failedCount,
            bytesDelta: delta,
            bytesReceived: received,
            bytesTotal: fileTotal ?? undefined,
            file: {
              id: fileId,
              name,
              status: 'downloading',
              bytesReceived: received,
              bytesTotal: fileTotal ?? undefined,
            },
          })
        },
      })
      const { readFile, rename, access } = await import('node:fs/promises')
      const head = await readFile(dest)
      const magicExt = extensionFromMagic(head)
      const typeExt = extensionFromUrlOrType(img.url, downloaded.contentType)
      const finalExt = magicExt ?? typeExt
      let finalName = `${baseName}${finalExt}`
      if (finalExt !== tentativeExt) {
        const renamed = join(dir, finalName)
        await rename(dest, renamed)
        await access(renamed)
      } else {
        await access(dest)
        finalName = name
      }
      doneCount += 1
      const rem = Math.max(0, downloaded.bytes - lastByteMark)
      opts.onProgress?.({
        done: doneCount,
        total,
        failed: failedCount,
        bytesDelta: rem,
        file: {
          id: fileId,
          name: finalName,
          status: 'done',
          bytesReceived: downloaded.bytes,
          bytesTotal: downloaded.bytes,
        },
      })
      return { fileId, finalName, bytes: downloaded.bytes, lastByteMark }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      failedCount += 1
      opts.onProgress?.({
        done: doneCount,
        total,
        failed: failedCount,
        file: { id: fileId, name, status: 'failed', error: msg },
      })
      throw err
    }
  })

  for (let i = 0; i < settled.length; i++) {
    const r = settled[i]
    if (r.status === 'fulfilled') {
      imageNames[i] = r.value.finalName
    } else {
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason)
      errors.push(`${String(i + 1).padStart(3, '0')}: ${msg}`)
    }
  }

  const saved = imageNames.filter((n): n is string => Boolean(n))
  if (saved.length === 0) {
    throw new Error(`全部下载失败（${failedCount}/${total}）\n` + errors.slice(0, 5).join('\n'))
  }

  const meta: GalleryMetadata = {
    source: result.source,
    galleryId: result.galleryId,
    title: result.title,
    sourceUrl: result.sourceUrl,
    author: result.author,
    tags: result.tags,
    pageCount: result.pageCount,
    cover: saved[0] ?? null,
    images: saved,
    downloadedAt: new Date().toISOString(),
    favorite: existing?.favorite,
    displayTitle: existing?.displayTitle,
  }

  await store.upsertGallery(meta)

  if (failedCount > 0) {
    const err = new Error(
      `部分下载失败：成功 ${saved.length}/${total}，失败 ${failedCount}。可稍后「重新下载」补全。\n` +
        errors.slice(0, 8).join('\n'),
    )
    ;(err as Error & { partialMeta?: GalleryMetadata }).partialMeta = meta
    throw err
  }

  return meta
}
