import type { JSX } from 'react'

const SHORTCUTS: Array<{ keys: string; desc: string }> = [
  { keys: 'Ctrl+K', desc: '聚焦顶栏搜索' },
  { keys: 'Ctrl+N', desc: '打开获取并聚焦链接输入' },
  { keys: 'Ctrl+,', desc: '打开设置' },
  { keys: '?', desc: '打开本帮助' },
  { keys: 'Esc', desc: '关闭帮助 / 返回浏览 / 关闭套图详情' },
]

interface Props {
  onClose: () => void
}

export default function ShortcutHelp({ onClose }: Props): JSX.Element {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card shortcut-help"
        role="dialog"
        aria-labelledby="shortcut-help-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="shortcut-help-title">快捷键</h2>
        <ul className="shortcut-list">
          {SHORTCUTS.map((s) => (
            <li key={s.keys}>
              <kbd>{s.keys}</kbd>
              <span>{s.desc}</span>
            </li>
          ))}
        </ul>
        <div className="page-toolbar">
          <button type="button" className="btn primary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
