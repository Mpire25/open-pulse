// Thin client for the Google Health API v4 (https://health.googleapis.com).
// Endpoint shapes are taken from the published discovery document:
//   https://health.googleapis.com/$discovery/rest?version=v4
//
// All reads are anchored to civil (device-local) time, so a "day" here means
// the day as the tracker experienced it, regardless of this machine's zone.

const BASE = 'https://health.googleapis.com/v4'

export class HealthApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

// ---------------------------------------------------------------------------
// Request scheduler
//
// The v4 API rate-limits aggressively, so requests are spaced client-side.
// The queue is priority-ordered: the numbers on screen (selected-day data)
// jump ahead of history backfills instead of waiting behind them.

/** 0 = selected-day essentials, 1 = short trend windows, 2 = long history. */
export type Priority = 0 | 1 | 2

const SPACING_MS = 225

interface Waiter {
  priority: Priority
  seq: number
  resolve: () => void
  reject: (error: Error) => void
  signal?: AbortSignal
  onAbort?: () => void
}

let seq = 0
let nextSlotAt = 0
let slotTimer: NodeJS.Timeout | null = null
const waiters: Waiter[] = []

function abortError(): Error {
  return new DOMException('The request was cancelled.', 'AbortError')
}

function waitFor(delay: number, signal?: AbortSignal | null): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError())
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, delay)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(abortError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function acquireSlot(priority: Priority, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError())
  return new Promise((resolve, reject) => {
    const waiter: Waiter = { priority, seq: seq++, resolve, reject, signal }
    if (signal) {
      waiter.onAbort = () => {
        const index = waiters.indexOf(waiter)
        if (index >= 0) waiters.splice(index, 1)
        reject(abortError())
      }
      signal.addEventListener('abort', waiter.onAbort, { once: true })
    }
    waiters.push(waiter)
    waiters.sort((a, b) => a.priority - b.priority || a.seq - b.seq)
    pumpQueue()
  })
}

function pumpQueue(): void {
  if (slotTimer || waiters.length === 0) return
  slotTimer = setTimeout(
    () => {
      slotTimer = null
      const next = waiters.shift()
      if (!next) return
      if (next.signal && next.onAbort) next.signal.removeEventListener('abort', next.onAbort)
      nextSlotAt = Date.now() + SPACING_MS
      next.resolve()
      pumpQueue()
    },
    Math.max(0, nextSlotAt - Date.now())
  )
}

// In-flight counter so the renderer can show a live sync indicator.
let pendingCount = 0
let activityListener: ((pending: number) => void) | null = null

export function setApiActivityListener(listener: (pending: number) => void): void {
  activityListener = listener
}

function bumpPending(delta: number): void {
  pendingCount = Math.max(0, pendingCount + delta)
  activityListener?.(pendingCount)
}

