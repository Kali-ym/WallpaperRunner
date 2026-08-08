import { useEffect, useCallback, type JSX } from 'react'
import { api } from '../lib/api'

interface Props {
  dirName: string
  images: string[]
  index: number
  onClose: () => void
  onIndexChange: (index: number) => void
}

export default function Lightbox({
  dirName,
  images,
  index,
  onClose,
  onIndexChange,
}: Props): JSX.Element {
  const src = api.getMediaUrl(dirName, images[index])

  const go = useCallback(
    (delta: number) => {
      const next = (index + delta + images.length) % images.length
      onIndexChange(next)
    },
    [index, images.length, onIndexChange],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'f' || e.key === 'F') {
        if (document.fullscreenElement) void document.exitFullscreen()
        else void document.documentElement.requestFullscreen()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose])

  return (
    <div className="lightbox" role="dialog" aria-modal="true">
      <button type="button" className="lightbox-close" onClick={onClose}>
        关闭 (Esc)
      </button>
      <button type="button" className="lightbox-nav prev" onClick={() => go(-1)}>
        ‹
      </button>
      <img src={src} alt={`第 ${index + 1} 张`} />
      <button type="button" className="lightbox-nav next" onClick={() => go(1)}>
        ›
      </button>
      <div className="lightbox-meta">
        {index + 1} / {images.length} · F 全屏
      </div>
    </div>
  )
}
