const fs = require('fs')
const cheerio = require('cheerio')

for (const id of ['64f6fc33f1832', '651d850c6a5a7', '64fa4172ba085']) {
  const html = fs.readFileSync(`fixtures/xchina/debug-${id}.html`, 'utf8')
  const $ = cheerio.load(html)
  const items = $('.list.photo-items .item.photo-image').length
  const bgs = (html.match(/background-image:url\('([^']+)'\)/g) || []).filter((s) =>
    /\/photos\//.test(s),
  ).length
  const pager = $('.pager a.pager-num').length
  const title = $('h1.hero-title-item').first().text().trim()
  const cf = /Attention Required|Just a moment|cf-browser-verification/i.test(html)
  const sample = (html.match(/https:\/\/img[^'"\s]+\/photos\/[^'"\s]+/g) || []).slice(0, 3)
  console.log({ id, title, items, photoBgs: bgs, pager, len: html.length, cf, sample })
}
