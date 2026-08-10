import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export type SubscriptionStatus = 'ok' | 'updated' | 'error' | 'skipped'

export type Subscription = {
  id: string
  url: string
  label: string
  enabled: boolean
  createdAt: string
  lastCheckedAt?: string
  lastStatus?: SubscriptionStatus
  lastError?: string
  lastGalleryId?: string
  lastImageCount?: number
}

export type SubscriptionsFile = {
  subscriptions: Subscription[]
}

function newId(): string {
  return `sub_${Date.now()}_${randomBytes(3).toString('hex')}`
}

export function normalizeSubscriptions(raw: unknown): Subscription[] {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<SubscriptionsFile>
  if (!Array.isArray(obj.subscriptions)) return []
  return obj.subscriptions
    .filter((s): s is Subscription => Boolean(s && typeof s === 'object' && s.url && s.id))
    .map((s) => ({
      ...s,
      url: String(s.url).trim(),
      label: String(s.label || s.url).trim(),
      enabled: s.enabled !== false,
    }))
}

export class SubscriptionStore {
  private cache: Subscription[] | null = null

  constructor(private readonly filePath: string) {}

  async load(): Promise<Subscription[]> {
    if (this.cache) return this.cache
    try {
      const raw = JSON.parse(await readFile(this.filePath, 'utf8')) as unknown
      this.cache = normalizeSubscriptions(raw)
    } catch {
      this.cache = []
    }
    return this.cache
  }

  private async save(list: Subscription[]): Promise<Subscription[]> {
    this.cache = list
    await mkdir(dirname(this.filePath), { recursive: true })
    const payload: SubscriptionsFile = { subscriptions: list }
    await writeFile(this.filePath, JSON.stringify(payload, null, 2), 'utf8')
    return list
  }

  async list(): Promise<Subscription[]> {
    return this.load()
  }

  async add(url: string, label?: string): Promise<Subscription> {
    const cleaned = url.trim()
    if (!cleaned) throw new Error('请填写订阅链接')
    const list = await this.load()
    const existing = list.find((s) => s.url === cleaned)
    if (existing) return existing
    const now = new Date().toISOString()
    const sub: Subscription = {
      id: newId(),
      url: cleaned,
      label: (label || cleaned).trim(),
      enabled: true,
      createdAt: now,
    }
    list.unshift(sub)
    await this.save(list)
    return sub
  }

  async remove(id: string): Promise<boolean> {
    const list = await this.load()
    const next = list.filter((s) => s.id !== id)
    if (next.length === list.length) return false
    await this.save(next)
    return true
  }

  async setEnabled(id: string, enabled: boolean): Promise<Subscription | null> {
    const list = await this.load()
    const hit = list.find((s) => s.id === id)
    if (!hit) return null
    hit.enabled = enabled
    await this.save(list)
    return hit
  }

  async patch(id: string, partial: Partial<Subscription>): Promise<Subscription | null> {
    const list = await this.load()
    const hit = list.find((s) => s.id === id)
    if (!hit) return null
    Object.assign(hit, partial, { id: hit.id, url: hit.url, createdAt: hit.createdAt })
    await this.save(list)
    return hit
  }
}
