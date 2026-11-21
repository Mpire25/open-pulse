import { describe, expect, test } from 'bun:test'
import { buildHealthExport, type HealthExportInput } from '../src/main/health-export-format'
import {
  EXPORT_FULL_HEART_RATE_MAX_DAYS,
  EXPORT_SECTIONS,
  estimateExportBytes,
  exportOptionsProblem,
  exportRangeDays,
  normalizeExportSelection,
  type HealthExportOptions
} from '../src/shared/health-export'
import { METRIC_KEYS, type SleepNight } from '../src/shared/types'

const night: SleepNight = {
  id: 'night-1',
  date: '2026-11-20',
  startTime: '2026-11-19T23:00:00Z',
  endTime: '2026-11-20T07:00:00Z',
  minutesAsleep: 440,
  minutesInSleepPeriod: 480,
  efficiency: 92,
  isMainSleep: true,
  stages: [
    { type: 'LIGHT', startTime: '2026-11-19T23:00:00Z', endTime: '2026-11-19T23:30:00Z' },
    { type: 'DEEP', startTime: '2026-11-19T23:30:00Z', endTime: '2026-11-20T00:15:00Z' }
  ],
  stageMinutes: { LIGHT: 30, DEEP: 45 },
  stageCounts: { LIGHT: 1, DEEP: 1 },
  minutesAwake: 40,
  minutesToFirstDeepOrRem: 30,
  deepRemMinutes: 45,
  interruptionMinutes: 0,
  interruptionCount: 0,
  minutesToFallAsleep: 5,
  minutesAfterWakeUp: 0,
  outOfBedSegments: [],
  sleepType: 'stages',
  processed: true,
  manuallyEdited: false,
  stagesStatus: null,
  respiratory: null
}

function input(overrides: Partial<HealthExportInput> = {}): HealthExportInput {
  return {
    start: '2026-11-20',
    end: '2026-11-21',
    today: '2026-11-21',
    exportedAt: new Date('2026-11-21T12:00:00Z'),
    timeZone: 'UTC',
    metrics: [...METRIC_KEYS],
    sections: [...EXPORT_SECTIONS],
    fullHeartRate: false,
    devices: [],
    daily: {
      '2026-11-21': { steps: 4_000 },
      '2026-11-20': { steps: 9_500, restingHeartRate: 58 }
    },
    sleep: [{
      date: '2026-11-20',
      sessions: [night],
      mainSessionId: 'night-1',
      minutesAsleep: 440,
      minutesInSleepPeriod: 480,
      efficiency: 92,
      complete: true
    }],
    workouts: [],
    nutrition: [{
      date: '2026-11-20',
      entries: [{
        id: 'log-1',
        startTime: '2026-11-20T08:15:00Z',
        endTime: '2026-11-20T08:15:00Z',
        foodName: 'Oats',
        mealType: 'Breakfast',
        servingLabel: '1 bowl',
        calories: 300,
        proteinG: 10,
        carbsG: 50,
        fatG: 6,
        fiberG: 8,
        saturatedFatG: null,
        sodiumG: null,
        sugarG: null
      }]
    }],
    body: { source: 'live', heightCm: 180, measurements: [] },
    intraday: [{
      date: '2026-11-20',
      stepsHourly: [{ hour: 9, steps: 1_200 }],
      heartRate: [
        { minute: 9 * 60, bpm: 70 },
        { minute: 9 * 60 + 30, bpm: 90 },
        { minute: 10 * 60 + 0.5, bpm: 80 }
      ]
    }, { date: '2026-11-21', stepsHourly: [], heartRate: [] }],
    ...overrides
  }
}

type Table = { columns: string[]; rows: unknown[][] }

