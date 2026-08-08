import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface DownloadFileResult {
  bytes: number
  contentType: string | null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function downloadFile(
  url: string,
  destPath: string,
  opts?: {
    signal?: AbortSignal
    headers?: Record<string, string>
    retries?: number
  },
): Promise<DownloadFileResult> {
  const retries = opts?.retries ?? 3
  let lastError: unknown

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        signal: opts?.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Referer: 'https://xchina.co/',
          ...(opts?.headers ?? {}),
        },
      })

      if (res.status === 403 || res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status}`)
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} downloading ${url}`)
      }

      const buf = Buffer.from(await res.arrayBuffer())
      await mkdir(dirname(destPath), { recursive: true })
      await writeFile(destPath, buf)
      return {
        bytes: buf.byteLength,
        contentType: res.headers.get('content-type'),
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
  const m = pathPart.match(/\.(jpe?g|png|webp|gif)$/i)
  if (m) return `.${m[1].toLowerCase().replace('jpeg', 'jpg')}`
  if (contentType?.includes('png')) return '.png'
  if (contentType?.includes('webp')) return '.webp'
  if (contentType?.includes('gif')) return '.gif'
  return '.jpg'
}
