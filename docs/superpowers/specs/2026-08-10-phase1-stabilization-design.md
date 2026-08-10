# Phase 1 止血（Stabilization）设计

**日期:** 2026-08-10  
**状态:** 待实现  
**来源:** `WallpaperRunner-调研与优化建议报告.html`（Phase 1 · 止血）  
**仓库:** WallpaperRunner

## 目标

在不改变产品定位（「URL → 套图下载 → 本地库 → 壁纸轮播」闭环）的前提下，消除劝退级体验硬伤：

1. 详情页大套图不再并发拉全尺寸原图（走既有缩略图管线）
2. HTTP 下载可流式写盘 + `.part` 断点续传
3. 下载队列可持久化，崩溃/重启后恢复并续传
4. 任意 Tab 可见全局下载进度（下载坞）
5. 暗色模式（跟随系统 / 亮 / 暗）
6. 应用级基础快捷键
7. 工程地基：死代码清理、并发设置对齐、ErrorBoundary + 主进程日志、下载核心契约测试

## 已锁定决策

| 项 | 选择 |
|----|------|
| 范围 | 仅 Phase 1（不含标签筛选、多维搜索、拖拽、虚拟滚动、订阅、打包、跨平台） |
| 执行顺序 | 严格 Step 0 → Step 1 → Step 2 |
| Step 0 深度 | 折中：死代码 + 并发对齐 + ErrorBoundary/日志 + 下载契约测试；**不做** ESLint 全量、Telegram `safeStorage` |
| 落地路径 | 报告原案小步模块化（每步可提交、可回滚） |
| F2 策略 | 对齐 Telegram `downloadDocumentResumable` 的 `.part` + Range 模式；`downloadFile` 对外签名不变 |
| F1 增强 | 网格传 `thumb: true` + 泛化 `resolveThumb`；**不做** IntersectionObserver 相邻屏预取 |
| I1 范围 | Ctrl+1..4 / Ctrl+K / Ctrl+N / ? / Esc；**不做** Space/Ctrl+A/Del/F2/方向键（归 Phase 2） |
| U1 主题 | `system \| light \| dark`，默认 `system` |
| F4 通知 | Toast 即可；系统通知非硬依赖 |

## 非目标（本阶段）

- 标签筛选 / 多维搜索 / 历史记录 / 重复检测
- 拖拽入队、虚拟滚动、批量工具条、单任务暂停优先级调整
- 订阅更新、以图搜图、导入本地文件夹
- electron-builder 打包与自动更新
- HTTP curl → undici 跨平台兜底重构
- Telegram 凭据 `safeStorage` 加密
- ESLint / Prettier 全量接入
- 回收站式删除保护、首次引导 onboarding

## 架构边界

**不变：**

- 三进程架构（main / preload / renderer）与 `SourceAdapter` 注册表
- `gallery-media://` 协议及封面 `thumb=1` 行为
- Tab 信息架构（库 / 播放列表 / 下载 / 设置）
- Telegram 既有 `.part` 续传（HTTP 侧对齐，不改写 Telegram 通道语义）

**本轮改动面：**

```
Step 0  地基
  settings.ts / SettingsPage.tsx / downloadGallery.ts
  App.tsx（ErrorBoundary）/ main 日志
  tests: downloadFile + downloadQueue
  删除 adm-zip、openAfterDownload

Step 1  零风险高感知
  thumbnails.ts 泛化 → GalleryPage 走 thumb
  styles.css [data-theme=dark] + settings.theme
  App 全局快捷键 + ? 帮助面板

Step 2  下载可靠性（顺序：F2 → F3 → F4）
  downloadFile.ts 流式写 .part + Range
  downloadQueue.ts → userData/queue.json 持久化
  DownloadDock（消费已有 queue:update）
```

---

## Step 0 — 工程地基

### 0.1 死代码清理

- 从 `package.json` 移除 `adm-zip` 与 `@types/adm-zip`（全库无 import）
- 从 `AppSettings`、默认值、`loadSettings`/`saveSettings`、`SettingsPage` 移除 `openAfterDownload`
- 读旧 `settings.json` 时静默忽略该字段，不报错

### 0.2 并发上限对齐

- 现状：设置页可调到 8，`downloadGallery.ts` 硬钳 `≤3`
- 改法：钳制改为 `Math.min(Math.max(1, concurrency), 8)`，与设置页上限一致
- 默认值仍为 `2`；设置页文案注明过高可能导致代理/CDN 丢文件

### 0.3 错误兜底

- 渲染层：`App.tsx` 外包 `ErrorBoundary`，捕获后显示「出错了 + 重载」，避免白屏
- 主进程：`process.on('unhandledRejection')` / `uncaughtException` 追加写入 `userData/logs/main.log`（简单 append，不做轮转）

