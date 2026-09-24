import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { Api, TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions'
import { getHttpProxy, getTelegramSocksProxy } from '../http/client'
import { resolveTelegramSocksProxy } from './proxy'

export type TelegramAuthState =
  | 'disconnected'
  | 'connecting'
  | 'need_code'
  | 'need_password'
  | 'authorized'
  | 'error'

export interface TelegramAuthStatus {
  state: TelegramAuthState
  phone?: string
  username?: string
  error?: string
}

function sessionFilePath(): string {
  return join(app.getPath('userData'), 'telegram.session')
}

export function isAuthKeyDuplicatedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes('AUTH_KEY_DUPLICATED')
}

const AUTH_KEY_DUPLICATED_HINT =
  'Telegram 会话冲突（AUTH_KEY_DUPLICATED）：请关闭其他 WallpaperRunner 窗口、开发版 (npm run dev) 或占用同一账号的程序，然后在设置里退出登录后重新发送验证码'

function formatConnectError(err: unknown, hasProxy: boolean): string {
  if (isAuthKeyDuplicatedError(err)) return AUTH_KEY_DUPLICATED_HINT
  const raw = err instanceof Error ? err.message : String(err)
  const lower = raw.toLowerCase()
  if (
    lower.includes('econnrefused') ||
    lower.includes('connect econnrefused') ||
    lower.includes('proxy') ||
    lower.includes('socks')
  ) {
    return hasProxy
      ? `代理无法连通 Telegram（${raw}）。请确认代理软件已启动，并在「设置 → 网络」填写正确的 SOCKS5，例如 socks5://127.0.0.1:7890 或 v2ray 的 10808 端口`
      : `无法连接（${raw}）。请在「设置 → 网络」配置 SOCKS5 代理后再试`
  }
  if (lower.includes('timed out') || lower.includes('timeout')) {
    return hasProxy
      ? `连接 Telegram 超时（${raw}）。请检查代理规则是否放行 Telegram`
      : `连接超时（${raw}）。未配置代理时通常无法连接，请在「设置 → 网络」填写 SOCKS5`
  }
  return hasProxy
    ? raw
    : `${raw}（未配置代理时可能无法连接 Telegram，请在「设置 → 网络」填写 SOCKS5）`
}

export class TelegramService {
  private client: TelegramClient | null = null
  private status: TelegramAuthStatus = { state: 'disconnected' }
  private codeWaiter: { resolve: (code: string) => void; reject: (e: Error) => void } | null =
    null
  private passwordWaiter: {
    resolve: (password: string) => void
    reject: (e: Error) => void
  } | null = null
  private loginPromise: Promise<void> | null = null
  private connectGate: Promise<void> = Promise.resolve()

  getStatus(): TelegramAuthStatus {
    return { ...this.status }
  }

  async loadSessionString(): Promise<string> {
    try {
      return await readFile(sessionFilePath(), 'utf8')
    } catch {
      return ''
    }
  }

  private async saveSessionString(session: string): Promise<void> {
    await mkdir(app.getPath('userData'), { recursive: true })
    await writeFile(sessionFilePath(), session, 'utf8')
  }

  async clearSession(): Promise<void> {
    await this.disconnect()
    try {
      await unlink(sessionFilePath())
    } catch {
      /* ignore */
    }
    this.status = { state: 'disconnected' }
  }

  private setStatus(partial: Partial<TelegramAuthStatus>): void {
    this.status = { ...this.status, ...partial }
  }

  private runExclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = this.connectGate.then(work)
    this.connectGate = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  private async destroyClient(): Promise<void> {
    if (!this.client) return
    try {
      await this.client.destroy()
    } catch {
      try {
        await this.client.disconnect()
      } catch {
        /* ignore */
      }
    }
    this.client = null
    await new Promise((r) => setTimeout(r, 400))
  }

  private async wipeSessionFile(): Promise<void> {
    try {
      await unlink(sessionFilePath())
    } catch {
      /* ignore */
    }
  }

  private async handleAuthKeyDuplicated(): Promise<void> {
    this.rejectWaiters(new Error(AUTH_KEY_DUPLICATED_HINT))
    this.loginPromise = null
    await this.destroyClient()
    await this.wipeSessionFile()
    this.setStatus({
      state: 'disconnected',
      username: undefined,
      error: AUTH_KEY_DUPLICATED_HINT,
    })
  }

