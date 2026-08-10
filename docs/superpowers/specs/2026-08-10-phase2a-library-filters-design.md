# Phase 2a 库检索与批量整理设计

**日期:** 2026-08-10  
**状态:** 待实现  
**来源:** `WallpaperRunner-调研与优化建议报告.html`（Phase 2 · 补齐标配，第一波）  
**前置:** Phase 1 止血（`2026-08-10-phase1-stabilization-design.md`）  
**仓库:** WallpaperRunner

## 目标

让本地套图库「找得到、筛得动、批得动」：

1. 标签 AND 筛选 + 侧栏标签聚合计数（F5）
2. 多维过滤：来源 / 收藏 / 日期范围 / 张数区间（F6 核心集）
3. 多选常驻批量工具条：全选 / 反选 / 批量打标签等（I5）
4. 库视图：网格三密度 + 列表（U3）
5. 空态分流（U4）与 `wallpaperMediaPort` 可编辑（U5 余项）

## 已锁定决策

| 项 | 选择 |
|----|------|
| Phase 2 范围 | 完整 Phase 2，但分三波串行 |
| 本波 | **2a 库检索**（本文件） |
| 后续波 | 2b 下载交互（F8/I2/I3）；2c 规模与去重（I4/F7/F9） |
| 过滤深度 | 核心集；**不做**分辨率/宽高比、拼音模糊 |
| 架构 | 主进程统一 `search(query, filters)` + `listTagStats()`（方案 1） |
| 视图偏好 | `localStorage`（键名见下），不进 `settings.json` |
| 批量打标 | 对选中套图 **追加** tags（去重），不覆盖已有 |

## 非目标（本波）

- 分辨率 / 宽高比过滤、拼音搜索
- 拖拽入队、单任务暂停/优先级、失败一键补全（2b）
- 虚拟滚动、历史记录、重复检测（2c）
- 下载页代理错误态深度改版
- 订阅、打包、跨平台
- 删除回收站 / onboarding

## 架构边界

**不变：** `library.json` 与套图维度；Tab 结构；播放列表 / WE；Phase 1 下载坞 / 主题 / 快捷键。

**本波改动面：**

```
主进程  library/store.ts — search 扩展、listTagStats、addTags
        ipc / preload / api — library:list filters、library:tagStats、library:addTags
渲染层  LibraryPage — 筛选栏、标签侧栏、批量条、视图切换、空态
        可选 GalleryListRow 组件
设置    wallpaperMediaPort 可编辑
测试    store.search / tagStats / addTags
```

---

## 数据契约

### `LibraryFilters`

```ts
export type LibraryFilters = {
  tags?: string[]          // AND；比较前 trim + toLowerCase
  sources?: string[]       // OR；空/缺省 = 全部来源
  favoriteOnly?: boolean
  downloadedFrom?: string  // YYYY-MM-DD 或 ISO；含当日 00:00:00 本地/UTC 约定：按 ISO 字符串比较 downloadedAt
  downloadedTo?: string    // 含当日末；实现时将 to 规范为当日 23:59:59.999Z 或对 date-only 做前缀/日界处理
  minImages?: number
  maxImages?: number
}
```

**日期约定（明确）：**  
- 若传入 `YYYY-MM-DD`：`from` → 当日 `T00:00:00.000Z` 比较下界；`to` → 当日 `T23:59:59.999Z` 上界（与现有 `downloadedAt` ISO 字符串字典序兼容时，优先解析为时间戳比较，避免时区歧义）。  
- 只填一端则单边约束。  
- `minImages > maxImages` 时自动交换两端。

### `search(query, filters?)`

过滤顺序建议：favorite → sources → tags(AND) → 日期 → 张数 → 全文 `includes`。  
排序：仍按 `downloadedAt` 降序。

兼容：`search(query)` / `search(query, { favoriteOnly: true })` 行为与现网一致。

### `listTagStats()`

```ts
{ tag: string; count: number }[]
```

基于**全库索引**聚合（不受当前筛选影响）。按 `count` 降序，同 count 按 tag 字典序。

