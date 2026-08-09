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

/**
 * Parse telegra.ph article HTML for title/author/media.
 * Uses regex+cheerio-free string parsing for title; cheerio when available via dynamic import callers.
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

  const imgRe = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = imgRe.exec(html))) {
    const url = absolutize(m[1], pageUrl)
    if (!url || seen.has(url)) continue
    // skip tiny UI icons
    if (/favicon|emoji|avatar/i.test(url)) continue
    seen.add(url)
    assets.push({
      url,
      kind: guessKind(url),
      fileName: fileNameFromUrl(url),
    })
  }

  const videoRe = /<(?:video|source)\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi
  while ((m = videoRe.exec(html))) {
    const url = absolutize(m[1], pageUrl)
    if (!url || seen.has(url)) continue
    seen.add(url)
    assets.push({
      url,
      kind: 'telegraph_file',
      fileName: fileNameFromUrl(url),
    })
  }

  const aRe = /<a\b[^>]*\bhref=["'](https?:\/\/telegra\.ph\/file\/[^"']+)["'][^>]*>/gi
  while ((m = aRe.exec(html))) {
    const url = m[1]
    if (!url || seen.has(url)) continue
    seen.add(url)
    assets.push({
      url,
      kind: guessKind(url),
      fileName: fileNameFromUrl(url),
    })
  }

  return { title, author, assets }
}
