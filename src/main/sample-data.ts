// Deterministic, realistic demo data so the app is fully explorable before a
// Google Health connection exists. Seeded per calendar day: values are stable
// across reloads but differ day to day, and any date can be traversed.

import type {
  ActivityIntradayMetric,
  ActivityIntradayResult,
  BodyMeasurementsResult,
  DailySeries,
  DayValues,
  HeartRatePoint,
  HeartDetailMetric,
  HeartDetailResult,
  HourlySteps,
  IntradaySnapshot,
  MetricKey,
  NutritionLogsResult,
  PairedDevice,
  SleepNight,
  SleepStageSegment,
  SleepStageType,
  Workout,
  WorkoutTrackResult
} from '../shared/types'

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
  const tz = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - tz).toISOString().slice(0, 10)
}

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10)
}

function today(): string {
  return isoDate(new Date())
}

function listDates(start: string, end: string): string[] {
  const out: string[] = []
  for (let d = start; d <= end; d = shiftDate(d, 1)) out.push(d)
  return out
}

/** Fraction of the current day elapsed, so "today" metrics look in-progress. */
function dayProgress(): number {
  const now = new Date()
  return (now.getHours() * 60 + now.getMinutes()) / 1440
}

// ---------------------------------------------------------------------------
// Sleep

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
  const stageCounts: Partial<Record<SleepStageType, number>> = {}
  for (const stage of stages) stageCounts[stage.type] = (stageCounts[stage.type] ?? 0) + 1

  const firstDeepOrRem = stages.find((stage) => stage.type === 'DEEP' || stage.type === 'REM')
  const minutesToFirstDeepOrRem = firstDeepOrRem
    ? Math.round((Date.parse(firstDeepOrRem.startTime) - start.getTime()) / 60_000)
    : null
  const deepRemMinutes = Math.round((stageMinutes.DEEP ?? 0) + (stageMinutes.REM ?? 0))
  const interruptions = stages.filter((stage, index) => {
    if (stage.type !== 'AWAKE') return false
    return stages.slice(0, index).some((candidate) => candidate.type !== 'AWAKE')
      && stages.slice(index + 1).some((candidate) => candidate.type !== 'AWAKE')
  })
  const interruptionMinutes = Math.round(
    interruptions.reduce(
      (total, stage) => total + (Date.parse(stage.endTime) - Date.parse(stage.startTime)) / 60_000,
      0
    )
  )

  const minutesAsleep = totalMinutes - Math.round(awakeTotal)
  const minutesToFallAsleep = Math.round(5 + rand() * 18)
  const minutesAfterWakeUp = Math.round(rand() * 8)
  const hasOutOfBed = rand() > 0.7
  const outOfBedStart = new Date(start.getTime() + totalMinutes * 0.58 * 60_000)
  const outOfBedEnd = new Date(outOfBedStart.getTime() + (2 + rand() * 5) * 60_000)
  return {
    date,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    minutesAsleep,
    minutesInSleepPeriod: totalMinutes,
    efficiency: Math.round((minutesAsleep / totalMinutes) * 100),
    isMainSleep: true,
    stages,
    stageMinutes,
    stageCounts,
    minutesAwake: Math.round(awakeTotal),
    minutesToFirstDeepOrRem,
    deepRemMinutes,
    interruptionMinutes,
    interruptionCount: interruptions.length,
    minutesToFallAsleep,
    minutesAfterWakeUp,
    outOfBedSegments: hasOutOfBed ? [{ startTime: outOfBedStart.toISOString(), endTime: outOfBedEnd.toISOString() }] : [],
    sleepType: 'STAGES',
    processed: true,
    manuallyEdited: false,
    stagesStatus: 'SUCCEEDED',
    respiratory: {
      full: { breathsPerMinute: +(13.8 + rand() * 1.8).toFixed(1), standardDeviation: 1.1, signalToNoise: 7.4 },
      light: { breathsPerMinute: +(14.2 + rand()).toFixed(1), standardDeviation: 1.2, signalToNoise: 6.9 },
      deep: { breathsPerMinute: +(12.8 + rand()).toFixed(1), standardDeviation: 0.8, signalToNoise: 7.8 },
      rem: { breathsPerMinute: +(14.8 + rand()).toFixed(1), standardDeviation: 1.4, signalToNoise: 6.4 }
    }
  }
}

