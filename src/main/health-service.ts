// Produces renderer-facing health data, from the Google Health API when
// connected and from the demo generator otherwise.
//
// The sync is anchored to a selected civil date: one call fetches everything
// the app shows for that day (activity, vitals, sleep, body, workouts,
// intraday series) plus a 14-day trend window ending on it. Each endpoint is
// an independent job — one failing type never sinks the whole snapshot.

import type {
  DayMetrics,
  HealthDay,
  HeartRatePoint,
  HourlySteps,
  PairedDevice,
  SleepNight,
  SleepStageSegment,
  SleepStageType,
  Workout
} from '../shared/types'
import { getGoogleAccessToken } from './google-auth'
import {
  dailyRollUp,
  dateFromCivil,
  listData,
  listPairedDevices,
  minuteFromCivil,
  shiftIsoDate,
  type CivilDateTime,
  type RawDataPoint,
  type RollupPoint
} from './health-api'
import { demoDevices, demoHealthDay, demoSleepHistory } from './sample-data'

const TREND_DAYS = 14

function isoDate(d: Date): string {
  const tz = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - tz).toISOString().slice(0, 10)
}

function todayIso(): string {
  return isoDate(new Date())
}

function num(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function durationSeconds(value: unknown): number {
  if (typeof value !== 'string') return 0
  const n = Number(value.replace(/s$/, ''))
  return Number.isFinite(n) ? n : 0
}

// ---------------------------------------------------------------------------
// Cache: date -> snapshot. Past days barely change once synced; today does.

interface CacheEntry {
  day: HealthDay
  fetchedAt: number
}

const dayCache = new Map<string, CacheEntry>()
const TTL_TODAY_MS = 2 * 60_000
const TTL_PAST_MS = 30 * 60_000

function cachedDay(date: string): HealthDay | null {
  const entry = dayCache.get(date)
  if (!entry) return null
  const ttl = date === todayIso() ? TTL_TODAY_MS : TTL_PAST_MS
  return Date.now() - entry.fetchedAt < ttl ? entry.day : null
}

// ---------------------------------------------------------------------------
// Raw payload mapping

const STAGE_MAP: Record<string, SleepStageType> = {
  AWAKE: 'AWAKE',
  RESTLESS: 'AWAKE',
  LIGHT: 'LIGHT',
  ASLEEP: 'LIGHT',
  DEEP: 'DEEP',
  REM: 'REM'
}

interface RawSleep {
  interval?: { startTime?: string; endTime?: string; civilEndTime?: CivilDateTime }
  stages?: Array<{ type?: string; startTime?: string; endTime?: string }>
  metadata?: { nap?: boolean }
  summary?: {
    minutesAsleep?: string
    minutesInSleepPeriod?: string
  }
}

function mapSleep(point: RawDataPoint): SleepNight | null {
  const sleep = point.sleep as RawSleep | undefined
  if (!sleep?.interval?.startTime || !sleep.interval.endTime) return null
  const stages: SleepStageSegment[] = (sleep.stages ?? [])
    .filter((s) => s.startTime && s.endTime && STAGE_MAP[s.type?.toUpperCase() ?? ''])
    .map((s) => ({ type: STAGE_MAP[s.type!.toUpperCase()], startTime: s.startTime!, endTime: s.endTime! }))
  const stageMinutes: Partial<Record<SleepStageType, number>> = {}
  for (const seg of stages) {
    const minutes = (new Date(seg.endTime).getTime() - new Date(seg.startTime).getTime()) / 60_000
    stageMinutes[seg.type] = Math.round((stageMinutes[seg.type] ?? 0) + minutes)
  }
  const minutesAsleep = num(sleep.summary?.minutesAsleep) ?? 0
  const period = num(sleep.summary?.minutesInSleepPeriod) ?? 0
  const date = dateFromCivil(sleep.interval.civilEndTime) ?? isoDate(new Date(sleep.interval.endTime))
  return {
    date,
    startTime: sleep.interval.startTime,
    endTime: sleep.interval.endTime,
    minutesAsleep,
    minutesInSleepPeriod: period,
    efficiency: period > 0 ? Math.round((minutesAsleep / period) * 100) : null,
    isMainSleep: sleep.metadata?.nap !== true,
    stages,
    stageMinutes
  }
}

/** rollup points -> date-keyed map via an extractor. */
function dailyMap<T>(points: RollupPoint[], extract: (p: RollupPoint) => T): Map<string, T> {
  const map = new Map<string, T>()
  for (const p of points) {
    const date = dateFromCivil(p.civilStartTime)
    if (date) map.set(date, extract(p))
  }
  return map
}

/** daily record data points (dailyRestingHeartRate & co) -> date-keyed map. */
function dailyRecordMap<T>(
  points: RawDataPoint[],
  key: string,
  extract: (record: Record<string, unknown>) => T
): Map<string, T> {
  const map = new Map<string, T>()
  for (const p of points) {
    const record = p[key] as Record<string, unknown> | undefined
    const date = dateFromCivil(record?.date as CivilDateTime | undefined)
    if (record && date) map.set(date, extract(record))
  }
  return map
}

function mapWorkout(point: RawDataPoint): Workout | null {
  const exercise = point.exercise as
    | {
        exerciseType?: string
        displayName?: string
        interval?: { startTime?: string; endTime?: string }
        activeDuration?: string
        metricsSummary?: {
          caloriesKcal?: number
          distanceMillimeters?: number
          averageHeartRateBeatsPerMinute?: number
          steps?: number
          activeZoneMinutes?: number
        }
      }
    | undefined
  if (!exercise?.interval?.startTime) return null
  const summary = exercise.metricsSummary ?? {}
  const intervalSec = exercise.interval.endTime
    ? (new Date(exercise.interval.endTime).getTime() - new Date(exercise.interval.startTime).getTime()) / 1000
    : 0
  const durationSec = durationSeconds(exercise.activeDuration) || Math.max(0, intervalSec)
  return {
    id: String(point.dataPointName ?? point.name ?? exercise.interval.startTime),
    name: exercise.displayName || String(exercise.exerciseType ?? 'Activity').replaceAll('_', ' '),
    startTime: exercise.interval.startTime,
    durationMin: Math.round(durationSec / 60),
    calories: num(summary.caloriesKcal),
    distanceKm: num(summary.distanceMillimeters) != null ? +(Number(summary.distanceMillimeters) / 1_000_000).toFixed(2) : null,
    avgHeartRate: num(summary.averageHeartRateBeatsPerMinute),
    steps: num(summary.steps),
    activeZoneMinutes: num(summary.activeZoneMinutes)
  }
}

// ---------------------------------------------------------------------------
// Live sync

type Raw = Partial<Record<string, unknown>>
const dayInFlight = new Map<string, Promise<HealthDay>>()

async function syncDay(token: string, date: string): Promise<HealthDay> {
  const trendStart = shiftIsoDate(date, -(TREND_DAYS - 1))
  const dayAfter = shiftIsoDate(date, 1)

  const jobs: Array<[string, () => Promise<unknown>]> = [
    // Daily rollups over the trend window
    ['steps', () => dailyRollUp(token, 'steps', trendStart, dayAfter)],
    ['calories', () => dailyRollUp(token, 'total-calories', trendStart, dayAfter)],
    ['distance', () => dailyRollUp(token, 'distance', trendStart, dayAfter)],
    ['floors', () => dailyRollUp(token, 'floors', trendStart, dayAfter)],
    ['activeMinutes', () => dailyRollUp(token, 'active-minutes', trendStart, dayAfter)],
    ['zoneMinutes', () => dailyRollUp(token, 'active-zone-minutes', trendStart, dayAfter)],
    ['sedentary', () => dailyRollUp(token, 'sedentary-period', trendStart, dayAfter)],
    ['weight', () => dailyRollUp(token, 'weight', trendStart, dayAfter)],
    ['bodyFat', () => dailyRollUp(token, 'body-fat', trendStart, dayAfter)],
    ['water', () => dailyRollUp(token, 'hydration-log', trendStart, dayAfter)],
    ['nutrition', () => dailyRollUp(token, 'nutrition-log', trendStart, dayAfter)],
    // Daily records over the trend window
    ['rhr', () => listData(token, 'daily-resting-heart-rate', 'daily', trendStart, dayAfter)],
    ['hrv', () => listData(token, 'daily-heart-rate-variability', 'daily', trendStart, dayAfter)],
    ['spo2', () => listData(token, 'daily-oxygen-saturation', 'daily', trendStart, dayAfter)],
    ['breathing', () => listData(token, 'daily-respiratory-rate', 'daily', trendStart, dayAfter)],
    ['skinTemp', () => listData(token, 'daily-sleep-temperature-derivations', 'daily', trendStart, dayAfter)],
    ['vo2', () => listData(token, 'daily-vo2-max', 'daily', trendStart, dayAfter)],
    // Sessions and intraday detail
    ['sleep', () => listData(token, 'sleep', 'sleep', trendStart, dayAfter, 'google-wearables')],
    ['workouts', () => listData(token, 'exercise', 'session', trendStart, dayAfter)],
    ['stepsIntraday', () => listData(token, 'steps', 'interval', date, dayAfter, 'google-wearables')]
  ]

  const raw: Raw = {}
  const failures: string[] = []
  await Promise.all(
    jobs.map(async ([key, run]) => {
      try {
        raw[key] = await run()
      } catch (err) {
        failures.push(key)
        console.error(`[health] ${key} failed for ${date}:`, err)
      }
    })
  )
  if (failures.length === jobs.length) {
    throw new Error('Every Google Health read failed — token likely expired or scopes missing.')
  }

  return translate(raw, date)
}

function rollup(raw: Raw, key: string): RollupPoint[] {
  return (raw[key] as RollupPoint[] | undefined) ?? []
}

function points(raw: Raw, key: string): RawDataPoint[] {
  return (raw[key] as RawDataPoint[] | undefined) ?? []
}

function translate(raw: Raw, date: string): HealthDay {
  const steps = dailyMap(rollup(raw, 'steps'), (p) => num((p.steps as { countSum?: string })?.countSum))
  const calories = dailyMap(rollup(raw, 'calories'), (p) => num((p.totalCalories as { kcalSum?: number })?.kcalSum))
  const distance = dailyMap(rollup(raw, 'distance'), (p) => {
    const mm = num((p.distance as { millimetersSum?: number })?.millimetersSum)
    return mm == null ? null : +(mm / 1_000_000).toFixed(2)
  })
  const floors = dailyMap(rollup(raw, 'floors'), (p) => num((p.floors as { countSum?: string })?.countSum))
  const activeMinutes = dailyMap(rollup(raw, 'activeMinutes'), (p) => {
    const levels = (p.activeMinutes as { activeMinutesRollupByActivityLevel?: Array<{ activityLevel?: string; activeMinutesSum?: string }> })
      ?.activeMinutesRollupByActivityLevel
    if (!levels) return null
    let total: number | null = null
    for (const level of levels) {
      if (level.activityLevel === 'MODERATE' || level.activityLevel === 'VIGOROUS') {
        total = (total ?? 0) + (num(level.activeMinutesSum) ?? 0)
      }
    }
    return total
  })
  const zoneMinutes = dailyMap(rollup(raw, 'zoneMinutes'), (p) => {
    const zones = p.activeZoneMinutes as Record<string, unknown> | undefined
    if (!zones) return null
    return Object.values(zones).reduce<number>((sum, v) => sum + (num(v) ?? 0), 0)
  })
  const sedentary = dailyMap(rollup(raw, 'sedentary'), (p) => {
    const dur = (p.sedentaryPeriod as { durationSum?: string })?.durationSum
    return dur === undefined ? null : Math.round(durationSeconds(dur) / 60)
  })
  const weight = dailyMap(rollup(raw, 'weight'), (p) => {
    const grams = num((p.weight as { weightGramsAvg?: number })?.weightGramsAvg)
    return grams == null ? null : +(grams / 1000).toFixed(1)
  })
  const bodyFat = dailyMap(rollup(raw, 'bodyFat'), (p) => num((p.bodyFat as { bodyFatPercentageAvg?: number })?.bodyFatPercentageAvg))
  const water = dailyMap(rollup(raw, 'water'), (p) =>
    num((p.hydrationLog as { amountConsumed?: { millilitersSum?: number } })?.amountConsumed?.millilitersSum)
  )
  const nutrition = dailyMap(rollup(raw, 'nutrition'), (p) => num((p.nutritionLog as { energy?: { kcalSum?: number } })?.energy?.kcalSum))

  const rhr = dailyRecordMap(points(raw, 'rhr'), 'dailyRestingHeartRate', (r) => num(r.beatsPerMinute))
  const hrv = dailyRecordMap(points(raw, 'hrv'), 'dailyHeartRateVariability', (r) =>
    num(r.averageHeartRateVariabilityMilliseconds ?? r.deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds)
  )
  const spo2 = dailyRecordMap(points(raw, 'spo2'), 'dailyOxygenSaturation', (r) => num(r.averagePercentage))
  const breathing = dailyRecordMap(points(raw, 'breathing'), 'dailyRespiratoryRate', (r) => num(r.breathsPerMinute))
  const skinTemp = dailyRecordMap(points(raw, 'skinTemp'), 'dailySleepTemperatureDerivations', (r) => {
    const nightly = num(r.nightlyTemperatureCelsius)
    const baseline = num(r.baselineTemperatureCelsius)
    return nightly == null || baseline == null ? null : +(nightly - baseline).toFixed(2)
  })
  const vo2 = dailyRecordMap(points(raw, 'vo2'), 'dailyVo2Max', (r) => num(r.vo2Max))

  const sleepNights = points(raw, 'sleep')
    .map(mapSleep)
    .filter((s): s is SleepNight => s !== null)
  const sleepByDate = new Map<string, SleepNight>()
  for (const night of sleepNights) {
    const existing = sleepByDate.get(night.date)
    // Prefer the main sleep, then the longest session per date.
    if (!existing || (night.isMainSleep && !existing.isMainSleep) || night.minutesAsleep > existing.minutesAsleep) {
      if (!existing || night.isMainSleep || !existing.isMainSleep) sleepByDate.set(night.date, night)
    }
  }

  const metricsFor = (d: string): DayMetrics => ({
    date: d,
    steps: steps.get(d) ?? null,
    distanceKm: distance.get(d) ?? null,
    floors: floors.get(d) ?? null,
    caloriesOut: calories.get(d) ?? null,
    activeMinutes: activeMinutes.get(d) ?? null,
    activeZoneMinutes: zoneMinutes.get(d) ?? null,
    sedentaryMinutes: sedentary.get(d) ?? null,
    restingHeartRate: rhr.get(d) ?? null,
    hrvMs: hrv.get(d) ?? null,
    spo2Pct: spo2.get(d) ?? null,
    breathingRate: breathing.get(d) ?? null,
    skinTempDeltaC: skinTemp.get(d) ?? null,
    vo2Max: vo2.get(d) ?? null,
    sleepMinutes: sleepByDate.get(d)?.minutesAsleep ?? null,
    sleepEfficiency: sleepByDate.get(d)?.efficiency ?? null,
    weightKg: weight.get(d) ?? null,
    bodyFatPct: bodyFat.get(d) ?? null,
    waterMl: water.get(d) ?? null,
    caloriesIn: nutrition.get(d) ?? null
  })

  const trend: DayMetrics[] = []
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    trend.push(metricsFor(shiftIsoDate(date, -i)))
  }

  // Intraday steps -> 24 hourly buckets.
  const hourly = new Array(24).fill(0) as number[]
  let sawIntradaySteps = false
  for (const p of points(raw, 'stepsIntraday')) {
    const record = p.steps as { interval?: { civilStartTime?: CivilDateTime; startTime?: string }; count?: string } | undefined
    const minute = minuteFromCivil(record?.interval?.civilStartTime)
    const fallback = record?.interval?.startTime
      ? new Date(record.interval.startTime).getHours() * 60 + new Date(record.interval.startTime).getMinutes()
      : null
    const m = minute ?? fallback
    if (m == null) continue
    sawIntradaySteps = true
    hourly[Math.min(23, Math.floor(m / 60))] += num(record?.count) ?? 0
  }
  const stepsHourly: HourlySteps[] = sawIntradaySteps
    ? hourly.map((value, hour) => ({ hour, steps: Math.round(value) }))
    : []

  const heartRate: HeartRatePoint[] = points(raw, 'heartIntraday')
    .map((p) => {
      const record = p.heartRate as
        | { sampleTime?: { civilTime?: CivilDateTime; physicalTime?: string }; beatsPerMinute?: string }
        | undefined
      const minute =
        minuteFromCivil(record?.sampleTime?.civilTime) ??
        (record?.sampleTime?.physicalTime
          ? new Date(record.sampleTime.physicalTime).getHours() * 60 +
            new Date(record.sampleTime.physicalTime).getMinutes()
          : null)
      const bpm = num(record?.beatsPerMinute)
      return minute != null && bpm ? { minute, bpm } : null
    })
    .filter((p): p is HeartRatePoint => p !== null)
    .sort((a, b) => a.minute - b.minute)

  const workouts = points(raw, 'workouts')
    .map(mapWorkout)
    .filter((w): w is Workout => w !== null && w.startTime.slice(0, 10) === date)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))

  return {
    date,
    source: 'live',
    syncedAt: new Date().toISOString(),
    metrics: metricsFor(date),
    stepsHourly,
    heartRate,
    currentHeartRate: date === todayIso() ? (heartRate.at(-1)?.bpm ?? null) : null,
    sleep: sleepByDate.get(date) ?? null,
    workouts,
    trend
  }
}

