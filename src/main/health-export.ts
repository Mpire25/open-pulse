import { rename, rm, writeFile } from 'node:fs/promises'
import type { IntradayScope } from '../shared/types'
import type { HealthExportOptions, HealthExportProgress } from '../shared/health-export'
import { shiftIsoDate } from './health-api'
import {
  getBodyMeasurements,
  getDevices,
  getIntraday,
  getNutritionLogRange,
  getSeries,
  getSleepRange,
  getWorkoutsRange,
  type SyncOptions
} from './health-service'
import { buildHealthExport, type HealthExportIntradayDay } from './health-export-format'

// An export is long backfill: it reads everything current, but never ahead of
// what the user is looking at in the app.
const EXPORT_SYNC: SyncOptions = { mode: 'await', priority: 2 }
const INTRADAY_PRIORITY = 2
// Requests are paced globally; this only keeps the queue fed.
const INTRADAY_CONCURRENCY = 4

function localIsoDate(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

async function readIntraday(
  start: string,
  end: string,
  scope: IntradayScope,
  signal: AbortSignal,
  onProgress: (progress: HealthExportProgress) => void
): Promise<HealthExportIntradayDay[]> {
  const dates: string[] = []
  for (let date = start; date <= end; date = shiftIsoDate(date, 1)) dates.push(date)
  const days: HealthExportIntradayDay[] = new Array(dates.length)
  let next = 0
  let done = 0
  onProgress({ phase: 'intraday', done, total: dates.length })
  const worker = async (): Promise<void> => {
    while (next < dates.length) {
      const index = next++
      const snapshot = await getIntraday(dates[index], false, signal, scope, INTRADAY_PRIORITY)
      days[index] = { date: snapshot.date, stepsHourly: snapshot.stepsHourly, heartRate: snapshot.heartRate }
      onProgress({ phase: 'intraday', done: ++done, total: dates.length })
    }
  }
  await Promise.all(Array.from({ length: Math.min(INTRADAY_CONCURRENCY, dates.length) }, worker))
  return days
}

/** Reads the range (cache first, Google for anything stale) and writes one JSON file. */
export async function exportHealthData(
  options: HealthExportOptions,
  path: string,
  signal: AbortSignal,
  onProgress: (progress: HealthExportProgress) => void
): Promise<number> {
  const { start, end, metrics, sections, fullHeartRate } = options
  const has = (section: HealthExportOptions['sections'][number]): boolean => sections.includes(section)
  // Nutrition and body logs are optional extras; losing one shouldn't lose the
  // export, but the file says so rather than implying nothing was logged.
  const warnings: string[] = []
  const optional = async <T>(section: string, read: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await read()
    } catch (error) {
      if (signal.aborted) throw error
      console.error(`[export] ${section} failed:`, error)
      warnings.push(`${section} could not be read from Google Health for this export, so that section is empty.`)
      return fallback
    }
  }

  // Only what was asked for is read, so a narrow export never waits on the
  // day-by-day intraday fetch.
  onProgress({ phase: 'daily' })
  const [devices, series] = await Promise.all([
    getDevices(false, signal),
    metrics.length ? getSeries(metrics, start, end, false, signal, EXPORT_SYNC) : null
  ])
  if (has('sleepSessions')) onProgress({ phase: 'sleep' })
  const sleep = has('sleepSessions') ? await getSleepRange(start, end, false, signal, EXPORT_SYNC) : null
  if (has('workouts')) onProgress({ phase: 'workouts' })
  const workouts = has('workouts') ? await getWorkoutsRange(start, end, false, signal, EXPORT_SYNC) : null
  if (has('nutritionLogs')) onProgress({ phase: 'nutrition' })
  const nutrition = has('nutritionLogs')
    ? await optional('Nutrition logs', () => getNutritionLogRange(start, end, signal), [])
    : undefined
  if (has('bodyMeasurements')) onProgress({ phase: 'body' })
  const body = has('bodyMeasurements')
    ? await optional('Body measurements', () => getBodyMeasurements(start, end, signal), null)
    : undefined
  const intraday = has('hourly') || fullHeartRate
    ? await readIntraday(start, end, has('hourly') ? 'both' : 'heart', signal, onProgress)
    : undefined

  onProgress({ phase: 'writing' })
  const document = buildHealthExport({
    start,
    end,
    today: localIsoDate(new Date()),
    exportedAt: new Date(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    metrics,
    sections,
    fullHeartRate,
    devices,
    daily: series?.days,
    sleep: sleep?.days,
    workouts: workouts?.workouts,
    nutrition,
    body,
    intraday,
    warnings
  })
  const json = JSON.stringify(document)
  signal.throwIfAborted()
  // Write beside the target and rename, so a failure never leaves half a file.
  const temporary = `${path}.${process.pid}.partial`
  try {
    await writeFile(temporary, json, { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, path)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
  return Buffer.byteLength(json)
}
