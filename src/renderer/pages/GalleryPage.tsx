import { useEffect, useState, type JSX } from 'react'
import Lightbox from '../components/Lightbox'
import { api, type GalleryMetadata, type LibraryIndexEntry } from '../lib/api'

interface Props {
  entry: LibraryIndexEntry
  onBack: () => void
}

export default function GalleryPage({ entry, onBack }: Props): JSX.Element {
  const [meta, setMeta] = useState<GalleryMetadata | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  useEffect(() => {
    void api.getGallery(entry.source, entry.galleryId).then(setMeta)
  }, [entry])

  return (
    <section className="page">
      <div className="page-toolbar">
        <button type="button" className="btn" onClick={onBack}>
          ← 返回库
        </button>
        <div>
          <h2 className="page-title">{entry.title}</h2>
          <p className="muted">
            {entry.author || '未知作者'} · {entry.tags.join(' / ')}
          </p>
        </div>
      </div>

      {!meta ? (
        <p className="muted">加载中…</p>
      ) : (
        <div className="thumb-grid">
          {meta.images.map((img, i) => (
            <button
              key={img}
              type="button"
              className="thumb-item"
              onClick={() => setLightboxIndex(i)}
            >
              <img src={api.getMediaUrl(entry.dirName, img)} alt={img} loading="lazy" />
              <span>No. {i + 1}</span>
            </button>
          ))}
        </div>
      )}

      {meta && lightboxIndex !== null && (
        <Lightbox
          dirName={entry.dirName}
          images={meta.images}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
        />
      )}
    </section>
  )
}
