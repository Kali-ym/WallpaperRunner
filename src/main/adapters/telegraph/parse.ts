export interface TelegraphParsedAsset {
  url: string
  kind: 'telegraph_image' | 'telegraph_file'
  fileName?: string
}

export interface TelegraphParseResult {
  title: string
  author: string
  assets: TelegraphParsedAsset[]
}

function absolutize(src: string, pageUrl: string): string {
  if (/^https?:\/\//i.test(src)) return src
  if (src.startsWith('//')) return `https:${src}`
  try {
    return new URL(src, pageUrl).href
  } catch {
    return src
  }
}

function guessKind(url: string): 'telegraph_image' | 'telegraph_file' {
  const path = url.split('?')[0] ?? url
  if (/\.(jpe?g|png|webp|gif|bmp)$/i.test(path)) return 'telegraph_image'
  if (/\/file\//i.test(path) && !/\.(mp4|webm|pdf|zip|rar|7z)$/i.test(path)) {
    return 'telegraph_image'
  }
  return 'telegraph_file'
}

function fileNameFromUrl(url: string): string | undefined {
  try {
    const base = decodeURIComponent(url.split('/').pop() ?? '')
    return base || undefined
  } catch {
    return undefined
  }
}

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*(["'])([^"']*)\\1`, 'i')
  return tag.match(re)?.[2] ?? null
}

function isPlaceholderSrc(src: string): boolean {
  const s = src.trim()
  if (!s) return true
  if (s.startsWith('data:')) return true
  if (s === 'about:blank') return true
  return false
}

function pickSrcset(srcset: string): string | null {
  let best: { url: string; w: number } | null = null
  for (const part of srcset.split(',')) {
    const bits = part.trim().split(/\s+/)
    const url = bits[0]
    if (!url) continue
    const w = bits[1]?.endsWith('w') ? Number.parseInt(bits[1], 10) : 0
    if (!best || w > best.w) best = { url, w: Number.isFinite(w) ? w : 0 }
  }
  return best?.url ?? null
}

function bestImgUrl(tag: string): string | null {
  const candidates = [
    attr(tag, 'src'),
    attr(tag, 'data-src'),
    attr(tag, 'data-original'),
    attr(tag, 'data-lazy-src'),
    attr(tag, 'data-url'),
  ].filter((v): v is string => Boolean(v))

  for (const c of candidates) {
    if (!isPlaceholderSrc(c)) return c
  }

  const srcset = attr(tag, 'srcset')
  if (srcset) {
    const picked = pickSrcset(srcset)
    if (picked && !isPlaceholderSrc(picked)) return picked
  }

  return null
}

function pushAsset(
  assets: TelegraphParsedAsset[],
  seen: Set<string>,
  rawUrl: string,
  pageUrl: string,
): void {
  const url = absolutize(rawUrl, pageUrl)
  if (!url || seen.has(url)) return
  if (/favicon|emoji/i.test(url)) return
  if (/\/avatar\//i.test(url)) return
  seen.add(url)
  assets.push({
    url,
    kind: guessKind(url),
    fileName: fileNameFromUrl(url),
  })
}

function extractOgImage(html: string, pageUrl: string): string | null {
  const meta =
    html.match(
      /<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    )?.[1] ??
    html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::url)?["'][^>]*>/i,
    )?.[1]
  if (!meta || isPlaceholderSrc(meta)) return null
  return absolutize(meta.trim(), pageUrl)
}

/**
 * Parse telegra.ph article HTML for title/author/media.
 * Cover images may live in og:image while the first <img> uses a lazy-load placeholder.
 */
export function parseTelegraphHtml(html: string, pageUrl: string): TelegraphParseResult {
  const title =
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() ||
    html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/i)?.[1]?.trim() ||
    'Telegraph'

  const author =
    html.match(/<meta\s+property="article:author"\s+content="([^"]*)"/i)?.[1]?.trim() ||
    html.match(/<address[^>]*>([\s\S]*?)<\/address>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() ||
    ''

  const assets: TelegraphParsedAsset[] = []
  const seen = new Set<string>()

  const cover = extractOgImage(html, pageUrl)
  if (cover) pushAsset(assets, seen, cover, pageUrl)

  const imgRe = /<img\b[^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = imgRe.exec(html))) {
    const raw = bestImgUrl(m[0])
    if (!raw) continue
    pushAsset(assets, seen, raw, pageUrl)
  }

  const videoRe = /<(?:video|source)\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi
  while ((m = videoRe.exec(html))) {
    pushAsset(assets, seen, m[1], pageUrl)
  }

  const aRe = /<a\b[^>]*\bhref=["'](https?:\/\/telegra\.ph\/file\/[^"']+)["'][^>]*>/gi
  while ((m = aRe.exec(html))) {
    pushAsset(assets, seen, m[1], pageUrl)
  }

  return { title, author, assets }
}
