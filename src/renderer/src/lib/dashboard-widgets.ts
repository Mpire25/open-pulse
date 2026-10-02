import type { Goals, MetricKey } from '@shared/types'
import { METRICS } from './metric-registry'
import { baseline, baselineDeltaPct, latestPoint, type SeriesPoint } from './metrics'
import { shortDate, shiftDate } from './format'

export function metricGoal(metric: MetricKey, goals: Goals): number | null {
  const key = METRICS[metric].goalKey
  return key ? goals[key] : null
}

/** Selected-day values for daily metrics; dated latest readings for sparse body data. */
export function summaryReading(
  metric: MetricKey,
  points: SeriesPoint[],
  date: string,
  goals: Goals
) {
  const def = METRICS[metric]
  const eligible = points.filter((point) => point.date <= date)
  const reading =
    def.aggregate === 'last'
      ? latestPoint(eligible)
      : (eligible.find((point) => point.date === date) ?? null)
  const value = reading?.value ?? null
  const base = baseline(eligible, date)
  const delta =
    def.deltaMode === 'abs' || def.aggregate === 'last' ? null : baselineDeltaPct(value, base)
  const goal = metricGoal(metric, goals)
  let sub = def.hint ?? ''
  if (reading && reading.date !== date) sub = `Last measured ${shortDate(reading.date)}`
  else if (value !== null && goal !== null && goal > 0)
    sub = `${Math.round((value / goal) * 100)}% of ${def.format(goal)} goal`
  else if (value !== null && def.deltaMode === 'abs')
    sub =
      value > 0
        ? 'Above device baseline'
        : value < 0
          ? 'Below device baseline'
          : 'At device baseline'
  else if (delta !== null) sub = 'vs your recent average'
  let detailSub = sub
  if (value !== null && reading?.date === date && metric === 'weightKg') {
    const recent = eligible.filter((p) => p.date >= shiftDate(date, -7) && p.value !== null)
    const change =
      recent.length >= 2 ? Number((recent.at(-1)!.value! - recent[0].value!).toFixed(1)) : null
    detailSub =
      change === null
        ? 'Not enough data for 7-day change'
        : change === 0
          ? 'No change in 7 days'
          : `${change > 0 ? '+' : ''}${change.toFixed(1)} kg in 7 days`
  } else if (
    value !== null &&
    base !== null &&
    (metric === 'restingHeartRate' || metric === 'hrvMs')
  ) {
    const change = Math.round(value - base)
    detailSub =
      change === 0 ? 'Same as your average' : `${change > 0 ? '+' : ''}${change} vs average`
  }
  return { value, date: reading?.date ?? date, sub, detailSub, delta, base }
}
