export function computePercent(done: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.round((done / total) * 100))
}

export function computeByteEtaSec(
  bytesReceived: number,
  bytesTotal: number,
  bytesPerSec: number,
): number | null {
  if (bytesPerSec <= 0 || bytesTotal <= 0) return null
  const remaining = bytesTotal - bytesReceived
  if (remaining <= 0) return 0
  return Math.max(0, Math.round(remaining / bytesPerSec))
}

export type QueueFileStatus = 'pending' | 'downloading' | 'done' | 'failed'

export type QueueFileProgress = {
  id: string
  name: string
  status: QueueFileStatus
  error?: string
  bytesReceived?: number
  bytesTotal?: number
}

export type AggregatedByteProgress = {
  received: number
  total: number
  percent: number
}

/**
 * Aggregate task progress purely by bytes across all files.
 * Unknown pending/in-flight sizes are estimated from the average of known file sizes.
 * When no sizes are known yet, total stays 0 (UI shows received bytes without %).
 */
export function aggregateByteProgress(files: QueueFileProgress[]): AggregatedByteProgress {
  let received = 0
  let knownSum = 0
  let knownCount = 0
  let unknownPending = 0
  let unknownInFlightCount = 0
  let unknownInFlightBytes = 0

  for (const f of files) {
    const declared =
      f.bytesTotal != null && f.bytesTotal > 0
        ? f.bytesTotal
        : f.bytesReceived != null && f.bytesReceived > 0
          ? f.bytesReceived
          : 0

    if (f.status === 'done') {
      const size = declared
      received += size
      if (size > 0) {
        knownSum += size
        knownCount += 1
      }
      continue
    }

    if (f.status === 'failed') {
      continue
    }

    if (f.status === 'downloading') {
      const got = f.bytesReceived ?? 0
      received += got
      if (f.bytesTotal != null && f.bytesTotal > 0) {
        knownSum += f.bytesTotal
        knownCount += 1
      } else {
        unknownInFlightCount += 1
        unknownInFlightBytes += got
      }
      continue
    }

    // pending
    if (f.bytesTotal != null && f.bytesTotal > 0) {
      knownSum += f.bytesTotal
      knownCount += 1
    } else {
      unknownPending += 1
    }
  }

  let total = knownSum
  const avg = knownCount > 0 ? knownSum / knownCount : 0

  if (unknownPending > 0 && avg > 0) {
    total += Math.round(avg * unknownPending)
  }
  if (unknownInFlightCount > 0) {
    if (avg > 0) {
      const perFileGot = unknownInFlightBytes / unknownInFlightCount
      total += Math.round(unknownInFlightCount * Math.max(avg, perFileGot))
    } else {
      // No size basis yet — keep total unknown.
      return { received, total: 0, percent: 0 }
    }
  }

  if (total < received) total = received
  const percent = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0
  return { received, total, percent }
}

/** Sliding-window average of cumulative bytes per second. */
export class RateTracker {
  private samples: { t: number; value: number }[] = []
  private readonly windowMs: number

  constructor(windowMs = 4000) {
    this.windowMs = windowMs
  }

  /** Record cumulative value (bytes). */
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
