# App UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved UX overhaul: light tool UI, explicit download sources with decoupled adapters, right drawer resource picker (thumbnails), expandable queue progress (percent/speed), Telegram multi-URL merge gallery, zip extract prompt, library context menu + metadata editing, and sectioned settings.

**Architecture:** Keep Electron main / preload / React renderer. Download page passes `source: 'xchina' | 'telegram' | 'telegraph'` explicitly into IPC (no auto URL routing as primary path). Queue emits richer progress. UI: light design tokens in CSS, drawer + toast + context menu components. Follow `docs/superpowers/specs/2026-08-09-app-ux-overhaul-design.md`.

**Tech Stack:** Electron, React 18, existing vanilla CSS (upgrade in place; do not add Tailwind unless a later task explicitly requires it), existing GramJS/telegraph stack, Node `zlib`/`yauzl` or similar for zip (add dependency when implementing Task 6).

## Global Constraints

- Light tool aesthetic; single accent; no purple/blue AI gradients; no emoji in UI
- Explicit source selection only — do not use `resolveAdapter(url)` as the primary user path
- Telegram multi-URL → one gallery; xChina/Telegraph multi-URL → no merge (inline hint)
- Zip only for extract prompt (not rar/7z)
- Prefer toast / inline errors over `window.alert`
- Design skills: `.agents/skills/redesign-existing-projects`, `.agents/skills/design-taste-frontend-v1`
- Work in existing CSS; install fonts/icons explicitly if added

---

### Task 1: Design tokens + app shell + Toast

**Files:**
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/App.tsx`
- Create: `src/renderer/components/Toast.tsx`
- Create: `src/renderer/lib/toast.tsx` (tiny context or event bus)
- Modify: `src/renderer/main.tsx` (wrap provider if used)

**Interfaces:**
- Produces: `toast.success(msg)` / `toast.error(msg)`; CSS vars `--bg`, `--panel`, `--text`, `--muted`, `--line`, `--accent`, `--danger`, `--radius`, `--font-sans`, `--font-mono`

- [ ] **Step 1: Add light token block at top of `styles.css`**

Replace dark-leaning variables with light tool tokens (neutral warm-cool consistent grays, one accent e.g. `#0F766E` teal, never purple). Load a distinctive sans via Google fonts or local `@font-face` (e.g. Outfit) + monospace for numbers (`ui-monospace` or JetBrains Mono if installed).

- [ ] **Step 2: Implement `Toast` component**

```tsx
// src/renderer/components/Toast.tsx — stack bottom-right, auto-dismiss 3s, role="status"
```

- [ ] **Step 3: Wire provider; restyle `app-shell` / `app-header` / `nav-btn` for light tool chrome**

Active nav: accent underline or filled chip; muted subtitle.

- [ ] **Step 4: Manual check in `npm run dev` — shell looks light, toast fires from a temp button**

- [ ] **Step 5: Commit**

```bash
git add src/renderer/styles.css src/renderer/App.tsx src/renderer/components/Toast.tsx src/renderer/lib/toast.tsx src/renderer/main.tsx
git commit -m "feat(ui): light design tokens, shell, and toast"
```

---

### Task 2: Explicit source IPC + decouple discover/enqueue

**Files:**
- Modify: `src/main/ipc.ts` (`resources:discover`, `queue:enqueue`)
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/lib/api.ts`
- Create: `src/main/sources/types.ts` (`DownloadSource = 'xchina' | 'telegram' | 'telegraph'`)
- Test: `tests/sources/sourceMatch.test.ts`

**Interfaces:**
- Produces:
  - `api.discoverResources(source: DownloadSource, urls: string[]): Promise<ResourceManifest>`
  - `api.enqueueUrls(source: DownloadSource, urls: string[], overwrite?: boolean)`
  - `matchSourceUrl(source, url): boolean` helpers per source

- [ ] **Step 1: Write failing tests for URL match helpers**

```ts
import { describe, it, expect } from 'vitest'
import { assertUrlsForSource } from '@main/sources/validate'

