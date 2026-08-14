import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  markSeen,
  parseSeenMap,
  pickUnseenGallery,
  readSeenFile,
  writeSeenFile,
  applySeenPatch,
  type SeenMap,
} from '@main/wallpaper/exhaustion'

function ids(n: number): { id: string }[] {
  return Array.from({ length: n }, (_, i) => ({ id: `g${i + 1}` }))
}

describe('parseSeenMap', () => {
  it('keeps string arrays and drops junk', () => {
    expect(parseSeenMap(null)).toEqual({})
    expect(parseSeenMap(['x'])).toEqual({})
    expect(
      parseSeenMap({
        all: ['a', 1, '', 'b'],
        favorites: 'nope',
        pl_x: ['c'],
      }),
    ).toEqual({ all: ['a', 'b'], pl_x: ['c'] })
  })
})

describe('pickUnseenGallery', () => {
  it('never repeats until the pool is exhausted', () => {
    const pool = ids(5)
    let seen: string[] = []
    const picked: string[] = []
    for (let i = 0; i < 5; i++) {
      const r = pickUnseenGallery(pool, seen, picked[picked.length - 1] ?? null, () => 0)
      expect(r.gallery).toBeTruthy()
      expect(picked).not.toContain(r.gallery!.id)
      picked.push(r.gallery!.id)
      seen = markSeen(r.seen, r.gallery!.id)
    }
    expect(picked.sort()).toEqual(['g1', 'g2', 'g3', 'g4', 'g5'])
    expect(seen).toHaveLength(5)
  })

  it('resets after exhaustion and can pick again', () => {
    const pool = ids(2)
    let seen = ['g1', 'g2']
    const r = pickUnseenGallery(pool, seen, 'g2', () => 0)
    expect(r.reset).toBe(true)
    expect(r.seen).toEqual([])
    expect(r.gallery?.id).toBe('g1')
  })

  it('ignores seen ids that left the pool', () => {
    const pool = ids(2)
    const r = pickUnseenGallery(pool, ['g1', 'gone'], null, () => 0)
    expect(r.reset).toBe(false)
    expect(r.gallery?.id).toBe('g2')
    expect(r.seen).toEqual(['g1'])
  })

  it('returns null for an empty pool', () => {
    const r = pickUnseenGallery([], ['g1'], null)
    expect(r.gallery).toBeNull()
  })

  it('avoids lastGalleryId after a reset when another choice exists', () => {
    const pool = ids(2)
    const r = pickUnseenGallery(pool, ['g1', 'g2'], 'g1', () => 0.9)
    expect(r.reset).toBe(true)
    expect(r.gallery?.id).toBe('g2')
  })
})

describe('applySeenPatch', () => {
  it('unions ids unless reset', () => {
    const base = { all: ['a'], favorites: ['f'] }
    expect(applySeenPatch(base, 'all', ['b'], false)).toEqual({
      all: ['a', 'b'],
      favorites: ['f'],
    })
    expect(applySeenPatch(base, 'all', [], true)).toEqual({ favorites: ['f'] })
    expect(applySeenPatch(base, 'all', ['z'], true)).toEqual({
      all: ['z'],
      favorites: ['f'],
    })
  })
})

describe('wallpaper player template', () => {
  it('persists exhaustion progress via seen.json patches', async () => {
    const { MAIN_JS } = await import('@main/wallpaper/templateFiles')
    expect(MAIN_JS).toContain('/seen.json')
    expect(MAIN_JS).toContain('seenByPool')
    expect(MAIN_JS).toContain('reset: !!reset')
  })
})

describe('seen file', () => {
  const dirs: string[] = []
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  })

  it('round-trips a seen map', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'seen-'))
    dirs.push(dir)
    const map: SeenMap = { all: ['xchina/a', 'xchina/b'], favorites: [] }
    await writeSeenFile(dir, map)
    const raw = await readFile(join(dir, 'seen.json'), 'utf8')
    expect(JSON.parse(raw).all).toEqual(['xchina/a', 'xchina/b'])
    await expect(readSeenFile(dir)).resolves.toEqual({ all: ['xchina/a', 'xchina/b'] })
  })

  it('returns empty map when missing or corrupt', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'seen-'))
    dirs.push(dir)
    await expect(readSeenFile(dir)).resolves.toEqual({})
    await writeFile(join(dir, 'seen.json'), '{not json', 'utf8')
    await expect(readSeenFile(dir)).resolves.toEqual({})
  })
})
