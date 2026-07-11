import type {
  HeartDetailResult,
  HeartZoneDetail
} from '../shared/types'
import type { RawDataPoint, RollupPoint } from './health-api'

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
