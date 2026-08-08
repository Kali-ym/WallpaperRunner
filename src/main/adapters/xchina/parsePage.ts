import * as cheerio from 'cheerio'

export interface XchinaPageImage {
  thumbOrLink: string
  originalCandidate: string
}

export interface XchinaPageParse {
  title: string
  author: string
  tags: string[]
  pageCount: number
  images: XchinaPageImage[]
}

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif)(\?|$)/i
const AD_RE = /ad|promo|banner|sponsor|广告|妻社/i

function absolutize(baseUrl: string, maybeRelative: string): string {
  try {
    return new URL(maybeRelative, baseUrl).toString()
  } catch {
    return maybeRelative
  }
}

function isImageUrl(url: string): boolean {
  return IMAGE_EXT_RE.test(url)
}

function upgradeThumbToOriginal(url: string): string {
  return url
    .replace(/\/thumb\//i, '/')
    .replace(/\/small\//i, '/')
    .replace(/\/s\//i, '/')
    .replace(/_thumb(\.[a-z]+)$/i, '$1')
    .replace(/_small(\.[a-z]+)$/i, '$1')
}

function isAdNode($: cheerio.CheerioAPI, el: cheerio.Element): boolean {
  const node = $(el)
  const marker = [
    node.attr('class') ?? '',
    node.attr('id') ?? '',
    node.attr('data-ad') ?? '',
    node.find('img').attr('alt') ?? '',
    node.find('img').attr('src') ?? '',
    node.find('a').attr('href') ?? '',
  ].join(' ')
  return AD_RE.test(marker) || node.closest('.ad-item,[data-ad]').length > 0
}

function extractOriginal($: cheerio.CheerioAPI, el: cheerio.Element, pageUrl: string): XchinaPageImage | null {
  if (isAdNode($, el)) return null

  const anchor = $(el).is('a') ? $(el) : $(el).find('a').first()
  const img = $(el).is('img') ? $(el) : $(el).find('img').first()
  if (!img.length && !anchor.length) return null

  const href = anchor.attr('href')?.trim() ?? ''
  const dataSrc = img.attr('data-src')?.trim() ?? ''
  const src = img.attr('src')?.trim() ?? ''
  const thumbOrLink = absolutize(pageUrl, dataSrc || src || href)
  if (!thumbOrLink || AD_RE.test(thumbOrLink)) return null

  let originalCandidate = ''
  if (href && isImageUrl(href)) {
    originalCandidate = absolutize(pageUrl, href)
  } else if (dataSrc || src) {
    originalCandidate = upgradeThumbToOriginal(absolutize(pageUrl, dataSrc || src))
  } else if (href) {
    originalCandidate = absolutize(pageUrl, href)
  }

  if (!originalCandidate || AD_RE.test(originalCandidate)) return null
  return { thumbOrLink, originalCandidate }
}

export function parseXchinaPage(html: string, pageUrl: string): XchinaPageParse {
  const $ = cheerio.load(html)

  const title =
    $('h1.photo-title, h1').first().text().trim() ||
    $('meta[property="og:title"], meta[name="og:title"]').attr('content')?.trim() ||
    $('title').text().split('-')[0]?.trim() ||
    ''

  const author =
    $('.photo-info .author, .author a, .author').first().text().trim() || ''

  const tags = $('.tags a.tag, .tag, .photo-info a[href*="/tag/"]')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean)

  let pageCount = 1
  $('.pager a, .pagination a, .pages a').each((_, el) => {
    const text = $(el).text().trim()
    const n = Number.parseInt(text, 10)
    if (Number.isFinite(n) && n > pageCount) pageCount = n

    const href = $(el).attr('href') ?? ''
    const m = href.match(/\/(\d+)\.html/i)
    if (m) {
      const pn = Number.parseInt(m[1], 10)
      if (Number.isFinite(pn) && pn > pageCount) pageCount = pn
    }
  })

  const images: XchinaPageImage[] = []
  const seen = new Set<string>()

  const candidates = $('.photos .photo-item, .photos .item:not(.ad-item), .photo-list .item, a[href*=".jpg"], a[href*=".jpeg"], a[href*=".png"], a[href*=".webp"]')
  candidates.each((_, el) => {
    const parsed = extractOriginal($, el, pageUrl)
    if (!parsed) return
    if (seen.has(parsed.originalCandidate)) return
    seen.add(parsed.originalCandidate)
    images.push(parsed)
  })

  return { title, author, tags, pageCount, images }
}
