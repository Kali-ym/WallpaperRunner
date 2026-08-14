import { useEffect, useMemo, useRef, useState, type JSX, type MouseEvent } from 'react'
import ContextMenu from '../components/ContextMenu'
import ExtractZipModal from '../components/ExtractZipModal'
import GalleryLightbox from '../components/GalleryLightbox'
import { useToast } from '../lib/toast'
import { useConfirm } from '../lib/confirm'
import { api, type GalleryMetadata, type LibraryIndexEntry } from '../lib/api'

interface Props {
  entry: LibraryIndexEntry
  onBack: () => void
  onDeleted?: () => void
}

type ThumbDensity = 'compact' | 'standard' | 'comfortable'

const ARCHIVE_RE = /\.(zip|7z|rar)$/i
const DENSITY_KEY = 'wallpaper-runner:thumbDensity'

const DENSITY_MODES: { id: ThumbDensity; label: string; icon: JSX.Element }[] = [
  {
    id: 'compact',
    label: '紧凑',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M2 2h4v4H2V2zm6 0h4v4H8V2zM2 8h4v4H2V8zm6 0h4v4H8V8z"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      </svg>
    ),
  },
  {
    id: 'standard',
    label: '标准',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M2 2h5v5H2V2zm7 0h5v5H9V2zM2 9h5v5H2V9zm7 0h5v5H9V9z"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      </svg>
    ),
  },
  {
    id: 'comfortable',
    label: '宽松',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M2 2h12v12H2V2z" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    ),
  },
]

function labelOf(entry: LibraryIndexEntry, meta: GalleryMetadata | null): string {
  return meta?.displayTitle?.trim() || entry.displayTitle?.trim() || meta?.title || entry.title
}

function sourceLabel(source: string): string {
  const map: Record<string, string> = {
    xchina: 'xChina',
    telegram: 'Telegram',
    telegraph: 'Telegraph',
    local: '本地',
  }
  return map[source] ?? source
}

function isArchive(name: string): boolean {
  return ARCHIVE_RE.test(name)
}

function readDensity(): ThumbDensity {
  try {
    const v = localStorage.getItem(DENSITY_KEY)
    if (v === 'compact' || v === 'standard' || v === 'comfortable') return v
  } catch {
    /* ignore */
  }
  return 'standard'
}

