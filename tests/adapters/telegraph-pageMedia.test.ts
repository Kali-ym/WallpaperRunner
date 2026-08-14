import { describe, expect, it } from 'vitest'
import bigInt from 'big-integer'
import { Api } from 'telegram'
import { collectTelegraphPageMedia } from '@main/adapters/telegraph/pageMedia'

function makePhoto(id: number): Api.Photo {
  return new Api.Photo({
    id: bigInt(id),
    accessHash: bigInt(1),
    fileReference: Buffer.alloc(0),
    date: 1,
    sizes: [],
    dcId: 2,
  })
}

describe('collectTelegraphPageMedia', () => {
  it('prepends link-preview photo when blocks omit the cover', () => {
    const cover = makePhoto(10)
    const body = makePhoto(20)
    const page = new Api.Page({
      blocks: [
        new Api.PageBlockPhoto({
          photoId: body.id,
          caption: new Api.PageCaption({ text: new Api.TextPlain({ text: '' }), credit: new Api.TextPlain({ text: '' }) }),
        }),
      ],
      part: 0,
      photos: [body],
      documents: [],
      views: 0,
    })

    const media = collectTelegraphPageMedia(page, cover)
    expect(media).toHaveLength(2)
    expect(media[0].kind).toBe('photo')
    expect(media[0].media).toBe(cover)
    expect(media[1].media).toBe(body)
  })

  it('walks PageBlockCover before body photos', () => {
    const cover = makePhoto(10)
    const body = makePhoto(20)
    const page = new Api.Page({
      blocks: [
        new Api.PageBlockCover({
          cover: new Api.PageBlockPhoto({
            photoId: cover.id,
            caption: new Api.PageCaption({ text: new Api.TextPlain({ text: '' }), credit: new Api.TextPlain({ text: '' }) }),
          }),
        }),
        new Api.PageBlockPhoto({
          photoId: body.id,
          caption: new Api.PageCaption({ text: new Api.TextPlain({ text: '' }), credit: new Api.TextPlain({ text: '' }) }),
        }),
      ],
      part: 0,
      photos: [cover, body],
      documents: [],
      views: 0,
    })

    const media = collectTelegraphPageMedia(page, null)
    expect(media.map((m) => (m.kind === 'photo' ? String(m.media.id) : ''))).toEqual([
      String(cover.id),
      String(body.id),
    ])
  })

  it('resolves cover photo id from link preview when it is not in page.photos', () => {
    const cover = makePhoto(10)
    const body = makePhoto(20)
    const page = new Api.Page({
      blocks: [
        new Api.PageBlockCover({
          cover: new Api.PageBlockPhoto({
            photoId: cover.id,
            caption: new Api.PageCaption({ text: new Api.TextPlain({ text: '' }), credit: new Api.TextPlain({ text: '' }) }),
          }),
        }),
        new Api.PageBlockPhoto({
          photoId: body.id,
          caption: new Api.PageCaption({ text: new Api.TextPlain({ text: '' }), credit: new Api.TextPlain({ text: '' }) }),
        }),
      ],
      part: 0,
      photos: [body],
      documents: [],
      views: 0,
    })

    const media = collectTelegraphPageMedia(page, cover)
    expect(media).toHaveLength(2)
    expect(media.map((m) => String(m.media.id))).toEqual([String(cover.id), String(body.id)])
  })

  it('prepends pool photos that blocks never reference (common cover case)', () => {
    const cover = makePhoto(10)
    const bodyPhotos = Array.from({ length: 63 }, (_, i) => makePhoto(100 + i))
    const page = new Api.Page({
      blocks: bodyPhotos.map(
        (photo) =>
          new Api.PageBlockPhoto({
            photoId: photo.id,
            caption: new Api.PageCaption({ text: new Api.TextPlain({ text: '' }), credit: new Api.TextPlain({ text: '' }) }),
          }),
      ),
      part: 0,
      photos: [cover, ...bodyPhotos],
      documents: [],
      views: 0,
    })

    const media = collectTelegraphPageMedia(page, null)
    expect(media).toHaveLength(64)
    expect(String(media[0].kind === 'photo' ? media[0].media.id : '')).toBe(String(cover.id))
  })

  it('walks photos nested in PageBlockList', () => {
    const a = makePhoto(1)
    const b = makePhoto(2)
    const page = new Api.Page({
      blocks: [
        new Api.PageBlockList({
          items: [
            new Api.PageBlockPhoto({
              photoId: a.id,
              caption: new Api.PageCaption({ text: new Api.TextPlain({ text: '' }), credit: new Api.TextPlain({ text: '' }) }),
            }),
            new Api.PageBlockPhoto({
              photoId: b.id,
              caption: new Api.PageCaption({ text: new Api.TextPlain({ text: '' }), credit: new Api.TextPlain({ text: '' }) }),
            }),
          ],
        }),
      ],
      part: 0,
      photos: [a, b],
      documents: [],
      views: 0,
    })

    const media = collectTelegraphPageMedia(page, null)
    expect(media).toHaveLength(2)
  })
})