### 0.4 契约测试（动 F2/F3 前必须绿）

| 模块 | 覆盖 |
|------|------|
| `downloadFile` | 成功写盘；失败重试；取消抛错；为 `.part`/Range 预留用例（实现后断言：续传发 Range、完成后无残留 `.part`） |
| `downloadQueue` | enqueue → 状态流转；暂停；失败标记；持久化恢复（`downloading` → `queued`） |

- 运行环境：vitest + 临时目录
- HTTP：mock / 本地 fixture，不依赖真实站点

### 0.5 验收

- `npm test` 通过
- 设置并发=5 时实际按 5 并发（可观测）
- 渲染层异常 → ErrorBoundary，不白屏
- 死设置项与 adm-zip 消失

---

## Step 1 — 零风险高感知

### 1.1 F1 详情页缩略图

**问题：** `GalleryPage.tsx` 网格未传 `thumb`，大套图并发拉全尺寸原图。

**改法：**

1. 将 `resolveCoverThumb` 泛化为 `resolveThumb(libraryRoot, absPath)`（任意库内图片）；`gallery-media://?thumb=1` 仍调用同一函数，封面卡行为不变。可保留 `resolveCoverThumb` 作为薄别名以免破坏既有 import。
2. `GalleryPage` 网格：`api.getMediaUrl(dir, img, { thumb: true })`
3. Lightbox / 全屏继续使用原图 URL
4. 保留现有 `loading="lazy"`；本轮不做 IntersectionObserver 相邻屏预取

**验收：** 59 张套图详情秒开且走缩略图；灯箱仍为清晰原图。

### 1.2 U1 暗色模式

**设置：** 新增 `theme: 'system' | 'light' | 'dark'`，默认 `'system'`。

**渲染：**

- `document.documentElement` 设置 `data-theme="light|dark"`
- `system`：根据 `matchMedia('(prefers-color-scheme: dark)')` 解析，并监听变化
- CSS：保留 `:root` 亮色变量；追加 `[data-theme="dark"]` 覆盖 `--bg / --panel / --text / --muted / --line / --accent / --shadow`，设 `color-scheme: dark`
- `html, body` 背景渐变改为依赖 CSS 变量，避免暗色下残留浅色硬编码

**设置页：** 三态选择（跟随系统 / 亮色 / 暗色）。

**验收：** 跟随系统时切 OS 主题应用跟随；手动锁定亮/暗不受系统影响。

### 1.3 I1 全局快捷键

在 `App.tsx` 挂全局 `keydown`：

- 忽略：焦点在 `input` / `textarea` / `contentEditable`
- Lightbox 打开时让位给其内置键（不抢 ←→EscF）

| 快捷键 | 行为 |
|--------|------|
| `Ctrl+1..4` | 切 Tab：库 / 播放列表 / 下载 / 设置；并关闭套图详情浮层（若打开） |
| `Ctrl+K` | 聚焦库页搜索（不在库 Tab 则先切库） |
| `Ctrl+N` | 切下载页并聚焦 URL 输入框 |
| `?` | 打开快捷键帮助面板 |
| `Esc` | 关闭帮助面板；若无帮助则关闭套图详情 |

实现上可为库搜索框 / 下载 URL 框暴露 `data-` 或 `ref` 回调，由 App 调度聚焦。

**验收：** 上表快捷键可用；设置输入框打字不误触；`?` 显示帮助。

---

## Step 2 — 下载可靠性

顺序：**F2 → F3 → F4**。

### 2.1 F2 流式下载 + HTTP 断点续传

改造 `src/main/downloader/downloadFile.ts`：

1. 写入 `{destPath}.part`，流式落盘（禁止整包 `Buffer.concat` 再 `writeFile`）
2. 失败/中断：保留 `.part`；成功校验后 `rename` 为最终文件，再走现有魔数/扩展名校正
3. 重试：若存在 `.part`，请求头带 `Range: bytes={partSize}-`；若服务器返回 200 整包（不支持 Range），则截断 `.part` 后重写
4. `onProgress`：`received = partSize + 本次增量`；`total` 尽量反映完整大小
5. curl 通道同样传入 Range（curl 原生支持）
6. **对外签名不变**：`downloadFile(url, destPath, opts)`；`downloadGallery` 等调用方无需改业务逻辑

**验收：** 下载中途杀进程 → 重启再下同一文件从 `.part` 续传完成；无残留 `.part`（成功路径）。

### 2.2 F3 队列持久化与崩溃恢复

改造 `src/main/queue/downloadQueue.ts`：

