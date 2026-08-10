# Phase 3b 订阅更新设计

**日期:** 2026-08-10  
**状态:** 已实现  
**前置:** Phase 3a  
**决策:** URL 级订阅 + 手动/定时检查；新套图或张数增加则 overwrite 入队

## 目标

**F10 MVP**：用户收藏若干来源 URL，检查更新时自动入队增量。

## 非目标

- 站点搜索词订阅、标签规则引擎、F11 pHash
- 独立后台守护进程（仅应用运行时定时）

## 模型

`userData/subscriptions.json`：`{ subscriptions: Subscription[] }`

字段：`id, url, label, enabled, createdAt, lastCheckedAt?, lastStatus?, lastError?, lastGalleryId?, lastImageCount?`

## 检查逻辑

1. resolveAdapter → 若 `needsSelection` → `skipped`
2. parseGallery
3. 库中不存在或本地张数 < 解析张数 → enqueue overwrite，`updated`
4. 否则 `ok`

## UI / 调度

- 下载页订阅区块
- `subscriptionCheckHours`（默认 6，0=仅手动）

## 验收

- 新套图检查入队；已完整则 ok；测试绿
