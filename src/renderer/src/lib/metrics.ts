// Helpers over DailySeries results: ordered points, personal baselines,
// period aggregation. Baselines always mean "this user's own recent history",
// never a generic threshold.

import type { DailySeries, MetricKey } from '@shared/types'
import { shiftDate } from './format'

export interface SeriesPoint {
  date: string
  value: number | null
}

export interface WeeklySeriesPoint extends SeriesPoint {
  endDate: string
  midpointDate: string
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

/** Consecutive seven-day buckets expressed as an average recorded day. */
export function weeklyAverageBuckets(points: SeriesPoint[]): WeeklySeriesPoint[] {
  const buckets: WeeklySeriesPoint[] = []
  for (let index = 0; index < points.length; index += 7) {
    const week = points.slice(index, index + 7)
    const values = week.filter((point) => point.value != null).map((point) => point.value as number)
    buckets.push({
      date: week[0].date,
      endDate: week[week.length - 1].date,
      midpointDate: week[Math.floor((week.length - 1) / 2)].date,
      value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
    })
  }
  return buckets
}

/** Calendar-month values for the compact yearly history list. */
export function monthlyBuckets(points: SeriesPoint[], aggregate: 'sum' | 'avg' | 'last'): SeriesPoint[] {
  const byMonth = new Map<string, number[]>()
  for (const point of points) {
    if (point.value == null) continue
    const month = point.date.slice(0, 7)
    const values = byMonth.get(month) ?? []
    values.push(point.value)
    byMonth.set(month, values)
  }

  const months = [...new Set(points.map((point) => point.date.slice(0, 7)))].sort()
  return months.map((month) => {
    const values = byMonth.get(month)
    let value: number | null = null
    if (values?.length) {
      value =
        aggregate === 'last'
          ? values[values.length - 1]
          : values.reduce((sum, item) => sum + item, 0) / values.length
    }
    return { date: `${month}-01`, value }
  })
}

/** True when a metric has no reading anywhere in the window — hide its section. */
export function metricAbsent(points: SeriesPoint[]): boolean {
  return points.every((p) => p.value == null)
}
