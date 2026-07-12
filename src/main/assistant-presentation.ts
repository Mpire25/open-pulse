import { randomUUID } from 'node:crypto'
import { METRIC_KEYS } from '../shared/types'
import type {
  AssistantAction,
  AssistantComparisonValue,
  AssistantDataView,
  AssistantMetricRange,
  AssistantVisualPart,
  DataSource,
  MetricKey,
  Workout
} from '../shared/types'
import type { AgentToolSpec } from './health-agent-tools'
import { shiftIsoDate } from './health-api'

export interface AgentDataset {
  tool: string
  data: unknown
}

const DATE_SCHEMA = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }
const DATASET_ID = { type: 'string', minLength: 1, maxLength: 200 }
const METRIC = { type: 'string', enum: METRIC_KEYS }

export const PRESENTATION_TOOL: AgentToolSpec = {
  type: 'function',
  name: 'present_health_data',
  description:
    'Display trusted OpenPulse cards and charts from datasets returned by query_daily_metrics or query_workouts. Use this after reading data when a visual makes the answer easier to understand: a metric card for one exact value, a comparison for two periods, a chart for a trend, or a workout card for one workout. Keep the response focused: normally 1-2 blocks, never more than 4. The app computes all values and navigation; never copy values into this call. All four arrays are required and may be empty.',
  strict: true,
  parameters: {
    type: 'object',
    properties: {
      metricCards: {
        type: 'array',
        maxItems: 2,
        items: {
          type: 'object',
          properties: { datasetId: DATASET_ID, metric: METRIC, date: DATE_SCHEMA },
          required: ['datasetId', 'metric', 'date'],
          additionalProperties: false
        }
      },
      comparisons: {
        type: 'array',
        maxItems: 2,
        items: {
          type: 'object',
          properties: {
            datasetId: DATASET_ID,
            metric: METRIC,
            title: { type: 'string', minLength: 1, maxLength: 100 },
            currentLabel: { type: 'string', minLength: 1, maxLength: 40 },
            currentStartDate: DATE_SCHEMA,
            currentEndDate: DATE_SCHEMA,
            previousLabel: { type: 'string', minLength: 1, maxLength: 40 },
            previousStartDate: DATE_SCHEMA,
            previousEndDate: DATE_SCHEMA
          },
          required: [
            'datasetId',
            'metric',
            'title',
            'currentLabel',
            'currentStartDate',
            'currentEndDate',
            'previousLabel',
            'previousStartDate',
            'previousEndDate'
          ],
          additionalProperties: false
        }
      },
      charts: {
        type: 'array',
        maxItems: 2,
        items: {
          type: 'object',
          properties: { datasetId: DATASET_ID, metric: METRIC, title: { type: 'string', minLength: 1, maxLength: 100 } },
          required: ['datasetId', 'metric', 'title'],
          additionalProperties: false
        }
      },
      workouts: {
        type: 'array',
        maxItems: 2,
        items: {
          type: 'object',
          properties: { datasetId: DATASET_ID, workoutId: { type: 'string', minLength: 1, maxLength: 200 } },
          required: ['datasetId', 'workoutId'],
          additionalProperties: false
        }
      }
    },
    required: ['metricCards', 'comparisons', 'charts', 'workouts'],
    additionalProperties: false
  }
}

const SUM_METRICS = new Set<MetricKey>([
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
const LAST_METRICS = new Set<MetricKey>(['weightKg', 'bodyFatPct', 'bmi'])

const VIEW_BY_METRIC: Record<MetricKey, AssistantDataView> = {
  steps: 'activity',
  distanceKm: 'activity',
  floors: 'activity',
  caloriesOut: 'activity',
  activeMinutes: 'activity',
  activeZoneMinutes: 'activity',
  sedentaryMinutes: 'activity',
  restingHeartRate: 'heart',
  hrvMs: 'heart',
  spo2Pct: 'heart',
  breathingRate: 'heart',
  skinTempDeltaC: 'heart',
  sleepMinutes: 'sleep',
  sleepEfficiency: 'sleep',
  weightKg: 'body',
  bodyFatPct: 'body',
  bmi: 'body',
  waterMl: 'nutrition',
  caloriesIn: 'nutrition',
  proteinG: 'nutrition',
  carbsG: 'nutrition',
  fatG: 'nutrition',
  fiberG: 'nutrition',
  saturatedFatG: 'nutrition',
  sodiumG: 'nutrition',
  sugarG: 'nutrition'
}

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function requiredText(value: unknown, field: string, max = 120): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required.`)
  return value.trim().slice(0, max)
}

function requiredDate(value: unknown, field: string): string {
  const date = requiredText(value, field, 10)
  const parsed = new Date(`${date}T12:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`${field} must be a valid YYYY-MM-DD date.`)
  }
  return date
}

