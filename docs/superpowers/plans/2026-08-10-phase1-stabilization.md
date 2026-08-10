# Phase 1 止血（Stabilization）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除 WallpaperRunner Phase 1 劝退硬伤：详情页缩略图、HTTP 流式断点续传、队列持久化、全局下载坞、暗色模式、基础快捷键，以及工程地基（死代码/并发对齐/错误兜底/契约测试）。

**Architecture:** 保持 Electron main/preload/renderer。缩略图复用 `gallery-media://?thumb=1`；HTTP 下载对齐 Telegram `.part`+Range；队列防抖写 `userData/queue.json`；下载坞消费既有 `queue:update`。严格 Step 0 → 1 → 2（F2→F3→F4）。

**Tech Stack:** Electron ^43、React 18、TypeScript、vitest、vanilla CSS 变量、既有 undici/curl `httpFetch`。

**Spec:** `docs/superpowers/specs/2026-08-10-phase1-stabilization-design.md`

## File map

| 文件 | 职责 |
|------|------|
| `src/main/settings.ts` | 删 `openAfterDownload`；加 `theme` |
| `src/main/downloader/downloadGallery.ts` | 并发钳制上限改为 8 |
| `src/main/downloader/downloadFile.ts` | 流式写 `.part` + Range 续传 |
| `src/main/queue/downloadQueue.ts` | 持久化 / 启动恢复 |
| `src/main/library/thumbnails.ts` | `resolveThumb` 泛化（保留 cover 别名） |
| `src/main/ipc.ts` | 协议用 `resolveThumb`；可选暴露 theme IPC（经 settings 已有 save） |
| `src/main/index.ts` | unhandledRejection / uncaughtException → `userData/logs/main.log` |
| `src/renderer/App.tsx` | ErrorBoundary、快捷键、DownloadDock、主题应用、Tab 徽标 |
| `src/renderer/components/ErrorBoundary.tsx` | 渲染错误兜底 |
| `src/renderer/components/DownloadDock.tsx` | 全局下载浮窗 |
| `src/renderer/components/ShortcutHelp.tsx` | `?` 帮助面板 |
| `src/renderer/pages/GalleryPage.tsx` | 网格 `thumb: true` |
| `src/renderer/pages/SettingsPage.tsx` | 主题三态；删 openAfterDownload；并发提示 |
| `src/renderer/pages/LibraryPage.tsx` | 搜索框 `data-focus="library-search"` |
| `src/renderer/pages/DownloadPage.tsx` | URL 框 `data-focus="download-urls"` |
| `src/renderer/styles.css` | `[data-theme=dark]`；下载坞/帮助面板样式 |
| `package.json` | 移除 `adm-zip` / `@types/adm-zip` |
| `tests/downloader/downloadFile.test.ts` | 续传 / `.part` 用例 |
| `tests/queue/downloadQueue.test.ts` | 持久化恢复用例 |

## Global constraints

- 不引入 Tailwind / UI 框架
- 不改 SourceAdapter 契约；不改 Telegram 下载语义
- `downloadFile` 对外签名保持兼容
- 不做 Phase 2/3 项（标签筛选、拖拽、打包、safeStorage、ESLint 全量等）
- Windows 上 `npm test` / `npm run dev` 验证；提交信息用英文 conventional commits 或中文短句均可，与仓库近期风格一致

---

### Task 1: Step 0 — 死代码 + 并发对齐 + 错误兜底

**Files:**
- Modify: `package.json`, `package-lock.json`（npm uninstall）
- Modify: `src/main/settings.ts`
- Modify: `src/main/downloader/downloadGallery.ts`
- Modify: `src/renderer/pages/SettingsPage.tsx`
- Create: `src/renderer/components/ErrorBoundary.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/main/index.ts`

- [ ] **Step 1: 移除 adm-zip 依赖**

Run:

```bash
npm uninstall adm-zip @types/adm-zip
```

Expected: `package.json` 中两者消失。

