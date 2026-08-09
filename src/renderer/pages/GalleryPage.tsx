import { useEffect, useState, type JSX } from 'react'
import Lightbox from '../components/Lightbox'
import { useToast } from '../lib/toast'
import { api, type GalleryMetadata, type LibraryIndexEntry } from '../lib/api'

interface Props {
  entry: LibraryIndexEntry
  onBack: () => void
  onDeleted?: () => void
}

function labelOf(entry: LibraryIndexEntry, meta: GalleryMetadata | null): string {
  return meta?.displayTitle?.trim() || entry.displayTitle?.trim() || meta?.title || entry.title
}

export default function GalleryPage({ entry, onBack, onDeleted }: Props): JSX.Element {
  const toast = useToast()
  const [meta, setMeta] = useState<GalleryMetadata | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  function reload(): void {
    void api.getGallery(entry.source, entry.galleryId).then(setMeta)
  }

  useEffect(() => {
    reload()
  }, [entry])

  useEffect(() => {
    setNameDraft(labelOf(entry, meta))
  }, [entry, meta])

  function toggleImg(path: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  async function deleteSelectedImages(): Promise<void> {
    if (selected.size === 0) return
    if (!window.confirm(`删除选中的 ${selected.size} 张图片？`)) return
    const next = await api.deleteImages(entry.source, entry.galleryId, [...selected])
    setMeta(next)
    setSelected(new Set())
  }

  return (
    <section className="page">
      <div className="page-toolbar">
        <button type="button" className="btn" onClick={onBack}>
          ← 返回库
        </button>
        <div className="grow">
          {renaming ? (
            <div className="row">
              <input
                className="text-input"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
              />
              <button
                type="button"
                className="btn primary"
                onClick={() =>
                  void api
                    .renameGallery(entry.source, entry.galleryId, nameDraft)
                    .then((m) => {
                      setMeta(m)
                      setRenaming(false)
                    })
                }
              >
                保存
              </button>
              <button type="button" className="btn" onClick={() => setRenaming(false)}>
                取消
              </button>
            </div>
          ) : (
            <>
              <h2 className="page-title">{labelOf(entry, meta)}</h2>
              <p className="muted">
                {entry.author || '未知作者'} · {(meta?.tags ?? entry.tags).join(' / ')}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="page-toolbar wrap">
        <button
          type="button"
          className="btn"
          onClick={() =>
            void api
              .setFavorite(entry.source, entry.galleryId, !(meta?.favorite ?? entry.favorite))
              .then(setMeta)
          }
        >
          {(meta?.favorite ?? entry.favorite) ? '★ 已收藏' : '☆ 收藏'}
        </button>
        <button type="button" className="btn" onClick={() => setRenaming(true)}>
          重命名
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void api.openGalleryFolder(entry.source, entry.galleryId)}
        >
          打开文件夹
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (!meta?.sourceUrl) return
            if (!window.confirm('重新下载将覆盖本地图片，继续？')) return
            void api.redownloadGallery(meta.sourceUrl).then(() => {
              toast.success('已加入下载队列，请到「下载」页查看进度')
            })
          }}
        >
          重新下载
        </button>
        <button type="button" className="btn" onClick={() => setSelectMode((v) => !v)}>
          {selectMode ? '取消选图' : '选择图片'}
        </button>
        {selectMode && selected.size > 0 ? (
          <button type="button" className="btn danger" onClick={() => void deleteSelectedImages()}>
            删除选中 ({selected.size})
          </button>
        ) : null}
        <button
          type="button"
          className="btn danger"
          onClick={() => {
            if (!window.confirm('确定删除整套图？此操作不可恢复。')) return
            void api.deleteGallery(entry.source, entry.galleryId).then(() => {
              onDeleted?.()
              onBack()
            })
          }}
        >
          删除套图
        </button>
      </div>

      {!meta ? (
        <p className="muted">加载中…</p>
      ) : meta.images.length === 0 ? (
        <p className="empty-hint">此套图没有图片。可「重新下载」或删除空壳。</p>
      ) : (
        <div className="thumb-grid">
          {meta.images.map((img, i) => (
            <div key={img} className={`thumb-wrap ${selected.has(img) ? 'selected' : ''}`}>
              {selectMode ? (
                <label className="thumb-check">
                  <input
                    type="checkbox"
                    checked={selected.has(img)}
                    onChange={() => toggleImg(img)}
                  />
                </label>
              ) : null}
              <button
                type="button"
                className="thumb-item"
                onClick={() => {
                  if (selectMode) toggleImg(img)
                  else setLightboxIndex(i)
                }}
              >
                <img src={api.getMediaUrl(entry.dirName, img)} alt={img} loading="lazy" />
                <span>No. {i + 1}</span>
                {meta.cover === img ? <span className="cover-badge">封面</span> : null}
              </button>
              {!selectMode ? (
                <div className="thumb-actions">
                  <button
                    type="button"
                    className="btn tiny"
                    onClick={() => void api.setCover(entry.source, entry.galleryId, img).then(setMeta)}
                  >
                    设封面
                  </button>
                  <button
                    type="button"
                    className="btn tiny danger"
                    onClick={() => {
                      if (!window.confirm('删除这张图片？')) return
                      void api
                        .deleteImages(entry.source, entry.galleryId, [img])
                        .then(setMeta)
                    }}
                  >
                    删除
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {meta && lightboxIndex !== null && meta.images.length > 0 && (
        <Lightbox
          dirName={entry.dirName}
          images={meta.images}
          index={Math.min(lightboxIndex, meta.images.length - 1)}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
        />
      )}
    </section>
  )
}
