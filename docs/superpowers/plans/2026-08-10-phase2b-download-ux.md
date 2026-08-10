# Phase 2b 下载交互 Implementation Plan

> **For agentic workers:** Use executing-plans / subagent-driven-development.

**Goal:** 单任务控制、失败批量重试、拖 URL/文件夹导入。

**Architecture:** 扩展 DownloadQueue（paused 态 + move/retry）；库 `importLocalFolders`；Download/Library 页 drop 区。

**Tech Stack:** 既有 Electron/React/vitest。

**Spec:** `docs/superpowers/specs/2026-08-10-phase2b-download-ux-design.md`

### Task 1: Queue pause/move/retry + tests
### Task 2: IPC + QueueTaskRow UI + retry all failed
### Task 3: DownloadPage URL drop
### Task 4: importLocalFolders + LibraryPage folder drop
### Task 5: Verify + merge to dev
