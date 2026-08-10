# Phase 2a 库检索与批量整理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付库侧标签 AND 筛选、来源/收藏/日期/张数过滤、常驻批量条（含打标）、网格/列表视图、空态分流与媒体端口可编辑。

**Architecture:** 扩展 `LibraryStore.search(query, filters)` 与 `listTagStats` / `addTags`；IPC 传入 `LibraryFilters`；`LibraryPage` 增加筛选栏、标签侧栏、批量条与视图模式（localStorage）。

**Tech Stack:** Electron、React 18、既有 vanilla CSS、vitest。

**Spec:** `docs/superpowers/specs/2026-08-10-phase2a-library-filters-design.md`

## File map

| 文件 | 职责 |
|------|------|
| `src/main/library/types.ts`（新建）或 `store.ts` 内导出 | `LibraryFilters`、`TagStat` |
| `src/main/library/store.ts` | search / listTagStats / addTags |
| `src/main/ipc.ts` | library:list / tagStats / addTags |
| `src/preload/index.ts` | 桥接 |
| `src/renderer/lib/api.ts` | 类型与调用 |
| `src/renderer/pages/LibraryPage.tsx` | 主 UI |
| `src/renderer/components/GalleryListRow.tsx` | 列表行 |
| `src/renderer/components/BatchTagModal.tsx` | 批量打标 |
| `src/renderer/pages/SettingsPage.tsx` | 媒体端口 |
| `src/renderer/styles.css` | 侧栏/筛选/列表/密度 |
| `src/renderer/App.tsx` | 可选：监听「去下载」切 Tab |
| `tests/library/store.test.ts` | 过滤与打标测试 |

---

### Task 1: LibraryFilters + search / tagStats / addTags（TDD）

**Files:**
- Modify: `src/main/library/store.ts`
- Create (optional): `src/main/library/filters.ts` — 纯函数 `applyLibraryFilters` / `normalizeDateBound` 便于单测
- Test: `tests/library/store.test.ts`（扩展）或 `tests/library/filters.test.ts`

- [ ] **Step 1: 定义类型并写失败测试**

```ts
// store.ts 或 filters.ts
export type LibraryFilters = {
  tags?: string[]
  sources?: string[]
  favoriteOnly?: boolean
  downloadedFrom?: string
  downloadedTo?: string
  minImages?: number
  maxImages?: number
}

export type TagStat = { tag: string; count: number }
```

测试用例（至少）：
- tags AND：两标签只返回交集
- sources OR
- favoriteOnly 兼容
- 日期 from/to（用固定 ISO `downloadedAt`）
- min/max images（min>max 时交换）
- listTagStats 计数排序
- addTags 追加去重（忽略大小写）

- [ ] **Step 2: Run `npm test -- tests/library` — expect FAIL**

- [ ] **Step 3: 实现**

`search` 签名改为：

```ts
async search(query: string, opts?: LibraryFilters): Promise<LibraryIndexEntry[]>
```

日期：`YYYY-MM-DD` → from 用 `Date.parse(d + 'T00:00:00.000Z')`，to 用 `T23:59:59.999Z`；与 `Date.parse(entry.downloadedAt)` 比较。

`addTags`：读 meta → 合并 tags → `updateGalleryMeta` 或直接写；比较去重用 `toLowerCase`。

- [ ] **Step 4: 测试 PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(library): filters, tag stats, and addTags"
```

---

### Task 2: IPC + preload + api

**Files:**
- Modify: `src/main/ipc.ts`（`library:list` 第二参改为 `LibraryFilters | boolean` 兼容：若 `typeof arg === 'boolean'` 则 `{ favoriteOnly: arg }`）
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/lib/api.ts`

- [ ] **Step 1: 更新 handler**

```ts
ipcMain.handle('library:list', async (_e, query?: string, filters?: LibraryFilters | boolean) => {
  const f: LibraryFilters =
    typeof filters === 'boolean' ? { favoriteOnly: filters } : (filters ?? {})
  return store.search(query ?? '', f)
})
ipcMain.handle('library:tagStats', async () => store.listTagStats())
ipcMain.handle('library:addTags', async (_e, refs, tags: string[]) => store.addTags(refs, tags))
```

