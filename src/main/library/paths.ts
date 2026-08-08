import { sanitizeFolderName } from './sanitize'

export function galleryFolderName(source: string, galleryId: string, title: string): string {
  const safeTitle = sanitizeFolderName(title) || galleryId
  return sanitizeFolderName(`${source}_${galleryId}_${safeTitle}`)
}
