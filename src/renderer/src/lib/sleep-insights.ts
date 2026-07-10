import type { SleepNight } from '@shared/types'

export type SleepInsightTone = 'positive' | 'neutral' | 'caution'
export type SleepInsightPosition = 'low' | 'typical' | 'high' | 'unavailable'

export interface SleepMetricInsight {
  label: string
  tone: SleepInsightTone
  position: SleepInsightPosition
}

export interface SleepInterpretation {
  headline: string
  tone: SleepInsightTone
  duration: SleepMetricInsight
  efficiency: SleepMetricInsight | null
  firstDeepOrRem: SleepMetricInsight | null
  deepRem: SleepMetricInsight | null
  awake: SleepMetricInsight | null
  interruptions: SleepMetricInsight | null
}

const MIN_BASELINE_NIGHTS = 5
const MAX_BASELINE_NIGHTS = 14

interface ComparisonCopy {
  low: string
  typical: string
  high: string
  lowTone?: SleepInsightTone
  highTone?: SleepInsightTone
}

function comparison(
  value: number | null,
  values: number[],
  minimumSpread: number,
  copy: ComparisonCopy
): SleepMetricInsight | null {
  if (value == null || values.length < MIN_BASELINE_NIGHTS) return null
  const recent = values.slice(-MAX_BASELINE_NIGHTS)
  const average = recent.reduce((sum, item) => sum + item, 0) / recent.length
  const deviation = Math.sqrt(
    recent.reduce((sum, item) => sum + Math.pow(item - average, 2), 0) / recent.length
  )
  const spread = Math.max(deviation, minimumSpread)

  if (value < average - spread) {
    return { label: copy.low, tone: copy.lowTone ?? 'neutral', position: 'low' }
  }
  if (value > average + spread) {
    return { label: copy.high, tone: copy.highTone ?? 'neutral', position: 'high' }
  }
  return { label: copy.typical, tone: 'neutral', position: 'typical' }
}

function priorValues(
  nights: SleepNight[],
  date: string,
  select: (night: SleepNight) => number | null
): number[] {
  return nights
    .filter((night) => night.date < date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((night) => {
      const value = select(night)
      return value != null && Number.isFinite(value) ? [value] : []
    })
    .slice(-MAX_BASELINE_NIGHTS)
}

function minutesShort(value: number): string {
  const rounded = Math.max(0, Math.round(value))
  if (rounded < 60) return `${rounded}m`
  const hours = Math.floor(rounded / 60)
  const minutes = rounded % 60
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}

export function interpretSleepNight(
  night: SleepNight,
  history: SleepNight[],
  sleepGoalMinutes: number
): SleepInterpretation {
  const hasStageDetail = night.stages.length > 0
  const efficiency = comparison(
    night.efficiency,
    priorValues(history, night.date, (item) => item.efficiency),
    3,
    {
      low: 'Below your usual',
      typical: 'Typical for you',
      high: 'Above your usual',
      lowTone: 'caution',
      highTone: 'positive'
    }
  )
  const firstDeepOrRem = comparison(
    night.minutesToFirstDeepOrRem,
    priorValues(history, night.date, (item) => item.minutesToFirstDeepOrRem),
    5,
    { low: 'Earlier than usual', typical: 'Typical for you', high: 'Later than usual' }
  )
  const deepRem = comparison(
    hasStageDetail ? night.deepRemMinutes : null,
    priorValues(history, night.date, (item) => item.stages.length > 0 ? item.deepRemMinutes : null),
    15,
    { low: 'Less than usual', typical: 'Typical for you', high: 'More than usual' }
  )
  const awake = comparison(
    night.minutesAwake,
    priorValues(history, night.date, (item) => item.minutesAwake),
    5,
    {
      low: 'Less awake',
      typical: 'Typical for you',
      high: 'More awake',
      lowTone: 'positive',
      highTone: 'caution'
    }
  )
  const interruptions = comparison(
    hasStageDetail ? night.interruptionCount : null,
    priorValues(history, night.date, (item) => item.stages.length > 0 ? item.interruptionCount : null),
    1,
    {
      low: 'Fewer than usual',
      typical: 'Typical for you',
      high: 'More than usual',
      lowTone: 'positive',
      highTone: 'caution'
    }
  )
  const goalRatio = sleepGoalMinutes > 0 ? night.minutesAsleep / sleepGoalMinutes : 0
  const goalDifference = sleepGoalMinutes - night.minutesAsleep
  const duration: SleepMetricInsight = goalRatio >= 1
    ? { label: 'Goal reached', tone: 'positive', position: 'high' }
    : goalRatio >= 0.9
      ? { label: 'Near your goal', tone: 'positive', position: 'typical' }
      : { label: `${minutesShort(goalDifference)} short`, tone: 'caution', position: 'low' }

  const disrupted = efficiency?.position === 'low' || interruptions?.position === 'high'
  const headline = goalRatio < 0.85
    ? 'Short night'
    : disrupted
      ? 'More disrupted than usual'
      : goalRatio >= 0.9
        ? 'Strong night'
        : 'Solid night'
  const tone: SleepInsightTone = goalRatio < 0.85 || disrupted ? 'caution' : goalRatio >= 0.9 ? 'positive' : 'neutral'

  return {
    headline,
    tone,
    duration,
    efficiency,
    firstDeepOrRem,
    deepRem,
    awake,
    interruptions
  }
}