- [ ] **Step 2: preload / api 暴露 `listLibrary(query, filters?)`、`tagStats()`、`addTags(refs, tags)`**

- [ ] **Step 3: 确认 PlaylistsPage `listLibrary('')` 仍可用**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: wire library filter IPC and api"
```

---

### Task 3: LibraryPage 筛选栏 + 标签侧栏

**Files:**
- Modify: `src/renderer/pages/LibraryPage.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/App.tsx`（可选 `library:go-download` 事件）

- [ ] **Step 1: 状态**

```ts
const [filters, setFilters] = useState<LibraryFilters>({})
const [tagStats, setTagStats] = useState<TagStat[]>([])
const [tagsOpen, setTagsOpen] = useState(true)
```

`reload`：`api.listLibrary(query, { ...filters, favoriteOnly })`；并行/单独 `api.tagStats()`。

- [ ] **Step 2: 顶栏 UI** — 来源 chips、日期、张数、清除筛选；「仅收藏」写入 filters

- [ ] **Step 3: 侧栏** — 标签列表点击 toggle `filters.tags`；已选 chip 可移除

- [ ] **Step 4: 布局** — `.library-layout` grid：侧栏 + 主区；窄屏侧栏改顶部折叠

- [ ] **Step 5: 手动 `npm run dev` 点选筛选**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(ui): library filter bar and tag sidebar"
```

---

### Task 4: 批量条增强 + BatchTagModal

**Files:**
- Create: `src/renderer/components/BatchTagModal.tsx`
- Modify: `src/renderer/pages/LibraryPage.tsx`

- [ ] **Step 1: 多选时工具条常驻（含 N=0）**

全选：`setSelected(new Set(items.map(keyOf)))`  
反选：对当前 items 翻转  
打标：打开 modal → `api.addTags` → toast → reload + 刷新 tagStats

- [ ] **Step 2: 筛选变化时裁剪 selection**

```ts
useEffect(() => {
  setSelected((prev) => {
    const keys = new Set(items.map(keyOf))
    return new Set([...prev].filter((k) => keys.has(k)))
  })
}, [items])
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(ui): persistent batch bar with add-tags"
```

---

### Task 5: 视图切换 + 列表行

**Files:**
- Create: `src/renderer/components/GalleryListRow.tsx`
- Modify: `LibraryPage.tsx`、`styles.css`

- [ ] **Step 1: localStorage `wallpaper-runner:libraryView`**

- [ ] **Step 2: 工具栏四态切换；`data-view` 挂在 grid/list 容器**

CSS 示例：

```css
.gallery-grid[data-density='compact'] { --gallery-min: 120px; }
.gallery-grid[data-density='comfy'] { --gallery-min: 180px; }
.gallery-grid[data-density='large'] { --gallery-min: 260px; }
.gallery-grid { grid-template-columns: repeat(auto-fill, minmax(var(--gallery-min, 180px), 1fr)); }
```

- [ ] **Step 3: list 模式渲染 `GalleryListRow`**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(ui): library grid density and list view"
```

---

### Task 6: 空态 + 媒体端口

**Files:**
- Modify: `LibraryPage.tsx`、`App.tsx`、`SettingsPage.tsx`、`ipc.ts`（若需重启 media server）

- [ ] **Step 1: 空态分流** — 无库 vs 无匹配；「去下载」`window.dispatchEvent(new CustomEvent('wallpaper-runner:go-download'))`，App 监听切 Tab

- [ ] **Step 2: Settings 增加 wallpaperMediaPort 输入并 save**

- [ ] **Step 3: 若 `ensureMediaServer` 可按新端口重启则调用；否则 Toast 提示重启应用

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: library empty states and editable media port"
```

---

### Task 7: 总验收

- [ ] **Step 1: `npm test` 全绿**

- [ ] **Step 2: 对照 spec 验收清单手动点检**

- [ ] **Step 3: 缺口小修提交或结束**

---

## Self-review

| Spec 项 | Task |
|---------|------|
| search filters / tagStats / addTags | 1–2 |
| 筛选栏 + 标签侧栏 | 3 |
| 批量条 + 打标 | 4 |
| 视图 | 5 |
| 空态 + 端口 | 6 |
| 验收 | 7 |

无 TBD；旧 `listLibrary(q, boolean)` 兼容保留。
