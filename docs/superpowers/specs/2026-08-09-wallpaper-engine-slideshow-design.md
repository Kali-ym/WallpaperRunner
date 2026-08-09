# Wallpaper Engine 图库轮播设计

**日期:** 2026-08-09  
**状态:** 已确认

## 目标

用本地图库驱动 Wallpaper Engine（WE）Web 壁纸：

- 随机选取一套图，按顺序播放
- 每张/每组停留 3–5 秒（可配置）
- 一套播完后随机下一套
- 池可选「全部套图」或「仅收藏」
- 竖图可多张同屏 / 平铺 / 模糊底（默认同屏）
- **WE 开机自启时不依赖 Electron 进程**

## 架构

```
gallery-library ──(启动/库变更)──► Electron WallpaperExporter
                                         │
                                         ▼
                         Documents/gallery-we-wallpaper/
                           project.json + index.html + main.js + playlist.json
                                         │
                                         ▼
                              Wallpaper Engine (独立读取)
                                         │
                                         ▼
                              file:/// 图库绝对路径
```

- 应用只负责生成/更新播放列表与工程文件
- 壁纸前端负责随机、计时、布局；列表约 30–60s 重读，**当前套图播完后再换池**

## 已锁定决策

| 项 | 选择 |
|----|------|
| 接入 | 本地 Web 壁纸（非官方 Slideshow） |
| 同步 | 应用运行时自动写 `playlist.json` |
| 图片存储 | 不复制；playlist 用绝对路径 |
| 开机 | 不依赖本地 HTTP / Electron 常驻 |
| 竖图默认 | 多张同屏；另可选平铺、单张模糊底 |

## playlist.json

```json
{
  "updatedAt": "ISO-8601",
  "galleries": [
    {
      "id": "source/galleryId",
      "title": "显示标题",
      "favorite": false,
      "images": ["C:\\\\Users\\\\...\\\\001.jpg"]
    }
  ]
}
```

- 仅含 `images.length > 0` 的套图
- `images` 为磁盘绝对路径（播放器内转 `file:///`）

## WE 属性

- `pool`: all | favorites
- `intervalMin` / `intervalMax`: 秒，默认 3–5
- `landscapeMode`: smart | cover | contain
- `portraitMode`: multi | tile | blur（默认 multi）
- `portraitColumns`: 0=自动，或 2–4 固定列

## 播放规则

1. 从池中随机套图（尽量不与上一套相同）
2. 顺序消费图片；竖图 multi 模式一次取 N 张同屏
3. 停留随机 ∈ [min, max] 秒
4. 失败跳过；套图耗尽或全失败 → 下一套
5. 横图：smart 在比例接近时 cover，差大时 contain+模糊底

## 如何加载到 Wallpaper Engine

1. 应用内设置 → **立即同步**（或自动同步）
2. Wallpaper Engine 底部：**打开壁纸** → **打开离线壁纸 (动态)**
3. 选择工程目录，例如 `%USERPROFILE%\Documents\gallery-we-wallpaper\`（内含 `project.json`、`index.html`、`main.js`、`playlist.json`）

注意：界面里没有「打开文件夹」入口；不要选「打开背景图片 (静态)」或「从 URL 打开」。

## 非目标

- Telegram / Workshop 上架
- 常驻 HTTP 图床
- 整库复制进 WE 目录
