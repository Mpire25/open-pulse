// Domain-split health queries over the per-day archive.
//
// Every query answers from the archive first and fetches only the days that
// are missing or stale, so switching dates reuses everything already synced
// and an app restart renders instantly from the encrypted disk cache.
// Requests are priority-ordered: the selected day's numbers arrive before
// history backfills.

import type {
  DailySeries,
  DayMetrics,
  DayValues,
  HealthDay,
  HeartRatePoint,
  HourlySteps,
  IntradaySnapshot,
  MetricKey,
  PairedDevice,
  SeriesResult,
  SleepNight,
  SleepRangeResult,
  SleepStageSegment,
  SleepStageType,
  Workout,
  WorkoutsResult
} from '../shared/types'
import { METRIC_KEYS } from '../shared/types'
import { getGoogleAccessToken } from './google-auth'
import {
  dailyRollUp,
  dateFromCivil,
  listData,
  listPairedDevices,
  minuteFromCivil,
  shiftIsoDate,
  type CivilDateTime,
  type Priority,
  type RawDataPoint,
  type RollupPoint
} from './health-api'
import {
  fetchedAt,
  markAllStale,
  markFetched,
  mergeValues,
  peekDay,
  setIntradayHeart,
  setIntradaySteps,
  setSleep,
  setWorkouts
} from './metric-store'
import { demoDevices, demoIntraday, demoSeries, demoSleepRange, demoWorkoutsRange } from './sample-data'
import { nutrientGrams } from './nutrition'

// ---------------------------------------------------------------------------
// Dates & freshness

function isoDate(d: Date): string {
  const tz = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - tz).toISOString().slice(0, 10)
}

function todayIso(): string {
  return isoDate(new Date())
}

function listDates(start: string, end: string): string[] {
  const out: string[] = []
  for (let d = start; d <= end; d = shiftIsoDate(d, 1)) out.push(d)
  return out
}

/** Clamp to [something sane, today] and make sure start <= end. */
function normalizeRange(start: string, end: string): [string, string] {
  const today = todayIso()
  const valid = (d: string): string => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d : today)
  let s = valid(start)
  let e = valid(end)
  if (e > today) e = today
  if (s > e) s = e
  return [s, e]
}

const TTL_TODAY_MS = 2 * 60_000
const TTL_RECENT_MS = 30 * 60_000 // late device syncs still land on recent days

function isFresh(group: string, date: string, now = Date.now()): boolean {
  const at = fetchedAt(group, date)
  if (at == null) return false
  const today = todayIso()
  if (date >= today) return now - at < TTL_TODAY_MS
  if (date >= shiftIsoDate(today, -2)) return now - at < TTL_RECENT_MS
  return true // settled history: only a forced refresh refetches
}

