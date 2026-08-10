# Phase 4 UI 皮肤与壳层设计

**日期:** 2026-08-10  
**状态:** 实现中  

## 锁定

- 布局：浏览主壳 + 左轨（全部/收藏/作者/播放列表）；顶栏品牌·搜索·获取·设置
- 主题：**亮暖色默认**（暖纸）；暗色次级
- 分类：作者为主；tag 降级

## 色板（亮）

- bg `#F7F1E8` / panel `#FFFBF5` / text `#2A241C` / muted `#7A6F63` / line `#E5D9C8` / accent `#C47A2C`

## App 状态

- `mode: browse | acquire | settings`
- `browseSelection: { kind: all|favorite|author|playlist, id? }`
