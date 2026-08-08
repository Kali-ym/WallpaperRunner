# Gallery Downloader & Local Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Electron + React desktop app that queues gallery URLs, downloads full-resolution images via pluggable source adapters (xChina first), and browses them locally with search, lightbox, and progress UI.

**Architecture:** Main process owns adapters, download queue, filesystem library, and settings; renderer is React UI talking only over preload IPC. Each site is a `SourceAdapter`; xChina HTML is parsed with cheerio against fixtures in tests.

**Tech Stack:** Electron + electron-vite, React 18, TypeScript, cheerio, vitest, Node `fs/promises` + `fetch` (or undici).

## Global Constraints

- Folder naming: `{source}_{id}_{title}` (sanitize illegal path chars)
- Unique key: `(source, galleryId)`
- Default download root: `~/Pictures/gallery-library`
- Queue default: galleries serial; in-gallery image concurrency configurable
- Existing same-key folder: skip by default (manual re-download/overwrite later)
- No Playwright / no site login in v1
- Original images only; skip ad blocks
- UI copy and comments may be Chinese where user-facing

---

## File Structure

```
package.json
electron.vite.config.ts
tsconfig.json
tsconfig.node.json
vitest.config.ts
src/main/index.ts                 # app entry, BrowserWindow
src/main/ipc.ts                   # ipcMain handlers + progress events
src/main/settings.ts              # persist settings.json
src/main/adapters/types.ts        # SourceAdapter + parse result types
src/main/adapters/registry.ts     # match URL → adapter
src/main/adapters/xchina/urls.ts  # ID extract + page URL builders
src/main/adapters/xchina/parsePage.ts
src/main/adapters/xchina/adapter.ts
src/main/downloader/fetchHtml.ts
src/main/downloader/downloadFile.ts
src/main/downloader/downloadGallery.ts
src/main/library/sanitize.ts
src/main/library/paths.ts
src/main/library/store.ts         # metadata.json + library.json
src/main/queue/types.ts
src/main/queue/downloadQueue.ts
src/preload/index.ts
src/renderer/index.html
src/renderer/main.tsx
src/renderer/App.tsx
src/renderer/styles.css
src/renderer/lib/api.ts           # typed window.api wrappers
src/renderer/pages/LibraryPage.tsx
src/renderer/pages/GalleryPage.tsx
src/renderer/pages/DownloadPage.tsx
src/renderer/pages/SettingsPage.tsx
src/renderer/components/Lightbox.tsx
src/renderer/components/GalleryCard.tsx
tests/adapters/xchina-urls.test.ts
tests/adapters/xchina-parsePage.test.ts
tests/adapters/registry.test.ts
tests/library/sanitize.test.ts
tests/library/store.test.ts
tests/queue/downloadQueue.test.ts
fixtures/xchina/page1.html
fixtures/xchina/page2.html
```

---

### Task 1: Scaffold Electron + React + Vitest

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `vitest.config.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/main.tsx`, `src/renderer/App.tsx`, `src/renderer/styles.css`
- Test: smoke via `npm test` empty suite / app launch later

**Interfaces:**
- Produces: runnable `npm run dev`, `npm test` (vitest)

- [ ] **Step 1: Scaffold project with electron-vite React-TS template in the repo root**

Run from `c:\Users\ASUS\Desktop\应用\crawl` (keep existing `docs/`):

```bash
npm create @quick-start/electron@latest . -- --template react-ts
```

If the tool refuses non-empty dir, scaffold into a temp folder and move `package.json`, `src/`, configs into root without deleting `docs/`.

- [ ] **Step 2: Add cheerio + vitest dependencies**

```bash
npm install cheerio
npm install -D vitest @types/node
```

- [ ] **Step 3: Add `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@main': path.resolve(__dirname, 'src/main'),
    },
  },
})
```

- [ ] **Step 4: Wire scripts in `package.json`**

Ensure scripts include:

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 5: Minimal window + hello UI**

`src/main/index.ts` creates a `BrowserWindow` loading the renderer; `App.tsx` shows title「套图库」.

- [ ] **Step 6: Verify**

