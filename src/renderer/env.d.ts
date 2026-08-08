/// <reference types="vite/client" />

import type { GalleryApi } from '../../preload/index'

declare global {
  interface Window {
    api: GalleryApi
  }
}

export {}
