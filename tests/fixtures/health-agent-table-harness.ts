import { expect, mock, test } from 'bun:test'
import { createHealthFixture, dateAgo } from '../../evals/fixture'
import type { MetricKey } from '../../src/shared/types'

const fixture = createHealthFixture(() => {})
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
mock.module('../../src/main/health-service', () => ({
  ...fixture,
  getSeries: async (metrics: MetricKey[], start: string, end: string, _force: boolean, signal: AbortSignal, options: { mode: string }) => {
    calls.push({ start, end, mode: options.mode })
    const result = await fixture.getSeries(metrics, start, end)
    for (const day of Object.values(result.days)) { day.weightKg = null; day.steps = options.mode === 'await' ? 20 : 10 }
    cancel?.abort()
    return result
  },
  getNutritionLogs: async (date: string) => {
    if (failFood && date === dateAgo(2)) throw new Error('Food lookup unavailable')
    return fixture.getNutritionLogs(date)
  }
}))
const { buildHealthTable } = await import('../../src/main/health-agent-table')

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
