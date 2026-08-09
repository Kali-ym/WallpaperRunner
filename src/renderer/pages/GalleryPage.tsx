import { useEffect, useMemo, useState, type JSX, type MouseEvent } from 'react'
import ContextMenu from '../components/ContextMenu'
import ExtractZipModal from '../components/ExtractZipModal'
import GalleryLightbox from '../components/GalleryLightbox'
import { useToast } from '../lib/toast'
import { api, type GalleryMetadata, type LibraryIndexEntry } from '../lib/api'

interface Props {
  entry: LibraryIndexEntry
  onBack: () => void
  onDeleted?: () => void
}

const ARCHIVE_RE = /\.(zip|7z|rar)$/i

function labelOf(entry: LibraryIndexEntry, meta: GalleryMetadata | null): string {
  return meta?.displayTitle?.trim() || entry.displayTitle?.trim() || meta?.title || entry.title
}

function isArchive(name: string): boolean {
  return ARCHIVE_RE.test(name)
}

export default function GalleryPage({ entry, onBack, onDeleted }: Props): JSX.Element {
  const toast = useToast()
  const [meta, setMeta] = useState<GalleryMetadata | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; path: string } | null>(null)
  const [extractPaths, setExtractPaths] = useState<string[]>([])
  const [extractBusy, setExtractBusy] = useState(false)
  const [extractError, setExtractError] = useState('')
  const [overflowOpen, setOverflowOpen] = useState(false)

  function reload(): void {
    void api.getGallery(entry.source, entry.galleryId).then(setMeta)
  }

  useEffect(() => {
    reload()
  }, [entry])

  useEffect(() => {
    setNameDraft(labelOf(entry, meta))
  }, [entry, meta])

  const files = meta?.images ?? []
  const imageFiles = useMemo(() => files.filter((f) => !isArchive(f)), [files])
  const archiveFiles = useMemo(() => files.filter((f) => isArchive(f)), [files])

  function toggleImg(path: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function openMenu(e: MouseEvent, path: string): void {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, path })
  }

  async function deletePaths(paths: string[]): Promise<void> {
    if (paths.length === 0) return
    if (!window.confirm(`删除选中的 ${paths.length} 项？`)) return
    const next = await api.deleteImages(entry.source, entry.galleryId, paths)
    setMeta(next)
    setSelected(new Set())
  }

  function startExtract(paths: string[]): void {
    if (paths.length === 0) return
    setExtractError('')
    setExtractPaths(paths)
  }

  async function runExtract(opts: { password: string; deleteZip: boolean }): Promise<void> {
    if (!meta || extractPaths.length === 0) return
    setExtractBusy(true)
    setExtractError('')
    try {
      const absList = await api.listZipFiles(entry.source, entry.galleryId)
      const wanted = new Set(extractPaths.map((p) => p.replace(/\\/g, '/')))
      const matched = absList.filter((abs) => {
        const base = abs.replace(/\\/g, '/').split('/').pop() ?? ''
        return wanted.has(base)
      })
      if (matched.length === 0) {
        throw new Error('未找到压缩包文件，请刷新后重试')
      }
      for (const zipPath of matched) {
        await api.extractZip({
          zipPath,
          deleteZip: opts.deleteZip,
          password: opts.password || undefined,
          intoExisting: true,
          source: entry.source,
          galleryId: entry.galleryId,
          title: meta.title,
          sourceUrl: meta.sourceUrl,
          author: meta.author,
        })
      }
      toast.success('已解压到当前套图')
      setExtractPaths([])
      setSelected(new Set())
      reload()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setExtractError(msg)
      toast.error(msg)
    } finally {
      setExtractBusy(false)
    }
  }

  async function onItemAction(id: string): Promise<void> {
    if (!menu || !meta) return
    const path = menu.path
    if (id === 'cover') {
      await api.setCover(entry.source, entry.galleryId, path).then(setMeta)
    }
    if (id === 'delete') {
      await deletePaths([path])
    }
    if (id === 'extract') {
      startExtract([path])
    }
  }

  const selectedArchives = [...selected].filter(isArchive)
  const lightboxOpen = lightboxIndex !== null && imageFiles.length > 0

  return (
    <section className="page gallery-detail">
      <div className="page-toolbar gallery-detail-head">
        <button type="button" className="btn" onClick={onBack}>
          返回
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
                {entry.author || '未知作者'}
                {imageFiles.length ? ` · ${imageFiles.length} 图` : ''}
                {archiveFiles.length ? ` · ${archiveFiles.length} 压缩包` : ''}
              </p>
            </>
          )}
        </div>
        <button
          type="button"
          className="btn"
          onClick={() =>
            void api
              .setFavorite(entry.source, entry.galleryId, !(meta?.favorite ?? entry.favorite))
              .then(setMeta)
          }
        >
          {(meta?.favorite ?? entry.favorite) ? '已收藏' : '收藏'}
        </button>
        <div className="overflow-wrap">
          <button type="button" className="btn" onClick={() => setOverflowOpen((v) => !v)}>
            更多
          </button>
          {overflowOpen ? (
            <div className="overflow-menu">
              <button type="button" className="ctx-item" onClick={() => setRenaming(true)}>
                重命名
              </button>
              <button
                type="button"
                className="ctx-item"
                onClick={() => void api.openGalleryFolder(entry.source, entry.galleryId)}
              >
                打开文件夹
              </button>
              <button
                type="button"
                className="ctx-item"
                onClick={() => {
                  if (!meta?.sourceUrl) return
                  if (!window.confirm('重新下载将覆盖本地图片，继续？')) return
                  void api.redownloadGallery(meta.sourceUrl).then(() => {
                    toast.success('已加入下载队列')
                  })
                }}
              >
                重新下载
              </button>
              <button
                type="button"
                className="ctx-item danger"
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
          ) : null}
        </div>
      </div>

      <div className="page-toolbar wrap">
        <button type="button" className="btn" onClick={() => setSelectMode((v) => !v)}>
          {selectMode ? '取消多选' : '多选'}
        </button>
        {selectMode && selected.size > 0 ? (
          <>
            <button type="button" className="btn danger" onClick={() => void deletePaths([...selected])}>
              删除所选 ({selected.size})
            </button>
            {selectedArchives.length > 0 ? (
              <button
                type="button"
                className="btn primary"
                onClick={() => startExtract(selectedArchives)}
              >
                解压所选 ({selectedArchives.length})
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      {!meta ? (
        <p className="muted">加载中…</p>
      ) : files.length === 0 ? (
        <p className="empty-hint">此套图没有内容。</p>
      ) : (
        <div className="thumb-grid">
          {files.map((img) => {
            const archive = isArchive(img)
            const imageIndex = archive ? -1 : imageFiles.indexOf(img)
            return (
              <div
                key={img}
                className={`thumb-wrap ${selected.has(img) ? 'selected' : ''} ${archive ? 'is-archive' : ''}`}
                onContextMenu={(e) => openMenu(e, img)}
              >
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
                    if (selectMode) {
                      toggleImg(img)
                      return
                    }
                    if (archive) return
                    setLightboxIndex(imageIndex)
                  }}
                >
                  {archive ? (
                    <div className="archive-thumb" aria-hidden>
                      <svg viewBox="0 0 48 48" width="40" height="40" fill="none">
                        <rect
                          x="10"
                          y="6"
                          width="28"
                          height="36"
                          rx="3"
                          stroke="currentColor"
                          strokeWidth="2"
                        />
                        <path d="M18 6v36M22 10h4M22 16h4M22 22h4" stroke="currentColor" strokeWidth="2" />
                      </svg>
                      <span className="archive-ext">{img.split('.').pop()?.toUpperCase()}</span>
                    </div>
                  ) : (
                    <img src={api.getMediaUrl(entry.dirName, img)} alt={img} loading="lazy" />
                  )}
                  <span className="thumb-caption">{img}</span>
                  {!archive && meta.cover === img ? (
                    <span className="cover-badge">封面</span>
                  ) : null}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={
            isArchive(menu.path)
              ? [
                  { id: 'extract', label: '解压' },
                  { id: 'delete', label: '删除', danger: true },
                ]
              : [
                  { id: 'cover', label: '设封面' },
                  { id: 'delete', label: '删除', danger: true },
                ]
          }
          onClose={() => setMenu(null)}
          onSelect={(id) => void onItemAction(id)}
        />
      ) : null}

      {extractPaths.length > 0 ? (
        <ExtractZipModal
          title={labelOf(entry, meta)}
          zipPaths={extractPaths}
          busy={extractBusy}
          error={extractError}
          intoExisting
          onSkip={() => {
            setExtractPaths([])
            setExtractError('')
          }}
          onConfirm={(opts) => void runExtract(opts)}
        />
      ) : null}

      <GalleryLightbox
        dirName={entry.dirName}
        images={imageFiles}
        index={Math.max(0, lightboxIndex ?? 0)}
        open={lightboxOpen}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
      />
    </section>
  )
}
