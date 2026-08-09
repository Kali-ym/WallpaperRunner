import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import AdmZip from 'adm-zip'
import sevenBin from '7zip-bin'
import { LibraryStore } from '@main/library/store'
import {
  detectArchiveKindFromMagic,
  extractZipToGallery,
  findZipArtifacts,
} from '@main/library/extractZipGallery'

const execFileAsync = promisify(execFile)

describe('archive detect', () => {
  it('detects zip / 7z / rar magic', () => {
    expect(detectArchiveKindFromMagic(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe('zip')
    expect(
      detectArchiveKindFromMagic(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])),
    ).toBe('7z')
    expect(detectArchiveKindFromMagic(Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]))).toBe(
      'rar',
    )
  })

  it('findZipArtifacts includes 7z and rar', () => {
    expect(findZipArtifacts(['001.jpg', 'a.7z', 'b.rar', 'c.zip'])).toEqual([
      'a.7z',
      'b.rar',
      'c.zip',
    ])
  })
})

describe('extractZipToGallery', () => {
  let root = ''

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true })
  })

  it('extracts image files from zip into a gallery', async () => {
    root = await mkdtemp(join(tmpdir(), 'zip-extract-'))
    const store = new LibraryStore(root)
    await store.ensureRoot()

    const zipPath = join(root, 'pack.zip')
    const zip = new AdmZip()
    zip.addFile('a.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
    zip.addFile('nested/b.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    zip.addFile('readme.txt', Buffer.from('skip me'))
    zip.writeZip(zipPath)

    const meta = await extractZipToGallery(zipPath, store, {
      source: 'zip',
      galleryId: 'test1',
      title: 'Zip pack',
      sourceUrl: zipPath,
    })

    expect(meta.images.length).toBe(2)
    expect(meta.images.some((n) => n.endsWith('.jpg'))).toBe(true)
    expect(meta.images.some((n) => n.endsWith('.png'))).toBe(true)
  })

  it('continues numbering when extracting into existing gallery', async () => {
    root = await mkdtemp(join(tmpdir(), 'zip-cont-'))
    const store = new LibraryStore(root)
    await store.ensureRoot()

    await store.upsertGallery({
      source: 'xchina',
      galleryId: 'cont1',
      title: 'Cont',
      sourceUrl: 'https://example.com',
      author: '',
      tags: [],
      pageCount: 1,
      cover: '040.jpg',
      images: ['040.jpg', 'pack.zip'],
      downloadedAt: new Date().toISOString(),
    })
    const dir = store.resolveGalleryDir('xchina', 'cont1', 'Cont')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, '040.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
    const zipPath = join(dir, 'pack.zip')
    const zip = new AdmZip()
    zip.addFile('n.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xd9, 1, 2]))
    zip.writeZip(zipPath)

    const meta = await extractZipToGallery(zipPath, store, {
      source: 'xchina',
      galleryId: 'cont1',
      title: 'Cont',
      sourceUrl: 'https://example.com',
      intoExisting: true,
      deleteZip: true,
    })

    expect(meta.images).toContain('040.jpg')
    expect(meta.images).toContain('041.jpg')
    expect(meta.images.some((n) => n.endsWith('.zip'))).toBe(false)
  })
})
