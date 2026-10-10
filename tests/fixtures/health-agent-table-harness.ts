import { expect, mock, test } from 'bun:test'
import { createHealthFixture, dateAgo } from '../../evals/fixture'
import type { MetricKey, SleepRangeResult } from '../../src/shared/types'

const fixture = createHealthFixture(() => {})
let sleepOverride: SleepRangeResult | null = null
let staleMetrics: Record<string, MetricKey[]> = {}
let failToday = false
let failSleep = false
let accountChanged = false
let failFood = false
let cancel: AbortController | null = null
const calls: Array<{ start: string; end: string; mode?: string }> = []
mock.module('../../src/main/health-api', () => ({
  shiftIsoDate: (date: string, shift: number) => {
    const value = new Date(`${date}T12:00:00Z`)
    value.setUTCDate(value.getUTCDate() + shift)
    return value.toISOString().slice(0, 10)
  }
}))
mock.module('../../src/main/health-agent-tools', () => ({
  METRIC_UNITS: { steps: 'steps' },
  dailyPayload: (metrics: MetricKey[], result: unknown) => ({ metrics, ...(result as object) })
}))
const readSeries = async (metrics: MetricKey[], start: string, end: string, mode: string) => {
  calls.push({ start, end, mode })
  const result = await fixture.getSeries(metrics, start, end)
  for (const day of Object.values(result.days)) { day.weightKg = null; day.steps = mode === 'await' ? 20 : 10 }
  cancel?.abort()
  return result
}
mock.module('../../src/main/health-service', () => ({
  ...fixture,
  healthAccountSnapshotGuard: () => () => { if (accountChanged) throw new Error('Account changed') },
  getArchivedSleepHistory: (start: string, end: string) => sleepOverride ?? fixture.getSleepRange(start, end),
  getHealthHistoryFreshness: () => staleMetrics,
  getSleepRange: async (start: string, end: string) => {
    if (failSleep) throw new Error('Sleep refresh failed')
    return sleepOverride ?? fixture.getSleepRange(start, end)
  },
  getArchivedHealthHistory: async (metrics: MetricKey[], start: string, end: string) => ({
    series: await readSeries(metrics, start, end, 'background'),
    workouts: await fixture.getWorkoutsRange(start, end),
    staleMetrics: structuredClone(staleMetrics)
  }),
  getSeries: async (metrics: MetricKey[], start: string, end: string) => {
    if (failToday) throw new Error('Today refresh failed')
    return readSeries(metrics, start, end, 'await')
  },
  getNutritionLogs: async (date: string) => {
    if (failFood && date === dateAgo(2)) throw new Error('Food lookup unavailable')
    return fixture.getNutritionLogs(date)
  }
}))
const { buildHealthTable } = await import('../../src/main/health-agent-table')
const { resolvePresentation } = await import('../../src/main/assistant-presentation')

test('uses 180 archived days and fresh today, drops empty columns and preserves usable detail', async () => {
  const table = await buildHealthTable(dateAgo(0), new AbortController().signal)
  expect(table.start).toBe(dateAgo(179))
  expect(calls).toEqual([
    { start: dateAgo(179), end: dateAgo(0), mode: 'background' },
    { start: dateAgo(0), end: dateAgo(0), mode: 'await' }
  ])
  const daily = table.datasets.get('health-table')!.data as { metrics: string[]; days: Record<string, { steps: number }> }
  expect(daily.metrics).not.toContain('weightKg')
  expect(daily.metrics).not.toContain('sodiumG')
  expect(daily.days[dateAgo(0)].steps).toBe(20)
  expect(daily.days[dateAgo(1)].steps).toBe(10)
  expect(table.text).toContain(`${dateAgo(0)},20,`)
  expect(table.text).toContain('not zero or proof that no record exists')
  expect(table.text).not.toContain('STALE CACHED VALUES')
  expect(table.needsRevalidation).toBe(false)
  expect(table.datasets.get('health-table-sleep')!.tool).toBe('query_sleep')
  expect(table.datasets.get(`health-table-food-${dateAgo(1)}`)!.tool).toBe('query_nutrition_logs')
})

test('a failed food day is unavailable, while successful days remain usable', async () => {
  failFood = true
  try {
    const table = await buildHealthTable(dateAgo(0), new AbortController().signal)
    expect(table.text).toContain(`${dateAgo(2)}: food log unavailable`)
    expect(table.datasets.has(`health-table-food-${dateAgo(2)}`)).toBe(false)
    expect(table.datasets.has(`health-table-food-${dateAgo(1)}`)).toBe(true)
  } finally { failFood = false }
})

test('cancellation during reads cannot publish a partial table', async () => {
  cancel = new AbortController()
  try { await expect(buildHealthTable(dateAgo(0), cancel.signal)).rejects.toThrow() }
  finally { cancel = null }
})


test('unmeasured sleep stages remain unavailable while measured zeros stay zero', async () => {
  const sleep = await fixture.getSleepRange(dateAgo(0), dateAgo(0))
  const main = sleep.days[0].sessions.find((session) => session.id === sleep.days[0].mainSessionId)!
  main.stageMinutes = { AWAKE: 0 }
  sleepOverride = sleep
  try {
    const table = await buildHealthTable(dateAgo(0), new AbortController().signal)
    expect(table.text).toContain('deep unavailable, REM unavailable, light unavailable, awake 0 min')
    expect(table.text).not.toContain('REM 0')
  } finally { sleepOverride = null }
})


