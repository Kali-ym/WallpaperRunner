import { mkdir, readFile, writeFile, lstat, rmdir, readdir, copyFile, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import type { LibraryStore } from '../library/store'
import type { PlaylistStore } from '../library/playlists'
import { INDEX_HTML, MAIN_JS, buildProjectJson } from './templateFiles'
import { writeWallpaperMediaLaunchers } from './startup'

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
  /** Extra WE project copies updated (import creates a separate folder). */
  mirroredDirs: string[]
}

export const DEFAULT_MEDIA_PORT = 17989
export const WALLPAPER_PROJECT_TITLE = 'Gallery Library Slideshow'

const MIRROR_FILES = [
  'main.js',
  'index.html',
  'config.js',
  'project.json',
  'playlist.json',
  'media-server.mjs',
  'server-config.json',
  'README.txt',
  'start-media-server.cmd',
  'start-media-server-hidden.vbs',
] as const

function toGalleryRelative(dirName: string, imageRel: string): string {
  return [dirName, imageRel].join('/').replace(/\\/g, '/')
}

const README_TXT = `Gallery Library Slideshow — Wallpaper Engine
================================================

WE 无法直接读图库外的本地文件，因此需要本机媒体服务：
  http://127.0.0.1:17989

开机自启（不必打开图库应用，且不弹黑窗口）：
  1. 图库应用设置里点「安装开机自启媒体服务」
  2. 或手动运行本目录 start-media-server.cmd（后台隐藏启动）
  3. 需要本机已安装 Node.js，并在 PATH 中可用

日常：
  - 打开图库应用会自动起服务
  - 也可双击本目录 start-media-server.cmd

导入 Web 壁纸（只需一次）：
  1. 壁纸编辑器 → 把本目录 index.html 拖到「创建壁纸」（网页/Web）
  2. 导入后 WE 会复制到 projects\\myprojects\\xxx
  3. 之后「立即同步」会自动覆盖 myprojects 里的副本；无需反复导入
  不要导入图库目录，也不要在本目录下放 library 联接/拷贝

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
 * Remove leftover `library` junction/symlink from older builds.
 * WE editor scans the whole project folder — a junction into the gallery
 * makes import crawl multi-GB and feel hung. Only unlink the link (rmdir),
 * never recursive-delete (would wipe the real gallery if mis-detected).
 */
async function removeStaleLibraryLink(wallpaperDir: string): Promise<void> {
  const libPath = join(wallpaperDir, 'library')
  try {
    const st = await lstat(libPath)
    if (st.isSymbolicLink()) {
      await rmdir(libPath)
      return
    }
    if (st.isDirectory()) {
      // Windows junction: rmdir removes the link, not the target tree.
      await rmdir(libPath)
    }
  } catch {
    /* missing or not a link / not empty real dir — ignore */
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK)
    return true
  } catch {
    return false
  }
}

/** Candidate Wallpaper Engine myprojects roots on this machine. */
export function wallpaperEngineMyprojectsRoots(): string[] {
  const roots = new Set<string>()
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
  const pf = process.env.ProgramFiles || 'C:\\Program Files'
  const home = homedir()
  for (const base of [
    join(pf86, 'Steam', 'steamapps', 'common', 'wallpaper_engine', 'projects', 'myprojects'),
    join(pf, 'Steam', 'steamapps', 'common', 'wallpaper_engine', 'projects', 'myprojects'),
    join('D:\\', 'Steam', 'steamapps', 'common', 'wallpaper_engine', 'projects', 'myprojects'),
    join('E:\\', 'Steam', 'steamapps', 'common', 'wallpaper_engine', 'projects', 'myprojects'),
    join(home, 'Documents', 'wallpaper_engine', 'projects', 'myprojects'),
  ]) {
    roots.add(resolve(base))
  }
  return [...roots]
}

/**
 * Find WE-imported project folders for this wallpaper (title match).
 * Import copies files into myprojects — syncing only Documents/ would leave WE on stale main.js.
 */
export async function findImportedGalleryWallpaperDirs(
  excludeDir?: string,
): Promise<string[]> {
  const exclude = excludeDir ? resolve(excludeDir) : ''
  const hits: string[] = []
  for (const root of wallpaperEngineMyprojectsRoots()) {
    if (!(await pathExists(root))) continue
    let names: string[] = []
    try {
      names = await readdir(root)
    } catch {
      continue
    }
    for (const name of names) {
      const dir = join(root, name)
      if (exclude && resolve(dir) === exclude) continue
      try {
        const raw = await readFile(join(dir, 'project.json'), 'utf8')
        if (raw.includes(WALLPAPER_PROJECT_TITLE) || raw.includes('"title": "Gallery Library')) {
          hits.push(dir)
        }
      } catch {
        /* skip */
      }
    }
  }
  return hits
}

async function mirrorProjectFiles(fromDir: string, toDir: string): Promise<void> {
  await mkdir(toDir, { recursive: true })
  await removeStaleLibraryLink(toDir)
  for (const name of MIRROR_FILES) {
    const src = join(fromDir, name)
    if (!(await pathExists(src))) continue
    await copyFile(src, join(toDir, name))
  }
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
  await removeStaleLibraryLink(dir)
  await writeFile(
    join(dir, 'project.json'),
    buildProjectJson(userPlaylists.map((p) => ({ id: p.id, name: p.name }))),
    'utf8',
  )
  await writeFile(join(dir, 'index.html'), INDEX_HTML, 'utf8')
  await writeFile(join(dir, 'main.js'), MAIN_JS, 'utf8')
  await writeFile(join(dir, 'README.txt'), README_TXT, 'utf8')
  await copyMediaServerScript(dir)
  await writeWallpaperMediaLaunchers(dir)

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
    [
      `window.__GALLERY_MEDIA_BASE__ = ${JSON.stringify(mediaBase)};`,
      `window.__GALLERY_POOL_OPTIONS__ = ${JSON.stringify([
        { label: 'All galleries', value: 'all' },
        { label: 'Favorites only', value: 'favorites' },
        ...playlists.map((p) => ({ label: p.name.slice(0, 64) || p.id, value: p.id })),
      ])};`,
      '',
    ].join('\n'),
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

  // WE import copies the project into myprojects — update those running copies too.
  const mirroredDirs: string[] = []
  for (const target of await findImportedGalleryWallpaperDirs(dir)) {
    try {
      await mirrorProjectFiles(dir, target)
      mirroredDirs.push(target)
    } catch {
      /* ignore one bad target */
    }
  }

  return {
    dir,
    galleryCount: galleries.length,
    imageCount,
    mediaBase,
    playlistCount: playlists.length,
    mirroredDirs,
  }
}
