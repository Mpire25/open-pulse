import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { MetricKey } from '../src/shared/types'

const userData = mkdtempSync(join(tmpdir(), 'open-pulse-request-budgets-'))
const originalFetch = globalThis.fetch

mock.module('electron', () => ({
  app: { getPath: () => userData },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value, 'utf8'),
    decryptString: (value: Buffer) => value.toString('utf8')
  },
  shell: { openExternal: async () => undefined }
}))

const {
  getDevices,
  getIntraday,
  getSeries,
  getSleepRange,
  getWorkoutHeartRate,
  getWorkoutsRange,
  isHealthCacheTimestampFresh,
  onHealthDataChanged,
  resetHealthAccount,
  syncRecentHistory
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
const { fetchedAt, markFetched, peekDay } = await import('../src/main/metric-store')
const { setSecret, deleteSecret, updateSettings } = await import('../src/main/store')

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

beforeEach(async () => {
  deleteSecret('chatgpt-plan-registrations')
  disconnectGoogle()
  await disconnectCodex()
  resetHealthAccount()
  liveToken()
  requests = []
  globalThis.fetch = emptyHealthResponse as typeof fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

afterAll(async () => {
  deleteSecret('chatgpt-plan-registrations')
  disconnectGoogle()
  await disconnectCodex()
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
          startUtcOffset: `${-start.getTimezoneOffset() * 60}s`,
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

  test('loads intraday heart rate through a timezone probe and one rollup request', async () => {
    await getIntraday('2026-07-01', false, undefined, 'heart')

    expect(requests).toHaveLength(2)
    expect(requests.some((url) => url.includes('/heart-rate/dataPoints:rollUp'))).toBe(true)
    expect(requests.some((url) => url.includes('/heart-rate/dataPoints:reconcile'))).toBe(true)
  })

  test('loads intraday steps through a timezone probe and one rollup request', async () => {
    await getIntraday('2026-07-01', false, undefined, 'steps')

    expect(requests).toHaveLength(2)
    expect(requests.some((url) => url.includes('/steps/dataPoints:rollUp'))).toBe(true)
    expect(requests.some((url) => url.includes('/steps/dataPoints:reconcile'))).toBe(true)
  })

  test('keeps hourly step rollups when the optional timezone probe returns no point', async () => {
    const date = '2026-07-02'
    const physicalTime = new Date(2026, 6, 2, 6).toISOString()
    globalThis.fetch = (async (input) => {
      requests.push(String(input))
      const url = new URL(String(input))
      if (url.pathname.endsWith('/steps/dataPoints:rollUp')) {
        return new Response(JSON.stringify({
          rollupDataPoints: [{
            startTime: physicalTime,
            steps: { countSum: 500 }
          }]
        }), { status: 200 })
      }
      return new Response(JSON.stringify({ dataPoints: [] }), { status: 200 })
    }) as typeof fetch

    const result = await getIntraday(date, false, undefined, 'steps')

    expect(result.stepsHourly[6]).toEqual({ hour: 6, steps: 500 })
    expect(requests).toHaveLength(2)
    expect(requests.some((request) => new URL(request).searchParams.get('pageSize') === '10000')).toBe(false)
  })

  test('keeps one-minute heart-rate rollups when the optional timezone probe returns no point', async () => {
    const date = '2026-07-05'
    const physicalTime = new Date(2026, 6, 5, 6, 30).toISOString()
    globalThis.fetch = (async (input) => {
      requests.push(String(input))
      if (String(input).includes('/heart-rate/dataPoints:rollUp')) {
        return new Response(JSON.stringify({
          rollupDataPoints: [{
            startTime: physicalTime,
            heartRate: { beatsPerMinuteAvg: 80 }
          }]
        }), { status: 200 })
      }
      return new Response(JSON.stringify({ dataPoints: [] }), { status: 200 })
    }) as typeof fetch

    const result = await getIntraday(date, false, undefined, 'heart')

    expect(result.heartRate).toEqual([{ minute: 6 * 60 + 30, bpm: 80 }])
    expect(requests).toHaveLength(2)
    expect(requests.some((request) => new URL(request).searchParams.get('pageSize') === '10000')).toBe(false)
  })

  test('keeps hourly steps when the optional timezone probe fails', async () => {
    const date = '2026-07-03'
    const physicalTime = new Date(2026, 6, 3, 9).toISOString()
    globalThis.fetch = (async (input) => {
      requests.push(String(input))
      if (String(input).includes('/steps/dataPoints:rollUp')) {
        return new Response(JSON.stringify({
          rollupDataPoints: [{
            startTime: physicalTime,
            steps: { countSum: 750 }
          }]
        }), { status: 200 })
      }
      return new Response(JSON.stringify({
        error: { code: 400, message: 'Invalid field mask', status: 'INVALID_ARGUMENT' }
      }), { status: 400 })
    }) as typeof fetch

    const result = await getIntraday(date, false, undefined, 'steps')

    expect(result.stepsHourly[9]).toEqual({ hour: 9, steps: 750 })
    expect(requests).toHaveLength(2)
  })

  test('falls back to civil heart-rate samples when the tracker timezone differs', async () => {
    const date = '2026-07-01'
    const physicalTime = new Date(2026, 6, 1, 10, 30).toISOString()
    const machineOffset = -new Date(physicalTime).getTimezoneOffset() * 60
    const trackerOffset = machineOffset === 3600 ? 7200 : machineOffset + 3600
    globalThis.fetch = (async (input) => {
      requests.push(String(input))
      const url = new URL(String(input))
      if (url.pathname.endsWith('/heart-rate/dataPoints:rollUp')) {
        return new Response(JSON.stringify({
          rollupDataPoints: [{
            startTime: physicalTime,
            heartRate: { beatsPerMinuteAvg: 80 }
          }]
        }), { status: 200 })
      }
      const isProbe = url.searchParams.get('pageSize') === '1'
      return new Response(JSON.stringify({
        dataPoints: [{
          heartRate: {
            sampleTime: {
              physicalTime,
              utcOffset: `${trackerOffset}s`,
              civilTime: {
                date: { year: 2026, month: 7, day: 1 },
                time: { hours: 10, minutes: 30 }
              }
            },
            ...(isProbe ? {} : { beatsPerMinute: '120' })
          }
        }]
      }), { status: 200 })
    }) as typeof fetch

    await expect(getIntraday(date, false, undefined, 'heart')).resolves.toMatchObject({
      heartRate: [{ minute: 10 * 60 + 30, bpm: 120 }]
    })
    expect(requests).toHaveLength(3)
    expect(requests.filter((url) => url.includes('/heart-rate/dataPoints:reconcile'))).toHaveLength(2)
  })

  test('falls back to civil step intervals when the tracker timezone differs', async () => {
    const date = '2026-07-01'
    const physicalTime = new Date(2026, 6, 1, 6).toISOString()
    const machineOffset = -new Date(physicalTime).getTimezoneOffset() * 60
    const trackerOffset = machineOffset === 3600 ? 7200 : machineOffset + 3600
    globalThis.fetch = (async (input) => {
      requests.push(String(input))
      const url = new URL(String(input))
      if (url.pathname.endsWith('/steps/dataPoints:rollUp')) {
        return new Response(JSON.stringify({
          rollupDataPoints: [{
            startTime: physicalTime,
            steps: { countSum: 100 }
          }]
        }), { status: 200 })
      }
      const isProbe = url.searchParams.get('pageSize') === '1'
      return new Response(JSON.stringify({
        dataPoints: [{
          steps: {
            interval: {
              startTime: physicalTime,
              startUtcOffset: `${trackerOffset}s`,
              civilStartTime: {
                date: { year: 2026, month: 7, day: 1 },
                time: { hours: 6 }
              }
            },
            ...(isProbe ? {} : { count: '500' })
          }
        }]
      }), { status: 200 })
    }) as typeof fetch

    const result = await getIntraday(date, false, undefined, 'steps')

    expect(result.stepsHourly[6]).toEqual({ hour: 6, steps: 500 })
    expect(requests).toHaveLength(3)
    expect(requests.filter((url) => url.includes('/steps/dataPoints:reconcile'))).toHaveLength(2)
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

  test('keeps a travelled workout on its civil date and clock', async () => {
    const date = '2026-07-01'
    const startTime = '2026-07-02T03:00:00.000Z'
    const endTime = '2026-07-02T03:59:00.000Z'
    const heartTime = '2026-07-02T03:30:00.000Z'
    const id = 'users/me/dataTypes/exercise/dataPoints/travelled-workout'
    globalThis.fetch = (async (input) => {
      requests.push(String(input))
      if (String(input).includes('/exercise/dataPoints:reconcile')) {
        return new Response(JSON.stringify({
          dataPoints: [{
            dataPointName: id,
            exercise: {
              exerciseType: 'RUNNING',
              interval: {
                startTime,
                startUtcOffset: '-14400s',
                endTime,
                civilStartTime: {
                  date: { year: 2026, month: 7, day: 1 },
                  time: { hours: 23 }
                }
              },
              activeDuration: '3540s'
            }
          }]
        }), { status: 200 })
      }
      return new Response(JSON.stringify({
        rollupDataPoints: [{
          startTime: heartTime,
          heartRate: { beatsPerMinuteAvg: 125 }
        }]
      }), { status: 200 })
    }) as typeof fetch

    await getWorkoutsRange(date, date)
    requests = []

    await expect(getWorkoutHeartRate(date, id)).resolves.toEqual([
      { minute: 23 * 60 + 30, bpm: 125 }
    ])
    expect(requests).toHaveLength(1)
    expect(requests[0]).toContain('/heart-rate/dataPoints:rollUp')
  })

  test('keeps workout heart rate after a workout crosses midnight', async () => {
    const date = '2026-07-04'
    const startTime = new Date(2026, 6, 4, 23, 30).toISOString()
    const endTime = new Date(2026, 6, 5, 0, 30).toISOString()
    const beforeMidnight = new Date(2026, 6, 4, 23, 45).toISOString()
    const afterMidnight = new Date(2026, 6, 5, 0, 15).toISOString()
    const id = 'users/me/dataTypes/exercise/dataPoints/midnight-workout'
    globalThis.fetch = (async (input, init) => {
      requests.push(String(input))
      const url = new URL(String(input))
      if (url.pathname.endsWith('/exercise/dataPoints:reconcile')) {
        return new Response(JSON.stringify({
          dataPoints: [workoutPoint(id, startTime, endTime)]
        }), { status: 200 })
      }
      if (url.pathname.endsWith('/heart-rate/dataPoints:reconcile')) {
        return new Response(JSON.stringify({
          dataPoints: [{
            heartRate: {
              sampleTime: {
                physicalTime: beforeMidnight,
                utcOffset: `${-new Date(beforeMidnight).getTimezoneOffset() * 60}s`
              }
            }
          }]
        }), { status: 200 })
      }
      const body = JSON.parse(String(init?.body)) as {
        range?: { startTime?: string }
      }
      const workoutRequest = body.range?.startTime === startTime
      return new Response(JSON.stringify({
        rollupDataPoints: workoutRequest
          ? [
              { startTime: beforeMidnight, heartRate: { beatsPerMinuteAvg: 120 } },
              { startTime: afterMidnight, heartRate: { beatsPerMinuteAvg: 130 } }
            ]
          : [{ startTime: beforeMidnight, heartRate: { beatsPerMinuteAvg: 120 } }]
      }), { status: 200 })
    }) as typeof fetch

    await getWorkoutsRange(date, date)
    await getIntraday(date, false, undefined, 'heart')
    requests = []

    await expect(getWorkoutHeartRate(date, id)).resolves.toEqual([
      { minute: 23 * 60 + 45, bpm: 120 },
      { minute: 24 * 60 + 15, bpm: 130 }
    ])
    expect(requests).toHaveLength(1)
    expect(requests[0]).toContain('/heart-rate/dataPoints:rollUp')
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
      if (String(input).includes('/heart-rate/dataPoints:reconcile')) {
        return new Response(JSON.stringify({
          dataPoints: [{
            heartRate: {
              sampleTime: {
                physicalTime: heartTime,
                utcOffset: `${-new Date(heartTime).getTimezoneOffset() * 60}s`
              }
            }
          }]
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

  test('refreshes stale recent full-day heart rate before using it for a workout', async () => {
    const now = Date.now()
    const recent = new Date(now)
    recent.setDate(recent.getDate() - 1)
    const date = [
      recent.getFullYear(),
      String(recent.getMonth() + 1).padStart(2, '0'),
      String(recent.getDate()).padStart(2, '0')
    ].join('-')
    const startTime = new Date(recent.getFullYear(), recent.getMonth(), recent.getDate(), 10).toISOString()
    const endTime = new Date(recent.getFullYear(), recent.getMonth(), recent.getDate(), 11).toISOString()
    const heartTime = new Date(recent.getFullYear(), recent.getMonth(), recent.getDate(), 10, 30).toISOString()
    const id = 'users/me/dataTypes/exercise/dataPoints/workout-stale-day'
    globalThis.fetch = (async (input) => {
      requests.push(String(input))
      if (String(input).includes('/exercise/dataPoints:reconcile')) {
        return new Response(JSON.stringify({
          dataPoints: [workoutPoint(id, startTime, endTime)]
        }), { status: 200 })
      }
      if (String(input).includes('/heart-rate/dataPoints:reconcile')) {
        return new Response(JSON.stringify({
          dataPoints: [{
            heartRate: {
              sampleTime: {
                physicalTime: heartTime,
                utcOffset: `${-new Date(heartTime).getTimezoneOffset() * 60}s`
              }
            }
          }]
        }), { status: 200 })
      }
      return new Response(JSON.stringify({
        rollupDataPoints: [{
          startTime: heartTime,
          heartRate: { beatsPerMinuteAvg: 120 }
        }]
      }), { status: 200 })
    }) as typeof fetch

    await getWorkoutsRange(date, date)
    await getIntraday(date, false, undefined, 'heart')
    markFetched('intraday-heart-v5', [date], now - 31 * 60_000)
    requests = []

    await getWorkoutHeartRate(date, id)

    expect(requests).toHaveLength(1)
    expect(requests[0]).toContain('/heart-rate/dataPoints:rollUp')
  })

  test('rechecks every age of cached data, less often the older it is', () => {
    const now = Date.now()
    const today = new Date(now)
    const todayDate = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0')
    ].join('-')
    const hour = 60 * 60_000
    const day = 24 * hour

    expect(isHealthCacheTimestampFresh(todayDate, now - 60_000, now)).toBe(true)
    expect(isHealthCacheTimestampFresh(todayDate, now - 2 * 60_000, now)).toBe(false)
    for (const recentDate of [shiftIsoDate(todayDate, -1), shiftIsoDate(todayDate, -3)]) {
      expect(isHealthCacheTimestampFresh(recentDate, now - 29 * 60_000, now)).toBe(true)
      expect(isHealthCacheTimestampFresh(recentDate, now - 30 * 60_000, now)).toBe(false)
    }
    for (const weekDate of [shiftIsoDate(todayDate, -4), shiftIsoDate(todayDate, -14)]) {
      expect(isHealthCacheTimestampFresh(weekDate, now - 23 * hour, now)).toBe(true)
      expect(isHealthCacheTimestampFresh(weekDate, now - day, now)).toBe(false)
    }
    for (const historyDate of [shiftIsoDate(todayDate, -15), shiftIsoDate(todayDate, -179)]) {
      expect(isHealthCacheTimestampFresh(historyDate, now - 6 * day, now)).toBe(true)
      expect(isHealthCacheTimestampFresh(historyDate, now - 7 * day, now)).toBe(false)
    }
    const archivedDate = shiftIsoDate(todayDate, -180)
    expect(isHealthCacheTimestampFresh(archivedDate, now - 29 * day, now)).toBe(true)
    expect(isHealthCacheTimestampFresh(archivedDate, now - 30 * day, now)).toBe(false)
    // Settled history is no longer trusted forever.
    expect(isHealthCacheTimestampFresh(archivedDate, 0, now)).toBe(false)
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
    expect(requests.length).toBeLessThanOrEqual(14)
    expect(requests.some((url) => url.includes('/nutrition-log/dataPoints?'))).toBe(false)

    requests = []
    await loadHome('2026-07-02')
    // Height is cached; moving forward only extends the weight window by a day.
    expect(requests.length).toBeLessThanOrEqual(13)

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
    setSecret('chatgpt-plan-registrations', { active: 'issued-test', registrations: { 'issued-test': { clientId: 'issued-test', subject: 'test-user', tokens: {
      clientId: 'issued-test', subject: 'test-user', scopes: ['chatgpt.tokens.use.direct'],
      accessToken: 'expired-codex-token', refreshToken: 'codex-refresh-token', expiresAt: Date.now() - 1
    } } } })
    let finishRefresh!: () => void
    globalThis.fetch = (async (input, init) => {
      requests.push(String(input))
      return new Promise<Response>((resolve, reject) => {
        finishRefresh = () => resolve(new Response(JSON.stringify({
          access_token: 'new-codex-token',
          refresh_token: 'rotated-codex-refresh-token',
          scope: 'chatgpt.tokens.use.direct', token_type: 'Bearer',
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

describe('health data freshness', () => {
  function localToday(): string {
    const now = new Date()
    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-')
  }

  function stepsResponse(date: string, steps: number): Response {
    const [year, month, day] = date.split('-').map(Number)
    return new Response(JSON.stringify({
      rollupDataPoints: [{ civilStartTime: { date: { year, month, day } }, steps: { countSum: String(steps) } }]
    }), { status: 200 })
  }

  function sleepResponse(date: string, minutesAsleep: number): Response {
    const night = shiftIsoDate(date, -1)
    const [year, month, day] = date.split('-').map(Number)
    const [startYear, startMonth, startDay] = night.split('-').map(Number)
    return new Response(JSON.stringify({
      dataPoints: [{
        sleep: {
          interval: {
            startTime: `${night}T22:30:00Z`,
            endTime: `${date}T06:30:00Z`,
            civilStartTime: { date: { year: startYear, month: startMonth, day: startDay }, time: { hours: 22, minutes: 30 } },
            civilEndTime: { date: { year, month, day }, time: { hours: 6, minutes: 30 } }
          },
          type: 'STAGES',
          stages: [{ type: 'DEEP', startTime: `${night}T23:00:00Z`, endTime: `${night}T23:30:00Z` }],
          metadata: { main: true },
          summary: { minutesAsleep: String(minutesAsleep), minutesInSleepPeriod: '480' }
        }
      }]
    }), { status: 200 })
  }

  function changeNotification(): Promise<void> {
    return new Promise((resolve) => onHealthDataChanged(() => {
      onHealthDataChanged(null)
      resolve()
    }))
  }

  afterEach(async () => {
    onHealthDataChanged(null)
    // Changed awaited reads now notify too; let their debounce finish before
    // a following test installs its listener.
    await new Promise((resolve) => setTimeout(resolve, 350))
  })

  test('shows stored days at once and rechecks stale ones in the background', async () => {
    const date = shiftIsoDate(localToday(), -20)
    let steps = 1000
    let release: (() => void) | null = null
    globalThis.fetch = (async (input: string | URL | Request) => {
      requests.push(String(input))
      if (release === null && steps === 2000) await new Promise<void>((resolve) => { release = resolve })
      return stepsResponse(date, steps)
    }) as typeof fetch

    // Never fetched: the first read waits for Google.
    expect((await getSeries(['steps'], date, date)).days[date].steps).toBe(1000)

    // Past its weekly recheck, the stored value is served while Google is asked again.
    markFetched('steps', [date], Date.now() - 8 * 24 * 60 * 60_000)
    steps = 2000
    const changed = changeNotification()
    expect((await getSeries(['steps'], date, date)).days[date].steps).toBe(1000)
    while (!release) await new Promise((resolve) => setTimeout(resolve, 5))
    ;(release as () => void)()
    await changed
    expect((await getSeries(['steps'], date, date)).days[date].steps).toBe(2000)
  })

  test('a delayed background response cannot overwrite a newer assistant read', async () => {
    const date = shiftIsoDate(localToday(), -20)
    let releaseBackground!: () => void
    let backgroundStarted!: () => void
    const started = new Promise<void>((resolve) => { backgroundStarted = resolve })
    globalThis.fetch = (async (input: string | URL | Request) => {
      requests.push(String(input))
      if (requests.length === 2) {
        await new Promise<void>((resolve) => {
          releaseBackground = resolve
          backgroundStarted()
        })
        return stepsResponse(date, 1500)
      }
      return stepsResponse(date, requests.length === 1 ? 1000 : 2000)
    }) as typeof fetch

    await getSeries(['steps'], date, date)
    markFetched('steps', [date], Date.now() - 8 * 24 * 60 * 60_000)
    expect((await getSeries(['steps'], date, date)).days[date].steps).toBe(1000)
    await started
    try {
      const output = JSON.parse(await runHealthAgentTool(
        'query_daily_metrics',
        { metrics: ['steps'], startDate: date, endDate: date },
        new AbortController().signal
      )) as { days: Record<string, { steps: number }> }
      expect(output.days[date].steps).toBe(2000)
      const newerTimestamp = fetchedAt('steps', date)

      releaseBackground()
      // Let the released response and its archive writes finish.
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(peekDay(date)?.values.steps).toBe(2000)
      expect(fetchedAt('steps', date)).toBe(newerTimestamp)
      expect(requests).toHaveLength(3)
    } finally {
      releaseBackground()
    }
  })

  test.each([440, 450])('a newer sleep summary keeps stages and rechecks detail only if totals differ (%i minutes)', async (detailMinutes) => {
    const date = shiftIsoDate(localToday(), -20)
    let releaseDetail!: () => void
    let detailStarted!: () => void
    const started = new Promise<void>((resolve) => { detailStarted = resolve })
    globalThis.fetch = (async (input: string | URL | Request) => {
      requests.push(String(input))
      if (requests.length === 1) {
        await new Promise<void>((resolve) => {
          releaseDetail = resolve
          detailStarted()
        })
        return sleepResponse(date, detailMinutes)
      }
      return sleepResponse(date, 450)
    }) as typeof fetch

    const detail = getSleepRange(date, date)
    await started
    try {
      expect((await getSeries(['sleepMinutes'], date, date)).days[date].sleepMinutes).toBe(450)
    } finally {
      releaseDetail()
    }

    const nights = (await detail).days
    expect(nights.map((day) => day.date)).toEqual([date])
    expect(peekDay(date)?.sleepDay?.sessions[0]?.stages).toHaveLength(1)
    expect(peekDay(date)?.values.sleepMinutes).toBe(450)
    expect(requests).toHaveLength(2)
    if (detailMinutes !== 450) expect(fetchedAt('sleep-detail-v6', date)).toBe(0)
    const refreshed = await getSleepRange(date, date, false, undefined, { mode: 'await', priority: 0 })
    expect(refreshed.days[0]?.minutesAsleep).toBe(450)
    expect(refreshed.days[0]?.sessions[0]?.stages).toHaveLength(1)
    expect(fetchedAt('sleep-detail-v6', date)).toBeGreaterThan(0)
    expect(requests).toHaveLength(detailMinutes === 450 ? 2 : 3)
  })

  test('a changed sleep summary invalidates previously fetched detail', async () => {
    const date = shiftIsoDate(localToday(), -20)
    globalThis.fetch = (async (input: string | URL | Request) => {
      requests.push(String(input))
      return sleepResponse(date, requests.length === 1 ? 440 : 450)
    }) as typeof fetch
    await getSleepRange(date, date)
    markFetched('sleep-summary-v2', [date], 0)
    const summary = await getSeries(['sleepMinutes'], date, date, false, undefined, { mode: 'await', priority: 0 })
    expect(summary.days[date].sleepMinutes).toBe(450)
    expect(peekDay(date)?.sleepDay?.sessions[0]?.stages).toHaveLength(1)
    expect(fetchedAt('sleep-detail-v6', date)).toBe(0)
    const refreshed = await getSleepRange(date, date, false, undefined, { mode: 'await', priority: 0 })
    expect(refreshed.days[0]?.minutesAsleep).toBe(450)
    expect(requests).toHaveLength(3)
  })

  test('notifies once for a changed span even when another span fails, and still logs the failure', async () => {
    const start = shiftIsoDate(localToday(), -22)
    const middle = shiftIsoDate(start, 1)
    const end = shiftIsoDate(start, 2)
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      requests.push(String(input))
      const day = JSON.parse(String(init?.body)).range.start.date.day
      return stepsResponse(day === Number(start.slice(-2)) ? start : end, 1000)
    }) as typeof fetch
    await getSeries(['steps'], start, start)
    await getSeries(['steps'], end, end)
    // Finish the notifications from seeding the archive before observing the recheck.
    await new Promise((resolve) => setTimeout(resolve, 350))
    markFetched('steps', [start, end], Date.now() - 8 * 24 * 60 * 60_000)
    // The fresh middle date splits the stale days into independent spans.
    markFetched('steps', [middle])
    requests = []
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      requests.push(String(input))
      const day = JSON.parse(String(init?.body)).range.start.date.day
      if (day === Number(start.slice(-2))) return new Response('span unavailable', { status: 503 })
      return stepsResponse(end, 2000)
    }) as typeof fetch

    let notifications = 0
    let notified!: () => void
    const notification = new Promise<void>((resolve) => { notified = resolve })
    onHealthDataChanged(() => { notifications++; notified() })
    const errors = spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const cached = await getSeries(['steps'], start, end)
      expect(cached.days[end].steps).toBe(1000)
      await notification
      await new Promise((resolve) => setTimeout(resolve, 350))
      expect(peekDay(end)?.values.steps).toBe(2000)
      expect(peekDay(start)?.values.steps).toBe(1000)
      expect(notifications).toBe(1)
      expect(requests).toHaveLength(2)
      expect(errors).toHaveBeenCalledTimes(1)
      expect(errors.mock.calls[0][0]).toBe('[health] background recheck of steps failed:')
      expect(errors.mock.calls[0][1]).toHaveProperty('status', 503)
    } finally {
      errors.mockRestore()
    }
  })

  test('assistant reads wait for stale days to be rechecked', async () => {
    const date = shiftIsoDate(localToday(), -20)
    let steps = 1000
    globalThis.fetch = (async (input: string | URL | Request) => {
      requests.push(String(input))
      return stepsResponse(date, steps)
    }) as typeof fetch
    await getSeries(['steps'], date, date)
    markFetched('steps', [date], Date.now() - 8 * 24 * 60 * 60_000)
    steps = 2000

    const output = JSON.parse(await runHealthAgentTool(
      'query_daily_metrics',
      { metrics: ['steps'], startDate: date, endDate: date },
      new AbortController().signal
    )) as { days: Record<string, { steps: number }> }
    expect(output.days[date].steps).toBe(2000)
  })

  test('assistant reads notify when they change archived values', async () => {
    const date = shiftIsoDate(localToday(), -20)
    let steps = 1000
    globalThis.fetch = (async (input: string | URL | Request) => {
      requests.push(String(input))
      return stepsResponse(date, steps)
    }) as typeof fetch
    const seeded = changeNotification()
    await getSeries(['steps'], date, date)
    await seeded
    markFetched('steps', [date], Date.now() - 8 * 24 * 60 * 60_000)
    steps = 2000

    const changed = changeNotification()
    const output = JSON.parse(await runHealthAgentTool(
      'query_daily_metrics',
      { metrics: ['steps'], startDate: date, endDate: date },
      new AbortController().signal
    )) as { days: Record<string, { steps: number }> }
    expect(output.days[date].steps).toBe(2000)
    await changed
    expect(peekDay(date)?.values.steps).toBe(2000)
  })

  test('a tracker sync after a long gap rechecks every day the gap covered', async () => {
    const today = localToday()
    let lastSyncTime = new Date(Date.now() - 10 * 24 * 60 * 60_000).toISOString()
    globalThis.fetch = (async (input: string | URL | Request) => {
      requests.push(String(input))
      if (String(input).includes('/pairedDevices')) {
        return new Response(JSON.stringify({ pairedDevices: [{ deviceVersion: 'Air', lastSyncTime }] }), { status: 200 })
      }
      return new Response(JSON.stringify({ dataPoints: [], rollupDataPoints: [] }), { status: 200 })
    }) as typeof fetch

    await getDevices(true)
    const insideGap = shiftIsoDate(today, -8)
    const beforeGap = shiftIsoDate(today, -12)
    markFetched('steps', [insideGap, beforeGap])

    lastSyncTime = new Date().toISOString()
    const changed = changeNotification()
    await getDevices(true)
    await changed
    expect(fetchedAt('steps', insideGap)).toBe(0)
    expect(fetchedAt('steps', beforeGap)).not.toBe(0)
  })

  test('the background sync fills the rolling window once, then only rechecks what is due', async () => {
    await syncRecentHistory()
    const firstSweep = requests.length
    expect(firstSweep).toBeGreaterThan(0)

    // Range requests per data type (a few types are capped at two weeks per
    // request), not one request per day.
    expect(firstSweep).toBeLessThanOrEqual(60)

    requests = []
    await syncRecentHistory()
    expect(requests).toEqual([])
  }, 60_000)
})