- [ ] **Step 2: 从 settings 移除 `openAfterDownload`，暂不改 theme（Task 4）**

`src/main/settings.ts`：从 `AppSettings`、`defaultSettings`、`loadSettings`、`saveSettings` 删除 `openAfterDownload` 字段与读写。旧 JSON 中多余字段自然被忽略。

- [ ] **Step 3: Settings UI 删除「下载后打开」开关；并发说明文案**

在 `SettingsPage.tsx` 删除 `openAfterDownload` checkbox。将并发滑块/数字输入旁文案改为类似：「1–8，默认 2；过高可能导致代理/CDN 丢文件」。

- [ ] **Step 4: 对齐并发钳制**

`src/main/downloader/downloadGallery.ts` 将：

```ts
const concurrency = Math.min(Math.max(1, opts.concurrency), 3)
```

改为：

```ts
const concurrency = Math.min(Math.max(1, opts.concurrency), 8)
```

- [ ] **Step 5: 实现 ErrorBoundary**

```tsx
// src/renderer/components/ErrorBoundary.tsx
import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary" role="alert">
          <h2>界面出错了</h2>
          <p className="muted">{this.state.error.message}</p>
          <button type="button" onClick={() => this.setState({ error: null })}>
            重试
          </button>
          <button type="button" onClick={() => window.location.reload()}>
            重载应用
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
```

`App.tsx` 默认导出改为：

```tsx
export default function App(): JSX.Element {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </ErrorBoundary>
  )
}
```

在 `styles.css` 末尾加 `.error-boundary` 简单居中样式（用现有变量）。

- [ ] **Step 6: 主进程未捕获异常写日志**

在 `src/main/index.ts` 顶部（`app.whenReady` 之前）加入：

```ts
import { appendFile, mkdir } from 'node:fs/promises'

function logPath(): string {
  return join(app.getPath('userData'), 'logs', 'main.log')
}

async function appendMainLog(line: string): Promise<void> {
  try {
    const p = logPath()
    await mkdir(dirname(p), { recursive: true })
    await appendFile(p, `[${new Date().toISOString()}] ${line}\n`, 'utf8')
  } catch {
    /* ignore logging failures */
  }
}

process.on('unhandledRejection', (reason) => {
  void appendMainLog(`unhandledRejection ${reason instanceof Error ? reason.stack ?? reason.message : String(reason)}`)
})
process.on('uncaughtException', (err) => {
  void appendMainLog(`uncaughtException ${err.stack ?? err.message}`)
})
```

注意：`app.getPath` 须在 `app` 可用后调用；若启动极早触发，可延迟到 `app.whenReady` 内注册 listener，或用 try/catch。推荐在 `app.whenReady().then` 开头注册：

```ts
app.whenReady().then(async () => {
  process.on('unhandledRejection', ...)
  process.on('uncaughtException', ...)
  await initAppServices()
  ...
})
```

- [ ] **Step 7: 跑测试确认未破坏**

Run: `npm test`

Expected: PASS（现有用例）。

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/main/settings.ts src/main/downloader/downloadGallery.ts src/main/index.ts src/renderer/App.tsx src/renderer/components/ErrorBoundary.tsx src/renderer/pages/SettingsPage.tsx src/renderer/styles.css
git commit -m "$(cat <<'EOF'
chore: Phase1 Step0 foundation — dead code, concurrency, error boundaries

EOF
)"
```

---

### Task 2: F1 — 详情页缩略图管线

**Files:**
- Modify: `src/main/library/thumbnails.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/renderer/pages/GalleryPage.tsx`

- [ ] **Step 1: 泛化 thumbnails API**

`thumbnails.ts`：将 `resolveCoverThumb` 实现体改名为 `resolveThumb`，并保留别名：

```ts
export async function resolveThumb(
  libraryRoot: string,
  absImagePath: string,
): Promise<{ absPath: string; mime: string }> {
  // 原 resolveCoverThumb 实现不变；错误文案改 "image missing"
}

