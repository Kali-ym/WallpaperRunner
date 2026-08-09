import type { ResourceManifest } from './types'
import type { MediaHandle } from './handles'

interface StoredManifest {
  manifest: ResourceManifest
  handles: Map<string, MediaHandle>
  createdAt: number
}

const TTL_MS = 60 * 60 * 1000
const store = new Map<string, StoredManifest>()

function prune(): void {
  const now = Date.now()
  for (const [id, entry] of Array.from(store.entries())) {
    if (now - entry.createdAt > TTL_MS) store.delete(id)
  }
}

export function putResourceManifest(
  manifest: ResourceManifest,
  handles: Map<string, MediaHandle>,
): ResourceManifest {
  prune()
  store.set(manifest.id, { manifest, handles, createdAt: Date.now() })
  return manifest
}

export function getResourceManifest(id: string): StoredManifest | null {
  prune()
  return store.get(id) ?? null
}

export function deleteResourceManifest(id: string): void {
  store.delete(id)
}
