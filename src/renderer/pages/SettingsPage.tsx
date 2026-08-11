import { useEffect, useState, type JSX } from 'react'
import { useToast } from '../lib/toast'
import { api, type AppSettings, type TelegramAuthStatus } from '../lib/api'
import { emitThemeChanged, type ThemePreference } from '../lib/theme'

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
  const [group, setGroup] = useState<'general' | 'network' | 'telegram' | 'wallpaper'>('general')

  useEffect(() => {
    void api.getSettings().then(setSettings)
    void api.wallpaperStartupStatus().then((s) => setStartupOn(s.installed))
    void api.telegramStatus().then(setTgStatus)
  }, [])

  async function save(partial: Partial<AppSettings>): Promise<void> {
    const next = await api.setSettings(partial)
    setSettings(next)
    if (partial.theme) emitThemeChanged(partial.theme)
    toast.success('已保存')
  }

  if (!settings) return <p className="muted">加载设置…</p>

  const badge = tgBadge(tgStatus?.state)
  const theme = settings.theme ?? 'system'

  return (
    <section className="page settings-page panel wide">
      <div className="work-shell">
        <div className="page-head">
          <div>
            <h2>设置</h2>
          </div>
        </div>

        <div className="work-layout settings-layout">
          <nav className="work-nav settings-nav" aria-label="设置分组">
            <div className="work-nav-label">分组</div>
            {(
              [
                ['general', '通用'],
                ['network', '网络'],
                ['telegram', 'Telegram'],
                ['wallpaper', '壁纸'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={group === id ? 'work-nav-btn settings-nav-btn active' : 'work-nav-btn settings-nav-btn'}
                onClick={() => setGroup(id)}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="work-body settings-body">
            {group === 'general' ? (
              <div className="settings-pane active">
                <section className="settings-section">
                  <h3 className="settings-section-title">库与下载</h3>
                  <div className="pref-list">
                    <div className="pref-row stack">
                      <div>
                        <div className="s-title">下载根目录</div>
                      </div>
                      <div className="path-row">
                        <input className="text-input" type="text" readOnly value={settings.downloadRoot} />
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() =>
                            void api.pickDownloadRoot().then((root) => {
                              if (root) void api.getSettings().then(setSettings)
                            })
                          }
                        >
                          选择…
                        </button>
                      </div>
                    </div>
                    <div className="pref-row">
                      <div>
                        <div className="s-title">套内图片并发</div>
                      </div>
                      <input
                        className="text-input num-field"
                        type="number"
                        min={1}
                        max={8}
                        value={settings.imageConcurrency}
                        onChange={(e) =>
                          setSettings({ ...settings, imageConcurrency: Number(e.target.value) || 1 })
                        }
                        onBlur={() => void save({ imageConcurrency: settings.imageConcurrency })}
                      />
                    </div>
                  </div>
                </section>

                <section className="settings-section">
                  <h3 className="settings-section-title">外观</h3>
                  <div className="pref-list">
                    <div className="pref-row">
                      <div>
                        <div className="s-title">主题</div>
                      </div>
                      <div className="seg-control" role="radiogroup" aria-label="主题">
                        {(
                          [
                            ['system', '系统'],
                            ['light', '亮色'],
                            ['dark', '暗色'],
                          ] as const
                        ).map(([val, label]) => (
                          <button
                            key={val}
                            type="button"
                            className={theme === val ? 'active' : undefined}
                            data-theme-val={val}
                            onClick={() => {
                              const next = val as ThemePreference
                              setSettings({ ...settings, theme: next })
                              void save({ theme: next })
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="settings-section">
                  <h3 className="settings-section-title">维护</h3>
                  <div className="pref-list">
                    <div className="pref-row">
                      <div>
                        <div className="s-title">本地导入</div>
                      </div>
                      <span className="local-chip">库页</span>
                    </div>
                    <div className="pref-actions">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() =>
                          void api.rebuildLibrary().then((list) => toast.success(`索引已重建：${list.length} 部`))
                        }
                      >
                        从磁盘重建索引
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => {
                          void api.setSettings({ onboardingDone: false }).then((next) => {
                            setSettings(next)
                            window.dispatchEvent(new CustomEvent('wallpaper-runner:replay-onboarding'))
                          })
                        }}
                      >
                        重新打开引导
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            ) : null}

            {group === 'network' ? (
              <div className="settings-pane active">
                <section className="settings-section">
                  <h3 className="settings-section-title">网络</h3>
                  <div className="pref-list">
                    <div className="pref-row stack">
                      <div>
                        <div className="s-title">HTTP 代理</div>
                      </div>
                      <input
                        className="text-input"
                        type="text"
                        placeholder="http://127.0.0.1:7890"
                        value={settings.proxyUrl}
                        onChange={(e) => setSettings({ ...settings, proxyUrl: e.target.value })}
                        onBlur={() => void save({ proxyUrl: settings.proxyUrl })}
                      />
                    </div>
                  </div>
                </section>
              </div>
            ) : null}

            {group === 'telegram' ? (
              <div className="settings-pane active">
                <section className="settings-section">
                  <div className="settings-section-head">
                    <h3 className="settings-section-title">Telegram</h3>
                    <span className={`status-badge ${badge.tone}`}>{badge.label}</span>
                  </div>
                  {tgStatus?.username || tgStatus?.error ? (
                    <p className="settings-status">
                      {tgStatus?.username ? `@${tgStatus.username}` : ''}
                      {tgStatus?.error ? ` ${tgStatus.error}` : ''}
                    </p>
                  ) : null}
                  <div className="tg-flow">
                    <div className="tg-step">
                      <div className="tg-step-n">1</div>
                      <div>
                        <h4>凭据</h4>
                        <div className="tg-fields">
                          <input
                            className="text-input"
                            type="text"
                            placeholder="api_id"
                            value={settings.telegramApiId}
                            onChange={(e) => setSettings({ ...settings, telegramApiId: e.target.value })}
                            onBlur={() => void save({ telegramApiId: settings.telegramApiId })}
                          />
                          <input
                            className="text-input"
                            type="text"
                            placeholder="api_hash"
                            value={settings.telegramApiHash}
                            onChange={(e) => setSettings({ ...settings, telegramApiHash: e.target.value })}
                            onBlur={() => void save({ telegramApiHash: settings.telegramApiHash })}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="tg-step">
                      <div className="tg-step-n">2</div>
                      <div>
                        <h4>手机号发码</h4>
                        <div className="tg-fields">
                          <input
                            className="text-input tg-phone-input"
                            type="text"
                            placeholder="+86…"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                          />
                        </div>
                        <div className="tg-actions">
                          <button
                            type="button"
                            className="btn btn-ghost"
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
                            className="btn btn-primary"
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
                        </div>
                      </div>
                    </div>
                    <div className="tg-step">
                      <div className="tg-step-n">3</div>
                      <div>
                        <h4>验证码 / 2FA</h4>
                        <div className="tg-fields">
                          <input
                            className="text-input"
                            type="text"
                            placeholder="验证码"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                          />
                          <input
                            className="text-input"
                            type="password"
                            placeholder="两步验证密码"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                          />
                        </div>
                        <div className="tg-actions">
                          <button
                            type="button"
                            className="btn btn-ghost"
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
                            className="btn btn-ghost"
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
                            className="btn btn-ghost"
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
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            ) : null}

            {group === 'wallpaper' ? (
              <div className="settings-pane active">
                <section className="settings-section">
                  <h3 className="settings-section-title">Wallpaper Engine</h3>
                  <div className="pref-list">
                    <div className="pref-row">
                      <div>
                        <div className="s-title">媒体端口</div>
                      </div>
                      <input
                        className="text-input num-field"
                        type="number"
                        min={1024}
                        max={65535}
                        value={settings.wallpaperMediaPort}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            wallpaperMediaPort: Number(e.target.value) || settings.wallpaperMediaPort,
                          })
                        }
                        onBlur={() => void save({ wallpaperMediaPort: settings.wallpaperMediaPort })}
                      />
                    </div>
                    <div className="pref-row stack">
                      <div>
                        <div className="s-title">WE 工程目录</div>
                      </div>
                      <div className="path-row">
                        <input className="text-input" type="text" readOnly value={settings.wallpaperEngineDir} />
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() =>
                            void api.pickWallpaperDir().then((dir) => {
                              if (dir) void api.getSettings().then(setSettings)
                            })
                          }
                        >
                          选择…
                        </button>
                      </div>
                    </div>
                    <div className="pref-row">
                      <div>
                        <div className="s-title">图库变更时自动同步</div>
                      </div>
                      <button
                        type="button"
                        className="switch"
                        role="switch"
                        aria-checked={settings.wallpaperAutoSync}
                        aria-label="自动同步"
                        onClick={() => void save({ wallpaperAutoSync: !settings.wallpaperAutoSync })}
                      />
                    </div>
                    <div className="pref-actions">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() =>
                          void api.syncWallpaper().then((r) => {
                            const extra =
                              Array.isArray(r.mirroredDirs) && r.mirroredDirs.length > 0
                                ? `，并更新了 WE 副本 ${r.mirroredDirs.length} 处`
                                : '（未找到 WE 导入副本时，请先导入一次 index.html）'
                            toast.success(`已同步 ${r.galleryCount} 套 / ${r.imageCount} 张${extra}`)
                          })
                        }
                      >
                        立即同步
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => void api.openWallpaperDir().then(() => toast.info('已打开工程目录'))}
                      >
                        打开工程目录
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
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
                        className="btn btn-ghost"
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
                  </div>
                </section>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
