import { useEffect, useState, type JSX } from 'react'
import { api, type AppSettings, type TelegramAuthStatus } from '../lib/api'

export default function SettingsPage(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [message, setMessage] = useState('')
  const [startupOn, setStartupOn] = useState(false)
  const [tgStatus, setTgStatus] = useState<TelegramAuthStatus | null>(null)
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    void api.getSettings().then(setSettings)
    void api.wallpaperStartupStatus().then((s) => setStartupOn(s.installed))
    void api.telegramStatus().then(setTgStatus)
  }, [])

  async function save(partial: Partial<AppSettings>): Promise<void> {
    const next = await api.setSettings(partial)
    setSettings(next)
    setMessage('已保存')
  }

  if (!settings) return <p className="muted">加载设置…</p>

  return (
    <section className="page settings-page">
      <h2 className="page-title">设置</h2>

      <label className="field">
        <span>下载根目录</span>
        <div className="row">
          <input className="text-input" readOnly value={settings.downloadRoot} />
          <button
            type="button"
            className="btn"
            onClick={() =>
              void api.pickDownloadRoot().then((root) => {
                if (root) void api.getSettings().then(setSettings)
              })
            }
          >
            选择…
          </button>
        </div>
      </label>

      <label className="field">
        <span>套内图片并发数</span>
        <input
          className="text-input narrow"
          type="number"
          min={1}
          max={8}
          value={settings.imageConcurrency}
          onChange={(e) =>
            setSettings({ ...settings, imageConcurrency: Number(e.target.value) || 1 })
          }
          onBlur={() => void save({ imageConcurrency: settings.imageConcurrency })}
        />
      </label>

      <label className="field">
        <span>HTTP 代理（翻墙客户端本地端口，如 http://127.0.0.1:7890；留空则直连）</span>
        <input
          className="text-input"
          value={settings.proxyUrl}
          placeholder="http://127.0.0.1:7890"
          onChange={(e) => setSettings({ ...settings, proxyUrl: e.target.value })}
          onBlur={() => void save({ proxyUrl: settings.proxyUrl })}
        />
      </label>

      <label className="field checkbox">
        <input
          type="checkbox"
          checked={settings.openAfterDownload}
          onChange={(e) => void save({ openAfterDownload: e.target.checked })}
        />
        <span>下载完成后自动打开该套图（预留，首版仅保存设置）</span>
      </label>

      <h3 className="page-subtitle">Telegram（MTProto）</h3>
      <p className="muted field-hint">
        在{' '}
        <a href="https://my.telegram.org" target="_blank" rel="noreferrer">
          my.telegram.org
        </a>{' '}
        申请 api_id / api_hash。登录 session 保存在本机用户目录。代理沿用上方 HTTP
        代理（Clash mixed-port / SOCKS5）。
        <br />
        状态：{tgStatus?.state ?? '…'}
        {tgStatus?.username ? ` · @${tgStatus.username}` : ''}
        {tgStatus?.error ? ` · ${tgStatus.error}` : ''}
      </p>

      <label className="field">
        <span>api_id</span>
        <input
          className="text-input"
          value={settings.telegramApiId}
          onChange={(e) => setSettings({ ...settings, telegramApiId: e.target.value })}
          onBlur={() => void save({ telegramApiId: settings.telegramApiId })}
        />
      </label>
      <label className="field">
        <span>api_hash</span>
        <input
          className="text-input"
          value={settings.telegramApiHash}
          onChange={(e) => setSettings({ ...settings, telegramApiHash: e.target.value })}
          onBlur={() => void save({ telegramApiHash: settings.telegramApiHash })}
        />
      </label>
      <label className="field">
        <span>手机号（含国际区号，如 +86…）</span>
        <input
          className="text-input"
          value={phone}
          placeholder="+86..."
          onChange={(e) => setPhone(e.target.value)}
        />
      </label>
      <label className="field">
        <span>验证码（Telegram App / 短信收到后填这里，再点「提交验证码」）</span>
        <input
          className="text-input"
          value={code}
          placeholder="12345"
          onChange={(e) => setCode(e.target.value)}
        />
      </label>
      <label className="field">
        <span>两步验证密码（若账号开启了 2FA 再填）</span>
        <input
          className="text-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <div className="page-toolbar wrap">
        <button
          type="button"
          className="btn"
          onClick={() =>
            void api.telegramConnect().then((s) => {
              setTgStatus(s)
              setMessage(s.state === 'authorized' ? '已连接 Telegram' : `状态：${s.state}`)
            })
          }
        >
          连接 / 恢复 session
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() =>
            void (async () => {
              await save({
                telegramApiId: settings.telegramApiId,
                telegramApiHash: settings.telegramApiHash,
              })
              const s = await api.telegramStartLogin(phone)
              setTgStatus(s)
              if (s.state === 'need_code') setMessage('请在下方填写验证码后点「提交验证码」')
              else if (s.state === 'authorized') setMessage('登录成功')
              else setMessage(`状态：${s.state}${s.error ? ` — ${s.error}` : ''}；若已收到验证码可直接填写并提交`)
              // Keep polling until code is requested or login finishes
              for (let i = 0; i < 30; i++) {
                await new Promise((r) => setTimeout(r, 500))
                const cur = await api.telegramStatus()
                setTgStatus(cur)
                if (cur.state === 'need_code') {
                  setMessage('请在下方填写验证码后点「提交验证码」')
                  break
                }
                if (cur.state === 'need_password') {
                  setMessage('请填写两步验证密码后点「提交 2FA」')
                  break
                }
                if (cur.state === 'authorized') {
                  setMessage('登录成功')
                  break
                }
                if (cur.state === 'error') {
                  setMessage(cur.error || '登录失败')
                  break
                }
              }
              void api.telegramWaitLogin().then((final) => {
                setTgStatus(final)
                if (final.state === 'authorized') setMessage('登录成功')
              })
            })()
          }
        >
          发送验证码 / 登录
        </button>
        <button
          type="button"
          className="btn"
          onClick={() =>
            void (async () => {
              if (!code.trim()) {
                setMessage('请先填写验证码')
                return
              }
              try {
                const s = await api.telegramSubmitCode(code.trim())
                setTgStatus(s)
                setMessage('已提交验证码，等待确认…')
                const final = await api.telegramWaitLogin()
                setTgStatus(final)
                if (final.state === 'authorized') setMessage('登录成功')
                else if (final.state === 'need_password') setMessage('请填写两步验证密码')
                else if (final.error) setMessage(final.error)
              } catch (err) {
                setMessage(err instanceof Error ? err.message : String(err))
              }
            })()
          }
        >
          提交验证码
        </button>
        <button
          type="button"
          className="btn"
          onClick={() =>
            void api.telegramSubmitPassword(password).then((s) => {
              setTgStatus(s)
              setMessage('已提交两步验证密码')
              void api.telegramWaitLogin().then(setTgStatus)
            })
          }
        >
          提交 2FA
        </button>
        <button
          type="button"
          className="btn"
          onClick={() =>
            void api.telegramLogout().then((s) => {
              setTgStatus(s)
              setMessage('已登出 Telegram')
            })
          }
        >
          登出
        </button>
      </div>

      <h3 className="page-subtitle">Wallpaper Engine 轮播</h3>
      <p className="muted field-hint">
        WE 读不了图库外的本地文件，需要本机媒体服务（端口 {settings.wallpaperMediaPort}）。
        <br />
        <strong>开机：</strong>
        安装「开机自启媒体服务」后，不必打开本应用，WE 也能播（需已安装 Node.js）。
        当前自启：{startupOn ? '已开启' : '未开启'}。
        <br />
        <strong>导入：</strong>
        壁纸编辑器 → 拖入工程目录的 <code>index.html</code> 创建网页壁纸；删除错误的「本地场景
        / project.json」。
      </p>

      <label className="field">
        <span>WE 工程目录</span>
        <div className="row">
          <input className="text-input" readOnly value={settings.wallpaperEngineDir} />
          <button
            type="button"
            className="btn"
            onClick={() =>
              void api.pickWallpaperDir().then((dir) => {
                if (dir) void api.getSettings().then(setSettings)
              })
            }
          >
            选择…
          </button>
        </div>
      </label>

      <label className="field checkbox">
        <input
          type="checkbox"
          checked={settings.wallpaperAutoSync}
          onChange={(e) => void save({ wallpaperAutoSync: e.target.checked })}
        />
        <span>图库变更时自动同步播放列表</span>
      </label>

      <div className="page-toolbar">
        <button
          type="button"
          className="btn primary"
          onClick={() =>
            void api.syncWallpaper().then((r) => {
              setMessage(
                `已同步：${r.galleryCount} 套 / ${r.imageCount} 张；媒体 ${'mediaBase' in r ? (r as { mediaBase: string }).mediaBase : ''}`,
              )
            })
          }
        >
          立即同步并启动媒体服务
        </button>
        <button
          type="button"
          className="btn"
          onClick={() =>
            void api.openWallpaperDir().then(() => setMessage('已打开 WE 工程目录'))
          }
        >
          打开工程目录
        </button>
        <button
          type="button"
          className="btn"
          onClick={() =>
            void api.installWallpaperStartup().then((r) => {
              setStartupOn(true)
              setMessage(`已安装开机自启：${r.path}`)
            })
          }
        >
          安装开机自启媒体服务
        </button>
        <button
          type="button"
          className="btn"
          onClick={() =>
            void api.uninstallWallpaperStartup().then((r) => {
              setStartupOn(r.installed)
              setMessage(r.removed ? '已卸载开机自启' : '未找到开机自启项')
            })
          }
        >
          卸载开机自启
        </button>
        <button
          type="button"
          className="btn"
          onClick={() =>
            void api.rebuildLibrary().then((list) => setMessage(`索引已重建：${list.length} 部`))
          }
        >
          从磁盘重建索引
        </button>
        {message ? <span className="muted">{message}</span> : null}
      </div>
    </section>
  )
}
