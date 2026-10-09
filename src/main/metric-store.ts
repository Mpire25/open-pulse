// Encrypted on-disk archive of everything synced from Google Health, keyed by
// civil day. Values live per (metric, day) so any query can reuse days that a
// different view — or a previous app session — already fetched. Freshness is
// tracked per fetch group per day; a "refresh" drops freshness but keeps the
// values, so the UI stays populated while it refetches.

import { app, safeStorage } from 'electron'
import { join } from 'node:path'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type {
  ActivityIntradayMetric,
  ActivityIntradayResult,
  DayValues,
  HeartRatePoint,
  HeartDetailMetric,
  HeartDetailResult,
  HourlySteps,
  SleepNight,
  SleepDay,
  Workout
} from '../shared/types'

export interface DayRecord {
  values: DayValues
  /** Legacy single-session cache, retained until the first successful sleep refresh. */
  sleep?: SleepNight | null
  /** All sleep ending this date. undefined = never synced; null = synced, none found. */
  sleepDay?: SleepDay | null
  workouts?: Workout[]
  stepsHourly?: HourlySteps[]
  heartRate?: HeartRatePoint[]
  activityIntraday?: Partial<Record<ActivityIntradayMetric, ActivityIntradayResult>>
  heartDetails?: Partial<Record<HeartDetailMetric, HeartDetailResult>>
  /** fetch group -> epoch ms of the last successful sync covering this day */
  fetched: Record<string, number>
}

interface Archive {
  version: number
  days: Record<string, DayRecord>
  /** Latest tracker sync seen (epoch ms), used to spot days a late sync may have changed. */
  deviceLastSync?: number
}

const VERSION = 1
let archive: Archive | null = null
let saveTimer: NodeJS.Timeout | null = null

function filePath(): string {
  return join(app.getPath('userData'), 'health-archive.bin')
}

function load(): Archive {
  if (archive) return archive
  archive = { version: VERSION, days: {} }
  try {
    if (safeStorage.isEncryptionAvailable() && existsSync(filePath())) {
      const plain = safeStorage.decryptString(readFileSync(filePath()))
      const parsed = JSON.parse(plain) as Partial<Archive>
      if (parsed.version === VERSION && parsed.days && typeof parsed.days === 'object') {
        archive = {
          version: VERSION,
          days: parsed.days as Record<string, DayRecord>,
          ...(typeof parsed.deviceLastSync === 'number' ? { deviceLastSync: parsed.deviceLastSync } : {})
        }
      }
    }
  } catch (err) {
    console.error('[archive] unreadable health archive, starting fresh:', err)
  }
  return archive
}

// Debounced encrypted write. Without OS-keychain encryption nothing is
// persisted — health data never hits disk in plain text.
function scheduleSave(): void {
  if (!safeStorage.isEncryptionAvailable() || saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    try {
      writeFileSync(filePath(), safeStorage.encryptString(JSON.stringify(load())))
    } catch (err) {
      console.error('[archive] failed to persist health archive:', err)
    }
  }, 1500)
}

function dayRecord(date: string): DayRecord {
  const days = load().days
  return (days[date] ??= { values: {}, fetched: {} })
}

export function peekDay(date: string): DayRecord | undefined {
  return load().days[date]
}

export function fetchedAt(group: string, date: string): number | null {
  return load().days[date]?.fetched[group] ?? null
}

export function markFetched(group: string, dates: string[], at = Date.now()): void {
  for (const d of dates) dayRecord(d).fetched[group] = at
  scheduleSave()
}

export function clearFetched(group: string, dates: string[]): void {
  for (const d of dates) {
    const record = load().days[d]
    if (record) delete record.fetched[group]
  }
  scheduleSave()
}

/** Returns whether any stored value changed. */
export function mergeValues(date: string, values: DayValues): boolean {
  const record = dayRecord(date)
  const changed = Object.entries(values).some(
    ([metric, value]) => (record.values[metric as keyof DayValues] ?? null) !== (value ?? null)
  )
  Object.assign(record.values, values)
  scheduleSave()
  return changed
}

/** Returns whether the stored sleep changed. */
export function setSleep(date: string, day: SleepDay | null): boolean {
  const record = dayRecord(date)
  const changed = JSON.stringify(record.sleepDay ?? null) !== JSON.stringify(day)
  record.sleepDay = day
  delete record.sleep
  scheduleSave()
  return changed
}

/** Returns whether the stored workouts changed. */
export function setWorkouts(date: string, workouts: Workout[]): boolean {
  const record = dayRecord(date)
  const changed = JSON.stringify(record.workouts ?? []) !== JSON.stringify(workouts)
  record.workouts = workouts
  scheduleSave()
  return changed
}

export function setIntradaySteps(date: string, stepsHourly: HourlySteps[]): void {
  dayRecord(date).stepsHourly = stepsHourly
  scheduleSave()
}

export function setIntradayHeart(date: string, heartRate: HeartRatePoint[]): void {
  dayRecord(date).heartRate = heartRate
  scheduleSave()
}

export function setActivityIntraday(date: string, result: ActivityIntradayResult): void {
  const record = dayRecord(date)
  const activityIntraday = record.activityIntraday ?? (record.activityIntraday = {})
  activityIntraday[result.metric] = result
  scheduleSave()
}

export function setHeartDetail(date: string, result: HeartDetailResult): void {
  const record = dayRecord(date)
  const heartDetails = record.heartDetails ?? (record.heartDetails = {})
  heartDetails[result.metric] = result
  scheduleSave()
}

export interface ArchivedMetricCoverage {
  /** Days with a recorded value. */
  days: number
  first: string
  last: string
}

/** Which daily metrics the archive holds values for, and over which dates. */
export function archivedMetricCoverage(): Record<string, ArchivedMetricCoverage> {
  const coverage: Record<string, ArchivedMetricCoverage> = {}
  for (const [date, record] of Object.entries(load().days)) {
    for (const [metric, value] of Object.entries(record.values)) {
      if (value == null) continue
      const entry = coverage[metric]
      if (!entry) {
        coverage[metric] = { days: 1, first: date, last: date }
        continue
      }
      entry.days++
      if (date < entry.first) entry.first = date
      if (date > entry.last) entry.last = date
    }
  }
  return coverage
}

// Stale days keep their fetch entries at timestamp 0: still known, so views
// show the stored values while they revalidate, but older than any TTL.
function markRecordStale(record: DayRecord): void {
  for (const group of Object.keys(record.fetched)) record.fetched[group] = 0
}

/** Refresh: keep values (views stay populated) but force the next query to refetch. */
export function markAllStale(): void {
  for (const record of Object.values(load().days)) markRecordStale(record)
  scheduleSave()
}

/** A late tracker sync may have changed these days; recheck them on next use. */
export function markDaysStale(dates: string[]): void {
  for (const date of dates) {
    const record = load().days[date]
    if (record) markRecordStale(record)
  }
  scheduleSave()
}

export function deviceLastSync(): number | null {
  return load().deviceLastSync ?? null
}

export function setDeviceLastSync(at: number): void {
  load().deviceLastSync = at
  scheduleSave()
}

/** Disconnect: drop everything, including the encrypted file on disk. */
export function wipeArchive(): void {
  archive = { version: VERSION, days: {} }
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  try {
    rmSync(filePath(), { force: true })
  } catch {
    // best effort
  }
}