describe('assertUrlsForSource', () => {
  it('accepts t.me message urls for telegram', () => {
    expect(() =>
      assertUrlsForSource('telegram', ['https://t.me/foo/1']),
    ).not.toThrow()
  })
  it('rejects xchina url when source is telegram', () => {
    expect(() =>
      assertUrlsForSource('telegram', ['https://xchina.co/photo/id-abc.html']),
    ).toThrow(/不匹配/)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npm test -- tests/sources/sourceMatch.test.ts`

- [ ] **Step 3: Implement `src/main/sources/validate.ts` + wire IPC to require `source`**

Discover/enqueue must take `source` first; internally call the matching adapter only. Keep `resolveAdapter` only as secondary sanity check if needed.

- [ ] **Step 4: Update preload/api signatures; fix call sites temporarily**

- [ ] **Step 5: Tests pass; commit**

```bash
git commit -m "feat: explicit download source in IPC and validation"
```

---

### Task 3: Rich queue progress model

**Files:**
- Modify: `src/main/queue/types.ts`
- Modify: `src/main/queue/downloadQueue.ts`
- Modify: `src/main/downloader/downloadGallery.ts` (emit per-file + bytes timing)
- Modify: `src/main/adapters/telegram/download.ts` (same progress shape)
- Modify: preload types if mirrored
- Test: `tests/queue/progress.test.ts` (unit on percent/eta helpers)

**Interfaces:**
- Produces on `QueueTask` / progress events:

```ts
percent: number // 0-100
bytesPerSec?: number
etaSec?: number | null
files?: { id: string; name: string; status: 'pending'|'downloading'|'done'|'failed'; error?: string }[]
```

- [ ] **Step 1: Add pure helpers + tests**

```ts
export function computePercent(done: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.round((done / total) * 100))
}
```

- [ ] **Step 2: Extend queue patch/emit to include speed (sliding window bytes) and `files`**

- [ ] **Step 3: Update download loops to report file-level status**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(queue): percent, speed, eta, and per-file progress"
```

---

### Task 4: Download page — source picker + queue UI + ResourceDrawer

**Files:**
- Modify: `src/renderer/pages/DownloadPage.tsx`
- Create: `src/renderer/components/ResourceDrawer.tsx`
- Create: `src/renderer/components/QueueTaskRow.tsx`
- Modify: `src/renderer/styles.css` (drawer, progress bar)
- Follow redesign skill: clear hierarchy, no alert spam

**Interfaces:**
- Consumes: Task 2/3 APIs
- Produces: UX for source select, drawer open on parse, expandable progress

- [ ] **Step 1: Source segmented control** (`xChina` | `Telegram` | `Telegraph`) bound to state

- [ ] **Step 2: `ResourceDrawer` right panel (~440px)** — groups, checkboxes, footer actions

- [ ] **Step 3: Wire parse:** `discoverResources(source, urls)` → open drawer with manifest; Telegram multi-URL uses merged manifest from Task 5 (stub single until Task 5)

- [ ] **Step 4: `QueueTaskRow` with progress bar, `%`, speed, expand file list**

- [ ] **Step 5: Empty state copy; commit**

```bash
git commit -m "feat(ui): download source picker, drawer, and rich queue rows"
```

---

### Task 5: Telegram multi-URL merge discover + gallery id

**Files:**
- Create: `src/main/adapters/telegram/merge.ts`
- Modify: `src/main/adapters/telegram/discover.ts` or IPC discover path
- Modify: `src/main/resources/types.ts` if needed (`messageGroups`)
- Test: `tests/adapters/telegram-merge.test.ts`

**Interfaces:**
- Produces:

```ts
function mergeGalleryId(urls: string[]): string
// stable: telegram_merge_{sha1(sorted normalized urls).slice(0,12)}
// or telegram_{channel}_{firstId}_n{count} when all same channel

async function discoverTelegramMany(
  client, urls: string[], fetchText, signal?
): Promise<{ manifest: ResourceManifest; handles: Map<string, MediaHandle> }>
```

Drawer groups: `消息 1`, `消息 2`, … each with post/comments/telegraph subgroups.

- [ ] **Step 1: Failing tests for `mergeGalleryId` stability and sort-independence**

- [ ] **Step 2: Implement merge discover; IPC `discover` accepts `string[]` for telegram**

- [ ] **Step 3: Update drawer to render message groups**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(telegram): merge multiple message URLs into one gallery"
```

---

### Task 6: Zip download complete → extract prompt → library

**Files:**
- Create: `src/main/library/extractZipGallery.ts`
- Modify: queue completion path / IPC event `queue:askExtract`
- Modify: `DownloadPage` or App-level modal listener
- Add dep: `yauzl` or use `adm-zip` (run `npm install <chosen>` first)
- Test: `tests/library/extractZipGallery.test.ts` with fixture zip

**Interfaces:**
- Produces: `extractZipToGallery(zipPath, store) → GalleryMetadata`
- IPC: `library:extractZip({ taskId, zipPath, deleteZip?: boolean })`
- UI modal: 「解压图片入库」/「仅保留压缩包」

- [ ] **Step 1: Fixture zip + failing extract test (images become gallery entries)**

- [ ] **Step 2: Implement extract (jpg/png/webp/gif only); upsert gallery**

- [ ] **Step 3: On task complete, if primary artifact is `.zip`, emit ask-extract; show modal**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: prompt to extract zip downloads into gallery"
```

---

### Task 7: Library context menu + metadata edit

**Files:**
- Create: `src/renderer/components/ContextMenu.tsx`
- Create: `src/renderer/components/EditMetadataModal.tsx`
- Modify: `src/renderer/pages/LibraryPage.tsx`
- Modify: `src/renderer/components/GalleryCard.tsx`
- Modify: `src/main/library/store.ts` — `updateGalleryMeta(source, id, { displayTitle?, author?, tags? })`
- Modify: ipc/preload/api
- Test: `tests/library/updateMeta.test.ts`

**Interfaces:**
- Produces: `api.updateGalleryMeta(source, id, partial)`
- Context menu actions per spec §5.1

- [ ] **Step 1: Store updateMeta test + implementation**

- [ ] **Step 2: ContextMenu + wire GalleryCard `onContextMenu`**

- [ ] **Step 3: EditMetadataModal (editable displayTitle/author/tags; readonly source/id/url)**

- [ ] **Step 4: Slim library toolbar; move cleanup to overflow/context on empty area**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(library): context menu and editable metadata"
```

---

### Task 8: Settings sections + Telegram step UI

**Files:**
- Modify: `src/renderer/pages/SettingsPage.tsx`
- Modify: `src/renderer/styles.css`
- Use toast instead of sticky `message` where possible

- [ ] **Step 1: Split into four section panels** (通用 / 网络 / Telegram / Wallpaper)

- [ ] **Step 2: Telegram status badge + clear step flow** (credentials → phone → code/2FA)

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(ui): sectioned settings and clearer Telegram login"
```

---

### Task 9: Drawer thumbnails + skeleton/empty polish

**Files:**
- Modify: `ResourceDrawer.tsx`
- Add IPC if needed: `resources:previewThumb(resourceId)` or embed `previewUrl` in manifest at discover time
- For telegram_media: optional small download thumb into memory/data URL (cap size/concurrency)
- For http: use URL as img src when safe
- CSS skeletons for library grid + drawer list

- [ ] **Step 1: Ensure manifest items carry `previewUrl` when cheap; else type icon placeholder**

- [ ] **Step 2: Skeleton loaders; library/download empty states**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(ui): resource thumbnails and loading/empty states"
```

---

### Task 10: Visual QA pass + acceptance checklist

**Files:**
- Touch-up: `styles.css`, components as needed
- Update spec status line to `已批准 / 实施中` if desired

- [ ] **Step 1: Run full acceptance from spec §9 manually**

- [ ] **Step 2: Fix residual alert() usages in library/download/settings**

- [ ] **Step 3: `npm test` + `npm run build`**

- [ ] **Step 4: Final commit**

```bash
git commit -m "chore(ui): polish UX overhaul acceptance fixes"
```

---

## Spec coverage (self-review)

| Spec item | Task |
| --- | --- |
| Light tool UI | 1, 10 |
| Explicit sources + decouple | 2, 4 |
| Right drawer + thumbnails | 4, 9 |
| Progress % / speed / expand files | 3, 4 |
| Telegram multi-URL merge | 5 |
| Zip extract prompt | 6 |
| Library context menu + meta edit | 7 |
| Settings sections | 8 |
| No auto URL routing | 2 |
| Toast / less alert | 1, 7, 8, 10 |

## Out of scope (do not implement)

- rar/7z, dark mode, multi-window, auto source detection as primary UX
