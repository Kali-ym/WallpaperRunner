import { resolveAdapter } from '../adapters/registry'
import type { LibraryStore } from '../library/store'
import type { DownloadQueue } from '../queue/downloadQueue'
import type { Subscription, SubscriptionStore } from './store'

export type CheckDeps = {
  store: LibraryStore
  queue: DownloadQueue
  fetchText: (url: string) => Promise<string>
}

export type CheckOneResult = {
  subscription: Subscription
  enqueued: boolean
}

export async function checkSubscription(
  sub: Subscription,
  subs: SubscriptionStore,
  deps: CheckDeps,
): Promise<CheckOneResult> {
  const now = new Date().toISOString()
  try {
    const adapter = resolveAdapter(sub.url)
    if (!adapter) {
      const updated = await subs.patch(sub.id, {
        lastCheckedAt: now,
        lastStatus: 'error',
        lastError: '暂不支持该来源',
      })
      return { subscription: updated ?? sub, enqueued: false }
    }
    if (adapter.needsSelection?.(sub.url)) {
      const updated = await subs.patch(sub.id, {
        lastCheckedAt: now,
        lastStatus: 'skipped',
        lastError: '该来源需在下载页解析勾选，订阅检查已跳过',
      })
      return { subscription: updated ?? sub, enqueued: false }
    }

    const parsed = await adapter.parseGallery(sub.url, { fetchText: deps.fetchText })
    const existing = await deps.store.getGallery(parsed.source, parsed.galleryId)
    const remoteCount = parsed.images.length
    const localCount = existing?.images.length ?? 0
    const needDownload = !existing || localCount < remoteCount

    if (needDownload) {
      deps.queue.enqueue([sub.url], { overwrite: Boolean(existing), source: adapter.id })
      const updated = await subs.patch(sub.id, {
        lastCheckedAt: now,
        lastStatus: 'updated',
        lastError: undefined,
        lastGalleryId: parsed.galleryId,
        lastImageCount: remoteCount,
        label: sub.label === sub.url ? parsed.title : sub.label,
      })
      return { subscription: updated ?? sub, enqueued: true }
    }

    const updated = await subs.patch(sub.id, {
      lastCheckedAt: now,
      lastStatus: 'ok',
      lastError: undefined,
      lastGalleryId: parsed.galleryId,
      lastImageCount: remoteCount,
    })
    return { subscription: updated ?? sub, enqueued: false }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const updated = await subs.patch(sub.id, {
      lastCheckedAt: now,
      lastStatus: 'error',
      lastError: message,
    })
    return { subscription: updated ?? sub, enqueued: false }
  }
}

export async function checkAllSubscriptions(
  subs: SubscriptionStore,
  deps: CheckDeps,
  opts?: { onlyEnabled?: boolean },
): Promise<{ checked: number; enqueued: number; results: CheckOneResult[] }> {
  const list = await subs.list()
  const targets = opts?.onlyEnabled === false ? list : list.filter((s) => s.enabled)
  const results: CheckOneResult[] = []
  let enqueued = 0
  for (const sub of targets) {
    const r = await checkSubscription(sub, subs, deps)
    results.push(r)
    if (r.enqueued) enqueued += 1
  }
  return { checked: results.length, enqueued, results }
}
