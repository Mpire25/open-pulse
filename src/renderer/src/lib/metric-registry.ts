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
    label: 'Steps',
    unit: '',
    icon: Footprints,
    color: 'var(--color-activity)',
    domain: 'activity',
    aggregate: 'sum',
    chart: 'bar',
    upIsGood: true,
    format: int,
    goalKey: 'steps',
    hint: 'Total steps per day'
  },
  distanceKm: {
    key: 'distanceKm',
    label: 'Distance',
    unit: 'km',
    icon: MapPin,
    color: 'var(--color-activity)',
    domain: 'activity',
    aggregate: 'sum',
    chart: 'bar',
    upIsGood: true,
    format: (v) => (v >= 100 ? int(v) : v.toFixed(2)),
    hint: 'Distance covered on foot'
  },
  floors: {
    key: 'floors',
    label: 'Floors',
    unit: '',
    icon: Mountains,
    color: 'var(--color-hydration)',
    domain: 'activity',
    aggregate: 'sum',
    chart: 'bar',
    upIsGood: true,
    format: int,
    hint: 'Floors climbed'
  },
  caloriesOut: {
    key: 'caloriesOut',
    label: 'Calories burned',
    shortLabel: 'Calories',
    unit: 'kcal',
    icon: Fire,
    color: 'var(--color-heart)',
    domain: 'activity',
    aggregate: 'sum',
    chart: 'bar',
    upIsGood: true,
    format: int,
    goalKey: 'caloriesOut',
    hint: 'Total energy burned, including resting'
  },
  activeMinutes: {
    key: 'activeMinutes',
    label: 'Active minutes',
    unit: 'min',
    icon: PersonSimpleRun,
    color: 'var(--color-recovery)',
    domain: 'activity',
    aggregate: 'sum',
    chart: 'bar',
    upIsGood: true,
    format: int,
    hint: 'Moderate + vigorous movement'
  },
  activeZoneMinutes: {
    key: 'activeZoneMinutes',
    label: 'Zone minutes',
    unit: 'min',
    icon: Lightning,
    color: 'var(--color-recovery)',
    domain: 'activity',
    aggregate: 'sum',
    chart: 'bar',
    upIsGood: true,
    format: int,
    goalKey: 'activeZoneMinutes',
    hint: 'Minutes in fat-burn zone or above'
  },
  sedentaryMinutes: {
    key: 'sedentaryMinutes',
    label: 'Sedentary time',
    shortLabel: 'Sedentary',
    unit: '',
    icon: Armchair,
    color: 'var(--color-body-metric)',
    domain: 'activity',
    aggregate: 'avg',
    chart: 'bar',
    upIsGood: false,
    format: formatMinutes,
    hint: 'Time without meaningful movement'
  },
  restingHeartRate: {
    key: 'restingHeartRate',
    label: 'Resting heart rate',
    shortLabel: 'Resting HR',
    unit: 'bpm',
    icon: Heartbeat,
    color: 'var(--color-heart)',
    domain: 'heart',
    aggregate: 'avg',
    chart: 'line',
    upIsGood: false,
    format: int,
    hint: 'Lower usually means better recovery'
  },
  hrvMs: {
    key: 'hrvMs',
    label: 'Heart rate variability',
    shortLabel: 'HRV',
    unit: 'ms',
    icon: Pulse,
    color: 'var(--color-recovery)',
    domain: 'heart',
    aggregate: 'avg',
    chart: 'line',
    upIsGood: true,
    format: int,
    hint: 'Read against your own baseline, not a universal number'
  },
  spo2Pct: {
    key: 'spo2Pct',
    label: 'Blood oxygen',
    shortLabel: 'SpO2',
    unit: '%',
    icon: Drop,
    color: 'var(--color-hydration)',
    domain: 'heart',
    aggregate: 'avg',
    chart: 'line',
    upIsGood: true,
    format: one,
    hint: 'Nightly average SpO2'
  },
  breathingRate: {
    key: 'breathingRate',
    label: 'Respiratory rate',
    shortLabel: 'Breathing',
    unit: 'brpm',
    icon: Wind,
    color: 'var(--color-sleep)',
    domain: 'heart',
    aggregate: 'avg',
    chart: 'line',
    upIsGood: false,
    format: one,
    hint: 'Breaths per minute during sleep'
  },
  skinTempDeltaC: {
    key: 'skinTempDeltaC',
    label: 'Skin temperature',
    shortLabel: 'Skin temp',
    unit: '°C',
    icon: Thermometer,
    color: 'var(--color-body-metric)',
    domain: 'heart',
    aggregate: 'avg',
    chart: 'line',
    upIsGood: null,
    format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`,
    deltaMode: 'abs',
    hint: 'Nightly deviation from your device baseline'
  },
  vo2Max: {
    key: 'vo2Max',
    label: 'Cardio fitness',
    shortLabel: 'VO2 max',
    unit: 'VO2 max',
    icon: Gauge,
    color: 'var(--color-activity)',
    domain: 'heart',
    aggregate: 'last',
    chart: 'line',
    upIsGood: true,
    format: one,
    hint: 'Estimated maximal oxygen uptake'
  },
  sleepMinutes: {
    key: 'sleepMinutes',
    label: 'Sleep duration',
    shortLabel: 'Sleep',
    unit: '',
    icon: Moon,
    color: 'var(--color-sleep)',
    domain: 'sleep',
    aggregate: 'avg',
    chart: 'bar',
    upIsGood: true,
    format: formatMinutes,
    goalKey: 'sleepMinutes',
    hint: 'Time actually asleep, not just in bed'
  },
  sleepEfficiency: {
    key: 'sleepEfficiency',
    label: 'Sleep efficiency',
    shortLabel: 'Efficiency',
    unit: '%',
    icon: Timer,
    color: 'var(--color-sleep)',
    domain: 'sleep',
    aggregate: 'avg',
    chart: 'line',
    upIsGood: true,
    format: int,
    hint: 'Share of the sleep period spent asleep'
  },
  weightKg: {
    key: 'weightKg',
    label: 'Weight',
    unit: 'kg',
    icon: Scales,
    color: 'var(--color-body-metric)',
    domain: 'body',
    aggregate: 'last',
    chart: 'line',
    upIsGood: null,
    format: one,
    hint: 'Scale estimate — watch the trend, not single readings'
  },
  bodyFatPct: {
    key: 'bodyFatPct',
    label: 'Body fat',
    unit: '%',
    icon: Percent,
    color: 'var(--color-heart)',
    domain: 'body',
    aggregate: 'last',
    chart: 'line',
    upIsGood: null,
    format: one,
    hint: 'Bioimpedance estimate'
  },
  waterMl: {
    key: 'waterMl',
    label: 'Water',
    unit: 'ml',
    icon: DropHalf,
    color: 'var(--color-hydration)',
    domain: 'nutrition',
    aggregate: 'sum',
    chart: 'bar',
    upIsGood: true,
    format: int,
    hint: 'Logged intake — missing logs aren’t zero'
  },
  caloriesIn: {
    key: 'caloriesIn',
    label: 'Calories eaten',
    shortLabel: 'Intake',
    unit: 'kcal',
    icon: ForkKnife,
    color: 'var(--color-activity)',
    domain: 'nutrition',
    aggregate: 'sum',
    chart: 'bar',
    upIsGood: null,
    format: int,
    goalKey: 'caloriesIn',
    hint: 'Logged food energy'
  },
  proteinG: {
    key: 'proteinG',
    label: 'Protein',
    unit: 'g',
    icon: Barbell,
    color: 'var(--color-recovery)',
    domain: 'nutrition',
    aggregate: 'sum',
    chart: 'bar',
    upIsGood: null,
    format: int,
    goalKey: 'proteinG',
    hint: 'Logged protein'
  },
  carbsG: {
    key: 'carbsG',
    label: 'Carbs',
    unit: 'g',
    icon: BowlFood,
    color: 'var(--color-activity)',
    domain: 'nutrition',
    aggregate: 'sum',
    chart: 'bar',
    upIsGood: null,
    format: int,
    goalKey: 'carbsG',
    hint: 'Logged carbohydrates'
  },
  fatG: {
    key: 'fatG',
    label: 'Fat',
    unit: 'g',
    icon: Avocado,
    color: 'var(--color-heart)',
    domain: 'nutrition',
    aggregate: 'sum',
    chart: 'bar',
    upIsGood: null,
    format: int,
    goalKey: 'fatG',
    hint: 'Logged fat'
  },
  fiberG: {
    key: 'fiberG',
    label: 'Fiber',
    unit: 'g',
    icon: Plant,
    color: 'var(--color-hydration)',
    domain: 'nutrition',
    aggregate: 'sum',
    chart: 'bar',
    upIsGood: true,
    format: int,
    hint: 'Logged fiber'
  }
}

export function metric(key: MetricKey): MetricDef {
  return METRICS[key]
}
