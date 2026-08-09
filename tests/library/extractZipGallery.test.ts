import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import AdmZip from 'adm-zip'
import { LibraryStore } from '@main/library/store'
import { extractZipToGallery } from '@main/library/extractZipGallery'

describe('extractZipToGallery', () => {
  let root = ''

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true })
  })

  it('extracts image files into a gallery', async () => {
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
})
