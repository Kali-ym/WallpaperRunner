export function computePercent(done: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.round((done / total) * 100))
}

/** Estimate ETA from files completed per second (or similar rate units). */
export function computeEtaSec(
  done: number,
  total: number,
  unitsPerSec: number,
): number | null {
  if (unitsPerSec <= 0) return null
  const remaining = total - done
  if (remaining <= 0) return 0
  return Math.max(0, Math.round(remaining / unitsPerSec))
}

export type QueueFileStatus = 'pending' | 'downloading' | 'done' | 'failed'

export type QueueFileProgress = {
  id: string
  name: string
  status: QueueFileStatus
  error?: string
}

/** Sliding-window average of bytes (or file counts) per second. */
export class RateTracker {
  private samples: { t: number; value: number }[] = []
  private readonly windowMs: number

  constructor(windowMs = 4000) {
    this.windowMs = windowMs
  }

  /** Record cumulative value (bytes or files done). */
  sample(cumulative: number, now = Date.now()): number {
    this.samples.push({ t: now, value: cumulative })
    const cutoff = now - this.windowMs
    while (this.samples.length > 1 && this.samples[0].t < cutoff) {
      this.samples.shift()
    }
    if (this.samples.length < 2) return 0
    const first = this.samples[0]
    const last = this.samples[this.samples.length - 1]
    const dt = (last.t - first.t) / 1000
    if (dt <= 0) return 0
    return Math.max(0, (last.value - first.value) / dt)
  }
}
