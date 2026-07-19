import { METRIC_KEYS } from './types'
import { NUTRITION_VALUE_KEYS } from './nutrition'
import type {
  AssistantAction,
  AssistantComparisonAggregation,
  AssistantComparisonValue,
  AssistantDataView,
  AssistantMetricRange,
  AssistantOverviewAggregation,
  AssistantOverviewMetric,
  AssistantNutritionScope,
  AssistantNutritionValues,
  AssistantSleepNight,
  AssistantVisualPart,
  DataSource,
  MetricKey,
  Workout
} from './types'

const DATA_VIEWS = ['activity', 'heart', 'sleep', 'body', 'nutrition'] as const
const METRIC_RANGES = ['D', 'W', 'M', '3M', 'Y'] as const

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function text(value: unknown, max = 160): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null
}

function numberOrNull(value: unknown): number | null | undefined {
  return value === null ? null : typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function date(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null
}

function metric(value: unknown): MetricKey | null {
  return typeof value === 'string' && METRIC_KEYS.includes(value as MetricKey) ? (value as MetricKey) : null
}

function source(value: unknown): DataSource | null {
  return value === 'live' ? value : null
}

function workout(value: unknown): Workout | null {
  const item = record(value)
  const id = text(item?.id, 200)
  const name = text(item?.name, 100)
  const startTime = text(item?.startTime, 80)
  const durationMin = numberOrNull(item?.durationMin)
  if (!item || !id || !name || !startTime || durationMin == null) return null
  const nullable = (key: string): number | null => numberOrNull(item[key]) ?? null
  return {
    id,
    name,
    startTime,
    durationMin,
    calories: nullable('calories'),
    distanceKm: nullable('distanceKm'),
    avgHeartRate: nullable('avgHeartRate'),
    steps: nullable('steps'),
    activeZoneMinutes: nullable('activeZoneMinutes')
  }
}

function action(value: unknown): AssistantAction | null {
  const item = record(value)
  if (item?.type === 'open-metric') {
    const selectedMetric = metric(item.metric)
    const selectedDate = date(item.date)
    if (
      !selectedMetric ||
      !selectedDate ||
      !DATA_VIEWS.includes(item.view as (typeof DATA_VIEWS)[number]) ||
      !METRIC_RANGES.includes(item.range as (typeof METRIC_RANGES)[number])
    ) {
      return null
    }
    return {
      type: 'open-metric',
      view: item.view as AssistantDataView,
      metric: selectedMetric,
      date: selectedDate,
      range: item.range as AssistantMetricRange
    }
  }
  if (item?.type === 'open-workout') {
    const selectedWorkout = workout(item.workout)
    const selectedDate = date(item.date)
    return selectedWorkout && selectedDate
      ? { type: 'open-workout', workout: selectedWorkout, date: selectedDate }
      : null
  }
  if (item?.type === 'open-sleep-stages') {
    const selectedDate = date(item.date)
    return selectedDate ? { type: 'open-sleep-stages', date: selectedDate } : null
  }
  if (item?.type === 'open-nutrition') {
    const selectedDate = date(item.date)
    return selectedDate ? { type: 'open-nutrition', date: selectedDate } : null
  }
  return null
}

function nutritionValues(value: unknown): AssistantNutritionValues | null {
  const item = record(value)
  if (!item) return null
  const result = {} as AssistantNutritionValues
  for (const key of NUTRITION_VALUE_KEYS) {
    const amount = numberOrNull(item[key])
    if (amount === undefined || (typeof amount === 'number' && amount < 0)) return null
    result[key] = amount
  }
  return Object.values(result).some((amount) => amount != null) ? result : null
}

const SLEEP_STAGES = ['AWAKE', 'LIGHT', 'DEEP', 'REM'] as const

function timestamp(value: unknown): string | null {
  const selected = text(value, 80)
  return selected && !Number.isNaN(Date.parse(selected)) ? selected : null
}

function sleepNight(value: unknown): AssistantSleepNight | null {
  const item = record(value)
  const selectedDate = date(item?.date)
  const startTime = timestamp(item?.startTime)
  const endTime = timestamp(item?.endTime)
  const minutesAsleep = numberOrNull(item?.minutesAsleep)
  const minutesInSleepPeriod = numberOrNull(item?.minutesInSleepPeriod)
  const efficiency = numberOrNull(item?.efficiency)
  if (
    !item ||
    !selectedDate ||
    !startTime ||
    !endTime ||
    minutesAsleep == null ||
    minutesInSleepPeriod == null ||
    efficiency === undefined ||
    minutesAsleep < 0 ||
    minutesInSleepPeriod < 0 ||
    (efficiency != null && (efficiency < 0 || efficiency > 100))
  ) return null

  const stages = Array.isArray(item.stages)
    ? item.stages.slice(0, 512).flatMap((candidate): AssistantSleepNight['stages'] => {
        const stage = record(candidate)
        const type = SLEEP_STAGES.find((candidate) => candidate === stage?.type)
        const stageStart = timestamp(stage?.startTime)
        const stageEnd = timestamp(stage?.endTime)
        return type && stageStart && stageEnd && stageStart < stageEnd
          ? [{ type, startTime: stageStart, endTime: stageEnd }]
          : []
      })
    : []
  if (!stages.length) return null

  const rawStageMinutes = record(item.stageMinutes)
  const stageMinutes: AssistantSleepNight['stageMinutes'] = {}
  for (const type of SLEEP_STAGES) {
    const amount = numberOrNull(rawStageMinutes?.[type])
    if (typeof amount === 'number' && amount >= 0) stageMinutes[type] = amount
  }
  return {
    date: selectedDate,
    startTime,
    endTime,
    minutesAsleep,
    minutesInSleepPeriod,
    efficiency,
    stages,
    stageMinutes
  }
}

const COMPARISON_AGGREGATIONS = ['value', 'total', 'average', 'latest'] as const
const LEGACY_TOTAL_METRICS = new Set<MetricKey>([
  'steps',
  'distanceKm',
  'floors',
  'caloriesOut',
  'activeMinutes',
  'activeZoneMinutes',
  'waterMl',
  'caloriesIn',
  'proteinG',
  'carbsG',
  'fatG',
  'fiberG',
  'saturatedFatG',
  'sodiumG',
  'sugarG'
])
const LEGACY_LATEST_METRICS = new Set<MetricKey>(['weightKg', 'bodyFatPct', 'bmi'])

function comparisonValue(value: unknown, selectedMetric: MetricKey): AssistantComparisonValue | null {
  const item = record(value)
  const label = text(item?.label, 60)
  const startDate = date(item?.startDate)
  const endDate = date(item?.endDate)
  const selectedValue = numberOrNull(item?.value)
  if (
    !item ||
    !label ||
    !startDate ||
    !endDate ||
    selectedValue === undefined ||
    typeof item.observations !== 'number' ||
    typeof item.days !== 'number'
  ) {
    return null
  }
  const days = Math.max(1, Math.floor(item.days))
  const aggregation = COMPARISON_AGGREGATIONS.includes(item.aggregation as AssistantComparisonAggregation)
    ? item.aggregation as AssistantComparisonAggregation
    : days === 1
      ? 'value'
      : LEGACY_LATEST_METRICS.has(selectedMetric)
        ? 'latest'
        : LEGACY_TOTAL_METRICS.has(selectedMetric)
          ? 'total'
          : 'average'
  return {
    label,
    startDate,
    endDate,
    value: selectedValue,
    aggregation,
    observations: Math.max(0, Math.floor(item.observations)),
    days
  }
}

function comparableValues(current: AssistantComparisonValue, previous: AssistantComparisonValue): boolean {
  if (current.aggregation !== 'total' && previous.aggregation !== 'total') return true
  if (current.aggregation === 'total' && previous.aggregation === 'total') return current.days === previous.days
  const total = current.aggregation === 'total' ? current : previous
  const other = current.aggregation === 'total' ? previous : current
  return total.days === 1 && (
    other.aggregation === 'average' || (other.days === 1 && other.aggregation === 'value')
  )
}

const OVERVIEW_AGGREGATIONS = ['average', 'total', 'latest'] as const

function chartPoints(value: unknown): Array<{ date: string; value: number | null }> {
  if (!Array.isArray(value)) return []
  return value.slice(0, 180).flatMap((point): Array<{ date: string; value: number | null }> => {
    const pointRecord = record(point)
    const pointDate = date(pointRecord?.date)
    const pointValue = numberOrNull(pointRecord?.value)
    return pointDate && pointValue !== undefined ? [{ date: pointDate, value: pointValue }] : []
  })
}

function overviewMetric(value: unknown): AssistantOverviewMetric | null {
  const item = record(value)
  const selectedMetric = metric(item?.metric)
  const selectedValue = numberOrNull(item?.value)
  const selectedAction = action(item?.action)
  const points = chartPoints(item?.points)
  if (
    !item ||
    !selectedMetric ||
    selectedValue === undefined ||
    !selectedAction ||
    !points.length ||
    !OVERVIEW_AGGREGATIONS.includes(item.aggregation as AssistantOverviewAggregation) ||
    typeof item.observations !== 'number' ||
    typeof item.days !== 'number'
  ) {
    return null
  }
  return {
    metric: selectedMetric,
    value: selectedValue,
    aggregation: item.aggregation as AssistantOverviewAggregation,
    observations: Math.max(0, Math.floor(item.observations)),
    days: Math.max(1, Math.floor(item.days)),
    points,
    action: selectedAction
  }
}

export function normalizeAssistantParts(value: unknown): AssistantVisualPart[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 8).flatMap((candidate): AssistantVisualPart[] => {
    const item = record(candidate)
    const id = text(item?.id, 120)
    if (!item || !id) return []

    if (item.type === 'overview') {
      const title = text(item.title, 100)
      const startDate = date(item.startDate)
      const endDate = date(item.endDate)
      const selectedSource = source(item.source)
      const items = Array.isArray(item.items)
        ? item.items.slice(0, 4).flatMap((candidate): AssistantOverviewMetric[] => {
            const selected = overviewMetric(candidate)
            return selected ? [selected] : []
          })
        : []
      return title && startDate && endDate && selectedSource && items.length >= 2
        ? [{ id, type: 'overview', title, startDate, endDate, items, source: selectedSource }]
        : []
    }

    if (item.type === 'metric-card') {
      const selectedMetric = metric(item.metric)
      const selectedDate = date(item.date)
      const selectedValue = numberOrNull(item.value)
      const selectedSource = source(item.source)
      const selectedAction = action(item.action)
      return selectedMetric && selectedDate && selectedValue !== undefined && selectedSource && selectedAction
        ? [{ id, type: 'metric-card', metric: selectedMetric, date: selectedDate, value: selectedValue, source: selectedSource, action: selectedAction }]
        : []
    }

    if (item.type === 'comparison') {
      const selectedMetric = metric(item.metric)
      if (!selectedMetric) return []
      const current = comparisonValue(item.current, selectedMetric)
      const previous = comparisonValue(item.previous, selectedMetric)
      const absoluteChange = numberOrNull(item.absoluteChange)
      const percentChange = numberOrNull(item.percentChange)
      const selectedSource = source(item.source)
      const selectedAction = action(item.action)
      const title = text(item.title, 100)
      const comparable = current && previous ? comparableValues(current, previous) : false
      return current && previous && absoluteChange !== undefined && percentChange !== undefined && selectedSource && selectedAction && title
        ? [{
            id,
            type: 'comparison',
            title,
            metric: selectedMetric,
            current,
            previous,
            comparable,
            absoluteChange: comparable ? absoluteChange : null,
            percentChange: comparable ? percentChange : null,
            source: selectedSource,
            action: selectedAction
          }]
        : []
    }

    if (item.type === 'trend-chart') {
      const selectedMetric = metric(item.metric)
      const startDate = date(item.startDate)
      const endDate = date(item.endDate)
      const selectedSource = source(item.source)
      const selectedAction = action(item.action)
      const title = text(item.title, 100)
      if (!selectedMetric || !startDate || !endDate || !selectedSource || !selectedAction || !title || !Array.isArray(item.points)) return []
      const points = chartPoints(item.points)
      if (!points.length || typeof item.observations !== 'number') return []
      return [{ id, type: 'trend-chart', title, metric: selectedMetric, startDate, endDate, points, observations: Math.max(0, Math.floor(item.observations)), source: selectedSource, action: selectedAction }]
    }

    if (item.type === 'workout-card') {
      const selectedWorkout = workout(item.workout)
      const selectedDate = date(item.date)
      const selectedSource = source(item.source)
      const selectedAction = action(item.action)
      return selectedWorkout && selectedDate && selectedSource && selectedAction
        ? [{ id, type: 'workout-card', workout: selectedWorkout, date: selectedDate, source: selectedSource, action: selectedAction }]
        : []
    }

    if (item.type === 'sleep-card') {
      const night = sleepNight(item.night)
      const selectedSource = source(item.source)
      const selectedAction = action(item.action)
      return night && selectedSource && selectedAction?.type === 'open-sleep-stages' && selectedAction.date === night.date
        ? [{ id, type: 'sleep-card', night, source: selectedSource, action: selectedAction }]
        : []
    }

    if (item.type === 'nutrition-card') {
      if (!('time' in item) || !('servingLabel' in item) || !('itemCount' in item) || !Array.isArray(item.itemNames)) {
        return []
      }
      const scope = ['day', 'meal', 'item'].includes(item.scope as string)
        ? item.scope as AssistantNutritionScope
        : null
      const title = text(item.title, 100)
      const selectedDate = date(item.date)
      const time = item.time === null ? null : timestamp(item.time)
      const servingLabel = item.servingLabel === null ? null : text(item.servingLabel, 120)
      const itemCount = numberOrNull(item.itemCount)
      const itemNames = Array.isArray(item.itemNames)
        ? item.itemNames.slice(0, 4).flatMap((name) => {
            const selected = text(name, 100)
            return selected ? [selected] : []
          })
        : []
      const values = nutritionValues(item.values)
      const selectedSource = source(item.source)
      const selectedAction = action(item.action)
      return scope && title && selectedDate && time !== undefined && servingLabel !== undefined &&
        itemCount !== undefined && (itemCount === null || itemCount >= 0) && values && selectedSource &&
        selectedAction?.type === 'open-nutrition' && selectedAction.date === selectedDate
        ? [{
            id,
            type: 'nutrition-card',
            scope,
            title,
            date: selectedDate,
            time,
            servingLabel,
            itemCount: itemCount === null ? null : Math.floor(itemCount),
            itemNames,
            values,
            source: selectedSource,
            action: selectedAction
          }]
        : []
    }

    return []
  })
}

export function assistantPartsContext(parts: AssistantVisualPart[]): string {
  if (!parts.length) return ''
  const summaries = parts.flatMap((part): string[] => {
    if (part.type === 'overview') return [`Displayed an overview of ${part.items.map((item) => item.metric).join(', ')} for ${part.startDate}–${part.endDate}.`]
    if (part.type === 'metric-card') return [`Displayed ${part.metric} for ${part.date}: ${part.value ?? 'missing'}.`]
    if (part.type === 'comparison') return [`Displayed a ${part.metric} comparison for ${part.current.startDate}–${part.current.endDate} versus ${part.previous.startDate}–${part.previous.endDate}.`]
    if (part.type === 'trend-chart') return [`Displayed a ${part.metric} trend for ${part.startDate}–${part.endDate}.`]
    if (part.type === 'workout-card') return [`Displayed workout ${part.workout.name} on ${part.date}.`]
    if (part.type === 'sleep-card') return [`Displayed sleep stages for ${part.night.date}.`]
    if (part.type === 'nutrition-card') return [`Displayed ${part.scope} nutrition for ${part.date}.`]
    return []
  })
  return summaries.length ? `\n\n[OpenPulse display context: ${summaries.join(' ')}]` : ''
}