/** Small spans are what the user is looking at; long spans are backfill. */
function spanPriority(days: number): Priority {
  if (days <= 2) return 0
  if (days <= 31) return 1
  return 2
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
// Fetch groups
//
// A group is the unit of fetching and freshness: one API call that yields one
// or more daily metrics over a date range.

interface FetchGroup {
  id: string
  metrics: MetricKey[]
  fetch: (token: string, start: string, endExclusive: string, priority: Priority) => Promise<Map<string, DayValues>>
}

function rollupGroup(
  id: string,
  dataType: string,
  metrics: MetricKey[],
  extract: (p: RollupPoint) => DayValues
): FetchGroup {
  return {
    id,
    metrics,
    fetch: async (token, start, endExclusive, priority) => {
      const points = await dailyRollUp(token, dataType, start, endExclusive, priority)
      const map = new Map<string, DayValues>()
      for (const p of points) {
        const date = dateFromCivil(p.civilStartTime)
        if (date) map.set(date, extract(p))
      }
      return map
    }
  }
}

function dailyRecordGroup(
  id: string,
  dataType: string,
  recordKey: string,
  metrics: MetricKey[],
  extract: (record: Record<string, unknown>) => DayValues
): FetchGroup {
  return {
    id,
    metrics,
    fetch: async (token, start, endExclusive, priority) => {
      const points = await listData(token, dataType, 'daily', start, endExclusive, 'all-sources', priority)
      const map = new Map<string, DayValues>()
      for (const p of points) {
        const record = p[recordKey] as Record<string, unknown> | undefined
        const date = dateFromCivil(record?.date as CivilDateTime | undefined)
        if (record && date) map.set(date, extract(record))
      }
      return map
    }
  }
}

const GROUPS: FetchGroup[] = [
  rollupGroup('steps', 'steps', ['steps'], (p) => ({
    steps: num((p.steps as { countSum?: string })?.countSum)
  })),
  rollupGroup('calories-out', 'total-calories', ['caloriesOut'], (p) => ({
    caloriesOut: num((p.totalCalories as { kcalSum?: number })?.kcalSum)
  })),
  rollupGroup('distance', 'distance', ['distanceKm'], (p) => {
    const mm = num((p.distance as { millimetersSum?: number })?.millimetersSum)
    return { distanceKm: mm == null ? null : +(mm / 1_000_000).toFixed(2) }
  }),
  rollupGroup('floors', 'floors', ['floors'], (p) => ({
    floors: num((p.floors as { countSum?: string })?.countSum)
  })),
  rollupGroup('active-minutes', 'active-minutes', ['activeMinutes'], (p) => {
    const levels = (
      p.activeMinutes as
        | { activeMinutesRollupByActivityLevel?: Array<{ activityLevel?: string; activeMinutesSum?: string }> }
        | undefined
    )?.activeMinutesRollupByActivityLevel
    if (!levels) return { activeMinutes: null }
    let total: number | null = null
    for (const level of levels) {
      if (level.activityLevel === 'MODERATE' || level.activityLevel === 'VIGOROUS') {
        total = (total ?? 0) + (num(level.activeMinutesSum) ?? 0)
      }
    }
    return { activeMinutes: total }
  }),
  rollupGroup('zone-minutes', 'active-zone-minutes', ['activeZoneMinutes'], (p) => {
    const zones = p.activeZoneMinutes as Record<string, unknown> | undefined
    if (!zones) return { activeZoneMinutes: null }
    return { activeZoneMinutes: Object.values(zones).reduce<number>((sum, v) => sum + (num(v) ?? 0), 0) }
  }),
  rollupGroup('sedentary', 'sedentary-period', ['sedentaryMinutes'], (p) => {
    const dur = (p.sedentaryPeriod as { durationSum?: string })?.durationSum
    return { sedentaryMinutes: dur === undefined ? null : Math.round(durationSeconds(dur) / 60) }
  }),
  rollupGroup('weight', 'weight', ['weightKg'], (p) => {
    const grams = num((p.weight as { weightGramsAvg?: number })?.weightGramsAvg)
    return { weightKg: grams == null ? null : +(grams / 1000).toFixed(1) }
  }),
  rollupGroup('body-fat', 'body-fat', ['bodyFatPct'], (p) => ({
    bodyFatPct: num((p.bodyFat as { bodyFatPercentageAvg?: number })?.bodyFatPercentageAvg)
  })),
  rollupGroup('water', 'hydration-log', ['waterMl'], (p) => ({
    waterMl: num(
      (p.hydrationLog as { amountConsumed?: { millilitersSum?: number } })?.amountConsumed?.millilitersSum
    )
  })),
  rollupGroup(
    // Versioned so installs that cached a missing Protein value with the old
    // parser refetch nutrition once and repair the archived day automatically.
    'nutrition-v2',
    'nutrition-log',
    ['caloriesIn', 'proteinG', 'carbsG', 'fatG', 'fiberG', 'sugarG'],
    (p) => {
      const log = p.nutritionLog as Record<string, unknown> | undefined
      if (!log) return { caloriesIn: null, proteinG: null, carbsG: null, fatG: null, fiberG: null, sugarG: null }
      return {
        caloriesIn: num((log.energy as { kcalSum?: number } | undefined)?.kcalSum),
        proteinG: nutrientGrams(log, ['protein', 'proteins', 'proteinG', 'proteinGrams', 'totalProtein', 'dietaryProtein']),
        carbsG: nutrientGrams(log, ['carbohydrate', 'carbohydrates', 'totalCarbohydrate', 'carbs', 'carbsG']),
        fatG: nutrientGrams(log, ['fat', 'fats', 'totalFat', 'fatG']),
        fiberG: nutrientGrams(log, ['fiber', 'fibre', 'dietaryFiber', 'dietaryFibre', 'fiberG']),
        sugarG: nutrientGrams(log, ['sugar', 'sugars', 'totalSugar', 'sugarG'])
      }
    }
  ),
  dailyRecordGroup('rhr', 'daily-resting-heart-rate', 'dailyRestingHeartRate', ['restingHeartRate'], (r) => ({
    restingHeartRate: num(r.beatsPerMinute)
  })),
  dailyRecordGroup('hrv', 'daily-heart-rate-variability', 'dailyHeartRateVariability', ['hrvMs'], (r) => ({
    hrvMs: num(r.averageHeartRateVariabilityMilliseconds ?? r.deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds)
  })),
  dailyRecordGroup('spo2', 'daily-oxygen-saturation', 'dailyOxygenSaturation', ['spo2Pct'], (r) => ({
    spo2Pct: num(r.averagePercentage)
  })),
  dailyRecordGroup('breathing', 'daily-respiratory-rate', 'dailyRespiratoryRate', ['breathingRate'], (r) => ({
    breathingRate: num(r.breathsPerMinute)
  })),
  dailyRecordGroup(
    'skin-temp',
    'daily-sleep-temperature-derivations',
    'dailySleepTemperatureDerivations',
    ['skinTempDeltaC'],
    (r) => {
      const nightly = num(r.nightlyTemperatureCelsius)
      const baseline = num(r.baselineTemperatureCelsius)
      return { skinTempDeltaC: nightly == null || baseline == null ? null : +(nightly - baseline).toFixed(2) }
    }
  ),
  dailyRecordGroup('vo2', 'daily-vo2-max', 'dailyVo2Max', ['vo2Max'], (r) => ({ vo2Max: num(r.vo2Max) }))
]

const GROUP_BY_METRIC = new Map<MetricKey, FetchGroup>()
for (const group of GROUPS) {
  for (const metric of group.metrics) GROUP_BY_METRIC.set(metric, group)
}

// Sleep summary metrics come from the sleep-session group, handled separately.
const SLEEP_METRICS: MetricKey[] = ['sleepMinutes', 'sleepEfficiency']

// ---------------------------------------------------------------------------
// Group syncing

/**
 * Makes `group` fresh for every day in [start, end]. Fetches one span that
 * covers all missing days; days that come back empty are stored as explicit
 * nulls so they count as known.
 */
async function ensureGroup(token: string, group: FetchGroup, start: string, end: string, force: boolean): Promise<void> {
  const missing = listDates(start, end).filter((d) => force || !isFresh(group.id, d))
  if (missing.length === 0) return
  const spanStart = missing[0]
  const spanEnd = missing[missing.length - 1]
  const spanDates = listDates(spanStart, spanEnd)
  const map = await group.fetch(token, spanStart, shiftIsoDate(spanEnd, 1), spanPriority(spanDates.length))
  for (const date of spanDates) {
    const fetched = map.get(date)
    const merged: DayValues = {}
    for (const key of group.metrics) merged[key] = fetched?.[key] ?? null
    mergeValues(date, merged)
  }
  markFetched(group.id, spanDates)
}

const inFlight = new Map<string, Promise<void>>()

/** Dedupes concurrent syncs of the same group+span (several views share windows). */
function ensureGroupOnce(token: string, group: FetchGroup, start: string, end: string, force: boolean): Promise<void> {
  const key = `${group.id}:${start}:${end}:${force}`
  const pending = inFlight.get(key)
  if (pending) return pending
  const job = ensureGroup(token, group, start, end, force).finally(() => inFlight.delete(key))
  inFlight.set(key, job)
  return job
}

// ---------------------------------------------------------------------------
// Sleep sessions

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

async function ensureSleepRange(token: string, start: string, end: string, force: boolean): Promise<void> {
  const missing = listDates(start, end).filter((d) => force || !isFresh('sleep', d))
  if (missing.length === 0) return
  const spanStart = missing[0]
  const spanEnd = missing[missing.length - 1]
  const spanDates = listDates(spanStart, spanEnd)
  const points = await listData(
    token,
    'sleep',
    'sleep',
    spanStart,
    shiftIsoDate(spanEnd, 1),
    'google-wearables',
    spanPriority(spanDates.length)
  )
  const byDate = new Map<string, SleepNight>()
  for (const point of points) {
    const night = mapSleep(point)
    if (!night) continue
    const existing = byDate.get(night.date)
    // Prefer the main sleep, then the longest session per date.
    if (!existing || (night.isMainSleep && !existing.isMainSleep) || night.minutesAsleep > existing.minutesAsleep) {
      if (!existing || night.isMainSleep || !existing.isMainSleep) byDate.set(night.date, night)
    }
  }
  for (const date of spanDates) {
    const night = byDate.get(date) ?? null
    setSleep(date, night)
    mergeValues(date, {
      sleepMinutes: night?.minutesAsleep ?? null,
      sleepEfficiency: night?.efficiency ?? null
    })
  }
  markFetched('sleep', spanDates)
}

function ensureSleepOnce(token: string, start: string, end: string, force: boolean): Promise<void> {
  const key = `sleep:${start}:${end}:${force}`
  const pending = inFlight.get(key)
  if (pending) return pending
  const job = ensureSleepRange(token, start, end, force).finally(() => inFlight.delete(key))
  inFlight.set(key, job)
  return job
}

// ---------------------------------------------------------------------------
// Workouts

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
    distanceKm:
      num(summary.distanceMillimeters) != null ? +(Number(summary.distanceMillimeters) / 1_000_000).toFixed(2) : null,
    avgHeartRate: num(summary.averageHeartRateBeatsPerMinute),
    steps: num(summary.steps),
    activeZoneMinutes: num(summary.activeZoneMinutes)
  }
}

