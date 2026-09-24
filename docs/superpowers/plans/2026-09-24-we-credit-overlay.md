# WE Credit Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Wallpaper Engine 轮播画面左上角以杂志/胶片风格显示作者头像、作者名、套图名，并由 WE 属性控制显示模式（默认常驻）。

**Architecture:** 同步时把 `author` / `avatar` 写入 `playlist.json`；头像走现有 `/media/`（图库根下 `.author-avatars/`）；在 `templateFiles.ts` 的 HTML/CSS/`main.js` 增加 `#credit` 层与 `infooverlay` 属性。

**Tech Stack:** TypeScript（Electron main）、Wallpaper Engine Web（CEF）、Vitest、现有 `LibraryStore` / `AuthorAvatarStore` / `syncWallpaperEngineProject`。

**Spec:** `docs/superpowers/specs/2026-09-24-we-credit-overlay-design.md`

## Global Constraints

- 仅改 WE 播放 overlay，不改 Electron 灯箱 / 详情页
- 视觉：杂志/胶片署名；无厚重毛玻璃底板；暖纸白 `#f4f1ea` + 文字阴影
- WE 属性 `Info overlay`：`always`（默认）/ `fade`（换套显示 4s）/ `hidden`
- 无头像：作者首字圆形占位；无作者：显示「未知作者」
- 头像不新增 HTTP 路由；`avatar` 为空则不请求
- 用户未明确要求时不要 `git commit`（计划里的 Commit 步可跳过或等用户吩咐）

---

## File map

| 文件 | 职责 |
|------|------|
| `src/main/wallpaper/templateFiles.ts` | `#credit` DOM/CSS；`infooverlay`；`updateCredit` 与属性监听 |
| `src/main/wallpaper/exportWallpaper.ts` | `WallpaperPlaylistGallery` 扩展；导出 author/avatar |
| `src/main/ipc.ts` | `runWallpaperSync` / `wallpaper:installStartup` 传入 AvatarStore |
| `scripts/sync-wallpaper.ts` | CLI sync 传入 AvatarStore |
| `tests/wallpaper/credit-overlay.test.ts` | 模板 + project.json 断言（新建） |
| `tests/wallpaper/export-credit.test.ts` | 导出 author/avatar 集成测（新建） |

---

### Task 1: WE 属性 + `#credit` 壳（HTML/CSS）

**Files:**
- Modify: `src/main/wallpaper/templateFiles.ts`（`buildProjectJson`、`INDEX_HTML`）
- Test: `tests/wallpaper/credit-overlay.test.ts`（创建）

**Interfaces:**
- Produces: `project.general.properties.infooverlay`；DOM `#credit` 与 `.credit*` 样式类名（供 Task 2 的 JS 使用）

- [ ] **Step 1: 写失败测试**

创建 `tests/wallpaper/credit-overlay.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { INDEX_HTML, MAIN_JS, buildProjectJson } from '@main/wallpaper/templateFiles'

describe('WE credit overlay shell', () => {
  it('adds Info overlay combo defaulting to always', () => {
    const project = JSON.parse(buildProjectJson([])) as {
      general: {
        properties: Record<
          string,
          { type: string; value: string; options?: { value: string }[]; order?: number }
        >
      }
    }
    const prop = project.general.properties.infooverlay
    expect(prop).toBeTruthy()
    expect(prop.type).toBe('combo')
    expect(prop.value).toBe('always')
    expect(prop.options?.map((o) => o.value)).toEqual(['always', 'fade', 'hidden'])
  })

  it('renders credit markup and magazine styles', () => {
    expect(INDEX_HTML).toContain('id="credit"')
    expect(INDEX_HTML).toContain('credit-avatar')
    expect(INDEX_HTML).toContain('credit-author')
    expect(INDEX_HTML).toContain('credit-title')
    expect(INDEX_HTML).toContain('credit-rule')
    expect(INDEX_HTML).toContain('#f4f1ea')
    expect(INDEX_HTML).toContain('.credit.is-visible')
    expect(INDEX_HTML).not.toContain('backdrop-filter')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/wallpaper/credit-overlay.test.ts`

