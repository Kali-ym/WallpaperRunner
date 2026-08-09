import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { GalleryRef, LibraryIndexEntry } from './store'

export type PlaylistGalleryRef = GalleryRef

export interface UserPlaylist {
  id: string
  name: string
  galleryRefs: PlaylistGalleryRef[]
  createdAt: string
  updatedAt: string
}

interface PlaylistsFile {
  updatedAt: string
  playlists: UserPlaylist[]
}

function nowIso(): string {
  return new Date().toISOString()
}

function newPlaylistId(): string {
  return `pl_${randomBytes(6).toString('hex')}`
}

function refKey(r: PlaylistGalleryRef): string {
  return `${r.source}/${r.galleryId}`
}

export class PlaylistStore {
  constructor(private readonly rootDir: string) {}

  private filePath(): string {
    return join(this.rootDir, 'playlists.json')
  }

  async ensureRoot(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true })
  }

  async load(): Promise<UserPlaylist[]> {
    await this.ensureRoot()
    try {
      const raw = await readFile(this.filePath(), 'utf8')
      const parsed = JSON.parse(raw) as PlaylistsFile
      return Array.isArray(parsed.playlists) ? parsed.playlists : []
    } catch {
      return []
    }
  }

  private async save(playlists: UserPlaylist[]): Promise<void> {
    await this.ensureRoot()
    const payload: PlaylistsFile = {
      updatedAt: nowIso(),
      playlists,
    }
    await writeFile(this.filePath(), JSON.stringify(payload, null, 2), 'utf8')
  }

  async list(): Promise<UserPlaylist[]> {
    return this.load()
  }

  async create(name: string): Promise<UserPlaylist> {
    const trimmed = name.trim() || '未命名列表'
    const playlists = await this.load()
    const pl: UserPlaylist = {
      id: newPlaylistId(),
      name: trimmed,
      galleryRefs: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    playlists.push(pl)
    await this.save(playlists)
    return pl
  }

  async rename(id: string, name: string): Promise<UserPlaylist> {
    const playlists = await this.load()
    const pl = playlists.find((p) => p.id === id)
    if (!pl) throw new Error('播放列表不存在')
    pl.name = name.trim() || pl.name
    pl.updatedAt = nowIso()
    await this.save(playlists)
    return pl
  }

  async delete(id: string): Promise<void> {
    const playlists = await this.load()
    const next = playlists.filter((p) => p.id !== id)
    if (next.length === playlists.length) throw new Error('播放列表不存在')
    await this.save(next)
  }

  async setMembers(id: string, refs: PlaylistGalleryRef[]): Promise<UserPlaylist> {
    const playlists = await this.load()
    const pl = playlists.find((p) => p.id === id)
    if (!pl) throw new Error('播放列表不存在')
    const seen = new Set<string>()
    const unique: PlaylistGalleryRef[] = []
    for (const r of refs) {
      const k = refKey(r)
      if (seen.has(k)) continue
      seen.add(k)
      unique.push({ source: r.source, galleryId: r.galleryId })
    }
    pl.galleryRefs = unique
    pl.updatedAt = nowIso()
    await this.save(playlists)
    return pl
  }

  async addToPlaylists(playlistIds: string[], ref: PlaylistGalleryRef): Promise<number> {
    const playlists = await this.load()
    const idSet = new Set(playlistIds)
    let n = 0
    for (const pl of playlists) {
      if (!idSet.has(pl.id)) continue
      const k = refKey(ref)
      if (pl.galleryRefs.some((r) => refKey(r) === k)) continue
      pl.galleryRefs.push({ source: ref.source, galleryId: ref.galleryId })
      pl.updatedAt = nowIso()
      n += 1
    }
    if (n > 0) await this.save(playlists)
    return n
  }

  /** Drop refs that no longer exist in the library index. */
  async pruneMissing(entries: LibraryIndexEntry[]): Promise<number> {
    const alive = new Set(entries.map((e) => `${e.source}/${e.galleryId}`))
    const playlists = await this.load()
    let removed = 0
    for (const pl of playlists) {
      const before = pl.galleryRefs.length
      pl.galleryRefs = pl.galleryRefs.filter((r) => alive.has(refKey(r)))
      if (pl.galleryRefs.length !== before) {
        pl.updatedAt = nowIso()
        removed += before - pl.galleryRefs.length
      }
    }
    if (removed > 0) await this.save(playlists)
    return removed
  }
}