async function ensureWorkoutsRange(token: string, start: string, end: string, force: boolean): Promise<void> {
  const missing = listDates(start, end).filter((d) => force || !isFresh('workouts', d))
  if (missing.length === 0) return
  const spanStart = missing[0]
  const spanEnd = missing[missing.length - 1]
  const spanDates = listDates(spanStart, spanEnd)
  const points = await listData(
    token,
    'exercise',
    'session',
    spanStart,
    shiftIsoDate(spanEnd, 1),
    'all-sources',
    spanPriority(spanDates.length)
  )
  const byDate = new Map<string, Workout[]>()
  for (const point of points) {
    const workout = mapWorkout(point)
    if (!workout) continue
    const date = workout.startTime.slice(0, 10)
    const list = byDate.get(date) ?? []
    list.push(workout)
    byDate.set(date, list)
  }
  for (const date of spanDates) {
    const list = (byDate.get(date) ?? []).sort((a, b) => a.startTime.localeCompare(b.startTime))
    setWorkouts(date, list)
  }
  markFetched('workouts', spanDates)
}

// ---------------------------------------------------------------------------
// Intraday (selected day only — always priority 0)

async function ensureIntradaySteps(token: string, date: string, force: boolean): Promise<void> {
  if (!force && isFresh('intraday-steps', date)) return
  const points = await listData(token, 'steps', 'interval', date, shiftIsoDate(date, 1), 'google-wearables', 0)
  const hourly = new Array(24).fill(0) as number[]
  let saw = false
  for (const p of points) {
    const record = p.steps as
      | { interval?: { civilStartTime?: CivilDateTime; startTime?: string }; count?: string }
      | undefined
    const minute = minuteFromCivil(record?.interval?.civilStartTime)
    const fallback = record?.interval?.startTime
      ? new Date(record.interval.startTime).getHours() * 60 + new Date(record.interval.startTime).getMinutes()
      : null
    const m = minute ?? fallback
    if (m == null) continue
    saw = true
    hourly[Math.min(23, Math.floor(m / 60))] += num(record?.count) ?? 0
  }
  setIntradaySteps(date, saw ? hourly.map((value, hour) => ({ hour, steps: Math.round(value) })) : [])
  markFetched('intraday-steps', [date])
}

