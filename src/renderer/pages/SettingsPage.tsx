import { useEffect, useState, type JSX } from 'react'
import { api, type AppSettings } from '../lib/api'

export default function SettingsPage(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    void api.getSettings().then(setSettings)
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

      <div className="page-toolbar">
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
