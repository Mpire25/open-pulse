import type { DayMetrics } from '@shared/types'

export type MetricKey = Exclude<keyof DayMetrics, 'date'>

/**
 * Personal baseline for a metric: the average over the trend window's prior
 * days (up to 7, needs at least 3 readings). Night signals only mean anything
 * against the user's own history — never a generic threshold.
 */
export function baseline(trend: DayMetrics[], key: MetricKey, selectedDate: string): number | null {
  const prior = trend
    .filter((d) => d.date < selectedDate)
    .map((d) => d[key])
    .filter((v): v is number => v != null)
  if (prior.length < 3) return null
  const window = prior.slice(-7)
  return window.reduce((s, v) => s + v, 0) / window.length
}

/** Signed % difference vs baseline, null when either side is missing. */
export function baselineDeltaPct(value: number | null, base: number | null): number | null {
  if (value == null || base == null || base === 0) return null
  return ((value - base) / base) * 100
}

export function trendValues(trend: DayMetrics[], key: MetricKey): Array<{ date: string; value: number | null }> {
  return trend.map((d) => ({ date: d.date, value: d[key] }))
}

/** True when a metric has no reading anywhere in the window — hide its section. */
export function metricAbsent(trend: DayMetrics[], key: MetricKey): boolean {
  return trend.every((d) => d[key] == null)
}
