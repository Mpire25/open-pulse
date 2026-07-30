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
  getWorkoutHeartRate,
  getWorkoutsRange,
  resetHealthAccount
} = await import('../src/main/health-service')
const {
  disconnectGoogle,
  getGoogleAccessToken,
  getGoogleStatus,
  onGoogleAuthInvalidated
} = await import('../src/main/google-auth')
const { disconnectCodex, getCodexTokens } = await import('../src/main/codex-auth')
const { runHealthAgentTool } = await import('../src/main/health-agent-tools')
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
  const weightStart = shiftIsoDate(date, -29)
  await Promise.all([
    ...HOME_METRICS.map((metric) => getSeries([metric], start, date)),
    getSeries(['weightKg'], weightStart, date),
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
  function workoutPoint(
    id: string,
    startTime: string,
    endTime: string
  ): Record<string, unknown> {
    const start = new Date(startTime)
    return {
      dataPointName: id,
      exercise: {
        exerciseType: 'RUNNING',
        displayName: 'Run',
        interval: {
          startTime,
          endTime,
          civilStartTime: {
            date: {
              year: start.getFullYear(),
              month: start.getMonth() + 1,
              day: start.getDate()
            },
            time: { hours: start.getHours(), minutes: start.getMinutes() }
          }
        },
        activeDuration: `${(Date.parse(endTime) - Date.parse(startTime)) / 1000}s`
      }
    }
  }

  test('rejects health reads while Google is disconnected instead of substituting generated data', async () => {
    disconnectGoogle()
    resetHealthAccount()

    await expect(getSeries(['steps'], '2026-07-01', '2026-07-01')).rejects.toThrow(
      'Google Health is not connected'
    )
    await expect(getSleepRange('2026-07-01', '2026-07-01')).rejects.toThrow(
      'Google Health is not connected'
    )
    await expect(getWorkoutsRange('2026-07-01', '2026-07-01')).rejects.toThrow(
      'Google Health is not connected'
    )
    await expect(getIntraday('2026-07-01')).rejects.toThrow('Google Health is not connected')
    expect(requests).toHaveLength(0)
  })

  test('loads intraday heart rate through one rollup request', async () => {
    await getIntraday('2026-07-01', false, undefined, 'heart')

    expect(requests).toHaveLength(1)
    expect(requests[0]).toContain('/heart-rate/dataPoints:rollUp')
    expect(requests[0]).not.toContain('dataPoints:reconcile')
  })

  test('loads intraday steps through one rollup request', async () => {
    await getIntraday('2026-07-01', false, undefined, 'steps')

    expect(requests).toHaveLength(1)
    expect(requests[0]).toContain('/steps/dataPoints:rollUp')
    expect(requests[0]).not.toContain('dataPoints:reconcile')
  })

  test('loads only the workout heart-rate window when a full day is not cached', async () => {
    const startTime = new Date(2026, 6, 1, 10).toISOString()
    const endTime = new Date(2026, 6, 1, 11).toISOString()
    const id = 'users/me/dataTypes/exercise/dataPoints/workout-1'
    const bodies: Record<string, unknown>[] = []
    globalThis.fetch = (async (input, init) => {
      requests.push(String(input))
      if (String(input).includes('/exercise/dataPoints:reconcile')) {
        return new Response(JSON.stringify({
          dataPoints: [workoutPoint(id, startTime, endTime)]
        }), { status: 200 })
      }
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return new Response(JSON.stringify({ rollupDataPoints: [] }), { status: 200 })
    }) as typeof fetch

    await getWorkoutsRange('2026-07-01', '2026-07-01')
    requests = []
    await getWorkoutHeartRate('2026-07-01', id)

    expect(requests).toHaveLength(1)
    expect(requests[0]).toContain('/heart-rate/dataPoints:rollUp')
    expect(bodies).toEqual([
      expect.objectContaining({
        range: { startTime, endTime },
        windowSize: '60s',
        pageSize: 60
      })
    ])
  })

  test('reuses cached full-day heart rate for a workout without another request', async () => {
    const startTime = new Date(2026, 6, 1, 10).toISOString()
    const endTime = new Date(2026, 6, 1, 11).toISOString()
    const heartTime = new Date(2026, 6, 1, 10, 30).toISOString()
    const id = 'users/me/dataTypes/exercise/dataPoints/workout-2'
    globalThis.fetch = (async (input) => {
      requests.push(String(input))
      if (String(input).includes('/exercise/dataPoints:reconcile')) {
        return new Response(JSON.stringify({
          dataPoints: [workoutPoint(id, startTime, endTime)]
        }), { status: 200 })
      }
      return new Response(JSON.stringify({
        rollupDataPoints: [{
          startTime: heartTime,
          heartRate: { beatsPerMinuteAvg: 120 }
        }]
      }), { status: 200 })
    }) as typeof fetch

    await getWorkoutsRange('2026-07-01', '2026-07-01')
    await getIntraday('2026-07-01', false, undefined, 'heart')
    requests = []

    await expect(getWorkoutHeartRate('2026-07-01', id)).resolves.toEqual([
      { minute: 10 * 60 + 30, bpm: 120 }
    ])
    expect(requests).toHaveLength(0)
  })

  test('surfaces Google refresh failures instead of substituting generated data', async () => {
    updateSettings({ googleClientId: 'client-id', googleClientSecret: 'client-secret' })
    setSecret('google-tokens', {
      accessToken: 'expired-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() - 1
    })
    globalThis.fetch = (async (input) => {
      requests.push(String(input))
      return new Response(JSON.stringify({ error: 'temporarily_unavailable' }), { status: 503 })
    }) as typeof fetch

    await expect(getSeries(['steps'], '2026-07-01', '2026-07-01')).rejects.toThrow(
      'Google Health could not refresh its session'
    )
    expect(requests).toHaveLength(1)
  })

  test('notifies account coordination when an assistant tool discovers an invalid Google grant', async () => {
    updateSettings({ googleClientId: 'client-id', googleClientSecret: 'client-secret' })
    setSecret('google-tokens', {
      accessToken: 'expired-token',
      refreshToken: 'revoked-refresh-token',
      expiresAt: Date.now() - 1
    })
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })) as typeof fetch
    let invalidations = 0
    const stopListening = onGoogleAuthInvalidated(() => {
      invalidations += 1
    })

    try {
      await expect(
        runHealthAgentTool(
          'query_daily_metrics',
          { metrics: ['steps'], startDate: '2026-07-01', endDate: '2026-07-01' },
          new AbortController().signal
        )
      ).rejects.toThrow('Google Health access expired. Reconnect your account in Settings.')
    } finally {
      stopListening()
    }

    expect(invalidations).toBe(1)
    expect(getGoogleStatus()).toEqual({ connected: false })
  })

  test('keeps cold and overlapping Home navigation within budget without refetching covered dates', async () => {
    await loadHome('2026-07-01')
    // Weight bootstraps the cached latest-height input alongside its rollup.
    expect(requests.length).toBeLessThanOrEqual(13)
    expect(requests.some((url) => url.includes('/nutrition-log/dataPoints?'))).toBe(false)

    requests = []
    await loadHome('2026-07-02')
    // Height is cached; moving forward only extends the weight window by a day.
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
