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

const BG_URL_RE = /background-image:\s*url\(['"]?([^'")\s]+)['"]?\)/i

/** Hosts / path prefixes that are not gallery photos. */
const EXCLUDE_RE =
  /upload\.xchina\.io|\/images\/sites\/|googletagmanager|google-analytics|doubleclick|adservice|\/ads?\/|favicon/i

/** Convert CDN thumb URL to full-size original. */
export function upgradeThumbToOriginal(url: string): string {
  return url
    .replace(/_\d+x\d+\.(webp|jpe?g|png)$/i, '.jpg')
    .replace(/\/thumb\//i, '/')
    .replace(/\/small\//i, '/')
    .replace(/_thumb(\.[a-z]+)$/i, '$1')
    .replace(/_small(\.[a-z]+)$/i, '$1')
}

export function isExcludedAssetUrl(url: string): boolean {
  return EXCLUDE_RE.test(url)
}

function extractBgUrl(style: string | undefined): string | null {
  if (!style) return null
  const m = style.match(BG_URL_RE)
  return m?.[1] ?? null
}

function pushImage(
  images: XchinaPageImage[],
  seen: Set<string>,
  thumb: string | null,
): void {
  if (!thumb) return
  if (isExcludedAssetUrl(thumb)) return
  if (!/^https?:\/\//i.test(thumb)) return

  const originalCandidate = upgradeThumbToOriginal(thumb)
  if (seen.has(originalCandidate)) return
  seen.add(originalCandidate)
  images.push({ thumbOrLink: thumb, originalCandidate })
}

export function parseXchinaPage(html: string, pageUrl: string): XchinaPageParse {
  const $ = cheerio.load(html)

  const title =
    $('h1.hero-title-item').first().text().trim() ||
    $('.info-card.photo-detail .item .text').first().text().trim() ||
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('title').text().split('-')[0]?.trim() ||
    ''

  const author =
    $('.model-container a.model-item').first().text().trim() ||
    $('.model-avatar-container .model-item > div').first().text().trim() ||
    ''

  const tags = $(
    '.info-card.photo-detail a[href*="/photos/series-"], .breadcrumb a[href*="/photos/series-"]',
  )
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((t, i, arr) => Boolean(t) && arr.indexOf(t) === i)

  let pageCount = 1
  $('.pager a.pager-num').each((_, el) => {
    const n = Number.parseInt($(el).text().trim(), 10)
    if (Number.isFinite(n) && n > pageCount) pageCount = n
  })

  const images: XchinaPageImage[] = []
  const seen = new Set<string>()

  $('.list.photo-items .item.photo-image').each((_, el) => {
    const imgDiv = $(el).find('.img[style], div.img').first()
    const fromBg = extractBgUrl(imgDiv.attr('style'))
    if (fromBg) {
      pushImage(images, seen, fromBg)
      return
    }
    const img = $(el).find('img').first()
    pushImage(images, seen, img.attr('data-src') || img.attr('src') || null)
  })

  if (images.length === 0) {
    $('.list.photo-items [style*="background-image"]').each((_, el) => {
      pushImage(images, seen, extractBgUrl($(el).attr('style')))
    })
  }

  void pageUrl
  return { title, author, tags, pageCount, images }
}
