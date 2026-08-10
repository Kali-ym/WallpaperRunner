# Phase 2c 规模与去重设计

**日期:** 2026-08-10  
**状态:** 已实现  
**前置:** Phase 2b  
**决策:** 轻量历史文件 + 首图指纹去重 + 无新依赖的窗口虚拟列表

## 目标

1. **F7 历史**：最近下载 / 最近浏览 / 最近搜索可回看
2. **F9 重复检测**：按套图首图内容指纹分组，库页可查重
3. **I4**：库网格虚拟窗口渲染 + 方向键焦点导航

## 非目标

- pHash 相似图、分辨率过滤、播放列表拖拽排序
- 引入 @tanstack/react-virtual 等新依赖
- 分页 IPC（仍全量 list，渲染层窗口化）

## F7

- `userData/history.json`：`{ browsed: HistoryRef[], searches: string[] }`
- 打开套图详情时 `history:recordBrowse`
- 库搜索提交时 `history:recordSearch`（或本地先写再同步）
- 库页顶部「最近」条：最近浏览 8 + 最近下载（`downloadedAt` 倒序 8）
- 搜索框下拉最近搜索（最多 10）

## F9

- `GalleryMetadata.contentFingerprint`：首图文件 sha1（空套图无指纹）
- 入库/重建时尽力计算；`library:scanFingerprints` 可补算缺失
- `library:findDuplicates` → `{ fingerprint, galleries[] }[]`（仅 ≥2）
- 库工具栏「查找重复」→ 结果列表，可跳转打开

## I4

- `VirtualGalleryGrid`：按滚动位置只挂载可见行 ± overscan
- 网格方向键：←→↑↓ 移动焦点，Enter 打开，Home/End

## 验收

- 打开过的套图出现在最近浏览
- 相同首图内容的两套可被查重检出
- 大库（数百项）滚动时 DOM 节点数受控
- `npm test` 绿