/** @deprecated alias — cover cards */
export const resolveCoverThumb = resolveThumb
```

- [ ] **Step 2: ipc 协议处理改用 `resolveThumb`**

`ipc.ts`：`import { resolveThumb } from './library/thumbnails'`，`wantThumb` 分支调用 `resolveThumb(root, abs)`。

- [ ] **Step 3: GalleryPage 网格传 thumb**

将约第 316 行：

```tsx
<img src={api.getMediaUrl(entry.dirName, img)} alt={img} loading="lazy" />
```

改为：

```tsx
<img
  src={api.getMediaUrl(entry.dirName, img, { thumb: true })}
  alt={img}
  loading="lazy"
/>
```

Lightbox 保持原图（`GalleryLightbox` 不传 thumb）——勿改。

- [ ] **Step 4: 手动验收**

Run: `npm run dev`，打开含多图套图详情：网格应变快；点开灯箱仍清晰。

- [ ] **Step 5: Commit**

```bash
git add src/main/library/thumbnails.ts src/main/ipc.ts src/renderer/pages/GalleryPage.tsx
git commit -m "$(cat <<'EOF'
feat: use thumbnail pipeline on gallery detail grid

EOF
)"
```

---

### Task 3: U1 — 暗色模式

**Files:**
- Modify: `src/main/settings.ts`
- Modify: `src/renderer/pages/SettingsPage.tsx`
- Modify: `src/renderer/App.tsx`（或新建 `src/renderer/lib/theme.ts`）
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/lib/api.ts` / preload 仅当 settings 类型需同步时

- [ ] **Step 1: settings 增加 `theme`**

```ts
export type ThemePreference = 'system' | 'light' | 'dark'

export interface AppSettings {
  // ...
  theme: ThemePreference
}

// defaults:
theme: 'system',

// loadSettings:
theme:
  parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system'
    ? parsed.theme
    : defaults.theme,

// saveSettings: 合并 partial.theme 同上校验
```

确保 preload/`api.getSettings`/`saveSettings` 类型含 `theme`（若手写 interface 则更新）。

- [ ] **Step 2: CSS 暗色变量 + 背景依赖变量**

在 `styles.css` 的 `:root` 后追加：

```css
[data-theme='dark'] {
  color-scheme: dark;
  --bg: #121416;
  --panel: #1a1d21;
  --text: #e6e9ed;
  --ink: var(--text);
  --muted: #9aa3ad;
  --line: #2a2f36;
  --accent: #2dd4bf;
  --accent-ink: #042f2e;
  --danger: #f87171;
  --shadow: 0 1px 2px color-mix(in srgb, #000 40%, transparent),
    0 8px 24px color-mix(in srgb, #000 35%, transparent);
}
```

将 `html, body, #root` 的 `linear-gradient(180deg, #f7f9f8 0%, var(--bg) 48%, #eef2f1 100%)` 改为仅用变量，例如：

```css
linear-gradient(
  180deg,
  color-mix(in srgb, var(--bg) 70%, #fff) 0%,
  var(--bg) 48%,
  color-mix(in srgb, var(--bg) 85%, var(--line)) 100%
)
```

暗色下 mix 仍可读。硬编码浅色停止点必须去掉。

- [ ] **Step 3: 应用主题钩子**

在 `AppShell`（或 `theme.ts`）：

```ts
function resolveTheme(pref: ThemePreference): 'light' | 'dark' {
  if (pref === 'light' || pref === 'dark') return pref
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(pref: ThemePreference): void {
  document.documentElement.setAttribute('data-theme', resolveTheme(pref))
}
```

启动时 `api.getSettings()` → `applyTheme(settings.theme)`；`pref === 'system'` 时 `matchMedia(...).addEventListener('change', ...)`。

设置页保存 theme 后回调或重新 getSettings 再 apply（可在 SettingsPage `save` 成功后 `window` 自定义事件 `theme-changed`，App 监听）。

- [ ] **Step 4: Settings UI 三态**

