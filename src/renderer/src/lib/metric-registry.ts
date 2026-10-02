import { METRIC_DESCRIPTIONS } from '@shared/metric-descriptions'
// One definition per daily metric: how it's named, colored, charted,
// aggregated, and judged. Dashboards, drill-in detail pages, and delta chips
// all read from here so every metric behaves the same everywhere.

import type { Icon } from '@phosphor-icons/react'
import {
  Armchair,
  Avocado,
  Barbell,
  BowlFood,
  Drop,
  DropHalf,
  Fire,
  Footprints,
  ForkKnife,
  Gauge,
  Heartbeat,
  Lightning,
  MapPin,
  Moon,
  Mountains,
  Percent,
  PersonSimpleRun,
  Plant,
  Pulse,
  Scales,
  Thermometer,
  Timer,
  Wind
} from '@phosphor-icons/react'
import type { Goals, MetricKey } from '@shared/types'
import { formatInt, formatMinutes } from './format'

export type MetricDomain = 'activity' | 'heart' | 'sleep' | 'body' | 'nutrition'

export interface MetricDef {
  key: MetricKey
  label: string
  /** Compact label for tight tiles; falls back to `label`. */
  shortLabel?: string
  unit: string
  icon: Icon
  color: string
  domain: MetricDomain
  /** How a multi-day period reduces for stats and coarse (yearly) buckets. */
  aggregate: 'sum' | 'avg' | 'last'
  chart: 'bar' | 'line'
  /** Delta coloring semantics; null = neutral, never colored. */
  upIsGood: boolean | null
  format: (v: number) => string
  /** 'abs' when % vs baseline is meaningless (e.g. skin temp is already a delta). */
  deltaMode?: 'pct' | 'abs'
  goalKey?: keyof Goals
  hint?: string
}

const int = (v: number): string => formatInt(Math.round(v))
const one = (v: number): string => v.toFixed(1)

