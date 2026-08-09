import { useEffect, useState, type JSX } from 'react'
import { useToast } from '../lib/toast'
import { api, type AppSettings, type TelegramAuthStatus } from '../lib/api'

function tgBadge(state: TelegramAuthStatus['state'] | undefined): { label: string; tone: string } {
  switch (state) {
    case 'authorized':
      return { label: '已登录', tone: 'ok' }
    case 'need_code':
      return { label: '等待验证码', tone: 'warn' }
    case 'need_password':
      return { label: '等待 2FA', tone: 'warn' }
    case 'connecting':
      return { label: '连接中', tone: 'warn' }
    case 'error':
      return { label: '错误', tone: 'bad' }
    default:
      return { label: '未连接', tone: 'muted' }
  }
}

export default function SettingsPage(): JSX.Element {
  const toast = useToast()
  const [settings, setSettings] = useState<AppSettings | null>(null)
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
    toast.success('已保存')
  }

  if (!settings) return <p className="muted">加载设置…</p>

  const badge = tgBadge(tgStatus?.state)

  return (
    <section className="page settings-page">
      <h2 className="page-title">设置</h2>

      <section className="settings-section">
        <h3 className="settings-section-title">通用</h3>
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
        <label className="field checkbox">
          <input
            type="checkbox"
            checked={settings.openAfterDownload}
            onChange={(e) => void save({ openAfterDownload: e.target.checked })}
          />
          <span>下载完成后自动打开该套图（预留）</span>
        </label>
        <div className="page-toolbar">
          <button
            type="button"
            className="btn"
            onClick={() =>
              void api.rebuildLibrary().then((list) => toast.success(`索引已重建：${list.length} 部`))
            }
          >
            从磁盘重建索引
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-section-title">网络</h3>
        <label className="field">
          <span>HTTP 代理（如 http://127.0.0.1:7890；留空则直连）</span>
          <input
            className="text-input"
            value={settings.proxyUrl}
            placeholder="http://127.0.0.1:7890"
            onChange={(e) => setSettings({ ...settings, proxyUrl: e.target.value })}
            onBlur={() => void save({ proxyUrl: settings.proxyUrl })}
          />
        </label>
      </section>

      <section className="settings-section">
        <div className="settings-section-head">
          <h3 className="settings-section-title">Telegram</h3>
          <span className={`status-badge tone-${badge.tone}`}>{badge.label}</span>
        </div>
        <p className="muted field-hint">
          在{' '}
          <a href="https://my.telegram.org" target="_blank" rel="noreferrer">
            my.telegram.org
          </a>{' '}
          申请 api_id / api_hash。Session 保存在本机；代理沿用上方设置。
          {tgStatus?.username ? ` 当前 @${tgStatus.username}` : ''}
          {tgStatus?.error ? ` · ${tgStatus.error}` : ''}
        </p>

        <p className="settings-steps muted">1. 凭据 → 2. 手机号发码 → 3. 验证码 / 2FA</p>

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
          <span>手机号（含国际区号）</span>
          <input
            className="text-input"
            value={phone}
            placeholder="+86..."
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <label className="field">
          <span>验证码</span>
          <input
            className="text-input"
            value={code}
            placeholder="12345"
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <label className="field">
          <span>两步验证密码（如开启）</span>
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
                toast.info(s.state === 'authorized' ? '已连接 Telegram' : `状态：${s.state}`)
              })
            }
          >
            连接 session
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
                for (let i = 0; i < 30; i++) {
                  await new Promise((r) => setTimeout(r, 500))
                  const cur = await api.telegramStatus()
                  setTgStatus(cur)
                  if (cur.state === 'need_code') {
                    toast.info('请填写验证码后提交')
                    break
                  }
                  if (cur.state === 'need_password') {
                    toast.info('请填写两步验证密码')
                    break
                  }
                  if (cur.state === 'authorized') {
                    toast.success('登录成功')
                    break
                  }
                  if (cur.state === 'error') {
                    toast.error(cur.error || '登录失败')
                    break
                  }
                }
                void api.telegramWaitLogin().then((final) => {
                  setTgStatus(final)
                  if (final.state === 'authorized') toast.success('登录成功')
                })
              })()
            }
          >
            发送验证码
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              void (async () => {
                if (!code.trim()) {
                  toast.error('请先填写验证码')
                  return
                }
                try {
                  await api.telegramSubmitCode(code.trim())
                  const final = await api.telegramWaitLogin()
                  setTgStatus(final)
                  if (final.state === 'authorized') toast.success('登录成功')
                  else if (final.state === 'need_password') toast.info('请填写两步验证密码')
                  else if (final.error) toast.error(final.error)
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : String(err))
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
                void api.telegramWaitLogin().then((final) => {
                  setTgStatus(final)
                  if (final.state === 'authorized') toast.success('登录成功')
                })
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
                toast.info('已登出 Telegram')
              })
            }
          >
            登出
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-section-title">Wallpaper</h3>
        <p className="muted field-hint">
          媒体端口 {settings.wallpaperMediaPort}。开机自启：{startupOn ? '已开启' : '未开启'}。
          在 Wallpaper Engine 中导入工程目录的 index.html。
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
        <div className="page-toolbar wrap">
          <button
            type="button"
            className="btn primary"
            onClick={() =>
              void api.syncWallpaper().then((r) => {
                toast.success(`已同步 ${r.galleryCount} 套 / ${r.imageCount} 张`)
              })
            }
          >
            立即同步
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void api.openWallpaperDir().then(() => toast.info('已打开工程目录'))}
          >
            打开工程目录
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              void api.installWallpaperStartup().then((r) => {
                setStartupOn(true)
                toast.success(`已安装开机自启：${r.path}`)
              })
            }
          >
            安装开机自启
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              void api.uninstallWallpaperStartup().then((r) => {
                setStartupOn(r.installed)
                toast.info(r.removed ? '已卸载开机自启' : '未找到开机自启项')
              })
            }
          >
            卸载开机自启
          </button>
        </div>
      </section>
    </section>
  )
}
