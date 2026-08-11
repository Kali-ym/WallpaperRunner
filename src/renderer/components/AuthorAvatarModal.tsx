import { useCallback, useEffect, useMemo, useState, type JSX, type WheelEvent } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'
import { api, type AuthorAvatarRecord, type AuthorImageSource } from '../lib/api'
import { useConfirm } from '../lib/confirm'

type Props = {
  author: string
  initialRecord: AuthorAvatarRecord | null
  onClose: () => void
  onSaved: (record: AuthorAvatarRecord | null) => void
}

type PickTarget = {
  source: string
  galleryId: string
  dirName: string
  imagePath: string
  title: string
}

function galleryKey(gallery: Pick<AuthorImageSource, 'source' | 'galleryId'>): string {
  return `${gallery.source}:${gallery.galleryId}`
}

function pickFromGallery(gallery: AuthorImageSource, imagePath?: string): PickTarget {
  const cover = gallery.cover || gallery.images[0]
  const path = imagePath || cover || gallery.images[0] || ''
  return {
    source: gallery.source,
    galleryId: gallery.galleryId,
    dirName: gallery.dirName,
    imagePath: path,
    title: gallery.title,
  }
}

function findInitialPick(
  list: AuthorImageSource[],
  initialRecord: AuthorAvatarRecord | null,
): PickTarget | null {
  if (initialRecord) {
    const hit = list.find(
      (g) =>
        g.source === initialRecord.source &&
        g.galleryId === initialRecord.galleryId &&
        g.images.includes(initialRecord.imagePath),
    )
    if (hit) return pickFromGallery(hit, initialRecord.imagePath)
  }
  const first = list[0]
  return first ? pickFromGallery(first) : null
}

function clampZoom(value: number): number {
  return Math.min(3, Math.max(1, value))
}

