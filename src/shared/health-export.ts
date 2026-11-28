// Health data export: limits and wire types shared by main and the renderer.
import { METRIC_KEYS, type MetricKey } from './types'

/** Longest range one export reads; beyond this the fetch takes too long to be worth it. */
export const EXPORT_MAX_DAYS = 3 * 366
/** Full-resolution heart rate is roughly 1,440 samples a day, so it's capped separately. */
export const EXPORT_FULL_HEART_RATE_MAX_DAYS = 90

export const EXPORT_PRESETS = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '1 year' }
] as const

/** Detail beyond the one-row-per-day table, each read separately. */
export const EXPORT_SECTIONS = ['sleepSessions', 'workouts', 'nutritionLogs', 'bodyMeasurements', 'hourly'] as const
export type HealthExportSection = (typeof EXPORT_SECTIONS)[number]

export const EXPORT_SECTION_LABELS: Record<HealthExportSection, string> = {
  sleepSessions: 'Sleep sessions and stages',
  workouts: 'Workouts',
  nutritionLogs: 'Individual food logs',
  bodyMeasurements: 'Individual weigh-ins',
  hourly: 'Hourly steps and heart rate'
}

export interface HealthExportOptions {
  start: string
  end: string
  /** Columns of the daily table, in METRIC_KEYS order. */
  metrics: MetricKey[]
  sections: HealthExportSection[]
  fullHeartRate: boolean
}

export type HealthExportPhase =
  | 'daily'
  | 'sleep'
  | 'workouts'
  | 'workoutHeartRate'
  | 'nutrition'
  | 'body'
  | 'intraday'
  | 'writing'

export interface HealthExportProgress {
  phase: HealthExportPhase
  /** Only set while reading intraday days or workout heart rate, the slow parts. */
  done?: number
  total?: number
}

export type HealthExportResult =
  | { status: 'saved'; path: string; bytes: number }
  /** 'dialog' when no file was chosen; 'aborted' when the export was stopped. */
  | { status: 'cancelled'; reason: 'dialog' | 'aborted' }

/** Keeps only known keys, deduplicated and in canonical order. */
export function normalizeExportSelection(
  metrics: unknown,
  sections: unknown
): { metrics: MetricKey[]; sections: HealthExportSection[] } {
  const pick = <T extends string>(known: readonly T[], value: unknown): T[] =>
    Array.isArray(value) ? known.filter((key) => value.includes(key)) : []
  return { metrics: pick(METRIC_KEYS, metrics), sections: pick(EXPORT_SECTIONS, sections) }
}

export function isFullExport(options: Pick<HealthExportOptions, 'metrics' | 'sections'>): boolean {
  return options.metrics.length === METRIC_KEYS.length && options.sections.length === EXPORT_SECTIONS.length
}

export function exportRangeDays(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`)
  const b = Date.parse(`${end}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0
  return Math.round((b - a) / 86_400_000) + 1
}

/** Returns a user-facing problem with the options, or null when they're exportable. */
export function exportOptionsProblem(options: HealthExportOptions, today: string): string | null {
  const isDate = (value: string): boolean =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  if (!isDate(options.start) || !isDate(options.end)) return 'Choose a start and end date.'
  if (options.start > options.end) return 'The start date must be on or before the end date.'
  if (options.end > today) return 'The end date can’t be in the future.'
  const days = exportRangeDays(options.start, options.end)
  if (days > EXPORT_MAX_DAYS) return 'Choose a range of three years or less.'
  if (!options.metrics.length && !options.sections.length && !options.fullHeartRate) {
    return 'Choose at least one thing to export.'
  }
  if (options.fullHeartRate && days > EXPORT_FULL_HEART_RATE_MAX_DAYS) {
    return `Full-resolution heart rate is limited to ${EXPORT_FULL_HEART_RATE_MAX_DAYS} days.`
  }
  return null
}

// Rough per-day sizes of the compact JSON for each part.
const HEADER_BYTES = 4_000
const DAILY_ROW_BYTES = 15
const DAILY_VALUE_BYTES = 8
const SECTION_BYTES_PER_DAY: Record<HealthExportSection, number> = {
  sleepSessions: 3_500,
  workouts: 800,
  nutritionLogs: 1_200,
  bodyMeasurements: 100,
  hourly: 900
}
const FULL_HEART_RATE_BYTES_PER_DAY = 1_440 * 22
// About one 45-minute workout every other day, at 5-second samples.
const WORKOUT_HEART_RATE_BYTES_PER_DAY = 2_500

export function estimateExportBytes(options: Pick<HealthExportOptions, 'metrics' | 'sections' | 'fullHeartRate'>, days: number): number {
  const daily = options.metrics.length ? DAILY_ROW_BYTES + options.metrics.length * DAILY_VALUE_BYTES : 0
  const sections = options.sections.reduce((sum, section) => sum + SECTION_BYTES_PER_DAY[section], 0)
  const heart = options.fullHeartRate
    ? FULL_HEART_RATE_BYTES_PER_DAY + (options.sections.includes('workouts') ? WORKOUT_HEART_RATE_BYTES_PER_DAY : 0)
    : 0
  return HEADER_BYTES + days * (daily + sections + heart)
}

export function formatExportBytes(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1_000))} KB`
  return `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`
}
