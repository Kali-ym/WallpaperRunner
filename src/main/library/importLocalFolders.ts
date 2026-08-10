import { createHash } from 'node:crypto'
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { isImageFileName } from './imageIndex'
import type { GalleryMetadata, LibraryStore } from './store'

export type ImportLocalResult = {
  imported: GalleryMetadata[]
  skipped: string[]
}

function localGalleryId(absPath: string): string {
  return createHash('sha1').update(absPath).digest('hex').slice(0, 12)
}

async function listImagesInDir(dir: string): Promise<string[]> {
  const names = await readdir(dir)
  return names
    .filter(isImageFileName)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

async function listImmediateSubdirs(dir: string): Promise<string[]> {
  const names = await readdir(dir)
  const out: string[] = []
  for (const name of names) {
    const p = join(dir, name)
    try {
      const s = await stat(p)
      if (s.isDirectory()) out.push(p)
    } catch {
      /* ignore */
    }
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

async function importOneFolder(
  store: LibraryStore,
  folderPath: string,
): Promise<GalleryMetadata | null> {
  const images = await listImagesInDir(folderPath)
  if (images.length === 0) return null

  const title = basename(folderPath) || '本地图集'
  const galleryId = localGalleryId(folderPath)
  const source = 'local'
  const destDir = store.resolveGalleryDir(source, galleryId, title)
  await store.ensureRoot()
  await mkdir(destDir, { recursive: true })

  const copied: string[] = []
  for (let i = 0; i < images.length; i++) {
    const name = images[i]!
    const ext = extname(name).toLowerCase() || '.jpg'
    const destName = `${String(i + 1).padStart(3, '0')}${ext}`
    await copyFile(join(folderPath, name), join(destDir, destName))
    copied.push(destName)
  }

  const meta: GalleryMetadata = {
    source,
    galleryId,
    title,
    sourceUrl: pathToFileUrl(folderPath),
    author: '',
    tags: ['local'],
    pageCount: copied.length,
    cover: copied[0] ?? null,
    images: copied,
    downloadedAt: new Date().toISOString(),
  }
  await store.upsertGallery(meta)
  return meta
}

function pathToFileUrl(absPath: string): string {
  const normalized = absPath.replace(/\\/g, '/')
  if (/^[A-Za-z]:\//.test(normalized)) {
    return `file:///${normalized}`
  }
  return `file://${normalized}`
}

/**
 * Import local folders as galleries.
 * For each dropped path: if any immediate subfolder contains images, each such
 * subfolder becomes one gallery; otherwise the path itself (if it has images)
 * becomes one gallery.
 */
export async function importLocalFolders(
  store: LibraryStore,
  paths: string[],
): Promise<ImportLocalResult> {
  const imported: GalleryMetadata[] = []
  const skipped: string[] = []

  for (const p of paths) {
    let st
    try {
      st = await stat(p)
    } catch {
      skipped.push(p)
      continue
    }
    if (!st.isDirectory()) {
      skipped.push(p)
      continue
    }

    const subdirs = await listImmediateSubdirs(p)
    const withImages: string[] = []
    for (const sub of subdirs) {
      const imgs = await listImagesInDir(sub)
      if (imgs.length > 0) withImages.push(sub)
    }

    const targets = withImages.length > 0 ? withImages : [p]
    for (const t of targets) {
      const meta = await importOneFolder(store, t)
      if (meta) imported.push(meta)
      else skipped.push(t)
    }
  }

  return { imported, skipped }
}
