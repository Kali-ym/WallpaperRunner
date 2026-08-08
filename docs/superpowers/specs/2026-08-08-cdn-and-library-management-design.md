# CDN 自动识别与本地库管理 — 设计规格

日期：2026-08-08  
状态：待用户审阅  
前置规格：`docs/superpowers/specs/2026-08-08-gallery-downloader-viewer-design.md`

## 1. 目标

在现有 Electron 套图库上增量完成：

1. **CDN 自动识别**：不再依赖 `/photos/` 路径白名单，避免 `photos2` 等变体漏解析  
2. **套图管理**：删除、重下、清理空壳、改显示标题、★ 收藏与筛选、批量操作、打开文件夹  
3. **照片管理**：删单张、设封面、批量删图  

## 2. 决策摘要

| 项 | 选择 |
| --- | --- |
| CDN 策略 | 限定套图容器抽取 + 黑名单排除（非路径白名单） |
| 管理能力 | 增强：删套图/重下/空壳清理/改名/收藏/批量 + 删图/封面/批量删图 |
| 重命名 | 只改显示名（metadata），文件夹名不变 |
| 收藏 | 仅 ★ 星标 +「仅收藏」筛选 |
| 不做 | 自定义本地标签、已读状态、改磁盘文件夹名、拖拽排序 |

## 3. CDN 自动识别

### 3.1 抽取规则

1. 仅从 `.list.photo-items .item.photo-image` 提取图片 URL  
2. 优先 `.img` 的 `background-image:url(...)`；可兜底 `img[src]` / `data-src`  
3. **取消**「URL 必须包含 `/photos/`」类白名单；`photos`、`photos2`、`photos3`… 均应可解析  
4. **黑名单**排除非套图资源，例如：  
   - `upload.xchina.io`（模特头像等）  
   - 明显广告/统计域名  
   - 站点 logo / 静态资源路径（如 `/images/sites/`）  
5. 升原图：保留 `_\\d+x\\d+.(webp|jpg|…)` → `.jpg` 等规则；目录前缀跟随缩略图（不改写 `photos`↔`photos2`）  
6. 若整套解析结果 `images.length === 0`：任务 **失败**，禁止写入「完成且 0 张」的空壳  

### 3.2 与现网差异说明

此前过滤 `/photos/` 是为了躲开头像/广告，但误伤了 CDN 的 `photos2` 路径。改为「容器限定 + 黑名单」后，既挡杂质又自适应路径变更。

## 4. 套图与照片管理

### 4.1 数据模型扩展

`metadata.json` / `library.json` 条目增加：

- `favorite: boolean`（默认 `false`）  
- `displayTitle?: string`（有则列表/标题优先显示；无则用 `title`）  

唯一键仍为 `(source, galleryId)`。磁盘目录名 `{source}_{id}_{原始标题消毒}` **不因重命名而改变**。

### 4.2 套图管理

| 能力 | 行为 |
| --- | --- |
| 删除套图 | 确认后删除整目录，并从索引移除 |
| 重新下载 | 覆盖下载（可先清空图文件再下）；更新 metadata |
| 清理空壳 | 删除所有 `images.length === 0` 的库条目及空目录 |
| 重命名 | 只写 `displayTitle`（及索引），不改文件夹 |
| 收藏 | 切换 `favorite`；库筛选：全部 / 仅收藏 |
| 打开文件夹 | 系统文件管理器打开该套图目录 |
| 批量 | 多选：批量删除、批量收藏/取消收藏 |

### 4.3 照片管理

| 能力 | 行为 |
| --- | --- |
| 删除单张 | 删除文件，从 `images` 移除；若删的是封面则改指剩余第一张或 `null` |
| 设为封面 | `cover` = 该图相对路径 |
| 批量删图 | 多选后删除 |
| 文件命名 | 本版不强制重编号磁盘文件名；**以 metadata `images` 顺序为准**展示 |

浏览（缩略图、Lightbox、快捷键）保持不变。

### 4.4 IPC / UI 落点（概念）

主进程 `LibraryStore` 增补对应方法；preload `window.api` 暴露：

- `deleteGallery` / `deleteGalleries`  
- `renameGallery` / `setFavorite` / `setFavorites`  
- `deleteImages` / `setCover`  
- `openGalleryFolder` / `cleanupEmptyGalleries`  
- `redownloadGallery`（入队且 `overwrite: true`）  

渲染进程：库页多选与操作条；详情页多选与封面/删除；确认对话框。

## 5. 错误处理

- 删除类操作需确认；权限/占用失败时明确提示，避免静默半删  
- 重下失败：任务失败；尽量保持库仍可打开已有文件  
- 解析 0 张：失败不入库；已有空壳靠「清理空壳」处理  
- 收藏/改名写盘失败：UI 回滚并提示  

## 6. 验收标准

1. 含 `/photos/` 与 `/photos2/`（及同类目录）的套图均可解析并下到原图  
2. 库支持删套图、改显示名、★ 收藏与筛选、批量删/收藏、打开文件夹、清理空壳  
3. 套内支持删单张、设封面、批量删图；列表与封面立即更新  
4. 重命名后文件夹名不变，显示名更新  
5. 不再出现「任务完成但 0 张」的新空壳  

## 7. 非目标（本版明确不做）

- 自定义本地标签、已读/未读  
- 重命名磁盘文件夹  
- 照片拖拽排序 / 强制磁盘重编号  
- 新站点适配器（仍走既有 Source Adapter 扩展口）  

## 8. 实现备注

- 优先改 `src/main/adapters/xchina/parsePage.ts` 的过滤逻辑与单测（含 `photos2` fixture）  
- 管理能力落在 `src/main/library/store.ts`、`src/main/ipc.ts`、库/详情页 UI  
- 回归：现有下载队列、代理/curl 通道、Lightbox 行为不被破坏  
