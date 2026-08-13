import { useMemo, useState, type JSX } from 'react'
import type { ResourceManifest } from '../lib/api'
import type { ResourceItem } from '../../main/resources/types'

type PickerItem = ResourceManifest['groups']['post'][number]

function listItems(manifest: ResourceManifest): PickerItem[] {
  return [
    ...manifest.groups.post,
    ...manifest.groups.comments.flatMap((c) => c.items),
    ...manifest.groups.telegraph.flatMap((t) => t.items),
  ]
}

function kindLabel(kind: string): string {
  const map: Record<string, string> = {
    photo: '图片',
    video: '视频',
    animation: '动图',
    document: '文件',
    telegraph_image: '图片',
    telegraph_file: '文件',
  }
  return map[kind] ?? kind
}

function shortItemName(item: PickerItem, index: number): string {
  if (item.fileName) {
    const base = item.fileName.replace(/\.[^.]+$/, '')
    return base.length > 26 ? `${base.slice(0, 23)}…` : base
  }
  const fromLabel = item.label.match(/(?:图片|视频|文件)\s*(\d+)/i)
  if (fromLabel) return `${kindLabel(item.kind)} ${fromLabel[1]}`
  return `${kindLabel(item.kind)} ${index + 1}`
}

function ItemTile({
  item,
  index,
  checked,
  onToggle,
  onPreview,
}: {
  item: PickerItem
  index: number
  checked: boolean
  onToggle: (id: string) => void
  onPreview: (id: string) => void
}): JSX.Element {
  return (
    <label
      className={`resource-tile${checked ? ' selected' : ''}`}
      onMouseEnter={() => onPreview(item.id)}
      onFocus={() => onPreview(item.id)}
    >
      <input
        type="checkbox"
        className="resource-tile-check"
        checked={checked}
        onChange={() => onToggle(item.id)}
      />
      <span className="resource-tile-media" aria-hidden>
        {item.previewUrl ? (
          <img src={item.previewUrl} alt="" loading="lazy" />
        ) : (
          <span className="resource-tile-ph">{kindLabel(item.kind).slice(0, 1)}</span>
        )}
        <span className="resource-tile-kind">{kindLabel(item.kind)}</span>
        {checked ? <span className="resource-tile-mark">✓</span> : null}
      </span>
      <span className="resource-tile-name" title={item.fileName ?? item.label}>
        {shortItemName(item, index)}
      </span>
    </label>
  )
}

function ItemGrid({
  items,
  selected,
  onToggle,
  onPreview,
}: {
  items: PickerItem[]
  selected: Set<string>
  onToggle: (id: string) => void
  onPreview: (id: string) => void
}): JSX.Element {
  if (items.length === 0) return <p className="resource-empty muted">暂无资源</p>
  return (
    <div className="resource-grid">
      {items.map((item, index) => (
        <ItemTile
          key={item.id}
          item={item}
          index={index}
          checked={selected.has(item.id)}
          onToggle={onToggle}
          onPreview={onPreview}
        />
      ))}
    </div>
  )
}

function renderGroups(
  groups: ResourceManifest['groups'],
  selected: Set<string>,
  onToggle: (id: string) => void,
  onPreview: (id: string) => void,
): JSX.Element {
  return (
    <>
      {groups.post.length > 0 ? (
        <section className="resource-section">
          <header className="resource-section-head">
            <h4>主帖</h4>
            <span className="resource-section-count">{groups.post.length}</span>
          </header>
          <ItemGrid items={groups.post} selected={selected} onToggle={onToggle} onPreview={onPreview} />
        </section>
      ) : null}

      {groups.comments.map((c) => (
        <section className="resource-section" key={c.commentId}>
          <header className="resource-section-head">
            <h4>
              评论 #{c.index}
              {c.textPreview ? <span className="muted"> — {c.textPreview}</span> : null}
            </h4>
            <span className="resource-section-count">{c.items.length}</span>
          </header>
          {c.items.length === 0 ? (
            <p className="resource-empty muted">无媒体（可能仅含 Telegraph 链接，见下方）</p>
          ) : (
            <ItemGrid items={c.items} selected={selected} onToggle={onToggle} onPreview={onPreview} />
          )}
        </section>
      ))}

      {groups.telegraph.map((g) => (
        <section className="resource-section" key={g.url}>
          <header className="resource-section-head">
            <h4>
              Telegraph
              {g.title ? <span className="muted"> · {g.title}</span> : null}
              {g.fromOrigin === 'comment' ? (
                <span className="resource-origin-tag">评论</span>
              ) : g.fromOrigin === 'post' ? (
                <span className="resource-origin-tag">主帖</span>
              ) : null}
            </h4>
            <span className="resource-section-count">{g.items.length}</span>
          </header>
          <ItemGrid items={g.items} selected={selected} onToggle={onToggle} onPreview={onPreview} />
        </section>
      ))}
    </>
  )
}

