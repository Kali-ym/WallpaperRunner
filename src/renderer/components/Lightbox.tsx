import { useCallback, useEffect, useRef, useState, type JSX, type PointerEvent } from 'react'
import { api } from '../lib/api'

interface Props {
  dirName: string
  images: string[]
  index: number
  onClose: () => void
  onIndexChange: (index: number) => void
}

const MIN_SCALE = 0.2
const MAX_SCALE = 6

export default function Lightbox({
  dirName,
  images,
  index,
  onClose,
  onIndexChange,
}: Props): JSX.Element {
  const src = api.getMediaUrl(dirName, images[index])
  const [scale, setScale] = useState(1)
  const [fitMode, setFitMode] = useState(true)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  const resetView = useCallback(() => {
    setScale(1)
    setFitMode(true)
    setOffset({ x: 0, y: 0 })
  }, [])

  useEffect(() => {
    resetView()
  }, [index, resetView])

  const go = useCallback(
    (delta: number) => {
      const next = (index + delta + images.length) % images.length
      onIndexChange(next)
    },
    [index, images.length, onIndexChange],
  )

  const zoomBy = useCallback((factor: number) => {
    setFitMode(false)
    setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * factor)))
  }, [])

  const fit = useCallback(() => {
    setFitMode(true)
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  const actual = useCallback(() => {
    setFitMode(false)
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'f' || e.key === 'F') {
        if (document.fullscreenElement) void document.exitFullscreen()
        else void document.documentElement.requestFullscreen()
      }
      if (e.key === '+' || e.key === '=') zoomBy(1.2)
      if (e.key === '-' || e.key === '_') zoomBy(1 / 1.2)
      if (e.key === '0') fit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fit, go, onClose, zoomBy])

  function onWheel(e: React.WheelEvent): void {
    e.preventDefault()
    zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1)
  }

  function onDoubleClick(): void {
    if (fitMode && scale === 1) {
      setFitMode(false)
      setScale(2)
    } else {
      fit()
    }
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>): void {
    if (fitMode && scale <= 1) return
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>): void {
    const d = dragRef.current
    if (!d) return
    setOffset({
      x: d.ox + (e.clientX - d.x),
      y: d.oy + (e.clientY - d.y),
    })
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>): void {
    dragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  const imgStyle =
    fitMode && scale === 1
      ? undefined
      : {
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          maxWidth: fitMode ? undefined : 'none',
          maxHeight: fitMode ? undefined : 'none',
          cursor: scale > 1 || !fitMode ? 'grab' : 'default',
        }

  return (
    <div className="lightbox" role="dialog" aria-modal="true">
      <div className="lightbox-toolbar">
        <button type="button" className="btn tiny" onClick={() => zoomBy(1.2)}>
          放大
        </button>
        <button type="button" className="btn tiny" onClick={() => zoomBy(1 / 1.2)}>
          缩小
        </button>
        <button type="button" className="btn tiny" onClick={fit}>
          适应窗口
        </button>
        <button type="button" className="btn tiny" onClick={actual}>
          1:1
        </button>
        <button type="button" className="btn tiny" onClick={onClose}>
          关闭 (Esc)
        </button>
      </div>
      <button type="button" className="lightbox-nav prev" onClick={() => go(-1)}>
        ‹
      </button>
      <div
        className="lightbox-stage"
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <img src={src} alt={`第 ${index + 1} 张`} style={imgStyle} draggable={false} />
      </div>
      <button type="button" className="lightbox-nav next" onClick={() => go(1)}>
        ›
      </button>
      <div className="lightbox-meta">
        {index + 1} / {images.length} · 滚轮缩放 · +/-/0 · F 全屏
      </div>
    </div>
  )
}