test('prefetched sleep totals include the main night and nap in every daily presentation', async () => {
  const date = dateAgo(0)
  const sleep = await fixture.getSleepRange(date, date)
  const day = sleep.days[0]
  const main = day.sessions.find((session) => session.id === day.mainSessionId)!
  main.minutesAsleep = 300
  const nap = { ...main, id: 'nap', isMainSleep: false, minutesAsleep: 120 }
  // Put the nap first to also verify that session cards retain main-session selection.
  day.sessions = [nap, main]
  day.minutesAsleep = 420
  sleepOverride = sleep
  try {
    const table = await buildHealthTable(date, new AbortController().signal)
    const datasetId = 'health-table-sleep'
    const data = table.datasets.get(datasetId)!.data as { days: Array<{ minutesAsleep: number; sessionCount: number }> }
    expect(data.days[0].minutesAsleep).toBe(420)
    expect(data.days[0].sessionCount).toBe(2)
    const [card] = resolvePresentation({ metricCards: [{ datasetId, date, metric: 'sleepMinutes' }] }, table.datasets)
    expect(card.type).toBe('metric-card')
    if (card.type === 'metric-card') expect(card.value).toBe(420)
    const [comparison] = resolvePresentation({ comparisons: [{
      datasetId, metric: 'sleepMinutes', title: 'Sleep',
      currentStartDate: date, currentEndDate: date, previousStartDate: date, previousEndDate: date,
      currentLabel: 'Current', previousLabel: 'Previous'
    }] }, table.datasets)
    expect(comparison.type).toBe('comparison')
    if (comparison.type === 'comparison') {
      expect(comparison.current.value).toBe(420)
      expect(comparison.previous.value).toBe(420)
    }
    const [overview] = resolvePresentation({ overviews: [{
      datasetId, title: 'Sleep', startDate: date, endDate: date, metrics: ['sleepMinutes', 'sleepEfficiency']
    }] }, table.datasets)
    expect(overview.type).toBe('overview')
    if (overview.type === 'overview') expect(overview.items.find((item) => item.metric === 'sleepMinutes')!.value).toBe(420)
    const [session] = resolvePresentation({ sleepCards: [{ datasetId, date, sessionId: null }] }, table.datasets)
    expect(session.type).toBe('sleep-card')
    if (session.type === 'sleep-card') {
      expect(session.night.id).toBe(main.id)
      expect(session.night.minutesAsleep).toBe(300)
    }
  } finally { sleepOverride = null }
})


test('stale populated values are explicitly provisional rather than presented as complete', async () => {
  staleMetrics = { [dateAgo(1)]: ['steps', 'caloriesOut'], [dateAgo(30)]: ['steps'] }
  try {
    const table = await buildHealthTable(dateAgo(0), new AbortController().signal)
    expect(table.text).toContain(`${dateAgo(1)}: steps,caloriesOut`)
    expect(table.text).toContain(`${dateAgo(30)}: steps`)
    expect(table.text).toContain('only the following date/metric pairs need revalidation')
    expect(table.needsRevalidation).toBe(true)
  } finally { staleMetrics = {} }
})


for (const failure of ['today', 'sleep', 'both']) {
  test(`keeps archived history and successful sections when ${failure} refresh fails`, async () => {
    failToday = failure !== 'sleep'
    failSleep = failure !== 'today'
    try {
      const table = await buildHealthTable(dateAgo(0), new AbortController().signal)
      expect(table.datasets.has('health-table')).toBe(true)
      expect(table.datasets.has('health-table-sleep')).toBe(true)
      expect(table.datasets.has(`health-table-food-${dateAgo(1)}`)).toBe(true)
      expect(table.text).toContain(`${dateAgo(1)},10,`)
      expect(table.text.includes("Today's metric refresh unavailable")).toBe(failToday)
      expect(table.text.includes('Sleep detail is stale or unavailable')).toBe(failSleep)
      expect(table.needsRevalidation).toBe(true)
    } finally { failToday = false; failSleep = false }
  })
}

test('never publishes a prior-account snapshot after an account switch', async () => {
  accountChanged = true
  try { await expect(buildHealthTable(dateAgo(0), new AbortController().signal)).rejects.toThrow('Account changed') }
  finally { accountChanged = false }
})


test('a resolved cached sleep result still needs revalidation when detail coverage is stale', async () => {
  sleepOverride = { ...await fixture.getSleepRange(dateAgo(0), dateAgo(0)), provisionalDates: [dateAgo(0)] }
  try {
    const table = await buildHealthTable(dateAgo(0), new AbortController().signal)
    expect(table.text).toContain('Sleep detail is stale or unavailable')
    expect(table.needsRevalidation).toBe(true)
    expect(table.datasets.get('health-table-sleep')!.data).toMatchObject({ provisionalDates: [dateAgo(0)] })
  } finally { sleepOverride = null }
})
