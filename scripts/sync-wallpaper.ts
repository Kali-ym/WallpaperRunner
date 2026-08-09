/**
 * Sync Wallpaper Engine project without launching Electron UI.
 * Usage: npx tsx scripts/sync-wallpaper.ts
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { LibraryStore } from '../src/main/library/store'
import { PlaylistStore } from '../src/main/library/playlists'
import { syncWallpaperEngineProject } from '../src/main/wallpaper/exportWallpaper'

async function main(): Promise<void> {
  const root = process.env.GALLERY_ROOT || join(homedir(), 'Pictures', 'gallery-library')
  const weDir =
    process.env.WE_WALLPAPER_DIR || join(homedir(), 'Documents', 'gallery-we-wallpaper')
  const store = new LibraryStore(root)
  const playlists = new PlaylistStore(root)
  await store.ensureRoot()
  const result = await syncWallpaperEngineProject(store, weDir, 17989, playlists)
  console.log(JSON.stringify(result, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
