// Thin client for the Google Health API v4 (https://health.googleapis.com).
// Endpoint shapes are taken from the published discovery document:
//   https://health.googleapis.com/$discovery/rest?version=v4

const BASE = 'https://health.googleapis.com/v4'

export class HealthApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

async function request<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...init?.headers
    }
  })
  if (!resp.ok) {
    throw new HealthApiError(resp.status, `Health API ${path} failed (${resp.status}): ${await resp.text()}`)
  }
  return (await resp.json()) as T
}

interface ApiDate {
  year: number
  month: number
  day: number
}

function toApiDate(isoDate: string): ApiDate {
  const [year, month, day] = isoDate.split('-').map(Number)
  return { year, month, day }
}

export interface RollupPoint {
  civilStartTime?: { date?: ApiDate }
  steps?: { countSum?: string }
  distance?: { distanceSumMeters?: number; sumMeters?: number }
  activeZoneMinutes?: { activeZoneMinutesSum?: string; minutesSum?: string }
  activeEnergyBurned?: { energySum?: { kilocalories?: number } }
  floors?: { floorsSum?: string; countSum?: string }
  heartRate?: { beatsPerMinuteAvg?: number; beatsPerMinuteMin?: number; beatsPerMinuteMax?: number }
  [key: string]: unknown
}

/**
 * Daily rollup for a data type over a closed-open civil date range.
 * `startDate`/`endDate` are YYYY-MM-DD; end is exclusive.
 */
export async function dailyRollUp(
  token: string,
  dataType: string,
  startDate: string,
  endDate: string
): Promise<RollupPoint[]> {
  const body = {
    range: { start: { date: toApiDate(startDate) }, end: { date: toApiDate(endDate) } }
  }
  const json = await request<{ rollupDataPoints?: RollupPoint[] }>(
    token,
    `/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`,
    { method: 'POST', body: JSON.stringify(body) }
  )
  return json.rollupDataPoints ?? []
}

export interface RawDataPoint {
  name?: string
  [key: string]: unknown
}

/**
 * Lists granular data points for a data type, filtered to a physical time range
 * (AIP-160 filter, as documented on the list method).
 */
export async function listDataPoints(
  token: string,
  dataType: string,
  startIso: string,
  endIso: string,
  pageSize = 1440
): Promise<RawDataPoint[]> {
  const filter = encodeURIComponent(`startTime >= "${startIso}" AND endTime < "${endIso}"`)
  const points: RawDataPoint[] = []
  let pageToken = ''
  do {
    const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
    const json = await request<{ dataPoints?: RawDataPoint[]; nextPageToken?: string }>(
      token,
      `/users/me/dataTypes/${dataType}/dataPoints?filter=${filter}&pageSize=${pageSize}${tokenParam}`
    )
    points.push(...(json.dataPoints ?? []))
    pageToken = json.nextPageToken ?? ''
  } while (pageToken && points.length < 10_000)
  return points
}

export interface ApiPairedDevice {
  name?: string
  displayName?: string
  model?: string
  batteryLevelPercentage?: number
  lastSyncTime?: string
  [key: string]: unknown
}

export async function listPairedDevices(token: string): Promise<ApiPairedDevice[]> {
  const json = await request<{ pairedDevices?: ApiPairedDevice[] }>(token, '/users/me/pairedDevices')
  return json.pairedDevices ?? []
}

export async function getProfile(token: string): Promise<Record<string, unknown>> {
  return request(token, '/users/me/profile')
}