function requiredMetric(value: unknown): MetricKey {
  if (typeof value !== 'string' || !METRIC_KEYS.includes(value as MetricKey)) {
    throw new Error('The presentation requested an unsupported metric.')
  }
  return value as MetricKey
}

function rangeDays(start: string, end: string): number {
  if (start > end) throw new Error('A presentation range starts after it ends.')
  let days = 1
  for (let date = start; date < end; date = shiftIsoDate(date, 1)) days++
  return days
}

function rangeForDays(days: number): AssistantMetricRange {
  if (days <= 1) return 'D'
  if (days <= 7) return 'W'
  if (days <= 31) return 'M'
  if (days <= 92) return '3M'
  return 'Y'
}

function metricAction(metric: MetricKey, date: string, days: number): AssistantAction {
  return { type: 'open-metric', view: VIEW_BY_METRIC[metric], metric, date, range: rangeForDays(days) }
}

interface DailyDataset {
  source: DataSource
  start: string
  end: string
  days: Record<string, Record<string, number | null>>
}

function dailyDataset(datasetId: string, datasets: Map<string, AgentDataset>): DailyDataset {
  const dataset = datasets.get(datasetId)
  const data = record(dataset?.data)
  const requestedRange = record(data?.requestedRange)
  if (dataset?.tool !== 'query_daily_metrics' || !data || !requestedRange || !record(data.days)) {
    throw new Error(`Dataset ${datasetId} is not daily metric data.`)
  }
  const source = data.source === 'demo' ? 'demo' : data.source === 'live' ? 'live' : null
  const start = requiredDate(requestedRange.start, 'dataset start')
  const end = requiredDate(requestedRange.end, 'dataset end')
  if (!source) throw new Error(`Dataset ${datasetId} has no valid source.`)
  return { source, start, end, days: data.days as DailyDataset['days'] }
}

function ensureWithin(dataset: DailyDataset, start: string, end: string): void {
  if (start < dataset.start || end > dataset.end) throw new Error('The requested visual falls outside its dataset range.')
}

function metricValues(dataset: DailyDataset, metric: MetricKey, start: string, end: string): Array<{ date: string; value: number | null }> {
  ensureWithin(dataset, start, end)
  const points: Array<{ date: string; value: number | null }> = []
  for (let date = start; date <= end; date = shiftIsoDate(date, 1)) {
    const value = dataset.days[date]?.[metric]
    points.push({ date, value: typeof value === 'number' && Number.isFinite(value) ? value : null })
  }
  return points
}

function aggregate(metric: MetricKey, points: Array<{ value: number | null }>): number | null {
  const values = points.flatMap((point) => (point.value == null ? [] : [point.value]))
  if (!values.length) return null
  if (LAST_METRICS.has(metric)) return values[values.length - 1]
  const total = values.reduce((sum, value) => sum + value, 0)
  return SUM_METRICS.has(metric) ? total : total / values.length
}

function comparisonValue(
  dataset: DailyDataset,
  metric: MetricKey,
  label: string,
  startDate: string,
  endDate: string
): AssistantComparisonValue {
  const points = metricValues(dataset, metric, startDate, endDate)
  return {
    label,
    startDate,
    endDate,
    value: aggregate(metric, points),
    observations: points.filter((point) => point.value != null).length,
    days: points.length
  }
}