describe('health export file', () => {
  test('stores daily metrics as one dated table in metric order', () => {
    const doc = buildHealthExport(input())
    const daily = doc.daily as Table
    expect(daily.columns).toEqual(['date', ...METRIC_KEYS])
    expect(daily.rows.map((row) => row[0])).toEqual(['2026-11-20', '2026-11-21'])
    const row = daily.rows[0]
    expect(row[daily.columns.indexOf('steps')]).toBe(9_500)
    expect(row[daily.columns.indexOf('restingHeartRate')]).toBe(58)
    expect(row[daily.columns.indexOf('hrvMs')]).toBeNull()
  })

  test('describes itself, and flags a partial final day', () => {
    const doc = buildHealthExport(input({ warnings: ['Nutrition logs could not be read.'] }))
    const about = doc.about as { notes: string[]; metrics: Record<string, { unit: string }> }
    expect(doc.range).toEqual({ start: '2026-11-20', end: '2026-11-21', days: 2 })
    expect(about.metrics.restingHeartRate.unit).toBe('bpm')
    expect(about.notes.some((note) => note.includes('2026-11-21 was still in progress'))).toBe(true)
    expect(about.notes).toContain('Nutrition logs could not be read.')
    expect(buildHealthExport(input({ end: '2026-11-20' })).about).not.toMatchObject({
      notes: expect.arrayContaining([expect.stringContaining('still in progress')])
    })
  })

  test('gives sleep sessions local times and compact stage rows', () => {
    const sleep = buildHealthExport(input()).sleep as {
      days: Array<Record<string, unknown>>
      sessions: Array<Record<string, unknown>>
    }
    expect(sleep.days[0]).toMatchObject({ date: '2026-11-20', sessionCount: 1 })
    expect(sleep.days[0]).not.toHaveProperty('sessions')
    expect(sleep.sessions[0]).toMatchObject({
      isMainSleep: true,
      localStartTime: '2026-11-19 23:00',
      localEndTime: '2026-11-20 07:00',
      stages: [['LIGHT', '2026-11-19 23:00', 30], ['DEEP', '2026-11-19 23:30', 45]]
    })
  })

  test('leaves out Google resource ids, unrecorded fields and float noise', () => {
    const doc = buildHealthExport(input({
      devices: [{ name: 'Tracker', model: 'Air', batteryPct: 80, lastSync: '2026-11-21T18:32:38Z', features: ['GROK'] }],
      daily: { '2026-11-20': { proteinG: 196.55866485436758 } },
      sleep: [{
        date: '2026-11-20',
        sessions: [{ ...night, id: 'users/123456/dataTypes/sleep/dataPoints/1', respiratory: null }],
        mainSessionId: 'users/123456/dataTypes/sleep/dataPoints/1',
        minutesAsleep: 440,
        minutesInSleepPeriod: 480,
        efficiency: 92,
        complete: true
      }],
      workouts: [{
        id: 'users/123456/dataTypes/exercise/dataPoints/9',
        name: 'Strength training',
        startTime: '2026-11-20T14:31:00Z',
        durationMin: 20,
        calories: 125.40000152587891,
        distanceKm: null,
        avgHeartRate: null,
        steps: null,
        activeZoneMinutes: null,
        splits: [],
        events: []
      }]
    }))
    expect(JSON.stringify(doc)).not.toContain('users/123456')
    expect(doc.devices).toEqual([{ name: 'Tracker', model: 'Air', batteryPct: 80, localLastSync: '2026-11-21 18:32' }])
    expect((doc.daily as Table).rows[0][(doc.daily as Table).columns.indexOf('proteinG')]).toBe(196.56)
    expect(doc.workouts).toEqual([{ localStartTime: '2026-11-20 14:31', name: 'Strength training', durationMin: 20, calories: 125.4 }])
    const session = (doc.sleep as { sessions: Array<Record<string, unknown>> }).sessions[0]
    expect(session).not.toHaveProperty('respiratory')
    expect(session).not.toHaveProperty('outOfBedSegments')
  })

  test('converts nutrition times to local time and drops internal ids', () => {
    const nutrition = buildHealthExport(input()).nutrition as Array<{ entries: Array<Record<string, unknown>> }>
    expect(nutrition[0].entries[0]).toMatchObject({ localTime: '2026-11-20 08:15', foodName: 'Oats' })
    expect(nutrition[0].entries[0]).not.toHaveProperty('id')
  })

  test('writes workout times on the clock where the workout was recorded', () => {
    const workouts = buildHealthExport(input({
      timeZone: 'Europe/London',
      workouts: [{
        id: 'w-1',
        name: 'Run',
        startTime: '2026-11-20T22:05:00Z',
        startMinute: 845,
        startUtcOffset: '-28800s',
        durationMin: 30,
        calories: null,
        distanceKm: 5,
        avgHeartRate: null,
        steps: null,
        activeZoneMinutes: null,
        splits: [{ startTime: '2026-11-20T22:05:00Z', endTime: '2026-11-20T22:11:00Z', durationMin: 6, splitType: 'distance', calories: null, distanceKm: 1, steps: null, avgHeartRate: null, averageSpeedKph: null, averagePaceSecPerKm: null, elevationGainM: null }],
        events: [{ time: '2026-11-20T22:20:00Z', type: 'PAUSE', minute: 860 }]
      }]
    })).workouts as Array<Record<string, unknown>>
    expect(workouts[0]).toMatchObject({
      localStartTime: '2026-11-20 14:05',
      splits: [{ localStartTime: '2026-11-20 14:05', localEndTime: '2026-11-20 14:11', distanceKm: 1 }],
      events: [{ localTime: '2026-11-20 14:20', type: 'PAUSE' }]
    })
    expect(JSON.stringify(workouts)).not.toContain('T22:')
  })

  test('prefers a food log\'s recorded clock time and tidies height', () => {
    const base = input()
    const doc = buildHealthExport(input({
      nutrition: [{ date: '2026-11-20', entries: [{ ...base.nutrition![0].entries[0], civilStartTime: '2026-11-20 23:40', startTime: '2026-11-21T07:40:00Z' }] }],
      body: { heightCm: 180.33999633789062, measurements: [] } as never
    }))
    expect((doc.nutrition as Array<{ entries: Array<Record<string, unknown>> }>)[0].entries[0].localTime).toBe('2026-11-20 23:40')
    expect((doc.body as { heightCm: number }).heightCm).toBe(180.34)
  })

  test('notes provisional sleep and never writes a 24:00 clock time', () => {
    const doc = buildHealthExport(input({
      provisionalSleepDates: ['2026-11-21'],
      fullHeartRate: true,
      intraday: [{ date: '2026-11-20', stepsHourly: [], heartRate: [{ minute: 1439.995, bpm: 60 }] }]
    }))
    expect((doc.about as { notes: string[] }).notes.some((note) => note.includes('2026-11-21 may not be final'))).toBe(true)
    expect((doc.intraday as { heartRate: Table }).heartRate.rows).toEqual([['2026-11-20', '23:59:59', 60]])
  })

  test('rolls heart rate up by hour and skips days with no intraday data', () => {
    const { hourly } = buildHealthExport(input()).intraday as { hourly: Table }
    expect(hourly.rows).toHaveLength(24)
    expect(hourly.rows[9]).toEqual(['2026-11-20', 9, 1_200, 80, 70, 90])
    expect(hourly.rows[10]).toEqual(['2026-11-20', 10, null, 80, 80, 80])
    expect(hourly.rows[0]).toEqual(['2026-11-20', 0, null, null, null, null])
  })

  test('includes every heart rate sample only when asked', () => {
    expect(buildHealthExport(input()).intraday).not.toHaveProperty('heartRate')
    const { heartRate } = buildHealthExport(input({ fullHeartRate: true })).intraday as { heartRate: Table }
    expect(heartRate.columns).toEqual(['date', 'localTime', 'bpm'])
    expect(heartRate.rows).toEqual([
      ['2026-11-20', '09:00:00', 70],
      ['2026-11-20', '09:30:00', 90],
      ['2026-11-20', '10:00:30', 80]
    ])
  })
})

