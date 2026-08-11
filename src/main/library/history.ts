import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export type HistoryBrowseRef = {
  source: string
  galleryId: string
  title?: string
  dirName?: string
  cover?: string | null
  at: string
}

export type HistoryState = {
  browsed: HistoryBrowseRef[]
  searches: string[]
}

const MAX_BROWSED = 40
const MAX_SEARCHES = 12

export function normalizeHistory(raw: unknown): HistoryState {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<HistoryState>
  const browsed = Array.isArray(obj.browsed)
    ? obj.browsed
        .filter((x): x is HistoryBrowseRef => Boolean(x && typeof x === 'object' && x.source && x.galleryId))
        .slice(0, MAX_BROWSED)
    : []
  const searches = Array.isArray(obj.searches)
    ? obj.searches.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, MAX_SEARCHES)
    : []
  return { browsed, searches }
}

export function pushBrowse(state: HistoryState, ref: Omit<HistoryBrowseRef, 'at'> & { at?: string }): HistoryState {
  const at = ref.at ?? new Date().toISOString()
  const next: HistoryBrowseRef = {
    source: ref.source,
    galleryId: ref.galleryId,
    title: ref.title,
    dirName: ref.dirName,
    cover: ref.cover,
    at,
  }
  const browsed = [
    next,
    ...state.browsed.filter((b) => !(b.source === next.source && b.galleryId === next.galleryId)),
  ].slice(0, MAX_BROWSED)
  return { ...state, browsed }
}

export class HistoryStore {
  private cache: HistoryState | null = null

  constructor(private readonly filePath: string) {}

  async load(): Promise<HistoryState> {
    if (this.cache) return this.cache
    try {
      const raw = JSON.parse(await readFile(this.filePath, 'utf8')) as unknown
      this.cache = normalizeHistory(raw)
    } catch {
      this.cache = { browsed: [], searches: [] }
    }
    return this.cache
  }

  private async save(state: HistoryState): Promise<HistoryState> {
    this.cache = state
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(state, null, 2), 'utf8')
    return state
  }

  async recordBrowse(ref: Omit<HistoryBrowseRef, 'at'> & { at?: string }): Promise<HistoryState> {
    const cur = await this.load()
    return this.save(pushBrowse(cur, ref))
  }
}