```tsx
<label>
  外观
  <select
    value={settings.theme}
    onChange={(e) => {
      const theme = e.target.value as ThemePreference
      setSettings({ ...settings, theme })
      void save({ theme })
    }}
  >
    <option value="system">跟随系统</option>
    <option value="light">亮色</option>
    <option value="dark">暗色</option>
  </select>
</label>
```

- [ ] **Step 5: 手动验收三态**

- [ ] **Step 6: Commit**

```bash
git add src/main/settings.ts src/renderer/pages/SettingsPage.tsx src/renderer/App.tsx src/renderer/styles.css src/renderer/lib/api.ts src/preload/index.ts
git commit -m "$(cat <<'EOF'
feat: add system/light/dark theme support

EOF
)"
```

（仅 stage 实际改动的文件。）

---

### Task 4: I1 — 全局快捷键 + 帮助面板

**Files:**
- Create: `src/renderer/components/ShortcutHelp.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/pages/LibraryPage.tsx`
- Modify: `src/renderer/pages/DownloadPage.tsx`
- Modify: `src/renderer/styles.css`

- [ ] **Step 1: 给聚焦目标加 data 属性**

`LibraryPage` 搜索 input：`data-focus="library-search"`  
`DownloadPage` textarea：`data-focus="download-urls"`

- [ ] **Step 2: ShortcutHelp 组件**

模态/面板列出：Ctrl+1..4、Ctrl+K、Ctrl+N、?、Esc。点击遮罩或 Esc 关闭（Esc 由 App 统一处理时可只暴露 `onClose`）。

- [ ] **Step 3: AppShell 快捷键**

```tsx
const [helpOpen, setHelpOpen] = useState(false)

useEffect(() => {
  function isTypingTarget(t: EventTarget | null): boolean {
    if (!(t instanceof HTMLElement)) return false
    const tag = t.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
    return t.isContentEditable
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (isTypingTarget(e.target) && e.key !== 'Escape') return
    // Lightbox 打开时：若存在 .yarl__root 则跳过（除 Esc 关闭详情策略按需）
    if (document.querySelector('.yarl__root')) return

    const mod = e.ctrlKey || e.metaKey
    if (mod && e.key >= '1' && e.key <= '4') {
      e.preventDefault()
      setActive(null)
      const tabs = ['library', 'playlists', 'download', 'settings'] as const
      setTab(tabs[Number(e.key) - 1])
      return
    }
    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      setActive(null)
      setTab('library')
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('[data-focus="library-search"]')?.focus()
      })
      return
    }
    if (mod && e.key.toLowerCase() === 'n') {
      e.preventDefault()
      setActive(null)
      setTab('download')
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('[data-focus="download-urls"]')?.focus()
      })
      return
    }
    if (e.key === '?' || (e.shiftKey && e.key === '/')) {
      e.preventDefault()
      setHelpOpen(true)
      return
    }
    if (e.key === 'Escape') {
      if (helpOpen) {
        setHelpOpen(false)
        return
      }
      if (active) setActive(null)
    }
  }
  window.addEventListener('keydown', onKeyDown)
  return () => window.removeEventListener('keydown', onKeyDown)
}, [helpOpen, active])
```

注意：`helpOpen`/`active` 依赖；或用 ref 避免闭包陈旧。

- [ ] **Step 4: 手动验收快捷键与输入框不误触**

- [ ] **Step 5: Commit**

```bash
git add src/renderer/App.tsx src/renderer/components/ShortcutHelp.tsx src/renderer/pages/LibraryPage.tsx src/renderer/pages/DownloadPage.tsx src/renderer/styles.css
git commit -m "$(cat <<'EOF'
feat: add global keyboard shortcuts and help panel

EOF
)"
```

---

### Task 5: F2 — HTTP 流式下载 + `.part` 断点续传

**Files:**
- Modify: `src/main/downloader/downloadFile.ts`
- Modify: `tests/downloader/downloadFile.test.ts`

