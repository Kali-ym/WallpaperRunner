import { execFile } from 'node:child_process'
import {
  copyFile,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import sevenBin from '7zip-bin'
import { createExtractorFromFile } from 'node-unrar-js'
import { galleryFolderName } from './paths'
import { isArchiveFileName, nextImageStartIndex } from './imageIndex'
import type { GalleryMetadata, LibraryStore } from './store'

const execFileAsync = promisify(execFile)

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])
export const ARCHIVE_EXT = new Set(['.zip', '.7z', '.rar'])

export type ArchiveKind = 'zip' | '7z' | 'rar'

export type ExtractZipOptions = {
  source: string
  galleryId: string
  title: string
  sourceUrl: string
  author?: string
  deleteZip?: boolean
  password?: string
  /** Extract into the same gallery that owns the archive. */
  intoExisting?: boolean
}

export class ZipPasswordRequiredError extends Error {
  constructor(message = '压缩包已加密，请输入密码') {
    super(message)
    this.name = 'ZipPasswordRequiredError'
  }
}

export function detectArchiveKindFromMagic(buf: Buffer): ArchiveKind | null {
  if (buf.length < 4) return null
  // ZIP
  if (buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07)) {
    return 'zip'
  }
  // 7z: 37 7A BC AF 27 1C
  if (
    buf.length >= 6 &&
    buf[0] === 0x37 &&
    buf[1] === 0x7a &&
    buf[2] === 0xbc &&
    buf[3] === 0xaf &&
    buf[4] === 0x27 &&
    buf[5] === 0x1c
  ) {
    return '7z'
  }
  // RAR: "Rar!" 52 61 72 21
  if (buf[0] === 0x52 && buf[1] === 0x61 && buf[2] === 0x72 && buf[3] === 0x21) {
    return 'rar'
  }
  return null
}

export function archiveExtForKind(kind: ArchiveKind): string {
  return `.${kind}`
}

export async function detectArchiveKind(path: string): Promise<ArchiveKind | null> {
  const byExt = extname(path).toLowerCase()
  if (byExt === '.zip' || byExt === '.7z' || byExt === '.rar') {
    // Prefer magic when readable; fall back to extension
    try {
      const fh = await open(path, 'r')
      try {
        const buf = Buffer.alloc(8)
        const { bytesRead } = await fh.read(buf, 0, 8, 0)
        if (bytesRead >= 4) {
          const kind = detectArchiveKindFromMagic(buf)
          if (kind) return kind
        }
      } finally {
        await fh.close()
      }
    } catch {
      /* use extension */
    }
    return byExt.slice(1) as ArchiveKind
  }

  try {
    const fh = await open(path, 'r')
    try {
      const buf = Buffer.alloc(8)
      const { bytesRead } = await fh.read(buf, 0, 8, 0)
      if (bytesRead < 4) return null
      return detectArchiveKindFromMagic(buf)
    } finally {
      await fh.close()
    }
  } catch {
    return null
  }
}

export function findZipArtifacts(imageNames: string[]): string[] {
  return imageNames.filter((n) => ARCHIVE_EXT.has(extname(n).toLowerCase()))
}

/** Find archives (incl. misnamed) by magic; rename to correct extension. */
export async function resolveZipArtifacts(
  dir: string,
  imageNames: string[],
): Promise<{ zipNames: string[]; renamedMeta: string[] | null }> {
  const zipNames: string[] = []
  let changed = false
  const nextNames = [...imageNames]

  for (let i = 0; i < nextNames.length; i++) {
    const name = nextNames[i]
    const abs = join(dir, name)
    const ext = extname(name).toLowerCase()
    if (ARCHIVE_EXT.has(ext)) {
      zipNames.push(name)
      continue
    }
    const kind = await detectArchiveKind(abs)
    if (!kind) continue
    const base = basename(name, extname(name))
    const archiveName = `${base}${archiveExtForKind(kind)}`
    const dest = join(dir, archiveName)
    if (archiveName !== name) {
      await rename(abs, dest).catch(() => undefined)
      try {
        await open(dest, 'r').then((fh) => fh.close())
        nextNames[i] = archiveName
        changed = true
        zipNames.push(archiveName)
      } catch {
        zipNames.push(name)
      }
    } else {
      zipNames.push(name)
    }
  }

  return { zipNames, renamedMeta: changed ? nextNames : null }
}

