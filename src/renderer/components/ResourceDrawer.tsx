import type { JSX } from 'react'
import type { ResourceManifest } from '../lib/api'

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
    telegraph_image: 'Telegraph 图',
    telegraph_file: 'Telegraph 文件',
  }
  return map[kind] ?? kind
}

function ItemRow({
  item,
  checked,
  onToggle,
}: {
  item: PickerItem
  checked: boolean
  onToggle: (id: string) => void
}): JSX.Element {
  return (
    <li>
      <label className="resource-item">
        <input type="checkbox" checked={checked} onChange={() => onToggle(item.id)} />
        <span className="resource-thumb" aria-hidden>
          {item.previewUrl ? (
            <img src={item.previewUrl} alt="" />
          ) : (
            <span className="resource-thumb-ph">{kindLabel(item.kind).slice(0, 1)}</span>
          )}
        </span>
        <span>
          {item.label}
          <span className="muted"> · {kindLabel(item.kind)}</span>
          {item.fileName ? <span className="muted"> · {item.fileName}</span> : null}
        </span>
      </label>
    </li>
  )
}

function renderGroups(
  groups: ResourceManifest['groups'],
  selected: Set<string>,
  onToggle: (id: string) => void,
): JSX.Element {
  return (
    <>
      {groups.post.length > 0 ? (
        <div className="resource-group">
          <h4>主帖</h4>
          <ul className="resource-list">
            {groups.post.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                checked={selected.has(item.id)}
                onToggle={onToggle}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {groups.comments.map((c) => (
        <div className="resource-group" key={c.commentId}>
          <h4>
            评论 #{c.index}
            {c.textPreview ? <span className="muted"> — {c.textPreview}</span> : null}
          </h4>
          {c.items.length === 0 ? (
            <p className="muted">无媒体（可能仅含 Telegraph 链接，见下方）</p>
          ) : (
            <ul className="resource-list">
              {c.items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  checked={selected.has(item.id)}
                  onToggle={onToggle}
                />
              ))}
            </ul>
          )}
        </div>
      ))}

      {groups.telegraph.map((g) => (
        <div className="resource-group" key={g.url}>
          <h4>
            Telegraph：{g.title || g.url}
            {g.fromOrigin === 'comment' ? (
              <span className="muted">（来自评论）</span>
            ) : g.fromOrigin === 'post' ? (
              <span className="muted">（来自主帖）</span>
            ) : null}
          </h4>
          <ul className="resource-list">
            {g.items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                checked={selected.has(item.id)}
                onToggle={onToggle}
              />
            ))}
          </ul>
        </div>
      ))}
    </>
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

  function selectByKinds(kinds: string[]): void {
    onSelectIds(
      allItems.filter((i) => kinds.includes(i.kind)).map((i) => i.id),
      'add',
    )
  }

  return (
    <div className="drawer-root" role="dialog" aria-modal="true" aria-label="资源选择">
      <button type="button" className="drawer-backdrop" aria-label="关闭" onClick={onClose} />
      <aside className="drawer-panel">
        <header className="drawer-header">
          <div>
            <h2 className="drawer-title">{manifest.title}</h2>
            <p className="muted">
              {manifest.source} · {manifest.sourceUrl}
            </p>
          </div>
          <button type="button" className="btn tiny" onClick={onClose}>
            关闭
          </button>
        </header>

        <div className="drawer-toolbar">
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
          <button type="button" className="btn tiny" onClick={() => selectByKinds(['photo', 'telegraph_image'])}>
            选图片
          </button>
          <button type="button" className="btn tiny" onClick={() => selectByKinds(['video', 'animation'])}>
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

        {error ? <p className="error-text drawer-error">{error}</p> : null}

        <div className="drawer-body">
          {manifest.messageGroups && manifest.messageGroups.length > 0
            ? manifest.messageGroups.map((mg) => (
                <div className="message-group" key={mg.sourceUrl}>
                  <h3 className="message-group-title">
                    消息 {mg.messageIndex}
                    <span className="muted"> · {mg.title || mg.sourceUrl}</span>
                  </h3>
                  {renderGroups(
                    { post: mg.post, comments: mg.comments, telegraph: mg.telegraph },
                    selected,
                    onToggle,
                  )}
                </div>
              ))
            : renderGroups(manifest.groups, selected, onToggle)}
        </div>

        <footer className="drawer-footer">
          <button type="button" className="btn" onClick={onClose}>
            关闭
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy || selected.size === 0}
            onClick={onDownload}
          >
            下载所选（{selected.size}）
          </button>
        </footer>
      </aside>
    </div>
  )
}

export { listItems }
