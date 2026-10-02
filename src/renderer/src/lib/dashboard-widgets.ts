import type { Goals, MetricKey } from '@shared/types'
import { METRICS } from './metric-registry'
import { baseline, baselineDeltaPct, latestPoint, type SeriesPoint } from './metrics'
import { shortDate, shiftDate } from './format'

export function metricGoal(metric: MetricKey, goals: Goals): number | null {
  const key = METRICS[metric].goalKey
  return key ? goals[key] : null
}

function signed(value: number, decimals = 0): string {
  const rounded = Number(value.toFixed(decimals))
  return `${rounded > 0 ? '+' : ''}${rounded}`
}

/** Calculate comparison facts once; each presentation keeps its own wording. */
function readingFacts(
  metric: MetricKey,
  points: SeriesPoint[],
  date: string,
  goals: Goals
) {
  const def = METRICS[metric]
  const eligible = points.filter((point) => point.date <= date)
  const reading = def.aggregate === 'last'
    ? latestPoint(eligible)
    : (eligible.find((point) => point.date === date) ?? null)
  const value = reading?.value ?? null
  const base = baseline(eligible, date)
  const relativeChange = baselineDeltaPct(value, base)
  const difference = value !== null && base !== null ? value - base : null
  const averageChange = difference === null ? null
    : metric === 'restingHeartRate' || metric === 'hrvMs'
      ? Math.round(difference)
      : Number(difference.toFixed(1))
  const goal = metricGoal(metric, goals)
  const goalPct = value !== null && goal !== null && goal > 0
    ? Math.round((value / goal) * 100) : null
  const previous = def.aggregate === 'last' && reading?.date === date
    ? eligible.find(point => point.date >= shiftDate(date, -7) && point.date < date && point.value !== null)
    : undefined
  const weeklyChange = value !== null && previous
    ? Number((value - previous.value!).toFixed(1)) : null
  return {
    reading, value, base, goal, goalPct, difference, averageChange, relativeChange, weeklyChange,
    delta: def.deltaMode === 'abs' || def.aggregate === 'last' ? null : relativeChange
  }
}

function compactSubtitle(metric: MetricKey, facts: ReturnType<typeof readingFacts>, date: string): string {
  const { reading, value, base, goalPct, difference, averageChange, relativeChange, weeklyChange } = facts
  if (value === null) return ''
  if (reading!.date !== date) return `As of ${shortDate(reading!.date)}`
  const def = METRICS[metric]
  if (goalPct !== null) return `${goalPct}% of goal`
  if (def.deltaMode === 'abs') return 'vs baseline'
  if (def.aggregate === 'last') {
    if (weeklyChange === null) return 'No history'
    const unit = metric === 'bodyFatPct' ? ' pp' : def.unit ? ` ${def.unit}` : ''
    return weeklyChange === 0 ? 'No change · 7d' : `${signed(weeklyChange, 1)}${unit} · 7d`
  }
  if (difference === null || averageChange === null) return 'No history'
  if (metric === 'restingHeartRate' || metric === 'hrvMs') {
    return averageChange === 0 ? 'At average' : `${signed(averageChange)} ${def.unit} vs avg`
  }
  if (metric === 'spo2Pct' || metric === 'sleepEfficiency' || metric === 'breathingRate') {
    const unit = metric === 'breathingRate' ? '' : ' pp'
    return averageChange === 0 ? 'At average' : `${signed(averageChange, 1)}${unit} vs avg`
  }
  if (base === 0) return difference === 0 ? 'At average' : `${difference > 0 ? '+' : '-'}${def.format(Math.abs(difference))} vs avg`
  const change = Math.round(relativeChange!)
  return change === 0 ? 'At average' : `${signed(change)}% vs avg`
}

/** Selected-day values for daily metrics; dated latest readings for sparse body data. */
export function summaryReading(
  metric: MetricKey,
  points: SeriesPoint[],
  date: string,
  goals: Goals
) {
  const def = METRICS[metric]
  const facts = readingFacts(metric, points, date, goals)
  const { reading, value, base, delta, goal, goalPct, averageChange, weeklyChange } = facts
  let sub = def.hint ?? ''
  if (reading && reading.date !== date) sub = `Last measured ${shortDate(reading.date)}`
  else if (goalPct !== null)
    sub = `${goalPct}% of ${def.format(goal!)} goal`
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
    detailSub =
      weeklyChange === null
        ? 'Not enough data for 7-day change'
        : weeklyChange === 0
          ? 'No change in 7 days'
          : `${weeklyChange > 0 ? '+' : ''}${weeklyChange.toFixed(1)} kg in 7 days`
  } else if (
    averageChange !== null &&
    (metric === 'restingHeartRate' || metric === 'hrvMs')
  ) {
    detailSub =
      averageChange === 0 ? 'Same as your average' : `${signed(averageChange)} vs average`
  }
  return { value, date: reading?.date ?? date, sub, detailSub, compactSub: compactSubtitle(metric, facts, date), delta, base }
}