function workoutDataset(datasetId: string, datasets: Map<string, AgentDataset>): { source: DataSource; workouts: Workout[] } {
  const dataset = datasets.get(datasetId)
  const data = record(dataset?.data)
  if (dataset?.tool !== 'query_workouts' || !data || !Array.isArray(data.workouts)) {
    throw new Error(`Dataset ${datasetId} is not workout data.`)
  }
  const source = data.source === 'demo' ? 'demo' : data.source === 'live' ? 'live' : null
  if (!source) throw new Error(`Dataset ${datasetId} has no valid source.`)
  return { source, workouts: data.workouts as Workout[] }
}

export function resolvePresentation(
  args: Record<string, unknown>,
  datasets: Map<string, AgentDataset>
): AssistantVisualPart[] {
  const parts: AssistantVisualPart[] = []

  for (const raw of list(args.metricCards).slice(0, 2)) {
    const item = record(raw)
    const datasetId = requiredText(item?.datasetId, 'datasetId', 200)
    const metric = requiredMetric(item?.metric)
    const date = requiredDate(item?.date, 'date')
    const dataset = dailyDataset(datasetId, datasets)
    const point = metricValues(dataset, metric, date, date)[0]
    parts.push({
      id: randomUUID(),
      type: 'metric-card',
      metric,
      date,
      value: point.value,
      source: dataset.source,
      action: metricAction(metric, date, 1)
    })
  }

  for (const raw of list(args.comparisons).slice(0, 2)) {
    const item = record(raw)
    const datasetId = requiredText(item?.datasetId, 'datasetId', 200)
    const metric = requiredMetric(item?.metric)
    const title = requiredText(item?.title, 'title', 100)
    const currentStart = requiredDate(item?.currentStartDate, 'currentStartDate')
    const currentEnd = requiredDate(item?.currentEndDate, 'currentEndDate')
    const previousStart = requiredDate(item?.previousStartDate, 'previousStartDate')
    const previousEnd = requiredDate(item?.previousEndDate, 'previousEndDate')
    const dataset = dailyDataset(datasetId, datasets)
    const current = comparisonValue(dataset, metric, requiredText(item?.currentLabel, 'currentLabel', 40), currentStart, currentEnd)
    const previous = comparisonValue(dataset, metric, requiredText(item?.previousLabel, 'previousLabel', 40), previousStart, previousEnd)
    const absoluteChange = current.value == null || previous.value == null ? null : current.value - previous.value
    const previousValue = previous.value
    const percentChange = absoluteChange == null || previousValue == null || previousValue === 0 ? null : (absoluteChange / previousValue) * 100
    parts.push({
      id: randomUUID(),
      type: 'comparison',
      title,
      metric,
      current,
      previous,
      absoluteChange,
      percentChange,
      source: dataset.source,
      action: metricAction(metric, currentEnd, rangeDays(currentStart, currentEnd))
    })
  }

  for (const raw of list(args.charts).slice(0, 2)) {
    const item = record(raw)
    const datasetId = requiredText(item?.datasetId, 'datasetId', 200)
    const metric = requiredMetric(item?.metric)
    const dataset = dailyDataset(datasetId, datasets)
    const points = metricValues(dataset, metric, dataset.start, dataset.end)
    parts.push({
      id: randomUUID(),
      type: 'trend-chart',
      title: requiredText(item?.title, 'title', 100),
      metric,
      startDate: dataset.start,
      endDate: dataset.end,
      points,
      observations: points.filter((point) => point.value != null).length,
      source: dataset.source,
      action: metricAction(metric, dataset.end, rangeDays(dataset.start, dataset.end))
    })
  }

  for (const raw of list(args.workouts).slice(0, 2)) {
    const item = record(raw)
    const datasetId = requiredText(item?.datasetId, 'datasetId', 200)
    const selected = workoutDataset(datasetId, datasets)
    const workoutId = requiredText(item?.workoutId, 'workoutId', 200)
    const workout = selected.workouts.find((candidate) => candidate.id === workoutId)
    if (!workout) throw new Error(`Workout ${workoutId} is not in dataset ${datasetId}.`)
    const date = workout.startTime.slice(0, 10)
    requiredDate(date, 'workout date')
    const action: AssistantAction = { type: 'open-workout', workout, date }
    parts.push({ id: randomUUID(), type: 'workout-card', workout, date, source: selected.source, action })
  }

  if (parts.length > 4) throw new Error('A response can display at most four visual blocks.')
  return parts
}