async function ensureIntradayHeart(token: string, date: string, force: boolean): Promise<void> {
  if (!force && isFresh('intraday-heart', date)) return
  const points = await listData(token, 'heart-rate', 'sample', date, shiftIsoDate(date, 1), 'google-wearables', 0)
  const series: HeartRatePoint[] = points
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
  setIntradayHeart(date, series)
  markFetched('intraday-heart', [date])
}

// ---------------------------------------------------------------------------
// Public queries

export async function getSeries(metrics: MetricKey[], start: string, end: string, force = false): Promise<SeriesResult> {
  const [s, e] = normalizeRange(start, end)
  const token = await getGoogleAccessToken()
  if (!token) return { source: 'demo', start: s, end: e, days: demoSeries(metrics, s, e) }

  const groups = [...new Set(metrics.map((m) => GROUP_BY_METRIC.get(m)).filter((g): g is FetchGroup => g != null))]
  const jobs: Array<Promise<unknown>> = groups.map((group) =>
    ensureGroupOnce(token, group, s, e, force).catch((err) => {
      console.error(`[health] ${group.id} failed for ${s}..${e}:`, err)
      return 'failed'
    })
  )
  if (metrics.some((m) => SLEEP_METRICS.includes(m))) {
    jobs.push(
      ensureSleepOnce(token, s, e, force).catch((err) => {
        console.error(`[health] sleep failed for ${s}..${e}:`, err)
        return 'failed'
      })
    )
  }
  const results = await Promise.all(jobs)
  if (jobs.length > 0 && results.every((r) => r === 'failed')) {
    // Serve whatever the archive has; only give up when it's empty too.
    const anyCached = listDates(s, e).some((d) => peekDay(d) != null)
    if (!anyCached) throw new Error('Every Google Health read failed — token likely expired or scopes missing.')
  }

  const days: DailySeries = {}
  for (const date of listDates(s, e)) {
    const record = peekDay(date)
    const out: DayValues = {}
    for (const metric of metrics) out[metric] = record?.values[metric] ?? null
    days[date] = out
  }
  return { source: 'live', start: s, end: e, days }
}

