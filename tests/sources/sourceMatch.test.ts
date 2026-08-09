import { describe, it, expect } from 'vitest'
import { assertUrlsForSource } from '@main/sources/validate'

describe('assertUrlsForSource', () => {
  it('accepts t.me message urls for telegram', () => {
    expect(() =>
      assertUrlsForSource('telegram', ['https://t.me/fooo/1']),
    ).not.toThrow()
  })

  it('rejects xchina url when source is telegram', () => {
    expect(() =>
      assertUrlsForSource('telegram', ['https://xchina.co/photo/id-abc.html']),
    ).toThrow(/不匹配/)
  })

  it('accepts xchina urls for xchina', () => {
    expect(() =>
      assertUrlsForSource('xchina', ['https://xchina.co/photo/id-abc.html']),
    ).not.toThrow()
  })

  it('accepts telegra.ph for telegraph', () => {
    expect(() =>
      assertUrlsForSource('telegraph', ['https://telegra.ph/hello-01-01']),
    ).not.toThrow()
  })

  it('rejects empty url list', () => {
    expect(() => assertUrlsForSource('xchina', [])).toThrow(/至少/)
  })
})
