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
}

export interface SourceAdapter {
  id: string
  name: string
  match(url: string): boolean
  parseGallery(url: string, ctx: ParseContext): Promise<GalleryParseResult>
}
