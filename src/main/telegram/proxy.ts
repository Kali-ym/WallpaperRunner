export type TelegramSocksProxy = {
  ip: string
  port: number
  socksType: 4 | 5
  username?: string
  password?: string
  timeout?: number
}

/** Parse socks5:// or http:// (Clash mixed-port) into GramJS SOCKS settings. */
export function parseSocksProxyUrl(raw: string): TelegramSocksProxy | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  try {
    const u = new URL(trimmed)
    const port = Number(u.port || (u.protocol === 'https:' ? 443 : 80))
    if (!u.hostname || !Number.isFinite(port)) return undefined

    const proto = u.protocol.replace(':', '').toLowerCase()
    let socksType: 4 | 5 = 5
    if (proto === 'socks4') socksType = 4
    else if (proto === 'socks5' || proto === 'socks5h' || proto === 'http' || proto === 'https') {
      socksType = 5
    } else if (proto !== 'socks') {
      return undefined
    }

    const username = u.username ? decodeURIComponent(u.username) : undefined
    const password = u.password ? decodeURIComponent(u.password) : undefined

    return {
      ip: u.hostname,
      port,
      socksType,
      username: username || undefined,
      password: password || undefined,
      timeout: 30,
    }
  } catch {
    return undefined
  }
}

export function resolveTelegramSocksProxy(opts: {
  httpProxy?: string | null
  telegramSocksProxy?: string | null
}): TelegramSocksProxy | undefined {
  const dedicated = (opts.telegramSocksProxy ?? '').trim()
  if (dedicated) return parseSocksProxyUrl(dedicated)

  const envSocks =
    process.env.SOCKS_PROXY ||
    process.env.socks_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy ||
    ''
  if (envSocks.trim()) {
    const fromEnv = parseSocksProxyUrl(envSocks.trim())
    if (fromEnv) return fromEnv
  }

  const http = (opts.httpProxy ?? '').trim()
  if (http) return parseSocksProxyUrl(http)

  return undefined
}
