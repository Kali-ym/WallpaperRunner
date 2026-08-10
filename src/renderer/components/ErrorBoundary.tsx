import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary" role="alert">
          <h2>界面出错了</h2>
          <p className="muted">{this.state.error.message}</p>
          <div className="page-toolbar">
            <button type="button" className="btn" onClick={() => this.setState({ error: null })}>
              重试
            </button>
            <button type="button" className="btn primary" onClick={() => window.location.reload()}>
              重载应用
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
