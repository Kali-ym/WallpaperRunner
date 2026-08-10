import { useLayoutEffect, useState, type JSX } from 'react'
import { createPortal } from 'react-dom'

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
  const [pos, setPos] = useState({ x, y })

  useLayoutEffect(() => {
    const margin = 8
    const menu = document.querySelector<HTMLElement>('.ctx-menu[data-active="true"]')
    const w = menu?.offsetWidth ?? 168
    const h = menu?.offsetHeight ?? items.length * 36 + 12
    const maxX = window.innerWidth - w - margin
    const maxY = window.innerHeight - h - margin
    setPos({
      x: Math.min(Math.max(margin, x), Math.max(margin, maxX)),
      y: Math.min(Math.max(margin, y), Math.max(margin, maxY)),
    })
  }, [x, y, items.length])

  return createPortal(
    <div className="ctx-root" role="presentation">
      <button type="button" className="ctx-backdrop" aria-label="关闭菜单" onClick={onClose} />
      <ul
        className="ctx-menu"
        data-active="true"
        role="menu"
        style={{ left: pos.x, top: pos.y }}
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
    </div>,
    document.body,
  )
}