Expected: FAIL（缺少 `infooverlay` / `#credit`）

- [ ] **Step 3: 实现 `buildProjectJson` 属性**

在 `buildProjectJson` 的 `general.properties` 中、`cutduration` 之后加入：

```js
infooverlay: {
  order: 8,
  text: 'Info overlay',
  type: 'combo',
  value: 'always',
  options: [
    { label: 'Always on', value: 'always' },
    { label: 'On gallery change', value: 'fade' },
    { label: 'Hidden', value: 'hidden' },
  ],
},
```

- [ ] **Step 4: 实现 `INDEX_HTML` 署名层**

1. 把 `html, body` 的 `font-family` 改为：
   `"Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`
2. 在 `#status` 样式后增加（数值按 spec）：

```css
#credit {
  position: fixed;
  top: 28px;
  left: 32px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 14px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 400ms ease;
  max-width: calc(100vw - 64px);
}
#credit.is-visible { opacity: 1; }
#credit .credit-avatar {
  position: relative;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.35);
  overflow: hidden;
  background: rgba(255, 255, 255, 0.12);
}
#credit .credit-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: none;
}
#credit .credit-avatar.has-image .credit-avatar-img { display: block; }
#credit .credit-avatar.has-image .credit-avatar-fallback { display: none; }
#credit .credit-avatar-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: #f4f1ea;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.75);
}
#credit .credit-rule {
  width: 1px;
  height: 36px;
  flex: 0 0 1px;
  background: rgba(255, 255, 255, 0.28);
}
#credit .credit-text { min-width: 0; }
#credit .credit-author {
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0.12em;
  opacity: 0.72;
  color: #f4f1ea;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.75), 0 0 18px rgba(0, 0, 0, 0.45);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: min(36vw, 420px);
}
#credit .credit-title {
  margin-top: 2px;
  font-size: 16px;
  font-weight: 600;
  opacity: 0.95;
  color: #f4f1ea;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.75), 0 0 18px rgba(0, 0, 0, 0.45);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: min(36vw, 420px);
}
```

3. 在 `<body>` 内 `#status` 旁加入：

```html
<div id="credit" class="credit" aria-hidden="true">
  <div class="credit-avatar">
    <img class="credit-avatar-img" alt="" />
    <span class="credit-avatar-fallback"></span>
  </div>
  <div class="credit-rule"></div>
  <div class="credit-text">
    <div class="credit-author"></div>
    <div class="credit-title"></div>
  </div>
</div>
```

注意：`INDEX_HTML` 里不要出现 `backdrop-filter`（署名层）；stage 原有样式保持不动。测试里 `not.toContain('backdrop-filter')` 会扫整份 HTML——若历史模板已有则改为断言 `#credit` 块内无 backdrop（可改为 `expect(INDEX_HTML).toMatch(/#credit\{[^}]*\}/)` 不含 backdrop，或断言 `credit` 相关 CSS 片段不含）。**更稳妥：** 把测试改成：

```ts
const creditCssStart = INDEX_HTML.indexOf('#credit')
expect(creditCssStart).toBeGreaterThan(-1)
const creditCss = INDEX_HTML.slice(creditCssStart, creditCssStart + 2500)
expect(creditCss).not.toContain('backdrop-filter')
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run tests/wallpaper/credit-overlay.test.ts`

Expected: PASS

- [ ] **Step 6: Commit（仅当用户要求时）**

```bash
git add tests/wallpaper/credit-overlay.test.ts src/main/wallpaper/templateFiles.ts
git commit -m "$(cat <<'EOF'
feat(wallpaper): add credit overlay shell and Info overlay property

EOF
)"
```

---

### Task 2: `main.js` 署名逻辑与属性监听

**Files:**
- Modify: `src/main/wallpaper/templateFiles.ts`（`MAIN_JS`）
- Modify: `tests/wallpaper/credit-overlay.test.ts`（追加用例）

