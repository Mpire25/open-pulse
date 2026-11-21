import { METRIC_DESCRIPTIONS } from '../shared/metric-descriptions'
import { METRIC_UNITS } from '../shared/health-metric-units'
import {
  METRIC_KEYS,
  type BodyMeasurementsResult,
  type DailySeries,
  type HeartRatePoint,
  type HourlySteps,
  type NutritionLogEntry,
  type PairedDevice,
  type SleepDay,
  type MetricKey,
  type Workout
} from '../shared/types'
import {
  EXPORT_SECTIONS,
  exportRangeDays,
  isFullExport,
  type HealthExportSection
} from '../shared/health-export'
import { healthAgentModelData } from './health-agent-analysis'
import { SLEEP_DATE_INSTRUCTION } from './health-agent-date-semantics'

export const HEALTH_EXPORT_FORMAT = 'openpulse-health-export'
export const HEALTH_EXPORT_VERSION = 1

export interface HealthExportIntradayDay {
  date: string
  stepsHourly: HourlySteps[]
  heartRate: HeartRatePoint[]
}

export interface HealthExportInput {
  start: string
  end: string
  today: string
  exportedAt: Date
  timeZone: string
  /** What was asked for; a section's data is ignored unless it is selected here. */
  metrics: MetricKey[]
  sections: HealthExportSection[]
  fullHeartRate: boolean
  devices: PairedDevice[]
  daily?: DailySeries
  sleep?: SleepDay[]
  workouts?: Workout[]
  nutrition?: Array<{ date: string; entries: NutritionLogEntry[] }>
  body?: BodyMeasurementsResult | null
  intraday?: HealthExportIntradayDay[]
  /** Sections that could not be read; they are named in about.notes. */
  warnings?: string[]
}

