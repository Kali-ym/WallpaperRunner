import { useState, type JSX } from 'react'

export type ExtractZipModalProps = {
  title: string
  zipPaths: string[]
  busy?: boolean
  error?: string
  /** When true, extract replaces zip in the same gallery */
  intoExisting?: boolean
  onConfirm: (opts: { password: string; deleteZip: boolean }) => void
  onSkip: () => void
}

export default function ExtractZipModal({
  title,
  zipPaths,
  busy,
  error,
  intoExisting,
  onConfirm,
  onSkip,
}: ExtractZipModalProps): JSX.Element {
  const [password, setPassword] = useState('')
  const [deleteZip, setDeleteZip] = useState(true)

  return (
    <div className="modal-root" role="dialog" aria-modal="true" aria-label="解压压缩包">
      <button type="button" className="drawer-backdrop" onClick={onSkip} />
      <div className="modal-panel">
        <h3 className="drawer-title">发现压缩包</h3>
        <p className="muted">
          「{title}」含 {zipPaths.length} 个压缩包（zip / 7z / rar）
          {intoExisting ? '，可解压图片到当前套图' : '。是否解压图片并入库？'}
        </p>
        <label className="field">
          <span>解压密码（无密码可留空）</span>
          <input
            className="text-input"
            type="password"
            value={password}
            placeholder="如有加密请填写"
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={deleteZip}
            onChange={(e) => setDeleteZip(e.target.checked)}
          />
          解压成功后删除压缩包
        </label>
        {error ? <p className="error-text">{error}</p> : null}
        <div className="page-toolbar" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" disabled={busy} onClick={onSkip}>
            {intoExisting ? '取消' : '仅保留压缩包'}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() => onConfirm({ password, deleteZip })}
          >
            解压图片入库
          </button>
        </div>
      </div>
    </div>
  )
}
