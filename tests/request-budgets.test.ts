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
  rmSync(userData, { recursive: true, force: true })
})

describe('health request budgets', () => {
  test('keeps cold and overlapping Home navigation within budget without refetching covered dates', async () => {
    await loadHome('2026-07-01')
    expect(requests.length).toBeLessThanOrEqual(12)

    requests = []
    await loadHome('2026-07-02')
    expect(requests.length).toBeLessThanOrEqual(12)

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
})
