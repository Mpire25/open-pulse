import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { buildCases } from '../evals/cases'
import { completed, datesRead, durationsIn, mentionsDuration, numbersIn, read, type RunRecord } from '../evals/checks'
import {
  average,
  caloriesIn,
  createHealthFixture,
  dateAgo,
  dayValues,
  GAP,
  pinEvalNow,
  runsBetween,
  TODAY_STEPS,
  weightKg,
  type HealthCall
} from '../evals/fixture'
import { score } from '../evals/runner'

function record(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    text: '',
    parts: [],
    outcome: 'completed',
    healthCalls: [],
    modelRequests: [],
    toolEvents: [],
    totalMs: 1000,
    ...overrides
  }
}

describe('eval fixture', () => {
  test('is deterministic', () => {
    const now = new Date()
    expect(dayValues(37, now)).toEqual(dayValues(37, now))
    expect(weightKg(60)).toBe(weightKg(60))
  })

  test('contains the stories the cases ask about', () => {
    // Weight rises about 3 kg over the last 75 days and is flat before.
    expect(average('weightKg', 6, 0)! - average('weightKg', 120, 90)!).toBeGreaterThan(2.4)
    // Intake rises about 400 kcal a day 80 days ago.
    expect(average('caloriesIn', 79, 1)! - average('caloriesIn', 160, 81)!).toBeGreaterThan(350)
    // Running drops from three a week to one.
    expect(runsBetween(181, 91)).toBeGreaterThan(runsBetween(90, 1) * 2)
    // Recent nights are shorter, resting heart rate is up, HRV is down.
    expect(average('sleepMinutes', 13, 0)! + 45).toBeLessThan(average('sleepMinutes', 60, 14)!)
    expect(average('restingHeartRate', 6, 0)!).toBeGreaterThan(average('restingHeartRate', 60, 20)! + 1.5)
    expect(average('hrvMs', 13, 0)! + 6).toBeLessThan(average('hrvMs', 60, 14)!)
    // The tracker gap has no activity, heart or sleep data, but food was still logged.
    for (let d = GAP.to; d <= GAP.from; d++) {
      const values = dayValues(d)
      expect(values.steps).toBeNull()
      expect(values.restingHeartRate).toBeNull()
      expect(values.sleepMinutes).toBeNull()
      expect(caloriesIn(d)).not.toBeNull()
    }
    expect(dayValues(0).steps).toBe(TODAY_STEPS)
  })

  test('serves the health-service surface and records each read', async () => {
    const calls: HealthCall[] = []
    const fixture = createHealthFixture((call) => calls.push(call))
    const series = await fixture.getSeries(['steps', 'weightKg'], dateAgo(6), dateAgo(0))
    expect(Object.keys(series.days)).toHaveLength(7)
    expect(series.days[dateAgo(0)].steps).toBe(TODAY_STEPS)
    const nutrition = await fixture.getNutritionLogs(dateAgo(1))
    expect(nutrition.entries.map((entry) => entry.foodName)).toContain('Chicken burrito')
    const sleep = await fixture.getSleepRange(dateAgo(2), dateAgo(0))
    expect(sleep.days).toHaveLength(3)
    expect(sleep.days[2].sessions[0].stages.length).toBeGreaterThan(0)
    expect((await fixture.getWorkoutsRange(dateAgo(1), dateAgo(1))).workouts[0].distanceKm).toBe(6.2)
    expect(calls.map((call) => call.fn)).toEqual(['getSeries', 'getNutritionLogs', 'getSleepRange', 'getWorkoutsRange'])
  })

  test('dates a bedtime after midnight on the day it happened', async () => {
    const fixture = createHealthFixture(() => {})
    for (const daysAgo of [0, 30]) {
      const session = (await fixture.getSleepRange(dateAgo(daysAgo), dateAgo(daysAgo))).days[0].sessions[0]
      const start = new Date(session.startTime)
      const localStart = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
      expect(session.startCivilDate).toBe(localStart)
      expect(session.startCivilMinute).toBe(start.getHours() * 60 + start.getMinutes())
    }
  })

  test('hourly data agrees with daily totals at every run hour', async () => {
    try {
      for (let hour = 0; hour < 24; hour++) {
        pinEvalNow(new Date(2026, 9, 9, hour, 30))
        const calls: HealthCall[] = []
        const fixture = createHealthFixture((call) => calls.push(call))
        for (const daysAgo of [0, 1, 42, 80, 180, 364, 401]) {
          const date = dateAgo(daysAgo)
          const daily = (await fixture.getSeries(['steps'], date, date)).days[date].steps
          const hourly = (await fixture.getIntraday(date, false, undefined, 'steps')).stepsHourly
          const total = hourly.reduce((sum, item) => sum + item.steps, 0)
          expect(total).toBe(daily ?? 0)
          expect(hourly.every((item) => Number.isInteger(item.steps) && item.steps >= 0)).toBe(true)
          if (daily == null) expect(hourly).toEqual([])
          if (daysAgo === 0) {
            expect(hourly.filter((item) => item.hour > hour).every((item) => item.steps === 0)).toBe(true)
            const evalCase = buildCases().find((item) => item.id === 'steps-today')!
            expect(score(evalCase, record({
              text: `You've done ${total.toLocaleString('en-GB')} steps so far today.`,
              healthCalls: calls.filter((call) => call.fn.startsWith('getIntraday'))
            })).passed).toBe(true)
          }
        }
      }
    } finally {
      pinEvalNow(null)
    }
  })
})

