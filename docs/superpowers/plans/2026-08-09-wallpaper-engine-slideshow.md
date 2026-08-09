# Wallpaper Engine 图库轮播 Implementation Plan

> Spec: `docs/superpowers/specs/2026-08-09-wallpaper-engine-slideshow-design.md`

**Goal:** Export a local WE Web wallpaper that randomizes library galleries with portrait-aware layouts.

**Architecture:** Electron `syncWallpaperEngineProject` writes `project.json` / `index.html` / `main.js` / `playlist.json` to a user folder; WE reads files independently at boot.

## Tasks completed

- [x] Design spec
- [x] WE template in `src/main/wallpaper/templateFiles.ts`
- [x] Exporter + settings/IPC auto-sync
- [x] Settings UI
- [x] CLI: `npx tsx scripts/sync-wallpaper.ts`
