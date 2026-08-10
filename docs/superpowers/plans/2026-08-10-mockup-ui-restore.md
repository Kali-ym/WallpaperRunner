# Mockup UI Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align WallpaperRunner renderer UI with `docs/index.html` (structure + visual), dual theme, phase-1 shell/main flows only.

**Architecture:** Extract mockup CSS into `styles.css` with dark/light tokens and legacy aliases; remap App shell and key components to mockup class names; hide phase-2 library extras.

**Tech Stack:** React 18, electron-vite, vanilla CSS (oklch tokens)

## Global Constraints

- Source of truth for look: `docs/index.html` style + markup patterns
- Do not remove existing IPC/feature logic; only hide phase-2 UI entry points
- Keep `data-theme` light|dark via existing `applyTheme`
- Prefer class rename over rewriting business logic
- Chinese UI copy where mockup/app already Chinese

---

## File map

| File | Role |
|------|------|
| `src/renderer/styles.css` | Replace with mockup CSS + light tokens + extras |
| `src/renderer/App.tsx` | `.app` / `.header` / `.body` / `.main` shell |
| `src/renderer/components/CollectionRail.tsx` | `.rail` markup |
| `src/renderer/components/GalleryCard.tsx` | `.card` markup |
| `src/renderer/components/DownloadDock.tsx` | `.dock` markup |
| `src/renderer/pages/LibraryPage.tsx` | browse toolbar/grid; hide extras |
| `src/renderer/pages/GalleryPage.tsx` | gallery-head / thumb-grid classes |
| `src/renderer/pages/DownloadPage.tsx` | panel / segment / surface-card |
| `src/renderer/pages/SettingsPage.tsx` | panel wide / settings layout classes |
| `docs/superpowers/specs/2026-08-10-mockup-ui-restore-design.md` | Spec |

---

### Task 1: CSS foundation

- [ ] Extract/unindent mockup `<style>` into `styles.css`
- [ ] Add `[data-theme=light]` tokens + `--text/--panel/--line` aliases
- [ ] Alias `.btn.primary` → `.btn-primary`; map dock/download-dock if needed
- [ ] Append toast / onboarding / shortcut / modal / lightbox leftovers using new tokens
- [ ] Ensure `#root` fills viewport like mockup `html, body`

### Task 2: App shell

- [ ] Rewrite `App.tsx` header/body to mockup classes (brand mark, search pill, icon-btns)
- [ ] Place `DownloadDock` inside `.main`
- [ ] Wire acquire dot from active download count

### Task 3: Rail + Card + Dock

- [ ] `CollectionRail` → `.rail` / `.rail-item` / avatar / `.btn-new-list`
- [ ] `GalleryCard` → `.card` / `.cover` / `.card-meta`
- [ ] `DownloadDock` → `.dock` / `.dock-toggle` / `.dock-bar`

### Task 4: Pages

- [ ] `LibraryPage`: toolbar + grid-scroll; hide filter/dup/multiselect/density
- [ ] `GalleryPage`: gallery-head / thumb-grid
- [ ] `DownloadPage`: panel wide + acquire shell classes; `btn-primary`
- [ ] `SettingsPage`: panel wide alignment

### Task 5: Verify

- [ ] Manual: browse / open gallery / acquire tabs / settings / theme toggle / dock
- [ ] Delete temp `_mockup-extract.css` if present
- [ ] Fix obvious regressions from class mismatches

---

## Done when

Deep theme visually matches mockup shell; light theme readable; phase-1 flows work; phase-2 entries hidden.
