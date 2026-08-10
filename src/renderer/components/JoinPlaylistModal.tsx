import { useMemo, useState, type JSX } from 'react'
import { api } from '../lib/api'

export type PlaylistBrief = {
  id: string
  name: string
  galleryRefs: Array<{ source: string; galleryId: string }>
}

type GalleryRef = { source: string; galleryId: string }

type Props = {
  initialPlaylists: PlaylistBrief[]
  refs: GalleryRef[]
  titles?: string[]
  onClose: () => void
  onSaved: (message: string) => void
  onError: (message: string) => void
}

function refKey(r: GalleryRef): string {
  return `${r.source}:${r.galleryId}`
}

export default function JoinPlaylistModal({
  initialPlaylists,
  refs,
  titles,
  onClose,
  onSaved,
  onError,
}: Props): JSX.Element {
  const multi = refs.length > 1
  const [playlists, setPlaylists] = useState(initialPlaylists)
  const [selected, setSelected] = useState<Set<string>>(() => {
    if (multi || refs.length === 0) return new Set()
    const k = refKey(refs[0])
    return new Set(
      initialPlaylists.filter((p) => p.galleryRefs.some((r) => refKey(r) === k)).map((p) => p.id),
    )
  })
  const [busy, setBusy] = useState(false)
  const [createName, setCreateName] = useState('')

  const subtitle = useMemo(() => {
    if (multi) return `将 ${refs.length} 部套图加入所选列表（仅添加，不会从其他列表移除）`
    return titles?.[0] || '勾选要加入的列表；取消勾选则会移出'
  }, [multi, refs.length, titles])

  async function createAndSelect(): Promise<void> {
    const name = createName.trim() || '未命名列表'
    setBusy(true)
    try {
      const pl = await api.createPlaylist(name)
      setPlaylists((prev) => [...prev, { id: pl.id, name: pl.name, galleryRefs: [] }])
      setSelected((prev) => new Set(prev).add(pl.id))
      setCreateName('')
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function save(): Promise<void> {
    if (refs.length === 0) return
    setBusy(true)
    try {
      if (multi) {
        if (selected.size === 0) {
          onError('请至少选择一个播放列表')
          setBusy(false)
          return
        }
        const ids = [...selected]
        for (const ref of refs) {
          await api.addGalleryToPlaylists(ids, ref)
        }
        onSaved(`已加入 ${selected.size} 个列表`)
      } else {
        const ref = refs[0]
        const k = refKey(ref)
        await Promise.all(
          playlists.map(async (p) => {
            const want = selected.has(p.id)
            const had = p.galleryRefs.some((r) => refKey(r) === k)
            if (had === want) return
            const nextRefs = want
              ? [...p.galleryRefs, ref]
              : p.galleryRefs.filter((r) => refKey(r) !== k)
            await api.setPlaylistMembers(p.id, nextRefs)
          }),
        )
        onSaved('已更新播放列表')
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel join-playlist-modal"
        role="dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>加入播放列表</h3>
        <p className="muted join-playlist-sub">{subtitle}</p>

        {playlists.length === 0 ? null : (
          <div className="playlist-picker-list">
            {playlists.map((p) => (
              <label key={p.id} className="playlist-picker-row">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  disabled={busy}
                  onChange={() => {
                    setSelected((prev) => {
                      const next = new Set(prev)
                      if (next.has(p.id)) next.delete(p.id)
                      else next.add(p.id)
                      return next
                    })
                  }}
                />
                <span className="playlist-picker-name">{p.name}</span>
                <span className="muted mono-num">{p.galleryRefs.length}</span>
              </label>
            ))}
          </div>
        )}

        <div className="join-create-row">
          <input
            className="text-input"
            placeholder="新建列表名称…"
            value={createName}
            disabled={busy}
            onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void createAndSelect()
            }}
          />
          <button type="button" className="btn" disabled={busy} onClick={() => void createAndSelect()}>
            新建并勾选
          </button>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void save()}>
            {multi ? `加入（${selected.size}）` : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
