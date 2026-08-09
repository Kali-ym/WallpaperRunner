# Telegram / Telegraph 渠道 — 设计规格

日期：2026-08-09  
状态：已确认

## 1. 目标

为现有 Electron 套图下载器增加两个来源：

1. **Telegram**（用户 MTProto / GramJS）：给定 `t.me/<channel>/<msgId>`，嗅探主帖与评论中的媒体
2. **Telegraph**：直接粘贴 `telegra.ph/...`，或从 Telegram 正文/评论中的链接展开

下载前先列出资源供用户勾选，再按所选落盘。

## 2. 决策摘要

| 项 | 选择 |
| --- | --- |
| 访问方式 | 用户账号 MTProto（GramJS），不用网页刮取 / Bot API |
| 凭证 | 用户自备 `api_id` / `api_hash`；应用内手机号 + 验证码 + 可选 2FA |
| Session | 存 Electron `userData`，不进 settings.json / git |
| 资源类型 | 图片、视频/动图、文件；Telegraph 文章内图/文件 |
| 评论 | 列出并可勾选；默认不勾选 |
| 主帖 | 默认全选媒体 |
| Telegraph | 帖内/评论展开 + 直接 URL；默认不勾选（除非直链入口仅 Telegraph） |
| xChina | 行为不变：粘贴即入队 |
| 代理 | 复用现有 `proxyUrl`（国内必需） |

## 3. 两阶段流程

1. **Discover**：解析 URL → `ResourceManifest`（主帖 / 评论 / Telegraph 分组）
2. **Download**：用户勾选 `resourceId[]` → 入队下载

主进程用 `Map<manifestId, handles>` 保存不可序列化的 GramJS 媒体引用；渲染进程只收到清单元数据。

## 4. 数据模型

- `ResourceKind`: `photo` | `video` | `animation` | `document` | `telegraph_image` | `telegraph_file`
- `ResourceOrigin`: `post` | `comment` | `telegraph`
- `ResourceManifest.groups`: `post[]` / `comments[]` / `telegraph[]`

落盘目录：`telegram_{channel}_{msgId}_{title}/` 或 `telegraph_{slug}_{title}/`，`metadata.json` 记录来源与勾选归属。

## 5. 非目标

- Bot API、网页预览回退
- 非 Telegraph 普通外链二次爬取
- 自动勾选全部评论
