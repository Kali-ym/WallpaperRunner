import type { JSX } from 'react'

export default function App(): JSX.Element {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>套图库</h1>
        <p className="muted">本地套图下载与查看器</p>
      </header>
      <main className="app-main">
        <p>应用脚手架已就绪，后续任务将接入库浏览与下载队列。</p>
      </main>
    </div>
  )
}