describe('narrow health export', () => {
  const narrow = (): Record<string, unknown> =>
    buildHealthExport(input({ metrics: ['weightKg', 'caloriesIn', 'caloriesOut'], sections: [] }))

  test('contains only the chosen daily columns, in metric order', () => {
    const daily = narrow().daily as Table
    expect(daily.columns).toEqual(['date', 'caloriesOut', 'weightKg', 'caloriesIn'])
    expect(daily.rows[0]).toEqual(['2026-11-20', null, null, null])
  })

  test('omits unselected sections and says they were left out on purpose', () => {
    const doc = narrow()
    for (const key of ['sleep', 'workouts', 'nutrition', 'body', 'intraday']) expect(doc).not.toHaveProperty(key)
    const about = doc.about as { notes: string[]; included: Record<string, unknown>; metrics: Record<string, unknown> }
    expect(about.included).toEqual({
      dailyMetrics: ['caloriesOut', 'weightKg', 'caloriesIn'],
      sections: [],
      fullResolutionHeartRate: false
    })
    expect(Object.keys(about.metrics)).toEqual(['caloriesOut', 'weightKg', 'caloriesIn'])
    expect(about.notes.some((note) => note.includes('deliberately left out'))).toBe(true)
    expect(about.notes.some((note) => note.includes('Sleep is assigned'))).toBe(false)
    expect(about.notes.some((note) => note.includes('individual records'))).toBe(false)
  })

  test('full-resolution heart rate can be exported without hourly rows', () => {
    const doc = buildHealthExport(input({ metrics: [], sections: [], fullHeartRate: true }))
    expect(doc).not.toHaveProperty('daily')
    expect(doc.intraday).not.toHaveProperty('hourly')
    expect((doc.intraday as { heartRate: Table }).heartRate.rows).toHaveLength(3)
  })
})

