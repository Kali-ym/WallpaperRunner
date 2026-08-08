import { ProxyAgent, fetch } from 'undici'

async function main(): Promise<void> {
  const proxy = 'http://127.0.0.1:7890'
  const agent = new ProxyAgent(proxy)
  const url = 'https://xchina.co/photo/id-63c799bf45baf/1.html'

  const res = await fetch(url, {
    dispatcher: agent,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
    },
  })
  console.log('status', res.status)
  const text = await res.text()
  console.log('len', text.length)
  console.log(text.slice(0, 300))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
