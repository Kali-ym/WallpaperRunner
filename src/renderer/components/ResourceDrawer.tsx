import { useLayoutEffect, useMemo, useRef, useState, type JSX, type ReactNode } from 'react'
import type { ResourceManifest } from '../lib/api'
import type { ResourceItem } from '../../main/resources/types'

type PickerItem = ResourceManifest['groups']['post'][number]
type ViewScope = 'all' | 'post' | 'comments' | 'telegraph'

function listItems(manifest: ResourceManifest): PickerItem[] {
  return [
    ...manifest.groups.post,
    ...manifest.groups.comments.flatMap((c) => c.items),
    ...manifest.groups.telegraph.flatMap((t) => t.items),
  ]
}

function postIds(manifest: ResourceManifest): string[] {
  return manifest.groups.post.map((i) => i.id)
}

function commentIds(manifest: ResourceManifest): string[] {
  return manifest.groups.comments.flatMap((c) => c.items.map((i) => i.id))
}

function telegraphIds(manifest: ResourceManifest): string[] {
  return manifest.groups.telegraph.flatMap((t) => t.items.map((i) => i.id))
}

function idsForScope(manifest: ResourceManifest, scope: ViewScope): string[] {
  switch (scope) {
    case 'post':
      return postIds(manifest)
    case 'comments':
      return commentIds(manifest)
    case 'telegraph':
      return telegraphIds(manifest)
    default:
      return listItems(manifest).map((i) => i.id)
  }
}

