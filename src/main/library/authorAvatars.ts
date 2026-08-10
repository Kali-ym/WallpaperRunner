import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, unlink, access, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { nativeImage } from 'electron'
import type { LibraryIndexEntry, LibraryStore } from './store'

const AVATAR_DIR = '.author-avatars'
const INDEX_FILE = 'author-avatars.json'
const AVATAR_SIZE = 256

export type AuthorAvatarCrop = {
  x: number
  y: number
  width: number
  height: number
}

export type AuthorAvatarRecord = {
  author: string
  fileName: string
  relativePath: string
  source: string
  galleryId: string
  imagePath: string
  crop: AuthorAvatarCrop
  updatedAt: string
}

export type AuthorImageSource = {
  source: string
  galleryId: string
  dirName: string
  title: string
  cover: string | null
  images: string[]
}

type AuthorAvatarsFile = {
  updatedAt: string
  avatars: Record<string, AuthorAvatarRecord>
}

function nowIso(): string {
  return new Date().toISOString()
}

export function authorKey(author: string): string {
  return createHash('sha1').update(author.trim().toLowerCase()).digest('hex').slice(0, 16)
}

export class AuthorAvatarStore {
  constructor(private readonly rootDir: string) {}

  private avatarsDir(): string {
    return join(this.rootDir, AVATAR_DIR)
  }

  private indexPath(): string {
    return join(this.rootDir, INDEX_FILE)
  }

  async ensureRoot(): Promise<void> {
    await mkdir(this.avatarsDir(), { recursive: true })
  }

  private async loadFile(): Promise<AuthorAvatarsFile> {
    await this.ensureRoot()
    try {
      const raw = await readFile(this.indexPath(), 'utf8')
      const parsed = JSON.parse(raw) as AuthorAvatarsFile
      return {
        updatedAt: parsed.updatedAt || nowIso(),
        avatars: parsed.avatars && typeof parsed.avatars === 'object' ? parsed.avatars : {},
      }
    } catch {
      return { updatedAt: nowIso(), avatars: {} }
    }
  }

  private async saveFile(data: AuthorAvatarsFile): Promise<void> {
    await this.ensureRoot()
    await writeFile(this.indexPath(), JSON.stringify(data, null, 2), 'utf8')
  }

  async list(): Promise<AuthorAvatarRecord[]> {
    const file = await this.loadFile()
    return Object.values(file.avatars)
  }

  async get(author: string): Promise<AuthorAvatarRecord | null> {
    const key = authorKey(author)
    const file = await this.loadFile()
    return file.avatars[key] ?? null
  }

