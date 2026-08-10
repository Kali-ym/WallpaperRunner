import { useEffect, useState, type JSX } from 'react'
import { api, type AppSettings } from '../lib/api'

type Props = {
  initial: AppSettings
  onDone: (settings: AppSettings) => void
}

const STEPS = ['welcome', 'proxy', 'sources'] as const

export default function OnboardingModal({ initial, onDone }: Props): JSX.Element {
  const [step, setStep] = useState(0)
  const [settings, setSettings] = useState(initial)
  const [proxyDraft, setProxyDraft] = useState(initial.proxyUrl)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setSettings(initial)
    setProxyDraft(initial.proxyUrl)
  }, [initial])

  async function pickRoot(): Promise<void> {
    const root = await api.pickDownloadRoot()
    if (root) {
      const next = await api.getSettings()
      setSettings(next)
    }
  }

  async function finish(): Promise<void> {
    setBusy(true)
    setError('')
    try {
      const next = await api.setSettings({
        proxyUrl: proxyDraft.trim(),
        onboardingDone: true,
      })
      onDone(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const id = STEPS[step] ?? 'welcome'

  return (
    <div className="modal-root onboarding-root" role="dialog" aria-modal aria-label="首次设置">
      <div className="drawer-backdrop" />
      <div className="onboarding-card">
        <p className="onboarding-brand">WallpaperRunner</p>
        {id === 'welcome' ? (
          <>
            <h2>欢迎使用</h2>
            <p className="muted">
              先确认套图保存位置。之后可随时在「设置」里修改。
            </p>
            <label className="field">
              <span>下载根目录</span>
              <div className="row">
                <input className="text-input" readOnly value={settings.downloadRoot} />
                <button type="button" className="btn" onClick={() => void pickRoot()}>
                  选择…
                </button>
              </div>
            </label>
          </>
        ) : null}

        {id === 'proxy' ? (
          <>
            <h2>网络代理</h2>
            <p className="muted">
              访问 xChina 等站点常需本地代理。没有代理可选「直连」。
            </p>
            <div className="row wrap" style={{ gap: 8, marginBottom: 10 }}>
              <button
                type="button"
                className="btn"
                onClick={() => setProxyDraft('http://127.0.0.1:7890')}
              >
                本地 7890
              </button>
              <button type="button" className="btn" onClick={() => setProxyDraft('')}>
                直连
              </button>
            </div>
            <label className="field">
              <span>代理 URL（留空=直连）</span>
              <input
                className="text-input"
                value={proxyDraft}
                placeholder="http://127.0.0.1:7890"
                onChange={(e) => setProxyDraft(e.target.value)}
              />
            </label>
          </>
        ) : null}

        {id === 'sources' ? (
          <>
            <h2>下载来源</h2>
            <ul className="onboarding-sources">
              <li>
                <strong>xChina</strong>
                <span className="muted"> — 粘贴套图页链接即可入队</span>
              </li>
              <li>
                <strong>Telegram</strong>
                <span className="muted"> — 需在设置中配置 API 并登录，可多链接合并</span>
              </li>
              <li>
                <strong>Telegraph</strong>
                <span className="muted"> — 解析 telegra.ph 文章中的图片</span>
              </li>
            </ul>
            <p className="muted">库页可拖入本地文件夹导入已有图集。</p>
          </>
        ) : null}

        {error ? <p className="error-text">{error}</p> : null}

        <div className="onboarding-actions">
          {step > 0 ? (
            <button type="button" className="btn" disabled={busy} onClick={() => setStep((s) => s - 1)}>
              上一步
            </button>
          ) : (
            <span />
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn primary" onClick={() => setStep((s) => s + 1)}>
              下一步
            </button>
          ) : (
            <button type="button" className="btn primary" disabled={busy} onClick={() => void finish()}>
              {busy ? '保存中…' : '开始使用'}
            </button>
          )}
        </div>
        <p className="muted onboarding-step">
          {step + 1} / {STEPS.length}
        </p>
      </div>
    </div>
  )
}
