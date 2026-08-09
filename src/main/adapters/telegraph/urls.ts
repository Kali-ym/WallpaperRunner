const TELEGRAPH_RE =
  /^https?:\/\/(?:www\.)?telegra\.ph\/([A-Za-z0-9_\-%]+)(?:\?.*)?$/i

export function extractTelegraphSlug(url: string): string | null {
  const m = url.trim().match(TELEGRAPH_RE)
  if (!m?.[1]) return null
  try {
    return decodeURIComponent(m[1])
  } catch {
    return m[1]
  }
}

export function normalizeTelegraphUrl(url: string): string | null {
  const slug = extractTelegraphSlug(url)
  if (!slug) return null
  return `https://telegra.ph/${encodeURI(slug)}`
}

export function matchTelegraphUrl(url: string): boolean {
  return extractTelegraphSlug(url) !== null
}

export function extractTelegraphUrlsFromText(text: string): string[] {
  const re = /https?:\/\/(?:www\.)?telegra\.ph\/[A-Za-z0-9_\-%]+/gi
  const found = text.match(re) ?? []
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of found) {
    const n = normalizeTelegraphUrl(raw)
    if (n && !seen.has(n)) {
      seen.add(n)
      out.push(n)
    }
  }
  return out
}
