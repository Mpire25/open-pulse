// How each daily metric's value is displayed. Cards and the answer text that
// quotes them both read from here, so the two always show the same number.

import type { MetricKey } from './types'

const ONE_DECIMAL = new Set<MetricKey>(['spo2Pct', 'breathingRate', 'skinTempDeltaC', 'weightKg', 'bodyFatPct', 'bmi', 'sodiumG'])
const DURATION = new Set<MetricKey>(['sedentaryMinutes', 'sleepMinutes'])

export function formatInt(n: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)
}

export function formatMinutes(totalMinutes: number): string {
  const minutes = Math.round(totalMinutes)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

/** Decimal places a metric is displayed with. */
export function metricDecimals(metric: MetricKey, value: number): number {
  if (metric === 'distanceKm') return Math.abs(value) >= 100 ? 0 : 2
  return ONE_DECIMAL.has(metric) ? 1 : 0
}

/** A metric value as cards display it, without units. Durations read as hours and minutes. */
export function formatMetricValue(metric: MetricKey, value: number): string {
  if (DURATION.has(metric)) return formatMinutes(value)
  const decimals = metricDecimals(metric, value)
  const text = decimals ? value.toFixed(decimals) : formatInt(Math.round(value))
  return metric === 'skinTempDeltaC' && value > 0 ? `+${text}` : text
}

export function isDurationMetric(metric: MetricKey): boolean {
  return DURATION.has(metric)
}