export const METRICS: Record<MetricKey, MetricDef> = {
  steps: {
    key: 'steps',
    ...METRIC_DESCRIPTIONS.steps,
    unit: '',
    icon: Footprints,
    color: 'var(--color-activity)',
    aggregate: 'sum',
    chart: 'bar',
    upIsGood: true,
    format: int,
    goalKey: 'steps',
    hint: 'Total steps per day'
  },
  distanceKm: {
    key: 'distanceKm',
    ...METRIC_DESCRIPTIONS.distanceKm,
    unit: 'km',
    icon: MapPin,
    color: 'var(--color-activity)',
    aggregate: 'sum',
    chart: 'bar',
    upIsGood: true,
    format: (v) => (v >= 100 ? int(v) : v.toFixed(2)),
    hint: 'Distance covered on foot'
  },
  floors: {
    key: 'floors',
    ...METRIC_DESCRIPTIONS.floors,
    unit: '',
    icon: Mountains,
    color: 'var(--color-hydration)',
    aggregate: 'sum',
    chart: 'bar',
    upIsGood: true,
    format: int,
    hint: 'Floors climbed'
  },
  caloriesOut: {
    key: 'caloriesOut',
    ...METRIC_DESCRIPTIONS.caloriesOut,
    shortLabel: 'Calories',
    unit: 'kcal',
    icon: Fire,
    color: 'var(--color-heart)',
    aggregate: 'sum',
    chart: 'bar',
    upIsGood: true,
    format: int,
    goalKey: 'caloriesOut',
    hint: 'Total energy burned, including resting'
  },
  activeMinutes: {
    key: 'activeMinutes',
    ...METRIC_DESCRIPTIONS.activeMinutes,
    unit: 'min',
    icon: PersonSimpleRun,
    color: 'var(--color-recovery)',
    aggregate: 'sum',
    chart: 'bar',
    upIsGood: true,
    format: int,
    hint: 'Moderate + vigorous movement'
  },
  activeZoneMinutes: {
    key: 'activeZoneMinutes',
    ...METRIC_DESCRIPTIONS.activeZoneMinutes,
    unit: 'min',
    icon: Lightning,
    color: 'var(--color-recovery)',
    aggregate: 'sum',
    chart: 'bar',
    upIsGood: true,
    format: int,
    goalKey: 'activeZoneMinutes',
    hint: 'Minutes in fat-burn zone or above'
  },
  sedentaryMinutes: {
    key: 'sedentaryMinutes',
    ...METRIC_DESCRIPTIONS.sedentaryMinutes,
    shortLabel: 'Sedentary',
    unit: '',
    icon: Armchair,
    color: 'var(--color-body-metric)',
    aggregate: 'avg',
    chart: 'bar',
    upIsGood: false,
    format: formatMinutes,
    hint: 'Time without meaningful movement'
  },
  restingHeartRate: {
    key: 'restingHeartRate',
    ...METRIC_DESCRIPTIONS.restingHeartRate,
    shortLabel: 'Resting HR',
    unit: 'bpm',
    icon: Heartbeat,
    color: 'var(--color-heart)',
    aggregate: 'avg',
    chart: 'line',
    upIsGood: false,
    format: int,
    hint: 'Lower usually means better recovery'
  },
  hrvMs: {
    key: 'hrvMs',
    ...METRIC_DESCRIPTIONS.hrvMs,
    shortLabel: 'HRV',
    unit: 'ms',
    icon: Pulse,
    color: 'var(--color-recovery)',
    aggregate: 'avg',
    chart: 'line',
    upIsGood: true,
    format: int,
    hint: 'Compare with your own baseline'
  },
  spo2Pct: {
    key: 'spo2Pct',
    ...METRIC_DESCRIPTIONS.spo2Pct,
    shortLabel: 'SpO2',
    unit: '%',
    icon: Drop,
    color: 'var(--color-hydration)',
    aggregate: 'avg',
    chart: 'line',
    upIsGood: true,
    format: one,
    hint: 'Nightly average SpO2'
  },
  breathingRate: {
    key: 'breathingRate',
    ...METRIC_DESCRIPTIONS.breathingRate,
    shortLabel: 'Breathing',
    unit: 'brpm',
    icon: Wind,
    color: 'var(--color-sleep)',
    aggregate: 'avg',
    chart: 'line',
    upIsGood: false,
    format: one,
    hint: 'Breaths per minute during sleep'
  },
  skinTempDeltaC: {
    key: 'skinTempDeltaC',
    ...METRIC_DESCRIPTIONS.skinTempDeltaC,
    shortLabel: 'Skin temp',
    unit: '°C',
    icon: Thermometer,
    color: 'var(--color-body-metric)',
    aggregate: 'avg',
    chart: 'line',
    upIsGood: null,
    format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`,
    deltaMode: 'abs',
    hint: 'Nightly deviation from your device baseline'
  },
  sleepMinutes: {
    key: 'sleepMinutes',
    ...METRIC_DESCRIPTIONS.sleepMinutes,
    shortLabel: 'Sleep',
    unit: '',
    icon: Moon,
    color: 'var(--color-sleep)',
    aggregate: 'avg',
    chart: 'bar',
    upIsGood: true,
    format: formatMinutes,
    goalKey: 'sleepMinutes',
    hint: 'Time actually asleep, not just in bed'
  },
  sleepEfficiency: {
    key: 'sleepEfficiency',
    ...METRIC_DESCRIPTIONS.sleepEfficiency,
    shortLabel: 'Efficiency',
    unit: '%',
    icon: Timer,
    color: 'var(--color-sleep)',
    aggregate: 'avg',
    chart: 'line',
    upIsGood: true,
    format: int,
    hint: 'Share of the sleep period spent asleep'
  },
  weightKg: {
    key: 'weightKg',
    ...METRIC_DESCRIPTIONS.weightKg,
    unit: 'kg',
    icon: Scales,
    color: 'var(--color-body-metric)',
    aggregate: 'last',
    chart: 'line',
    upIsGood: null,
    format: one,
    hint: 'Scale estimate — watch the trend, not single readings'
  },
  bodyFatPct: {
    key: 'bodyFatPct',
    ...METRIC_DESCRIPTIONS.bodyFatPct,
    unit: '%',
    icon: Percent,
    color: 'var(--color-heart)',
    aggregate: 'last',
    chart: 'line',
    upIsGood: null,
    format: one,
    hint: 'Bioimpedance estimate'
  },
  bmi: {
    key: 'bmi',
    ...METRIC_DESCRIPTIONS.bmi,
    unit: '',
    icon: Gauge,
    color: 'var(--color-body-metric)',
    aggregate: 'last',
    chart: 'line',
    upIsGood: null,
    format: one,
    hint: 'Calculated from weight and your latest recorded height'
  },
  waterMl: {
    key: 'waterMl',
    ...METRIC_DESCRIPTIONS.waterMl,
    unit: 'ml',
    icon: DropHalf,
    color: 'var(--color-hydration)',
    aggregate: 'sum',
    chart: 'bar',
    upIsGood: true,
    format: int,
    hint: 'Logged intake — missing logs aren’t zero'
  },
  caloriesIn: {
    key: 'caloriesIn',
    ...METRIC_DESCRIPTIONS.caloriesIn,
    shortLabel: 'Intake',
    unit: 'kcal',
    icon: ForkKnife,
    color: 'var(--color-recovery)',
    aggregate: 'sum',
    chart: 'bar',
    upIsGood: null,
    format: int,
    goalKey: 'caloriesIn',
    hint: 'Logged food energy'
  },
  proteinG: {
    key: 'proteinG',
    ...METRIC_DESCRIPTIONS.proteinG,
    unit: 'g',
    icon: Barbell,
    color: 'var(--color-recovery)',
    aggregate: 'sum',
    chart: 'bar',
    upIsGood: null,
    format: int,
    goalKey: 'proteinG',
    hint: 'Logged protein'
  },
  carbsG: {
    key: 'carbsG',
    ...METRIC_DESCRIPTIONS.carbsG,
    unit: 'g',
    icon: BowlFood,
    color: 'var(--color-activity)',
    aggregate: 'sum',
    chart: 'bar',
    upIsGood: null,
    format: int,
    goalKey: 'carbsG',
    hint: 'Logged carbohydrates'
  },
  fatG: {
    key: 'fatG',
    ...METRIC_DESCRIPTIONS.fatG,
    unit: 'g',
    icon: Avocado,
    color: 'var(--color-heart)',
    aggregate: 'sum',
    chart: 'bar',
    upIsGood: null,
    format: int,
    goalKey: 'fatG',
    hint: 'Logged fat'
  },
  fiberG: {
    key: 'fiberG',
    ...METRIC_DESCRIPTIONS.fiberG,
    unit: 'g',
    icon: Plant,
    color: 'var(--color-hydration)',
    aggregate: 'sum',
    chart: 'bar',
    upIsGood: true,
    format: int,
    hint: 'Logged fiber'
  },
  saturatedFatG: {
    key: 'saturatedFatG',
    ...METRIC_DESCRIPTIONS.saturatedFatG,
    unit: 'g',
    icon: Avocado,
    color: 'var(--color-heart)',
    aggregate: 'sum',
    chart: 'bar',
    upIsGood: false,
    format: int,
    hint: 'Logged saturated fat'
  },
  sodiumG: {
    key: 'sodiumG',
    ...METRIC_DESCRIPTIONS.sodiumG,
    unit: 'g',
    icon: ForkKnife,
    color: 'var(--color-recovery)',
    aggregate: 'sum',
    chart: 'bar',
    upIsGood: false,
    format: one,
    hint: 'Logged sodium'
  },
  sugarG: {
    key: 'sugarG',
    ...METRIC_DESCRIPTIONS.sugarG,
    unit: 'g',
    icon: BowlFood,
    color: 'var(--color-body-metric)',
    aggregate: 'sum',
    chart: 'bar',
    upIsGood: false,
    format: int,
    hint: 'Logged sugar'
  }
}

export function metric(key: MetricKey): MetricDef {
  return METRICS[key]
}
