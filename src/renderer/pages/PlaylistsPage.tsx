import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { api, type LibraryIndexEntry } from '../lib/api'
import { useToast } from '../lib/toast'

type Playlist = {
  id: string
  name: string
  galleryRefs: Array<{ source: string; galleryId: string }>
  createdAt: string
  updatedAt: string
}

type PickerFilter = 'all' | 'out' | 'in'

type Props = {
  active?: boolean
}

function keyOf(r: { source: string; galleryId: string }): string {
  return `${r.source}:${r.galleryId}`
}

function nextDefaultName(playlists: Playlist[]): string {
  const base = '未命名列表'
  const used = new Set(playlists.map((p) => p.name))
  if (!used.has(base)) return base
  let i = 2
  while (used.has(`${base} ${i}`)) i += 1
  return `${base} ${i}`
}

export default function PlaylistsPage({ active = true }: Props): JSX.Element {
  const toast = useToast()
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [library, setLibrary] = useState<LibraryIndexEntry[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [memberQuery, setMemberQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerFilter, setPickerFilter] = useState<PickerFilter>('out')
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(new Set())
  const [pickerBaseline, setPickerBaseline] = useState<Set<string>>(new Set())
  const renameInputRef = useRef<HTMLInputElement>(null)
  const wasActive = useRef(active)

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    try {
      const [pls, lib] = await Promise.all([api.listPlaylists(), api.listLibrary('')])
      setPlaylists(pls)
      setLibrary(lib)
      setActiveId((cur) => {
        if (cur && pls.some((p) => p.id === cur)) return cur
        return pls[0]?.id ?? null
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload().catch((err) => toast.error(err instanceof Error ? err.message : String(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, [reload])

  useEffect(() => {
    if (active && !wasActive.current) {
      void reload({ silent: true }).catch(() => undefined)
    }
    wasActive.current = active
  }, [active, reload])

  useEffect(() => {
    if (editingId) renameInputRef.current?.focus()
  }, [editingId])

  const activePlaylist = playlists.find((p) => p.id === activeId) ?? null

  const memberEntries = useMemo(() => {
    if (!activePlaylist) return []
    const map = new Map(library.map((e) => [keyOf(e), e]))
    const entries = activePlaylist.galleryRefs
      .map((r) => map.get(keyOf(r)))
      .filter((e): e is LibraryIndexEntry => Boolean(e))
    const q = memberQuery.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) => {
      const hay = [e.displayTitle || e.title, e.author, ...e.tags].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [activePlaylist, library, memberQuery])

  const memberKeys = useMemo(() => {
    if (!activePlaylist) return new Set<string>()
    return new Set(activePlaylist.galleryRefs.map(keyOf))
  }, [activePlaylist])

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

  async function createQuick(): Promise<void> {
    setBusy(true)
    try {
      const pl = await api.createPlaylist(nextDefaultName(playlists))
      await reload({ silent: true })
      setActiveId(pl.id)
      setEditingId(pl.id)
      setEditingName(pl.name)
      toast.success('已创建，可直接改名')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function startRename(pl: Playlist): void {
    setEditingId(pl.id)
    setEditingName(pl.name)
  }

  async function commitRename(): Promise<void> {
    if (!editingId) return
    const pl = playlists.find((p) => p.id === editingId)
    const name = editingName.trim() || pl?.name || '未命名列表'
    if (pl && name === pl.name) {
      setEditingId(null)
      return
    }
    setBusy(true)
    try {
      await api.renamePlaylist(editingId, name)
      setEditingId(null)
      await reload({ silent: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(): Promise<void> {
    if (!activePlaylist) return
    setBusy(true)
    try {
      const id = activePlaylist.id
      await api.deletePlaylist(id)
      setConfirmDelete(false)
      setActiveId(null)
      await reload({ silent: true })
      toast.success('已删除播放列表')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function openPicker(): void {
    if (!activePlaylist) return
    const base = new Set(activePlaylist.galleryRefs.map(keyOf))
    setPickerBaseline(base)
    setPickerSelected(new Set(base))
    setPickerQuery('')
    setPickerFilter(base.size === 0 ? 'all' : 'out')
    setPickerOpen(true)
  }

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
    if (!activePlaylist) return
    const refs = library
      .filter((e) => pickerSelected.has(keyOf(e)))
      .map((e) => ({ source: e.source, galleryId: e.galleryId }))
    setBusy(true)
    try {
      await api.setPlaylistMembers(activePlaylist.id, refs)
      setPickerOpen(false)
      await reload({ silent: true })
      const { add, remove } = pickerDelta
      if (add || remove) {
        toast.success(`已更新：+${add} / −${remove}`)
      } else {
        toast.info('没有变更')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function removeMember(entry: LibraryIndexEntry): Promise<void> {
    if (!activePlaylist) return
    const refs = activePlaylist.galleryRefs.filter(
      (r) => !(r.source === entry.source && r.galleryId === entry.galleryId),
    )
    // Optimistic
    setPlaylists((prev) =>
      prev.map((p) => (p.id === activePlaylist.id ? { ...p, galleryRefs: refs } : p)),
    )
    try {
      await api.setPlaylistMembers(activePlaylist.id, refs)
    } catch (err) {
      await reload({ silent: true })
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <section className="page playlists-page">
      <div className="page-toolbar playlists-toolbar">
        <div>
          <h2 className="page-title">播放列表</h2>
          <p className="muted page-subtitle">选择列表后同步到 Wallpaper Engine 的播放池</p>
        </div>
        <button type="button" className="btn primary" disabled={busy} onClick={() => void createQuick()}>
          新建列表
        </button>
      </div>

      {loading && playlists.length === 0 ? (
        <p className="empty-hint">加载中…</p>
      ) : playlists.length === 0 ? (
        <div className="playlists-empty">
          <p>还没有播放列表</p>
          <p className="muted">创建后可从库右键或本页添加套图，再在 Wallpaper Engine 里选对应播放池。</p>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void createQuick()}>
            创建第一个列表
          </button>
        </div>
      ) : (
        <div className="playlists-layout">
          <aside className="playlists-sidebar">
            <div className="playlists-sidebar-head">
              <span>列表</span>
              <span className="muted mono-num">{playlists.length}</span>
            </div>
            <ul className="playlist-name-list">
              {playlists.map((p) => (
                <li key={p.id}>
                  {editingId === p.id ? (
                    <input
                      ref={renameInputRef}
                      className="playlist-rename-input"
                      value={editingName}
                      disabled={busy}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => void commitRename()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void commitRename()
                        }
                        if (e.key === 'Escape') {
                          setEditingId(null)
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className={p.id === activeId ? 'playlist-name active' : 'playlist-name'}
                      onClick={() => {
                        setActiveId(p.id)
                        setMemberQuery('')
                        setConfirmDelete(false)
                      }}
                      onDoubleClick={() => startRename(p)}
                      title="双击重命名"
                    >
                      <span className="playlist-name-text">{p.name}</span>
                      <span className="muted mono-num">{p.galleryRefs.length}</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </aside>

          <div className="playlists-main">
            {!activePlaylist ? (
              <p className="empty-hint">从左侧选择一个列表</p>
            ) : (
              <>
                <div className="playlists-main-head">
                  <div className="playlists-main-title">
                    <h3>{activePlaylist.name}</h3>
                    <span className="muted">
                      {activePlaylist.galleryRefs.length} 部套图
                      {memberQuery.trim() ? ` · 显示 ${memberEntries.length}` : ''}
                    </span>
                  </div>
                  <div className="playlists-main-actions">
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={() => startRename(activePlaylist)}
                    >
                      重命名
                    </button>
                    <button type="button" className="btn primary" disabled={busy} onClick={openPicker}>
                      管理套图
                    </button>
                    <button
                      type="button"
                      className="btn danger"
                      disabled={busy}
                      onClick={() => setConfirmDelete(true)}
                    >
                      删除
                    </button>
                  </div>
                </div>

                {confirmDelete ? (
                  <div className="playlists-confirm">
                    <span>确定删除「{activePlaylist.name}」？仅删除列表，不会删套图。</span>
                    <div className="modal-actions">
                      <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
                        取消
                      </button>
                      <button
                        type="button"
                        className="btn danger"
                        disabled={busy}
                        onClick={() => void onDelete()}
                      >
                        确认删除
                      </button>
                    </div>
                  </div>
                ) : null}

                {activePlaylist.galleryRefs.length > 0 ? (
                  <div className="page-toolbar">
                    <input
                      className="search-input"
                      placeholder="筛选列表内套图…"
                      value={memberQuery}
                      onChange={(e) => setMemberQuery(e.target.value)}
                    />
                  </div>
                ) : null}

                {activePlaylist.galleryRefs.length === 0 ? (
                  <div className="playlists-empty compact">
                    <p>这个列表还是空的</p>
                    <p className="muted">点「管理套图」勾选，或在库中右键「加入播放列表」。</p>
                    <button type="button" className="btn primary" disabled={busy} onClick={openPicker}>
                      添加套图
                    </button>
                  </div>
                ) : memberEntries.length === 0 ? (
                  <p className="empty-hint">没有匹配的套图</p>
                ) : (
                  <div className="playlist-member-grid">
                    {memberEntries.map((e) => {
                      const title = e.displayTitle?.trim() || e.title
                      const cover = e.cover
                        ? api.getMediaUrl(e.dirName, e.cover, {
                            thumb: true,
                            bust: e.downloadedAt,
                          })
                        : undefined
                      return (
                        <div key={keyOf(e)} className="playlist-member-card">
                          <div className="playlist-member-card-cover">
                            {cover ? (
                              <img src={cover} alt="" loading="lazy" decoding="async" />
                            ) : (
                              <div className="cover-empty">无封面</div>
                            )}
                            <button
                              type="button"
                              className="playlist-member-remove"
                              title="从列表移除"
                              onClick={() => void removeMember(e)}
                            >
                              移除
                            </button>
                          </div>
                          <div className="playlist-member-card-body">
                            <div className="playlist-member-card-title" title={title}>
                              {title}
                            </div>
                            <div className="muted">
                              {e.author || '未知作者'} · {e.imageCount} 张
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {pickerOpen && activePlaylist ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setPickerOpen(false)}>
          <div
            className="modal-panel playlist-picker"
            role="dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="playlist-picker-head">
              <div>
                <h3>管理「{activePlaylist.name}」</h3>
                <p className="muted">勾选要保留在列表中的套图</p>
              </div>
              <span className="muted mono-num">已选 {pickerSelected.size}</span>
            </div>

            <div className="playlist-picker-tools">
              <input
                className="search-input"
                placeholder="搜索标题 / 标签 / 模特…"
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                autoFocus
              />
              <div className="segmented" role="group" aria-label="筛选">
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
              <button type="button" className="btn tiny" onClick={() => selectVisibleInPicker(true)}>
                全选当前
              </button>
              <button type="button" className="btn tiny" onClick={() => selectVisibleInPicker(false)}>
                取消当前
              </button>
              <span className="muted">
                显示 {pickerEntries.length} · 将 +{pickerDelta.add} / −{pickerDelta.remove}
              </span>
            </div>

            <div
              style={{
                height: 520,
                maxHeight: '58vh',
                overflowY: 'scroll',
                overflowX: 'hidden',
                flexShrink: 0,
                border: '1px solid var(--line)',
                borderRadius: 10,
                padding: 12,
                background: 'color-mix(in srgb, var(--bg) 55%, var(--panel))',
              }}
            >
              {pickerEntries.length === 0 ? (
                <p className="empty-hint">没有可显示的套图</p>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12,
                    alignContent: 'flex-start',
                    alignItems: 'flex-start',
                  }}
                >
                  {pickerEntries.map((e) => {
                    const k = keyOf(e)
                    const checked = pickerSelected.has(k)
                    const title = e.displayTitle?.trim() || e.title
                    const cover = e.cover
                      ? api.getMediaUrl(e.dirName, e.cover, { thumb: true, bust: e.downloadedAt })
                      : undefined
                    return (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={checked}
                        title={title}
                        onClick={() => togglePicker(k)}
                        style={{
                          position: 'relative',
                          boxSizing: 'border-box',
                          width: 148,
                          height: 230,
                          flex: '0 0 148px',
                          padding: 0,
                          margin: 0,
                          border: checked ? '2px solid var(--accent)' : '1px solid var(--line)',
                          borderRadius: 10,
                          overflow: 'hidden',
                          background: 'var(--panel)',
                          cursor: 'pointer',
                          color: 'inherit',
                          boxShadow: 'none',
                          transform: 'none',
                          textAlign: 'left',
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            position: 'absolute',
                            top: 8,
                            left: 8,
                            zIndex: 2,
                            width: 18,
                            height: 18,
                            borderRadius: 4,
                            background: checked ? 'var(--accent)' : 'rgba(255,255,255,0.92)',
                            border: checked ? 'none' : '1px solid var(--line)',
                          }}
                        />
                        {cover ? (
                          <img
                            src={cover}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            draggable={false}
                            style={{
                              width: 148,
                              height: 186,
                              objectFit: 'cover',
                              display: 'block',
                              border: 0,
                            }}
                          />
                        ) : (
                          <span
                            style={{
                              display: 'grid',
                              placeItems: 'center',
                              width: 148,
                              height: 186,
                              color: 'var(--muted)',
                              background: 'var(--bg)',
                            }}
                          >
                            无封面
                          </span>
                        )}
                        <span style={{ display: 'block', padding: '6px 8px 8px' }}>
                          <span
                            style={{
                              display: 'block',
                              fontSize: 13,
                              fontWeight: 600,
                              lineHeight: 1.3,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {title}
                          </span>
                          <span className="muted" style={{ fontSize: 12 }}>
                            {e.imageCount} 张
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setPickerOpen(false)}>
                取消
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={busy || (pickerDelta.add === 0 && pickerDelta.remove === 0)}
                onClick={() => void savePicker()}
              >
                保存变更
                {pickerDelta.add || pickerDelta.remove
                  ? `（+${pickerDelta.add} / −${pickerDelta.remove}）`
                  : ''}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
