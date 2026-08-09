import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import AdmZip from 'adm-zip'
import { galleryFolderName } from './paths'
import type { GalleryMetadata, LibraryStore } from './store'

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])

export type ExtractZipOptions = {
  source: string
  galleryId: string
  title: string
  sourceUrl: string
  author?: string
  deleteZip?: boolean
}

export async function extractZipToGallery(
  zipPath: string,
  store: LibraryStore,
  opts: ExtractZipOptions,
): Promise<GalleryMetadata> {
  const zip = new AdmZip(zipPath)
  const entries = zip.getEntries().filter((e) => {
    if (e.isDirectory) return false
    const ext = extname(e.entryName).toLowerCase()
    return IMAGE_EXT.has(ext)
  })
  if (entries.length === 0) {
    throw new Error('压缩包内没有可入库的图片（jpg/png/webp/gif）')
  }

  const dirName = galleryFolderName(opts.source, opts.galleryId, opts.title)
  const dir = join(store.root, dirName)
  await mkdir(dir, { recursive: true })

  const imageNames: string[] = []
  let index = 0
  for (const entry of entries) {
    index += 1
    const ext = extname(entry.entryName).toLowerCase().replace('.jpeg', '.jpg')
    const name = `${String(index).padStart(3, '0')}${ext}`
    const data = entry.getData()
    await writeFile(join(dir, name), data)
    imageNames.push(name)
  }

  const meta: GalleryMetadata = {
    source: opts.source,
    galleryId: opts.galleryId,
    title: opts.title,
    sourceUrl: opts.sourceUrl,
    author: opts.author ?? '',
    tags: [],
    pageCount: 1,
    cover: imageNames[0] ?? null,
    images: imageNames,
    downloadedAt: new Date().toISOString(),
  }
  await store.upsertGallery(meta)

  if (opts.deleteZip) {
    await unlink(zipPath).catch(() => undefined)
  }

  return meta
}

export function findZipArtifacts(imageNames: string[]): string[] {
  return imageNames.filter((n) => extname(n).toLowerCase() === '.zip')
}

export function zipGalleryIdFromPath(zipPath: string): string {
  const base = basename(zipPath, '.zip').replace(/[^\w\-]+/g, '_').slice(0, 40)
  return `zip_${base || 'pack'}_${Date.now().toString(36)}`
}
