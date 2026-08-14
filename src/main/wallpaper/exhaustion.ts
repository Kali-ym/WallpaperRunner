import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export type SeenMap = Record<string, string[]>

export const SEEN_FILENAME = 'seen.json'

export function parseSeenMap(raw: unknown): SeenMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: SeenMap = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key || !Array.isArray(value)) continue
    const ids = value.filter((x): x is string => typeof x === 'string' && x.length > 0)
    if (ids.length) out[key] = ids
  }
  return out
}

export function markSeen(seen: string[], id: string): string[] {
  if (!id || seen.includes(id)) return seen
  return [...seen, id]
}

export function applySeenPatch(
  map: SeenMap,
  pool: string,
  ids: string[],
  reset: boolean,
): SeenMap {
  const key = pool.trim()
  if (!key) return map
  const next: SeenMap = { ...map }
  if (reset) {
    const cleaned = ids.filter((id) => typeof id === 'string' && id.length > 0)
    if (cleaned.length) next[key] = cleaned
    else delete next[key]
    return next
  }
  let seen = next[key] ?? []
  for (const id of ids) seen = markSeen(seen, id)
  if (seen.length) next[key] = seen
  else delete next[key]
  return next
}

export function parseSeenPatch(
  raw: unknown,
): { pool: string; ids: string[]; reset: boolean } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  if (typeof o.pool !== 'string' || !o.pool.trim()) return null
  const ids = Array.isArray(o.ids)
    ? o.ids.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : []
  return { pool: o.pool.trim(), ids, reset: Boolean(o.reset) }
}

export function pickUnseenGallery<T extends { id: string }>(
  pool: T[],
  seen: string[],
  lastGalleryId: string | null,
  rand: () => number = Math.random,
): { gallery: T | null; seen: string[]; reset: boolean } {
  if (!pool.length) return { gallery: null, seen, reset: false }

  const alive = new Set(pool.map((g) => g.id))
  let pruned = seen.filter((id) => alive.has(id))
  let unseen = pool.filter((g) => !pruned.includes(g.id))
  let reset = false
  if (!unseen.length) {
    pruned = []
    unseen = pool.slice()
    reset = true
  }

  if (unseen.length === 1) return { gallery: unseen[0] ?? null, seen: pruned, reset }

  let gallery = unseen[Math.floor(rand() * unseen.length)] ?? unseen[0]
  let guard = 0
  while (gallery && gallery.id === lastGalleryId && guard < 6) {
    gallery = unseen[Math.floor(rand() * unseen.length)] ?? gallery
    guard += 1
  }
  return { gallery: gallery ?? null, seen: pruned, reset }
}

export async function readSeenFile(dir: string): Promise<SeenMap> {
  try {
    const raw = JSON.parse(await readFile(join(dir, SEEN_FILENAME), 'utf8')) as unknown
    return parseSeenMap(raw)
  } catch {
    return {}
  }
}

export async function writeSeenFile(dir: string, map: SeenMap): Promise<void> {
  await writeFile(join(dir, SEEN_FILENAME), JSON.stringify(parseSeenMap(map), null, 2), 'utf8')
}