- [ ] **Step 1: 写失败用例（续传发 Range、成功无残留 .part）**

在 `tests/downloader/downloadFile.test.ts` 追加：

```ts
it('resumes from .part with Range header', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dl-part-'))
  dirs.push(root)
  const dest = join(root, '001.jpg')
  const partPath = `${dest}.part`
  const existing = Buffer.alloc(1024, 9)
  await writeFile(partPath, existing)

  const rest = Buffer.alloc(1024, 8)
  // JPEG-ish total >= 1024 rule: make final file 2048 bytes
  const calls: RequestInit[] = []
  vi.mocked(httpFetch).mockImplementation(async (_url, init) => {
    calls.push(init ?? {})
    const headers = new Map<string, string>([
      ['content-type', 'image/jpeg'],
      ['content-length', '1024'],
    ])
    return {
      ok: true,
      status: 206,
      headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
      body: {
        getReader: () => {
          let done = false
          return {
            read: async () => {
              if (done) return { done: true, value: undefined }
              done = true
              return { done: false, value: rest }
            },
            cancel: async () => undefined,
            releaseLock: () => undefined,
          }
        },
      },
      arrayBuffer: async () => rest,
    } as unknown as Response
  })

  const result = await downloadFile('https://example.com/a.jpg', dest, { retries: 1 })
  expect(result.bytes).toBe(2048)
  const range = (calls[0]?.headers as Record<string, string>)?.Range
    ?? (calls[0]?.headers as Record<string, string>)?.range
  // 实现后：headers 含 Range: bytes=1024-
  expect(String(JSON.stringify(calls[0]?.headers))).toMatch(/bytes=1024-/)
  await expect(readFile(dest)).resolves.toHaveLength(2048)
  await expect(readFile(partPath)).rejects.toThrow()
})
```

（按最终 headers 组装方式微调断言。）

Run: `npm test -- tests/downloader/downloadFile.test.ts`  
Expected: FAIL（尚无 Range / .part 逻辑，或旧实现直接覆盖写）。

- [ ] **Step 2: 重写 `downloadFile` 为流式 `.part`**

核心逻辑（保持导出签名）：

```ts
import { createWriteStream } from 'node:fs'
import { access, mkdir, rename, stat, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import { finished } from 'node:stream/promises'
import { httpFetch } from '../http/client'

async function partialSize(partPath: string): Promise<number> {
  try {
    const st = await stat(partPath)
    return st.size
  } catch {
    return 0
  }
}

export async function downloadFile(url, destPath, opts?) {
  const retries = opts?.retries ?? 3
  const partPath = `${destPath}.part`
  let lastError: unknown

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (opts?.signal?.aborted) throw new Error('已取消')
      let offset = await partialSize(partPath)
      const headers: Record<string, string> = {
        'User-Agent': '...',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Referer: opts?.referer ?? 'https://xchina.co/',
        ...(opts?.headers ?? {}),
      }
      if (offset > 0) headers.Range = `bytes=${offset}-`

      const res = await httpFetch(url, { signal: opts?.signal, headers })

      // 404/403/429/5xx 同现有
      if (res.status === 404) throw new Error(`资源不存在 (HTTP 404)...`)
      if (res.status === 403 || res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status}`)
      }

      // 不支持 Range：200 且已有 part → 截断重写
      if (offset > 0 && res.status === 200) {
        await unlink(partPath).catch(() => undefined)
        offset = 0
      }
      if (!res.ok && res.status !== 206) {
        throw new Error(`HTTP ${res.status} downloading ${url}`)
      }

      await mkdir(dirname(destPath), { recursive: true })
      const stream = createWriteStream(partPath, { flags: offset > 0 ? 'a' : 'w' })

      const contentLength = Number.parseInt(res.headers.get('content-length') ?? '', 10)
      const total =
        res.status === 206 && Number.isFinite(contentLength)
          ? offset + contentLength
          : Number.isFinite(contentLength) && contentLength > 0
            ? contentLength
            : null

      let received = offset
      // 将 res.body 流写入 stream；无 body 则 arrayBuffer 一次写入
      // 每 200ms onProgress({ received, total })
      // signal abort → destroy stream, 保留 .part, throw

      // content-type HTML 检测：可读文件头若干字节或下载后读 part 头
      // 完成后：若 size < 1024 throw；unlink dest；rename part → dest
      const st = await stat(destPath)
      return { bytes: st.size, contentType: res.headers.get('content-type') }
    } catch (err) {
      lastError = err
      if (opts?.signal?.aborted) throw err
      await sleep(400 * 2 ** attempt)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}
