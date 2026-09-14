// Isolated process: fake authentication/encryption and a disposable archive only.
import { afterAll, expect, mock, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mapSleep } from '../../src/main/sleep-detail'

const directory = mkdtempSync(join(tmpdir(), 'openpulse-sleep-test-'))
const date = '2026-07-10'
const main = { dataPointName: 'main', sleep: {
  interval: { startTime: '2026-07-09T23:00:00Z', endTime: '2026-07-10T05:00:00Z', civilEndTime: { date: { year: 2026, month: 7, day: 10 } } },
  summary: { minutesAsleep: '300', minutesInSleepPeriod: '360' }, metadata: { nap: false },
  stages: [{ type: 'DEEP', startTime: '2026-07-10T01:00:00Z', endTime: '2026-07-10T02:00:00Z' }]
} }
const extra = { dataPointName: 'extra', sleep: {
  interval: { startTime: '2026-07-10T14:00:00Z', endTime: '2026-07-10T16:00:00Z', civilEndTime: { date: { year: 2026, month: 7, day: 10 } } },
  summary: { minutesAsleep: '120', minutesInSleepPeriod: '120' }, metadata: { nap: true }, stages: []
} }
writeFileSync(join(directory, 'health-archive.bin'), JSON.stringify({ version: 1, days: { [date]: {
  sleep: mapSleep(main), values: { sleepMinutes: 300, sleepEfficiency: 83, steps: 4321 },
  fetched: { 'sleep-summary-v1': Date.now(), 'sleep-detail-v5': Date.now(), 'unrelated-metric': 123 }
} } }))
mock.module('electron', () => ({ app: { getPath: () => directory }, safeStorage: {
  isEncryptionAvailable: () => true,
  decryptString: (data: Buffer) => data.toString(), encryptString: (data: string) => Buffer.from(data)
} }))
mock.module('../../src/main/google-auth', () => ({ getGoogleAccessToken: async () => 'synthetic-token' }))
const { getSeries, getSleepRange } = await import('../../src/main/health-service')
const { peekDay, wipeArchive } = await import('../../src/main/metric-store')
let requests = 0
let empty = false
const originalFetch = globalThis.fetch
globalThis.fetch = (async (input) => {
  requests++
  const url = new URL(String(input))
  expect(url.pathname).toEndWith('/sleep/dataPoints:reconcile')
  const summary = url.searchParams.get('fields')!.includes('summary(')
  expect(url.searchParams.get('fields')).not.toContain('main)')
  const point = url.searchParams.has('pageToken') ? extra : main
  const projected = summary ? { ...point, sleep: { interval: point.sleep.interval, summary: point.sleep.summary, metadata: point.sleep.metadata } } : point
  return new Response(JSON.stringify(empty ? { dataPoints: [] } : {
    dataPoints: url.searchParams.has('pageToken') ? [projected, projected] : [projected],
    ...(!url.searchParams.has('pageToken') ? { nextPageToken: 'second' } : {})
  }), { status: 200 })
}) as typeof fetch

afterAll(() => { globalThis.fetch = originalFetch; wipeArchive(); rmSync(directory, { recursive: true, force: true }) })

test('refetches old settled caches and keeps summary/detail totals identical', async () => {
  const series = await getSeries(['sleepMinutes', 'sleepEfficiency'], date, date)
  expect(requests).toBe(2)
  expect(series.days[date]).toEqual({ sleepMinutes: 420, sleepEfficiency: 88 })
  const detail = await getSleepRange(date, date)
  expect(requests).toBe(4)
  expect(detail.days[0]).toMatchObject({ minutesAsleep: 420, efficiency: 88, complete: true })
  expect(detail.days[0].sessions).toHaveLength(2)
  expect(detail.days[0].sessions[0].stages).toHaveLength(1)
  expect(detail.days[0].sessions[1].minutesAsleep).toBe(120)
  expect(peekDay(date)?.sleep).toBeUndefined()
  expect(peekDay(date)?.values.steps).toBe(4321)
  expect(peekDay(date)?.fetched['unrelated-metric']).toBe(123)
  expect(await getSeries(['sleepMinutes', 'sleepEfficiency'], date, date)).toEqual(series)
  await getSleepRange(date, date)
  expect(requests).toBe(4)
  empty = true
  expect((await getSleepRange(date, date, true)).days).toEqual([])
  expect(peekDay(date)?.values.sleepMinutes).toBeNull()
  expect(peekDay(date)?.values.steps).toBe(4321)
})