export async function getSleepRange(start: string, end: string, force = false): Promise<SleepRangeResult> {
  const [s, e] = normalizeRange(start, end)
  const token = await getGoogleAccessToken()
  if (!token) return { source: 'demo', nights: demoSleepRange(s, e) }
  try {
    await ensureSleepOnce(token, s, e, force)
  } catch (err) {
    console.error(`[health] sleep range failed for ${s}..${e}:`, err)
  }
  const nights = listDates(s, e)
    .map((d) => peekDay(d)?.sleep)
    .filter((n): n is SleepNight => n != null)
  return { source: 'live', nights }
}

export async function getWorkoutsRange(start: string, end: string, force = false): Promise<WorkoutsResult> {
  const [s, e] = normalizeRange(start, end)
  const token = await getGoogleAccessToken()
  if (!token) return { source: 'demo', workouts: demoWorkoutsRange(s, e) }
  try {
    await ensureWorkoutsRange(token, s, e, force)
  } catch (err) {
    console.error(`[health] workouts failed for ${s}..${e}:`, err)
  }
  const workouts = listDates(s, e).flatMap((d) => peekDay(d)?.workouts ?? [])
  return { source: 'live', workouts }
}

export async function getIntraday(date: string, force = false): Promise<IntradaySnapshot> {
  const [d] = normalizeRange(date, date)
  const token = await getGoogleAccessToken()
  if (!token) return demoIntraday(d)
  await Promise.all([
    ensureIntradaySteps(token, d, force).catch((err) => console.error(`[health] intraday steps failed for ${d}:`, err)),
    ensureIntradayHeart(token, d, force).catch((err) => console.error(`[health] intraday heart failed for ${d}:`, err))
  ])
  const record = peekDay(d)
  const heartRate = record?.heartRate ?? []
  return {
    date: d,
    source: 'live',
    stepsHourly: record?.stepsHourly ?? [],
    heartRate,
    currentHeartRate: d === todayIso() ? (heartRate.at(-1)?.bpm ?? null) : null
  }
}

