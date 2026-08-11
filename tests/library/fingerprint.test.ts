import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { fingerprintFile, hashFileSha1 } from '@main/library/fingerprint'
import { normalizeHistory, pushBrowse } from '@main/library/history'

describe('fingerprint', () => {
  const dirs: string[] = []
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  })

  it('hashes identical files the same', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fp-'))
    dirs.push(root)
    const a = join(root, 'a.jpg')
    const b = join(root, 'b.jpg')
    const bytes = Buffer.from('same-bytes')
    await writeFile(a, bytes)
    await writeFile(b, bytes)
    expect(await hashFileSha1(a)).toBe(await hashFileSha1(b))
    expect(await fingerprintFile(a)).toHaveLength(40)
  })
})

describe('history helpers', () => {
  it('pushBrowse dedupes and caps', () => {
    let s = normalizeHistory(null)
    s = pushBrowse(s, { source: 'x', galleryId: '1', title: 'A', at: '2026-01-01T00:00:00.000Z' })
    s = pushBrowse(s, { source: 'x', galleryId: '2', title: 'B', at: '2026-01-02T00:00:00.000Z' })
    s = pushBrowse(s, { source: 'x', galleryId: '1', title: 'A2', at: '2026-01-03T00:00:00.000Z' })
    expect(s.browsed[0]?.galleryId).toBe('1')
    expect(s.browsed).toHaveLength(2)
  })
})
