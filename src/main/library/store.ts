import { EventEmitter } from 'node:events'
import { mkdir, readdir, readFile, writeFile, access, rm, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { galleryFolderName } from './paths'
import {
  aggregateTagStats,
  aggregateAuthorStats,
  applyLibraryFilters,
  mergeTags,
  type LibraryFilters,
  type TagStat,
  type AuthorStat,
} from './filters'
import { fingerprintFile, groupDuplicatesByFingerprint } from './fingerprint'

export type { LibraryFilters, TagStat, AuthorStat } from './filters'

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
  /** SHA1 of cover/first image for duplicate detection. */
  contentFingerprint?: string
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
  contentFingerprint?: string
}

export interface GalleryRef {
  source: string
  galleryId: string
}

export type DuplicateGroup = {
  fingerprint: string
  galleries: LibraryIndexEntry[]
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
    contentFingerprint: meta.contentFingerprint,
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
      contentFingerprint: meta.contentFingerprint ?? prev?.contentFingerprint,
    }

    const dirName =
      existing?.dirName ?? galleryFolderName(merged.source, merged.galleryId, merged.title)

    if (!merged.contentFingerprint) {
      const coverRel = merged.cover || merged.images[0]
      if (coverRel) {
        const fp = await fingerprintFile(join(this.rootDir, dirName, coverRel))
        if (fp) merged.contentFingerprint = fp
      }
    }

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

  async search(query: string, opts?: LibraryFilters): Promise<LibraryIndexEntry[]> {
    const entries = await this.loadIndex()
    return applyLibraryFilters(entries, query, opts) as LibraryIndexEntry[]
  }

  async listTagStats(): Promise<TagStat[]> {
    const entries = await this.loadIndex()
    return aggregateTagStats(entries)
  }

  async listAuthorStats(): Promise<AuthorStat[]> {
    const entries = await this.loadIndex()
    return aggregateAuthorStats(entries)
  }

  async addTags(refs: GalleryRef[], tags: string[]): Promise<number> {
    const incoming = tags.map((t) => t.trim()).filter(Boolean)
    if (incoming.length === 0 || refs.length === 0) return 0
    let n = 0
    for (const ref of refs) {
      try {
        const hit = await this.findEntry(ref.source, ref.galleryId)
        if (!hit) continue
        const meta = await this.readMetaAt(hit.dirName)
        if (!meta) continue
        const next = mergeTags(meta.tags, incoming)
        if (next.length === meta.tags.length && next.every((t, i) => t === meta.tags[i])) continue
        await this.updateGalleryMeta(ref.source, ref.galleryId, { tags: next })
        n += 1
      } catch {
        // skip missing
      }
    }
    return n
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

  /** Rename an author on every gallery that currently uses `from`. */
  async renameAuthor(from: string, to: string): Promise<number> {
    const fromNeedle = from.trim().toLowerCase()
    const newName = to.trim()
    if (!fromNeedle) throw new Error('原作者名不能为空')
    if (!newName) throw new Error('新作者名不能为空')

    const entries = await this.loadIndex()
    const matches = entries.filter((e) => e.author?.trim().toLowerCase() === fromNeedle)
    if (matches.length === 0) return 0

    await Promise.all(
      matches.map(async (entry) => {
        const meta = await this.readMetaAt(entry.dirName)
        if (!meta) return
        meta.author = newName
        await this.writeMetaAt(entry.dirName, meta)
      }),
    )

    const next = entries.map((e) =>
      e.author?.trim().toLowerCase() === fromNeedle ? { ...e, author: newName } : e,
    )
    await this.saveIndex(next)
    return matches.length
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
    const fp = await fingerprintFile(join(this.rootDir, hit.dirName, relativePath))
    if (fp) meta.contentFingerprint = fp
    await this.writeMetaAt(hit.dirName, meta)
    const entries = await this.loadIndex()
    const idx = entries.findIndex((e) => e.source === source && e.galleryId === galleryId)
    if (idx >= 0) entries[idx] = toIndexEntry(meta, hit.dirName)
    await this.saveIndex(entries)
    return meta
  }

  /** Compute missing fingerprints; returns number updated. */
  async scanFingerprints(): Promise<number> {
    const entries = await this.loadIndex()
    let n = 0
    let indexDirty = false
    for (const e of entries) {
      const meta = await this.readMetaAt(e.dirName)
      if (!meta) continue
      if (meta.contentFingerprint) {
        if (e.contentFingerprint !== meta.contentFingerprint) {
          const idx = entries.findIndex(
            (x) => x.source === e.source && x.galleryId === e.galleryId,
          )
          if (idx >= 0) {
            entries[idx] = toIndexEntry(meta, e.dirName)
            indexDirty = true
          }
        }
        continue
      }
      const coverRel = meta.cover || meta.images[0]
      if (!coverRel) continue
      const fp = await fingerprintFile(join(this.rootDir, e.dirName, coverRel))
      if (!fp) continue
      meta.contentFingerprint = fp
      await this.writeMetaAt(e.dirName, meta)
      const idx = entries.findIndex((x) => x.source === e.source && x.galleryId === e.galleryId)
      if (idx >= 0) entries[idx] = toIndexEntry(meta, e.dirName)
      n += 1
      indexDirty = true
    }
    if (indexDirty) await this.saveIndex(entries)
    return n
  }

  async findDuplicates(): Promise<DuplicateGroup[]> {
    await this.scanFingerprints()
    const entries = await this.loadIndex()
    const withFp: Array<LibraryIndexEntry & { contentFingerprint: string }> = []
    for (const e of entries) {
      let fp = e.contentFingerprint
      if (!fp) {
        const meta = await this.readMetaAt(e.dirName)
        fp = meta?.contentFingerprint
      }
      if (!fp) continue
      withFp.push({ ...e, contentFingerprint: fp })
    }
    return groupDuplicatesByFingerprint(withFp).map((g) => ({
      fingerprint: g.fingerprint,
      galleries: g.items,
    }))
  }
}
