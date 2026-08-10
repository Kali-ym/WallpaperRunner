import type { LibraryIndexEntry } from './api'

export function defaultAuthorCoverEntry(
  lib: LibraryIndexEntry[],
  author: string,
): LibraryIndexEntry | undefined {
  const needle = author.trim().toLowerCase()
  if (!needle) return undefined
  const entries = lib
    .filter((e) => e.author?.trim().toLowerCase() === needle && e.cover)
    .sort((a, b) => a.downloadedAt.localeCompare(b.downloadedAt))
  return entries[0]
}

export function buildAuthorCoverMap(lib: LibraryIndexEntry[]): Map<string, LibraryIndexEntry> {
  const buckets = new Map<string, LibraryIndexEntry[]>()
  for (const e of lib) {
    const author = e.author?.trim()
    if (!author || !e.cover) continue
    const list = buckets.get(author) ?? []
    list.push(e)
    buckets.set(author, list)
  }
  const map = new Map<string, LibraryIndexEntry>()
  for (const [author, entries] of buckets) {
    const sorted = [...entries].sort((a, b) => a.downloadedAt.localeCompare(b.downloadedAt))
    map.set(author, sorted[0]!)
  }
  return map
}
