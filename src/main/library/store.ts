import { EventEmitter } from 'node:events'
import { mkdir, readdir, readFile, writeFile, access, rm, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { galleryFolderName } from './paths'

export interface GalleryMetadata {
  source: string
  galleryId: string
  title: string
  sourceUrl: string
  author: string
  tags: string[]
  pageCount: number
  cover: string | null
  images: string[]
  downloadedAt: string
  favorite?: boolean
  displayTitle?: string
}

export interface LibraryIndexEntry {
  source: string
  galleryId: string
  title: string
  displayTitle?: string
  author: string
  tags: string[]
  cover: string | null
  imageCount: number
  dirName: string
  downloadedAt: string
  favorite: boolean
}

export interface GalleryRef {
  source: string
  galleryId: string
}

interface LibraryIndexFile {
  entries: LibraryIndexEntry[]
}

function displayOf(meta: Pick<GalleryMetadata, 'title' | 'displayTitle'>): string {
  const d = meta.displayTitle?.trim()
  return d || meta.title
}

function toIndexEntry(meta: GalleryMetadata, dirName: string): LibraryIndexEntry {
  return {
    source: meta.source,
    galleryId: meta.galleryId,
    title: meta.title,
    displayTitle: meta.displayTitle,
    author: meta.author,
    tags: meta.tags,
    cover: meta.cover,
    imageCount: meta.images.length,
    dirName,
    downloadedAt: meta.downloadedAt,
    favorite: Boolean(meta.favorite),
  }
}

export class LibraryStore extends EventEmitter {
  private indexCache: LibraryIndexEntry[] | null = null

  constructor(private readonly rootDir: string) {
    super()
  }

  get root(): string {
    return this.rootDir
  }

  private indexPath(): string {
    return join(this.rootDir, 'library.json')
  }

  resolveGalleryDir(source: string, galleryId: string, title: string): string {
    return join(this.rootDir, galleryFolderName(source, galleryId, title))
  }

  async ensureRoot(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true })
  }

  async galleryExists(source: string, galleryId: string): Promise<boolean> {
    const entries = await this.loadIndex()
    return entries.some((e) => e.source === source && e.galleryId === galleryId)
  }

  async loadIndex(): Promise<LibraryIndexEntry[]> {
    if (this.indexCache) return this.indexCache
    await this.ensureRoot()
    try {
      const raw = await readFile(this.indexPath(), 'utf8')
      const parsed = JSON.parse(raw) as LibraryIndexFile
      this.indexCache = (parsed.entries ?? []).map((e) => ({
        ...e,
        favorite: Boolean(e.favorite),
      }))
      return this.indexCache
    } catch {
      this.indexCache = []
      return this.indexCache
    }
  }

  private async saveIndex(entries: LibraryIndexEntry[]): Promise<void> {
    await this.ensureRoot()
    this.indexCache = entries
    const payload: LibraryIndexFile = { entries }
    await writeFile(this.indexPath(), JSON.stringify(payload, null, 2), 'utf8')
    this.emit('change')
  }

  /** Drop in-memory index (e.g. after external edits). */
  invalidateIndexCache(): void {
    this.indexCache = null
  }

  private async findEntry(source: string, galleryId: string): Promise<LibraryIndexEntry | null> {
    const entries = await this.loadIndex()
    return entries.find((e) => e.source === source && e.galleryId === galleryId) ?? null
  }

  private async readMetaAt(dirName: string): Promise<GalleryMetadata | null> {
    try {
      const raw = await readFile(join(this.rootDir, dirName, 'metadata.json'), 'utf8')
      return JSON.parse(raw) as GalleryMetadata
    } catch {
      return null
    }
  }

  private async writeMetaAt(dirName: string, meta: GalleryMetadata): Promise<void> {
    const dir = join(this.rootDir, dirName)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'metadata.json'), JSON.stringify(meta, null, 2), 'utf8')
  }

  async getGallery(source: string, galleryId: string): Promise<GalleryMetadata | null> {
    const hit = await this.findEntry(source, galleryId)
    if (!hit) return null
    return this.readMetaAt(hit.dirName)
  }

  async upsertGallery(meta: GalleryMetadata): Promise<void> {
    await this.ensureRoot()
    const existing = await this.findEntry(meta.source, meta.galleryId)
    const prev = existing ? await this.readMetaAt(existing.dirName) : null

    const merged: GalleryMetadata = {
      ...meta,
      favorite: meta.favorite ?? prev?.favorite ?? false,
      displayTitle: meta.displayTitle ?? prev?.displayTitle,
    }

    const dirName =
      existing?.dirName ?? galleryFolderName(merged.source, merged.galleryId, merged.title)
    await this.writeMetaAt(dirName, merged)

    const entries = await this.loadIndex()
    const next = toIndexEntry(merged, dirName)
    const idx = entries.findIndex(
      (e) => e.source === merged.source && e.galleryId === merged.galleryId,
    )
    if (idx >= 0) entries[idx] = next
    else entries.unshift(next)
    await this.saveIndex(entries)
  }

  async search(query: string, opts?: { favoriteOnly?: boolean }): Promise<LibraryIndexEntry[]> {
    const q = query.trim().toLowerCase()
    let entries = await this.loadIndex()
    if (opts?.favoriteOnly) {
      entries = entries.filter((e) => e.favorite)
    }
    if (!q) return entries
    return entries.filter((e) => {
      const hay = [displayOf(e), e.title, e.author, ...e.tags].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }

  async rebuildIndex(): Promise<LibraryIndexEntry[]> {
    this.indexCache = null
    await this.ensureRoot()
    const dirs = await readdir(this.rootDir, { withFileTypes: true })
    const entries: LibraryIndexEntry[] = []
    for (const d of dirs) {
      if (!d.isDirectory()) continue
      if (d.name === '.thumbs') continue
      const meta = await this.readMetaAt(d.name)
      if (!meta) continue
      entries.push(toIndexEntry(meta, d.name))
    }
    entries.sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt))
    await this.saveIndex(entries)
    return entries
  }

  async deleteGallery(source: string, galleryId: string): Promise<void> {
    const hit = await this.findEntry(source, galleryId)
    if (!hit) return
    await rm(join(this.rootDir, hit.dirName), { recursive: true, force: true })
    const entries = (await this.loadIndex()).filter(
      (e) => !(e.source === source && e.galleryId === galleryId),
    )
    await this.saveIndex(entries)
  }

  async deleteGalleries(refs: GalleryRef[]): Promise<number> {
    let n = 0
    for (const ref of refs) {
      const before = await this.findEntry(ref.source, ref.galleryId)
      await this.deleteGallery(ref.source, ref.galleryId)
      if (before) n += 1
    }
    return n
  }

  async renameGallery(source: string, galleryId: string, displayTitle: string): Promise<GalleryMetadata> {
    return this.updateGalleryMeta(source, galleryId, { displayTitle })
  }

  async updateGalleryMeta(
    source: string,
    galleryId: string,
    partial: { displayTitle?: string; author?: string; tags?: string[] },
  ): Promise<GalleryMetadata> {
    const hit = await this.findEntry(source, galleryId)
    if (!hit) throw new Error('套图不存在')
    const meta = await this.readMetaAt(hit.dirName)
    if (!meta) throw new Error('元数据缺失')
    if (partial.displayTitle !== undefined) meta.displayTitle = partial.displayTitle.trim()
    if (partial.author !== undefined) meta.author = partial.author.trim()
    if (partial.tags !== undefined) {
      meta.tags = partial.tags.map((t) => t.trim()).filter(Boolean)
    }
    await this.writeMetaAt(hit.dirName, meta)
    const entries = await this.loadIndex()
    const idx = entries.findIndex((e) => e.source === source && e.galleryId === galleryId)
    if (idx >= 0) entries[idx] = toIndexEntry(meta, hit.dirName)
    await this.saveIndex(entries)
    return meta
  }

  async setFavorite(source: string, galleryId: string, favorite: boolean): Promise<GalleryMetadata> {
    const hit = await this.findEntry(source, galleryId)
    if (!hit) throw new Error('套图不存在')
    const meta = await this.readMetaAt(hit.dirName)
    if (!meta) throw new Error('元数据缺失')
    meta.favorite = favorite
    await this.writeMetaAt(hit.dirName, meta)
    const entries = await this.loadIndex()
    const idx = entries.findIndex((e) => e.source === source && e.galleryId === galleryId)
    if (idx >= 0) entries[idx] = toIndexEntry(meta, hit.dirName)
    await this.saveIndex(entries)
    return meta
  }

  async setFavorites(refs: GalleryRef[], favorite: boolean): Promise<number> {
    let n = 0
    for (const ref of refs) {
      try {
        await this.setFavorite(ref.source, ref.galleryId, favorite)
        n += 1
      } catch {
        // skip missing
      }
    }
    return n
  }

  async openGalleryPath(source: string, galleryId: string): Promise<string> {
    const hit = await this.findEntry(source, galleryId)
    if (!hit) throw new Error('套图不存在')
    return join(this.rootDir, hit.dirName)
  }

  async cleanupEmptyGalleries(): Promise<number> {
    const empties = (await this.loadIndex()).filter((e) => e.imageCount === 0)
    for (const e of empties) {
      await this.deleteGallery(e.source, e.galleryId)
    }
    return empties.length
  }

  async deleteImages(
    source: string,
    galleryId: string,
    relativePaths: string[],
  ): Promise<GalleryMetadata> {
    const hit = await this.findEntry(source, galleryId)
    if (!hit) throw new Error('套图不存在')
    const meta = await this.readMetaAt(hit.dirName)
    if (!meta) throw new Error('元数据缺失')

    const remove = new Set(relativePaths)
    const dir = join(this.rootDir, hit.dirName)
    for (const rel of remove) {
      if (rel.includes('..') || rel.includes('\\')) continue
      await unlink(join(dir, rel)).catch(() => undefined)
    }

    meta.images = meta.images.filter((p) => !remove.has(p))
    if (meta.cover && remove.has(meta.cover)) {
      meta.cover = meta.images[0] ?? null
    }
    await this.writeMetaAt(hit.dirName, meta)
    const entries = await this.loadIndex()
    const idx = entries.findIndex((e) => e.source === source && e.galleryId === galleryId)
    if (idx >= 0) entries[idx] = toIndexEntry(meta, hit.dirName)
    await this.saveIndex(entries)
    return meta
  }

  async setCover(source: string, galleryId: string, relativePath: string): Promise<GalleryMetadata> {
    const hit = await this.findEntry(source, galleryId)
    if (!hit) throw new Error('套图不存在')
    const meta = await this.readMetaAt(hit.dirName)
    if (!meta) throw new Error('元数据缺失')
    if (!meta.images.includes(relativePath)) throw new Error('封面必须是套图内图片')
    meta.cover = relativePath
    await this.writeMetaAt(hit.dirName, meta)
    const entries = await this.loadIndex()
    const idx = entries.findIndex((e) => e.source === source && e.galleryId === galleryId)
    if (idx >= 0) entries[idx] = toIndexEntry(meta, hit.dirName)
    await this.saveIndex(entries)
    return meta
  }
}