**Interfaces:**
- Consumes: `#credit` DOM；`mediaUrl()`（已有，约 L276）；gallery 对象将含 `author`/`avatar`（Task 3）
- Produces: `state.infoOverlay`；`updateCredit(g)`；`applyUserProperties` 读 `infooverlay`

- [ ] **Step 1: 写失败测试（追加到同一文件）**

```ts
describe('WE credit overlay runtime wiring', () => {
  it('defines updateCredit and infoOverlay state', () => {
    expect(MAIN_JS).toContain('infoOverlay')
    expect(MAIN_JS).toContain('updateCredit')
    expect(MAIN_JS).toContain('properties.infooverlay')
    expect(MAIN_JS).toContain('creditFadeTimer')
    expect(MAIN_JS).toContain('未知作者')
  })

  it('calls updateCredit when a gallery starts', () => {
    expect(MAIN_JS).toContain('updateCredit(g)')
  })
})
```

- [ ] **Step 2: 跑测确认失败**

Run: `npx vitest run tests/wallpaper/credit-overlay.test.ts`

Expected: FAIL（缺字符串）

- [ ] **Step 3: 在 `MAIN_JS` 的 `state` 中增加字段**

在现有 `state = { ... }` 内加入：

```js
infoOverlay: 'always',
creditFadeTimer: null,
```

在文件顶部 DOM 引用旁增加：

```js
const creditEl = document.getElementById('credit');
const creditAvatarEl = creditEl && creditEl.querySelector('.credit-avatar');
const creditImgEl = creditEl && creditEl.querySelector('.credit-avatar-img');
const creditFallbackEl = creditEl && creditEl.querySelector('.credit-avatar-fallback');
const creditAuthorEl = creditEl && creditEl.querySelector('.credit-author');
const creditTitleEl = creditEl && creditEl.querySelector('.credit-title');
```

- [ ] **Step 4: 实现 `updateCredit` / 显隐辅助函数**

放在 `setStatus` 附近：

```js
function creditInitial(author) {
  const s = String(author || '').trim();
  return s ? s.charAt(0) : '?';
}

function clearCreditFadeTimer() {
  if (state.creditFadeTimer) {
    clearTimeout(state.creditFadeTimer);
    state.creditFadeTimer = null;
  }
}

function setCreditVisible(on) {
  if (!creditEl) return;
  if (on) {
    creditEl.classList.add('is-visible');
    creditEl.setAttribute('aria-hidden', 'false');
  } else {
    creditEl.classList.remove('is-visible');
    creditEl.setAttribute('aria-hidden', 'true');
  }
}

function applyCreditVisibility(galleryChanged) {
  const mode = state.infoOverlay || 'always';
  clearCreditFadeTimer();
  if (mode === 'hidden') {
    setCreditVisible(false);
    return;
  }
  if (mode === 'always') {
    setCreditVisible(true);
    return;
  }
  // fade
  if (galleryChanged) {
    setCreditVisible(true);
    state.creditFadeTimer = setTimeout(function () {
      state.creditFadeTimer = null;
      if (state.infoOverlay === 'fade') setCreditVisible(false);
    }, 4000);
  }
}

function updateCredit(g, galleryChanged) {
  if (!creditEl || !creditAuthorEl || !creditTitleEl) return;
  const changed = galleryChanged !== false;
  const authorRaw = g && g.author != null ? String(g.author) : '';
  const author = authorRaw.trim() || '未知作者';
  const title = (g && (g.title || g.id)) || '';
  creditAuthorEl.textContent = author;
  creditTitleEl.textContent = title;

  const mode = state.infoOverlay || 'always';
  const avatarPath = g && g.avatar ? String(g.avatar).replace(/\\\\/g, '/').replace(/^\\/+/, '') : '';

  function showFallback() {
    if (creditImgEl) {
      creditImgEl.removeAttribute('src');
      creditImgEl.onload = null;
      creditImgEl.onerror = null;
    }
    if (creditAvatarEl) creditAvatarEl.classList.remove('has-image');
    if (creditFallbackEl) creditFallbackEl.textContent = creditInitial(authorRaw.trim() ? authorRaw : '');
  }

  if (mode === 'hidden' || !avatarPath) {
    showFallback();
  } else if (creditImgEl && creditAvatarEl) {
    creditImgEl.onload = function () {
      creditAvatarEl.classList.add('has-image');
    };
    creditImgEl.onerror = function () {
      showFallback();
    };
    creditImgEl.src = mediaUrl(avatarPath);
  }

  applyCreditVisibility(changed);
}
```