  async getClient(apiId: number, apiHash: string): Promise<TelegramClient> {
    if (this.client && this.client.connected) {
      return this.client
    }
    await this.connect(apiId, apiHash)
    if (!this.client) throw new Error('Telegram 客户端未连接')
    return this.client
  }

  async connect(apiId: number, apiHash: string): Promise<TelegramAuthStatus> {
    return this.runExclusive(() => this.connectInternal(apiId, apiHash))
  }

  private async connectInternal(apiId: number, apiHash: string): Promise<TelegramAuthStatus> {
    if (!apiId || !apiHash) {
      this.setStatus({ state: 'error', error: '请先填写 api_id 与 api_hash' })
      return this.getStatus()
    }

    this.setStatus({ state: 'connecting', error: undefined })
    const sessionStr = await this.loadSessionString()
    const session = new StringSession(sessionStr)
    const proxy = resolveTelegramSocksProxy({
      httpProxy: getHttpProxy(),
      telegramSocksProxy: getTelegramSocksProxy(),
    })

    await this.destroyClient()

    this.client = new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 10,
      downloadRetries: 15,
      requestRetries: 8,
      retryDelay: 1500,
      timeout: 30,
      proxy: proxy as never,
      useWSS: !proxy,
      autoReconnect: true,
      floodSleepThreshold: 120,
    })
    this.client.setLogLevel('error')

    try {
      await this.client.connect()
      if (await this.client.checkAuthorization()) {
        const me = await this.client.getMe()
        const username =
          me && typeof me === 'object' && 'username' in me
            ? String((me as { username?: string }).username ?? '')
            : ''
        this.setStatus({
          state: 'authorized',
          username: username || undefined,
          error: undefined,
        })
        await this.saveSessionString(this.client.session.save() as unknown as string)
      } else {
        this.setStatus({ state: 'disconnected', error: undefined })
      }
    } catch (err) {
      if (isAuthKeyDuplicatedError(err)) {
        await this.handleAuthKeyDuplicated()
        return this.getStatus()
      }
      await this.destroyClient()
      this.setStatus({
        state: 'error',
        error: formatConnectError(err, Boolean(proxy)),
      })
    }
    return this.getStatus()
  }

  async startLogin(apiId: number, apiHash: string, phone: string): Promise<TelegramAuthStatus> {
    if (this.loginPromise) {
      throw new Error('已有登录流程进行中')
    }
    const phoneNormalized = phone.trim()
    if (!phoneNormalized) throw new Error('请输入手机号')

    this.rejectWaiters(new Error('登录已重新开始'))
    await this.connect(apiId, apiHash)
    if (this.status.state === 'error' || !this.client || !this.client.connected) {
      this.setStatus({
        state: 'error',
        phone: phoneNormalized,
        error:
          this.status.error ??
          '无法连接 Telegram，请确认代理软件已开启并填写 SOCKS5（如 socks5://127.0.0.1:7890）',
      })
      return this.getStatus()
    }
    if (this.status.state === 'authorized') {
      return this.getStatus()
    }

    this.setStatus({ state: 'connecting', phone: phoneNormalized, error: undefined })

    this.loginPromise = (async () => {
      try {
        await this.client!.start({
          phoneNumber: async () => phoneNormalized,
          phoneCode: async () =>
            new Promise<string>((resolve, reject) => {
              this.codeWaiter = { resolve, reject }
              this.setStatus({
                state: 'need_code',
                phone: phoneNormalized,
                error: undefined,
              })
            }),
          password: async () =>
            new Promise<string>((resolve, reject) => {
              this.passwordWaiter = { resolve, reject }
              this.setStatus({
                state: 'need_password',
                phone: phoneNormalized,
                error: undefined,
              })
            }),
          onError: (err) => {
            console.error('[telegram] start onError', err)
          },
        })
        const me = await this.client!.getMe()
        const username =
          me && typeof me === 'object' && 'username' in me
            ? String((me as { username?: string }).username ?? '')
            : ''
        await this.saveSessionString(this.client!.session.save() as unknown as string)
        this.setStatus({
          state: 'authorized',
          phone: phoneNormalized,
          username: username || undefined,
          error: undefined,
        })
      } catch (err) {
        this.codeWaiter = null
        this.passwordWaiter = null
        if (isAuthKeyDuplicatedError(err)) {
          await this.handleAuthKeyDuplicated()
          this.setStatus({ phone: phoneNormalized })
          return
        }
        this.setStatus({
          state: 'error',
          phone: phoneNormalized,
          error: err instanceof Error ? err.message : String(err),
        })
      } finally {
        this.loginPromise = null
      }
    })()

    // Wait until code is requested, authorized, or failed (up to ~20s)
    const deadline = Date.now() + 45_000
    while (Date.now() < deadline) {
      const s = this.getStatus()
      if (
        s.state === 'need_code' ||
        s.state === 'need_password' ||
        s.state === 'authorized' ||
        s.state === 'error'
      ) {
        break
      }
      await new Promise((r) => setTimeout(r, 200))
    }
    if (this.getStatus().state === 'connecting') {
      this.rejectWaiters(new Error('发送验证码超时'))
      this.loginPromise = null
      this.setStatus({
        state: 'error',
        phone: phoneNormalized,
        error: '发送验证码超时，请检查代理或网络后重试',
      })
    }
    return this.getStatus()
  }

  async cancelLogin(): Promise<TelegramAuthStatus> {
    this.rejectWaiters(new Error('登录已取消'))
    this.loginPromise = null
    if (
      this.status.state === 'connecting' ||
      this.status.state === 'need_code' ||
      this.status.state === 'need_password'
    ) {
      this.setStatus({
        state: 'disconnected',
        phone: this.status.phone,
        error: undefined,
      })
    }
    return this.getStatus()
  }

  submitCode(code: string): TelegramAuthStatus {
    const trimmed = code.trim()
    if (!trimmed) {
      throw new Error('验证码不能为空')
    }
    if (!this.codeWaiter) {
      throw new Error('请先点「发送验证码」，等状态变为「等待验证码」后再提交')
    }
    this.codeWaiter.resolve(trimmed)
    this.codeWaiter = null
    this.setStatus({ state: 'connecting', error: undefined })
    return this.getStatus()
  }

  submitPassword(password: string): TelegramAuthStatus {
    if (!password) {
      throw new Error('两步验证密码不能为空')
    }
    if (!this.passwordWaiter) {
      throw new Error('当前不需要两步验证密码')
    }
    this.passwordWaiter.resolve(password)
    this.passwordWaiter = null
    this.setStatus({ state: 'connecting', error: undefined })
    return this.getStatus()
  }

  async waitForLogin(): Promise<TelegramAuthStatus> {
    if (this.loginPromise) await this.loginPromise
    return this.getStatus()
  }

  /**
   * Re-init MTProto after CONNECTION_NOT_INITED / dropped export DC during large downloads.
   * Drops exported media DC senders, then reconnects the same client + session.
   */
  async recoverConnection(): Promise<void> {
    if (!this.client) return
    const client = this.client as TelegramClient & {
      _exportedSenderPromises?: Map<number, Promise<unknown>>
    }
    try {
      const map = client._exportedSenderPromises
      if (map instanceof Map) {
        const pending = [...map.values()]
        map.clear()
        await Promise.all(
          pending.map(async (p) => {
            try {
              const sender = (await Promise.race([
                p,
                new Promise((r) => setTimeout(() => r(null), 1500)),
              ])) as { disconnect?: () => Promise<void> } | null
              await sender?.disconnect?.()
            } catch {
              /* ignore */
            }
          }),
        )
      }
    } catch {
      /* ignore */
    }
    try {
      await this.client.disconnect()
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 2000))
    try {
      await this.client.connect()
    } catch (err) {
      if (isAuthKeyDuplicatedError(err)) {
        await this.handleAuthKeyDuplicated()
        throw new Error(AUTH_KEY_DUPLICATED_HINT)
      }
      throw err
    }
    if (!(await this.client.checkAuthorization())) {
      this.setStatus({ state: 'disconnected', error: '会话已失效，请重新登录' })
      throw new Error('Telegram 会话已失效，请重新登录')
    }
    if (this.status.state !== 'authorized') {
      this.setStatus({ state: 'authorized', error: undefined })
    }
  }

  async disconnect(): Promise<void> {
    this.rejectWaiters(new Error('已断开'))
    await this.destroyClient()
    if (this.status.state !== 'error') {
      this.setStatus({ state: 'disconnected', username: undefined })
    }
  }

  async logout(): Promise<TelegramAuthStatus> {
    if (this.client) {
      try {
        await this.client.invoke(new Api.auth.LogOut())
      } catch {
        /* ignore */
      }
    }
    await this.clearSession()
    return this.getStatus()
  }

  private rejectWaiters(err: Error): void {
    this.codeWaiter?.reject(err)
    this.passwordWaiter?.reject(err)
    this.codeWaiter = null
    this.passwordWaiter = null
  }
}

export const telegramService = new TelegramService()