function demoSleep(date: string): SleepNight {
  return generateSleep(date, mulberry32(seedFor(date + 'sleep')))
}

// ---------------------------------------------------------------------------
// Day values

function demoDayValues(date: string): DayValues {
  const rand = mulberry32(seedFor(date))
  const steps = 6200 + Math.floor(rand() * 7800)
  const sleep = demoSleep(date)
  const restDay = rand() < 0.2

  const caloriesIn = rand() < 0.65 ? Math.round(1800 + rand() * 800) : null
  const weightKg = rand() < 0.45 ? +(76.5 + Math.sin(seedFor(date) % 30) * 1.4 + rand()).toFixed(1) : null
  // Macros track logged energy: ~22/46/30% of kcal with jitter.
  const macro = (share: number, perGramKcal: number, jitter: number): number | null =>
    caloriesIn == null ? null : Math.round((caloriesIn * (share + (rand() - 0.5) * jitter)) / perGramKcal)

  return {
    steps,
    distanceKm: +(steps * 0.00074).toFixed(2),
    floors: Math.floor(steps / 1300),
    caloriesOut: Math.round(2100 + rand() * 700),
    activeMinutes: restDay ? Math.round(rand() * 15) : Math.round(25 + rand() * 60),
    activeZoneMinutes: restDay ? Math.round(rand() * 10) : Math.round(18 + rand() * 52),
    sedentaryMinutes: Math.round(540 + rand() * 240),
    restingHeartRate: Math.round(52 + rand() * 8),
    hrvMs: +(38 + rand() * 26).toFixed(1),
    spo2Pct: +(95.5 + rand() * 3).toFixed(1),
    breathingRate: +(13.2 + rand() * 3.4).toFixed(1),
    skinTempDeltaC: +((rand() - 0.5) * 1.2).toFixed(2),
    vo2Max: +(41 + rand() * 4).toFixed(1),
    sleepMinutes: sleep.minutesAsleep,
    sleepEfficiency: sleep.efficiency,
    weightKg,
    bodyFatPct: rand() < 0.3 ? +(18 + rand() * 3).toFixed(1) : null,
    bmi: weightKg == null ? null : +(weightKg / (1.78 * 1.78)).toFixed(1),
    waterMl: rand() < 0.6 ? Math.round(900 + rand() * 1400) : null,
    caloriesIn,
    proteinG: macro(0.22, 4, 0.05),
    carbsG: macro(0.46, 4, 0.08),
    fatG: macro(0.3, 9, 0.05),
    fiberG: caloriesIn == null ? null : Math.round(16 + rand() * 18),
    saturatedFatG: caloriesIn == null ? null : Math.round(12 + rand() * 14),
    sodiumG: caloriesIn == null ? null : +(1.2 + rand() * 1.8).toFixed(2),
    sugarG: caloriesIn == null ? null : Math.round(35 + rand() * 55)
  }
}

// Scales an in-progress day so "today" doesn't show full-day totals at 9am.
const PROGRESS_SCALED: MetricKey[] = [
  'steps',
  'floors',
  'caloriesOut',
  'activeMinutes',
  'activeZoneMinutes',
  'sedentaryMinutes',
  'waterMl',
  'caloriesIn',
  'proteinG',
  'carbsG',
  'fatG',
  'fiberG',
  'saturatedFatG',
  'sugarG'
]

function scaleForToday(values: DayValues): DayValues {
  const p = Math.min(1, dayProgress() * 1.35)
  const out: DayValues = { ...values }
  for (const key of PROGRESS_SCALED) {
    const v = out[key]
    if (v != null) out[key] = Math.round(v * p)
  }
  for (const key of ['sodiumG'] as const) {
    const v = out[key]
    if (v != null) out[key] = +(v * p).toFixed(2)
  }
  if (out.distanceKm != null) out.distanceKm = +(out.distanceKm * p).toFixed(2)
  return out
}

function valuesFor(date: string): DayValues {
  const base = demoDayValues(date)
  return date === today() ? scaleForToday(base) : base
}

// ---------------------------------------------------------------------------
// Intraday series