function PreviewPane({ item }: { item: ResourceItem | null }): JSX.Element {
  if (!item) {
    return (
      <div className="resource-preview resource-preview-empty">
        <p className="muted">悬停或选择资源以预览</p>
      </div>
    )
  }

  const visual = item.previewUrl && item.kind !== 'document' && item.kind !== 'telegraph_file'

  return (
    <div className="resource-preview">
      <div className="resource-preview-media">
        {visual ? (
          <img src={item.previewUrl} alt="" />
        ) : (
          <div className="resource-preview-ph">
            <span>{kindLabel(item.kind)}</span>
          </div>
        )}
      </div>
      <dl className="resource-preview-meta">
        <div>
          <dt>类型</dt>
          <dd>{kindLabel(item.kind)}</dd>
        </div>
        {item.fileName ? (
          <div>
            <dt>文件名</dt>
            <dd title={item.fileName}>{item.fileName}</dd>
          </div>
        ) : null}
        {item.label ? (
          <div>
            <dt>标签</dt>
            <dd title={item.label}>{item.label}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  )
}

export type ResourceDrawerProps = {
  manifest: ResourceManifest
  selected: Set<string>
  busy?: boolean
  error?: string
  onToggle: (id: string) => void
  onSelectIds: (ids: string[], mode?: 'replace' | 'add') => void
  onDownload: () => void
  onClose: () => void
}

export default function ResourceDrawer({
  manifest,
  selected,
  busy,
  error,
  onToggle,
  onSelectIds,
  onDownload,
  onClose,
}: ResourceDrawerProps): JSX.Element {
  const allItems = listItems(manifest)
  const [previewId, setPreviewId] = useState<string | null>(allItems[0]?.id ?? null)

  const previewItem = useMemo(() => {
    if (previewId) {
      const hit = allItems.find((i) => i.id === previewId)
      if (hit) return hit
    }
    for (const id of selected) {
      const hit = allItems.find((i) => i.id === id)
      if (hit) return hit
    }
    return allItems[0] ?? null
  }, [allItems, previewId, selected])

  function selectByKinds(kinds: string[]): void {
    onSelectIds(
      allItems.filter((i) => kinds.includes(i.kind)).map((i) => i.id),
      'add',
    )
  }

  function handleToggle(id: string): void {
    setPreviewId(id)
    onToggle(id)
  }

  return (
    <div className="resource-drawer-root" role="dialog" aria-modal="true" aria-label="资源选择">
      <button type="button" className="resource-drawer-backdrop" aria-label="关闭" onClick={onClose} />
      <div className="resource-drawer-panel">
        <header className="resource-drawer-header">
          <div className="resource-drawer-heading">
            <span className="resource-source-badge">{manifest.source}</span>
            <h2 className="resource-drawer-title">{manifest.title}</h2>
            <p className="resource-drawer-url muted" title={manifest.sourceUrl}>
              {manifest.sourceUrl}
            </p>
          </div>
          <button type="button" className="btn btn-ghost resource-drawer-close" onClick={onClose}>
            关闭
          </button>
        </header>

        <div className="resource-drawer-toolbar">
          <div className="resource-toolbar-actions">
            <button
              type="button"
              className="btn tiny"
              onClick={() => onSelectIds(manifest.groups.post.map((i) => i.id), 'replace')}
            >
              仅主帖
            </button>
            <button
              type="button"
              className="btn tiny"
              onClick={() =>
                onSelectIds(
                  [
                    ...manifest.groups.post.map((i) => i.id),
                    ...manifest.groups.comments.flatMap((c) => c.items.map((i) => i.id)),
                  ],
                  'replace',
                )
              }
            >
              主帖+评论
            </button>
            <button
              type="button"
              className="btn tiny"
              onClick={() => selectByKinds(['photo', 'telegraph_image'])}
            >
              选图片
            </button>
            <button
              type="button"
              className="btn tiny"
              onClick={() => selectByKinds(['video', 'animation'])}
            >
              选视频
            </button>
            <button
              type="button"
              className="btn tiny"
              onClick={() => onSelectIds(allItems.map((i) => i.id), 'replace')}
            >
              全选
            </button>
            <button type="button" className="btn tiny" onClick={() => onSelectIds([], 'replace')}>
              清空
            </button>
          </div>
          <div className="resource-toolbar-stat">
            已选 <strong>{selected.size}</strong> / {allItems.length}
          </div>
        </div>

        {error ? <p className="error-text resource-drawer-error">{error}</p> : null}

        <div className="resource-drawer-body">
          <div className="resource-drawer-scroll">
            {manifest.messageGroups && manifest.messageGroups.length > 0
              ? manifest.messageGroups.map((mg) => (
                  <div className="resource-message-group" key={mg.sourceUrl}>
                    <h3 className="resource-message-title">
                      消息 {mg.messageIndex}
                      <span className="muted"> · {mg.title || mg.sourceUrl}</span>
                    </h3>
                    {renderGroups(
                      { post: mg.post, comments: mg.comments, telegraph: mg.telegraph },
                      selected,
                      handleToggle,
                      setPreviewId,
                    )}
                  </div>
                ))
              : renderGroups(manifest.groups, selected, handleToggle, setPreviewId)}
          </div>
          <PreviewPane item={previewItem} />
        </div>

        <footer className="resource-drawer-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || selected.size === 0}
            onClick={onDownload}
          >
            下载所选（{selected.size}）
          </button>
        </footer>
      </div>
    </div>
  )
}

export { listItems }
