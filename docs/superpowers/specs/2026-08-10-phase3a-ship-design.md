# Phase 3a 分发与首次引导设计

**日期:** 2026-08-10  
**状态:** 已实现  
**前置:** Phase 2c  
**决策:** 先可分发 + 首次可用；订阅(F10)/以图搜图(F11) 放到 3b/3c

## 目标

1. **I7 Onboarding**：首次启动三步向导（下载目录 / 代理 / 来源说明）
2. **跨平台 HTTP**：curl 失败或非 Windows 时稳定回落 undici（不依赖「必须有代理」）
3. **U6 打包基础**：electron-builder + Windows NSIS；应用显示名；预留更新配置（本波不接 GitHub Releases 自动更新）

## 非目标

- F10 订阅、F11 pHash、electron-updater 完整流水线
- macOS/Linux 安装包（配置写好，本波主验 Windows）
- WE 集成抽象重构

## I7

- `AppSettings.onboardingDone: boolean`（缺省 false；已有 settings.json 且无此字段 → 视为 true，避免老用户被打断）
- 首启全屏/居中模态：
  1. 欢迎 + 选择下载根目录（可保持默认）
  2. 代理：预填当前值；「使用本地代理 7890」「直连」「自定义」；保存后生效
  3. 来源能力简介（xChina / Telegram / Telegraph）+ 完成
- 设置页提供「重新打开引导」

## HTTP

- `httpFetch`：Windows 上 curl 失败后**无条件**回落 undici
- 非 win32：默认 undici；若存在 `curl` 可作可选加速（不强制）
- 单测覆盖：curl 抛错时仍走 undici

## U6

- `electron-builder`：`appId` / `productName: WallpaperRunner` / NSIS
- `npm run dist` 产出安装包；图标可用简单 PNG/ICO（resources/）
- `publish: null`；README/注释说明后续接 `electron-updater` + GH Releases

## 验收

- 清空 onboardingDone 后启动出现向导；完成后不再出现
- curl mock 失败时 undici 成功
- `npm test` 绿；`npm run dist` 能启动打包（若环境缺 wine/签名则至少配置与 `pack` 目录产物可用）