function demoHourlySteps(date: string, uptoMinute: number, targetSteps: number): HourlySteps[] {
  const rand = mulberry32(seedFor(date + 'hourly'))
  // Weight a plausible movement day: commute bumps, lunchtime walk, evening.
  const weights = Array.from({ length: 24 }, (_, h) => {
    if (h < 6) return rand() * 0.05
    if (h === 8 || h === 12 || h === 18) return 0.8 + rand() * 1.2
    if (h > 22) return rand() * 0.2
    return 0.2 + rand() * 0.7
  })
  const visible = weights.map((w, h) => ((h + 1) * 60 <= uptoMinute ? w : h * 60 < uptoMinute ? w * ((uptoMinute - h * 60) / 60) : 0))
  // Distribute the (already progress-scaled) total over the elapsed hours so
  // the buckets sum back to the day's step count.
  const visibleWeight = visible.reduce((s, w) => s + w, 0) || 1
  return visible.map((w, hour) => ({ hour, steps: Math.round((targetSteps * w) / visibleWeight) }))
}

function demoHeartSeries(date: string, uptoMinute: number): HeartRatePoint[] {
  const rand = mulberry32(seedFor(date + 'heart'))
  const samples: HeartRatePoint[] = []
  const resting = 52 + rand() * 10
  // A workout window makes the chart interesting.
  const workoutStart = 7 + rand() * 10 // hours
  const workoutLen = 0.5 + rand() * 0.5
  for (let m = 0; m < uptoMinute; m += 5) {
    const h = m / 60
    let bpm = resting + 8 * Math.sin(((h - 14) / 24) * 2 * Math.PI) + rand() * 6
    if (h < 7) bpm = resting - 4 + rand() * 5 // sleeping
    if (h >= workoutStart && h <= workoutStart + workoutLen) {
      const peak = (h - workoutStart) / workoutLen
      bpm = 100 + 55 * Math.sin(peak * Math.PI) + rand() * 8
    }
    samples.push({ minute: m, bpm: Math.round(bpm) })
  }
  return samples
}

const WORKOUT_TYPES = ['Run', 'Walk', 'Strength training', 'Bike ride', 'Yoga']

