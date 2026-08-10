import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { ProxyAgent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from 'undici'

export type HttpFetch = (
  url: string,
  init?: RequestInit & { dispatcher?: unknown },
) => Promise<Response>

let proxyUrl: string | null = null
let agent: ProxyAgent | undefined
let customFetch: HttpFetch | null = null
/** Prefer curl.exe on Windows when undici is blocked by Cloudflare. */
let preferCurl = process.platform === 'win32'

export function setHttpProxy(url: string | null | undefined): void {
  const next = (url ?? '').trim() || null
  proxyUrl = next
  agent = next ? new ProxyAgent(next) : undefined
}

export function getHttpProxy(): string | null {
  return proxyUrl
}

export function setHttpFetch(fn: HttpFetch | null): void {
  customFetch = fn
}

export function setPreferCurl(enabled: boolean): void {
  preferCurl = enabled
}

function headersToRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {}
  if (headers instanceof Headers) {
    const out: Record<string, string> = {}
    headers.forEach((v, k) => {
      out[k] = v
    })
    return out
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers)
  }
  return { ...headers }
}

async function curlFetch(url: string, init?: RequestInit): Promise<Response> {
  const id = randomBytes(8).toString('hex')
  const bodyPath = join(tmpdir(), `gal-curl-body-${id}`)
  const hdrPath = join(tmpdir(), `gal-curl-hdr-${id}`)
  const args = [
    '-sS',
    '-L',
    '-D',
    hdrPath,
    '-o',
    bodyPath,
    '--connect-timeout',
    '30',
    '-A',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  ]
  if (proxyUrl) {
    args.push('-x', proxyUrl)
  }
  const headers = headersToRecord(init?.headers)
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === 'user-agent') continue
    args.push('-H', `${k}: ${v}`)
  }
  if (init?.method && init.method.toUpperCase() !== 'GET') {
    args.push('-X', init.method.toUpperCase())
  }
  args.push(url)

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.platform === 'win32' ? 'curl.exe' : 'curl', args, {
      windowsHide: true,
    })
    let err = ''
    child.stderr.on('data', (d) => {
      err += String(d)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`curl exit ${code}: ${err || url}`))
    })
  })

  const rawHdr = await readFile(hdrPath, 'utf8').catch(() => '')
  const body = await readFile(bodyPath)
  await unlink(hdrPath).catch(() => undefined)
  await unlink(bodyPath).catch(() => undefined)

  const blocks = rawHdr.split(/\r?\n\r?\n/).filter(Boolean)
  const last = blocks[blocks.length - 1] ?? ''
  const lines = last.split(/\r?\n/)
  const statusLine = lines[0] ?? 'HTTP/1.1 500'
  const status = Number.parseInt(statusLine.split(' ')[1] ?? '500', 10)
  const hdrs = new Headers()
  for (const line of lines.slice(1)) {
    const idx = line.indexOf(':')
    if (idx > 0) hdrs.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim())
  }

  return new Response(body, { status: Number.isFinite(status) ? status : 500, headers: hdrs })
}

export type HttpFetchOptions = {
  /** Skip curl.exe so Response.body can be streamed (progress). */
  disableCurl?: boolean
}

export async function httpFetch(
  url: string,
  init?: UndiciRequestInit,
  opts?: HttpFetchOptions,
): Promise<Response> {
  if (customFetch) {
    return customFetch(url, init as RequestInit)
  }
  if (preferCurl && !opts?.disableCurl) {
    try {
      return await curlFetch(url, init as RequestInit)
    } catch {
      // Always fall through to undici (Windows without curl, Cloudflare blocks, etc.)
    }
  }
  const res = await undiciFetch(url, {
    ...init,
    dispatcher: agent,
  })
  return res as unknown as Response
}

// ensure tmpdir exists for curl temp files
void mkdir(tmpdir(), { recursive: true })