describe('health export options', () => {
  const today = '2026-11-21'
  const range = (start: string, end: string, fullHeartRate = false): HealthExportOptions => ({
    start,
    end,
    metrics: [...METRIC_KEYS],
    sections: [...EXPORT_SECTIONS],
    fullHeartRate
  })

  test('counts days inclusively', () => {
    expect(exportRangeDays('2026-11-21', '2026-11-21')).toBe(1)
    expect(exportRangeDays('2026-11-01', '2026-11-30')).toBe(30)
    expect(exportRangeDays('2026-11-30', '2026-11-01')).toBe(0)
  })

  test('accepts an ordinary range', () => {
    expect(exportOptionsProblem(range('2026-08-24', today, false), today)).toBeNull()
  })

  test('rejects invalid, reversed, future and oversized ranges', () => {
    expect(exportOptionsProblem(range('2026-02-30', today, false), today)).not.toBeNull()
    expect(exportOptionsProblem(range(today, '2026-11-01', false), today)).not.toBeNull()
    expect(exportOptionsProblem(range(today, '2026-11-22', false), today)).not.toBeNull()
    expect(exportOptionsProblem(range('2022-01-01', today, false), today)).not.toBeNull()
  })

  test('requires something to export', () => {
    const empty = { ...range('2026-11-01', today), metrics: [], sections: [] }
    expect(exportOptionsProblem(empty, today)).toBe('Choose at least one thing to export.')
    expect(exportOptionsProblem({ ...empty, fullHeartRate: true }, today)).toBeNull()
  })

  test('drops unknown selection keys and keeps canonical order', () => {
    expect(normalizeExportSelection(['weightKg', 'bogus', 'steps', 'steps'], ['hourly', 'workouts', 'nope'])).toEqual({
      metrics: ['steps', 'weightKg'],
      sections: ['workouts', 'hourly']
    })
    expect(normalizeExportSelection('steps', null)).toEqual({ metrics: [], sections: [] })
  })

  test('a narrow selection is estimated far smaller than everything', () => {
    const narrow = estimateExportBytes({ metrics: ['caloriesOut', 'caloriesIn', 'weightKg'], sections: [], fullHeartRate: false }, 90)
    const everything = estimateExportBytes({ metrics: [...METRIC_KEYS], sections: [...EXPORT_SECTIONS], fullHeartRate: false }, 90)
    expect(narrow).toBeLessThan(10_000)
    expect(everything).toBeGreaterThan(narrow * 50)
  })

  test('limits full-resolution heart rate to short ranges', () => {
    const start = '2026-08-24'
    expect(exportRangeDays(start, today)).toBe(EXPORT_FULL_HEART_RATE_MAX_DAYS)
    expect(exportOptionsProblem(range(start, today, true), today)).toBeNull()
    expect(exportOptionsProblem(range('2026-08-23', today, true), today)).not.toBeNull()
  })
})