注意：`MAIN_JS` 是 `String.raw`——反斜杠要按现有文件习惯转义。`avatarPath` 规范化写成：

```js
const avatarPath = g && g.avatar ? String(g.avatar).split('\\\\').join('/').replace(/^\\/+/, '') : '';
```

在 `String.raw` 里更安全的写法是只用正斜杠假设（导出已规范）：

```js
const avatarPath = g && g.avatar ? String(g.avatar).trim() : '';
```

- [ ] **Step 5: 在选中套图处调用**

在 `runLoop` 里 `state.gallery = g` / `setStatus('[pool]…')` 附近加入：

```js
updateCredit(g, true);
```

空池分支在继续循环前可 `updateCredit({ author: '', title: '', avatar: '' }, true)` 并 `setCreditVisible(false)`——或简单 `setCreditVisible(false)`。推荐空池时：

```js
setCreditVisible(false);
clearCreditFadeTimer();
```

- [ ] **Step 6: `applyUserProperties` 接 `infooverlay`**

在现有 `applyUserProperties` 内增加：

```js
if (properties.infooverlay && properties.infooverlay.value !== undefined && properties.infooverlay.value !== null) {
  const v = String(properties.infooverlay.value);
  state.infoOverlay = (v === 'fade' || v === 'hidden' || v === 'always') ? v : 'always';
  if (state.gallery) updateCredit(state.gallery, true);
  else if (state.infoOverlay === 'hidden') setCreditVisible(false);
}
```

- [ ] **Step 7: 跑测通过 + 旧模板测不回归**

Run:

```bash
npx vitest run tests/wallpaper/credit-overlay.test.ts tests/wallpaper/zoomThrough.test.ts tests/wallpaper/exhaustion.test.ts
```

Expected: PASS

- [ ] **Step 8: Commit（仅当用户要求时）**

```bash
git add src/main/wallpaper/templateFiles.ts tests/wallpaper/credit-overlay.test.ts
git commit -m "$(cat <<'EOF'
feat(wallpaper): wire credit overlay updates and Info overlay modes

EOF
)"
```

---

### Task 3: 导出 `author` / `avatar` 到 `playlist.json`

**Files:**
- Modify: `src/main/wallpaper/exportWallpaper.ts`
- Test: `tests/wallpaper/export-credit.test.ts`（创建）

**Interfaces:**
- Consumes: `LibraryStore`；可选 `avatarStore: Pick<AuthorAvatarStore, 'list'>`（或全量 `AuthorAvatarStore`）
- Produces: `WallpaperPlaylistGallery.author: string`；`.avatar: string`（正斜杠相对路径或 `""`）

- [ ] **Step 1: 写失败测试**

创建 `tests/wallpaper/export-credit.test.ts`：