function demoWorkoutsFor(date: string, uptoMinute: number): Workout[] {
  const rand = mulberry32(seedFor(date + 'workout'))
  if (rand() < 0.35) return [] // rest day
  const count = rand() < 0.25 ? 2 : 1
  const workouts: Workout[] = []
  for (let i = 0; i < count; i++) {
    const name = WORKOUT_TYPES[Math.floor(rand() * WORKOUT_TYPES.length)]
    const startMinute = Math.round((7 + rand() * 11) * 60)
    if (startMinute > uptoMinute) continue
    const durationMin = Math.round(25 + rand() * 50)
    const start = new Date(`${date}T00:00:00`)
    start.setMinutes(startMinute)
    const isCardio = name === 'Run' || name === 'Bike ride' || name === 'Walk'
    const hasGps = isCardio
    const elapsedDurationMin = durationMin + (isCardio ? 3 : 0)
    const calories = Math.round(durationMin * (isCardio ? 9 : 5) + rand() * 40)
    const distanceKm = isCardio ? +(durationMin * (name === 'Bike ride' ? 0.4 : 0.16) + rand()).toFixed(2) : null
    const avgHeartRate = Math.round(isCardio ? 138 + rand() * 20 : 105 + rand() * 15)
    const steps = name === 'Run' || name === 'Walk' ? Math.round(durationMin * (name === 'Run' ? 160 : 100)) : null
    const splitCount = distanceKm != null ? Math.max(1, Math.min(6, Math.floor(distanceKm))) : 0
    const end = new Date(start.getTime() + elapsedDurationMin * 60_000)
    const pause = new Date(start.getTime() + durationMin * 0.45 * 60_000)
    const resume = new Date(pause.getTime() + 3 * 60_000)
    workouts.push({
      id: `${date}-${i}`,
      name,
      startTime: start.toISOString(),
      startMinute,
      durationMin,
      elapsedDurationMin,
      exerciseType: name.toUpperCase().replaceAll(' ', '_'),
      calories,
      distanceKm,
      avgHeartRate,
      steps,
      activeZoneMinutes: Math.round(durationMin * (isCardio ? 0.9 : 0.4)),
      averageSpeedKph: distanceKm != null ? +(distanceKm / (durationMin / 60)).toFixed(2) : null,
      averagePaceSecPerKm: distanceKm != null ? +((durationMin * 60) / distanceKm).toFixed(1) : null,
      elevationGainM: hasGps ? Math.round(18 + rand() * 75) : null,
      runVo2Max: name === 'Run' ? +(42 + rand() * 8).toFixed(1) : null,
      totalSwimLengths: null,
      heartRateZones: {
        lightMin: +(durationMin * 0.2).toFixed(1),
        moderateMin: +(durationMin * (isCardio ? 0.35 : 0.45)).toFixed(1),
        vigorousMin: +(durationMin * (isCardio ? 0.35 : 0.2)).toFixed(1),
        peakMin: +(durationMin * (isCardio ? 0.1 : 0.05)).toFixed(1)
      },
      mobility:
        name === 'Run'
          ? {
              groundContactMs: Math.round(225 + rand() * 35),
              cadenceStepsPerMin: Math.round(164 + rand() * 16),
              strideLengthM: +(0.95 + rand() * 0.3).toFixed(2),
              verticalOscillationCm: +(7 + rand() * 2).toFixed(1),
              verticalRatio: +(6.8 + rand() * 1.8).toFixed(1)
            }
          : null,
      splits: Array.from({ length: splitCount }, (_, splitIndex) => {
        const splitDuration = durationMin / splitCount
        const splitStart = new Date(start.getTime() + splitIndex * splitDuration * 60_000)
        const splitEnd = new Date(splitStart.getTime() + splitDuration * 60_000)
        const splitDistance = (distanceKm ?? 0) / splitCount
        return {
          startTime: splitStart.toISOString(),
          endTime: splitEnd.toISOString(),
          durationMin: splitDuration,
          splitType: 'DISTANCE',
          calories: Math.round(calories / splitCount),
          distanceKm: +splitDistance.toFixed(2),
          steps: steps != null ? Math.round(steps / splitCount) : null,
          avgHeartRate: avgHeartRate + splitIndex - Math.floor(splitCount / 2),
          averageSpeedKph: +(splitDistance / (splitDuration / 60)).toFixed(2),
          averagePaceSecPerKm: +((splitDuration * 60) / splitDistance).toFixed(1),
          elevationGainM: Math.round(((18 + rand() * 75) / splitCount) * 10) / 10
        }
      }),
      events: [
        { time: start.toISOString(), type: 'START', minute: startMinute },
        ...(isCardio
          ? [
              { time: pause.toISOString(), type: 'AUTO_PAUSE', minute: startMinute + durationMin * 0.45 },
              { time: resume.toISOString(), type: 'AUTO_RESUME', minute: startMinute + durationMin * 0.45 + 3 }
            ]
          : []),
        { time: end.toISOString(), type: 'STOP', minute: startMinute + elapsedDurationMin }
      ],
      hasGps,
      poolLengthM: null,
      notes: null,
      recordingSource: 'FITBIT',
      deviceName: 'Google Fitbit Air'
    })
  }
  return workouts
}

export function demoWorkoutTrack(workoutId: string): WorkoutTrackResult {
  const rand = mulberry32(seedFor(`${workoutId}-route`))
  const centerLat = 51.5074 + (rand() - 0.5) * 0.025
  const centerLon = -0.1278 + (rand() - 0.5) * 0.04
  const count = 90
  return {
    points: Array.from({ length: count }, (_, index) => {
      const progress = index / (count - 1)
      const angle = progress * Math.PI * 2
      return {
        time: null,
        latitude: centerLat + Math.sin(angle) * 0.008 + Math.sin(angle * 3) * 0.0015,
        longitude: centerLon + Math.cos(angle) * 0.012 + Math.sin(angle * 2) * 0.001,
        altitudeM: 28 + Math.sin(angle * 2) * 9,
        heartRate: Math.round(112 + Math.sin(progress * Math.PI) * 45 + rand() * 5),
        cadence: Math.round(158 + rand() * 12)
      }
    })
  }
}

function uptoMinuteFor(date: string): number {
  return date === today() ? Math.max(60, Math.floor(dayProgress() * 1440)) : 1440
}