export default function AuthorAvatarModal({
  author,
  initialRecord,
  onClose,
  onSaved,
}: Props): JSX.Element {
  const confirm = useConfirm()
  const [sources, setSources] = useState<AuthorImageSource[]>([])
  const [loadingSources, setLoadingSources] = useState(true)
  const [pick, setPick] = useState<PickTarget | null>(null)
  const [activeGalleryKey, setActiveGalleryKey] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [galleryQuery, setGalleryQuery] = useState('')
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoadingSources(true)
    setError('')
    void api
      .listAuthorImageSources(author)
      .then((list) => {
        if (cancelled) return
        setSources(list)
        const initial = findInitialPick(list, initialRecord)
        if (initial?.imagePath) {
          setPick(initial)
          setActiveGalleryKey(galleryKey(initial))
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoadingSources(false)
      })
    return () => {
      cancelled = true
    }
  }, [author, initialRecord])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const activeGallery = useMemo(
    () => sources.find((g) => galleryKey(g) === activeGalleryKey) ?? null,
    [sources, activeGalleryKey],
  )

  const filteredSources = useMemo(() => {
    const q = galleryQuery.trim().toLowerCase()
    if (!q) return sources
    return sources.filter((g) => g.title.toLowerCase().includes(q))
  }, [sources, galleryQuery])

  const imageUrl = useMemo(() => {
    if (!pick?.imagePath) return ''
    return api.getMediaUrl(pick.dirName, pick.imagePath)
  }, [pick])

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels)
  }, [])

  const onMediaLoaded = useCallback((media: { width: number; height: number }) => {
    const size = Math.min(media.width, media.height)
    setCroppedAreaPixels({
      x: (media.width - size) / 2,
      y: (media.height - size) / 2,
      width: size,
      height: size,
    })
  }, [])

  const onWheel = useCallback((e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    setZoom((z) => clampZoom(z + e.deltaY * -0.002))
  }, [])

  function resetCropState(): void {
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
  }

  function selectGallery(gallery: AuthorImageSource): void {
    const next = pickFromGallery(gallery)
    if (!next.imagePath) return
    setActiveGalleryKey(galleryKey(gallery))
    setPick(next)
    resetCropState()
    setError('')
    setPickerOpen(false)
    setGalleryQuery('')
  }

  function selectImage(gallery: AuthorImageSource, imagePath: string): void {
    setActiveGalleryKey(galleryKey(gallery))
    setPick(pickFromGallery(gallery, imagePath))
    resetCropState()
    setError('')
  }

  async function save(): Promise<void> {
    if (!pick?.imagePath || !croppedAreaPixels) {
      setError('请先调整裁剪区域')
      return
    }
    setBusy(true)
    setError('')
    try {
      const record = await api.setAuthorAvatar(author, {
        source: pick.source,
        galleryId: pick.galleryId,
        dirName: pick.dirName,
        imagePath: pick.imagePath,
        crop: {
          x: croppedAreaPixels.x,
          y: croppedAreaPixels.y,
          width: croppedAreaPixels.width,
          height: croppedAreaPixels.height,
        },
      })
      onSaved(record)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function resetDefault(): Promise<void> {
    const ok = await confirm({
      title: '恢复默认头像',
      message: '恢复为默认头像（第一部套图封面）？',
      confirmLabel: '恢复',
    })
    if (!ok) return
    setBusy(true)
    setError('')
    try {
      await api.clearAuthorAvatar(author)
      onSaved(null)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-root author-avatar-modal" role="dialog" aria-modal="true" aria-label="编辑作者头像">
      <button type="button" className="drawer-backdrop" onClick={onClose} />
      <div className="modal-panel author-avatar-panel">
        <header className="author-avatar-head">
          <div className="author-avatar-head-text">
            <h3 className="drawer-title">编辑头像</h3>
            <p className="author-avatar-sub muted">
              {author}
              {pick?.title ? ` · ${pick.title}` : ''}
            </p>
          </div>
          <button type="button" className="icon-btn author-avatar-close" aria-label="关闭" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M7.5 7.5l9 9M16.5 7.5l-9 9"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        {loadingSources ? (
          <div className="author-avatar-loading">
            <div className="author-avatar-loading-ring" aria-hidden />
            <p className="muted">加载套图…</p>
          </div>
        ) : sources.length === 0 ? (
          <p className="muted author-avatar-empty">该作者没有可用图片</p>
        ) : pick && imageUrl ? (
          <div className="author-avatar-body">
            <div className="author-avatar-workspace">
              {activeGallery && activeGallery.images.length > 0 ? (
                <aside className="author-avatar-image-list" aria-label="本套图片">
                  <span className="author-avatar-list-label">
                    本套
                    <span className="author-avatar-list-count">{activeGallery.images.length}</span>
                  </span>
                  <div className="author-avatar-list-scroll">
                    {activeGallery.images.map((img, index) => (
                      <button
                        key={img}
                        type="button"
                        className={
                          pick.imagePath === img
                            ? 'author-avatar-list-item is-selected'
                            : 'author-avatar-list-item'
                        }
                        onClick={() => selectImage(activeGallery, img)}
                        title={img}
                      >
                        <img
                          src={api.getMediaUrl(activeGallery.dirName, img, { thumb: true })}
                          alt=""
                          loading="lazy"
                        />
                        <span className="author-avatar-list-index">{index + 1}</span>
                      </button>
                    ))}
                  </div>
                </aside>
              ) : null}

              <div className="author-avatar-right">
                <div className="author-avatar-crop-col">
                  <div className="author-avatar-cropper" onWheel={onWheel}>
                    <Cropper
                      key={imageUrl}
                      image={imageUrl}
                      crop={crop}
                      zoom={zoom}
                      aspect={1}
                      cropShape="round"
                      showGrid={false}
                      objectFit="contain"
                      onCropChange={setCrop}
                      onZoomChange={setZoom}
                      onCropComplete={onCropComplete}
                      onMediaLoaded={onMediaLoaded}
                    />
                    <p className="author-avatar-hint">拖动调整 · 滚轮缩放</p>
                  </div>

                  <div className="author-avatar-zoom-row">
                    <button
                      type="button"
                      className="author-avatar-zoom-btn"
                      aria-label="缩小"
                      onClick={() => setZoom((z) => clampZoom(z - 0.1))}
                    >
                      −
                    </button>
                    <input
                      type="range"
                      className="author-avatar-zoom-slider"
                      min={1}
                      max={3}
                      step={0.01}
                      value={zoom}
                      aria-label="缩放"
                      onChange={(e) => setZoom(Number(e.target.value))}
                    />
                    <button
                      type="button"
                      className="author-avatar-zoom-btn"
                      aria-label="放大"
                      onClick={() => setZoom((z) => clampZoom(z + 0.1))}
                    >
                      +
                    </button>
                  </div>
                </div>

                <section className="author-avatar-gallery-dock">
              <div className="author-avatar-gallery-dock-head">
                <div className="author-avatar-gallery-dock-title">
                  <span className="author-avatar-gallery-dock-label">切换套图</span>
                  <span className="author-avatar-gallery-dock-current muted">{pick.title}</span>
                </div>
                <button
                  type="button"
                  className="btn author-avatar-gallery-dock-toggle"
                  onClick={() => setPickerOpen((v) => !v)}
                >
                  {pickerOpen ? '收起' : `全部 ${sources.length} 部`}
                </button>
              </div>

              {pickerOpen ? (
                <>
                  <input
                    className="text-input author-avatar-search"
                    placeholder="搜索套图标题…"
                    value={galleryQuery}
                    onChange={(e) => setGalleryQuery(e.target.value)}
                  />
                  <div className="author-avatar-cover-grid">
                    {filteredSources.length === 0 ? (
                      <p className="muted author-avatar-search-empty">没有匹配的套图</p>
                    ) : (
                      filteredSources.map((gallery) => {
                        const cover = gallery.cover || gallery.images[0]
                        if (!cover) return null
                        const key = galleryKey(gallery)
                        const selected = activeGalleryKey === key
                        return (
                          <button
                            key={key}
                            type="button"
                            className={
                              selected
                                ? 'author-avatar-cover-card is-selected'
                                : 'author-avatar-cover-card'
                            }
                            onClick={() => selectGallery(gallery)}
                          >
                            <div className="author-avatar-cover-art">
                              <img
                                src={api.getMediaUrl(gallery.dirName, cover, { thumb: true })}
                                alt=""
                                loading="lazy"
                              />
                            </div>
                            <span className="author-avatar-cover-title">{gallery.title}</span>
                            <span className="author-avatar-cover-meta muted">
                              {gallery.images.length} 张
                            </span>
                          </button>
                        )
                      })
                    )}
                  </div>
                </>
              ) : (
                <div className="author-avatar-cover-strip">
                  {sources.map((gallery) => {
                    const cover = gallery.cover || gallery.images[0]
                    if (!cover) return null
                    const key = galleryKey(gallery)
                    const selected = activeGalleryKey === key
                    return (
                      <button
                        key={key}
                        type="button"
                        className={
                          selected
                            ? 'author-avatar-strip-item is-selected'
                            : 'author-avatar-strip-item'
                        }
                        title={gallery.title}
                        onClick={() => selectGallery(gallery)}
                      >
                        <img
                          src={api.getMediaUrl(gallery.dirName, cover, { thumb: true })}
                          alt=""
                          loading="lazy"
                        />
                      </button>
                    )
                  })}
                </div>
              )}
            </section>
              </div>
            </div>
          </div>
        ) : null}

        {error ? <p className="author-avatar-error">{error}</p> : null}

        <footer className="author-avatar-actions">
          {initialRecord ? (
            <button type="button" className="btn" disabled={busy} onClick={() => void resetDefault()}>
              恢复默认
            </button>
          ) : (
            <span />
          )}
          <div className="author-avatar-actions-right">
            <button type="button" className="btn" disabled={busy} onClick={onClose}>
              取消
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={busy || !pick}
              onClick={() => void save()}
            >
              {busy ? '保存中…' : '保存'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
