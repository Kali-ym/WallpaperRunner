# Phase 2b 下载交互设计

**日期:** 2026-08-10  
**状态:** 已实现  
**前置:** Phase 2a  
**决策:** 方案 1；文件夹导入 = 一层一套图（无子目录则当前目录成套）

## 目标

1. **I3** 单任务：暂停/恢复、上移/下移、重试；失败原因内联（已有 error，强化展示）
2. **F8** 失败任务批量重试；部分失败套图一键补全（overwrite 入队）
3. **I2** 拖 URL → 下载页入队；拖本地文件夹 → 库导入

## 非目标

- 播放列表拖拽排序、分辨率过滤、虚拟滚动（2c）
- aria2 / 多线程分段

## I3 队列

- 新增任务状态 `paused`（持久化恢复时 `paused`→`queued`）
- `pauseTask(id)`：若 downloading/resolving 则 abort，状态→`paused`；若 queued 直接→`paused`
- `resumeTask(id)`：`paused`→`queued` 并 pump
- 全局 `pause()` 仍暂停调度；与单任务 `paused` 并存
- `moveTask(id, 'up'|'down')`：仅在 queued/paused 间调整顺序
- `retryTask(id)`：failed/cancelled → queued（清 error）
- IPC：`queue:pauseTask` / `resumeTask` / `moveTask` / `retryTask` / `retryAllFailed`

## F8

- `retryAllFailed()`：所有 failed → queued
- 补全：已有 `library:redownload(url, overwrite)`；Gallery/库右键保留；下载页增加「重试全部失败」

## I2

- 下载页：drop `text/uri-list` / `text/plain` → 解析 URL → 当前 source 入队（telegram/telegraph 仍需解析勾选则提示）
- 库页：drop 文件夹（Electron `File.path`）→ `library:importLocalFolders(paths)`
- 导入规则：对每个投放路径，若有含子图的直接子目录则各成套；否则当前目录图片成套。`source: 'local'`，复制图片到 downloadRoot，upsert metadata，sourceUrl=`file://...`

## 验收

- 单任务暂停后可恢复续传（.part）
- 失败可单条/批量重试
- 拖 URL 入队；拖文件夹出现在库中
- `npm test` 绿