// ---------------------------------------------------------------------------
// Public generators — mirror the live domain queries

export function demoSeries(metrics: MetricKey[], start: string, end: string): DailySeries {
  const days: DailySeries = {}
  for (const date of listDates(start, end)) {
    const all = valuesFor(date)
    const out: DayValues = {}
    for (const key of metrics) out[key] = all[key] ?? null
    days[date] = out
  }
  return days
}

export function demoSleepRange(start: string, end: string): SleepNight[] {
  return listDates(start, end).map((date) => demoSleep(date))
}

export function demoWorkoutsRange(start: string, end: string): Workout[] {
  return listDates(start, end).flatMap((date) => demoWorkoutsFor(date, uptoMinuteFor(date)))
}

export function demoNutritionLogs(date: string): NutritionLogsResult {
  const values = valuesFor(date)
  if (values.caloriesIn == null) return { date, source: 'demo', entries: [] }
  const templates = [
    { minute: 8 * 60 + 10, foodName: 'Greek yogurt with berries', mealType: 'BREAKFAST', share: 0.22 },
    { minute: 13 * 60 + 5, foodName: 'Chicken pesto pasta', mealType: 'LUNCH', share: 0.41 },
    { minute: 19 * 60 + 20, foodName: 'Salmon rice bowl', mealType: 'DINNER', share: 0.37 }
  ].filter((entry) => entry.minute <= uptoMinuteFor(date))
  const totalShare = templates.reduce((sum, entry) => sum + entry.share, 0) || 1
  return {
    date,
    source: 'demo',
    entries: templates.map((entry, index) => {
      const share = entry.share / totalShare
      const start = new Date(`${date}T00:00:00`)
      start.setMinutes(entry.minute)
      const end = new Date(start.getTime() + 5 * 60_000)
      return {
        id: `demo-food-${date}-${index}`,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        foodName: entry.foodName,
        mealType: entry.mealType,
        servingLabel: '1 serving',
        calories: Math.round(values.caloriesIn! * share),
        proteinG: values.proteinG == null ? null : Math.round(values.proteinG * share),
        carbsG: values.carbsG == null ? null : Math.round(values.carbsG * share),
        fatG: values.fatG == null ? null : Math.round(values.fatG * share),
        fiberG: values.fiberG == null ? null : Math.round(values.fiberG * share),
        saturatedFatG: values.saturatedFatG == null ? null : +(values.saturatedFatG * share).toFixed(1),
        sodiumG: values.sodiumG == null ? null : +(values.sodiumG * share).toFixed(2),
        sugarG: values.sugarG == null ? null : Math.round(values.sugarG * share)
      }
    })
  }
}

export function demoBodyMeasurements(start: string, end: string): BodyMeasurementsResult {
  const measurements = listDates(start, end).flatMap((date) => {
    const values = valuesFor(date)
    if (values.weightKg == null && values.bodyFatPct == null) return []
    const time = new Date(`${date}T07:30:00`).toISOString()
    return [{
      id: `demo-body-${date}`,
      time,
      weightKg: values.weightKg ?? null,
      bodyFatPct: values.bodyFatPct ?? null,
      notes: null
    }]
  })
  return { source: 'demo', measurements, heightCm: 178 }
}

export function demoIntraday(date: string): IntradaySnapshot {
  const uptoMinute = uptoMinuteFor(date)
  const heartRate = demoHeartSeries(date, uptoMinute)
  return {
    date,
    source: 'demo',
    stepsHourly: demoHourlySteps(date, uptoMinute, valuesFor(date).steps ?? 0),
    heartRate,
    currentHeartRate: date === today() ? (heartRate.at(-1)?.bpm ?? null) : null
  }
}

function demoActivityBreakdown(
  metric: ActivityIntradayMetric,
  total: number
): ActivityIntradayResult['breakdown'] {
  switch (metric) {
    case 'activeMinutes':
      return [
        { key: 'light', value: Math.round(total * 1.35), unit: 'min' },
        { key: 'moderate', value: Math.round(total * 0.68), unit: 'min' },
        { key: 'vigorous', value: Math.round(total * 0.32), unit: 'min' }
      ]
    case 'activeZoneMinutes':
      return [
        { key: 'fatBurn', value: Math.round(total * 0.5), unit: 'min' },
        { key: 'cardio', value: Math.round(total * 0.34), unit: 'min' },
        { key: 'peak', value: Math.round(total * 0.16), unit: 'min' }
      ]
    case 'caloriesOut':
      return [
        { key: 'activeEnergy', value: Math.round(total * 0.38), unit: 'kcal' },
        { key: 'basalEnergy', value: Math.round(total * 0.62), unit: 'kcal' }
      ]
    default:
      return []
  }
}

