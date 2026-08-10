# WallpaperRunner

套图下载 → 本地库 → Wallpaper Engine 轮播。

## 开发

```bash
npm install
npm run dev
```

## 测试

```bash
npm test
```

## 打包（Windows）

```bash
npm run dist
```

产物在 `release/`。自动更新（electron-updater + GitHub Releases）预留未接。Windows 打包若卡在签名工具下载，可保持 `signAndEditExecutable: false`（开发机默认）。

首次启动会显示引导（下载目录 / 代理 / 来源说明）。设置页可「重新打开首次引导」。