function scopeLabel(scope: ViewScope): string {
  switch (scope) {
    case 'post':
      return '主帖'
    case 'comments':
      return '评论'
    case 'telegraph':
      return 'Telegraph'
    default:
      return '全部'
  }
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
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      className={`resource-tile${checked ? ' selected' : ''}`}
      onClick={() => onToggle(item.id)}
      onMouseEnter={() => onPreview(item.id)}
      onFocus={() => onPreview(item.id)}
    >
      <span className="resource-tile-media" aria-hidden>
        {item.previewUrl ? (
          <img src={item.previewUrl} alt="" loading="lazy" draggable={false} />
        ) : (
          <span className="resource-tile-ph">{kindLabel(item.kind).slice(0, 1)}</span>
        )}
        <span className="resource-tile-kind">{kindLabel(item.kind)}</span>
        <span className={`resource-tile-mark${checked ? ' visible' : ''}`} aria-hidden>
          ✓
        </span>
      </span>
      <span className="resource-tile-name" title={item.fileName ?? item.label}>
        {shortItemName(item, index)}
      </span>
    </button>
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

function SectionHead({
  title,
  count,
  itemIds,
  selected,
  onSelectSection,
}: {
  title: ReactNode
  count: number
  itemIds: string[]
  selected: Set<string>
  onSelectSection: (ids: string[], mode: 'replace' | 'add' | 'remove') => void
}): JSX.Element {
  const allOn = itemIds.length > 0 && itemIds.every((id) => selected.has(id))

  return (
    <header className="resource-section-head">
      <h4>{title}</h4>
      <div className="resource-section-actions">
        <span className="resource-section-count">{count}</span>
        {itemIds.length > 0 ? (
          <button
            type="button"
            className="btn tiny resource-section-toggle"
            onClick={() =>
              onSelectSection(itemIds, allOn ? 'remove' : 'add')
            }
          >
            {allOn ? '取消' : '全选本组'}
          </button>
        ) : null}
      </div>
    </header>
  )
}

function renderGroups(
  groups: ResourceManifest['groups'],
  scope: ViewScope,
  selected: Set<string>,
  onToggle: (id: string) => void,
  onPreview: (id: string) => void,
  onSelectSection: (ids: string[], mode: 'replace' | 'add' | 'remove') => void,
): JSX.Element {
  const showPost = scope === 'all' || scope === 'post'
  const showComments = scope === 'all' || scope === 'comments'
  const showTelegraph = scope === 'all' || scope === 'telegraph'

  const empty =
    (showPost ? groups.post.length : 0) +
      (showComments ? groups.comments.reduce((n, c) => n + c.items.length, 0) : 0) +
      (showTelegraph ? groups.telegraph.reduce((n, t) => n + t.items.length, 0) : 0) ===
    0

  if (empty) {
    return (
      <p className="resource-empty muted">
        当前范围「{scopeLabel(scope)}」下没有可展示的资源。
      </p>
    )
  }

  return (
    <>
      {showPost && groups.post.length > 0 ? (
        <section className="resource-section">
          <SectionHead
            title="主帖"
            count={groups.post.length}
            itemIds={groups.post.map((i) => i.id)}
            selected={selected}
            onSelectSection={onSelectSection}
          />
          <ItemGrid
            items={groups.post}
            selected={selected}
            onToggle={onToggle}
            onPreview={onPreview}
          />
        </section>
      ) : null}

      {showComments
        ? groups.comments.map((c) => (
            <section className="resource-section" key={c.commentId}>
              <SectionHead
                title={
                  <>
                    评论 #{c.index}
                    {c.textPreview ? (
                      <span className="resource-section-preview muted"> — {c.textPreview}</span>
                    ) : null}
                  </>
                }
                count={c.items.length}
                itemIds={c.items.map((i) => i.id)}
                selected={selected}
                onSelectSection={onSelectSection}
              />
              {c.items.length === 0 ? (
                <p className="resource-empty muted">无媒体（可能仅含 Telegraph，见 Telegraph 分区）</p>
              ) : (
                <ItemGrid
                  items={c.items}
                  selected={selected}
                  onToggle={onToggle}
                  onPreview={onPreview}
                />
              )}
            </section>
          ))
        : null}

      {showTelegraph
        ? groups.telegraph.map((g) => (
            <section className="resource-section" key={g.url}>
              <SectionHead
                title={
                  <>
                    Telegraph
                    {g.title ? <span className="muted"> · {g.title}</span> : null}
                    {g.fromOrigin === 'comment' ? (
                      <span className="resource-origin-tag">评论</span>
                    ) : g.fromOrigin === 'post' ? (
                      <span className="resource-origin-tag">主帖</span>
                    ) : null}
                  </>
                }
                count={g.items.length}
                itemIds={g.items.map((i) => i.id)}
                selected={selected}
                onSelectSection={onSelectSection}
              />
              <ItemGrid
                items={g.items}
                selected={selected}
                onToggle={onToggle}
                onPreview={onPreview}
              />
            </section>
          ))
        : null}
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

function TelegramStats({ manifest }: { manifest: ResourceManifest }): JSX.Element | null {
  if (manifest.source !== 'telegram') return null
  const postN = manifest.groups.post.length
  const commentN = commentIds(manifest).length
  const tgphN = telegraphIds(manifest).length
  const groupsN = manifest.groups.comments.length

  return (
    <div className="resource-stats-row">
      <span className="resource-stat-chip">主帖 {postN}</span>
      <span className="resource-stat-chip">评论媒体 {commentN}</span>
      {groupsN > 0 ? <span className="resource-stat-chip">{groupsN} 组评论</span> : null}
      {tgphN > 0 ? <span className="resource-stat-chip">Telegraph {tgphN}</span> : null}
      {manifest.meta?.telegramReportedComments != null ? (
        <span className="resource-stat-chip muted">
          TG 评论 {manifest.meta.telegramReportedComments}
          {manifest.meta.telegramFetchedComments != null
            ? ` / 已拉取 ${manifest.meta.telegramFetchedComments}`
            : ''}
        </span>
      ) : null}
      <details className="resource-stats-details">
        <summary>说明</summary>
        <p>
          标题里的「×P」是套图张数，不等于评论条数；纯文字回复不会出现缩略图。Telegraph
          链接在「Telegraph」范围或分区中查看。
        </p>
      </details>
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
  const [viewScope, setViewScope] = useState<ViewScope>('all')
  const [previewId, setPreviewId] = useState<string | null>(allItems[0]?.id ?? null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const preserveScrollRef = useRef<number | null>(null)

  const scopeCounts = useMemo(
    () => ({
      all: allItems.length,
      post: postIds(manifest).length,
      comments: commentIds(manifest).length,
      telegraph: telegraphIds(manifest).length,
    }),
    [manifest, allItems.length],
  )

  const visibleIds = useMemo(() => idsForScope(manifest, viewScope), [manifest, viewScope])

  const selectedInView = useMemo(
    () => visibleIds.filter((id) => selected.has(id)).length,
    [visibleIds, selected],
  )

  useLayoutEffect(() => {
    if (preserveScrollRef.current === null) return
    const top = preserveScrollRef.current
    preserveScrollRef.current = null
    if (scrollRef.current) scrollRef.current.scrollTop = top
  }, [selected])

  const previewItem = useMemo(() => {
    if (previewId) {
      const hit = allItems.find((i) => i.id === previewId)
      if (hit) return hit
    }
    return allItems[0] ?? null
  }, [allItems, previewId])

  function preserveScroll(): void {
    preserveScrollRef.current = scrollRef.current?.scrollTop ?? 0
  }

  function handleToggle(id: string): void {
    preserveScroll()
    onToggle(id)
  }

  function handleSelectIds(ids: string[], mode?: 'replace' | 'add'): void {
    preserveScroll()
    onSelectIds(ids, mode)
  }

  function handleSectionSelect(ids: string[], mode: 'replace' | 'add' | 'remove'): void {
    preserveScroll()
    if (mode === 'remove') {
      const next = [...selected].filter((id) => !ids.includes(id))
      onSelectIds(next, 'replace')
      return
    }
    if (mode === 'add') {
      const merged = new Set(selected)
      for (const id of ids) merged.add(id)
      onSelectIds([...merged], 'replace')
      return
    }
    onSelectIds(ids, 'replace')
  }

  function selectByKinds(kinds: string[], baseIds?: string[]): void {
    const pool = baseIds ?? allItems.map((i) => i.id)
    const idSet = new Set(pool)
    handleSelectIds(
      allItems.filter((i) => idSet.has(i.id) && kinds.includes(i.kind)).map((i) => i.id),
      'replace',
    )
  }

  const scopes: ViewScope[] = ['all', 'post', 'comments', 'telegraph']

  return (
    <div className="resource-drawer-root" role="dialog" aria-modal="true" aria-label="资源选择">
      <button type="button" className="resource-drawer-backdrop" aria-label="关闭" onClick={onClose} />
      <div className="resource-drawer-panel">
        <header className="resource-drawer-header">
          <div className="resource-drawer-heading">
            <span className="resource-source-badge">{manifest.source}</span>
            <h2 className="resource-drawer-title" title={manifest.title}>{manifest.title}</h2>
            <a
              className="resource-drawer-url muted"
              href={manifest.sourceUrl}
              title={manifest.sourceUrl}
              onClick={(e) => e.preventDefault()}
            >
              {manifest.sourceUrl}
            </a>
          </div>
          <button type="button" className="btn btn-ghost resource-drawer-close" onClick={onClose}>
            关闭
          </button>
        </header>

        <TelegramStats manifest={manifest} />

        <div className="resource-drawer-toolbar">
          <div className="resource-toolbar-row">
            <span className="resource-toolbar-label">范围</span>
            <div className="resource-scope-tabs" role="tablist" aria-label="展示范围">
              {scopes.map((scope) => {
                const n = scopeCounts[scope]
                if (scope !== 'all' && n === 0) return null
                return (
                  <button
                    key={scope}
                    type="button"
                    role="tab"
                    aria-selected={viewScope === scope}
                    className={`resource-scope-tab${viewScope === scope ? ' active' : ''}`}
                    onClick={() => setViewScope(scope)}
                  >
                    {scopeLabel(scope)}
                    <span className="resource-scope-tab-n">{n}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="resource-toolbar-row resource-toolbar-row-actions">
            <span className="resource-toolbar-label">快捷选择</span>
            <div className="resource-toolbar-actions">
              <button
                type="button"
                className="btn tiny"
                title={`选中当前「${scopeLabel(viewScope)}」范围内的全部项`}
                onClick={() => handleSelectIds(visibleIds, 'replace')}
              >
                选当前范围
              </button>
              <button
                type="button"
                className="btn tiny"
                onClick={() => handleSelectIds(postIds(manifest), 'replace')}
              >
                仅主帖
              </button>
              <button
                type="button"
                className="btn tiny"
                disabled={commentIds(manifest).length === 0}
                onClick={() => handleSelectIds(commentIds(manifest), 'replace')}
              >
                仅评论
              </button>
              <button
                type="button"
                className="btn tiny"
                onClick={() =>
                  handleSelectIds([...postIds(manifest), ...commentIds(manifest)], 'replace')
                }
              >
                主帖+评论
              </button>
              <button
                type="button"
                className="btn tiny"
                disabled={telegraphIds(manifest).length === 0}
                onClick={() => handleSelectIds(telegraphIds(manifest), 'replace')}
              >
                仅 Telegraph
              </button>
              <span className="resource-toolbar-divider" aria-hidden />
              <button
                type="button"
                className="btn tiny"
                onClick={() => selectByKinds(['photo', 'telegraph_image'], visibleIds)}
              >
                图片
              </button>
              <button
                type="button"
                className="btn tiny"
                onClick={() => selectByKinds(['video', 'animation'], visibleIds)}
              >
                视频
              </button>
              <button
                type="button"
                className="btn tiny"
                onClick={() => handleSelectIds(allItems.map((i) => i.id), 'replace')}
              >
                全选
              </button>
              <button type="button" className="btn tiny" onClick={() => handleSelectIds([], 'replace')}>
                清空
              </button>
            </div>
            <div className="resource-toolbar-stat">
              已选 <strong>{selected.size}</strong> / {allItems.length}
              {viewScope !== 'all' ? (
                <span className="resource-toolbar-stat-sub">
                  （本范围 {selectedInView}/{visibleIds.length}）
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {error ? <p className="error-text resource-drawer-error">{error}</p> : null}
        {manifest.source === 'telegram' &&
        manifest.groups.comments.length === 0 &&
        commentIds(manifest).length === 0 ? (
          <p className="resource-drawer-banner muted">
            未解析到评论区的图片/视频。若频道有讨论区，请重新解析；纯文字评论不会出现在列表中。
          </p>
        ) : null}

        <div className="resource-drawer-body">
          <div className="resource-drawer-scroll" ref={scrollRef}>
            {manifest.messageGroups && manifest.messageGroups.length > 0
              ? manifest.messageGroups.map((mg) => (
                  <div className="resource-message-group" key={mg.sourceUrl}>
                    <h3 className="resource-message-title">
                      消息 {mg.messageIndex}
                      <span className="muted"> · {mg.title || mg.sourceUrl}</span>
                    </h3>
                    {renderGroups(
                      { post: mg.post, comments: mg.comments, telegraph: mg.telegraph },
                      viewScope,
                      selected,
                      handleToggle,
                      setPreviewId,
                      handleSectionSelect,
                    )}
                  </div>
                ))
              : renderGroups(
                  manifest.groups,
                  viewScope,
                  selected,
                  handleToggle,
                  setPreviewId,
                  handleSectionSelect,
                )}
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
