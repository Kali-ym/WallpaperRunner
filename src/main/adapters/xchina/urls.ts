const ID_RE =
  /^https?:\/\/(?:www\.)?xchina\.co\/photo\/id-([a-zA-Z0-9]+)(?:\/\d+)?\.html\/?$/i

export function extractXchinaId(url: string): string | null {
  const m = url.trim().match(ID_RE)
  return m?.[1] ?? null
}

export function normalizeXchinaGalleryUrl(url: string): string | null {
  const id = extractXchinaId(url)
  if (!id) return null
  return `https://xchina.co/photo/id-${id}.html`
}

export function buildXchinaPageUrl(galleryId: string, page: number): string {
  return `https://xchina.co/photo/id-${galleryId}/${page}.html`
}
