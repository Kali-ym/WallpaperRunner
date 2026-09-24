import { useEffect, useRef, useState, type JSX } from 'react'
import { useToast } from '../lib/toast'
import { api, type AppSettings, type TelegramAuthStatus } from '../lib/api'
import { emitThemeChanged, type ThemePreference } from '../lib/theme'

function hasTelegramCreds(settings: AppSettings): boolean {
  const id = Number.parseInt(settings.telegramApiId, 10)
  return Number.isFinite(id) && id > 0 && settings.telegramApiHash.trim().length > 0
}

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

export default function SettingsPage({ active = true }: { active?: boolean }): JSX.Element {
  const toast = useToast()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [tgStatus, setTgStatus] = useState<TelegramAuthStatus | null>(null)
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [group, setGroup] = useState<'general' | 'network' | 'telegram' | 'wallpaper'>('general')
  const [tgAction, setTgAction] = useState<'send' | 'confirm' | '2fa' | 'restore' | null>(null)
  const persistedRef = useRef<AppSettings | null>(null)

  useEffect(() => {
    if (!active) return
    void api.getSettings().then((s) => {
      setSettings(s)
      persistedRef.current = s
    })
    void api.telegramStatus().then(setTgStatus)
  }, [active])

  useEffect(() => {
    if (!active || group !== 'telegram') return
    const polling =
      tgAction !== null ||
      tgStatus?.state === 'connecting' ||
      tgStatus?.state === 'need_code' ||
      tgStatus?.state === 'need_password'
    if (!polling) return
    const id = window.setInterval(() => {
      void api.telegramStatus().then(setTgStatus)
    }, 500)
    return () => window.clearInterval(id)
  }, [active, group, tgAction, tgStatus?.state])

  useEffect(() => {
    if (
      tgAction === 'send' &&
      (tgStatus?.state === 'need_code' || tgStatus?.state === 'need_password')
    ) {
      setTgAction(null)
    }
  }, [tgAction, tgStatus?.state])

  async function save(partial: Partial<AppSettings>, quiet = false): Promise<AppSettings> {
    const base = persistedRef.current ?? settings
    if (base) {
      const keys = Object.keys(partial) as (keyof AppSettings)[]
      if (keys.length > 0 && keys.every((k) => base[k] === partial[k])) return base
    }
    const next = await api.setSettings(partial)
    setSettings(next)
    persistedRef.current = next
    if (partial.theme) emitThemeChanged(partial.theme)
    if (!quiet) toast.success('已保存')
    return next
  }

  async function persistTelegramCreds(): Promise<AppSettings> {
    if (!settings) throw new Error('设置尚未加载')
    return save(
      {
        telegramApiId: settings.telegramApiId,
        telegramApiHash: settings.telegramApiHash,
        proxyUrl: settings.proxyUrl,
        telegramSocksProxy: settings.telegramSocksProxy,
      },
      true,
    )
  }

  if (!settings) return <p className="muted">加载设置…</p>

  const badge = tgBadge(tgStatus?.state)
  const theme = settings.theme ?? 'system'
  const tgState = tgStatus?.state
  const credsOk = hasTelegramCreds(settings)
  const loggedIn = tgState === 'authorized'
  const waitingCode = tgState === 'need_code'
  const waiting2fa = tgState === 'need_password'
  const step1Done = credsOk
  const tgBusy = tgAction !== null
  const step3Active =
    waitingCode || waiting2fa || tgAction === 'confirm' || tgAction === '2fa'
  const step2Active = !loggedIn && !step3Active
  const showTgCancel =
    !loggedIn &&
    (tgAction !== null ||
      tgStatus?.state === 'connecting' ||
      waitingCode ||
      waiting2fa)

  async function cancelTelegramLogin(): Promise<void> {
    setTgAction(null)
    const s = await api.telegramCancelLogin()
    setTgStatus(s)
    toast.info('已取消，可重新发送验证码')
  }

  async function sendTelegramCode(): Promise<void> {
    if (!phone.trim()) {
      toast.error('请先填写手机号（含国家区号，如 +86…）')
      return
    }
    if (!credsOk) {
      toast.error('请先填写并保存 api_id / api_hash')
      return
    }
    setTgAction('send')
    try {
      await persistTelegramCreds()
      const s = await api.telegramStartLogin(phone)
      setTgStatus(s)
      if (s.state === 'authorized') toast.success('登录成功')
      else if (s.state === 'need_code') toast.info('验证码已发送，请在步骤 3 填写后点「完成登录」')
      else if (s.state === 'need_password') toast.info('请填写两步验证密码')
      else if (s.state === 'error') toast.error(s.error || '发送失败')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setTgAction(null)
    }
  }

  async function confirmTelegramCode(): Promise<void> {
    if (!code.trim()) {
      toast.error('请填写 Telegram App 收到的验证码')
      return
    }
    setTgAction('confirm')
    try {
      const s = await api.telegramSubmitCode(code.trim())
      setTgStatus(s)
      if (s.state === 'authorized') {
        toast.success('登录成功')
        return
      }
      const final = await api.telegramWaitLogin()
      setTgStatus(final)
      if (final.state === 'authorized') toast.success('登录成功')
      else if (final.state === 'need_password') toast.info('账号有两步验证，请填写密码后确认')
      else if (final.error) toast.error(final.error)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setTgAction(null)
    }
  }

  async function confirmTelegram2fa(): Promise<void> {
    if (!password) {
      toast.error('请填写两步验证密码')
      return
    }
    setTgAction('2fa')
    try {
      const s = await api.telegramSubmitPassword(password)
      setTgStatus(s)
      if (s.state === 'authorized') {
        toast.success('登录成功')
        return
      }
      const final = await api.telegramWaitLogin()
      setTgStatus(final)
      if (final.state === 'authorized') toast.success('登录成功')
      else if (final.error) toast.error(final.error)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setTgAction(null)
    }
  }

  async function restoreTelegramSession(): Promise<void> {
    if (!credsOk) {
      toast.error('请先填写 api_id / api_hash')
      return
    }
    setTgAction('restore')
    try {
      await persistTelegramCreds()
      const s = await api.telegramConnect()
      setTgStatus(s)
      if (s.state === 'authorized') toast.success('已恢复登录')
      else if (s.state === 'error') toast.error(s.error || '无法恢复，请按步骤重新发验证码')
      else toast.info('没有可用的 session，请发送验证码登录')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setTgAction(null)
    }
  }

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
                              if (root) {
                              void api.getSettings().then((next) => {
                                setSettings(next)
                                persistedRef.current = next
                              })
                            }
                            })
                          }
                        >
                          选择…
                        </button>
                      </div>
                    </div>
                    <div className="pref-row">
                      <div>
                        <div className="s-title">下载任务并发</div>
                        <div className="s-hint muted">同时下载几个套图链接</div>
                      </div>
                      <input
                        className="text-input num-field"
                        type="number"
                        min={1}
                        max={4}
                        value={settings.taskConcurrency}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            taskConcurrency: Number(e.target.value) || 1,
                          })
                        }
                        onBlur={() => void save({ taskConcurrency: settings.taskConcurrency })}
                      />
                    </div>
                    <div className="pref-row">
                      <div>
                        <div className="s-title">套内图片并发</div>
                        <div className="s-hint muted">单个套图内同时下载几张图</div>
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
                            persistedRef.current = next
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
                        <p className="muted settings-hint">网页下载与图库缩略图</p>
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
                    <div className="pref-row stack">
                      <div>
                        <div className="s-title">Telegram SOCKS5</div>
                        <p className="muted settings-hint">
                          留空则尝试用 HTTP 代理同端口（Clash 混合端口）。v2rayN 等请填
                          socks5://127.0.0.1:10808
                        </p>
                      </div>
                      <input
                        className="text-input"
                        type="text"
                        placeholder="socks5://127.0.0.1:7890"
                        value={settings.telegramSocksProxy}
                        onChange={(e) =>
                          setSettings({ ...settings, telegramSocksProxy: e.target.value })
                        }
                        onBlur={() => void save({ telegramSocksProxy: settings.telegramSocksProxy })}
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
                  {tgStatus?.error && !loggedIn ? (
                    <p className="settings-status tg-error">{tgStatus.error}</p>
                  ) : null}

                  {loggedIn ? (
                    <div className="tg-logged-in">
                      <p className="tg-logged-in-title">
                        已登录{tgStatus?.username ? ` · @${tgStatus.username}` : ''}
                      </p>
                      <p className="muted">下载 Telegram 资源时会自动使用此账号。</p>
                      <div className="tg-actions">
                        <button
                          type="button"
                          className="btn"
                          disabled={tgBusy}
                          onClick={() =>
                            void api.telegramLogout().then((s) => {
                              setTgStatus(s)
                              setCode('')
                              setPassword('')
                              toast.info('已登出，可重新按步骤登录')
                            })
                          }
                        >
                          退出登录
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <ol className="tg-guide">
                        <li>填写 my.telegram.org 的 api_id、api_hash（失焦自动保存）</li>
                        <li>填写手机号，点<strong>发送验证码</strong></li>
                        <li>在 Telegram App 查看验证码，点<strong>完成登录</strong></li>
                      </ol>
                      {showTgCancel ? (
                        <div className="tg-cancel-row">
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => void cancelTelegramLogin()}
                          >
                            取消当前操作
                          </button>
                          <span className="muted">
                            {badge.label !== '未连接' ? `当前：${badge.label}` : null}
                          </span>
                        </div>
                      ) : null}
                      <div className="tg-flow">
                        <div
                          className={
                            step1Done
                              ? 'tg-step is-done'
                              : !step2Active && !step3Active
                                ? 'tg-step is-active'
                                : 'tg-step'
                          }
                        >
                          <div className="tg-step-n">1</div>
                          <div>
                            <h4>API 凭据</h4>
                            <p className="muted">从 my.telegram.org 创建应用后复制</p>
                            <div className="tg-fields">
                              <input
                                className="text-input"
                                type="text"
                                placeholder="api_id"
                                value={settings.telegramApiId}
                                onChange={(e) =>
                                  setSettings({ ...settings, telegramApiId: e.target.value })
                                }
                                onBlur={() => void save({ telegramApiId: settings.telegramApiId })}
                              />
                              <input
                                className="text-input"
                                type="text"
                                placeholder="api_hash"
                                value={settings.telegramApiHash}
                                onChange={(e) =>
                                  setSettings({ ...settings, telegramApiHash: e.target.value })
                                }
                                onBlur={() =>
                                  void save({ telegramApiHash: settings.telegramApiHash })
                                }
                              />
                            </div>
                          </div>
                        </div>

                        <div
                          className={
                            step2Active
                              ? 'tg-step is-active'
                              : waitingCode || waiting2fa
                                ? 'tg-step is-done'
                                : 'tg-step'
                          }
                        >
                          <div className="tg-step-n">2</div>
                          <div>
                            <h4>发送验证码</h4>
                            <p className="muted">手机号需含国家区号，例如 +86…</p>
                            <div className="tg-fields">
                              <input
                                className="text-input tg-phone-input"
                                type="text"
                                placeholder="+86 138…"
                                value={phone}
                                disabled={tgBusy || waitingCode || waiting2fa}
                                onChange={(e) => setPhone(e.target.value)}
                              />
                            </div>
                            <div className="tg-actions">
                              <button
                                type="button"
                                className="btn btn-primary"
                                disabled={tgBusy || !credsOk || !phone.trim()}
                                onClick={() => void sendTelegramCode()}
                              >
                                {tgAction === 'send' ? '发送中…' : '发送验证码'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost tg-linkish"
                                disabled={tgBusy || !credsOk}
                                onClick={() => void restoreTelegramSession()}
                              >
                                已有 session？尝试恢复
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className={step3Active ? 'tg-step is-active' : 'tg-step is-pending'}>
                          <div className="tg-step-n">3</div>
                          <div>
                            <h4>完成登录</h4>
                            <p className="muted">
                              {waiting2fa
                                ? '账号开启了两步验证，请填写密码'
                                : waitingCode
                                  ? '验证码已发送，请在 Telegram App 中查看'
                                  : '请先完成步骤 2 发送验证码'}
                            </p>
                            <div className="tg-fields">
                              <input
                                className="text-input"
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                placeholder="短信 / App 验证码"
                                value={code}
                                disabled={!waitingCode && !waiting2fa}
                                onChange={(e) => setCode(e.target.value)}
                              />
                              {waiting2fa ? (
                                <input
                                  className="text-input"
                                  type="password"
                                  placeholder="两步验证密码"
                                  value={password}
                                  onChange={(e) => setPassword(e.target.value)}
                                />
                              ) : null}
                            </div>
                            <div className="tg-actions">
                              {waiting2fa ? (
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  disabled={tgBusy || !password}
                                  onClick={() => void confirmTelegram2fa()}
                                >
                                  {tgAction === '2fa' ? '确认中…' : '确认两步验证'}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  disabled={tgBusy || !waitingCode || !code.trim()}
                                  onClick={() => void confirmTelegramCode()}
                                >
                                  {tgAction === 'confirm' ? '登录中…' : '完成登录'}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
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
                              if (dir) {
                                void api.getSettings().then((next) => {
                                  setSettings(next)
                                  persistedRef.current = next
                                })
                              }
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
                          }).catch((err: unknown) => {
                            toast.error(err instanceof Error ? err.message : String(err))
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
