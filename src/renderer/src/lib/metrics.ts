// Helpers over DailySeries results: ordered points, personal baselines,
// period aggregation. Baselines always mean "this user's own recent history",
// never a generic threshold.

import type { DailySeries, MetricKey } from '@shared/types'
import { shiftDate } from './format'

export interface SeriesPoint {
  date: string
  value: number | null
}

export function listDates(start: string, end: string): string[] {
  const out: string[] = []
  for (let d = start; d <= end; d = shiftDate(d, 1)) out.push(d)
  return out
}

/** Inclusive range of `days` days ending on `end`. */
export function rangeEnding(end: string, days: number): { start: string; end: string } {
  return { start: shiftDate(end, -(days - 1)), end }
}

export function seriesPoints(
  series: DailySeries | undefined,
  metric: MetricKey,
  start: string,
  end: string
): SeriesPoint[] {
  return listDates(start, end).map((date) => ({ date, value: series?.[date]?.[metric] ?? null }))
}

export function pointValues(points: SeriesPoint[]): Array<number | null> {
  return points.map((p) => p.value)
}

/**
 * Personal baseline: the average over up to 7 recorded days strictly before
 * `before`. Needs at least 3 readings to mean anything.
 */
export function baseline(points: SeriesPoint[], before: string): number | null {
  const prior = points.filter((p) => p.date < before && p.value != null).map((p) => p.value as number)
  if (prior.length < 3) return null
  const window = prior.slice(-7)
  return window.reduce((s, v) => s + v, 0) / window.length
}

/** Signed % difference vs baseline, null when either side is missing. */
export function baselineDeltaPct(value: number | null, base: number | null): number | null {
  if (value == null || base == null || base === 0) return null
  return ((value - base) / base) * 100
}

export function latestPoint(points: SeriesPoint[]): SeriesPoint | null {
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].value != null) return points[i]
  }
  return null
}

/** Reduce a period of daily values for stats and coarse buckets. */
export function aggregatePoints(points: SeriesPoint[], mode: 'sum' | 'avg' | 'last'): number | null {
  const present = points.filter((p) => p.value != null).map((p) => p.value as number)
  if (present.length === 0) return null
  if (mode === 'sum') return present.reduce((s, v) => s + v, 0)
  if (mode === 'last') return present[present.length - 1]
  return present.reduce((s, v) => s + v, 0) / present.length
}

/** True when a metric has no reading anywhere in the window — hide its section. */
export function metricAbsent(points: SeriesPoint[]): boolean {
  return points.every((p) => p.value == null)
}
