# 套图下载器与本地查看器

Electron + React 桌面应用：支持通过可扩展来源适配器下载套图原图，并在本地浏览。

## 开发运行

```bash
# 如 Electron 下载失败，可先设置镜像：
# Windows PowerShell:
#   $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"

npm install
npm test
npm run dev
```

## 使用

1. 打开「下载」页，粘贴一个或多个套图 URL（换行/逗号分隔）
2. 首版支持 `https://xchina.co/photo/id-xxxx.html`
3. 下载完成后在「库」中搜索、浏览；大图支持 `←` `→` `Esc` `F`

## 代理

默认代理：`http://127.0.0.1:7890`（可在「设置」修改）。  
应用内走 Electron/Chromium 网络栈；命令行脚本在 Windows 上优先用 `curl.exe`（避免 Cloudflare 拦截 Node undici）。

## 扩展新来源

在 `src/main/adapters/` 新增适配器，实现 `SourceAdapter`，并在 `src/main/ipc.ts` 的 `initAppServices` 中 `registerAdapter(...)`。
