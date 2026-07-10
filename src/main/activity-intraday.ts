import type {
  ActivityIntradayBreakdown,
  ActivityIntradayMetric,
  ActivityIntradayPoint
} from '../shared/types'
import type { RollupPoint } from './health-api'

interface ActiveMinuteLevel {
  activityLevel?: string
  activeMinutesSum?: string | number
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

function activeMinuteLevels(point: RollupPoint): ActiveMinuteLevel[] {
  return (
    point.activeMinutes as { activeMinutesRollupByActivityLevel?: ActiveMinuteLevel[] } | undefined
  )?.activeMinutesRollupByActivityLevel ?? []
}

function levelValue(levels: ActiveMinuteLevel[], name: string): number {
  return numberValue(levels.find((level) => level.activityLevel === name)?.activeMinutesSum) ?? 0
}

export function activityRollupValue(metric: ActivityIntradayMetric, point: RollupPoint): number | null {
  switch (metric) {
    case 'distanceKm': {
      const millimeters = numberValue((point.distance as { millimetersSum?: unknown } | undefined)?.millimetersSum)
      return millimeters == null ? null : millimeters / 1_000_000
    }
    case 'caloriesOut':
      return numberValue((point.totalCalories as { kcalSum?: unknown } | undefined)?.kcalSum)
    case 'floors':
      return numberValue((point.floors as { countSum?: unknown } | undefined)?.countSum)
    case 'activeMinutes': {
      const levels = activeMinuteLevels(point)
      if (levels.length === 0) return null
      return levelValue(levels, 'MODERATE') + levelValue(levels, 'VIGOROUS')
    }
    case 'activeZoneMinutes': {
      const zones = point.activeZoneMinutes as
        | { sumInFatBurnHeartZone?: unknown; sumInCardioHeartZone?: unknown; sumInPeakHeartZone?: unknown }
        | undefined
      if (!zones) return null
      return (
        (numberValue(zones.sumInFatBurnHeartZone) ?? 0) +
        (numberValue(zones.sumInCardioHeartZone) ?? 0) +
        (numberValue(zones.sumInPeakHeartZone) ?? 0)
      )
    }
    case 'sedentaryMinutes':
      return durationMinutes((point.sedentaryPeriod as { durationSum?: unknown } | undefined)?.durationSum)
  }
}

export function activityRollupBreakdown(
  metric: ActivityIntradayMetric,
  points: RollupPoint[]
): ActivityIntradayBreakdown[] {
  if (metric === 'activeMinutes') {
    const totals = { light: 0, moderate: 0, vigorous: 0 }
    for (const point of points) {
      const levels = activeMinuteLevels(point)
      totals.light += levelValue(levels, 'LIGHT')
      totals.moderate += levelValue(levels, 'MODERATE')
      totals.vigorous += levelValue(levels, 'VIGOROUS')
    }
    return Object.entries(totals).map(([key, value]) => ({
      key: key as ActivityIntradayBreakdown['key'],
      value,
      unit: 'min'
    }))
  }

  if (metric === 'activeZoneMinutes') {
    const totals = { fatBurn: 0, cardio: 0, peak: 0 }
    for (const point of points) {
      const zones = point.activeZoneMinutes as
        | { sumInFatBurnHeartZone?: unknown; sumInCardioHeartZone?: unknown; sumInPeakHeartZone?: unknown }
        | undefined
      totals.fatBurn += numberValue(zones?.sumInFatBurnHeartZone) ?? 0
      totals.cardio += numberValue(zones?.sumInCardioHeartZone) ?? 0
      totals.peak += numberValue(zones?.sumInPeakHeartZone) ?? 0
    }
    return Object.entries(totals).map(([key, value]) => ({
      key: key as ActivityIntradayBreakdown['key'],
      value,
      unit: 'min'
    }))
  }

  return []
}

export function calorieEnergyBreakdown(
  totalPoints: RollupPoint[],
  activeEnergyPoints: RollupPoint[]
): ActivityIntradayBreakdown[] {
  const total = totalPoints.reduce(
    (sum, point) => sum + (numberValue((point.totalCalories as { kcalSum?: unknown } | undefined)?.kcalSum) ?? 0),
    0
  )
  const active = activeEnergyPoints.reduce(
    (sum, point) =>
      sum + (numberValue((point.activeEnergyBurned as { kcalSum?: unknown } | undefined)?.kcalSum) ?? 0),
    0
  )
  if (total === 0 && active === 0) return []
  return [
    { key: 'activeEnergy', value: active, unit: 'kcal' },
    { key: 'basalEnergy', value: Math.max(0, total - active), unit: 'kcal' }
  ]
}

export function activityRollupPoints(
  metric: ActivityIntradayMetric,
  points: RollupPoint[],
  dayStartTime: string,
  observedEndTime: string,
  dayEndTime: string,
  windowMinutes: number
): ActivityIntradayPoint[] {
  const startMs = Date.parse(dayStartTime)
  const observedEndMs = Date.parse(observedEndTime)
  const dayEndMs = Date.parse(dayEndTime)
  const windowMs = windowMinutes * 60_000
  const byWindow = new Map<number, RollupPoint>()

  for (const point of points) {
    if (!point.startTime) continue
    const index = Math.floor((Date.parse(point.startTime) - startMs) / windowMs)
    if (index >= 0) byWindow.set(index, point)
  }

  const windowCount = Math.ceil((dayEndMs - startMs) / windowMs)
  return Array.from({ length: windowCount }, (_, index) => {
    const windowStartMs = startMs + index * windowMs
    const start = new Date(windowStartMs)
    const point = byWindow.get(index)
    return {
      minute: start.getHours() * 60 + start.getMinutes(),
      // Google omits windows with no rollup value. For elapsed activity time,
      // that is displayed consistently with Steps as zero. Future windows are
      // kept empty rather than claiming the user recorded no activity yet.
      value: windowStartMs < observedEndMs ? (point ? activityRollupValue(metric, point) : null) ?? 0 : null
    }
  })
}
