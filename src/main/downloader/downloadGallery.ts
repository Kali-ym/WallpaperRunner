import { join } from 'node:path'
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
  onProgress?: (progress: { done: number; total: number }) => void
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0

  async function run(): Promise<void> {
    while (next < items.length) {
      const i = next++
      results[i] = await worker(items[i], i)
    }
  }

  const runners = Array.from({ length: Math.max(1, concurrency) }, () => run())
  await Promise.all(runners)
  return results
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

  const dirName = galleryFolderName(result.source, result.galleryId, result.title)
  const dir = join(store.root, dirName)
  const total = result.images.length
  let done = 0
  const imageNames: string[] = new Array(total)

  await mapPool(result.images, opts.concurrency, async (img, index) => {
    if (opts.signal?.aborted) throw new Error('已取消')
    const tentativeExt = extensionFromUrlOrType(img.url, null)
    const baseName = String(index + 1).padStart(3, '0')
    let dest = join(dir, `${baseName}${tentativeExt}`)
    const downloaded = await downloadFile(img.url, dest, {
      signal: opts.signal,
      referer: result.sourceUrl,
    })
    const finalExt = extensionFromUrlOrType(img.url, downloaded.contentType)
    if (finalExt !== tentativeExt) {
      const renamed = join(dir, `${baseName}${finalExt}`)
      const { rename } = await import('node:fs/promises')
      await rename(dest, renamed)
      dest = renamed
      imageNames[index] = `${baseName}${finalExt}`
    } else {
      imageNames[index] = `${baseName}${tentativeExt}`
    }
    done += 1
    opts.onProgress?.({ done, total })
  })

  const meta: GalleryMetadata = {
    source: result.source,
    galleryId: result.galleryId,
    title: result.title,
    sourceUrl: result.sourceUrl,
    author: result.author,
    tags: result.tags,
    pageCount: result.pageCount,
    cover: imageNames[0] ?? null,
    images: imageNames,
    downloadedAt: new Date().toISOString(),
  }

  await store.upsertGallery(meta)
  return meta
}
