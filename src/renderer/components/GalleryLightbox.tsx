import { useEffect, useMemo, useState, type JSX } from 'react'
import Lightbox from 'yet-another-react-lightbox'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails'
import Counter from 'yet-another-react-lightbox/plugins/counter'
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen'
import 'yet-another-react-lightbox/styles.css'
import 'yet-another-react-lightbox/plugins/thumbnails.css'
import 'yet-another-react-lightbox/plugins/counter.css'
import { api } from '../lib/api'

export type GalleryLightboxProps = {
  dirName: string
  images: string[]
  index: number
  open: boolean
  onClose: () => void
  onIndexChange: (index: number) => void
}

export default function GalleryLightbox({
  dirName,
  images,
  index,
  open,
  onClose,
  onIndexChange,
}: GalleryLightboxProps): JSX.Element {
  const slides = useMemo(
    () => images.map((img) => ({ src: api.getMediaUrl(dirName, img) })),
    [dirName, images],
  )

  return (
    <Lightbox
      open={open}
      close={onClose}
      index={index}
      slides={slides}
      plugins={[Zoom, Thumbnails, Counter, Fullscreen]}
      on={{ view: ({ index: i }) => onIndexChange(i) }}
      controller={{ closeOnBackdropClick: true }}
      zoom={{ maxZoomPixelRatio: 4, scrollToZoom: true }}
      thumbnails={{ position: 'bottom', border: 0, border: 1, imageFit: 'cover' }}
      styles={{
        container: { backgroundColor: 'rgba(12, 14, 13, 0.94)' },
      }}
    />
  )
}
