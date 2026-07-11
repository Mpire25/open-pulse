import type { BodyMeasurement, DayValues, NutritionLogEntry } from '../shared/types'
import { dateFromCivil, type CivilDateTime, type RawDataPoint } from './health-api'
import { gramsFromNutrientNode, nutrientGrams, nutrientMineralGrams } from './nutrition'

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
        fiberG: nutrientGrams(log, ['dietaryFiber', 'fiber', 'fibre']),
        saturatedFatG: nutrientGrams(log, ['saturatedFat']),
        sodiumG: nutrientMineralGrams(log, ['sodium']),
        sugarG: nutrientGrams(log, ['sugar', 'sugars'])
      }]
    })
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
}

export function nutritionLogDate(point: RawDataPoint): string | null {
  const log = record(point.nutritionLog)
  const interval = record(log?.interval)
  const startTime = typeof interval?.startTime === 'string' ? interval.startTime : null
  return dateFromCivil(interval?.civilStartTime as CivilDateTime | undefined)
    ?? (startTime && /^\d{4}-\d{2}-\d{2}/.test(startTime) ? startTime.slice(0, 10) : null)
}

/** Daily totals recovered from raw food logs when Google's rollup omits nutrients. */
export function parseNutritionLogTotals(points: RawDataPoint[]): Map<string, DayValues> {
  const totals = new Map<string, DayValues>()
  for (const point of points) {
    const log = record(point.nutritionLog)
    const date = nutritionLogDate(point)
    const entry = parseNutritionLogs([point])[0]
    if (!date || !entry) continue

    const day = totals.get(date) ?? {}
    const add = (key: keyof DayValues, value: number | null): void => {
      if (value != null) day[key] = (day[key] ?? 0) + value
    }
    add('caloriesIn', entry.calories)
    add('proteinG', entry.proteinG)
    add('carbsG', entry.carbsG)
    add('fatG', entry.fatG)
    add('fiberG', entry.fiberG)
    add('saturatedFatG', entry.saturatedFatG)
    add('sodiumG', entry.sodiumG)
    add('sugarG', entry.sugarG)
    totals.set(date, day)
  }
  return totals
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

/** Latest valid height record, normalized from millimetres to centimetres. */
export function parseLatestHeight(points: RawDataPoint[]): number | null {
  const heights = points.flatMap((point) => {
    const height = record(point.height)
    const sampleTime = record(height?.sampleTime)
    const time = typeof sampleTime?.physicalTime === 'string' ? sampleTime.physicalTime : null
    const millimeters = numberValue(height?.heightMillimeters)
    return time && millimeters != null && millimeters > 0
      ? [{ time: Date.parse(time), centimeters: millimeters / 10 }]
      : []
  })
  const latest = heights.sort((a, b) => b.time - a.time)[0]
  return latest ? +latest.centimeters.toFixed(1) : null
}

export function bmiFrom(weightKg: number | null, heightCm: number | null): number | null {
  if (weightKg == null || heightCm == null || weightKg <= 0 || heightCm <= 0) return null
  const heightM = heightCm / 100
  return +(weightKg / (heightM * heightM)).toFixed(1)
}
