import { describe, it, expect } from 'vitest'
import { computeEtaSec, computePercent } from '@main/queue/progress'

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

describe('computeEtaSec', () => {
  it('returns null when speed is 0 or remaining unknown', () => {
    expect(computeEtaSec(0, 10, 0)).toBeNull()
    expect(computeEtaSec(5, 10, 0)).toBeNull()
  })

  it('estimates remaining seconds from file rate', () => {
    expect(computeEtaSec(2, 10, 2)).toBe(4)
  })
})
