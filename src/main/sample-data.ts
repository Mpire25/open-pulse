// Deterministic, realistic demo data so the app is fully explorable before a
// Google Health connection exists. Seeded per calendar day: values are stable
// across reloads but differ day to day.

import type {
  DashboardToday,
  DaySummary,
  HeartSample,
  SleepNight,
  SleepStageSegment,
  SleepStageType,
  WeekSeries,
  Goals
} from '../shared/types'

const DEMO_GOALS: Goals = { steps: 10000, activeZoneMinutes: 30, activeEnergyKcal: 500 }

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seedFor(date: string): number {
  let h = 2166136261
  for (const ch of date) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return isoDate(d)
}

/** Fraction of the current day elapsed, so "today" metrics look in-progress. */
function dayProgress(): number {
  const now = new Date()
  return (now.getHours() * 60 + now.getMinutes()) / 1440
}

function generateSleep(date: string, rand: () => number): SleepNight {
  const bedtimeMinutes = 22 * 60 + 40 + Math.floor(rand() * 80) // ~22:40–24:00
  const totalMinutes = 380 + Math.floor(rand() * 90) // 6h20–7h50

  const start = new Date(`${date}T00:00:00`)
  start.setDate(start.getDate() - 1)
  start.setMinutes(bedtimeMinutes)
  const end = new Date(start.getTime() + totalMinutes * 60_000)

  // Build a plausible hypnogram: ~90 minute cycles Light → Deep → Light → REM.
  const stages: SleepStageSegment[] = []
  const stageMinutes: Partial<Record<SleepStageType, number>> = {}
  let cursor = new Date(start)
  let awakeTotal = 0
  const pattern: Array<[SleepStageType, number, number]> = [
    ['LIGHT', 18, 30],
    ['DEEP', 25, 45],
    ['LIGHT', 10, 20],
    ['REM', 15, 35]
  ]
  let cycle = 0
  while (cursor < end) {
    for (const [type, min, max] of pattern) {
      if (cursor >= end) break
      // Deep sleep front-loads, REM back-loads across the night.
      let duration = min + rand() * (max - min)
      if (type === 'DEEP') duration *= Math.max(0.35, 1 - cycle * 0.28)
      if (type === 'REM') duration *= 0.6 + cycle * 0.25
      const segEnd = new Date(Math.min(cursor.getTime() + duration * 60_000, end.getTime()))
      stages.push({ type, startTime: cursor.toISOString(), endTime: segEnd.toISOString() })
      stageMinutes[type] = (stageMinutes[type] ?? 0) + (segEnd.getTime() - cursor.getTime()) / 60_000
      cursor = segEnd
      // Brief awakenings between some cycles.
      if (rand() > 0.6 && cursor < end) {
        const wakeEnd = new Date(Math.min(cursor.getTime() + (1 + rand() * 4) * 60_000, end.getTime()))
        stages.push({ type: 'AWAKE', startTime: cursor.toISOString(), endTime: wakeEnd.toISOString() })
        awakeTotal += (wakeEnd.getTime() - cursor.getTime()) / 60_000
        cursor = wakeEnd
      }
    }
    cycle++
  }
  stageMinutes.AWAKE = Math.round(awakeTotal)
  for (const key of ['LIGHT', 'DEEP', 'REM'] as const) {
    stageMinutes[key] = Math.round(stageMinutes[key] ?? 0)
  }

  return {
    date,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    minutesAsleep: totalMinutes - Math.round(awakeTotal),
    minutesInSleepPeriod: totalMinutes,
    stages,
    stageMinutes
  }
}

function generateHeartSeries(date: string, rand: () => number, upTo: number): HeartSample[] {
  const samples: HeartSample[] = []
  const resting = 52 + rand() * 10
  // A morning workout window makes the chart interesting.
  const workoutStart = 7 + rand() * 3 // hours
  const workoutLen = 0.5 + rand() * 0.5
  for (let m = 0; m < upTo; m += 10) {
    const h = m / 60
    let bpm = resting + 8 * Math.sin(((h - 14) / 24) * 2 * Math.PI) + rand() * 6
    if (h < 7) bpm = resting - 4 + rand() * 5 // sleeping
    if (h >= workoutStart && h <= workoutStart + workoutLen) {
      const peak = (h - workoutStart) / workoutLen
      bpm = 100 + 55 * Math.sin(peak * Math.PI) + rand() * 8
    }
    const t = new Date(`${date}T00:00:00`)
    t.setMinutes(m)
    samples.push({ time: t.toISOString(), bpm: Math.round(bpm) })
  }
  return samples
}

export function demoDashboard(): DashboardToday {
  const date = isoDate(new Date())
  const rand = mulberry32(seedFor(date))
  const progress = dayProgress()

  const fullDaySteps = 7400 + Math.floor(rand() * 6200)
  const steps = Math.round(fullDaySteps * Math.min(1, progress * 1.35))
  const azm = Math.round((22 + rand() * 40) * Math.min(1, progress * 1.5))
  const kcal = Math.round((420 + rand() * 380) * Math.min(1, progress * 1.4))
  const minutesSoFar = Math.floor(progress * 1440)
  const heartSeries = generateHeartSeries(date, rand, Math.max(minutesSoFar, 60))

  return {
    date,
    steps: { current: steps, goal: DEMO_GOALS.steps },
    activeZoneMinutes: { current: azm, goal: DEMO_GOALS.activeZoneMinutes },
    activeEnergyKcal: { current: kcal, goal: DEMO_GOALS.activeEnergyKcal },
    distanceKm: +(steps * 0.00074).toFixed(2),
    floors: Math.floor(steps / 1300),
    restingHeartRate: Math.round(52 + rand() * 8),
    currentHeartRate: heartSeries.at(-1)?.bpm ?? null,
    heartRateSeries: heartSeries,
    hrvMs: +(38 + rand() * 26).toFixed(1),
    spo2Pct: +(95.5 + rand() * 3).toFixed(1),
    breathingRate: +(13.2 + rand() * 3.4).toFixed(1),
    sleep: generateSleep(date, mulberry32(seedFor(date + 'sleep'))),
    source: 'demo'
  }
}

export function demoWeek(): WeekSeries {
  const days: DaySummary[] = []
  for (let i = 6; i >= 0; i--) {
    const date = daysAgo(i)
    const rand = mulberry32(seedFor(date))
    const steps = 6200 + Math.floor(rand() * 7800)
    const sleep = generateSleep(date, mulberry32(seedFor(date + 'sleep')))
    days.push({
      date,
      steps,
      activeZoneMinutes: Math.round(18 + rand() * 52),
      activeEnergyKcal: Math.round(380 + rand() * 460),
      distanceKm: +(steps * 0.00074).toFixed(2),
      sleepMinutes: sleep.minutesAsleep,
      restingHeartRate: Math.round(52 + rand() * 8),
      hrvMs: +(38 + rand() * 26).toFixed(1)
    })
  }
  return { days, source: 'demo' }
}

export function demoSleepHistory(nights: number): SleepNight[] {
  const out: SleepNight[] = []
  for (let i = nights - 1; i >= 0; i--) {
    const date = daysAgo(i)
    out.push(generateSleep(date, mulberry32(seedFor(date + 'sleep'))))
  }
  return out
}