```

实现时注意：

1. curl 路径下 `httpFetch` 已把自定义 headers 传给 `-H`，Range 会生效。
2. 现有「先读满 Buffer 再 writeFile」路径删除。
3. 更新旧测试：`writes bytes from fetch` / stream progress 仍应通过（最终文件在 `dest`，无 `.part`）。若 mock 只有 `arrayBuffer` 无 `body`，实现需支持该回退：整段写入 `.part` 再 rename。

- [ ] **Step 3: 跑测试至 PASS**

Run: `npm test -- tests/downloader/downloadFile.test.ts`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/downloader/downloadFile.ts tests/downloader/downloadFile.test.ts
git commit -m "$(cat <<'EOF'
feat: stream HTTP downloads with .part resume

EOF
)"
```

---

### Task 6: F3 — 队列持久化与崩溃恢复

**Files:**
- Modify: `src/main/queue/downloadQueue.ts`
- Modify: `src/main/ipc.ts`（构造 Queue 时传入 persistPath）
- Modify: `tests/queue/downloadQueue.test.ts`

- [ ] **Step 1: 写失败用例**

```ts
it('persists queue and restores downloading as queued', async () => {
  const root = await mkdtemp(join(tmpdir(), 'q-persist-'))
  dirs.push(root)
  const store = new LibraryStore(root)
  const persistPath = join(root, 'queue.json')

  const fake: SourceAdapter = { /* 同现有 fake，images 可设慢一点或 mock download */ }
  registerAdapter(fake)

  const q1 = new DownloadQueue({
    store,
    imageConcurrency: 1,
    persistPath,
  })
  q1.enqueue(['https://fake.test/gallery'])
  // 直接 patch 内部或等 status downloading 后手动写盘：
  // 简化：enqueue 后调用 q1['persistNow'] 或读 listTasks 改 status 再 flush
  const tasks = q1.listTasks()
  // 若任务已 completed 太快，可注入永不 resolve 的 parseGallery 测 downloading 恢复

  // 更稳妥：单元测纯函数 loadQueueState / saveQueueState
})
```

推荐把持久化拆成可测函数：

```ts
// 同文件或 queue/persist.ts
export type PersistedQueue = { updatedAt: string; tasks: QueueTask[] }

export function normalizeTasksForRestore(tasks: QueueTask[]): QueueTask[] {
  return tasks
    .filter((t) => t.status !== 'completed' && t.status !== 'failed' && t.status !== 'cancelled'
      || /* 终态另计 */ true)
    .map((t) => {
      if (t.status === 'downloading' || t.status === 'resolving') {
        return { ...t, status: 'queued' as const, updatedAt: new Date().toISOString() }
      }
      return t
    })
}

export function trimTerminalTasks(tasks: QueueTask[], keep = 50): QueueTask[] {
  const active = tasks.filter((t) =>
    t.status === 'queued' || t.status === 'resolving' || t.status === 'downloading' || t.status === 'skipped',
  )
  const terminal = tasks
    .filter((t) => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, keep)
  return [...active, ...terminal]
}
```

测试 `normalizeTasksForRestore`：`downloading` → `queued`；`resolving` → `queued`。

- [ ] **Step 2: DownloadQueue 接入持久化**