```ts
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryStore } from '@main/library/store'
import { AuthorAvatarStore } from '@main/library/authorAvatars'
import { syncWallpaperEngineProject } from '@main/wallpaper/exportWallpaper'

const dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

const tinyJpegBase64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQACEQADAP/Z'

describe('syncWallpaperEngineProject credit fields', () => {
  it('writes author and avatar path when avatar exists', async () => {
    const root = await mkdtemp(join(tmpdir(), 'we-credit-lib-'))
    const weDir = await mkdtemp(join(tmpdir(), 'we-credit-we-'))
    dirs.push(root, weDir)

    const store = new LibraryStore(root)
    await store.ensureRoot()
    await store.upsertGallery({
      source: 'xchina',
      galleryId: 'abc',
      title: '源标题',
      sourceUrl: 'https://example.com/a',
      author: '模特A',
      tags: [],
      pageCount: 1,
      cover: '001.jpg',
      images: ['001.jpg'],
      downloadedAt: '2026-09-24T00:00:00.000Z',
    })
    await store.renameGallery('xchina', 'abc', '显示名')

    const dirName = (await store.loadIndex())[0]!.dirName
    await mkdir(join(root, dirName), { recursive: true })
    await writeFile(join(root, dirName, '001.jpg'), 'x')

    const avatars = new AuthorAvatarStore(root)
    const record = await avatars.set('模特A', {
      source: 'xchina',
      galleryId: 'abc',
      dirName,
      imagePath: '001.jpg',
      crop: { x: 0, y: 0, width: 1, height: 1 },
      avatarJpegBase64: tinyJpegBase64,
    })

    await syncWallpaperEngineProject(store, weDir, 17989, undefined, avatars)

    const playlist = JSON.parse(await readFile(join(weDir, 'playlist.json'), 'utf8')) as {
      galleries: { title: string; author: string; avatar: string }[]
    }
    expect(playlist.galleries).toHaveLength(1)
    expect(playlist.galleries[0]!.title).toBe('显示名')
    expect(playlist.galleries[0]!.author).toBe('模特A')
    expect(playlist.galleries[0]!.avatar).toBe(record.relativePath.replace(/\\/g, '/'))
  })

  it('writes empty avatar and author when missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'we-credit-lib2-'))
    const weDir = await mkdtemp(join(tmpdir(), 'we-credit-we2-'))
    dirs.push(root, weDir)

    const store = new LibraryStore(root)
    await store.ensureRoot()
    await store.upsertGallery({
      source: 'local',
      galleryId: 'n1',
      title: '无作者',
      sourceUrl: '',
      author: '',
      tags: [],
      pageCount: 1,
      cover: '001.jpg',
      images: ['001.jpg'],
      downloadedAt: '2026-09-24T00:00:00.000Z',
    })
    const dirName = (await store.loadIndex())[0]!.dirName
    await mkdir(join(root, dirName), { recursive: true })
    await writeFile(join(root, dirName, '001.jpg'), 'x')

    await syncWallpaperEngineProject(store, weDir, 17989, undefined, new AuthorAvatarStore(root))

    const playlist = JSON.parse(await readFile(join(weDir, 'playlist.json'), 'utf8')) as {
      galleries: { author: string; avatar: string }[]
    }
    expect(playlist.galleries[0]!.author).toBe('')
    expect(playlist.galleries[0]!.avatar).toBe('')
  })
})
```

若 `upsertGallery` 已写目录/文件，可去掉多余 `mkdir`/`writeFile`；以测试能绿为准。头像 `set` 需要源图存在，故 `001.jpg` 必须真实存在。

- [ ] **Step 2: 跑测确认失败**

Run: `npx vitest run tests/wallpaper/export-credit.test.ts`

Expected: FAIL（参数数量 / 缺字段）

- [ ] **Step 3: 扩展类型与 `syncWallpaperEngineProject` 签名**

```ts
import { authorKey, type AuthorAvatarStore } from '../library/authorAvatars'

export interface WallpaperPlaylistGallery {
  id: string
  title: string
  author: string
  avatar: string
  favorite: boolean
  images: string[]
}

export async function syncWallpaperEngineProject(
  store: LibraryStore,
  wallpaperDir: string,
  mediaPort: number = DEFAULT_MEDIA_PORT,
  playlistStore?: PlaylistStore,
  avatarStore?: Pick<AuthorAvatarStore, 'list'>,
): Promise<SyncWallpaperResult> {
```

在构建 galleries 循环前：

