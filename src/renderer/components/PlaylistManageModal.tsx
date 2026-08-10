import { useEffect, useMemo, useState, type JSX } from 'react'
import { api, type LibraryIndexEntry } from '../lib/api'

type PickerFilter = 'all' | 'out' | 'in'

type Props = {
  playlistId: string
  playlistName: string
  open: boolean
  onClose: () => void
  onSaved: (message: string) => void
  onError: (message: string) => void
}

function keyOf(r: { source: string; galleryId: string }): string {
  return `${r.source}:${r.galleryId}`
}

export default function PlaylistManageModal({
  playlistId,
  playlistName,
  open,
  onClose,
  onSaved,
  onError,
}: Props): JSX.Element | null {
  const [library, setLibrary] = useState<LibraryIndexEntry[]>([])
  const [memberKeys, setMemberKeys] = useState<Set<string>>(new Set())
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerFilter, setPickerFilter] = useState<PickerFilter>('out')
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(new Set())
  const [pickerBaseline, setPickerBaseline] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    void Promise.all([api.listLibrary(''), api.listPlaylists()]).then(([lib, pls]) => {
      const pl = pls.find((p) => p.id === playlistId)
      const base = new Set((pl?.galleryRefs ?? []).map(keyOf))
      setLibrary(lib)
      setMemberKeys(base)
      setPickerBaseline(base)
      setPickerSelected(new Set(base))
      setPickerQuery('')
      setPickerFilter(base.size === 0 ? 'all' : 'out')
    })
  }, [open, playlistId])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const pickerEntries = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase()
    return library.filter((e) => {
      const k = keyOf(e)
      if (pickerFilter === 'out' && memberKeys.has(k)) return false
      if (pickerFilter === 'in' && !memberKeys.has(k)) return false
      if (!q) return true
      const hay = [e.displayTitle || e.title, e.author, ...e.tags].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [library, memberKeys, pickerFilter, pickerQuery])

  const pickerDelta = useMemo(() => {
    let add = 0
    let remove = 0
    for (const k of pickerSelected) {
      if (!pickerBaseline.has(k)) add += 1
    }
    for (const k of pickerBaseline) {
      if (!pickerSelected.has(k)) remove += 1
    }
    return { add, remove }
  }, [pickerSelected, pickerBaseline])

  const hasChanges = pickerDelta.add > 0 || pickerDelta.remove > 0

  function togglePicker(k: string): void {
    setPickerSelected((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  function selectVisibleInPicker(on: boolean): void {
    setPickerSelected((prev) => {
      const next = new Set(prev)
      for (const e of pickerEntries) {
        const k = keyOf(e)
        if (on) next.add(k)
        else next.delete(k)
      }
      return next
    })
  }

  async function savePicker(): Promise<void> {
    const refs = library
      .filter((e) => pickerSelected.has(keyOf(e)))
      .map((e) => ({ source: e.source, galleryId: e.galleryId }))
    setBusy(true)
    try {
      await api.setPlaylistMembers(playlistId, refs)
      const { add, remove } = pickerDelta
      onSaved(add || remove ? `已更新：+${add} / −${remove}` : '没有变更')
      onClose()
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel playlist-picker"
        role="dialog"
        aria-labelledby="playlist-manage-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="playlist-picker-head">
          <div className="playlist-picker-head-main">
            <span className="playlist-picker-head-ico" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M8 6h12M8 12h12M8 18h8"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <circle cx="5" cy="6" r="1.2" fill="currentColor" />
                <circle cx="5" cy="12" r="1.2" fill="currentColor" />
                <circle cx="5" cy="18" r="1.2" fill="currentColor" />
              </svg>
            </span>
            <div className="playlist-picker-head-text">
              <h3 id="playlist-manage-title">管理套图</h3>
              <p className="playlist-picker-sub">{playlistName}</p>
            </div>
          </div>
          <div className="playlist-picker-head-side">
            <span className="playlist-picker-badge mono-num">已选 {pickerSelected.size}</span>
            <button type="button" className="playlist-picker-close" aria-label="关闭" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M7 7l10 10M17 7L7 17"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="playlist-picker-controls">
          <div className="playlist-picker-tools">
            <label className="playlist-picker-search">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
                <path
                  d="M16 16.5L20 20.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              <input
                type="search"
                placeholder="搜索标题 / 作者 / 标签…"
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                autoFocus
              />
            </label>
            <div className="segmented playlist-picker-filter" role="group" aria-label="筛选">
              {(
                [
                  ['out', '未加入'],
                  ['in', '已加入'],
                  ['all', '全部'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={pickerFilter === value ? 'segmented-btn active' : 'segmented-btn'}
                  onClick={() => setPickerFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="playlist-picker-bulk">
            <div className="playlist-picker-bulk-actions">
              <button type="button" className="btn tiny" onClick={() => selectVisibleInPicker(true)}>
                全选当前
              </button>
              <button type="button" className="btn tiny" onClick={() => selectVisibleInPicker(false)}>
                取消当前
              </button>
            </div>
            <div className="playlist-picker-bulk-meta">
              <span className="muted">显示 {pickerEntries.length}</span>
              {hasChanges ? (
                <span className="playlist-picker-delta mono-num">
                  +{pickerDelta.add} / −{pickerDelta.remove}
                </span>
              ) : (
                <span className="muted">无变更</span>
              )}
            </div>
          </div>
        </div>

        <div className="playlist-picker-scroll">
          {pickerEntries.length === 0 ? (
            <div className="playlist-picker-empty">
              <p>没有可显示的套图</p>
              <span className="muted">试试切换筛选或修改搜索词</span>
            </div>
          ) : (
            <div className="playlist-picker-grid">
              {pickerEntries.map((e) => {
                const k = keyOf(e)
                const checked = pickerSelected.has(k)
                const inList = memberKeys.has(k)
                const title = e.displayTitle?.trim() || e.title
                const cover = e.cover
                  ? api.getMediaUrl(e.dirName, e.cover, { thumb: true, bust: e.downloadedAt })
                  : undefined
                return (
                  <button
                    key={k}
                    type="button"
                    className={`playlist-picker-card${checked ? ' checked' : ''}${inList ? ' in-list' : ''}`}
                    aria-pressed={checked}
                    title={title}
                    onClick={() => togglePicker(k)}
                  >
                    <div className="playlist-picker-cover">
                      {cover ? (
                        <img src={cover} alt="" loading="lazy" decoding="async" draggable={false} />
                      ) : (
                        <span className="cover-empty">无封面</span>
                      )}
                      <span className={`playlist-picker-check${checked ? ' is-checked' : ''}`} aria-hidden>
                        <svg viewBox="0 0 24 24" fill="none">
                          {checked ? (
                            <path
                              d="M7.5 12.2l3 3 6.2-6.2"
                              stroke="currentColor"
                              strokeWidth="2.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          ) : null}
                        </svg>
                      </span>
                    </div>
                    <span className="playlist-picker-card-body">
                      <span className="playlist-picker-card-title">{title}</span>
                      <span className="playlist-picker-card-meta muted">
                        {e.author || '未知作者'} · {e.imageCount} 张
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="playlist-picker-footer modal-actions">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !hasChanges}
            onClick={() => void savePicker()}
          >
            {busy
              ? '保存中…'
              : hasChanges
                ? `保存变更（+${pickerDelta.add} / −${pickerDelta.remove}）`
                : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