describe('eval checks', () => {
  test('reads numbers and durations the way answers write them', () => {
    expect(numbersIn('You did 4,213 steps, about 6.2 km.')).toEqual([4213, 6.2])
    expect(numbersIn('Between 61-63 bpm, and 7,800-9,600 steps; -2 kg.')).toEqual([61, 63, 7800, 9600, -2])
    for (const text of ['6h 5m', '6 hours and 5 minutes', '6 hr 5 min', '365 minutes', '6h05']) {
      expect(durationsIn(text)).toContain(365)
    }
    expect(durationsIn('You woke at 06:05.')).toEqual([])
    expect(mentionsDuration('slept', 365, 5).run(record({ text: 'You slept 6 hours 2 minutes.' }))).toBe(true)
  })

  test('counts the dates a run read for a signal', () => {
    const calls: HealthCall[] = [
      { fn: 'getSeries', metrics: ['steps'], start: dateAgo(9), end: dateAgo(0) },
      { fn: 'getBodyMeasurements', start: dateAgo(59), end: dateAgo(0) }
    ]
    expect(datesRead(calls, { metric: 'steps' }).size).toBe(10)
    expect(datesRead(calls, { metric: 'weightKg' }).size).toBe(60)
    expect(read({ metric: 'weightKg' }, 56).run(record({ healthCalls: calls }))).toBe(true)
    expect(read({ metric: 'steps' }, 56).run(record({ healthCalls: calls }))).toBe(false)
    // Hourly steps for a day count as reading that day's steps.
    const hourly: HealthCall[] = [{ fn: 'getIntraday:steps', date: dateAgo(0) }]
    expect(read({ metric: 'steps' }, 0).run(record({ healthCalls: hourly }))).toBe(true)
  })

  test('a case fails only on critical checks', () => {
    const evalCase = buildCases().find((item) => item.id === 'steps-today')!
    const passing = score(evalCase, record({
      text: `You've done ${TODAY_STEPS.toLocaleString('en-GB')} steps so far today.`,
      healthCalls: [{ fn: 'getSeries', metrics: ['steps'], start: dateAgo(0), end: dateAgo(0) }],
      modelRequests: [1, 2, 3].map(() => ({ kind: 'agent' as const, tools: [], startedAt: 0, functionCalls: [] }))
    }))
    expect(passing.passed).toBe(true)
    expect(passing.score).toBeLessThan(1)
    expect(score(evalCase, record({ text: 'You have done 4,000 steps.' })).passed).toBe(false)
    expect(completed().run(record({ outcome: 'error', text: 'partial' }))).toBe(false)
  })

  test('missing data cannot excuse an invented zero-step count', () => {
    const evalCase = buildCases().find((item) => item.id === 'steps-on-gap-day')!
    const healthCalls: HealthCall[] = [{ fn: 'getSeries', metrics: ['steps'], start: dateAgo(42), end: dateAgo(42) }]
    for (const text of [
      'There is no step data for that date, so you took zero steps.',
      'The tracker was not worn and you took 0 steps.',
      "The data is missing. You didn't take any steps.",
      'No step data means you took no steps at all.',
      'Missing data does not mean zero steps, but you took zero steps.',
      'The data is **missing**, so you took **zero steps**.',
      'Zero steps cannot be inferred from missing data, but you took **zero steps**.'
    ]) {
      expect(score(evalCase, record({ text, healthCalls })).passed).toBe(false)
    }
    for (const text of [
      'No step data was recorded, not that you took zero steps.',
      "Missing data doesn't mean you took zero steps.",
      'No step data was recorded. I cannot tell whether you took zero steps.',
      'This is missing data, rather than zero steps.',
      'Missing data, not **zero steps**.',
      'Missing data does **not** mean **zero steps**.',
      'Missing data, not _zero steps_.',
      'Missing data, not `zero steps`.',
      'Zero steps cannot be inferred from the missing data.',
      'That’s a missing entry, not a count of zero steps.',
      'The entry is missing, rather than showing zero steps.',
      'No step count was recorded for that day—the entry is blank, not zero.',
      'I checked Friday **28 August 2026**, and no step count was returned for that date. That means there’s no recorded value—not necessarily that you took zero steps.'
    ]) {
      expect(score(evalCase, record({ text, healthCalls })).passed).toBe(true)
    }
  })

  test('every case builds with defined expectations', () => {
    const cases = buildCases()
    expect(new Set(cases.map((item) => item.id)).size).toBe(cases.length)
    for (const item of cases) {
      expect(item.history.at(-1)?.role).toBe('user')
      expect(item.checks.some((check) => check.critical)).toBe(true)
    }
  })
})

