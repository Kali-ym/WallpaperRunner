export type LibraryFilters = {
  tags?: string[]
  sources?: string[]
  favoriteOnly?: boolean
  downloadedFrom?: string
  downloadedTo?: string
  minImages?: number
  maxImages?: number
}

export type TagStat = { tag: string; count: number }

/** Parse YYYY-MM-DD or ISO into ms. `endOfDay` expands date-only to 23:59:59.999Z. */
export function boundToMs(raw: string | undefined, endOfDay: boolean): number | null {
  if (!raw?.trim()) return null
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const iso = endOfDay ? `${s}T23:59:59.999Z` : `${s}T00:00:00.000Z`
    const ms = Date.parse(iso)
    return Number.isFinite(ms) ? ms : null
  }
  const ms = Date.parse(s)
  return Number.isFinite(ms) ? ms : null
}

export function normalizeImageRange(
  minImages?: number,
  maxImages?: number,
): { min?: number; max?: number } {
  let min = typeof minImages === 'number' && Number.isFinite(minImages) ? minImages : undefined
  let max = typeof maxImages === 'number' && Number.isFinite(maxImages) ? maxImages : undefined
  if (min !== undefined && max !== undefined && min > max) {
    const t = min
    min = max
    max = t
  }
  return { min, max }
}

export type FilterableEntry = {
  source: string
  author: string
  title: string
  displayTitle?: string
  tags: string[]
  imageCount: number
  downloadedAt: string
  favorite: boolean
}

function displayOf(e: FilterableEntry): string {
  const d = e.displayTitle?.trim()
  return d || e.title
}

export function applyLibraryFilters(
  entries: FilterableEntry[],
  query: string,
  opts?: LibraryFilters,
): FilterableEntry[] {
  const q = query.trim().toLowerCase()
  let list = entries

  if (opts?.favoriteOnly) {
    list = list.filter((e) => e.favorite)
  }

  if (opts?.sources && opts.sources.length > 0) {
    const set = new Set(opts.sources)
    list = list.filter((e) => set.has(e.source))
  }

  if (opts?.tags && opts.tags.length > 0) {
    const needed = opts.tags.map((t) => t.trim().toLowerCase()).filter(Boolean)
    list = list.filter((e) => {
      const have = new Set(e.tags.map((t) => t.trim().toLowerCase()))
      return needed.every((t) => have.has(t))
    })
  }

  const fromMs = boundToMs(opts?.downloadedFrom, false)
  const toMs = boundToMs(opts?.downloadedTo, true)
  if (fromMs != null || toMs != null) {
    list = list.filter((e) => {
      const ms = Date.parse(e.downloadedAt)
      if (!Number.isFinite(ms)) return false
      if (fromMs != null && ms < fromMs) return false
      if (toMs != null && ms > toMs) return false
      return true
    })
  }

  const { min, max } = normalizeImageRange(opts?.minImages, opts?.maxImages)
  if (min !== undefined) list = list.filter((e) => e.imageCount >= min)
  if (max !== undefined) list = list.filter((e) => e.imageCount <= max)

  if (q) {
    list = list.filter((e) => {
      const hay = [displayOf(e), e.title, e.author, ...e.tags].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }

  return list
}

export function aggregateTagStats(entries: FilterableEntry[]): TagStat[] {
  const map = new Map<string, { tag: string; count: number }>()
  for (const e of entries) {
    for (const raw of e.tags) {
      const tag = raw.trim()
      if (!tag) continue
      const key = tag.toLowerCase()
      const cur = map.get(key)
      if (cur) cur.count += 1
      else map.set(key, { tag, count: 1 })
    }
  }
  return [...map.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    return a.tag.localeCompare(b.tag)
  })
}

/** Merge new tags into existing; case-insensitive dedupe, keep first spelling. */
export function mergeTags(existing: string[], incoming: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of [...existing, ...incoming]) {
    const tag = raw.trim()
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
  }
  return out
}