export function zipGalleryIdFromPath(zipPath: string): string {
  const base = basename(zipPath)
    .replace(/\.(zip|7z|rar)$/i, '')
    .replace(/[^\w\-]+/g, '_')
    .slice(0, 40)
  return `archive_${base || 'pack'}_${Date.now().toString(36)}`
}

async function collectImagesFromDir(root: string): Promise<{ rel: string; abs: string }[]> {
  const out: { rel: string; abs: string }[] = []
  async function walk(dir: string, prefix: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name
      const abs = join(dir, e.name)
      if (e.isDirectory()) await walk(abs, rel)
      else if (IMAGE_EXT.has(extname(e.name).toLowerCase())) out.push({ rel, abs })
    }
  }
  await walk(root, '')
  return out
}

function isPasswordError(stderr: string, stdout: string): boolean {
  const text = `${stderr}\n${stdout}`
  return /Wrong password|Enter password|Cannot open encrypted|Data Error.*password|ERROR: Wrong password/i.test(
    text,
  )
}

function mapUnrarError(err: unknown, password?: string): Error {
  const e = err as { reason?: string; message?: string }
  const reason = String(e.reason ?? '')
  if (reason === 'ERAR_MISSING_PASSWORD' || (!password && /password/i.test(String(e.message)))) {
    return new ZipPasswordRequiredError('压缩包已加密，请输入密码')
  }
  if (reason === 'ERAR_BAD_PASSWORD') {
    return new ZipPasswordRequiredError('密码不正确，请重试')
  }
  if (reason === 'ERAR_BAD_DATA' || reason === 'ERAR_BAD_ARCHIVE') {
    return new Error('RAR 文件损坏或不是有效压缩包')
  }
  return new Error(`解压失败: ${(e.message || String(err)).trim().slice(0, 300) || '未知错误'}`)
}

/** Official unrar (WASM) — 7za does not support RAR. */
async function extractRarArchive(
  archivePath: string,
  destDir: string,
  password?: string,
): Promise<void> {
  try {
    const extractor = await createExtractorFromFile({
      filepath: archivePath,
      targetPath: destDir,
      password: password || undefined,
    })
    // Generators are lazy; must iterate to actually extract.
    const { files } = extractor.extract()
    for (const _ of files) {
      /* drain */
    }
  } catch (err) {
    throw mapUnrarError(err, password)
  }
}