// ---------------------------------------------------------------------------
// Devices

interface DevicesCache {
  devices: PairedDevice[]
  fetchedAt: number
}

let devicesCache: DevicesCache | null = null
const DEVICES_TTL_MS = 5 * 60_000

export async function getDevices(force = false): Promise<PairedDevice[]> {
  const token = await getGoogleAccessToken()
  if (!token) return demoDevices()
  if (!force && devicesCache && Date.now() - devicesCache.fetchedAt < DEVICES_TTL_MS) return devicesCache.devices
  try {
    const devices = (await listPairedDevices(token)).map((d) => ({
      name: d.displayName ?? d.model ?? d.deviceVersion ?? 'Tracker',
      model: d.deviceVersion ?? d.model ?? 'Unknown model',
      type: d.deviceType ?? null,
      batteryPct: num(d.batteryLevel ?? d.batteryLevelPercentage),
      batteryState: d.batteryStatus ?? null,
      lastSync: d.lastSyncTime ?? null,
      features: Array.isArray(d.features) ? d.features.map(String) : undefined
    }))
    devicesCache = { devices, fetchedAt: Date.now() }
    return devices
  } catch (err) {
    console.error('[health] devices failed:', err)
    return devicesCache?.devices ?? []
  }
}

// ---------------------------------------------------------------------------
// Refresh

/** Keeps values on screen but makes every next query hit the API again. */
export function clearHealthCache(): void {
  markAllStale()
  devicesCache = null
}

// ---------------------------------------------------------------------------
// AI snapshot (assistant tools want one self-describing day blob)

function emptyMetrics(date: string): DayMetrics {
  return { date, ...(Object.fromEntries(METRIC_KEYS.map((k) => [k, null])) as Record<MetricKey, null>) }
}

export async function getHealthDay(date: string): Promise<HealthDay> {
  const [, end] = normalizeRange(date, date)
  const start = shiftIsoDate(end, -13)
  const [series, sleep, workouts, intraday] = await Promise.all([
    getSeries([...METRIC_KEYS], start, end),
    getSleepRange(end, end),
    getWorkoutsRange(end, end),
    getIntraday(end)
  ])
  const trend = listDates(start, end).map((d) => ({ ...emptyMetrics(d), ...series.days[d] }))
  return {
    date: end,
    source: series.source,
    syncedAt: new Date().toISOString(),
    metrics: trend[trend.length - 1],
    stepsHourly: intraday.stepsHourly,
    heartRate: intraday.heartRate,
    currentHeartRate: intraday.currentHeartRate,
    sleep: sleep.nights.find((n) => n.date === end) ?? null,
    workouts: workouts.workouts,
    trend
  }
}

export async function getSleepHistory(nights: number, endDate = todayIso()): Promise<SleepNight[]> {
  const [, end] = normalizeRange(endDate, endDate)
  const result = await getSleepRange(shiftIsoDate(end, -(Math.max(1, nights) - 1)), end)
  return result.nights
}
