export type DownloadSource = 'xchina' | 'telegram' | 'telegraph'

const DOWNLOAD_SOURCES: DownloadSource[] = ['xchina', 'telegram', 'telegraph']

export function isDownloadSource(value: string): value is DownloadSource {
  return (DOWNLOAD_SOURCES as string[]).includes(value)
}