test('runs the real assistant loop against the fixture offline', async () => {
  const harness = resolve(import.meta.dir, 'fixtures/evals-runtime-harness.ts')
  const child = Bun.spawn([Bun.which('bun') ?? 'bun', 'test', harness], {
    cwd: resolve(import.meta.dir, '..'),
    stdout: 'pipe',
    stderr: 'pipe'
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text()
  ])
  if (exitCode !== 0) throw new Error(`Eval runtime harness failed (${exitCode}).\n${stdout}\n${stderr}`)
}, 30_000)

test('a pinned eval date keeps rescoring stable on later days', async () => {
  const { pinEvalNow } = await import('../evals/fixture')
  const runDay = new Date(2026, 9, 9, 12)
  try {
    pinEvalNow(runDay)
    const evalCase = buildCases().find((item) => item.id === 'steps-today')!
    const saved = record({
      text: `You've done ${TODAY_STEPS.toLocaleString('en-GB')} steps so far today.`,
      healthCalls: [{ fn: 'getSeries', metrics: ['steps'], start: '2026-10-09', end: '2026-10-09' }]
    })
    expect(score(evalCase, saved).passed).toBe(true)
    // Unpinned on a later day, the same answer would be judged against the 10th.
    pinEvalNow(new Date(2026, 9, 10, 12))
    expect(score(buildCases().find((item) => item.id === 'steps-today')!, saved).passed).toBe(false)
  } finally {
    pinEvalNow(null)
  }
})

test('lookup delays follow where the app would read from', async () => {
  const { lookupDelayMs } = await import('../evals/fixture')
  const archive = lookupDelayMs({ fn: 'getSeries', start: dateAgo(29), end: dateAgo(0), mode: 'background' })
  const freshToday = lookupDelayMs({ fn: 'getSeries', start: dateAgo(0), end: dateAgo(0), mode: 'await' })
  const settled = lookupDelayMs({ fn: 'getSeries', start: dateAgo(60), end: dateAgo(30), mode: 'await' })
  const lastYear = lookupDelayMs({ fn: 'getSeries', start: dateAgo(393), end: dateAgo(380), mode: 'await' })
  expect(archive).toBeLessThan(settled)
  expect(settled).toBeLessThan(freshToday)
  expect(lastYear).toBeGreaterThan(settled)
  expect(lookupDelayMs({ fn: 'getIntraday:steps', date: dateAgo(1) })).toBeGreaterThan(settled)
})

test('reports the largest main-agent health payload without counting research context', () => {
  const evalCase = buildCases().find((item) => item.id === 'steps-today')!
  const result = score(evalCase, record({ modelRequests: [
    { kind: 'agent', tools: [], startedAt: 0, functionCalls: [], dataChars: 100 },
    { kind: 'agent', tools: [], startedAt: 0, functionCalls: [], dataChars: 250 },
    { kind: 'research', tools: [], startedAt: 0, functionCalls: [], dataChars: 999 }
  ] }))
  expect(result.dataChars).toBe(250)
})

test('a nearby weight answer must name its actual observation date', () => {
  const evalCase = buildCases().find((item) => item.id === 'weight-a-year-ago')!
  const dateCheck = evalCase.checks.find((check) => check.name === 'labels the actual nearby observation date')!
  expect(weightKg(365)).toBeNull()
  expect(dateCheck.run(record({ text: `Your nearest weigh-in was ${weightKg(364)} kg on ${dateAgo(364)}.` }))).toBe(true)
  expect(dateCheck.run(record({ text: `You weighed ${weightKg(364)} kg on ${dateAgo(365)}.` }))).toBe(false)
})