  async listImageSources(store: LibraryStore, author: string): Promise<AuthorImageSource[]> {
    const needle = author.trim().toLowerCase()
    if (!needle) return []
    const entries = (await store.loadIndex()).filter(
      (e) => e.author?.trim().toLowerCase() === needle,
    )
    entries.sort((a, b) => a.downloadedAt.localeCompare(b.downloadedAt))

    const out: AuthorImageSource[] = []
    const metas = await Promise.all(
      entries.map((entry) => store.getGallery(entry.source, entry.galleryId)),
    )
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!
      const meta = metas[i]
      const cover = meta?.cover ?? entry.cover
      const rawImages = meta?.images?.length ? meta.images : cover ? [cover] : []
      const images =
        cover && rawImages.includes(cover)
          ? [cover, ...rawImages.filter((img) => img !== cover)]
          : cover
            ? [cover, ...rawImages]
            : rawImages
      if (images.length === 0) continue
      out.push({
        source: entry.source,
        galleryId: entry.galleryId,
        dirName: entry.dirName,
        title: entry.displayTitle || entry.title,
        cover,
        images,
      })
    }
    return out
  }

  async set(
    author: string,
    payload: {
      source: string
      galleryId: string
      dirName: string
      imagePath: string
      crop: AuthorAvatarCrop
    },
  ): Promise<AuthorAvatarRecord> {
    const trimmed = author.trim()
    if (!trimmed) throw new Error('作者名不能为空')

    const absSource = join(this.rootDir, payload.dirName, payload.imagePath)
    try {
      await access(absSource)
    } catch {
      throw new Error('图片不存在')
    }

    const key = authorKey(trimmed)
    const file = await this.loadFile()
    const prev = file.avatars[key]
    const fileName = prev?.fileName ?? `${key}.jpg`
    const relativePath = `${AVATAR_DIR}/${fileName}`
    const outPath = join(this.rootDir, relativePath)

    await cropAndSaveAvatar(absSource, payload.crop, outPath)

    const record: AuthorAvatarRecord = {
      author: trimmed,
      fileName,
      relativePath,
      source: payload.source,
      galleryId: payload.galleryId,
      imagePath: payload.imagePath,
      crop: payload.crop,
      updatedAt: nowIso(),
    }

    file.avatars[key] = record
    file.updatedAt = nowIso()
    await this.saveFile(file)
    return record
  }

  async clear(author: string): Promise<boolean> {
    const key = authorKey(author)
    const file = await this.loadFile()
    const prev = file.avatars[key]
    if (!prev) return false

    delete file.avatars[key]
    file.updatedAt = nowIso()
    await this.saveFile(file)

    try {
      await unlink(join(this.rootDir, prev.relativePath))
    } catch {
      /* ignore */
    }
    return true
  }

  /** Move avatar record when an author is renamed. */
  async renameAuthor(from: string, to: string): Promise<boolean> {
    const oldKey = authorKey(from)
    const newKey = authorKey(to)
    const newName = to.trim()
    if (!newName) return false

    const file = await this.loadFile()
    const record = file.avatars[oldKey]
    if (!record) return false

    record.author = newName

    if (oldKey === newKey) {
      file.avatars[oldKey] = record
      file.updatedAt = nowIso()
      await this.saveFile(file)
      return true
    }

    delete file.avatars[oldKey]

    const prevAtNew = file.avatars[newKey]
    if (prevAtNew) {
      try {
        await unlink(join(this.rootDir, prevAtNew.relativePath))
      } catch {
        /* ignore */
      }
    }

    const newFileName = `${newKey}.jpg`
    const newRelativePath = `${AVATAR_DIR}/${newFileName}`
    const oldAbs = join(this.rootDir, record.relativePath)
    const newAbs = join(this.rootDir, newRelativePath)

    try {
      await access(oldAbs)
      await mkdir(dirname(newAbs), { recursive: true })
      await rename(oldAbs, newAbs)
    } catch {
      /* keep index even if file move fails */
    }

    record.fileName = newFileName
    record.relativePath = newRelativePath
    file.avatars[newKey] = record
    file.updatedAt = nowIso()
    await this.saveFile(file)
    return true
  }
}

async function cropAndSaveAvatar(
  absSourcePath: string,
  crop: AuthorAvatarCrop,
  outPath: string,
): Promise<void> {
  const buf = await readFile(absSourcePath)
  let img = nativeImage.createFromBuffer(buf)
  if (img.isEmpty()) throw new Error('无法读取图片')

  let { width: iw, height: ih } = img.getSize()
  const maxEdge = 1920
  let scale = 1
  if (Math.max(iw, ih) > maxEdge) {
    scale = maxEdge / Math.max(iw, ih)
    img = img.resize({
      width: Math.max(1, Math.round(iw * scale)),
      height: Math.max(1, Math.round(ih * scale)),
      quality: 'good',
    })
    iw = Math.max(1, Math.round(iw * scale))
    ih = Math.max(1, Math.round(ih * scale))
  }

  const x = Math.max(0, Math.round(crop.x * scale))
  const y = Math.max(0, Math.round(crop.y * scale))
  const w = Math.min(Math.round(crop.width * scale), iw - x)
  const h = Math.min(Math.round(crop.height * scale), ih - y)
  if (w <= 0 || h <= 0) throw new Error('裁剪区域无效')

  const cropped = img.crop({ x, y, width: w, height: h })
  const resized = cropped.resize({
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    quality: 'best',
  })
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, resized.toJPEG(88))
}

/** First gallery cover for an author (by download time). */
export function defaultAuthorCoverEntry(
  lib: LibraryIndexEntry[],
  author: string,
): LibraryIndexEntry | undefined {
  const needle = author.trim().toLowerCase()
  if (!needle) return undefined
  const entries = lib
    .filter((e) => e.author?.trim().toLowerCase() === needle && e.cover)
    .sort((a, b) => a.downloadedAt.localeCompare(b.downloadedAt))
  return entries[0]
}

export function buildAuthorCoverMap(lib: LibraryIndexEntry[]): Map<string, LibraryIndexEntry> {
  const buckets = new Map<string, LibraryIndexEntry[]>()
  for (const e of lib) {
    const author = e.author?.trim()
    if (!author || !e.cover) continue
    const list = buckets.get(author) ?? []
    list.push(e)
    buckets.set(author, list)
  }
  const map = new Map<string, LibraryIndexEntry>()
  for (const [author, entries] of buckets) {
    const sorted = [...entries].sort((a, b) => a.downloadedAt.localeCompare(b.downloadedAt))
    map.set(author, sorted[0]!)
  }
  return map
}
