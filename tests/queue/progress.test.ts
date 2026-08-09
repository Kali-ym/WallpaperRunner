import { describe, it, expect } from 'vitest'
import {
  aggregateByteProgress,
  computeByteEtaSec,
  computePercent,
} from '@main/queue/progress'

describe('computePercent', () => {
  it('returns 0 when total is 0', () => {
    expect(computePercent(0, 0)).toBe(0)
  })

  it('rounds percent', () => {
    expect(computePercent(1, 3)).toBe(33)
    expect(computePercent(2, 3)).toBe(67)
    expect(computePercent(3, 3)).toBe(100)
  })

  it('caps at 100', () => {
    expect(computePercent(5, 3)).toBe(100)
  })
})

describe('aggregateByteProgress', () => {
  it('sums known sizes across files', () => {
    const agg = aggregateByteProgress([
      { id: 'a', name: 'a', status: 'done', bytesReceived: 100, bytesTotal: 100 },
      { id: 'b', name: 'b', status: 'downloading', bytesReceived: 50, bytesTotal: 200 },
      { id: 'c', name: 'c', status: 'pending', bytesTotal: 100 },
    ])
    expect(agg.received).toBe(150)
    expect(agg.total).toBe(400)
    expect(agg.percent).toBe(38)
  })

  it('estimates unknown pending from average known size', () => {
    const agg = aggregateByteProgress([
      { id: 'a', name: 'a', status: 'done', bytesReceived: 100, bytesTotal: 100 },
      { id: 'b', name: 'b', status: 'pending' },
      { id: 'c', name: 'c', status: 'pending' },
    ])
    expect(agg.received).toBe(100)
    expect(agg.total).toBe(300)
    expect(agg.percent).toBe(33)
  })

  it('uses in-flight bytes when content-length unknown', () => {
    const agg = aggregateByteProgress([
      { id: 'a', name: 'a', status: 'downloading', bytesReceived: 40 },
    ])
    expect(agg.received).toBe(40)
    expect(agg.total).toBe(0)
    expect(agg.percent).toBe(0)
  })

  it('estimates unknown in-flight from completed average', () => {
    const agg = aggregateByteProgress([
      { id: 'a', name: 'a', status: 'done', bytesReceived: 100, bytesTotal: 100 },
      { id: 'b', name: 'b', status: 'downloading', bytesReceived: 20 },
    ])
    expect(agg.received).toBe(120)
    expect(agg.total).toBe(200)
    expect(agg.percent).toBe(60)
  })
})

describe('computeByteEtaSec', () => {
  it('estimates from byte rate', () => {
    expect(computeByteEtaSec(2_000_000, 10_000_000, 2_000_000)).toBe(4)
  })
})
