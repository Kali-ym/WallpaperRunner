# WallpaperRunner 稿面 UI 像素级还原

**日期:** 2026-08-10  
**状态:** 已批准（用户授权按推荐执行，不再逐段确认）  
**参考:** `docs/index.html`

## 目标

将 Electron 渲染层 UI 对齐 `docs/index.html` 的桌面壳与主流程视觉/结构；功能行为保持现有 IPC/状态逻辑。

## 决策锁定

| 项 | 选择 |
|----|------|
| 还原深度 | 像素级（结构 + 视觉） |
| 实现路径 | 移植稿面 CSS + 对齐 React className/DOM |
| 主题 | 双主题：深色对齐稿面；浅色同结构推导 token |
| 扩展功能 | 阶段一严格跟稿（筛选/查重/多选/密度等入口暂藏）；阶段二再以稿面风格补回 |
| 默认视觉 | 深色为主参考；偏好仍支持 system/light/dark |

## 主壳结构

```
.app
├── .header（品牌 SVG+名 | 搜索胶囊 | 获取/设置 icon-btn）
└── .body
    ├── .rail（全部/收藏/作者/播放列表/新建）
    └── .main
        ├── .view#browse | gallery | acquire | settings
        └── .dock
```

## Token

- 深色：直接采用稿面 oklch 变量（`--bg` `--surface` `--fg` `--accent` 等）
- 浅色：同色相推导；并设兼容别名 `--text←--fg`、`--panel←--surface`、`--line←--border`
- 字体：稿面 Display/Body 系统栈；Mono 保留 JetBrains/Cascadia

## 阶段一页面

1. **顶栏**：品牌回首页；搜索仅 browse；获取/设置图标按钮 + 下载中圆点
2. **侧栏**：rail-item + count；作者 avatar 首字；新建播放列表虚线按钮
3. **浏览**：toolbar 标题/meta + 排序组；grid 卡片 cover 16:10；空态；拖入导入保留
4. **详情**：gallery-head / thumb-grid
5. **获取**：segment-tabs 入队/队列/订阅；surface-card；任务列表
6. **设置**：settings-nav + settings-section
7. **Dock**：`.dock` 摘要/进度/展开列表

## 阶段一明确不做

- 筛选面板、查重抽屉、多选、紧凑/列表密度入口（逻辑可留，UI 隐藏）
- 浅色主题的逐像素硬编码叠加层精修（靠 token + 关键覆盖）

## 风险

- 旧 class（`app-shell`、`gallery-card`、`btn primary`）需迁移或别名
- 稿面大量 `oklch(100% 0 0 / …)` 硬编码偏深色；浅色依赖覆盖层
- HMR/全量 CSS 替换后需人工扫主流程

## 验收

- 深色下主壳与浏览/详情/获取/设置/Dock 视觉接近 `docs/index.html`
- 浅色可切换且可读、结构一致
- 现有下载/库/设置功能不回归
- 扩展入口不可见但不破坏后续补回
