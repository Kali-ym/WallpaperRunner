import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
  gridClassName?: string
  /** Override min column width (px). */
  minColWidth?: number
  /** Cover height / width. Default 10/16 for gallery cards. */
  coverAspect?: number
  metaEst?: number
  gap?: number
  /** Activate windowing above this count. */
  threshold?: number
}

const MIN_COL: Record<string, number> = {
  compact: 140,
  comfy: 180,
  large: 240,
}

const META_EST: Record<string, number> = {
  compact: 48,
  comfy: 54,
  large: 58,
}
const GRID_GAP = 18
const CARD_GAP = 10
const OVERSCAN = 4

function estimateRowHeight(colWidth: number, coverAspect: number, metaEst: number, gap: number): number {
  const coverH = colWidth * coverAspect
  return Math.ceil(coverH + CARD_GAP + metaEst + gap)
}

export default function VirtualGalleryGrid<T>({
  items,
  density = 'comfy',
  getKey,
  renderItem,
  onOpenIndex,
  className,
  gridClassName = 'gallery-grid',
  minColWidth,
  coverAspect = 10 / 16,
  metaEst,
  gap = GRID_GAP,
  threshold = 80,
}: Props<T>): JSX.Element {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const scrollTopRef = useRef(0)
  const rafRef = useRef(0)

  const [viewportH, setViewportH] = useState(600)
  const [cols, setCols] = useState(4)
  const [colWidth, setColWidth] = useState(200)
  const [measuredRowH, setMeasuredRowH] = useState(0)
  const [focusIdx, setFocusIdx] = useState(0)
  const [windowRange, setWindowRange] = useState({ startRow: 0, endRow: 12 })

  const meta = metaEst ?? META_EST[density] ?? 54
  const estRowH = estimateRowHeight(colWidth, coverAspect, meta, gap)
  const rowH = measuredRowH > 0 ? measuredRowH : estRowH
  const rowCount = Math.ceil(items.length / cols) || 0
  const useVirtual = items.length >= threshold

  const measure = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const style = getComputedStyle(el)
    const padX =
      (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
    const w = Math.max(0, el.clientWidth - padX)
    const min = minColWidth ?? MIN_COL[density] ?? 180
    const nextCols = Math.max(1, Math.floor((w + gap) / (min + gap)))
    const nextColW = (w - gap * (nextCols - 1)) / nextCols
    setCols(nextCols)
    setColWidth(Math.max(1, nextColW))
    setViewportH(el.clientHeight)
  }, [density, minColWidth, gap])

  const syncWindow = useCallback(
    (scrollTop: number) => {
      if (!useVirtual) {
        setWindowRange((prev) =>
          prev.startRow === 0 && prev.endRow === rowCount
            ? prev
            : { startRow: 0, endRow: rowCount },
        )
        return
      }
      const start = Math.max(0, Math.floor(scrollTop / rowH) - OVERSCAN)
      const visible = Math.ceil(viewportH / rowH) + OVERSCAN * 2
      const end = Math.min(rowCount, start + visible)
      setWindowRange((prev) =>
        prev.startRow === start && prev.endRow === end ? prev : { startRow: start, endRow: end },
      )
    },
    [useVirtual, rowCount, rowH, viewportH],
  )

  useEffect(() => {
    measure()
    const el = scrollerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure])

  const { startRow, endRow } = useVirtual
    ? windowRange
    : { startRow: 0, endRow: rowCount }

  const startIdx = startRow * cols
  const endIdx = Math.min(items.length, endRow * cols)
  const slice = useVirtual ? items.slice(startIdx, endIdx) : items
  const totalH = useVirtual ? Math.max(0, rowCount * rowH - gap) : undefined
  const offsetY = useVirtual ? startRow * rowH : 0

  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const cell = el.querySelector('.gallery-cell') as HTMLElement | null
    if (!cell) return
    const h = cell.getBoundingClientRect().height
    if (h <= 0) return
    const next = Math.ceil(h + gap)
    setMeasuredRowH((prev) => (Math.abs(prev - next) > 1 ? next : prev))
  }, [cols, density, colWidth, startIdx, slice.length, gap])

  useEffect(() => {
    syncWindow(scrollTopRef.current)
  }, [syncWindow])

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
      else if (bottom > viewBottom) {
        scrollerRef.current.scrollTop = bottom - scrollerRef.current.clientHeight
      }
    }
  }

  const onScroll = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    scrollTopRef.current = el.scrollTop
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      syncWindow(scrollTopRef.current)
    })
  }, [syncWindow])

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <div
      ref={scrollerRef}
      className={className ?? 'gallery-grid-scroll'}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onScroll={onScroll}
    >
      <div
        className="gallery-virtual-space"
        style={useVirtual ? { height: totalH, position: 'relative' } : undefined}
      >
        <div
          className="gallery-virtual-window"
          style={
            useVirtual
              ? {
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${offsetY}px)`,
                  willChange: 'transform',
                }
              : undefined
          }
        >
          <div
            className={gridClassName}
            data-density={density}
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gap,
            }}
          >
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
    </div>
  )
}
