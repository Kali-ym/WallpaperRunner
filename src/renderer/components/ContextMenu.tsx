import type { JSX } from 'react'

export type ContextMenuItem = {
  id: string
  label: string
  danger?: boolean
  disabled?: boolean
}

export type ContextMenuProps = {
  x: number
  y: number
  items: ContextMenuItem[]
  onSelect: (id: string) => void
  onClose: () => void
}

export default function ContextMenu({
  x,
  y,
  items,
  onSelect,
  onClose,
}: ContextMenuProps): JSX.Element {
  return (
    <div className="ctx-root" role="menu">
      <button type="button" className="ctx-backdrop" aria-label="关闭菜单" onClick={onClose} />
      <ul
        className="ctx-menu"
        style={{ left: x, top: y }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              role="menuitem"
              className={item.danger ? 'ctx-item danger' : 'ctx-item'}
              disabled={item.disabled}
              onClick={() => {
                onSelect(item.id)
                onClose()
              }}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
