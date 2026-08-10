import { beforeEach, describe, expect, it, vi } from 'vitest'

const undiciFetch = vi.fn()
const spawn = vi.fn()

vi.mock('undici', () => ({
  ProxyAgent: class {
    constructor(_url: string) {}
  },
  fetch: (...args: unknown[]) => undiciFetch(...args),
}))

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawn(...args),
}))

import { httpFetch, setHttpFetch, setHttpProxy, setPreferCurl } from '@main/http/client'

describe('httpFetch fallback', () => {
  beforeEach(() => {
    setHttpFetch(null)
    setHttpProxy(null)
    setPreferCurl(true)
    undiciFetch.mockReset()
    spawn.mockReset()
  })

  it('falls back to undici when curl fails even without proxy', async () => {
    spawn.mockImplementation(() => {
      const handlers: Record<string, Array<(...a: unknown[]) => void>> = {
        data: [],
        error: [],
        close: [],
      }
      const child = {
        stderr: {
          on: (ev: string, cb: (...a: unknown[]) => void) => {
            handlers[ev] = handlers[ev] || []
            handlers[ev]!.push(cb)
          },
        },
        on: (ev: string, cb: (...a: unknown[]) => void) => {
          handlers[ev] = handlers[ev] || []
          handlers[ev]!.push(cb)
          if (ev === 'close') {
            queueMicrotask(() => cb(1))
          }
        },
      }
      return child
    })

    undiciFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
    })

    const res = await httpFetch('https://example.com/x')
    expect(undiciFetch).toHaveBeenCalled()
    expect(res.status).toBe(200)
  })

  it('uses undici directly when preferCurl is false', async () => {
    setPreferCurl(false)
    undiciFetch.mockResolvedValue({ ok: true, status: 204, headers: new Headers() })
    const res = await httpFetch('https://example.com/y')
    expect(spawn).not.toHaveBeenCalled()
    expect(res.status).toBe(204)
  })
})
