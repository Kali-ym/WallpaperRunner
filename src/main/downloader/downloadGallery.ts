import { join } from 'node:path'
import { mkdir, readdir, readFile, stat, unlink } from 'node:fs/promises'
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
  /** Only download files missing on disk; keep existing images. */
  fillMissing?: boolean
  /** Extra rounds to retry failed files after the first pass. */
  failedRetries?: number
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

async function findExistingImage(dir: string, index: number): Promise<string | null> {
  const base = String(index + 1).padStart(3, '0')
  const re = new RegExp(`^${base}\\.(jpe?g|png|webp|gif)$`, 'i')
  let files: string[] = []
  try {
    files = await readdir(dir)
  } catch {
    return null
  }
  for (const name of files) {
    if (!re.test(name)) continue
    const path = join(dir, name)
    try {
      const st = await stat(path)
      if (st.size < 1024) continue
      const head = await readFile(path)
      if (extensionFromMagic(head.subarray(0, 16))) return name
    } catch {
      /* try next */
    }
  }
  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type ImageDownloadResult = {
  fileId: string
  finalName: string
  bytes: number
  lastByteMark: number
}

export async function downloadGallery(
  result: GalleryParseResult,
  store: LibraryStore,
  opts: DownloadGalleryOptions,
): Promise<GalleryMetadata> {
  const fillMissing = Boolean(opts.fillMissing)
  const exists = await store.galleryExists(result.source, result.galleryId)
  if (exists && !opts.overwrite && !fillMissing) {
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
  await mkdir(dir, { recursive: true })

  if (opts.overwrite && !fillMissing) {
    await clearImageFiles(dir)
  }

  const total = result.images.length
  let doneCount = 0
  let failedCount = 0
  const imageNames: (string | null)[] = new Array(total).fill(null)
  const errors: string[] = new Array(total).fill('')

  const concurrency = Math.min(Math.max(1, opts.concurrency), 8)
  const failedRetries = Math.max(0, opts.failedRetries ?? 3)

  async function downloadImageAtIndex(index: number): Promise<ImageDownloadResult> {
    if (opts.signal?.aborted) throw new Error('已取消')
    const img = result.images[index]
    const fileId = `img_${index}`
    const tentativeExt = extensionFromUrlOrType(img.url, null)
    const baseName = String(index + 1).padStart(3, '0')
    const name = `${baseName}${tentativeExt}`
    let lastByteMark = 0

    if (fillMissing) {
      const existingName = await findExistingImage(dir, index)
      if (existingName) {
        return { fileId, finalName: existingName, bytes: 0, lastByteMark: 0 }
      }
    }

    opts.onProgress?.({
      done: doneCount,
      total,
      failed: failedCount,
      file: { id: fileId, name, status: 'downloading' },
    })

    const dest = join(dir, name)
    const downloaded = await downloadFile(img.url, dest, {
      signal: opts.signal,
      referer: result.sourceUrl.replace(/\.html$/i, '/1.html'),
      retries: 5,
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

    return { fileId, finalName, bytes: downloaded.bytes, lastByteMark }
  }

  function markDone(index: number, value: ImageDownloadResult): void {
    imageNames[index] = value.finalName
    errors[index] = ''
    opts.onProgress?.({
      done: doneCount,
      total,
      failed: failedCount,
      bytesDelta: Math.max(0, value.bytes - value.lastByteMark),
      file: {
        id: value.fileId,
        name: value.finalName,
        status: 'done',
        bytesReceived: value.bytes,
        bytesTotal: value.bytes,
      },
    })
  }

  function markFailed(index: number, msg: string): void {
    const fileId = `img_${index}`
    const name = `${String(index + 1).padStart(3, '0')}`
    errors[index] = msg
    opts.onProgress?.({
      done: doneCount,
      total,
      failed: failedCount,
      file: { id: fileId, name, status: 'failed', error: msg },
    })
  }

  const settled = await mapPool(
    result.images.map((_, index) => index),
    concurrency,
    async (index) => {
      try {
        const value = await downloadImageAtIndex(index)
        doneCount += 1
        markDone(index, value)
        return value
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        failedCount += 1
        markFailed(index, msg)
        throw err
      }
    },
  )

  let failedIndices = settled
    .map((r, i) => (r.status === 'rejected' ? i : -1))
    .filter((i) => i >= 0)

  for (let round = 0; round < failedRetries && failedIndices.length > 0; round++) {
    if (opts.signal?.aborted) break
    await sleep(1500 * (round + 1))
    const stillFailed: number[] = []
    for (const index of failedIndices) {
      if (opts.signal?.aborted) break
      try {
        const value = await downloadImageAtIndex(index)
        failedCount = Math.max(0, failedCount - 1)
        doneCount += 1
        markDone(index, value)
        settled[index] = { status: 'fulfilled', value }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        markFailed(index, msg)
        settled[index] = { status: 'rejected', reason: err }
        stillFailed.push(index)
      }
      await sleep(800)
    }
    failedIndices = stillFailed
  }

  const errorLines = settled
    .map((r, i) =>
      r.status === 'rejected'
        ? `${String(i + 1).padStart(3, '0')}: ${errors[i] || (r.reason instanceof Error ? r.reason.message : String(r.reason))}`
        : null,
    )
    .filter((line): line is string => Boolean(line))

  const saved = imageNames.filter((n): n is string => Boolean(n))
  if (saved.length === 0) {
    throw new Error(`全部下载失败（${failedCount}/${total}）\n` + errorLines.slice(0, 5).join('\n'))
  }

  const meta: GalleryMetadata = {
    source: result.source,
    galleryId: result.galleryId,
    title: result.title,
    sourceUrl: result.sourceUrl,
    author: result.author,
    tags: result.tags,
    pageCount: result.pageCount,
    cover: saved[0] ?? existing?.cover ?? null,
    images: saved,
    downloadedAt: new Date().toISOString(),
    favorite: existing?.favorite,
    displayTitle: existing?.displayTitle,
  }

  await store.upsertGallery(meta)

  if (failedCount > 0) {
    const err = new Error(
      `部分下载失败：成功 ${saved.length}/${total}，失败 ${failedCount}。可稍后「重新下载」补全。\n` +
        errorLines.slice(0, 8).join('\n'),
    )
    ;(err as Error & { partialMeta?: GalleryMetadata }).partialMeta = meta
    throw err
  }

  return meta
}