### `addTags(refs, tags)`

对每个 ref 加载 metadata，将新 tags trim 后追加并去重（大小写：保留首次出现的写法，比较时忽略大小写），写回 metadata + 更新索引，emit `library:changed`。

### IPC / API

- `library:list(query?: string, filters?: LibraryFilters)`  
  Preload 可保留旧签名包装：`listLibrary(query, favoriteOnly?: boolean)` → 转为 `filters: { favoriteOnly }`。
- `library:tagStats()` → `listTagStats`
- `library:addTags(refs: GalleryRef[], tags: string[])`

### 视图 localStorage

- 键：`wallpaper-runner:libraryView`
- 值：`'grid-comfy' | 'grid-compact' | 'grid-large' | 'list'`
- 默认：`grid-comfy`

---

## 库页 UI

### 顶栏筛选

- 搜索框（现有）
- 来源 chips：仅展示库中实际出现过的 source（或固定三来源但无数据时禁用）
- 仅收藏
- 日期起止 `input[type=date]`
- 张数 min / max 窄数字框
- 「清除筛选」重置 filters + 保留 query 是否清空：清除时 **同时清空 query 与 filters**

防抖：150ms（沿用）。

### 标签侧栏

- 可折叠；桌面默认展开
- 项：`标签 (count)`；点击切换选中
- 已选以 chip 展示，可单独移除
- 多选 = AND → 写入 `filters.tags`

### 批量工具条（I5）

进入多选后**即使 N=0 也常驻**：

- 已选 N / 当前结果 M
- 全选、反选
- 批量收藏 / 取消收藏
- 加入播放列表
- 批量打标签（弹层，逗号分隔，追加）
- 批量删除（确认）

切换筛选后：selection 仅保留仍在当前 `items` 中的项。

### 视图（U3）

- 工具栏切换：紧凑 / 舒适 / 大图 / 列表
- 网格：CSS 变量控制 `gallery-grid` 最小列宽
- 列表：封面拇指 + 标题 / 作者 / 来源 / 张数 / 日期 / ★；点击打开；多选走 checkbox

### 空态（U4）

| 场景 | UI |
|------|-----|
| 库为空且无筛选 | 「还没有套图」+「去下载」（通知 App 切 download Tab） |
| 有筛选/搜索无结果 | 「没有符合条件的套图」+「清除筛选」 |
| 加载中 | 现有骨架屏 |

### 设置（U5）

- `wallpaperMediaPort` 数字输入，blur/保存写入 settings
- 若端口热切换成本高：保存成功 Toast「已保存；若预览异常请重启应用」；能复用现有 media server 重启则热切换

---

## 错误处理

| 场景 | 行为 |
|------|------|
| search / tagStats / addTags 失败 | Toast error；列表保持上一成功结果或空 |
| 非法张数 | 交换 min/max 或忽略非数字 |
| 打标空字符串 | 过滤掉，不报错 |

---

## 测试

- `search`：tags AND、sources OR、日期单边/双边、张数、favorite、query 组合
- `listTagStats` 计数与排序
- `addTags` 追加去重、忽略大小写重复

---

## Phase 2a 总验收

1. 标签 AND + 来源/收藏/日期/张数过滤正确  
2. 标签侧栏计数与点击筛选可用  
3. 多选常驻条：全选/反选/打标/收藏/删/加列表  
4. 网格三密度 + 列表，刷新后保持  
5. 空库 / 无匹配空态正确  
6. 媒体端口可编辑保存  
7. `npm test` 绿  

## 实现顺序建议

1. `LibraryFilters` + `store.search` / `listTagStats` / `addTags` + 测试  
2. IPC / preload / api  
3. LibraryPage 筛选栏 + 标签侧栏  
4. 批量条增强 + 打标弹层  
5. 视图切换 + 列表行  
6. 空态 + 设置端口  
7. 总验收  

## 后续

- **2b：** F8 失败重试、I2 拖拽、I3 单任务控制  
- **2c：** I4 虚拟滚动、F7 历史、F9 重复检测  