export default function GalleryPage({ entry, onBack, onDeleted }: Props): JSX.Element {
  const toast = useToast()
  const confirm = useConfirm()
  const [meta, setMeta] = useState<GalleryMetadata | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<{ x: number; y: number; path: string } | null>(null)
  const [extractPaths, setExtractPaths] = useState<string[]>([])
  const [extractBusy, setExtractBusy] = useState(false)
  const [extractError, setExtractError] = useState('')
  const [density, setDensity] = useState<ThumbDensity>(readDensity)
  const onDeletedRef = useRef(onDeleted)
  onDeletedRef.current = onDeleted

  function reload(): void {
    void api.getGallery(entry.source, entry.galleryId).then(setMeta)
  }

  useEffect(() => {
    reload()
    return api.onLibraryChange(() => {
      void api.getGallery(entry.source, entry.galleryId).then((next) => {
        if (next) setMeta(next)
        else onDeletedRef.current?.()
      })
    })
  }, [entry])

  const files = meta?.images ?? []
  const imageFiles = useMemo(() => files.filter((f) => !isArchive(f)), [files])
  const archiveFiles = useMemo(() => files.filter((f) => isArchive(f)), [files])
  const favorite = meta?.favorite ?? entry.favorite
  const coverPath = meta?.cover || imageFiles[0]
  const coverUrl = coverPath
    ? api.getMediaUrl(entry.dirName, coverPath, { thumb: true, bust: meta?.downloadedAt })
    : null

  const toolsMeta = selectMode
    ? selected.size > 0
      ? `已选 ${selected.size} 张`
      : '点缩略图勾选 · 右键设封面'
    : '点击预览 · 右键更多'

  function setDensityPersist(next: ThumbDensity): void {
    setDensity(next)
    try {
      localStorage.setItem(DENSITY_KEY, next)
    } catch {
      /* ignore */
    }
  }

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
    const ok = await confirm({
      title: '删除图片',
      message: `删除选中的 ${paths.length} 项？`,
      confirmLabel: '删除',
      danger: true,
    })
    if (!ok) return
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
    <section className="page gallery-detail view-gallery">
      <div className="gallery-hero">
        <div className="gallery-nav">
          <button type="button" className="btn-back" onClick={onBack} aria-label="返回套图库">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M14.5 6.5L9 12l5.5 5.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            返回库
          </button>
        </div>

        <div className="gallery-hero-card">
          <div className="gallery-cover" aria-hidden="true">
            {coverUrl ? (
              <img className="art" src={coverUrl} alt="" />
            ) : (
              <div className="art cover-empty">无封面</div>
            )}
            {coverPath ? <span className="gallery-cover-badge">封面</span> : null}
          </div>

          <div className="gallery-titles">
            <h2>{labelOf(entry, meta)}</h2>
            <div className="gallery-chip-row">
              <span className="g-chip">
                <strong>{entry.author || meta?.author || '未知作者'}</strong>
              </span>
              <span className="g-chip">
                <strong>{imageFiles.length}</strong> 图
              </span>
              {archiveFiles.length > 0 ? (
                <span className="g-chip">
                  <strong>{archiveFiles.length}</strong> 压缩包
                </span>
              ) : null}
              <span className="g-chip">{sourceLabel(entry.source)}</span>
              {favorite ? <span className="g-chip accent">已收藏</span> : null}
              <span className="g-chip ok">已入库</span>
            </div>
          </div>

          <div className="gallery-head-actions">
            <button
              type="button"
              className={`btn btn-ghost btn-icon-label btn-fav${favorite ? ' is-on' : ''}`}
              onClick={() =>
                void api.setFavorite(entry.source, entry.galleryId, !favorite).then(setMeta)
              }
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
                  fill={favorite ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>{favorite ? '已收藏' : '收藏'}</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon-label"
              onClick={() => void api.openGalleryFolder(entry.source, entry.galleryId)}
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4 8.5A1.5 1.5 0 015.5 7H9l1.2 1.6H18.5A1.5 1.5 0 0120 10.1v7.4a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 17.5v-9z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
              打开文件夹
            </button>
          </div>
        </div>
      </div>

      <div className="gallery-toolbar">
        <div className="gallery-toolbar-left">
          <button
            type="button"
            className={`btn-select${selectMode ? ' is-on' : ''}`}
            onClick={() => {
              setSelectMode((v) => {
                if (v) setSelected(new Set())
                return !v
              })
            }}
          >
            {selectMode ? '取消多选' : '多选'}
          </button>
          {selectMode ? (
            <div className="gallery-select-bar show">
              <button type="button" className="btn btn-ghost" onClick={() => setSelected(new Set(files))}>
                全选
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setSelected(new Set())}>
                清除
              </button>
              <button
                type="button"
                className="btn danger"
                disabled={selected.size === 0}
                onClick={() => void deletePaths([...selected])}
              >
                删除所选{selected.size > 0 ? ` (${selected.size})` : ''}
              </button>
              {selectedArchives.length > 0 ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => startExtract(selectedArchives)}
                >
                  解压 ({selectedArchives.length})
                </button>
              ) : null}
            </div>
          ) : null}
          <span className="meta">{toolsMeta}</span>
        </div>
        <div className="gallery-toolbar-right">
          <div className="density-group" role="group" aria-label="缩略图密度">
            {DENSITY_MODES.map(({ id, label, icon }) => (
              <button
                key={id}
                type="button"
                className={density === id ? 'active' : undefined}
                data-density={id}
                title={label}
                aria-label={label}
                onClick={() => setDensityPersist(id)}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="thumb-scroll">
        {!meta ? (
          <p className="muted gallery-loading">加载中…</p>
        ) : files.length === 0 ? (
          <div className="empty">
            <h3>此套图没有内容</h3>
          </div>
        ) : (
          <div className="thumb-grid" data-density={density}>
            {files.map((img, idx) => {
              const archive = isArchive(img)
              const imageIndex = archive ? -1 : imageFiles.indexOf(img)
              return (
                <div
                  key={img}
                  className={`thumb-wrap${selected.has(img) ? ' selected' : ''}${archive ? ' is-archive' : ''}`}
                  onContextMenu={(e) => openMenu(e, img)}
                >
                  {selectMode ? (
                    <label className="thumb-check" onClick={(e) => e.stopPropagation()}>
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
                    <div className="thumb-frame">
                      {archive ? (
                        <div className="archive-thumb art" aria-hidden>
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
                            <path
                              d="M18 6v36M22 10h4M22 16h4M22 22h4"
                              stroke="currentColor"
                              strokeWidth="2"
                            />
                          </svg>
                          <span className="archive-ext">{img.split('.').pop()?.toUpperCase()}</span>
                        </div>
                      ) : (
                        <img
                          className="art"
                          src={api.getMediaUrl(entry.dirName, img, { thumb: true })}
                          alt={img}
                          loading="lazy"
                        />
                      )}
                      {!archive && !selectMode ? (
                        <div className="hover-veil" aria-hidden>
                          <span>预览</span>
                        </div>
                      ) : null}
                      {!archive && meta.cover === img ? (
                        <span className="cover-tag">封面</span>
                      ) : null}
                      <span className="idx">{String(idx + 1).padStart(2, '0')}</span>
                    </div>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

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
