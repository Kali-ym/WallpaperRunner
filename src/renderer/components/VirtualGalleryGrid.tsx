import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

type Props<T> = {
  items: T[]
  density?: 'compact' | 'comfy' | 'large'
  getKey: (item: T) => string
  renderItem: (item: T, index: number, focused: boolean) => ReactNode
  onOpenIndex?: (index: number) => void
  className?: string
  /** Activate windowing above this count. */
  threshold?: number
}

const MIN_COL: Record<string, number> = {
  compact: 140,
  comfy: 180,
  large: 240,
}

const ROW_EST: Record<string, number> = {
  compact: 220,
  comfy: 280,
  large: 340,
}

export default function VirtualGalleryGrid<T>({
  items,
  density = 'comfy',
  getKey,
  renderItem,
  onOpenIndex,
  className,
  threshold = 60,
}: Props<T>): JSX.Element {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(600)
  const [cols, setCols] = useState(4)
  const [focusIdx, setFocusIdx] = useState(0)
  const overscan = 2

  const measure = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const w = el.clientWidth
    const min = MIN_COL[density] ?? 180
    setCols(Math.max(1, Math.floor(w / min)))
    setViewportH(el.clientHeight)
  }, [density])

  useEffect(() => {
    measure()
    const el = scrollerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure])

  const rowH = ROW_EST[density] ?? 280
  const rowCount = Math.ceil(items.length / cols) || 0
  const useVirtual = items.length >= threshold

  const { startRow, endRow } = useMemo(() => {
    if (!useVirtual) return { startRow: 0, endRow: rowCount }
    const start = Math.max(0, Math.floor(scrollTop / rowH) - overscan)
    const visible = Math.ceil(viewportH / rowH) + overscan * 2
    return { startRow: start, endRow: Math.min(rowCount, start + visible) }
  }, [useVirtual, scrollTop, rowH, viewportH, rowCount, overscan])

  const startIdx = startRow * cols
  const endIdx = Math.min(items.length, endRow * cols)
  const slice = useVirtual ? items.slice(startIdx, endIdx) : items
  const padTop = useVirtual ? startRow * rowH : 0
  const padBottom = useVirtual ? Math.max(0, (rowCount - endRow) * rowH) : 0

  useEffect(() => {
    if (focusIdx >= items.length) setFocusIdx(Math.max(0, items.length - 1))
  }, [items.length, focusIdx])

  function onKeyDown(e: KeyboardEvent): void {
    if (items.length === 0) return
    let next = focusIdx
    if (e.key === 'ArrowRight') next = Math.min(items.length - 1, focusIdx + 1)
    else if (e.key === 'ArrowLeft') next = Math.max(0, focusIdx - 1)
    else if (e.key === 'ArrowDown') next = Math.min(items.length - 1, focusIdx + cols)
    else if (e.key === 'ArrowUp') next = Math.max(0, focusIdx - cols)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = items.length - 1
    else if (e.key === 'Enter') {
      e.preventDefault()
      onOpenIndex?.(focusIdx)
      return
    } else return
    e.preventDefault()
    setFocusIdx(next)
    if (useVirtual && scrollerRef.current) {
      const row = Math.floor(next / cols)
      const top = row * rowH
      const bottom = top + rowH
      const viewTop = scrollerRef.current.scrollTop
      const viewBottom = viewTop + scrollerRef.current.clientHeight
      if (top < viewTop) scrollerRef.current.scrollTop = top
      else if (bottom > viewBottom) scrollerRef.current.scrollTop = bottom - scrollerRef.current.clientHeight
    }
  }

  return (
    <div
      ref={scrollerRef}
      className={className ?? 'gallery-grid-scroll'}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={useVirtual ? { paddingTop: padTop, paddingBottom: padBottom } : undefined}>
        <div className="gallery-grid" data-density={density}>
          {slice.map((item, i) => {
            const index = useVirtual ? startIdx + i : i
            return (
              <div
                key={getKey(item)}
                className={index === focusIdx ? 'gallery-cell focused' : 'gallery-cell'}
                onFocus={() => setFocusIdx(index)}
              >
                {renderItem(item, index, index === focusIdx)}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