| 时机 | 行为 |
|------|------|
| mutation（enqueue / 状态变更 / 完成 / 失败 / 取消） | 200ms 防抖写 `userData/queue.json` |
| 启动 | 载入：`queued` / `skipped` 原样恢复；`downloading` / `resolving` 重置为 `queued`（依赖 F2 `.part`）；`completed` / `failed` / `cancelled` 按裁剪策略保留。队列级 `paused` 标志**不**持久化，启动后始终可继续跑 |
| 终态任务 | 保留最近 50 条 `completed`/`failed`/`cancelled`，更早的启动时裁剪 |

持久化至少包含：`id`、`url`、`source`、`status`、`done`、`total`、`error`、`createdAt`、`updatedAt`；若有 `manifestId` / `selectedIds`（Telegram 勾选下载）一并保存，否则重启后无法恢复该类任务。若任务已有部分文件清单则一并保存以便续下。

说明：当前 `QueueTaskStatus` **没有** `paused` 任务态；暂停是 `DownloadQueue` 实例级布尔。持久化设计不得引入虚构的任务 `paused` 状态。

**验收：** 排队或下载中杀进程重启 → 任务重新入队并续传；排队中的 URL 不丢失。

### 2.3 F4 + U2 全局下载坞

- 新建 `src/renderer/components/DownloadDock.tsx`，在 `App` 壳层挂载（跨 Tab 常驻）
- 数据源：已有 `queue:update` 广播（不新增 IPC）
- UI：右下角可折叠浮窗 — 活动任务数、总进度、速度/ETA（有则显示）；展开为简要任务列表；入口「打开下载页」
- Tab 徽标：「下载」导航按钮显示进行中数量
- 完成：用现有 Toast；系统通知非本阶段硬依赖

**验收：** 切到库/设置仍可见进度；折叠/展开不影响下载。

### 2.4 测试承接

- F2：`.part` 存在时续传带 Range；完成后无残留 `.part`
- F3：写盘 → 新 `DownloadQueue` 实例 load → `downloading` 变为 `queued`
- 失败任务仍写入 `error`，不静默吞掉

---

## 数据模型补充

### `AppSettings` 变更

```ts
theme: 'system' | 'light' | 'dark'  // 新增，默认 'system'
// 删除：openAfterDownload
```

### `userData/queue.json`（新建）

```json
{
  "updatedAt": "ISO-8601",
  "tasks": [
    {
      "id": "task_...",
      "url": "https://...",
      "source": "xchina",
      "status": "queued",
      "done": 0,
      "total": 0,
      "error": null,
      "manifestId": null,
      "selectedIds": null,
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    }
  ]
}
```

`status` 取值与现有 `QueueTaskStatus` 一致：`queued | resolving | downloading | completed | failed | skipped | cancelled`。

### 缩略图

- 缓存键仍为 `sha1(absPath|mtime|size|360)` 内容寻址，目录仍为 `{libraryRoot}/.thumbs/`
- 协议参数不变：`gallery-media://local/?path=...&thumb=1`

---

## 错误处理

| 场景 | 行为 |
|------|------|
| 渲染未捕获异常 | ErrorBoundary → 提示 + 重载 |
| 主进程未处理 Promise/异常 | 追加 `userData/logs/main.log` |
| HTTP 不支持 Range | 截断 `.part` 整包重下 |
| 队列文件损坏 | 启动时忽略坏文件，空队列启动，并打日志 |
| 缩略图生成失败 | 回退原图（现有协议行为） |

---

## Phase 1 总验收清单

1. 详情页大套图秒开且走缩略图；灯箱为原图
2. 暗色三态可用（跟随系统 / 亮 / 暗）
3. `Ctrl+1..4` / `Ctrl+K` / `Ctrl+N` / `?` / `Esc` 可用；输入框聚焦不误触
4. 杀进程重启后队列恢复并续传
5. 任意 Tab 可见下载进度（下载坞 + Tab 徽标）
6. `npm test` 绿；并发设置与实际一致；`adm-zip` / `openAfterDownload` 已移除

---

## 实现顺序（提交粒度建议）

1. Step 0：死代码 + 并发对齐 + ErrorBoundary/日志 + 基线测试
2. Step 1a：缩略图泛化 + GalleryPage
3. Step 1b：暗色主题
4. Step 1c：全局快捷键 + 帮助面板
5. Step 2a：`downloadFile` 流式 + `.part` + 测试
6. Step 2b：队列持久化 + 启动恢复 + 测试
7. Step 2c：`DownloadDock` + Tab 徽标 + Toast

每步应保持可编译、可运行；优先单功能提交。

## 后续（本设计不展开）

Phase 2 补齐标配（标签筛选、多维搜索、拖拽、虚拟滚动等）；Phase 3 差异化与分发（订阅、打包、跨平台）。详见调研报告第四、八章。
