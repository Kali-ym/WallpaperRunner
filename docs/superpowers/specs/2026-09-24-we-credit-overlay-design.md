# Wallpaper Engine 套图署名 Overlay 设计

**日期:** 2026-09-24  
**状态:** 待实现  
**前置:** `2026-08-09-wallpaper-engine-slideshow-design.md`、`2026-08-10-wallpaper-playlists-design.md`

## 目标

在 Wallpaper Engine 桌面轮播播放时，于画面**左上角**展示当前套图的：

1. 作者头像  
2. 作者名  
3. 套图名（`displayTitle` 优先，否则源标题）

视觉为**杂志 / 胶片署名**气质：轻量、可读、不抢壁纸主体。显示模式可在 WE 壁纸属性中切换，**默认常驻**。

## 已锁定决策

| 项 | 选择 |
|----|------|
| 出现位置 | 仅 WE 播放画面（非 Electron 灯箱 / 详情页） |
| 布局 | 左上角：头像 + 右侧两行文字 |
| 视觉风格 | 杂志 / 胶片感（细分隔线、字重对比、文字阴影；无厚重毛玻璃卡片） |
| 默认显示 | Always on（常驻） |
| WE 属性 | Combo：`always` / `fade` / `hidden` |
| 数据路径 | 同步写入 `playlist.json`；头像经现有 `/media/` 服务（图库根下 `.author-avatars/`） |
| 无头像 | 作者名首字圆形占位（单色底 + 字） |
| 无作者名 | 显示「未知作者」；套图名仍显示 |

## 非目标

- Electron 内灯箱 / 详情页署名改造  
- 把署名烧进图片文件  
- WE 内编辑作者 / 头像  
- 进度条、张数、播放控件  
- 多语言 WE 属性文案（沿用现有英文属性风格，如 `Info overlay`）

## 架构

```
LibraryStore + AuthorAvatarStore
        │
        ▼
syncWallpaperEngineProject (exportWallpaper.ts)
        │  playlist.json 增加 author / avatar
        │  project.json 增加 infooverlay 属性
        │  index.html / main.js 署名层 UI + 逻辑
        ▼
WE 工程目录 (+ myprojects 镜像)
        │
        ▼
mediaServer  GET /playlist.json
             GET /media/<相对路径>   ← 套图图 + .author-avatars/*
        │
        ▼
WE CEF: main.js 选套图时更新 #credit overlay
```

头像文件已在 `{downloadRoot}/.author-avatars/`，与套图同属 `galleryRoot`。现有 `/media/` 路径校验（禁止 `..`、必须在 root 下）即可服务 `.author-avatars/...`，**不必新增专用路由**；若相对路径为空则不请求图片。

## 数据模型

### `playlist.json` 套图条目扩展

```json
{
  "id": "telegram/123",
  "title": "显示标题",
  "author": "作者名",
  "avatar": ".author-avatars/ab12cd.webp",
  "favorite": false,
  "images": ["dirName/001.jpg"]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `author` | `string` | `meta.author \|\| entry.author \|\| ''`；空串时 UI 显示「未知作者」 |
| `avatar` | `string` | `AuthorAvatarRecord.relativePath` 规范为正斜杠；无记录则为 `""` |

`title` 规则不变：`displayTitle?.trim() \|\| title`。

同步时：对每条 gallery 用作者名查 `AuthorAvatarStore`（或等价批量 map），写入 `avatar`。作者改名 / 头像更新后，依赖现有 `scheduleWallpaperSync` 刷新 `playlist.json`。

### TypeScript 类型

`WallpaperPlaylistGallery` 增加：

```ts
author: string
avatar: string
```

## UI / 视觉规格

### DOM

在 `index.html` 的 `#stage` / `#status` 旁增加：

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

- `#status` 仍仅用于加载 / 错误提示（左下），与署名分离。  
- `pointer-events: none`；`z-index: 20`（与 `#status` 同级即可）。  
- 显隐**只用** `opacity` + `.is-visible`（不用 HTML `hidden`），以便淡入淡出动画。

### 样式（杂志 / 胶片）

- 位置：`fixed; top: 28px; left: 32px;`（安全边距，避免贴边）  
- 横向 flex：头像 → 1px 竖线 → 文字列；`gap: 14px`；`align-items: center`  
- 头像：`44×44`；`border-radius: 50%`；细白边 `rgba(255,255,255,0.35)`；`object-fit: cover`  
- 竖线：高 `36px`，宽 `1px`，`rgba(255,255,255,0.28)`  
- 作者名：`12px`，`letter-spacing: 0.12em`，**不做** `text-transform: uppercase`（中英文原样），`opacity: 0.72`，字重 400  
- 套图名：`16px`，字重 600，`opacity: 0.95`，单行 ellipsis，`max-width: min(36vw, 420px)`  
- 文字：`color: #f4f1ea`；`text-shadow: 0 1px 2px rgba(0,0,0,0.75), 0 0 18px rgba(0,0,0,0.45)`  
- **无**半透明大底板 / backdrop-filter 卡片  
- 字体：`"Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`  
- 显隐：默认 `opacity: 0`；`.credit.is-visible { opacity: 1 }`；`transition: opacity 400ms ease`

