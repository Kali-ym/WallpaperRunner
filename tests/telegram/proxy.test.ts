import { describe, expect, it } from 'vitest'
import { parseSocksProxyUrl, resolveTelegramSocksProxy } from '../../src/main/telegram/proxy'

describe('parseSocksProxyUrl', () => {
  it('parses socks5 URLs', () => {
    expect(parseSocksProxyUrl('socks5://127.0.0.1:10808')).toEqual({
      ip: '127.0.0.1',
      port: 10808,
      socksType: 5,
      timeout: 30,
    })
  })

  it('maps http proxy to socks5 on same host/port (Clash mixed)', () => {
    expect(parseSocksProxyUrl('http://127.0.0.1:7890')).toEqual({
      ip: '127.0.0.1',
      port: 7890,
      socksType: 5,
      timeout: 30,
    })
  })

  it('parses credentials', () => {
    expect(parseSocksProxyUrl('socks5://user:pass@10.0.0.1:1080')).toMatchObject({
      ip: '10.0.0.1',
      port: 1080,
      username: 'user',
      password: 'pass',
    })
  })
})

describe('resolveTelegramSocksProxy', () => {
  it('prefers dedicated telegram socks over http proxy', () => {
    const p = resolveTelegramSocksProxy({
      httpProxy: 'http://127.0.0.1:7890',
      telegramSocksProxy: 'socks5://127.0.0.1:10808',
    })
    expect(p?.port).toBe(10808)
  })
})
