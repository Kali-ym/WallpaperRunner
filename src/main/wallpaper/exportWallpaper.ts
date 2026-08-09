import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { LibraryStore } from '../library/store'
import type { PlaylistStore } from '../library/playlists'
import { INDEX_HTML, MAIN_JS, buildProjectJson } from './templateFiles'

export interface WallpaperPlaylistGallery {
  id: string
  title: string
  favorite: boolean
  /** Paths relative to gallery root, e.g. dirName/001.jpg */
  images: string[]
}

export interface WallpaperUserPlaylistExport {
  id: string
  name: string
  galleryIds: string[]
}

export interface WallpaperPlaylist {
  updatedAt: string
  galleries: WallpaperPlaylistGallery[]
  playlists: WallpaperUserPlaylistExport[]
  mediaBase: string
}

export interface SyncWallpaperResult {
  dir: string
  galleryCount: number
  imageCount: number
  mediaBase: string
  playlistCount: number
}

export const DEFAULT_MEDIA_PORT = 17989

function toGalleryRelative(dirName: string, imageRel: string): string {
  return [dirName, imageRel].join('/').replace(/\\/g, '/')
}

const README_TXT = `Gallery Library Slideshow — Wallpaper Engine
================================================

WE 无法直接读图库外的本地文件，因此需要本机媒体服务：
  http://127.0.0.1:17989

开机自启（不必打开图库应用）：
  1. 图库应用设置里点「安装开机自启媒体服务」
  2. 或手动把 start-media-server.cmd 放进「启动」文件夹
  3. 需要本机已安装 Node.js，并在 PATH 中可用

日常：
  - 打开图库应用会自动起服务
  - 也可双击本目录 start-media-server.cmd

导入 Web 壁纸：
  壁纸编辑器 → 把 index.html 拖到「创建壁纸」
  类型应为网页/Web；不要用坏掉的「本地场景 / project.json」

播放池：
  在 WE 属性 Gallery pool 中选择 All / Favorites / 自定义播放列表
`

async function copyMediaServerScript(dir: string): Promise<void> {
  const candidates = [
    join(process.cwd(), 'scripts', 'we-media-server.mjs'),
    join(dirname(fileURLToPath(import.meta.url)), '../../../scripts/we-media-server.mjs'),
  ]
  let body: string | null = null
  for (const c of candidates) {
    try {
      body = await readFile(c, 'utf8')
      break
    } catch {
      // try next
    }
  }
  if (!body) {
    throw new Error('找不到 we-media-server.mjs，请在项目根目录运行同步')
  }
  await writeFile(join(dir, 'media-server.mjs'), body, 'utf8')
}

/**
 * Write WE project files + playlist. Images are served via local HTTP (not file://).
 */
export async function syncWallpaperEngineProject(
  store: LibraryStore,
  wallpaperDir: string,
  mediaPort: number = DEFAULT_MEDIA_PORT,
  playlistStore?: PlaylistStore,
): Promise<SyncWallpaperResult> {
  const dir = wallpaperDir.trim()
  if (!dir) throw new Error('Wallpaper Engine 工程目录为空')

  const port = mediaPort > 0 ? mediaPort : DEFAULT_MEDIA_PORT
  const mediaBase = `http://127.0.0.1:${port}`

  const userPlaylists = playlistStore ? await playlistStore.list() : []

  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'project.json'),
    buildProjectJson(userPlaylists.map((p) => ({ id: p.id, name: p.name }))),
    'utf8',
  )
  await writeFile(join(dir, 'index.html'), INDEX_HTML, 'utf8')
  await writeFile(join(dir, 'main.js'), MAIN_JS, 'utf8')
  await writeFile(join(dir, 'README.txt'), README_TXT, 'utf8')
  await copyMediaServerScript(dir)

  const startCmd =
    `@echo off\r\n` +
    `cd /d "%~dp0"\r\n` +
    `where node >nul 2>nul\r\n` +
    `if errorlevel 1 (\r\n` +
    `  echo Node.js not found in PATH.\r\n` +
    `  pause\r\n` +
    `  exit /b 1\r\n` +
    `)\r\n` +
    `start "Gallery WE Media" /MIN node "%~dp0media-server.mjs"\r\n`
  await writeFile(join(dir, 'start-media-server.cmd'), startCmd, 'utf8')

  const entries = await store.loadIndex()
  if (playlistStore) {
    await playlistStore.pruneMissing(entries)
  }

  const galleries: WallpaperPlaylistGallery[] = []
  let imageCount = 0
  const aliveIds = new Set<string>()

  for (const entry of entries) {
    if (entry.imageCount <= 0) continue
    const meta = await store.getGallery(entry.source, entry.galleryId)
    if (!meta || !meta.images?.length) continue

    const images = meta.images.map((rel) => toGalleryRelative(entry.dirName, rel)).filter(Boolean)
    if (!images.length) continue

    const title = (meta.displayTitle?.trim() || meta.title || entry.title).trim()
    const id = `${meta.source}/${meta.galleryId}`
    aliveIds.add(id)
    galleries.push({
      id,
      title,
      favorite: Boolean(meta.favorite ?? entry.favorite),
      images,
    })
    imageCount += images.length
  }

  const playlists: WallpaperUserPlaylistExport[] = (playlistStore ? await playlistStore.list() : []).map(
    (p) => ({
      id: p.id,
      name: p.name,
      galleryIds: p.galleryRefs
        .map((r) => `${r.source}/${r.galleryId}`)
        .filter((id) => aliveIds.has(id)),
    }),
  )

  const playlist: WallpaperPlaylist = {
    updatedAt: new Date().toISOString(),
    galleries,
    playlists,
    mediaBase,
  }

  await writeFile(join(dir, 'playlist.json'), JSON.stringify(playlist, null, 2), 'utf8')

  await writeFile(
    join(dir, 'config.js'),
    `window.__GALLERY_MEDIA_BASE__ = ${JSON.stringify(mediaBase)};\n`,
    'utf8',
  )

  await writeFile(
    join(dir, 'server-config.json'),
    JSON.stringify(
      {
        port,
        galleryRoot: resolve(store.root),
        wallpaperDir: resolve(dir),
      },
      null,
      2,
    ),
    'utf8',
  )

  return {
    dir,
    galleryCount: galleries.length,
    imageCount,
    mediaBase,
    playlistCount: playlists.length,
  }
}
