import type { BodyMeasurement, NutritionLogEntry } from '../shared/types'
import type { RawDataPoint } from './health-api'
import { gramsFromNutrientNode, nutrientGrams } from './nutrition'

function numberValue(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function resourceId(point: RawDataPoint, fallback: string): string {
  return point.name ?? point.dataPointName ?? fallback
}

function servingLabel(value: unknown): string | null {
  const serving = record(value)
  if (!serving) return null
  const amount = numberValue(serving.amount)
  const unit = typeof serving.foodMeasurementUnitDisplayName === 'string'
    ? serving.foodMeasurementUnitDisplayName
    : null
  if (amount == null && !unit) return null
  if (amount == null) return unit
  if (!unit) return String(amount)
  return `${amount} ${unit}${amount === 1 ? '' : 's'}`
}

export function parseNutritionLogs(points: RawDataPoint[]): NutritionLogEntry[] {
  return points
    .flatMap((point, index) => {
      const log = record(point.nutritionLog)
      const interval = record(log?.interval)
      const startTime = typeof interval?.startTime === 'string' ? interval.startTime : null
      if (!log || !startTime) return []
      const endTime = typeof interval?.endTime === 'string' ? interval.endTime : startTime
      const foodName = typeof log.foodDisplayName === 'string' && log.foodDisplayName.trim()
        ? log.foodDisplayName.trim()
        : 'Logged food'
      return [{
        id: resourceId(point, `${startTime}-${index}`),
        startTime,
        endTime,
        foodName,
        mealType: typeof log.mealType === 'string' ? log.mealType : null,
        servingLabel: servingLabel(log.serving),
        calories: numberValue(record(log.energy)?.kcal),
        proteinG: nutrientGrams(log, ['protein']),
        carbsG: gramsFromNutrientNode(log.totalCarbohydrate)
          ?? nutrientGrams(log, ['carbohydrates', 'carbohydrate']),
        fatG: gramsFromNutrientNode(log.totalFat) ?? nutrientGrams(log, ['fat', 'totalFat']),
        fiberG: nutrientGrams(log, ['dietaryFiber', 'fiber', 'fibre'])
      }]
    })
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
}

interface PartialMeasurement extends BodyMeasurement {
  timestamp: number
}

export function parseBodyMeasurements(
  weightPoints: RawDataPoint[],
  bodyFatPoints: RawDataPoint[]
): BodyMeasurement[] {
  const measurements: PartialMeasurement[] = weightPoints.flatMap((point, index) => {
    const weight = record(point.weight)
    const sampleTime = record(weight?.sampleTime)
    const time = typeof sampleTime?.physicalTime === 'string' ? sampleTime.physicalTime : null
    const grams = numberValue(weight?.weightGrams)
    if (!weight || !time || grams == null) return []
    return [{
      id: resourceId(point, `weight-${time}-${index}`),
      time,
      timestamp: Date.parse(time),
      weightKg: +(grams / 1000).toFixed(2),
      bodyFatPct: null,
      notes: typeof weight.notes === 'string' && weight.notes.trim() ? weight.notes.trim() : null
    }]
  })

  for (const [index, point] of bodyFatPoints.entries()) {
    const bodyFat = record(point.bodyFat)
    const sampleTime = record(bodyFat?.sampleTime)
    const time = typeof sampleTime?.physicalTime === 'string' ? sampleTime.physicalTime : null
    const percentage = numberValue(bodyFat?.percentage)
    if (!bodyFat || !time || percentage == null) continue
    const timestamp = Date.parse(time)
    const nearest = measurements
      .filter((measurement) => Math.abs(measurement.timestamp - timestamp) <= 10 * 60_000)
      .sort((a, b) => Math.abs(a.timestamp - timestamp) - Math.abs(b.timestamp - timestamp))[0]
    if (nearest) {
      nearest.bodyFatPct = percentage
      nearest.id = `${nearest.id}|${resourceId(point, `body-fat-${time}-${index}`)}`
    } else {
      measurements.push({
        id: resourceId(point, `body-fat-${time}-${index}`),
        time,
        timestamp,
        weightKg: null,
        bodyFatPct: percentage,
        notes: null
      })
    }
  }

  return measurements
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(({ timestamp: _timestamp, ...measurement }) => measurement)
}
