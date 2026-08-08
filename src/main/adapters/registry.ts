import type { SourceAdapter } from './types'

const adapters: SourceAdapter[] = []

export function clearAdapters(): void {
  adapters.length = 0
}

export function registerAdapter(adapter: SourceAdapter): void {
  const idx = adapters.findIndex((a) => a.id === adapter.id)
  if (idx >= 0) adapters[idx] = adapter
  else adapters.push(adapter)
}

export function resolveAdapter(url: string): SourceAdapter | null {
  return adapters.find((a) => a.match(url)) ?? null
}

export function listAdapters(): SourceAdapter[] {
  return [...adapters]
}
