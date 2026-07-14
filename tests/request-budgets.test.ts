import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { MetricKey } from '../src/shared/types'

const userData = mkdtempSync(join(tmpdir(), 'open-pulse-request-budgets-'))
const originalFetch = globalThis.fetch

mock.module('electron', () => ({
  app: { getPath: () => userData },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value, 'utf8'),
    decryptString: (value: Buffer) => value.toString('utf8')
  },
  shell: { openExternal: async () => undefined }
}))

const {
  getIntraday,
  getSeries,
  getSleepRange,
  getWorkoutsRange,
  resetHealthAccount
} = await import('../src/main/health-service')
const { disconnectGoogle, getGoogleAccessToken } = await import('../src/main/google-auth')
const { disconnectCodex, getCodexTokens } = await import('../src/main/codex-auth')
const { shiftIsoDate } = await import('../src/main/health-api')
const { setSecret, updateSettings } = await import('../src/main/store')

const HOME_METRICS: MetricKey[] = [
  'steps',
  'caloriesOut',
  'caloriesIn',
  'restingHeartRate',
  'hrvMs',
  'spo2Pct',
  'breathingRate',
  'skinTempDeltaC'
]

let requests: string[] = []

function liveToken(): void {
  setSecret('google-tokens', {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.now() + 60 * 60_000
  })
}

function emptyHealthResponse(input: string | URL | Request): Promise<Response> {
  requests.push(String(input))
  return Promise.resolve(new Response(JSON.stringify({ dataPoints: [], rollupDataPoints: [] }), { status: 200 }))
}

async function loadHome(date: string): Promise<void> {
  const start = shiftIsoDate(date, -6)
  await Promise.all([
    ...HOME_METRICS.map((metric) => getSeries([metric], start, date)),
    getSleepRange(date, date),
    getWorkoutsRange(date, date),
    getIntraday(date, false, undefined, 'steps')
  ])
}

beforeEach(() => {
  disconnectGoogle()
  disconnectCodex()
  resetHealthAccount()
  liveToken()
  requests = []
  globalThis.fetch = emptyHealthResponse as typeof fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

afterAll(() => {
  disconnectGoogle()
  disconnectCodex()
  rmSync(userData, { recursive: true, force: true })
})

describe('health request budgets', () => {
  test('keeps cold and overlapping Home navigation within budget without refetching covered dates', async () => {
    await loadHome('2026-07-01')
    expect(requests.length).toBeLessThanOrEqual(11)
    expect(requests.some((url) => url.includes('/nutrition-log/dataPoints?'))).toBe(false)

    requests = []
    await loadHome('2026-07-02')
    expect(requests.length).toBeLessThanOrEqual(11)

    requests = []
    await loadHome('2026-07-01')
    expect(requests).toHaveLength(0)
  }, 15_000)

  test('shares one Google refresh request across concurrent callers', async () => {
    updateSettings({ googleClientId: 'client-id', googleClientSecret: 'client-secret' })
    setSecret('google-tokens', {
      accessToken: 'expired-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() - 1
    })
    globalThis.fetch = (async (input) => {
      requests.push(String(input))
      return new Response(JSON.stringify({ access_token: 'new-token', expires_in: 3600 }), { status: 200 })
    }) as typeof fetch

    const tokens = await Promise.all(Array.from({ length: 10 }, () => getGoogleAccessToken()))

    expect(requests).toHaveLength(1)
    expect(tokens).toEqual(new Array(10).fill('new-token'))
  })

  test('shares one Codex refresh while allowing one caller to cancel', async () => {
    setSecret('codex-tokens', {
      accessToken: 'expired-codex-token',
      refreshToken: 'codex-refresh-token',
      expiresAt: Date.now() - 1
    })
    let finishRefresh!: () => void
    globalThis.fetch = (async (input, init) => {
      requests.push(String(input))
      return new Promise<Response>((resolve, reject) => {
        finishRefresh = () => resolve(new Response(JSON.stringify({
          access_token: 'new-codex-token',
          refresh_token: 'rotated-codex-refresh-token',
          expires_in: 3600
        }), { status: 200 }))
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('aborted', 'AbortError')),
          { once: true }
        )
      })
    }) as typeof fetch
    const firstController = new AbortController()
    const secondController = new AbortController()

    const first = getCodexTokens(firstController.signal)
    const second = getCodexTokens(secondController.signal)
    firstController.abort()
    finishRefresh()

    await expect(first).rejects.toHaveProperty('name', 'AbortError')
    await expect(second).resolves.toMatchObject({
      accessToken: 'new-codex-token',
      refreshToken: 'rotated-codex-refresh-token'
    })
    expect(requests).toHaveLength(1)
  })

  test('keeps shared health work alive while another consumer is active', async () => {
    globalThis.fetch = (async (input, init) => {
      requests.push(String(input))
      return new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(
          () => resolve(new Response(JSON.stringify({ rollupDataPoints: [] }), { status: 200 })),
          25
        )
        init?.signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer)
            reject(new DOMException('aborted', 'AbortError'))
          },
          { once: true }
        )
      })
    }) as typeof fetch
    const firstController = new AbortController()
    const secondController = new AbortController()
    const first = getSeries(
      ['steps'],
      '2026-07-01',
      '2026-07-01',
      false,
      firstController.signal
    )
    const second = getSeries(
      ['steps'],
      '2026-07-01',
      '2026-07-01',
      false,
      secondController.signal
    )

    firstController.abort()

    await expect(first).rejects.toHaveProperty('name', 'AbortError')
    await expect(second).resolves.toMatchObject({ source: 'live' })
    expect(requests).toHaveLength(1)
  })
})
