import { describe, expect, test } from 'bun:test'
import { cachedSleepDay, groupSleepDays, selectedSleepSession } from '../src/shared/sleep'
import { mapSleep } from '../src/main/sleep-detail'
import { healthAgentModelData } from '../src/main/health-agent-analysis'
import { normalizeAssistantParts } from '../src/shared/assistant-parts'
import { resolvePresentation, type AgentDataset } from '../src/main/assistant-presentation'
import type { SleepNight } from '../src/shared/types'

function session(id: string, start: string, end: string, asleep: number, period: number, nap = false): SleepNight {
  return mapSleep({ dataPointName: id, sleep: {
    interval: { startTime: start, endTime: end, civilEndTime: { date: { year: 2026, month: 9, day: 14 } } },
    summary: { minutesAsleep: String(asleep), minutesInSleepPeriod: String(period) },
    metadata: { nap },
    stages: [{ type: 'LIGHT', startTime: start, endTime: end }]
  } })!
}
const main = session('main', '2026-09-13T23:00:00Z', '2026-09-14T05:00:00Z', 300, 360)
const extra = session('extra', '2026-09-14T14:00:00Z', '2026-09-14T16:00:00Z', 120, 120, true)

function dataset(nights = [main, extra]): Map<string, AgentDataset> {
  return new Map([['sleep', { tool: 'query_sleep', data: {
    source: 'live', requestedRange: { start: '2026-09-14', end: '2026-09-15' }, detail: 'summary',
    days: groupSleepDays(nights).map(({ sessions, ...day }) => ({ ...day, sessionCount: sessions.length })), nights
  } }]])
}

describe('daily sleep and individual sessions', () => {
  test('keeps the one-session values and main selection', () => {
    const [day] = groupSleepDays([main])
    expect(day).toMatchObject({ minutesAsleep: 300, minutesInSleepPeriod: 360, efficiency: 83, complete: true })
    expect(selectedSleepSession(day)).toEqual(main)
    expect(day.sessions).toHaveLength(1)
  })

  test('adds all sleep and weights efficiency without counting the gap', () => {
    const [day] = groupSleepDays([extra, main])
    expect(day).toMatchObject({ minutesAsleep: 420, minutesInSleepPeriod: 480, efficiency: 88 })
    expect(day.sessions.map((s) => s.id)).toEqual(['main', 'extra'])
    expect(selectedSleepSession(day)?.id).toBe('main')
    expect(selectedSleepSession(day, 'extra')?.minutesAsleep).toBe(120)
    expect(selectedSleepSession(day, 'old-missing-id')?.id).toBe('main')
    expect(day.minutesAsleep).toBe(420)
  })

  test('prefers main sleep, then longest, with stable chronological tie breaking', () => {
    expect(groupSleepDays([{ ...main, minutesAsleep: 60 }, extra])[0].mainSessionId).toBe('main')
    expect(groupSleepDays([{ ...main, isMainSleep: false }, extra])[0].mainSessionId).toBe('main')
    expect(groupSleepDays([{ ...extra, isMainSleep: true }, main])[0].mainSessionId).toBe('main')
  })

  test('deduplicates repeated records and the same physical interval under another id', () => {
    const repeatedInterval = { ...extra, id: 'copy', startTime: '2026-09-14T22:00:00+08:00', endTime: '2026-09-15T00:00:00+08:00' }
    const [day] = groupSleepDays([main, extra, { ...main }, repeatedInterval])
    expect(day.sessions).toHaveLength(2)
    expect(day.minutesAsleep).toBe(420)
  })

  test('retains durations without stages and avoids efficiency from a missing denominator', () => {
    const [day] = groupSleepDays([main, { ...extra, stages: [], minutesInSleepPeriod: 0 }])
    expect(day.minutesAsleep).toBe(420)
    expect(day.efficiency).toBeNull()
    expect(day.sessions[1].stages).toEqual([])
  })

  test('uses tracker wake dates across midnight and UTC date differences', () => {
    const local = session('local', '2026-09-13T14:00:00Z', '2026-09-13T23:00:00Z', 480, 540)
    expect(groupSleepDays([local])[0].date).toBe('2026-09-14')
    expect(groupSleepDays([main, { ...extra, date: '2026-09-15' }])).toHaveLength(2)
  })

  test('summary and detail projections produce identical daily metrics', () => {
    const detailed = groupSleepDays([main, extra])[0]
    const summary = groupSleepDays([main, extra].map((s) => ({ ...s, stages: [], stageMinutes: {} })))[0]
    expect(summary.minutesAsleep).toBe(detailed.minutesAsleep)
    expect(summary.efficiency).toBe(detailed.efficiency)
  })

  test('legacy caches remain incomplete until replaced; empty refreshes clear old sleep', () => {
    const old = { sleep: main }
    expect(cachedSleepDay(old)?.complete).toBe(false)
    const fresh = groupSleepDays([main, extra])[0]
    expect(cachedSleepDay({ ...old, sleepDay: fresh })).toEqual(fresh)
    expect(cachedSleepDay({ ...old, sleepDay: null })).toBeNull()
    expect(old.sleep).toBe(main)
  })

  test('Assistant charts use daily totals and averages count days, not sessions', () => {
    const next = { ...main, id: 'next', date: '2026-09-15', startTime: '2026-09-14T23:00:00Z', endTime: '2026-09-15T05:00:00Z' }
    const parts = resolvePresentation({ comparisons: [{ datasetId: 'sleep', metric: 'sleepMinutes', title: 'Sleep',
      currentLabel: 'Two days', currentStartDate: '2026-09-14', currentEndDate: '2026-09-15', currentAggregation: 'average',
      previousLabel: 'First day', previousStartDate: '2026-09-14', previousEndDate: '2026-09-14', previousAggregation: 'value'
    }] }, dataset([main, extra, next]))
    expect(parts[0]).toMatchObject({ current: { value: 360, observations: 2 }, previous: { value: 420 } })
  })

  test('Assistant cards select the requested session and preserve identity through saved history', () => {
    const parts = resolvePresentation({ sleepCards: [{ datasetId: 'sleep', date: '2026-09-14', sessionId: 'extra' }] }, dataset())
    expect(parts[0]).toMatchObject({ night: { id: 'extra', minutesAsleep: 120 }, action: { sessionId: 'extra' } })
    expect(normalizeAssistantParts(JSON.parse(JSON.stringify(parts)))).toEqual(parts)
    expect(() => resolvePresentation({ sleepCards: [{ datasetId: 'sleep', date: '2026-09-14', sessionId: 'missing' }] }, dataset())).toThrow()
  })

  test('saved cards without session ids still render', () => {
    const legacy = { ...main, id: undefined }
    const parts = resolvePresentation({ sleepCards: [{ datasetId: 'sleep', date: '2026-09-14' }] }, dataset([legacy]))
    expect(normalizeAssistantParts(parts)).toHaveLength(1)
  })

  test('Assistant summary exposes totals and ids without leaking raw stage arrays', () => {
    const data = dataset().get('sleep')!.data as Record<string, unknown>
    const output = healthAgentModelData('query_sleep', data, 'Asia/Shanghai')
    expect(output.days).toMatchObject([{ minutesAsleep: 420, sessionCount: 2 }])
    const nights = output.nights as Record<string, unknown>[]
    expect(nights[1].id).toBe('extra')
    expect(nights[1].stages).toBeUndefined()
    expect(nights[1].localStartTime).toBe('2026-09-14 22:00')
  })
})