Run: `npm test`  
Expected: PASS (0 tests OK) or skip if no tests yet — then `npm run dev` opens a window with「套图库」.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json electron.vite.config.ts tsconfig.json tsconfig.node.json vitest.config.ts src
git commit -m "chore: scaffold Electron React TypeScript app with vitest"
```

---

### Task 2: Shared adapter types + sanitize + URL helpers

**Files:**
- Create: `src/main/adapters/types.ts`, `src/main/library/sanitize.ts`, `src/main/adapters/xchina/urls.ts`
- Test: `tests/library/sanitize.test.ts`, `tests/adapters/xchina-urls.test.ts`

**Interfaces:**
- Produces:
  - `sanitizeFolderName(name: string): string`
  - `extractXchinaId(url: string): string | null`
  - `normalizeXchinaGalleryUrl(url: string): string | null`
  - `buildXchinaPageUrl(galleryId: string, page: number): string`
  - types `SourceAdapter`, `GalleryParseResult`, `ParseContext`, `ParsedImage`

- [ ] **Step 1: Write failing sanitize tests**

```ts
// tests/library/sanitize.test.ts
import { describe, it, expect } from 'vitest'
import { sanitizeFolderName } from '@main/library/sanitize'

describe('sanitizeFolderName', () => {
  it('strips illegal path characters', () => {
    expect(sanitizeFolderName('a/b:c*?"<>|')).toBe('a_b_c_____')
  })
  it('trims and collapses whitespace', () => {
    expect(sanitizeFolderName('  咬一口  兔兔  ')).toBe('咬一口 兔兔')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -- tests/library/sanitize.test.ts`  
Expected: FAIL module not found / export missing

- [ ] **Step 3: Implement sanitize**

```ts
// src/main/library/sanitize.ts
export function sanitizeFolderName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
}
```

- [ ] **Step 4: Write failing xchina URL tests**

```ts
// tests/adapters/xchina-urls.test.ts
import { describe, it, expect } from 'vitest'
import {
  extractXchinaId,
  normalizeXchinaGalleryUrl,
  buildXchinaPageUrl,
} from '@main/adapters/xchina/urls'

describe('xchina urls', () => {
  it('extracts id from canonical and paged urls', () => {
    expect(extractXchinaId('https://xchina.co/photo/id-63c799bf45baf.html')).toBe(
      '63c799bf45baf',
    )
    expect(extractXchinaId('https://xchina.co/photo/id-63c799bf45baf/2.html')).toBe(
      '63c799bf45baf',
    )
  })
  it('returns null for unknown hosts', () => {
    expect(extractXchinaId('https://example.com/photo/id-abc.html')).toBeNull()
  })
  it('builds page urls', () => {
    expect(buildXchinaPageUrl('63c799bf45baf', 1)).toBe(
      'https://xchina.co/photo/id-63c799bf45baf/1.html',
    )
  })
  it('normalizes to gallery base', () => {
    expect(normalizeXchinaGalleryUrl('https://xchina.co/photo/id-63c799bf45baf/3.html')).toBe(
      'https://xchina.co/photo/id-63c799bf45baf.html',
    )
  })
})
```

- [ ] **Step 5: Implement types + urls**

```ts
// src/main/adapters/types.ts
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
```

```ts
// src/main/adapters/xchina/urls.ts
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
```

- [ ] **Step 6: Run tests — expect PASS**

Run: `npm test -- tests/library/sanitize.test.ts tests/adapters/xchina-urls.test.ts`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/main/adapters src/main/library/sanitize.ts tests
git commit -m "feat: add adapter types, sanitize, and xchina URL helpers"
```

---

### Task 3: xChina page parser (fixture-driven)

**Files:**
- Create: `fixtures/xchina/page1.html`, `fixtures/xchina/page2.html`, `src/main/adapters/xchina/parsePage.ts`
- Test: `tests/adapters/xchina-parsePage.test.ts`

**Interfaces:**
- Consumes: cheerio
- Produces: `parseXchinaPage(html: string, pageUrl: string): XchinaPageParse`  
  where page parse includes `title`, `author`, `tags`, `pageCount`, `images: { thumbOrLink: string; originalCandidate: string }[]` (ads excluded)

**Note:** Before locking selectors, open a saved real HTML snapshot (or fetch once manually into fixtures). Adjust selectors to real DOM; tests must use fixtures checked into repo — never live network in unit tests.

- [ ] **Step 1: Capture fixtures**

Manually save simplified but realistic HTML into fixtures that include:
- title text
- tags / author
- pagination showing pages 1–2
- 3 photo items with `<a href="ORIGINAL">` wrapping `<img src="THUMB">`
- 1 ad block with distinct class/markup (must be ignored)

- [ ] **Step 2: Write failing parser tests**

```ts
// tests/adapters/xchina-parsePage.test.ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { parseXchinaPage } from '@main/adapters/xchina/parsePage'

const fix = (name: string) =>
  readFileSync(path.join(__dirname, '../../fixtures/xchina', name), 'utf8')

describe('parseXchinaPage', () => {
  it('reads metadata and skips ads on page 1', () => {
    const r = parseXchinaPage(fix('page1.html'), 'https://xchina.co/photo/id-63c799bf45baf/1.html')
    expect(r.title.length).toBeGreaterThan(0)
    expect(r.pageCount).toBeGreaterThanOrEqual(2)
    expect(r.images.length).toBeGreaterThanOrEqual(1)
    expect(r.images.every((i) => !/ad|promo|妻社/i.test(i.originalCandidate))).toBe(true)
  })
})
```

- [ ] **Step 3: Run — expect FAIL**

Run: `npm test -- tests/adapters/xchina-parsePage.test.ts`  
Expected: FAIL

- [ ] **Step 4: Implement `parseXchinaPage`**

Implement in `src/main/adapters/xchina/parsePage.ts` using cheerio:
- Prefer original from wrapping `<a href>` if it looks like an image URL; else upgrade known thumb path patterns; else `data-src` / `src`
- Exclude nodes inside obvious ad containers (class/id keywords or fixture markers)
- Detect `pageCount` from pagination links’ max number

Keep selectors in one file for easy hotfixes when the site changes.

- [ ] **Step 5: Run — expect PASS**

Run: `npm test -- tests/adapters/xchina-parsePage.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add fixtures/xchina src/main/adapters/xchina/parsePage.ts tests/adapters/xchina-parsePage.test.ts
git commit -m "feat: parse xchina gallery pages from HTML fixtures"
```

---

### Task 4: Adapter registry + xChina `parseGallery`

**Files:**
- Create: `src/main/adapters/registry.ts`, `src/main/adapters/xchina/adapter.ts`, `src/main/downloader/fetchHtml.ts`
- Test: `tests/adapters/registry.test.ts`

**Interfaces:**
- Produces:
  - `fetchHtml(url: string, init?: RequestInit): Promise<string>`
  - `xchinaAdapter: SourceAdapter`
  - `registerAdapter(adapter: SourceAdapter): void`
  - `resolveAdapter(url: string): SourceAdapter | null`
  - `listAdapters(): SourceAdapter[]`

- [ ] **Step 1: Write registry tests**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { clearAdapters, registerAdapter, resolveAdapter } from '@main/adapters/registry'
import type { SourceAdapter } from '@main/adapters/types'

const fake: SourceAdapter = {
  id: 'fake',
  name: 'Fake',
  match: (u) => u.includes('fake.test'),
  parseGallery: async () => {
    throw new Error('not used')
  },
}

describe('registry', () => {
  beforeEach(() => clearAdapters())
  it('resolves matching adapter', () => {
    registerAdapter(fake)
    expect(resolveAdapter('https://fake.test/a')?.id).toBe('fake')
  })
  it('returns null when unsupported', () => {
    expect(resolveAdapter('https://nope.example/')).toBeNull()
  })
})
```

- [ ] **Step 2: Implement registry + fetchHtml + xchina adapter**

`xchinaAdapter.parseGallery`:
1. `extractXchinaId` or throw
2. fetch page 1 via `ctx.fetchText(buildXchinaPageUrl(id, 1))`
3. `parseXchinaPage` → get `pageCount`, metadata, images
4. loop pages 2..N, append images, reindex `index` from 1
5. return `GalleryParseResult` with `source: 'xchina'`, `sourceUrl: normalize...`

Default headers in `fetchHtml`: browser-like `User-Agent`, `Accept-Language`.

- [ ] **Step 3: Run registry tests PASS; optionally unit-test adapter with mocked `fetchText` returning fixtures**

- [ ] **Step 4: Commit**

```bash
git add src/main/adapters src/main/downloader/fetchHtml.ts tests/adapters/registry.test.ts
git commit -m "feat: adapter registry and xchina parseGallery"
```

---

### Task 5: Library store (paths, metadata, index)

**Files:**
- Create: `src/main/library/paths.ts`, `src/main/library/store.ts`
- Test: `tests/library/store.test.ts` (use `os.tmpdir()`)

**Interfaces:**
- Produces:
  - `galleryFolderName(source, id, title): string` → `{source}_{id}_{sanitizedTitle}`
  - `LibraryStore` with:
    - `constructor(rootDir: string)`
    - `async loadIndex(): Promise<LibraryIndexEntry[]>`
    - `async rebuildIndex(): Promise<LibraryIndexEntry[]>`
    - `async getGallery(source, id): Promise<GalleryMetadata | null>`
    - `async upsertGallery(meta: GalleryMetadata): Promise<void>`
    - `async galleryExists(source, id): Promise<boolean>`
    - `resolveGalleryDir(source, id, title): string`
    - `search(query: string): Promise<LibraryIndexEntry[]>` (title/tags/author substring, case-insensitive)

```ts
export interface GalleryMetadata {
  source: string
  galleryId: string
  title: string
  sourceUrl: string
  author: string
  tags: string[]
  pageCount: number
  cover: string | null
  images: string[]
  downloadedAt: string
}

export interface LibraryIndexEntry {
  source: string
  galleryId: string
  title: string
  author: string
  tags: string[]
  cover: string | null
  imageCount: number
  dirName: string
  downloadedAt: string
}
```

- [ ] **Step 1: Write failing store tests** (tmpdir, write metadata, search by tag, rebuild)

- [ ] **Step 2: Implement paths + store**  
  Persist `library.json` at root; each gallery dir has `metadata.json`.  
  Image files named `001.jpg` etc. are written by downloader later — store only records relative paths.

- [ ] **Step 3: Tests PASS → Commit**

```bash
git commit -m "feat: local library index and metadata store"
```

---

### Task 6: File downloader + downloadGallery pipeline

**Files:**
- Create: `src/main/downloader/downloadFile.ts`, `src/main/downloader/downloadGallery.ts`
- Test: `tests/downloader/downloadFile.test.ts` (mock fetch with local buffers) optional; prefer integration-style with `nock` or manual mock of global fetch

**Interfaces:**
- Produces:
  - `downloadFile(url, destPath, opts): Promise<{ bytes: number; contentType: string | null }>`
  - `downloadGallery(result: GalleryParseResult, store: LibraryStore, opts): Promise<GalleryMetadata>`
  - `opts`: `{ concurrency: number; signal?: AbortSignal; onProgress?: (p) => void; overwrite?: boolean }`
  - If `galleryExists` && !overwrite → throw `GalleryExistsError` (queue will mark skipped)

Behavior:
- Create folder via `galleryFolderName`
- Download images with concurrency limit (simple pool)
- Pad index: `String(i).padStart(3,'0')` + extension from URL or content-type
- Write `cover` as first image path or separate download of `coverUrl`
- `upsertGallery` when done
- Retry each file up to 3 times with exponential backoff on network / 429 / 403

- [ ] **Step 1: Implement download helpers with retries**
- [ ] **Step 2: Implement `downloadGallery`**
- [ ] **Step 3: Manual or unit test with mocked fetch returning tiny JPEG bytes**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat: download gallery originals into library folders"
```

---

### Task 7: Download queue

**Files:**
- Create: `src/main/queue/types.ts`, `src/main/queue/downloadQueue.ts`
- Test: `tests/queue/downloadQueue.test.ts`

**Interfaces:**
- Produces `DownloadQueue` class:
  - `enqueue(urls: string[]): QueueTask[]`
  - `cancel(taskId: string): void`
  - `pause()` / `resume()`
  - `on('progress' | 'task' | 'idle', handler)`
  - Task states: `queued | resolving | downloading | completed | failed | skipped | cancelled`

Each task:
1. `resolveAdapter(url)` — fail with「暂不支持该来源」if null
2. `parseGallery`
3. `downloadGallery` (respect exists → skipped)
4. Emit progress `{ taskId, status, page?, done, total, error? }`

Galleries processed **one at a time**; image concurrency from settings.

- [ ] **Step 1: Write queue tests with fake adapter registered** (no network)
- [ ] **Step 2: Implement queue**
- [ ] **Step 3: PASS → Commit**

```bash
git commit -m "feat: serial gallery download queue with progress events"
```

---

### Task 8: Settings + IPC + preload API

**Files:**
- Create: `src/main/settings.ts`, `src/main/ipc.ts`
- Modify: `src/main/index.ts`, `src/preload/index.ts`
- Create: `src/renderer/lib/api.ts`, `src/renderer/env.d.ts`

**Interfaces (preload `window.api`):**

```ts
interface GalleryApi {
  getSettings(): Promise<AppSettings>
  setSettings(partial: Partial<AppSettings>): Promise<AppSettings>
  pickDownloadRoot(): Promise<string | null>
  listLibrary(query?: string): Promise<LibraryIndexEntry[]>
  getGallery(source: string, id: string): Promise<GalleryMetadata | null>
  rebuildLibrary(): Promise<LibraryIndexEntry[]>
  enqueueUrls(urls: string[]): Promise<QueueTask[]>
  cancelTask(taskId: string): Promise<void>
  listTasks(): Promise<QueueTask[]>
  onQueueUpdate(cb: (tasks: QueueTask[]) => void): () => void
  getMediaUrl(dirName: string, relativePath: string): string // custom protocol or file URL helper
}

interface AppSettings {
  downloadRoot: string
  imageConcurrency: number
  openAfterDownload: boolean
}
```

Use `ipcMain.handle` for invokes; `webContents.send('queue:update', tasks)` for push.  
Register `gallery-media://` protocol (or `protocol.handle`) mapping into `downloadRoot` safely (path traversal guard).

- [ ] **Step 1: Implement settings load/save under `app.getPath('userData')/settings.json`**
- [ ] **Step 2: Wire ipc + preload contextBridge**
- [ ] **Step 3: Boot queue + register `xchinaAdapter` in `src/main/index.ts`**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat: settings and IPC bridge for library and queue"
```

---

### Task 9: Renderer — Library + Gallery + Lightbox

**Files:**
- Create/modify: `src/renderer/App.tsx`, `pages/LibraryPage.tsx`, `pages/GalleryPage.tsx`, `components/GalleryCard.tsx`, `components/Lightbox.tsx`, `styles.css`

**Behavior:**
- Routes via simple React state or `react-router` (optional; state routing is fine for v1)
- Library: search input → `api.listLibrary(query)` → cards
- Gallery: thumb grid from `getGallery`; click opens Lightbox
- Lightbox: `←` `→` `Esc` `F` (fullscreen via `document.documentElement.requestFullscreen`)

- [ ] **Step 1: Build LibraryPage + GalleryCard**
- [ ] **Step 2: Build GalleryPage + Lightbox with keyboard handlers**
- [ ] **Step 3: Manual check in `npm run dev` with a hand-made sample gallery folder**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat: library browse UI with lightbox keyboard navigation"
```

---

### Task 10: Renderer — Download panel + Settings

**Files:**
- Create: `src/renderer/pages/DownloadPage.tsx`, `src/renderer/pages/SettingsPage.tsx`
- Modify: `App.tsx` nav

**DownloadPage:**
- Textarea for multi URL (split on `/[\n,]+/`)
- Button「开始下载」→ `enqueueUrls`
- Live task list from `onQueueUpdate` / `listTasks`
- Show status + `done/total` + error text
- Cancel button per task

**SettingsPage:**
- Show/edit download root (`pickDownloadRoot`)
- Image concurrency number input
- Checkbox open after download
- Button「重建索引」→ `rebuildLibrary`

- [ ] **Step 1: Implement DownloadPage**
- [ ] **Step 2: Implement SettingsPage**
- [ ] **Step 3: Nav between 库 / 下载 / 设置**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat: download queue panel and settings UI"
```

---

### Task 11: End-to-end verification against acceptance criteria

**Files:**
- Possibly fix selectors in `parsePage.ts` after live probe
- Create: `README.md` with run instructions only (no extra docs)

- [ ] **Step 1: Live probe** — with `npm run dev`, enqueue  
  `https://xchina.co/photo/id-63c799bf45baf.html`  
  Confirm multi-page parse, originals (file sizes ≫ thumbs), ads skipped, folder `xchina_{id}_{title}`

- [ ] **Step 2: Enqueue unsupported URL** — expect「暂不支持该来源」

- [ ] **Step 3: Enqueue two URLs** — second waits; progress updates; library search works

- [ ] **Step 4: Kill network mid-download** — task shows errors, app stays up

- [ ] **Step 5: Fix any selector/path issues discovered; update fixtures if needed**

- [ ] **Step 6: Commit**

```bash
git commit -m "fix: harden xchina parsing and document how to run"
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Electron + React desktop | 1, 9–10 |
| Source adapter + registry | 2, 4 |
| xChina multi-page + originals + skip ads | 3, 4, 6, 11 |
| Multi-URL queue + progress | 7, 10 |
| `{source}_{id}_{title}` + metadata | 5, 6 |
| Library search title/tags/author | 5, 9 |
| Lightbox + keyboard + fullscreen | 9 |
| Settings root/concurrency/open-after | 8, 10 |
| Unsupported source message | 7, 10 |
| Skip existing / rebuild index | 6, 7, 10 |
| No Playwright / no login | Global — not implemented |

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-08-08-gallery-downloader-viewer.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with checkpoints  

Which approach?
