import type {
  HeartDetailPoint,
  HeartDetailResult,
  HeartDetailStat,
  HeartZoneDetail
} from '../shared/types'
import type { CivilDateTime, RawDataPoint, RollupPoint } from './health-api'

export interface HeartDetailBounds {
  startTime: string
  observedEndTime: string
  dayEndTime: string
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function durationMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const match = value.match(/^(-?\d+(?:\.\d+)?)s$/)
  return match ? Number(match[1]) / 60 : null
}

function sampleTime(record: Record<string, unknown>): { physicalTime?: string; civilTime?: CivilDateTime } | undefined {
  return record.sampleTime as { physicalTime?: string; civilTime?: CivilDateTime } | undefined
}

function sampleTimestamp(record: Record<string, unknown>): number | null {
  const time = sampleTime(record)
  if (time?.physicalTime) return Date.parse(time.physicalTime)
  const date = time?.civilTime?.date
  const clock = time?.civilTime?.time
  if (!date?.year || !date.month || !date.day) return null
  return new Date(
    date.year,
    date.month - 1,
    date.day,
    clock?.hours ?? 0,
    clock?.minutes ?? 0,
    clock?.seconds ?? 0
  ).getTime()
}

function bucketSamples(
  samples: Array<{ timestamp: number; value: number }>,
  bounds: HeartDetailBounds,
  windowMinutes: number
): HeartDetailPoint[] {
  const startMs = Date.parse(bounds.startTime)
  const observedEndMs = Date.parse(bounds.observedEndTime)
  const dayEndMs = Date.parse(bounds.dayEndTime)
  const windowMs = windowMinutes * 60_000
  const buckets = new Map<number, number[]>()
  for (const sample of samples) {
    const index = Math.floor((sample.timestamp - startMs) / windowMs)
    if (index < 0) continue
    const values = buckets.get(index) ?? []
    values.push(sample.value)
    buckets.set(index, values)
  }

  return Array.from({ length: Math.ceil((dayEndMs - startMs) / windowMs) }, (_, index) => {
    const windowStart = startMs + index * windowMs
    const date = new Date(windowStart)
    const values = buckets.get(index)
    return {
      minute: date.getHours() * 60 + date.getMinutes(),
      value:
        windowStart < observedEndMs && values?.length
          ? values.reduce((sum, value) => sum + value, 0) / values.length
          : null
    }
  })
}

function stat(
  key: string,
  label: string,
  value: unknown,
  unit?: string,
  digits = 1
): HeartDetailStat | null {
  const number = numberValue(value)
  if (number == null) return null
  return { key, label, value: number.toFixed(digits).replace(/\.0$/, ''), unit }
}

function present(stats: Array<HeartDetailStat | null>): HeartDetailStat[] {
  return stats.filter((item): item is HeartDetailStat => item != null)
}

function enumLabel(value: unknown): string | null {
  if (typeof value !== 'string' || value.endsWith('_UNSPECIFIED')) return null
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function parseVo2Detail(
  date: string,
  samples: RawDataPoint[],
  daily: RawDataPoint[],
  bounds: HeartDetailBounds,
  windowMinutes: number
): HeartDetailResult {
  const observations = samples.flatMap((point) => {
    const record = point.vo2Max as Record<string, unknown> | undefined
    if (!record) return []
    const timestamp = sampleTimestamp(record)
    const value = numberValue(record.vo2Max)
    return timestamp != null && value != null ? [{ timestamp, value }] : []
  })
  const dailyRecord = daily[0]?.dailyVo2Max as Record<string, unknown> | undefined
  const latestSample = samples
    .map((point) => point.vo2Max as Record<string, unknown> | undefined)
    .find((record) => record != null)
  const cardioLevel = enumLabel(dailyRecord?.cardioFitnessLevel)
  const method = enumLabel(latestSample?.measurementMethod)
  return {
    date,
    source: 'live',
    metric: 'vo2Max',
    windowMinutes,
    points: bucketSamples(observations, bounds, windowMinutes),
    sampleLabel: 'VO₂ max',
    sampleUnit: 'ml/kg/min',
    stats: [
      ...(cardioLevel ? [{ key: 'fitness', label: 'Fitness level', value: cardioLevel }] : []),
      ...(typeof dailyRecord?.estimated === 'boolean'
        ? [{ key: 'estimate', label: 'Reading type', value: dailyRecord.estimated ? 'Estimated' : 'Measured' }]
        : []),
      ...present([stat('covariance', 'Estimate covariance', dailyRecord?.vo2MaxCovariance, undefined, 2)]),
      ...(method ? [{ key: 'method', label: 'Measurement method', value: method }] : [])
    ],
    zones: []
  }
}

const ZONE_KEYS: Record<string, HeartZoneDetail['zone']> = {
  LIGHT: 'light',
  MODERATE: 'moderate',
  VIGOROUS: 'vigorous',
  PEAK: 'peak'
}

export function parseHeartZones(
  date: string,
  dailyZones: RawDataPoint[],
  timeRollups: RollupPoint[],
  calorieRollups: RollupPoint[]
): HeartDetailResult {
  const thresholds =
    ((dailyZones[0]?.dailyHeartRateZones as { heartRateZones?: Array<Record<string, unknown>> } | undefined)
      ?.heartRateZones ?? [])
  const times = timeRollups.flatMap(
    (point) =>
      (point.timeInHeartRateZone as { timeInHeartRateZones?: Array<Record<string, unknown>> } | undefined)
        ?.timeInHeartRateZones ?? []
  )
  const calories = calorieRollups.flatMap(
    (point) =>
      (point.caloriesInHeartRateZone as { caloriesInHeartRateZones?: Array<Record<string, unknown>> } | undefined)
        ?.caloriesInHeartRateZones ?? []
  )

  const zones = Object.entries(ZONE_KEYS).map(([apiZone, zone]) => {
    const threshold = thresholds.find((item) => item.heartRateZoneType === apiZone)
    const duration = times.find((item) => item.heartRateZone === apiZone)
    const energy = calories.find((item) => item.heartRateZone === apiZone)
    return {
      zone,
      minBpm: numberValue(threshold?.minBeatsPerMinute),
      maxBpm: numberValue(threshold?.maxBeatsPerMinute),
      durationMin: durationMinutes(duration?.duration),
      calories: numberValue(energy?.kcal)
    }
  })

  return {
    date,
    source: 'live',
    metric: 'restingHeartRate',
    windowMinutes: 30,
    points: [],
    stats: [],
    zones
  }
}
