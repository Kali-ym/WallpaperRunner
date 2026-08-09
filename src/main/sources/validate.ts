import { matchTelegramUrl } from '../adapters/telegram/urls'
import { matchTelegraphUrl } from '../adapters/telegraph/urls'
import { extractXchinaId } from '../adapters/xchina/urls'
import type { DownloadSource } from './types'

export function matchSourceUrl(source: DownloadSource, url: string): boolean {
  const trimmed = url.trim()
  if (!trimmed) return false
  switch (source) {
    case 'xchina':
      return extractXchinaId(trimmed) !== null
    case 'telegram':
      return matchTelegramUrl(trimmed)
    case 'telegraph':
      return matchTelegraphUrl(trimmed)
    default:
      return false
  }
}

export function assertUrlsForSource(source: DownloadSource, urls: string[]): string[] {
  const cleaned = urls.map((u) => u.trim()).filter(Boolean)
  if (cleaned.length === 0) {
    throw new Error('请至少提供一条链接')
  }
  const mismatched = cleaned.filter((u) => !matchSourceUrl(source, u))
  if (mismatched.length > 0) {
    throw new Error(`链接与所选来源不匹配：${mismatched.join('、')}`)
  }
  return cleaned
}
