import { randomUUID } from 'node:crypto'
import { METRIC_KEYS } from '../shared/types'
import type {
  AssistantAction,
  AssistantComparisonValue,
  AssistantDataView,
  AssistantMetricRange,
  AssistantOverviewAggregation,
  AssistantOverviewMetric,
  AssistantSleepNight,
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
    'Display trusted OpenPulse cards and charts from datasets returned by query_daily_metrics, analyze_daily_metrics, query_sleep, or query_workouts. Analysis dataset IDs can be used directly; never repeat a health query merely to make a visual. Use an overview for a broad multi-domain summary, a metric card for one exact value, a comparison for two periods, a chart for a trend, a sleep card for one night when stage detail is relevant, or a workout card for one workout. An overview is a standalone block: when requesting one, leave every other array empty. Otherwise normally show one block and never more than two unless the user explicitly asks for several. The app computes all values and navigation; never copy values into this call. All six arrays are required and may be empty.',
  strict: true,
  parameters: {
    type: 'object',
    properties: {
      overviews: {
        type: 'array',
        maxItems: 1,
        items: {
          type: 'object',
          properties: {
            datasetId: DATASET_ID,
            title: { type: 'string', minLength: 1, maxLength: 100 },
            startDate: DATE_SCHEMA,
            endDate: DATE_SCHEMA,
            metrics: {
              type: 'array',
              items: METRIC,
              minItems: 2,
              maxItems: 4
            }
          },
          required: ['datasetId', 'title', 'startDate', 'endDate', 'metrics'],
          additionalProperties: false
        }
      },
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
      sleepCards: {
        type: 'array',
        maxItems: 2,
        items: {
          type: 'object',
          properties: { datasetId: DATASET_ID, date: DATE_SCHEMA },
          required: ['datasetId', 'date'],
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
    required: ['overviews', 'metricCards', 'comparisons', 'charts', 'sleepCards', 'workouts'],
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
const OVERVIEW_TOTAL_METRICS = new Set<MetricKey>(['activeMinutes', 'activeZoneMinutes'])

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
  if (dataset?.tool === 'query_sleep' && data && requestedRange && Array.isArray(data.nights)) {
    const source = data.source === 'demo' ? 'demo' : data.source === 'live' ? 'live' : null
    const start = requiredDate(requestedRange.start, 'dataset start')
    const end = requiredDate(requestedRange.end, 'dataset end')
    if (!source) throw new Error(`Dataset ${datasetId} has no valid source.`)
    const days: DailyDataset['days'] = {}
    for (const rawNight of data.nights) {
      const night = record(rawNight)
      if (!night || typeof night.date !== 'string') continue
      const date = requiredDate(night.date, 'sleep date')
      days[date] = {
        sleepMinutes:
          typeof night.minutesAsleep === 'number' && Number.isFinite(night.minutesAsleep)
            ? night.minutesAsleep
            : null,
        sleepEfficiency:
          typeof night.efficiency === 'number' && Number.isFinite(night.efficiency) ? night.efficiency : null
      }
    }
    return { source, start, end, days }
  }
  if (
    (dataset?.tool !== 'query_daily_metrics' && dataset?.tool !== 'analyze_daily_metrics') ||
    !data ||
    !requestedRange ||
    !record(data.days)
  ) {
    throw new Error(`Dataset ${datasetId} is not daily metric data.`)
  }
  const source = data.source === 'demo' ? 'demo' : data.source === 'live' ? 'live' : null
  const start = requiredDate(requestedRange.start, 'dataset start')
  const end = requiredDate(requestedRange.end, 'dataset end')
  if (!source) throw new Error(`Dataset ${datasetId} has no valid source.`)
  return { source, start, end, days: data.days as DailyDataset['days'] }
}

const FALLBACK_METRIC_LABELS: Partial<Record<MetricKey, string>> = {
  restingHeartRate: 'Resting heart rate',
  activeMinutes: 'Active minutes',
  activeZoneMinutes: 'Zone minutes',
  sleepMinutes: 'Sleep duration',
  sleepEfficiency: 'Sleep efficiency',
  weightKg: 'Weight',
  bodyFatPct: 'Body fat',
  caloriesOut: 'Calories burned',
  caloriesIn: 'Calories consumed'
}

function fallbackMetricLabel(metric: MetricKey): string {
  const label = FALLBACK_METRIC_LABELS[metric]
  if (label) return label
  return metric.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/Km$/, '').replace(/Pct$/, '').replace(/Ml$/, '')
}

function datasetMetrics(dataset: AgentDataset): MetricKey[] {
  if (dataset.tool === 'query_sleep') return ['sleepMinutes', 'sleepEfficiency']
  const data = record(dataset.data)
  const units = record(data?.units)
  const days = record(data?.days)
  const keys = Object.keys(units ?? {})
  if (!keys.length && days) {
    for (const day of Object.values(days)) keys.push(...Object.keys(record(day) ?? {}))
  }
  return [...new Set(keys)].filter((metric): metric is MetricKey => METRIC_KEYS.includes(metric as MetricKey))
}

const FALLBACK_METRIC_TERMS: Partial<Record<MetricKey, string[]>> = {
  steps: ['step'],
  distanceKm: ['distance'],
  floors: ['floor'],
  caloriesOut: ['calories burned', 'calorie burn'],
  activeMinutes: ['active minute'],
  activeZoneMinutes: ['zone minute'],
  sedentaryMinutes: ['sedentary', 'sitting'],
  restingHeartRate: ['resting heart', 'resting pulse'],
  hrvMs: ['hrv', 'heart rate variability'],
  spo2Pct: ['spo2', 'oxygen saturation'],
  breathingRate: ['breathing rate', 'respiratory rate'],
  skinTempDeltaC: ['skin temperature'],
  sleepMinutes: ['sleep', 'time asleep'],
  sleepEfficiency: ['sleep efficiency'],
  weightKg: ['weight'],
  bodyFatPct: ['body fat'],
  bmi: ['bmi'],
  waterMl: ['water', 'hydration'],
  caloriesIn: ['calories consumed', 'calorie intake'],
  proteinG: ['protein'],
  carbsG: ['carb'],
  fatG: ['dietary fat'],
  fiberG: ['fiber', 'fibre'],
  saturatedFatG: ['saturated fat'],
  sodiumG: ['sodium', 'salt'],
  sugarG: ['sugar']
}

function requestedMetric(metrics: MetricKey[], request: string): MetricKey {
  const matches = metrics.flatMap((metric) =>
    (FALLBACK_METRIC_TERMS[metric] ?? [])
      .filter((term) => request.includes(term))
      .map((term) => ({ metric, specificity: term.length }))
  )
  return matches.sort((left, right) => right.specificity - left.specificity)[0]?.metric ?? metrics[0]
}

function latestPresentDate(dataset: DailyDataset, metric: MetricKey): string | null {
  const dates = Object.keys(dataset.days)
    .filter((date) => typeof dataset.days[date]?.[metric] === 'number')
    .sort()
  return dates.at(-1) ?? null
}

/**
 * A conservative safety net for obvious visual requests the model did not
 * present itself. It deliberately returns at most one visual.
 */
export function resolveAutomaticPresentation(
  userText: string,
  datasets: Map<string, AgentDataset>
): AssistantVisualPart[] {
  const request = userText.toLowerCase()
  const asksForTrend = /\b(trend|trending|chart|graph|over time|up or down|increas(?:e|ing)|decreas(?:e|ing))\b/.test(request)
  const asksForComparison = /\b(compar(?:e|ed|ing|ison)|versus|vs\.?|difference|than last)\b/.test(request)
  const comparesExternalStandard = /\b(nhs|guidelines?|recommend(?:ation|ed)|ideal|target|goal|baseline)\b/.test(request)
  const asksForExactValue = /\b(how many|how much|what (?:was|is|were|are))\b/.test(request)
  const asksForSleepStructure = /\b(sleep stages?|sleep breakdown|sleep structure)\b/.test(request)
  const identifiesOneNight = /\b(last night|yesterday|tonight|on \d{4}-\d{2}-\d{2})\b/.test(request)
  const asksForSleepNight = asksForSleepStructure || (identifiesOneNight && /\bhow did i sleep\b/.test(request))
  if (asksForComparison && comparesExternalStandard) return []
  if (!asksForTrend && (!asksForComparison || comparesExternalStandard) && !asksForExactValue && !asksForSleepNight) return []

  const candidates = [...datasets.entries()].reverse()
  if (asksForSleepNight && !asksForTrend && !asksForComparison) {
    for (const [datasetId, source] of candidates) {
      if (source.tool !== 'query_sleep') continue
      try {
        const dataset = sleepDataset(datasetId, datasets)
        const night = dataset.nights
          .filter((candidate) => candidate.stages.length)
          .sort((left, right) => right.date.localeCompare(left.date))[0]
        if (!night) continue
        return resolvePresentation(
          { sleepCards: [{ datasetId, date: night.date }] },
          datasets
        ).slice(0, 1)
      } catch {
        continue
      }
    }
  }
  for (const [datasetId, source] of candidates) {
    const metrics = datasetMetrics(source)
    if (!metrics.length) continue
    let dataset: DailyDataset
    try {
      dataset = dailyDataset(datasetId, datasets)
    } catch {
      continue
    }
    const metric = requestedMetric(metrics, request)
    const label = fallbackMetricLabel(metric)

    if (asksForTrend) {
      return resolvePresentation(
        { metricCards: [], comparisons: [], charts: [{ datasetId, metric, title: `${label} trend` }], workouts: [] },
        datasets
      ).slice(0, 1)
    }

    if (asksForComparison) {
      const latest = latestPresentDate(dataset, metric)
      if (!latest || dataset.start >= latest) continue
      const lastNightComparison = /\blast night\b/.test(request)
      let currentStart: string
      let currentEnd: string
      let previousStart: string
      let previousEnd: string
      let currentLabel: string
      let previousLabel: string
      if (lastNightComparison) {
        currentStart = latest
        currentEnd = latest
        previousStart = dataset.start
        previousEnd = shiftIsoDate(latest, -1)
        currentLabel = 'Last night'
        previousLabel = 'Earlier period'
      } else {
        const days = rangeDays(dataset.start, dataset.end)
        if (days < 2) continue
        const currentDays = Math.floor(days / 2)
        currentStart = shiftIsoDate(dataset.end, -(currentDays - 1))
        currentEnd = dataset.end
        previousStart = dataset.start
        previousEnd = shiftIsoDate(currentStart, -1)
        currentLabel = 'Current period'
        previousLabel = 'Previous period'
      }
      return resolvePresentation(
        {
          metricCards: [],
          comparisons: [
            {
              datasetId,
              metric,
              title: `${label} comparison`,
              currentLabel,
              currentStartDate: currentStart,
              currentEndDate: currentEnd,
              previousLabel,
              previousStartDate: previousStart,
              previousEndDate: previousEnd
            }
          ],
          charts: [],
          workouts: []
        },
        datasets
      ).slice(0, 1)
    }

    const latest = latestPresentDate(dataset, metric)
    if (asksForExactValue && latest && dataset.start === dataset.end) {
      return resolvePresentation(
        { metricCards: [{ datasetId, metric, date: latest }], comparisons: [], charts: [], workouts: [] },
        datasets
      ).slice(0, 1)
    }
  }
  return []
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

function overviewAggregation(metric: MetricKey): AssistantOverviewAggregation {
  if (LAST_METRICS.has(metric)) return 'latest'
  if (OVERVIEW_TOTAL_METRICS.has(metric)) return 'total'
  return 'average'
}

function overviewMetric(dataset: DailyDataset, metric: MetricKey): AssistantOverviewMetric {
  const points = metricValues(dataset, metric, dataset.start, dataset.end)
  const presentPoints = points.filter(
    (point): point is { date: string; value: number } => point.value != null
  )
  const present = presentPoints.map((point) => point.value)
  const aggregation = overviewAggregation(metric)
  let value: number | null = null
  if (present.length) {
    if (aggregation === 'latest') value = present[present.length - 1]
    else if (aggregation === 'total') value = present.reduce((sum, item) => sum + item, 0)
    else value = present.reduce((sum, item) => sum + item, 0) / present.length
  }
  return {
    metric,
    value,
    aggregation,
    observations: present.length,
    days: points.length,
    points,
    action: metricAction(
      metric,
      aggregation === 'latest' ? presentPoints.at(-1)?.date ?? dataset.end : dataset.end,
      points.length
    )
  }
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

const SLEEP_STAGES = new Set(['AWAKE', 'LIGHT', 'DEEP', 'REM'])

function sleepDataset(
  datasetId: string,
  datasets: Map<string, AgentDataset>
): { source: DataSource; start: string; end: string; nights: AssistantSleepNight[] } {
  const dataset = datasets.get(datasetId)
  const data = record(dataset?.data)
  const requestedRange = record(data?.requestedRange)
  if (dataset?.tool !== 'query_sleep' || !data || !requestedRange || !Array.isArray(data.nights)) {
    throw new Error(`Dataset ${datasetId} is not sleep data.`)
  }
  const source = data.source === 'demo' ? 'demo' : data.source === 'live' ? 'live' : null
  const start = requiredDate(requestedRange.start, 'dataset start')
  const end = requiredDate(requestedRange.end, 'dataset end')
  if (!source) throw new Error(`Dataset ${datasetId} has no valid source.`)
  const nights = data.nights.flatMap((candidate): AssistantSleepNight[] => {
    const night = record(candidate)
    if (!night) return []
    const date = requiredDate(night.date, 'sleep date')
    const startTime = requiredText(night.startTime, 'sleep startTime', 80)
    const endTime = requiredText(night.endTime, 'sleep endTime', 80)
    const minutesAsleep = night.minutesAsleep
    const minutesInSleepPeriod = night.minutesInSleepPeriod
    const efficiency = night.efficiency
    if (
      typeof minutesAsleep !== 'number' ||
      !Number.isFinite(minutesAsleep) ||
      typeof minutesInSleepPeriod !== 'number' ||
      !Number.isFinite(minutesInSleepPeriod) ||
      (efficiency !== null && (typeof efficiency !== 'number' || !Number.isFinite(efficiency)))
    ) {
      throw new Error(`Sleep night ${date} has invalid summary values.`)
    }
    const stages = list(night.stages).flatMap((candidate) => {
      const stage = record(candidate)
      if (
        !stage ||
        typeof stage.type !== 'string' ||
        !SLEEP_STAGES.has(stage.type) ||
        typeof stage.startTime !== 'string' ||
        typeof stage.endTime !== 'string'
      ) return []
      return [{ type: stage.type as 'AWAKE' | 'LIGHT' | 'DEEP' | 'REM', startTime: stage.startTime, endTime: stage.endTime }]
    })
    const rawStageMinutes = record(night.stageMinutes) ?? {}
    const stageMinutes = Object.fromEntries(
      [...SLEEP_STAGES].flatMap((stage) => {
        const value = rawStageMinutes[stage]
        return typeof value === 'number' && Number.isFinite(value) ? [[stage, value]] : []
      })
    )
    return [{ date, startTime, endTime, minutesAsleep, minutesInSleepPeriod, efficiency, stages, stageMinutes }]
  })
  return { source, start, end, nights }
}

export function resolvePresentation(
  args: Record<string, unknown>,
  datasets: Map<string, AgentDataset>
): AssistantVisualPart[] {
  const parts: AssistantVisualPart[] = []

  const overviewRequest = list(args.overviews)[0]
  if (overviewRequest) {
    const item = record(overviewRequest)
    const datasetId = requiredText(item?.datasetId, 'datasetId', 200)
    const title = requiredText(item?.title, 'title', 100)
    const start = requiredDate(item?.startDate, 'startDate')
    const end = requiredDate(item?.endDate, 'endDate')
    const requestedMetrics = list(item?.metrics).map(requiredMetric)
    const metrics = [...new Set(requestedMetrics)].slice(0, 4)
    if (metrics.length < 2) throw new Error('An overview requires at least two distinct metrics.')
    const dataset = dailyDataset(datasetId, datasets)
    ensureWithin(dataset, start, end)
    const selectedDataset = { ...dataset, start, end }
    return [
      {
        id: randomUUID(),
        type: 'overview',
        title,
        startDate: start,
        endDate: end,
        items: metrics.map((metric) => overviewMetric(selectedDataset, metric)),
        source: dataset.source
      }
    ]
  }

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

  for (const raw of list(args.sleepCards).slice(0, 2)) {
    const item = record(raw)
    const datasetId = requiredText(item?.datasetId, 'datasetId', 200)
    const date = requiredDate(item?.date, 'date')
    const selected = sleepDataset(datasetId, datasets)
    if (date < selected.start || date > selected.end) {
      throw new Error('The requested sleep card falls outside its dataset range.')
    }
    const night = selected.nights.find((candidate) => candidate.date === date)
    if (!night) throw new Error(`Sleep night ${date} is not in dataset ${datasetId}.`)
    if (!night.stages.length) throw new Error(`Sleep night ${date} has no recorded stage timeline.`)
    parts.push({
      id: randomUUID(),
      type: 'sleep-card',
      night,
      source: selected.source,
      action: { type: 'open-sleep-stages', date }
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
