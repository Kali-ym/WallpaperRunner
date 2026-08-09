import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { httpFetch } from '../http/client'

export interface DownloadFileResult {
  bytes: number
  contentType: string | null
}

export type DownloadFileProgress = {
  received: number
  total: number | null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function readResponseBody(
  res: Response,
  onProgress?: (p: DownloadFileProgress) => void,
  signal?: AbortSignal,
): Promise<Buffer> {
  const totalHeader = res.headers.get('content-length')
  const total = totalHeader ? Number.parseInt(totalHeader, 10) : null
  const knownTotal = total && Number.isFinite(total) && total > 0 ? total : null

  const body = res.body
  if (!body || typeof body.getReader !== 'function' || !onProgress) {
    const buf = Buffer.from(await res.arrayBuffer())
    onProgress?.({ received: buf.byteLength, total: knownTotal ?? buf.byteLength })
    return buf
  }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  let lastEmit = 0
  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel().catch(() => undefined)
        throw signal.reason instanceof Error ? signal.reason : new Error('已取消')
      }
      const { done, value } = await reader.read()
      if (done) break
      if (value?.byteLength) {
        chunks.push(value)
        received += value.byteLength
        const now = Date.now()
        if (now - lastEmit >= 200) {
          lastEmit = now
          onProgress({ received, total: knownTotal })
        }
      }
    }
  } finally {
    reader.releaseLock?.()
  }
  onProgress({ received, total: knownTotal ?? received })
  return Buffer.concat(chunks)
}

export async function downloadFile(
  url: string,
  destPath: string,
  opts?: {
    signal?: AbortSignal
    headers?: Record<string, string>
    retries?: number
    referer?: string
    onProgress?: (p: DownloadFileProgress) => void
  },
): Promise<DownloadFileResult> {
  const retries = opts?.retries ?? 3
  let lastError: unknown

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await httpFetch(url, {
        signal: opts?.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          Referer: opts?.referer ?? 'https://xchina.co/',
          ...(opts?.headers ?? {}),
        },
      })
      // Prefer curl on Windows (Cloudflare). Progress still reports after body is read;
      // mid-stream progress only applies when undici returns a ReadableStream.

      if (res.status === 404) {
        throw new Error(`资源不存在 (HTTP 404)，图床可能已失效: ${url}`)
      }
      if (res.status === 403 || res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status}`)
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} downloading ${url}`)
      }

      const buf = await readResponseBody(res, opts?.onProgress, opts?.signal)
      const contentType = res.headers.get('content-type')
      if (contentType && contentType.includes('text/html')) {
        throw new Error(`Expected image but got HTML from ${url}`)
      }
      if (buf.byteLength < 1024) {
        throw new Error(`Downloaded file too small (${buf.byteLength} bytes): ${url}`)
      }

      await mkdir(dirname(destPath), { recursive: true })
      await writeFile(destPath, buf)
      return {
        bytes: buf.byteLength,
        contentType,
      }
    } catch (err) {
      lastError = err
      if (opts?.signal?.aborted) throw err
      const delay = 400 * 2 ** attempt
      await sleep(delay)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export function extensionFromUrlOrType(url: string, contentType: string | null): string {
  const pathPart = url.split('?')[0] ?? url
  const m = pathPart.match(/\.(jpe?g|png|webp|gif|zip|7z|rar)$/i)
  if (m) {
    const ext = `.${m[1].toLowerCase().replace('jpeg', 'jpg')}`
    return ext
  }
  if (contentType?.includes('7z') || contentType?.includes('x-7z')) return '.7z'
  if (contentType?.includes('rar') || contentType?.includes('x-rar')) return '.rar'
  if (contentType?.includes('zip') || contentType?.includes('application/x-zip')) return '.zip'
  if (contentType?.includes('png')) return '.png'
  if (contentType?.includes('webp')) return '.webp'
  if (contentType?.includes('gif')) return '.gif'
  if (contentType?.includes('jpeg') || contentType?.includes('jpg')) return '.jpg'
  return '.jpg'
}

/** Local file magic: ZIP / 7Z / RAR / JPEG / PNG / GIF / WEBP */
export function extensionFromMagic(buf: Buffer): string | null {
  if (buf.length < 4) return null
  if (buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07)) {
    return '.zip'
  }
  if (
    buf.length >= 6 &&
    buf[0] === 0x37 &&
    buf[1] === 0x7a &&
    buf[2] === 0xbc &&
    buf[3] === 0xaf &&
    buf[4] === 0x27 &&
    buf[5] === 0x1c
  ) {
    return '.7z'
  }
  if (buf[0] === 0x52 && buf[1] === 0x61 && buf[2] === 0x72 && buf[3] === 0x21) {
    return '.rar'
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg'
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return '.png'
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return '.gif'
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return '.webp'
  }
  return null
}
