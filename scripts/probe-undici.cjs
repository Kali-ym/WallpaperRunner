const { ProxyAgent, fetch } = require('undici')

async function main() {
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
      'Upgrade-Insecure-Requests': '1',
    },
  })
  console.log('status', res.status)
  const text = await res.text()
  console.log('len', text.length)
  console.log(text.slice(0, 300))

  const img = 'https://img.xchina.io/photos/63c799bf45baf/0001.jpg'
  const imgRes = await fetch(img, {
    dispatcher: agent,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      Referer: 'https://xchina.co/photo/id-63c799bf45baf/1.html',
    },
  })
  const buf = Buffer.from(await imgRes.arrayBuffer())
  console.log('img status', imgRes.status, 'bytes', buf.length, 'type', imgRes.headers.get('content-type'))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
