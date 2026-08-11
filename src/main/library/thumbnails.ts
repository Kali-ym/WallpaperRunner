import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, access, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { nativeImage } from 'electron'

/** Cover card is ~180px; 360 covers retina without shipping full-res photos. */
const THUMB_MAX_EDGE = 360
const THUMB_JPEG_QUALITY = 72

const inflight = new Map<string, Promise<{ absPath: string; mime: string }>>()

function mimeFromPath(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  return 'image/jpeg'
}

/**
 * Resolve a cached JPEG thumbnail for any library image.
 * Falls back to the original when the image is already small or cannot be decoded.
 */
export async function resolveThumb(
  libraryRoot: string,
  absImagePath: string,
): Promise<{ absPath: string; mime: string }> {
  let st: { mtimeMs: number; size: number }
  try {
    st = await stat(absImagePath)
  } catch {
    throw new Error('image missing')
  }

  const key = createHash('sha1')
    .update(`${absImagePath}|${st.mtimeMs}|${st.size}|${THUMB_MAX_EDGE}`)
    .digest('hex')
    .slice(0, 20)
  const thumbDir = join(libraryRoot, '.thumbs')
  const thumbPath = join(thumbDir, `${key}.jpg`)

  try {
    await access(thumbPath)
    return { absPath: thumbPath, mime: 'image/jpeg' }
  } catch {
    /* generate */
  }

  const existing = inflight.get(thumbPath)
  if (existing) return existing

  const job = (async () => {
    const src = await readFile(absImagePath)
    const img = nativeImage.createFromBuffer(src)
    if (img.isEmpty()) {
      return { absPath: absImagePath, mime: mimeFromPath(absImagePath) }
    }
    const { width, height } = img.getSize()
    if (width <= THUMB_MAX_EDGE && height <= THUMB_MAX_EDGE) {
      return { absPath: absImagePath, mime: mimeFromPath(absImagePath) }
    }
    const scale = THUMB_MAX_EDGE / Math.max(width, height)
    const resized = img.resize({
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
      quality: 'good',
    })
    await mkdir(thumbDir, { recursive: true })
    const jpeg = resized.toJPEG(THUMB_JPEG_QUALITY)
    await writeFile(thumbPath, jpeg)
    return { absPath: thumbPath, mime: 'image/jpeg' }
  })().finally(() => {
    inflight.delete(thumbPath)
  })

  inflight.set(thumbPath, job)
  return job
}

