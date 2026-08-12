import { createWriteStream } from 'node:fs'
import { access, mkdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { finished } from 'node:stream/promises'
import { httpFetch, getPreferCurl, curlDownloadToFile } from '../http/client'

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

function retryDelayMs(err: unknown, attempt: number): number {
  const msg = err instanceof Error ? err.message : String(err)
  const rateLimited = /HTTP 429|HTTP 502|HTTP 503|HTTP 403/.test(msg)
  const base = rateLimited ? 2000 : 400
  return base * 2 ** attempt
}

async function partialSize(partPath: string): Promise<number> {
  try {
    const st = await stat(partPath)
    return st.size
  } catch {
    return 0
  }
}

function headersRecord(
  base: Record<string, string>,
  extra?: Record<string, string>,
): Record<string, string> {
  return { ...base, ...(extra ?? {}) }
}

async function streamBodyToPart(
  res: Response,
  partPath: string,
  offset: number,
  opts?: {
    signal?: AbortSignal
    onProgress?: (p: DownloadFileProgress) => void
    total: number | null
  },
): Promise<number> {
  const stream = createWriteStream(partPath, { flags: offset > 0 ? 'a' : 'w' })
  let received = offset
  let lastEmit = 0

  const emit = (force = false) => {
    const now = Date.now()
    if (!force && now - lastEmit < 200) return
    lastEmit = now
    opts?.onProgress?.({ received, total: opts.total })
  }

  try {
    const body = res.body
    if (body && typeof body.getReader === 'function') {
      const reader = body.getReader()
      try {
        while (true) {
          if (opts?.signal?.aborted) {
            await reader.cancel().catch(() => undefined)
            throw opts.signal.reason instanceof Error ? opts.signal.reason : new Error('已取消')
          }
          const { done, value } = await reader.read()
          if (done) break
          if (value?.byteLength) {
            const buf = Buffer.from(value)
            if (!stream.write(buf)) {
              await new Promise<void>((resolve) => stream.once('drain', resolve))
            }
            received += buf.byteLength
            emit()
          }
        }
      } finally {
        reader.releaseLock?.()
      }
    } else {
      const buf = Buffer.from(await res.arrayBuffer())
      if (opts?.signal?.aborted) {
        throw opts.signal.reason instanceof Error ? opts.signal.reason : new Error('已取消')
      }
      if (!stream.write(buf)) {
        await new Promise<void>((resolve) => stream.once('drain', resolve))
      }
      received += buf.byteLength
      emit(true)
    }
    stream.end()
    await finished(stream)
  } catch (err) {
    stream.destroy()
    throw err
  }

  emit(true)
  return received
}

async function downloadViaCurl(
  url: string,
  partPath: string,
  destPath: string,
  baseHeaders: Record<string, string>,
  opts?: {
    signal?: AbortSignal
    onProgress?: (p: DownloadFileProgress) => void
  },
): Promise<DownloadFileResult> {
  await mkdir(dirname(destPath), { recursive: true })
  const curlResult = await curlDownloadToFile(
    url,
    partPath,
    {
      signal: opts?.signal,
      headers: baseHeaders,
    },
    {
      signal: opts?.signal,
      onProgress: ({ received }) => {
        opts?.onProgress?.({ received, total: null })
      },
    },
  )

  if (curlResult.status === 404) {
    throw new Error(`资源不存在 (HTTP 404)，图床可能已失效: ${url}`)
  }
  if (curlResult.status === 403 || curlResult.status === 429 || curlResult.status >= 500) {
    throw new Error(`HTTP ${curlResult.status}`)
  }
  if (curlResult.status !== 200 && curlResult.status !== 206) {
    throw new Error(`HTTP ${curlResult.status} downloading ${url}`)
  }

  const contentType = curlResult.contentType
  if (contentType && contentType.includes('text/html')) {
    throw new Error(`Expected image but got HTML from ${url}`)
  }
  if (curlResult.bytes < 1024) {
    await unlink(partPath).catch(() => undefined)
    throw new Error(`Downloaded file too small (${curlResult.bytes} bytes): ${url}`)
  }

  await unlink(destPath).catch(() => undefined)
  await rename(partPath, destPath)
  await access(destPath)

  return {
    bytes: curlResult.bytes,
    contentType,
  }
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
  const partPath = `${destPath}.part`
  let lastError: unknown

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (opts?.signal?.aborted) {
        throw opts.signal.reason instanceof Error ? opts.signal.reason : new Error('已取消')
      }

      let offset = await partialSize(partPath)
      const baseHeaders = headersRecord(
        {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          Referer: opts?.referer ?? 'https://xchina.co/',
        },
        opts?.headers,
      )
      if (offset > 0) {
        baseHeaders.Range = `bytes=${offset}-`
      }

      // xchina CDN hotlink protection blocks undici on Windows; curl is required there.
      if (getPreferCurl()) {
        return await downloadViaCurl(url, partPath, destPath, baseHeaders, {
          signal: opts?.signal,
          onProgress: opts?.onProgress,
        })
      }

      const res = await httpFetch(
        url,
        {
          signal: opts?.signal,
          headers: baseHeaders,
        },
        { disableCurl: true },
      )

      if (res.status === 403 || res.status === 429) {
        return await downloadViaCurl(url, partPath, destPath, baseHeaders, {
          signal: opts?.signal,
          onProgress: opts?.onProgress,
        })
      }

      if (res.status === 404) {
        throw new Error(`资源不存在 (HTTP 404)，图床可能已失效: ${url}`)
      }
      if (res.status === 403 || res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status}`)
      }

      // Server ignored Range and sent full body — rewrite from scratch.
      if (offset > 0 && res.status === 200) {
        await unlink(partPath).catch(() => undefined)
        offset = 0
      }

      if (!res.ok && res.status !== 206) {
        throw new Error(`HTTP ${res.status} downloading ${url}`)
      }

      const contentType = res.headers.get('content-type')
      if (contentType && contentType.includes('text/html')) {
        throw new Error(`Expected image but got HTML from ${url}`)
      }

      const contentLength = Number.parseInt(res.headers.get('content-length') ?? '', 10)
      const knownLength = Number.isFinite(contentLength) && contentLength > 0 ? contentLength : null
      const total =
        res.status === 206 && knownLength != null
          ? offset + knownLength
          : knownLength

      await mkdir(dirname(destPath), { recursive: true })

      // Empty part file when starting fresh so flags:'w' truncates cleanly.
      if (offset === 0) {
        await writeFile(partPath, Buffer.alloc(0))
      }

      const received = await streamBodyToPart(res, partPath, offset, {
        signal: opts?.signal,
        onProgress: opts?.onProgress,
        total,
      })

      if (received < 1024) {
        await unlink(partPath).catch(() => undefined)
        throw new Error(`Downloaded file too small (${received} bytes): ${url}`)
      }

      await unlink(destPath).catch(() => undefined)
      await rename(partPath, destPath)
      await access(destPath)

      return {
        bytes: received,
        contentType,
      }
    } catch (err) {
      lastError = err
      if (opts?.signal?.aborted) throw err
      await unlink(partPath).catch(() => undefined)
      const delay = retryDelayMs(err, attempt)
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
