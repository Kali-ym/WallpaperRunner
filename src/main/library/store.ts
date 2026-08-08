import { mkdir, readdir, readFile, writeFile, access } from 'node:fs/promises'
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
}

export interface LibraryIndexEntry {
  source: string
  galleryId: string
  title: string
  author: string
  tags: string[]
  cover: string | null
  imageCount: number
  dirName: string
  downloadedAt: string
}

interface LibraryIndexFile {
  entries: LibraryIndexEntry[]
}

export class LibraryStore {
  constructor(private readonly rootDir: string) {}

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
    await this.ensureRoot()
    try {
      const raw = await readFile(this.indexPath(), 'utf8')
      const parsed = JSON.parse(raw) as LibraryIndexFile
      return parsed.entries ?? []
    } catch {
      return []
    }
  }

  private async saveIndex(entries: LibraryIndexEntry[]): Promise<void> {
    await this.ensureRoot()
    const payload: LibraryIndexFile = { entries }
    await writeFile(this.indexPath(), JSON.stringify(payload, null, 2), 'utf8')
  }

  async getGallery(source: string, galleryId: string): Promise<GalleryMetadata | null> {
    const entries = await this.loadIndex()
    const hit = entries.find((e) => e.source === source && e.galleryId === galleryId)
    if (!hit) return null
    const metaPath = join(this.rootDir, hit.dirName, 'metadata.json')
    try {
      const raw = await readFile(metaPath, 'utf8')
      return JSON.parse(raw) as GalleryMetadata
    } catch {
      return null
    }
  }

  async upsertGallery(meta: GalleryMetadata): Promise<void> {
    await this.ensureRoot()
    const dirName = galleryFolderName(meta.source, meta.galleryId, meta.title)
    const dir = join(this.rootDir, dirName)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'metadata.json'), JSON.stringify(meta, null, 2), 'utf8')

    const entries = await this.loadIndex()
    const next: LibraryIndexEntry = {
      source: meta.source,
      galleryId: meta.galleryId,
      title: meta.title,
      author: meta.author,
      tags: meta.tags,
      cover: meta.cover,
      imageCount: meta.images.length,
      dirName,
      downloadedAt: meta.downloadedAt,
    }
    const idx = entries.findIndex(
      (e) => e.source === meta.source && e.galleryId === meta.galleryId,
    )
    if (idx >= 0) entries[idx] = next
    else entries.unshift(next)
    await this.saveIndex(entries)
  }

  async search(query: string): Promise<LibraryIndexEntry[]> {
    const q = query.trim().toLowerCase()
    const entries = await this.loadIndex()
    if (!q) return entries
    return entries.filter((e) => {
      const hay = [e.title, e.author, ...e.tags].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }

  async rebuildIndex(): Promise<LibraryIndexEntry[]> {
    await this.ensureRoot()
    const dirs = await readdir(this.rootDir, { withFileTypes: true })
    const entries: LibraryIndexEntry[] = []
    for (const d of dirs) {
      if (!d.isDirectory()) continue
      const metaPath = join(this.rootDir, d.name, 'metadata.json')
      try {
        await access(metaPath)
        const raw = await readFile(metaPath, 'utf8')
        const meta = JSON.parse(raw) as GalleryMetadata
        entries.push({
          source: meta.source,
          galleryId: meta.galleryId,
          title: meta.title,
          author: meta.author,
          tags: meta.tags,
          cover: meta.cover,
          imageCount: meta.images.length,
          dirName: d.name,
          downloadedAt: meta.downloadedAt,
        })
      } catch {
        // skip folders without valid metadata
      }
    }
    entries.sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt))
    await this.saveIndex(entries)
    return entries
  }
}