function localTime(value: string | null | undefined, timeZone: string): string | null {
  if (!value) return null
  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(timestamp)
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`
}

function clockTime(minuteOfDay: number): string {
  const seconds = Math.round(minuteOfDay * 60)
  const h = Math.floor(seconds / 3_600)
  const m = Math.floor((seconds % 3_600) / 60)
  const s = seconds % 60
  return [h, m, s].map((value) => String(value).padStart(2, '0')).join(':')
}

const round = (value: number, places = 1): number => {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

/** Google reports float32 values (11.199999809265137); two places is more than any metric needs. */
function tidyNumber(value: number): number {
  return Math.round(value * 100) / 100
}

function tidyCell<T>(value: T): T {
  return (typeof value === 'number' ? tidyNumber(value) : value) as T
}

/**
 * Drops fields that weren't recorded (null, empty lists and objects) and tidies
 * numbers, recursively. Only for records: table rows keep their nulls because
 * cells are positional.
 */
function compactRecord(value: unknown): unknown {
  if (typeof value === 'number') return tidyNumber(value)
  if (Array.isArray(value)) return value.map(compactRecord)
  if (!value || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(value)) {
    const compacted = compactRecord(field)
    if (compacted == null) continue
    if (Array.isArray(compacted) && compacted.length === 0) continue
    if (typeof compacted === 'object' && !Array.isArray(compacted) && Object.keys(compacted).length === 0) continue
    out[key] = compacted
  }
  return out
}

function sleepSection(days: SleepDay[], timeZone: string): Record<string, unknown> {
  const sessions = days.flatMap((day) =>
    [...day.sessions].sort((a, b) => a.startTime.localeCompare(b.startTime))
  )
  const modelNights = healthAgentModelData(
    'query_sleep',
    { detail: 'detailed', nights: sessions },
    timeZone
  ).nights as Array<Record<string, unknown>>
  return {
    // Session ids are Google resource paths that embed the account's user id.
    days: days.map(({ sessions: daySessions, mainSessionId: _main, ...summary }) => compactRecord({
      ...summary,
      sessionCount: daySessions.length
    })),
    stageColumns: ['stage', 'localStartTime', 'minutes'],
    sessions: modelNights.map(({ stageSegmentCount: _count, timeZone: _zone, id: _id, ...night }, index) => ({
      ...(compactRecord(night) as Record<string, unknown>),
      stages: sessions[index].stages.map((stage) => [
        stage.type,
        localTime(stage.startTime, timeZone),
        round((Date.parse(stage.endTime) - Date.parse(stage.startTime)) / 60_000)
      ])
    }))
  }
}

function hourlyRows(days: HealthExportIntradayDay[]): Array<Array<string | number | null>> {
  return days.flatMap((day) => {
    const steps = new Map(day.stepsHourly.map((entry) => [entry.hour, entry.steps]))
    const heart = new Map<number, number[]>()
    for (const point of day.heartRate) {
      const hour = Math.min(23, Math.floor(point.minute / 60))
      heart.set(hour, [...(heart.get(hour) ?? []), point.bpm])
    }
    if (steps.size === 0 && heart.size === 0) return []
    return Array.from({ length: 24 }, (_, hour) => {
      const bpm = heart.get(hour) ?? []
      return [
        day.date,
        hour,
        steps.get(hour) ?? null,
        bpm.length ? round(bpm.reduce((sum, value) => sum + value, 0) / bpm.length) : null,
        bpm.length ? Math.min(...bpm) : null,
        bpm.length ? Math.max(...bpm) : null
      ]
    })
  })
}

/** One self-describing document ChatGPT (or anyone) can read without OpenPulse. */
export function buildHealthExport(input: HealthExportInput): Record<string, unknown> {
  const { timeZone } = input
  const metrics = METRIC_KEYS.filter((metric) => input.metrics.includes(metric))
  const has = (section: HealthExportSection): boolean => input.sections.includes(section)
  const intraday = input.intraday ?? []
  const notes = [
    `All dates are local calendar dates and all times are local clock times in ${timeZone}, written as "YYYY-MM-DD HH:MM", unless a field name says otherwise.`,
    'A null value means nothing was recorded, not zero.'
  ]
  if (input.sections.some((section) => section !== 'hourly')) {
    notes.push('In individual records (workouts, sleep sessions, food logs, weigh-ins), fields that were not recorded are left out entirely.')
  }
  if (!isFullExport(input) || !input.fullHeartRate) {
    notes.push(
      'This export contains only the metrics and sections listed in about.included. Anything else was deliberately left out, not missing from the wearer’s data.'
    )
  }
  if (metrics.some((metric) => METRIC_DESCRIPTIONS[metric].domain === 'sleep') || has('sleepSessions')) {
    notes.push(SLEEP_DATE_INSTRUCTION)
  }
  if (metrics.includes('skinTempDeltaC')) {
    notes.push('skinTempDeltaC is the deviation from the wearer’s personal baseline, not an absolute temperature.')
  }
  if (metrics.length || has('hourly') || input.fullHeartRate) {
    notes.push('Tables are stored as a "columns" list plus "rows" of values in the same order, to keep the file small.')
  }
  if (has('hourly')) {
    notes.push('intraday.hourly heart rate columns are the average, minimum and maximum of that hour’s heart rate samples.')
  }
  notes.push(...(input.warnings ?? []))
  if (input.end >= input.today) {
    notes.push(`${input.today} was still in progress when this was exported, so its values are partial.`)
  }

  const document: Record<string, unknown> = {
    format: HEALTH_EXPORT_FORMAT,
    version: HEALTH_EXPORT_VERSION,
    exportedAt: input.exportedAt.toISOString(),
    source: 'Google Health API (Fitbit), exported by OpenPulse',
    range: { start: input.start, end: input.end, days: exportRangeDays(input.start, input.end) },
    timeZone,
    about: {
      notes,
      included: {
        dailyMetrics: metrics,
        sections: EXPORT_SECTIONS.filter(has),
        fullResolutionHeartRate: input.fullHeartRate
      },
      metrics: Object.fromEntries(
        metrics.map((metric) => [
          metric,
          {
            label: METRIC_DESCRIPTIONS[metric].label,
            domain: METRIC_DESCRIPTIONS[metric].domain,
            unit: METRIC_UNITS[metric]
          }
        ])
      )
    },
    devices: input.devices.map(({ features: _features, lastSync, ...device }) =>
      compactRecord({ ...device, localLastSync: localTime(lastSync, timeZone) })
    )
  }
  if (metrics.length) {
    const daily = input.daily ?? {}
    document.daily = {
      columns: ['date', ...metrics],
      rows: Object.keys(daily).sort().map((date) => [date, ...metrics.map((metric) => tidyCell(daily[date]?.[metric] ?? null))])
    }
  }
  if (has('sleepSessions')) document.sleep = sleepSection(input.sleep ?? [], timeZone)
  if (has('workouts')) {
    document.workouts = (input.workouts ?? []).map(({ id: _id, startTime, ...workout }) => compactRecord({
      localStartTime: localTime(startTime, timeZone),
      ...workout
    }))
  }
  if (has('nutritionLogs')) {
    document.nutrition = (input.nutrition ?? []).map(({ date, entries }) => ({
      date,
      entries: entries.map(({ id: _id, startTime, endTime: _end, ...entry }) => compactRecord({
        localTime: localTime(startTime, timeZone),
        ...entry
      }))
    }))
  }
  if (has('bodyMeasurements')) {
    document.body = input.body
      ? {
          heightCm: input.body.heightCm,
          measurements: input.body.measurements.map(({ id: _id, time, ...measurement }) => compactRecord({
            localTime: localTime(time, timeZone),
            ...measurement
          }))
        }
      : null
  }
  if (has('hourly') || input.fullHeartRate) {
    document.intraday = {
      ...(has('hourly')
        ? {
            hourly: {
              columns: ['date', 'hour', 'steps', 'heartRateAvg', 'heartRateMin', 'heartRateMax'],
              rows: hourlyRows(intraday)
            }
          }
        : {}),
      ...(input.fullHeartRate
        ? {
            heartRate: {
              columns: ['date', 'localTime', 'bpm'],
              rows: intraday.flatMap((day) =>
                day.heartRate.map((point) => [day.date, clockTime(point.minute), point.bpm])
              )
            }
          }
        : {})
    }
  }
  return document
}
