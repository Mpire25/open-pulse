import { rename, rm, writeFile } from 'node:fs/promises'
import type { HeartRatePoint, IntradayScope, Workout } from '../shared/types'
import type { HealthExportOptions, HealthExportProgress } from '../shared/health-export'
import { HealthApiError, shiftIsoDate } from './health-api'
import {
  getBodyMeasurements,
  getDevices,
  getIntraday,
  getNutritionLogRange,
  getSeries,
  getSleepRange,
  getWorkoutHeartRateFor,
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
): Promise<{ days: HealthExportIntradayDay[]; failedDates: string[] }> {
  const dates: string[] = []
  for (let date = start; date <= end; date = shiftIsoDate(date, 1)) dates.push(date)
  const days: HealthExportIntradayDay[] = new Array(dates.length)
  const failedDates: string[] = []
  // The first failure stops every worker, so a failed export stops asking Google.
  signal.throwIfAborted()
  const stop = new AbortController()
  const forward = (): void => stop.abort(signal.reason)
  signal.addEventListener('abort', forward, { once: true })
  let next = 0
  let done = 0
  onProgress({ phase: 'intraday', done, total: dates.length })
  const worker = async (): Promise<void> => {
    while (next < dates.length && !stop.signal.aborted) {
      const index = next++
      try {
        const snapshot = await getIntraday(dates[index], false, stop.signal, scope, INTRADAY_PRIORITY)
        days[index] = { date: snapshot.date, stepsHourly: snapshot.stepsHourly, heartRate: snapshot.heartRate }
        if (snapshot.failed?.length) failedDates.push(snapshot.date)
      } catch (error) {
        stop.abort(error)
        throw error
      }
      if (!stop.signal.aborted) onProgress({ phase: 'intraday', done: ++done, total: dates.length })
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(INTRADAY_CONCURRENCY, dates.length) }, worker))
  } finally {
    signal.removeEventListener('abort', forward)
  }
  signal.throwIfAborted()
  return { days, failedDates: failedDates.sort() }
}

/**
 * Each workout's own heart-rate series. The first failure stops the rest, so a
 * failing export stops asking Google; what was read is kept.
 */
async function readWorkoutHeartRate(
  workouts: Workout[],
  signal: AbortSignal,
  onProgress: (progress: HealthExportProgress) => void
): Promise<{ series: Record<string, HeartRatePoint[]>; unread: number }> {
  const series: Record<string, HeartRatePoint[]> = {}
  let next = 0
  let done = 0
  let failed = false
  onProgress({ phase: 'workoutHeartRate', done, total: workouts.length })
  const worker = async (): Promise<void> => {
    while (next < workouts.length && !failed) {
      const workout = workouts[next++]
      try {
        series[workout.id] = await getWorkoutHeartRateFor(workout, signal, INTRADAY_PRIORITY)
      } catch (error) {
        if (signal.aborted) throw error
        // Google refusing one workout's range isn't a reason to stop the rest.
        if (error instanceof HealthApiError && [400, 404].includes(error.status)) {
          console.warn('[export] workout heart rate rejected for one workout:', error)
          onProgress({ phase: 'workoutHeartRate', done: ++done, total: workouts.length })
          continue
        }
        console.error('[export] workout heart rate failed:', error)
        failed = true
        return
      }
      onProgress({ phase: 'workoutHeartRate', done: ++done, total: workouts.length })
    }
  }
  await Promise.all(Array.from({ length: Math.min(INTRADAY_CONCURRENCY, workouts.length) }, worker))
  signal.throwIfAborted()
  return { series, unread: workouts.length - Object.keys(series).length }
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
  // Detail sections are optional extras; losing one shouldn't lose the export,
  // but the file says so rather than implying nothing was recorded.
  const warnings: string[] = []
  const optional = async <T>(section: string, read: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await read()
    } catch (error) {
      if (signal.aborted) throw error
      console.error(`[export] ${section} failed:`, error)
      warnings.push(`${section} could not be read from Google Health for this export, so that part is empty.`)
      return fallback
    }
  }

  // Only what was asked for is read, so a narrow export never waits on the
  // day-by-day intraday fetch.
  // Read now: if the export runs past midnight, the last day was still read while partial.
  const today = localIsoDate(new Date())
  onProgress({ phase: 'daily' })
  const [devices, series] = await Promise.all([
    optional('Devices', () => getDevices(false, signal), []),
    metrics.length ? getSeries(metrics, start, end, false, signal, EXPORT_SYNC) : null
  ])
  if (has('sleepSessions')) onProgress({ phase: 'sleep' })
  const sleep = has('sleepSessions')
    ? await optional('Sleep sessions', () => getSleepRange(start, end, false, signal, EXPORT_SYNC), null)
    : null
  if (has('workouts')) onProgress({ phase: 'workouts' })
  const workouts = has('workouts')
    ? await optional('Workouts', () => getWorkoutsRange(start, end, false, signal, EXPORT_SYNC), null)
    : null
  if (has('nutritionLogs')) onProgress({ phase: 'nutrition' })
  const nutrition = has('nutritionLogs')
    ? await optional('Nutrition logs', () => getNutritionLogRange(start, end, signal), [])
    : undefined
  if (has('bodyMeasurements')) onProgress({ phase: 'body' })
  const body = has('bodyMeasurements')
    ? await optional('Body measurements', () => getBodyMeasurements(start, end, signal), null)
    : undefined
  const workoutHeartRate = fullHeartRate && workouts?.workouts.length
    ? await readWorkoutHeartRate(workouts.workouts, signal, onProgress)
    : undefined
  const intraday = has('hourly') || fullHeartRate
    ? await readIntraday(start, end, has('hourly') ? 'both' : 'heart', signal, onProgress)
    : undefined
  const partly = (section: string): string =>
    `${section} could not be fully read from Google Health for this export, so some of it may be missing rather than unrecorded.`
  if (series?.failedMetrics?.length) warnings.push(partly(`Daily ${series.failedMetrics.join(', ')}`))
  if (sleep?.failed) warnings.push(partly('Sleep sessions'))
  if (workouts?.failed) warnings.push(partly('Workouts'))
  if (body?.failed) warnings.push(partly('Body measurements'))
  if (workoutHeartRate?.unread) {
    const count = workoutHeartRate.unread
    warnings.push(`Heart rate could not be read from Google Health for ${count} workout${count === 1 ? '' : 's'}, so ${count === 1 ? 'its' : 'their'} heartRate is missing rather than unrecorded.`)
  }
  if (intraday?.failedDates.length) {
    const { failedDates } = intraday
    const listed = failedDates.length <= 10 ? failedDates.join(', ') : `${failedDates.slice(0, 10).join(', ')} and ${failedDates.length - 10} more`
    warnings.push(`Intraday data could not be read from Google Health for ${listed}, so those days may be missing or partial rather than empty.`)
  }

  onProgress({ phase: 'writing' })
  const document = buildHealthExport({
    start,
    end,
    today,
    exportedAt: new Date(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    metrics,
    sections,
    fullHeartRate,
    devices,
    daily: series?.days,
    sleep: sleep?.days,
    workouts: workouts?.workouts,
    workoutHeartRate: workoutHeartRate?.series,
    nutrition,
    body,
    intraday: intraday?.days,
    warnings,
    provisionalSleepDates: sleep?.provisionalDates
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
