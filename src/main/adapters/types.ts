import type { ResourceManifest } from '../resources/types'

export interface ParsedImage {
  index: number
  url: string
}

export interface GalleryParseResult {
  source: string
  galleryId: string
  title: string
  sourceUrl: string
  author: string
  tags: string[]
  pageCount: number
  coverUrl: string | null
  images: ParsedImage[]
}

export interface ParseContext {
  fetchText: (url: string) => Promise<string>
  signal?: AbortSignal
  telegramApiId?: number
  telegramApiHash?: string
}

export interface SourceAdapter {
  id: string
  name: string
  match(url: string): boolean
  /** When true, UI must discover + select before download (Telegram/Telegraph). */
  needsSelection?(url: string): boolean
  discover?(url: string, ctx: ParseContext): Promise<ResourceManifest>
  parseGallery(url: string, ctx: ParseContext): Promise<GalleryParseResult>
}