export function demoActivityIntraday(date: string, metric: ActivityIntradayMetric): ActivityIntradayResult {
  const total = valuesFor(date)[metric] ?? 0
  const random = mulberry32(seedFor(`${date}:${metric}:intraday`))
  const windowMinutes = 30
  const uptoMinute = uptoMinuteFor(date)
  const weights = Array.from({ length: 48 }, (_, index) => {
    if (index * windowMinutes > uptoMinute) return 0
    const hour = index / 2
    const morning = Math.exp(-((hour - 8.2) ** 2) / 3.5)
    const midday = Math.exp(-((hour - 13) ** 2) / 5)
    const evening = Math.exp(-((hour - 18.2) ** 2) / 4)
    const activity = morning * 0.85 + midday * 0.45 + evening
    if (metric === 'caloriesOut') return 0.28 + activity + random() * 0.08
    if (metric === 'sedentaryMinutes') return hour >= 7 && hour <= 23 ? 0.45 + (1 - Math.min(1, activity)) + random() * 0.2 : 0
    return activity > 0.08 ? activity + random() * 0.22 : 0
  })
  const weightTotal = weights.reduce((sum, value) => sum + value, 0) || 1
  const points = weights.map((weight, index) => ({
    minute: index * windowMinutes,
    value: index * windowMinutes > uptoMinute ? null : total > 0 ? (weight / weightTotal) * total : 0
  }))
  const breakdown = demoActivityBreakdown(metric, total)

  return { date, source: 'demo', metric, windowMinutes, points, breakdown }
}

export function demoHeartDetail(date: string, metric: HeartDetailMetric): HeartDetailResult {
  const windowMinutes = 30
  const uptoMinute = uptoMinuteFor(date)
  const daily = valuesFor(date)
  const points = Array.from({ length: 48 }, (_, index) => {
    const minute = index * windowMinutes
    if (minute > uptoMinute) return { minute, value: null }
    if (metric === 'vo2Max' && index === 36) return { minute, value: daily.vo2Max ?? 43 }
    return { minute, value: null }
  })
  const stats: HeartDetailResult['stats'] =
    metric === 'vo2Max'
      ? [
          { key: 'fitness', label: 'Fitness level', value: 'Good' },
          { key: 'estimate', label: 'Reading type', value: 'Measured' },
          { key: 'covariance', label: 'Estimate covariance', value: '0.34' },
          { key: 'method', label: 'Measurement method', value: 'Fitbit Run' }
        ]
      : []
  const zones: HeartDetailResult['zones'] =
    metric === 'restingHeartRate'
      ? [
          { zone: 'light', minBpm: 92, maxBpm: 116, durationMin: 42, calories: 168 },
          { zone: 'moderate', minBpm: 117, maxBpm: 139, durationMin: 18, calories: 142 },
          { zone: 'vigorous', minBpm: 140, maxBpm: 162, durationMin: 7, calories: 81 },
          { zone: 'peak', minBpm: 163, maxBpm: 190, durationMin: 2, calories: 28 }
        ]
      : []

  return {
    date,
    source: 'demo',
    metric,
    windowMinutes,
    points,
    sampleLabel: metric === 'vo2Max' ? 'VO₂ max' : undefined,
    sampleUnit: metric === 'vo2Max' ? 'ml/kg/min' : undefined,
    stats,
    zones
  }
}

export function demoDevices(): PairedDevice[] {
  return [
    {
      name: 'Fitbit Air',
      model: 'Google Fitbit Air',
      type: 'TRACKER',
      batteryPct: 76,
      batteryState: 'MEDIUM',
      lastSync: new Date(Date.now() - 23 * 60_000).toISOString(),
      features: ['HEART_RATE', 'SLEEP', 'SPO2', 'HRV', 'SKIN_TEMPERATURE']
    }
  ]
}
