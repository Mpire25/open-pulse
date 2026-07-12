import { METRIC_KEYS, type MetricKey } from '../shared/types'
import {
  getBodyMeasurements,
  getDevices,
  getIntraday,
  getNutritionLogs,
  getSeries,
  getSleepRange,
  getWorkoutsRange
} from './health-service'
import { shiftIsoDate } from './health-api'
import { pearsonCorrelation, summarizeMetricPoints } from './health-agent-analysis'

export interface AgentToolSpec {
  type: 'function'
  name: string
  description: string
  strict: true
  parameters: Record<string, unknown>
}

const DATE_SCHEMA = {
  type: 'string',
  pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  description: 'Civil calendar date in YYYY-MM-DD format.'
}

const RANGE_PROPERTIES = {
  startDate: { ...DATE_SCHEMA, description: 'First date to include, YYYY-MM-DD.' },
  endDate: { ...DATE_SCHEMA, description: 'Last date to include, YYYY-MM-DD.' }
}

export const AGENT_TOOLS: AgentToolSpec[] = [
  {
    type: 'function',
    name: 'query_daily_metrics',
    description:
      'Read only the requested daily health metrics over an explicit range. Use one day for exact-value questions, 7-14 days for short comparisons, about 30 days for trends, and 60-90 days for exploratory relationships. Does not include intraday samples, workouts, or detailed sleep sessions.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        metrics: {
          type: 'array',
          items: { type: 'string', enum: METRIC_KEYS },
          minItems: 1,
          maxItems: 8,
          description: 'Exact daily metric keys needed for this question.'
        },
        ...RANGE_PROPERTIES
      },
      required: ['metrics', 'startDate', 'endDate'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'analyze_daily_metrics',
    description:
      'Calculate reproducible local statistics for one or two daily metrics. Use summary for trends and change; use correlation only for an exploratory relationship between exactly two metrics. The result reports sample size and warns when evidence is thin. Its datasetId is presentation-compatible, so do not repeat the same range with query_daily_metrics just to draw a chart.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        metrics: {
          type: 'array',
          items: { type: 'string', enum: METRIC_KEYS },
          minItems: 1,
          maxItems: 2
        },
        startDate: RANGE_PROPERTIES.startDate,
        endDate: RANGE_PROPERTIES.endDate,
        operation: { type: 'string', enum: ['summary', 'correlation'] }
      },
      required: ['metrics', 'startDate', 'endDate', 'operation'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'query_sleep',
    description:
      'Read sleep sessions for an explicit date range. Summary mode returns timing, duration, efficiency and stage totals without raw stage segments. Use detailed mode only when interruption or stage detail is central to the question.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        ...RANGE_PROPERTIES,
        detail: { type: 'string', enum: ['summary', 'detailed'] }
      },
      required: ['startDate', 'endDate', 'detail'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'query_workouts',
    description: 'Read workout summaries for an explicit date range. Does not retrieve GPS tracks.',
    strict: true,
    parameters: {
      type: 'object',
      properties: RANGE_PROPERTIES,
      required: ['startDate', 'endDate'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'query_intraday',
    description:
      'Read one intraday signal for one day. Use hourly_steps for the activity pattern or heart_rate for raw heart samples. Never use this for a multi-day trend.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        date: DATE_SCHEMA,
        signal: { type: 'string', enum: ['hourly_steps', 'heart_rate'] }
      },
      required: ['date', 'signal'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'query_nutrition_logs',
    description: 'Read individual nutrition log entries for one day. Use daily metrics for totals and trends.',
    strict: true,
    parameters: {
      type: 'object',
      properties: { date: DATE_SCHEMA },
      required: ['date'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'query_body_measurements',
    description: 'Read recorded body measurements over an explicit range, including the latest height used for BMI.',
    strict: true,
    parameters: {
      type: 'object',
      properties: RANGE_PROPERTIES,
      required: ['startDate', 'endDate'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'get_devices',
    description: 'Read paired tracker model, battery, last sync time and hardware features.',
    strict: true,
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false }
  }
]

export const AGENT_TOOL_LABELS: Record<string, string> = {
  query_daily_metrics: 'Reading health metrics',
  analyze_daily_metrics: 'Analysing health trends',
  query_sleep: 'Reading sleep history',
  query_workouts: 'Reading workouts',
  query_intraday: 'Reading intraday data',
  query_nutrition_logs: 'Reading nutrition log',
  query_body_measurements: 'Reading body measurements',
  get_devices: 'Checking devices'
}

const METRIC_UNITS: Record<MetricKey, string> = {
  steps: 'steps',
  distanceKm: 'km',
  floors: 'floors',
  caloriesOut: 'kcal',
  activeMinutes: 'min',
  activeZoneMinutes: 'min',
  sedentaryMinutes: 'min',
  restingHeartRate: 'bpm',
  hrvMs: 'ms',
  spo2Pct: '%',
  breathingRate: 'breaths/min',
  skinTempDeltaC: '°C from baseline',
  sleepMinutes: 'min',
  sleepEfficiency: '%',
  weightKg: 'kg',
  bodyFatPct: '%',
  bmi: 'kg/m²',
  waterMl: 'ml',
  caloriesIn: 'kcal',
  proteinG: 'g',
  carbsG: 'g',
  fatG: 'g',
  fiberG: 'g',
  saturatedFatG: 'g',
  sodiumG: 'g',
  sugarG: 'g'
}

function parseDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must be a YYYY-MM-DD date.`)
  }
  const parsed = new Date(`${value}T12:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${field} is not a valid calendar date.`)
  }
  return value
}

function parseRange(args: Record<string, unknown>, maxDays: number): { start: string; end: string; days: number } {
  const start = parseDate(args.startDate, 'startDate')
  const end = parseDate(args.endDate, 'endDate')
  if (start > end) throw new Error('startDate must not be after endDate.')
  let days = 1
  for (let date = start; date < end; date = shiftIsoDate(date, 1)) days++
  if (days > maxDays) throw new Error(`This tool accepts at most ${maxDays} days per request.`)
  return { start, end, days }
}

function parseMetrics(value: unknown, max: number): MetricKey[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > max) {
    throw new Error(`metrics must contain between 1 and ${max} metric keys.`)
  }
  const metrics = [...new Set(value)]
  if (metrics.some((metric) => typeof metric !== 'string' || !METRIC_KEYS.includes(metric as MetricKey))) {
    throw new Error('metrics contains an unsupported key.')
  }
  return metrics as MetricKey[]
}

function dailyPayload(metrics: MetricKey[], result: Awaited<ReturnType<typeof getSeries>>): Record<string, unknown> {
  const observations = Object.fromEntries(
    metrics.map((metric) => [
      metric,
      Object.values(result.days).filter((day) => day[metric] != null).length
    ])
  )
  return {
    source: result.source,
    requestedRange: { start: result.start, end: result.end },
    units: Object.fromEntries(metrics.map((metric) => [metric, METRIC_UNITS[metric]])),
    observations,
    days: result.days
  }
}

export async function runHealthAgentTool(
  name: string,
  args: Record<string, unknown>,
  signal: AbortSignal
): Promise<string> {
  signal.throwIfAborted()
  switch (name) {
    case 'query_daily_metrics': {
      const metrics = parseMetrics(args.metrics, 8)
      const { start, end } = parseRange(args, 120)
      return JSON.stringify(dailyPayload(metrics, await getSeries(metrics, start, end, false, signal)))
    }
    case 'analyze_daily_metrics': {
      const metrics = parseMetrics(args.metrics, 2)
      const { start, end, days } = parseRange(args, 180)
      const operation = args.operation
      if (operation !== 'summary' && operation !== 'correlation') {
        throw new Error('Unsupported analysis operation.')
      }
      if (operation === 'correlation' && metrics.length !== 2) {
        throw new Error('Correlation requires exactly two metrics.')
      }
      const result = await getSeries(metrics, start, end, false, signal)
      const dates = Object.keys(result.days).sort()
      const summaries = Object.fromEntries(
        metrics.map((metric) => [
          metric,
          {
            unit: METRIC_UNITS[metric],
            ...summarizeMetricPoints(
              dates.map((date) => ({ date, value: result.days[date]?.[metric] ?? null }))
            )
          }
        ])
      )
      const output: Record<string, unknown> = {
        source: result.source,
        requestedRange: { start, end },
        units: Object.fromEntries(metrics.map((metric) => [metric, METRIC_UNITS[metric]])),
        observations: Object.fromEntries(
          metrics.map((metric) => [
            metric,
            Object.values(result.days).filter((day) => day[metric] != null).length
          ])
        ),
        days: result.days,
        range: { start, end, days },
        summaries
      }
      if (operation === 'correlation') {
        const [left, right] = metrics
        const pairs = dates.flatMap((date): Array<[number, number]> => {
          const a = result.days[date]?.[left]
          const b = result.days[date]?.[right]
          return a == null || b == null ? [] : [[a, b]]
        })
        output.correlation = {
          metrics,
          pairedObservations: pairs.length,
          pearsonR: pearsonCorrelation(pairs),
          warning:
            pairs.length < 30
              ? 'Fewer than 30 paired observations; treat this relationship as weak exploratory evidence and consider a longer range.'
              : 'Correlation is observational and does not establish causation.'
        }
      }
      return JSON.stringify(output)
    }
    case 'query_sleep': {
      const { start, end } = parseRange(args, 90)
      if (args.detail !== 'summary' && args.detail !== 'detailed') {
        throw new Error('Unsupported sleep detail level.')
      }
      const result = await getSleepRange(start, end, false, signal)
      return JSON.stringify({
        source: result.source,
        requestedRange: { start, end },
        detail: args.detail,
        nights: result.nights
      })
    }
    case 'query_workouts': {
      const { start, end } = parseRange(args, 90)
      const result = await getWorkoutsRange(start, end, false, signal)
      return JSON.stringify({
        source: result.source,
        requestedRange: { start, end },
        workouts: result.workouts.map(({ splits, events, notes, ...workout }) => ({
          ...workout,
          splitCount: splits?.length ?? 0,
          eventCount: events?.length ?? 0,
          hasNotes: Boolean(notes)
        }))
      })
    }
    case 'query_intraday': {
      const date = parseDate(args.date, 'date')
      if (args.signal === 'hourly_steps') {
        const data = await getIntraday(date, false, signal, 'steps')
        return JSON.stringify({ date: data.date, source: data.source, stepsHourly: data.stepsHourly })
      }
      if (args.signal === 'heart_rate') {
        const data = await getIntraday(date, false, signal, 'heart')
        const stride = Math.max(1, Math.floor(data.heartRate.length / 96))
        return JSON.stringify({
          ...data,
          originalSampleCount: data.heartRate.length,
          heartRate: data.heartRate.filter((_, index) => index % stride === 0)
        })
      }
      throw new Error('Unsupported intraday signal.')
    }
    case 'query_nutrition_logs':
      return JSON.stringify(await getNutritionLogs(parseDate(args.date, 'date'), signal))
    case 'query_body_measurements': {
      const { start, end } = parseRange(args, 365)
      return JSON.stringify({
        requestedRange: { start, end },
        ...(await getBodyMeasurements(start, end, signal))
      })
    }
    case 'get_devices':
      return JSON.stringify(await getDevices(false, signal))
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}