### 无头像占位

- 隐藏 `<img>`，显示 fallback：背景 `rgba(255,255,255,0.12)`，文字为作者名首个可见字符（trim 后；空则 `?`），字号约 16px，居中。

## WE 属性

在 `buildProjectJson` 的 `general.properties` 增加（`order` 接在现有项之后，如 8）：

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
}
```

`main.js`：

- `state.infoOverlay`: `'always' | 'fade' | 'hidden'`，默认 `'always'`  
- `wallpaperPropertyListener.applyUserProperties` 读取 `properties.infooverlay`  
- 切换模式时立即按当前套图刷新署名可见性

### 模式行为

| 值 | 行为 |
|----|------|
| `always` | 有套图播放时 `#credit` 常显；换套时更新内容（可轻微 fade 换文案） |
| `fade` | 每次 `pickGallery` / 换套时显示，**4 秒**后淡出；同套内翻页不重置计时 |
| `hidden` | 去掉 `.is-visible`；DOM 文案仍可随换套更新，但不请求头像（清 `img.src`）以省请求 |

换套更新署名的时机：与现有开始播某套、曾 `setStatus('[pool] title')` 的路径对齐（`runLoop` 选中 gallery 后立刻 `updateCredit(g)`）。

## 运行时逻辑（`main.js`）

1. `updateCredit(gallery)`  
   - 写作者名、标题  
   - 有 `avatar`：`img.src = mediaBase + '/media/' + encodeURIComponent(avatar).replace(...路径分段编码与现有图片一致)`；显示 img，藏 fallback  
   - 无 `avatar`：清 src，显示 fallback 首字  
   - 按 `state.infoOverlay` 决定 visible / 启动 fade timer  
2. 头像 `onerror`：回退到 fallback，避免裂图  
3. `fade` 模式：换套清旧 timer，再设 4000ms 后去掉 `is-visible`  
4. playlist 刷新导致同一套 id 不变时：不必闪烁；仅当 gallery id 变化或首次显示时按模式处理（always 下只更新 DOM 文案）

图片 URL 编码须与现有 `images` 路径处理一致（斜杠分段 encode），避免头像路径含特殊字符失败。

## 错误与边界

| 情况 | 处理 |
|------|------|
| `author` 空 | UI「未知作者」；fallback 字 `?` |
| `avatar` 空或 404 | 占位首字，不打断轮播 |
| `title` 空 | 显示 `g.title || g.id`（与现有 status 回退一致） |
| 媒体服务未起 | 头像失败走 fallback；轮播失败仍由现有 status 提示 |
| 旧 `playlist.json` 无新字段 | 读时 `author = g.author \|\| ''`，`avatar = g.avatar \|\| ''` |

## 测试

| 用例 | 期望 |
|------|------|
| 导出含 author/avatar | 有头像作者写入相对路径；无头像 `avatar: ""` |
| `WallpaperPlaylistGallery` 类型 / 快照 | 字段齐全 |
| 模板含 `#credit` 与 `infooverlay` | `INDEX_HTML` / `buildProjectJson` 断言 |
| `updateCredit` 逻辑（可抽纯函数测 URL / 文案） | 可选；至少 exhaustion / zoomThrough 类测试不因模板改动失败 |
| 手动：WE 三档属性 | always / fade(4s) / hidden |

同步后需在 WE 中重新应用壁纸或确认 myprojects 镜像已更新（现有 mirror 流程）。

## 实现触及文件

| 文件 | 改动 |
|------|------|
| `src/main/wallpaper/exportWallpaper.ts` | 类型 + 导出 `author`/`avatar`；`syncWallpaperEngineProject` 增加可选 `AuthorAvatarStore`（或 `Map<author, relativePath>`）参数 |
| `src/main/wallpaper/templateFiles.ts` | HTML/CSS、MAIN_JS、`buildProjectJson` |
| `src/main/ipc.ts`、`scripts/sync-wallpaper.ts` | 调用 sync 时传入已有 `authorAvatarStore` / 等价数据 |
| `tests/wallpaper/*` | 导出与模板回归 |
| `scripts/we-media-server.mjs` | 仅当独立脚本路径逻辑与主服务不一致时对齐（通常已同 galleryRoot，无需改） |

## 验收标准

1. WE 播放时左上角可见头像（或占位）、作者名、套图名，杂志/胶片风格，无厚底板。  
2. WE 属性 `Info overlay` 默认 Always on；fade / hidden 行为符合上表。  
3. 同步后无头像作者不裂图；有头像者能加载。  
4. 不改变现有选池、耗尽随机、横竖图布局行为。
