import { httpFetch } from '../http/client'

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
}

export async function fetchHtml(url: string, init?: RequestInit): Promise<string> {
  const res = await httpFetch(url, {
    ...init,
    headers: {
      ...DEFAULT_HEADERS,
      ...(init?.headers as Record<string, string> | undefined),
    },
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`)
  }
  return res.text()
}