async function requestResponse(
  token: string,
  path: string,
  init?: RequestInit,
  priority: Priority = 1
): Promise<Response> {
  bumpPending(1)
  try {
    for (let retry = 0; ; retry++) {
      await acquireSlot(priority, init?.signal ?? undefined)
      const resp = await fetch(`${BASE}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          ...init?.headers
        }
      })
      if (resp.status === 429 && retry < 2) {
        const retryAfter = Number(resp.headers.get('retry-after'))
        const delay =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(30_000, retryAfter * 1000)
            : Math.min(30_000, 1100 * 2 ** retry)
        await waitFor(delay, init?.signal)
        continue
      }
      if (!resp.ok) {
        throw new HealthApiError(resp.status, `Health API ${path} failed (${resp.status}): ${await resp.text()}`)
      }
      return resp
    }
  } finally {
    bumpPending(-1)
  }
}

async function request<T>(token: string, path: string, init?: RequestInit, priority: Priority = 1): Promise<T> {
  const response = await requestResponse(token, path, init, priority)
  return (await response.json()) as T
}

// ---------------------------------------------------------------------------
// Civil date plumbing

interface ApiDate {
  year: number
  month: number
  day: number
}

export interface CivilDateTime {
  date?: ApiDate
  time?: { hours?: number; minutes?: number; seconds?: number }
}

function toApiDate(isoDate: string): ApiDate {
  const [year, month, day] = isoDate.split('-').map(Number)
  return { year, month, day }
}

export function shiftIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days, 12)).toISOString().slice(0, 10)
}

// Although the schema describes a closed-open interval, the current v4
// endpoint expects the final civil day at 23:59:59 rather than the following
// day at midnight.
function civilDateTime(isoDate: string, endOfDay = false): CivilDateTime {
  return {
    date: toApiDate(isoDate),
    time: endOfDay ? { hours: 23, minutes: 59, seconds: 59 } : { hours: 0, minutes: 0, seconds: 0 }
  }
}

export function dateFromCivil(value?: CivilDateTime | ApiDate | null): string | null {
  const date = (value as CivilDateTime)?.date ?? (value as ApiDate)
  if (!date?.year || !date.month || !date.day) return null
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
}

export function minuteFromCivil(value?: CivilDateTime | null): number | null {
  const time = value?.time
  if (typeof time?.hours !== 'number') return null
  return time.hours * 60 + (time.minutes ?? 0) + (time.seconds ?? 0) / 60
}

// ---------------------------------------------------------------------------
// Endpoints

export interface RollupPoint {
  civilStartTime?: CivilDateTime
  startTime?: string
  endTime?: string
  [key: string]: unknown
}

const SHORT_ROLLUP_DATA_TYPES = new Set([
  'calories-in-heart-rate-zone',
  'heart-rate',
  'active-minutes',
  'total-calories'
])

function maxRollupRangeDays(dataType: string): number {
  return SHORT_ROLLUP_DATA_TYPES.has(dataType) ? 14 : 90
}

const ROLLUP_VALUE_FIELDS: Record<string, string> = {
  steps: 'steps/countSum',
  'total-calories': 'totalCalories/kcalSum',
  distance: 'distance/millimetersSum',
  floors: 'floors/countSum',
  'active-minutes': 'activeMinutes/activeMinutesRollupByActivityLevel',
  'active-zone-minutes': 'activeZoneMinutes',
  'sedentary-period': 'sedentaryPeriod/durationSum',
  weight: 'weight/weightGramsAvg',
  'body-fat': 'bodyFat/bodyFatPercentageAvg',
  'hydration-log': 'hydrationLog/amountConsumed/millilitersSum',
  'nutrition-log': 'nutritionLog',
  'time-in-heart-rate-zone': 'timeInHeartRateZone/timeInHeartRateZones',
  'calories-in-heart-rate-zone': 'caloriesInHeartRateZone/caloriesInHeartRateZones',
  'active-energy-burned': 'activeEnergyBurned/kcalSum'
}

const DATA_POINT_FIELDS: Record<string, string> = {
  steps: 'steps',
  'heart-rate': 'heartRate',
  sleep: 'sleep',
  exercise: 'dataPointName,exercise',
  'daily-resting-heart-rate': 'dailyRestingHeartRate',
  'daily-heart-rate-variability': 'dailyHeartRateVariability',
  'daily-oxygen-saturation': 'dailyOxygenSaturation',
  'daily-respiratory-rate': 'dailyRespiratoryRate',
  'daily-sleep-temperature-derivations': 'dailySleepTemperatureDerivations',
  'daily-heart-rate-zones': 'dailyHeartRateZones'
}

const RAW_DATA_POINT_FIELDS: Record<string, string> = {
  'nutrition-log': 'name,nutritionLog',
  weight: 'name,weight',
  height: 'height'
}

function withFields(path: string, fields: string): string {
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}${new URLSearchParams({ fields })}`
}

/**
 * Daily rollup for a data type over a closed civil date range
 * (`startDate`..`endDateExclusive`, YYYY-MM-DD).
 */
export async function dailyRollUp(
  token: string,
  dataType: string,
  startDate: string,
  endDateExclusive: string,
  priority: Priority = 1,
  signal?: AbortSignal
): Promise<RollupPoint[]> {
  const points: RollupPoint[] = []
  const maxDays = maxRollupRangeDays(dataType)

  // The API rejects rollup ranges longer than 90 days (14 for a few data
  // types), even when the user has less data than that in the interval.
  for (let chunkStart = startDate; chunkStart < endDateExclusive; ) {
    const candidateEnd = shiftIsoDate(chunkStart, maxDays)
    const chunkEndExclusive = candidateEnd < endDateExclusive ? candidateEnd : endDateExclusive
    const body = {
      range: {
        start: civilDateTime(chunkStart),
        end: civilDateTime(shiftIsoDate(chunkEndExclusive, -1), true)
      },
      windowSizeDays: 1,
      pageSize: maxDays
    }
    const json = await request<{ rollupDataPoints?: RollupPoint[] }>(
      token,
      withFields(
        `/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`,
        `rollupDataPoints(civilStartTime,${ROLLUP_VALUE_FIELDS[dataType] ?? dataType.replaceAll('-', '')})`
      ),
      { method: 'POST', body: JSON.stringify(body), signal },
      priority
    )
    points.push(...(json.rollupDataPoints ?? []))
    chunkStart = chunkEndExclusive
  }

  return points
}

/**
 * Roll up a data type over physical-time windows. Unlike dailyRollUp this can
 * expose the shape of a selected day, including derived types such as total
 * calories that do not support listing individual data points.
 */
export async function physicalRollUp(
  token: string,
  dataType: string,
  startTime: string,
  endTime: string,
  windowSeconds: number,
  dataSourceFamily: 'all-sources' | 'google-wearables' = 'all-sources',
  priority: Priority = 1,
  signal?: AbortSignal
): Promise<RollupPoint[]> {
  const points: RollupPoint[] = []
  const pageSize = Math.min(10_000, Math.ceil((Date.parse(endTime) - Date.parse(startTime)) / (windowSeconds * 1000)))
  let pageToken = ''

  do {
    const body = {
      range: { startTime, endTime },
      windowSize: `${windowSeconds}s`,
      pageSize,
      dataSourceFamily: `users/me/dataSourceFamilies/${dataSourceFamily}`,
      ...(pageToken ? { pageToken } : {})
    }
    const json = await request<{ rollupDataPoints?: RollupPoint[]; nextPageToken?: string }>(
      token,
      withFields(
        `/users/me/dataTypes/${dataType}/dataPoints:rollUp`,
        `nextPageToken,rollupDataPoints(startTime,${ROLLUP_VALUE_FIELDS[dataType] ?? dataType.replaceAll('-', '')})`
      ),
      { method: 'POST', body: JSON.stringify(body), signal },
      priority
    )
    points.push(...(json.rollupDataPoints ?? []))
    pageToken = json.nextPageToken ?? ''
  } while (pageToken)

  return points
}

export interface RawDataPoint {
  name?: string
  dataPointName?: string
  [key: string]: unknown
}

/** Export a recorded exercise as TCX. Partial data keeps non-GPS trackpoints
 * available for exercises where only heart rate or altitude was recorded. */
export async function exportExerciseTcx(token: string, workoutName: string, signal?: AbortSignal): Promise<string> {
  const fullName = workoutName.startsWith('users/')
    ? workoutName
    : `users/me/dataTypes/exercise/dataPoints/${encodeURIComponent(workoutName)}`
  if (!/^users\/[^/]+\/dataTypes\/exercise\/dataPoints\/[^/?#:]+$/.test(fullName)) {
    throw new HealthApiError(400, 'Invalid exercise resource name')
  }
  const response = await requestResponse(
    token,
    `/${fullName}:exportExerciseTcx?alt=media&partialData=true`,
    { signal },
    0
  )
  return response.text()
}

/** How a data type's points are keyed, which decides the AIP-160 filter shape. */
export type RecordKind = 'daily' | 'sample' | 'interval' | 'session' | 'sleep'

function dataFilter(dataType: string, kind: RecordKind, startDate: string, endDateExclusive: string): string {
  const field = dataType.replaceAll('-', '_')
  switch (kind) {
    case 'daily':
      return `${field}.date >= "${startDate}" AND ${field}.date < "${endDateExclusive}"`
    case 'sleep':
      return `sleep.interval.civil_end_time >= "${startDate}" AND sleep.interval.civil_end_time < "${endDateExclusive}"`
    case 'sample':
      return `${field}.sample_time.civil_time >= "${startDate}" AND ${field}.sample_time.civil_time < "${endDateExclusive}"`
    default:
      return `${field}.interval.civil_start_time >= "${startDate}" AND ${field}.interval.civil_start_time < "${endDateExclusive}"`
  }
}

/**
 * Lists data points for a type over a civil date range. Uses the reconcile
 * endpoint so points from multiple sources (watch + phone) are deduplicated
 * within the requested data-source family.
 */
export async function listData(
  token: string,
  dataType: string,
  kind: RecordKind,
  startDate: string,
  endDateExclusive: string,
  dataSourceFamily: 'all-sources' | 'google-wearables' = 'all-sources',
  priority: Priority = 1,
  signal?: AbortSignal,
  responseFields?: string
): Promise<RawDataPoint[]> {
  const params = new URLSearchParams({
    filter: dataFilter(dataType, kind, startDate, endDateExclusive),
    pageSize: kind === 'sleep' || kind === 'session' ? '25' : '10000',
    dataSourceFamily: `users/me/dataSourceFamilies/${dataSourceFamily}`,
    fields: `nextPageToken,dataPoints(${responseFields ?? DATA_POINT_FIELDS[dataType] ?? dataType.replaceAll('-', '')})`
  })
  const points: RawDataPoint[] = []
  let pageToken = ''
  let pages = 0
  do {
    if (pageToken) params.set('pageToken', pageToken)
    const json = await request<{ dataPoints?: RawDataPoint[]; nextPageToken?: string }>(
      token,
      `/users/me/dataTypes/${dataType}/dataPoints:reconcile?${params}`,
      { signal },
      priority
    )
    points.push(...(json.dataPoints ?? []))
    pageToken = json.nextPageToken ?? ''
    pages++
  } while (pageToken && pages < 50)
  return points
}

/**
 * Lists identifiable raw records without reconciling them into a sensor
 * stream. User-entered logs such as food, weight, and body fat retain their
 * resource IDs and metadata through this endpoint.
 */
export async function listRawData(
  token: string,
  dataType: string,
  kind: RecordKind,
  startDate: string,
  endDateExclusive: string,
  priority: Priority = 1,
  signal?: AbortSignal,
  responseFields?: string
): Promise<RawDataPoint[]> {
  const params = new URLSearchParams({
    filter: dataFilter(dataType, kind, startDate, endDateExclusive),
    pageSize: kind === 'sleep' || kind === 'session' ? '25' : '10000',
    fields: `nextPageToken,dataPoints(${responseFields ?? RAW_DATA_POINT_FIELDS[dataType] ?? dataType.replaceAll('-', '')})`
  })
  const points: RawDataPoint[] = []
  let pageToken = ''
  let pages = 0
  do {
    if (pageToken) params.set('pageToken', pageToken)
    const json = await request<{ dataPoints?: RawDataPoint[]; nextPageToken?: string }>(
      token,
      `/users/me/dataTypes/${dataType}/dataPoints?${params}`,
      { signal },
      priority
    )
    points.push(...(json.dataPoints ?? []))
    pageToken = json.nextPageToken ?? ''
    pages++
  } while (pageToken && pages < 50)
  return points
}

export interface ApiPairedDevice {
  name?: string
  displayName?: string
  model?: string
  deviceType?: string
  deviceVersion?: string
  batteryStatus?: string
  batteryLevel?: number
  batteryLevelPercentage?: number
  lastSyncTime?: string
  features?: string[]
  [key: string]: unknown
}

export async function listPairedDevices(token: string, signal?: AbortSignal): Promise<ApiPairedDevice[]> {
  const json = await request<{ pairedDevices?: ApiPairedDevice[] }>(
    token,
    '/users/me/pairedDevices?pageSize=100&fields=pairedDevices(deviceType,batteryStatus,batteryLevel,lastSyncTime,deviceVersion,features)',
    { signal },
    0
  )
  return json.pairedDevices ?? []
}

export async function getProfile(token: string): Promise<Record<string, unknown>> {
  return request(token, '/users/me/profile')
}
