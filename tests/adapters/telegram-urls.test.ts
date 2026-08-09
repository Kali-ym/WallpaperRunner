import { describe, it, expect } from 'vitest'
import {
  parseTelegramMessageUrl,
  normalizeTelegramMessageUrl,
  matchTelegramUrl,
  isPrivateTelegramMessageUrl,
} from '@main/adapters/telegram/urls'

describe('telegram urls', () => {
  it('parses public channel message urls', () => {
    expect(parseTelegramMessageUrl('https://t.me/coshougong/11379')).toEqual({
      channel: 'coshougong',
      messageId: 11379,
    })
    expect(parseTelegramMessageUrl('https://t.me/s/coshougong/11379')).toEqual({
      channel: 'coshougong',
      messageId: 11379,
    })
    expect(parseTelegramMessageUrl('https://telegram.me/durov/1?single')).toEqual({
      channel: 'durov',
      messageId: 1,
    })
  })

  it('normalizes to canonical t.me url', () => {
    expect(normalizeTelegramMessageUrl('https://t.me/s/coshougong/11379?single')).toBe(
      'https://t.me/coshougong/11379',
    )
  })

  it('rejects non-message urls', () => {
    expect(matchTelegramUrl('https://t.me/coshougong')).toBe(false)
    expect(parseTelegramMessageUrl('https://example.com/x/1')).toBeNull()
  })

  it('detects private c/ urls without treating as public', () => {
    expect(isPrivateTelegramMessageUrl('https://t.me/c/1234567890/10')).toBe(true)
    expect(parseTelegramMessageUrl('https://t.me/c/1234567890/10')).toBeNull()
  })
})