```ts
const avatarByKey = new Map<string, string>()
if (avatarStore) {
  for (const rec of await avatarStore.list()) {
    avatarByKey.set(authorKey(rec.author), rec.relativePath.replace(/\\/g, '/'))
  }
}
```

在 `galleries.push` 处：

```ts
const author = (meta.author || entry.author || '').trim()
const avatar = author ? avatarByKey.get(authorKey(author)) || '' : ''
galleries.push({
  id,
  title,
  author,
  avatar,
  favorite: Boolean(meta.favorite ?? entry.favorite),
  images,
})
```

- [ ] **Step 4: 跑测通过**

Run: `npx vitest run tests/wallpaper/export-credit.test.ts`

Expected: PASS

- [ ] **Step 5: Commit（仅当用户要求时）**

```bash
git add src/main/wallpaper/exportWallpaper.ts tests/wallpaper/export-credit.test.ts
git commit -m "$(cat <<'EOF'
feat(wallpaper): export author and avatar into playlist.json

EOF
)"
```

---

### Task 4: 接线 IPC 与 CLI sync

**Files:**
- Modify: `src/main/ipc.ts`（两处 `syncWallpaperEngineProject` 调用）
- Modify: `scripts/sync-wallpaper.ts`

**Interfaces:**
- Consumes: Task 3 的第五参 `avatarStore`
- Produces: 自动同步 / 手动同步 / CLI 均带上头像数据

- [ ] **Step 1: 改 `runWallpaperSync`**

```ts
const result = await syncWallpaperEngineProject(
  store,
  settings.wallpaperEngineDir,
  settings.wallpaperMediaPort || DEFAULT_MEDIA_PORT,
  playlistStore,
  authorAvatarStore,
)
```

- [ ] **Step 2: 改 `wallpaper:installStartup` 内同步调用**（同样传入 `authorAvatarStore`）

- [ ] **Step 3: 改 `scripts/sync-wallpaper.ts`**

```ts
import { AuthorAvatarStore } from '../src/main/library/authorAvatars'
// ...
const avatars = new AuthorAvatarStore(root)
const result = await syncWallpaperEngineProject(store, weDir, 17989, playlists, avatars)
```

- [ ] **Step 4: 全量 wallpaper 相关测试**

Run:

```bash
npx vitest run tests/wallpaper/
```

Expected: 全部 PASS

- [ ] **Step 5: Commit（仅当用户要求时）**

```bash
git add src/main/ipc.ts scripts/sync-wallpaper.ts
git commit -m "$(cat <<'EOF'
feat(wallpaper): pass author avatars into wallpaper sync

EOF
)"
```

---

### Task 5: 手动验收清单（实现后勾选）

- [ ] 应用内「立即同步」Wallpaper
- [ ] 确认工程目录 `playlist.json` 含 `author` / `avatar`
- [ ] WE 应用壁纸：左上角署名可见（杂志风格、无厚底板）
- [ ] 有头像作者显示圆形头像；无头像显示首字
- [ ] WE 属性 Info overlay：Always on / On gallery change（约 4s 淡出）/ Hidden
- [ ] 换套图时文案与头像更新；同套翻页不重置 fade 计时
- [ ] 选池 / 耗尽随机 / 横竖图布局行为与改前一致

---

## Spec coverage self-check

| Spec 项 | Task |
|---------|------|
| 左上角头像+作者+套图名 | 1–2 |
| 杂志/胶片风格、无厚底板 | 1 |
| WE `always`/`fade`/`hidden`，默认 always | 1–2 |
| `playlist.json` author/avatar | 3 |
| `/media/` 服务头像、无新路由 | 3（路径）+ 既有 mediaServer |
| 无头像占位 / 未知作者 | 2 |
| 同步接线 AvatarStore | 3–4 |
| 测试 | 1–4 |
| 不改灯箱/Electron 详情 | 遵守非目标 |

**Placeholder scan:** 无 TBD。  
**Type consistency:** `infoOverlay` 值 `always|fade|hidden`；字段名 `author`/`avatar`；函数名 `updateCredit`。