// ---------------------------------------------------------------------------
// Public service

export async function getHealthDay(date: string, force = false): Promise<HealthDay> {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayIso()
  const clamped = day > todayIso() ? todayIso() : day

  if (!force) {
    const cached = cachedDay(clamped)
    if (cached) return cached
  }

  const pending = dayInFlight.get(clamped)
  if (pending) return pending

  const load = (async (): Promise<HealthDay> => {
    const token = await getGoogleAccessToken()
    if (!token) return demoHealthDay(clamped)

    try {
      const snapshot = await syncDay(token, clamped)
      dayCache.set(clamped, { day: snapshot, fetchedAt: Date.now() })
      return snapshot
    } catch (err) {
      console.error(`[health] sync failed for ${clamped}:`, err)
      // Serve a stale snapshot over nothing; fall back to demo as a last resort.
      return dayCache.get(clamped)?.day ?? demoHealthDay(clamped)
    }
  })()

  dayInFlight.set(clamped, load)
  try {
    return await load
  } finally {
    dayInFlight.delete(clamped)
  }
}

export async function getSleepHistory(nights: number, endDate = todayIso()): Promise<SleepNight[]> {
  const token = await getGoogleAccessToken()
  if (!token) return demoSleepHistory(nights, endDate)
  try {
    const start = shiftIsoDate(endDate, -nights)
    const dayAfter = shiftIsoDate(endDate, 1)
    const points = await listData(token, 'sleep', 'sleep', start, dayAfter, 'google-wearables')
    const mapped = points
      .map(mapSleep)
      .filter((s): s is SleepNight => s !== null && s.isMainSleep)
      .sort((a, b) => a.date.localeCompare(b.date))
    return mapped
  } catch (err) {
    console.error('[health] sleep history failed:', err)
    return []
  }
}

export async function getDevices(): Promise<PairedDevice[]> {
  const token = await getGoogleAccessToken()
  if (!token) return demoDevices()
  try {
    const devices = await listPairedDevices(token)
    return devices.map((d) => ({
      name: d.displayName ?? d.model ?? d.deviceVersion ?? 'Tracker',
      model: d.deviceVersion ?? d.model ?? 'Unknown model',
      type: d.deviceType ?? null,
      batteryPct: num(d.batteryLevel ?? d.batteryLevelPercentage),
      batteryState: d.batteryStatus ?? null,
      lastSync: d.lastSyncTime ?? null,
      features: Array.isArray(d.features) ? d.features.map(String) : undefined
    }))
  } catch (err) {
    console.error('[health] devices failed:', err)
    return []
  }
}
