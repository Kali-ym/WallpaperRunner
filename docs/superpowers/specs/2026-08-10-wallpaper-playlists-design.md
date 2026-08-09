# Wallpaper 播放列表与耗尽随机设计

**日期:** 2026-08-10  
**状态:** 已实现  
**前置:** `2026-08-09-wallpaper-engine-slideshow-design.md`

## 目标

1. **耗尽随机**：同一播放池内跑完所有套图后再重复；每播完一套打标，再从未标记集合中随机抽取。
2. **多播放列表**：在应用内创建/管理列表（引用式），同步到 Wallpaper Engine；WE 设置下拉可选「全部 / 仅收藏 / 自定义列表」。

## 已锁定决策

| 项 | 选择 |
|----|------|
| 列表管理 UI | 独立「播放列表」页；库右键可「加入播放列表…」 |
| WE 选池 | 下拉：`all` / `favorites` / `pl_<id>`… |
| 已播标记范围 | 每个池各自一套进度，互不影响 |
| 列表与套图关系 | 引用式（存 source+galleryId）；同步时展开最新图片 |
| 实现架构 | 应用写元数据 + 同步展开；WE 本地耗尽随机（不依赖 Electron 常驻） |

## 非目标（本阶段）

- 列表内手动排序影响播放顺序
- 在 WE 内编辑列表
- 应用内展示「已播进度」
- 快照式固化图片路径
- 每个自定义列表单独 WE 工程目录

## 数据模型

### 应用本地：`{downloadRoot}/playlists.json`

```json
{
  "updatedAt": "ISO-8601",
  "playlists": [
    {
      "id": "pl_xxx",
      "name": "竖图精选",
      "galleryRefs": [
        { "source": "telegram", "galleryId": "123" }
      ],
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    }
  ]
}
```

- 同一套图可属于多个列表
- 库删除套图时：清理所有列表中的悬空 `galleryRefs`
- 空列表允许保存

### 同步产物：WE 工程目录 `playlist.json`

在现有结构上扩展：

```json
{
  "updatedAt": "ISO-8601",
  "mediaBase": "http://127.0.0.1:17989",
  "galleries": [
    {
      "id": "telegram/123",
      "title": "显示标题",
      "favorite": false,
      "images": ["dirName/001.jpg"]
    }
  ],
  "playlists": [
    {
      "id": "pl_xxx",
      "name": "竖图精选",
      "galleryIds": ["telegram/123"]
    }
  ]
}
```

- `galleries`：仍为全库可播套图（`images.length > 0`）
- `playlists[].galleryIds`：引用 `galleries[].id`；同步时丢弃已不存在或无可播图片的引用

### WE `project.json` — `pool` 属性

同步时动态生成 `options`：

| value | text |
|-------|------|
| `all` | All galleries |
| `favorites` | Favorites only |
| `pl_<playlistId>` | 列表显示名 |

若用户当前选中的自定义列表已被删除，播放器回退到 `all`。

## 耗尽随机（WE `main.js`）

### 存储

- `localStorage` key：`gallerySeen:<poolValue>`  
  例如 `gallerySeen:all`、`gallerySeen:favorites`、`gallerySeen:pl_xxx`
- 值为 JSON 数组：已播完的 `gallery.id` 列表

### 选套图算法

1. 按当前 `pool` 得到候选集合 `candidates`  
   - `all`：全部有图套图  
   - `favorites`：`favorite === true`  
   - `pl_*`：`playlists` 中对应 `galleryIds` ∩ 有图套图
2. 读取该池 `seen`；过滤掉已不在 `candidates` 中的 id
3. `unseen = candidates - seen`
4. 若 `unseen` 为空：清空 `seen`，`unseen = candidates`
5. 从 `unseen` 均匀随机取一套；若仅一套且等于上一套且候选 > 1，允许再抽一次避免连播（可选，不破坏耗尽）
6. 该套**图片全部消费完毕**（或全部失败跳过）后，将其 id 写入 `seen`

### 与热更新的关系

- `playlist.json` 约 8s 重读
- 在 WE 中切换 Gallery pool：**立即中断**当前套图并换池；被中断的套图**不写入** `seen`（仍算未播完）
- 应用内改列表成员后，同步生效；若当前套图已不在池中，同样立即跳过且不记 `seen`

## 应用 UI

### 导航

主导航增加「播放列表」页（与库 / 下载 / 设置并列）。

### 播放列表页

- 左侧：列表名（新建 / 重命名 / 删除）
- 右侧：当前列表成员（封面缩略图 + 标题），可移除
- 「添加套图」：从库多选（可搜索；已在列表中的显示已选）
- 空列表可保存；WE 选中后若无可播成员则提示池为空

### 库页

- 右键套图：「加入播放列表…」→ 多选目标列表

## 同步时机

与现有 wallpaper 自动同步对齐（debounced）：

- 创建 / 重命名 / 删除列表
- 增删列表成员
- 库变更导致悬空引用清理
- 设置中「立即同步」

同步步骤：

1. 读取库索引 + `playlists.json`
2. 写出 `playlist.json`（galleries + playlists）
3. 重写 `project.json`（含动态 pool options）
4. 刷新 `index.html` / `main.js`（含耗尽随机逻辑）

媒体服务与开机自启逻辑不变。

## IPC / 存储（实现要点）

- `PlaylistStore`（或等价模块）：读写 `playlists.json`；CRUD；加入/移除成员；清理悬空引用
- IPC：`playlists:list` / `create` / `rename` / `delete` / `setMembers` / `addToPlaylists`
- 变更后 `emit` 库同类变更或直接 `scheduleWallpaperSync()`

## 验收标准

1. 同一池连续播放会扫过所有候选套图后才出现重复。
2. WE「Gallery pool」能看到新建列表，且只播放该列表成员。
3. 删除列表或改成员并同步后：下拉与播放行为正确；无效选中回退到 `all`。
4. 「全部」与「仅收藏」行为保留；各池 seen 互不干扰。
5. 删除库中套图后，各列表不再引用该套图；同步后 WE 池不再包含它。

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| 自定义列表很多导致 `project.json` options 过长 | 一般用户列表数量有限；必要时可后续加上限提示 |
| `localStorage` 被用户清掉 | 仅丢失耗尽进度，功能仍可用 |
| 旧 WE 工程未重新同步 | 「立即同步」刷新 `main.js` / `project.json` |
