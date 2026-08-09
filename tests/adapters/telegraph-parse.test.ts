import { describe, it, expect } from 'vitest'
import { parseTelegraphHtml } from '@main/adapters/telegraph/parse'

const SAMPLE = `
<html><head>
<meta property="og:title" content="Sample Title">
<meta property="article:author" content="Alice">
</head><body>
<article>
<h1>Sample Title</h1>
<address>Alice</address>
<img src="/file/abc123.jpg">
<img src="https://telegra.ph/file/def456.png">
<a href="https://telegra.ph/file/doc.zip">zip</a>
<video src="https://telegra.ph/file/clip.mp4"></video>
</article>
</body></html>
`

describe('parseTelegraphHtml', () => {
  it('extracts title author and assets', () => {
    const parsed = parseTelegraphHtml(SAMPLE, 'https://telegra.ph/Sample-Title-01-01')
    expect(parsed.title).toBe('Sample Title')
    expect(parsed.author).toBe('Alice')
    expect(parsed.assets.map((a) => a.url)).toEqual([
      'https://telegra.ph/file/abc123.jpg',
      'https://telegra.ph/file/def456.png',
      'https://telegra.ph/file/clip.mp4',
      'https://telegra.ph/file/doc.zip',
    ])
    expect(parsed.assets[0].kind).toBe('telegraph_image')
    expect(parsed.assets[2].kind).toBe('telegraph_file')
    expect(parsed.assets[3].kind).toBe('telegraph_file')
  })
})
