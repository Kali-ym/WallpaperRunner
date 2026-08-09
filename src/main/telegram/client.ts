import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { Api, TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions'
import { getHttpProxy } from '../http/client'

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

interface ProxyConfig {
  ip: string
  port: number
  socksType: 5
}

function sessionFilePath(): string {
  return join(app.getPath('userData'), 'telegram.session')
}

function parseSocksProxy(proxyUrl: string | null | undefined): ProxyConfig | undefined {
  const raw = (proxyUrl ?? '').trim()
  if (!raw) return undefined
  try {
    const u = new URL(raw)
    const port = Number(u.port || (u.protocol === 'https:' ? 443 : 80))
    if (!u.hostname || !Number.isFinite(port)) return undefined
    // Clash mixed-port usually accepts SOCKS5 on the same port as HTTP
    return { ip: u.hostname, port, socksType: 5 }
  } catch {
    return undefined
  }
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

  async getClient(apiId: number, apiHash: string): Promise<TelegramClient> {
    if (this.client && this.client.connected) {
      return this.client
    }
    await this.connect(apiId, apiHash)
    if (!this.client) throw new Error('Telegram 客户端未连接')
    return this.client
  }

  async connect(apiId: number, apiHash: string): Promise<TelegramAuthStatus> {
    if (!apiId || !apiHash) {
      this.setStatus({ state: 'error', error: '请先填写 api_id 与 api_hash' })
      return this.getStatus()
    }

    this.setStatus({ state: 'connecting', error: undefined })
    const sessionStr = await this.loadSessionString()
    const session = new StringSession(sessionStr)
    const proxy = parseSocksProxy(getHttpProxy())

    if (this.client) {
      try {
        await this.client.disconnect()
      } catch {
        /* ignore */
      }
      this.client = null
    }

    this.client = new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 5,
      downloadRetries: 5,
      requestRetries: 5,
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
      this.setStatus({
        state: 'error',
        error: err instanceof Error ? err.message : String(err),
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
    if (!this.client) throw new Error('无法连接 Telegram')

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
    const deadline = Date.now() + 20_000
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
    return this.getStatus()
  }

  submitCode(code: string): TelegramAuthStatus {
    const trimmed = code.trim()
    if (!trimmed) {
      throw new Error('验证码不能为空')
    }
    if (!this.codeWaiter) {
      throw new Error('当前还不能提交验证码：请先点「发送验证码 / 登录」，等状态变为 need_code')
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

  async disconnect(): Promise<void> {
    this.rejectWaiters(new Error('已断开'))
    if (this.client) {
      try {
        await this.client.disconnect()
      } catch {
        /* ignore */
      }
      this.client = null
    }
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