```ts
export interface DownloadQueueOptions {
  store: LibraryStore
  imageConcurrency: number
  persistPath?: string
  // ...
}

// constructor: if persistPath, await load（ipc 侧 async init）
// 每次 emit/patch 后 schedulePersist() 200ms debounce
// 字段：id url source status done total error createdAt updatedAt manifestId selectedIds
```

`ipc.ts` `initAppServices`：

```ts
import { join } from 'node:path'
import { app } from 'electron'

const persistPath = join(app.getPath('userData'), 'queue.json')
queue = new DownloadQueue({ store, imageConcurrency: settings.imageConcurrency, persistPath })
await queue.restoreFromDisk() // 新增 public 方法
```

队列级 `paused` **不**写入磁盘。

- [ ] **Step 3: 测试 PASS + Commit**

```bash
git add src/main/queue/downloadQueue.ts src/main/queue/persist.ts src/main/ipc.ts tests/queue/downloadQueue.test.ts
git commit -m "$(cat <<'EOF'
feat: persist download queue across restarts

EOF
)"
```

---

### Task 7: F4 — 全局下载坞 + Tab 徽标

**Files:**
- Create: `src/renderer/components/DownloadDock.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/lib/toast.tsx` 使用处（完成 Toast）

- [ ] **Step 1: DownloadDock 组件**

```tsx
// 订阅 api.listTasks + api.onQueueUpdate
// active = status in queued|resolving|downloading
// 右下角 fixed；折叠只显示「下载中 N」+ 细进度条
// 展开：每任务 title/url 截断 + percent
// 按钮：打开下载页 → onOpenDownload()
```

样式用现有 `--panel/--accent/--shadow`，暗色下自动跟随。

- [ ] **Step 2: App 挂载 + 徽标**

```tsx
const [tasks, setTasks] = useState<QueueTask[]>([])
useEffect(() => {
  void api.listTasks().then(setTasks)
  return api.onQueueUpdate(setTasks)
}, [])

const activeCount = tasks.filter((t) =>
  t.status === 'queued' || t.status === 'resolving' || t.status === 'downloading',
).length

// 下载 nav-btn 内：{activeCount > 0 && <span className="nav-badge">{activeCount}</span>}

// 完成检测：用 ref 存上一拍 status，进入 completed 时 toast.success
```

`<DownloadDock tasks={tasks} onOpenDownload={() => { setActive(null); setTab('download') }} />`

- [ ] **Step 3: 手动验收**

入队后切到「库」：坞仍显示进度；徽标数字正确；完成后 Toast。

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/DownloadDock.tsx src/renderer/App.tsx src/renderer/styles.css
git commit -m "$(cat <<'EOF'
feat: add global download dock and tab badge

EOF
)"
```

---

### Task 8: Phase 1 总验收

- [ ] **Step 1: 跑全量测试**

Run: `npm test`  
Expected: all PASS

- [ ] **Step 2: 对照 spec 验收清单手动点检**

1. 大套图详情缩略图 + 灯箱原图  
2. 主题三态  
3. Ctrl+1..4 / Ctrl+K / Ctrl+N / ? / Esc  
4. 下载中杀进程重启 → 队列恢复续传（需手动）  
5. 任意 Tab 见下载坞  
6. 无 adm-zip / 无 openAfterDownload；并发 5 实际生效  

- [ ] **Step 3: 若有缺口，开小修复提交；无则结束**

---

## Self-review (author)

| Spec 项 | 对应 Task |
|---------|-----------|
| Step 0 死代码/并发/ErrorBoundary/日志 | Task 1 |
| Step 0 契约测试 | Task 5/6（TDD）；Task 1 后基线 `npm test` |
| F1 缩略图 | Task 2 |
| U1 暗色 | Task 3 |
| I1 快捷键 | Task 4 |
| F2 续传 | Task 5 |
| F3 持久化 | Task 6 |
| F4 下载坞 | Task 7 |
| 总验收 | Task 8 |

无 TBD 占位；`paused` 仅实例级（与 spec 一致）；`manifestId`/`selectedIds` 列入持久化字段。
