export interface TelegramMessageRef {
  channel: string
  messageId: number
}

const TME_RE =
  /^https?:\/\/(?:www\.)?(?:t\.me|telegram\.me)\/(?:s\/)?([A-Za-z][\w\d_]{3,})\/(\d+)(?:\?.*)?$/i

/** Private channel form t.me/c/<internalId>/<msgId> — not supported in v1 public discover path as username. */
const TME_PRIVATE_RE =
  /^https?:\/\/(?:www\.)?(?:t\.me|telegram\.me)\/c\/(\d+)\/(\d+)(?:\?.*)?$/i

export function parseTelegramMessageUrl(url: string): TelegramMessageRef | null {
  const trimmed = url.trim()
  const m = trimmed.match(TME_RE)
  if (m) {
    return { channel: m[1], messageId: Number(m[2]) }
  }
  return null
}

export function isPrivateTelegramMessageUrl(url: string): boolean {
  return TME_PRIVATE_RE.test(url.trim())
}

export function normalizeTelegramMessageUrl(url: string): string | null {
  const ref = parseTelegramMessageUrl(url)
  if (!ref) return null
  return `https://t.me/${ref.channel}/${ref.messageId}`
}

export function matchTelegramUrl(url: string): boolean {
  return parseTelegramMessageUrl(url) !== null
}
