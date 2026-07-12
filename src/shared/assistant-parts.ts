import { METRIC_KEYS } from './types'
import type {
  AssistantAction,
  AssistantComparisonValue,
  AssistantDataView,
  AssistantMetricRange,
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
  return value === 'live' || value === 'demo' ? value : null
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
  return null
}

function comparisonValue(value: unknown): AssistantComparisonValue | null {
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
  return {
    label,
    startDate,
    endDate,
    value: selectedValue,
    observations: Math.max(0, Math.floor(item.observations)),
    days: Math.max(1, Math.floor(item.days))
  }
}

export function normalizeAssistantParts(value: unknown): AssistantVisualPart[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 8).flatMap((candidate): AssistantVisualPart[] => {
    const item = record(candidate)
    const id = text(item?.id, 120)
    if (!item || !id) return []

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
      const current = comparisonValue(item.current)
      const previous = comparisonValue(item.previous)
      const absoluteChange = numberOrNull(item.absoluteChange)
      const percentChange = numberOrNull(item.percentChange)
      const selectedSource = source(item.source)
      const selectedAction = action(item.action)
      const title = text(item.title, 100)
      return selectedMetric && current && previous && absoluteChange !== undefined && percentChange !== undefined && selectedSource && selectedAction && title
        ? [{ id, type: 'comparison', title, metric: selectedMetric, current, previous, absoluteChange, percentChange, source: selectedSource, action: selectedAction }]
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
      const points = item.points.slice(0, 180).flatMap((point): Array<{ date: string; value: number | null }> => {
        const pointRecord = record(point)
        const pointDate = date(pointRecord?.date)
        const pointValue = numberOrNull(pointRecord?.value)
        return pointDate && pointValue !== undefined ? [{ date: pointDate, value: pointValue }] : []
      })
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

    return []
  })
}

export function assistantPartsContext(parts: AssistantVisualPart[]): string {
  if (!parts.length) return ''
  const summaries = parts.flatMap((part): string[] => {
    if (part.type === 'metric-card') return [`Displayed ${part.metric} for ${part.date}: ${part.value ?? 'missing'}.`]
    if (part.type === 'comparison') return [`Displayed a ${part.metric} comparison for ${part.current.startDate}–${part.current.endDate} versus ${part.previous.startDate}–${part.previous.endDate}.`]
    if (part.type === 'trend-chart') return [`Displayed a ${part.metric} trend for ${part.startDate}–${part.endDate}.`]
    if (part.type === 'workout-card') return [`Displayed workout ${part.workout.name} on ${part.date}.`]
    return []
  })
  return summaries.length ? `\n\n[OpenPulse display context: ${summaries.join(' ')}]` : ''
}
