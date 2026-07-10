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
  Workout
} from '../shared/types'

export interface DayRecord {
  values: DayValues
  /** Main sleep ending this date. undefined = never synced; null = synced, none found. */
  sleep?: SleepNight | null
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
        archive = { version: VERSION, days: parsed.days as Record<string, DayRecord> }
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

export function mergeValues(date: string, values: DayValues): void {
  Object.assign(dayRecord(date).values, values)
  scheduleSave()
}

export function setSleep(date: string, night: SleepNight | null): void {
  dayRecord(date).sleep = night
  scheduleSave()
}

export function setWorkouts(date: string, workouts: Workout[]): void {
  dayRecord(date).workouts = workouts
  scheduleSave()
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

/** Refresh: keep values (views stay populated) but force the next query to refetch. */
export function markAllStale(): void {
  for (const record of Object.values(load().days)) record.fetched = {}
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
