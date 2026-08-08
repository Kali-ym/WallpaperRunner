import { join } from 'node:path'
import { readdir, unlink } from 'node:fs/promises'
import type { GalleryParseResult } from '../adapters/types'
import type { GalleryMetadata, LibraryStore } from '../library/store'
import { galleryFolderName } from '../library/paths'
import { downloadFile, extensionFromUrlOrType } from './downloadFile'

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
  onProgress?: (progress: { done: number; total: number; failed?: number }) => void
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
  let done = 0
  let failed = 0
  const imageNames: (string | null)[] = new Array(total).fill(null)
  const errors: string[] = []

  // Keep concurrency modest — too many parallel curl/proxy calls drop files under load.
  const concurrency = Math.min(Math.max(1, opts.concurrency), 3)

  const settled = await mapPool(result.images, concurrency, async (img, index) => {
    if (opts.signal?.aborted) throw new Error('已取消')
    const tentativeExt = extensionFromUrlOrType(img.url, null)
    const baseName = String(index + 1).padStart(3, '0')
    const dest = join(dir, `${baseName}${tentativeExt}`)
    const downloaded = await downloadFile(img.url, dest, {
      signal: opts.signal,
      // Prefer page referer for hotlink; fall back to gallery url
      referer: result.sourceUrl.replace(/\.html$/i, '/1.html'),
      retries: 4,
    })
    const finalExt = extensionFromUrlOrType(img.url, downloaded.contentType)
    let finalName = `${baseName}${tentativeExt}`
    if (finalExt !== tentativeExt) {
      const renamed = join(dir, `${baseName}${finalExt}`)
      const { rename, access } = await import('node:fs/promises')
      await rename(dest, renamed)
      finalName = `${baseName}${finalExt}`
      await access(renamed)
    } else {
      const { access } = await import('node:fs/promises')
      await access(dest)
    }
    return finalName
  })

  for (let i = 0; i < settled.length; i++) {
    const r = settled[i]
    if (r.status === 'fulfilled') {
      imageNames[i] = r.value
      done += 1
    } else {
      failed += 1
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason)
      errors.push(`${String(i + 1).padStart(3, '0')}: ${msg}`)
    }
    opts.onProgress?.({ done, total, failed })
  }

  const saved = imageNames.filter((n): n is string => Boolean(n))
  if (saved.length === 0) {
    throw new Error(`全部下载失败（${failed}/${total}）\n` + errors.slice(0, 5).join('\n'))
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

  if (failed > 0) {
    const err = new Error(
      `部分下载失败：成功 ${saved.length}/${total}，失败 ${failed}。可稍后「重新下载」补全。\n` +
        errors.slice(0, 8).join('\n'),
    )
    ;(err as Error & { partialMeta?: GalleryMetadata }).partialMeta = meta
    throw err
  }

  return meta
}