async function extractArchiveWith7z(
  archivePath: string,
  destDir: string,
  password?: string,
): Promise<void> {
  const bin = sevenBin.path7za
  // 7za on Windows mangles non-ASCII paths; copy to an ASCII-only temp path first.
  const stage = await mkdtemp(join(tmpdir(), 'gallery-7z-src-'))
  const ext = extname(archivePath).toLowerCase() || '.bin'
  const safeArchive = join(stage, `pack${ext}`)
  try {
    await copyFile(archivePath, safeArchive)
    const kind = await detectArchiveKind(safeArchive)
    if (!kind) {
      throw new Error('文件不是有效的压缩包（可能损坏或扩展名错误）')
    }

    const args = [
      'x',
      safeArchive,
      `-o${destDir}`,
      '-y',
      '-aos',
      password ? `-p${password}` : '-p',
    ]
    try {
      await execFileAsync(bin, args, {
        windowsHide: true,
        maxBuffer: 20 * 1024 * 1024,
      })
    } catch (err) {
      const e = err as { stderr?: string; stdout?: string; message?: string }
      const stderr = String(e.stderr ?? '')
      const stdout = String(e.stdout ?? '')
      const message = String(e.message ?? err)
      if (isPasswordError(stderr, stdout) || isPasswordError(message, '')) {
        throw new ZipPasswordRequiredError(
          password ? '密码不正确，请重试' : '压缩包已加密，请输入密码',
        )
      }
      if (/password/i.test(`${stderr}${stdout}${message}`) && !password) {
        throw new ZipPasswordRequiredError('压缩包已加密，请输入密码')
      }
      if (/Cannot open the file as archive/i.test(`${stderr}\n${stdout}\n${message}`)) {
        throw new Error(
          `无法打开压缩包（${kind}）。请确认文件完整；若有密码请填写正确密码`,
        )
      }
      throw new Error(
        `解压失败: ${(stderr || stdout || message).trim().slice(0, 300) || '未知错误'}`,
      )
    }
  } finally {
    await rm(stage, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function extractArchive(
  archivePath: string,
  destDir: string,
  kind: ArchiveKind,
  password?: string,
): Promise<void> {
  if (kind === 'rar') {
    await extractRarArchive(archivePath, destDir, password)
    return
  }
  await extractArchiveWith7z(archivePath, destDir, password)
}

export async function extractZipToGallery(
  zipPath: string,
  store: LibraryStore,
  opts: ExtractZipOptions,
): Promise<GalleryMetadata> {
  const kind = await detectArchiveKind(zipPath)
  if (!kind) {
    throw new Error('不是有效的压缩包（支持 zip / 7z / rar）')
  }

  const tempRoot = await mkdtemp(join(tmpdir(), 'gallery-unzip-'))
  try {
    await extractArchive(zipPath, tempRoot, kind, opts.password)

    const found = await collectImagesFromDir(tempRoot)
    if (found.length === 0) {
      // Encrypted archive may extract empty without clear error on some builds
      if (!opts.password) {
        throw new ZipPasswordRequiredError(
          '未解出图片。若压缩包有密码，请填写后重试；否则包内可能没有 jpg/png/webp/gif',
        )
      }
      throw new Error('压缩包内没有可入库的图片（jpg/png/webp/gif）')
    }

    const dirName = galleryFolderName(opts.source, opts.galleryId, opts.title)
    const dir = join(store.root, dirName)
    await mkdir(dir, { recursive: true })

    const existing = opts.intoExisting
      ? await store.getGallery(opts.source, opts.galleryId)
      : null

    const zipBase = basename(zipPath)
    const removeArchive =
      opts.deleteZip === true || (opts.intoExisting && opts.deleteZip !== false)

    let names = [...(existing?.images ?? [])]
    if (removeArchive) {
      names = names.filter((n) => n !== zipBase)
    }

    let index = nextImageStartIndex(names)
    const added: string[] = []
    for (const file of found) {
      const ext = extname(file.abs).toLowerCase().replace('.jpeg', '.jpg')
      let name = `${String(index).padStart(3, '0')}${ext}`
      while (names.includes(name) || added.includes(name)) {
        index += 1
        name = `${String(index).padStart(3, '0')}${ext}`
      }
      const data = await readFile(file.abs)
      await writeFile(join(dir, name), data)
      added.push(name)
      index += 1
    }
    names = [...names, ...added]

    if (removeArchive) {
      await unlink(zipPath).catch(() => undefined)
    }

    const imageOnly = names.filter((n) => !isArchiveFileName(n))
    const meta: GalleryMetadata = {
      source: opts.source,
      galleryId: opts.galleryId,
      title: opts.title,
      sourceUrl: opts.sourceUrl,
      author: opts.author ?? existing?.author ?? '',
      tags: existing?.tags ?? [],
      pageCount: existing?.pageCount ?? 1,
      cover:
        existing?.cover && names.includes(existing.cover)
          ? existing.cover
          : imageOnly[0] ?? null,
      images: names,
      downloadedAt: existing?.downloadedAt ?? new Date().toISOString(),
      favorite: existing?.favorite,
      displayTitle: existing?.displayTitle,
    }
    await store.upsertGallery(meta)
    return meta
  } finally {
    await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined)
  }
}
