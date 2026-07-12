import { useState } from 'react'
import { CaretDown } from '@phosphor-icons/react'
import { AssistantResponseParts } from '@/components/AssistantResponseParts'
import { METRICS } from '@/lib/metric-registry'
import { cn } from '@/lib/utils'
import { METRIC_KEYS, type AssistantAction, type AssistantVisualPart, type MetricKey } from '@shared/types'

const noop = (_action: AssistantAction): void => undefined
const TODAY = '2026-07-12'

const SAMPLE_BASE: Record<MetricKey, number> = {
  steps: 10_842,
  distanceKm: 7.65,
  floors: 14,
  caloriesOut: 2_460,
  activeMinutes: 64,
  activeZoneMinutes: 48,
  sedentaryMinutes: 510,
  restingHeartRate: 58,
  hrvMs: 52,
  spo2Pct: 97.1,
  breathingRate: 14.8,
  skinTempDeltaC: 0.2,
  sleepMinutes: 459,
  sleepEfficiency: 94,
  weightKg: 74.6,
  bodyFatPct: 18.4,
  bmi: 23.1,
  waterMl: 2_150,
  caloriesIn: 2_120,
  proteinG: 142,
  carbsG: 238,
  fatG: 71,
  fiberG: 31,
  saturatedFatG: 18,
  sodiumG: 2.1,
  sugarG: 54
}

const SERIES_PATTERN = [-0.08, 0.04, -0.13, 0.09, -0.02, 0.14, 0, -0.05, 0.07, -0.09, 0.12, 0.03, -0.04, 0.08]

function metricAction(
  metric: MetricKey,
  date = TODAY
): Extract<AssistantAction, { type: 'open-metric' }> {
  return { type: 'open-metric', view: METRICS[metric].domain, metric, date, range: 'M' }
}

function dateDaysAgo(daysAgo: number): string {
  const date = new Date(`${TODAY}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() - daysAgo)
  return date.toISOString().slice(0, 10)
}

function sampleValues(metric: MetricKey, length: number, phase = 0): number[] {
  const base = SAMPLE_BASE[metric]
  const amplitude = metric === 'skinTempDeltaC' ? 0.35 : Math.max(Math.abs(base) * 0.12, 0.2)
  return Array.from({ length }, (_, index) => {
    const pattern = SERIES_PATTERN[(index + phase) % SERIES_PATTERN.length] ?? 0
    const value = base + pattern * (amplitude / 0.12)
    return metric === 'skinTempDeltaC' ? value : Math.max(0, value)
  })
}

function chartPoints(metric: MetricKey, length = 14): Array<{ date: string; value: number }> {
  const values = sampleValues(metric, length)
  return values.map((value, index) => ({ date: dateDaysAgo(length - index - 1), value }))
}

function aggregate(metric: MetricKey, values: number[]): number {
  const mode = METRICS[metric].aggregate
  if (mode === 'sum') return values.reduce((total, value) => total + value, 0)
  if (mode === 'last') return values[values.length - 1] ?? 0
  return values.reduce((total, value) => total + value, 0) / values.length
}

function metricCard(metric: MetricKey): AssistantVisualPart {
  return {
    id: `debug-metric-${metric}`,
    type: 'metric-card',
    metric,
    date: TODAY,
    value: SAMPLE_BASE[metric],
    source: 'live',
    action: { ...metricAction(metric), range: 'D' }
  }
}

function comparisonCard(metric: MetricKey): AssistantVisualPart {
  const currentValue = aggregate(metric, sampleValues(metric, 7))
  const previousValue = aggregate(metric, sampleValues(metric, 7, 4))
  const absoluteChange = currentValue - previousValue
  return {
    id: `debug-comparison-${metric}`,
    type: 'comparison',
    title: `${METRICS[metric].label} comparison`,
    metric,
    current: {
      label: 'Current week',
      startDate: '2026-07-06',
      endDate: TODAY,
      value: currentValue,
      observations: 7,
      days: 7
    },
    previous: {
      label: 'Previous week',
      startDate: '2026-06-29',
      endDate: '2026-07-05',
      value: previousValue,
      observations: 7,
      days: 7
    },
    absoluteChange,
    percentChange: previousValue === 0 ? null : (absoluteChange / previousValue) * 100,
    source: 'live',
    action: { ...metricAction(metric), range: 'W' }
  }
}

function trendCard(metric: MetricKey, id: string): AssistantVisualPart {
  const points = chartPoints(metric)
  return {
    id: `${id}-${metric}`,
    type: 'trend-chart',
    title: `${METRICS[metric].label} trend`,
    metric,
    startDate: points[0]?.date ?? TODAY,
    endDate: points[points.length - 1]?.date ?? TODAY,
    points,
    observations: points.length,
    source: 'live',
    action: metricAction(metric)
  }
}

const overviewCard: AssistantVisualPart = {
  id: 'debug-overview',
  type: 'overview',
  title: 'Your last 7 days',
  startDate: '2026-07-06',
  endDate: TODAY,
  source: 'live',
  items: (['steps', 'activeZoneMinutes', 'sleepMinutes', 'restingHeartRate'] as const).map((metric) => ({
    metric,
    value: aggregate(metric, sampleValues(metric, 7)),
    aggregation: METRICS[metric].aggregate === 'sum' ? 'total' : 'average',
    observations: 7,
    days: 7,
    points: chartPoints(metric, 7),
    action: { ...metricAction(metric), range: 'W' }
  }))
}

const workoutCard: AssistantVisualPart = {
  id: 'debug-workout',
  type: 'workout-card',
  workout: {
    id: 'debug-workout-id',
    name: 'Morning run',
    startTime: '2026-07-12T07:30:00Z',
    durationMin: 42,
    calories: 418,
    distanceKm: 6.34,
    avgHeartRate: 146,
    steps: 7_480,
    activeZoneMinutes: 38
  },
  date: TODAY,
  source: 'live',
  action: {
    type: 'open-workout',
    date: TODAY,
    workout: {
      id: 'debug-workout-id',
      name: 'Morning run',
      startTime: '2026-07-12T07:30:00Z',
      durationMin: 42,
      calories: 418,
      distanceKm: 6.34,
      avgHeartRate: 146,
      steps: 7_480,
      activeZoneMinutes: 38
    }
  }
}

const sleepCard: AssistantVisualPart = {
  id: 'debug-sleep',
  type: 'sleep-card',
  night: {
    date: TODAY,
    startTime: '2026-07-11T22:45:00Z',
    endTime: '2026-07-12T07:20:00Z',
    minutesAsleep: 498,
    minutesInSleepPeriod: 515,
    efficiency: 97,
    stages: [
      { type: 'LIGHT', startTime: '2026-07-11T22:45:00Z', endTime: '2026-07-11T23:15:00Z' },
      { type: 'DEEP', startTime: '2026-07-11T23:15:00Z', endTime: '2026-07-12T00:20:00Z' },
      { type: 'LIGHT', startTime: '2026-07-12T00:20:00Z', endTime: '2026-07-12T01:05:00Z' },
      { type: 'REM', startTime: '2026-07-12T01:05:00Z', endTime: '2026-07-12T01:40:00Z' },
      { type: 'LIGHT', startTime: '2026-07-12T01:40:00Z', endTime: '2026-07-12T02:30:00Z' },
      { type: 'DEEP', startTime: '2026-07-12T02:30:00Z', endTime: '2026-07-12T03:25:00Z' },
      { type: 'LIGHT', startTime: '2026-07-12T03:25:00Z', endTime: '2026-07-12T04:25:00Z' },
      { type: 'AWAKE', startTime: '2026-07-12T04:25:00Z', endTime: '2026-07-12T04:37:00Z' },
      { type: 'REM', startTime: '2026-07-12T04:37:00Z', endTime: '2026-07-12T05:22:00Z' },
      { type: 'LIGHT', startTime: '2026-07-12T05:22:00Z', endTime: '2026-07-12T06:25:00Z' },
      { type: 'REM', startTime: '2026-07-12T06:25:00Z', endTime: '2026-07-12T07:05:00Z' },
      { type: 'AWAKE', startTime: '2026-07-12T07:05:00Z', endTime: '2026-07-12T07:20:00Z' }
    ],
    stageMinutes: { AWAKE: 27, REM: 120, LIGHT: 248, DEEP: 120 }
  },
  source: 'live',
  action: { type: 'open-sleep-stages', date: TODAY }
}

const nutritionCard: AssistantVisualPart = {
  id: 'debug-nutrition',
  type: 'nutrition-card',
  scope: 'day',
  title: 'Daily nutrition',
  date: TODAY,
  time: null,
  servingLabel: null,
  itemCount: 4,
  itemNames: ['Greek yogurt', 'Chicken grain bowl', 'Apple', 'Salmon with potatoes'],
  values: {
    calories: 2_120,
    proteinG: 142,
    carbsG: 238,
    fatG: 71,
    fiberG: 31,
    saturatedFatG: 18,
    sodiumG: 2.1,
    sugarG: 54
  },
  source: 'live',
  action: { type: 'open-nutrition', date: TODAY }
}

export function AssistantCardGallery(): React.JSX.Element {
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('steps')

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1060px] px-8 pb-16 pt-4">
        <div className="flex items-end justify-between gap-6">
          <div>
            <h1 className="display text-[24px] font-bold text-ink">Structured response gallery</h1>
            <p className="mt-1 text-[12.5px] text-ink-dim">Every card currently available to the assistant.</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Preview metric</span>
            <MetricSelect label="Preview metric" value={selectedMetric} metrics={METRIC_KEYS} onChange={setSelectedMetric} />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <GallerySection label="Health overview" note="Multiple signals at a glance" wide>
            <AssistantResponseParts parts={[overviewCard]} onAction={noop} />
          </GallerySection>

          <GallerySection label="Metric card" note="One exact value">
            <AssistantResponseParts parts={[metricCard(selectedMetric)]} onAction={noop} />
          </GallerySection>

          <GallerySection label="Period comparison" note="Current against previous">
            <AssistantResponseParts parts={[comparisonCard(selectedMetric)]} onAction={noop} />
          </GallerySection>

          <GallerySection label="Line chart" note="Selected metric rendered as a line" wide>
            <AssistantResponseParts
              parts={[trendCard(selectedMetric, 'debug-line')]}
              chartKindOverride="line"
              onAction={noop}
            />
          </GallerySection>

          <GallerySection label="Bar chart" note="Selected metric rendered as bars" wide>
            <AssistantResponseParts
              parts={[trendCard(selectedMetric, 'debug-bars')]}
              chartKindOverride="bar"
              onAction={noop}
            />
          </GallerySection>

          <GallerySection label="Workout card" note="One retrieved workout">
            <AssistantResponseParts parts={[workoutCard]} onAction={noop} />
          </GallerySection>

          <GallerySection label="Nutrition card" note="Daily intake and macros">
            <AssistantResponseParts parts={[nutritionCard]} onAction={noop} />
          </GallerySection>

          <GallerySection label="Sleep stages" note="One night across every stage" wide>
            <AssistantResponseParts parts={[sleepCard]} onAction={noop} />
          </GallerySection>
        </div>
      </div>
    </div>
  )
}

function GallerySection({
  label,
  note,
  wide = false,
  children
}: {
  label: string
  note: string
  wide?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className={wide ? 'lg:col-span-2' : undefined}>
      <div className="mb-2 min-h-9 px-1">
        <h2 className="text-[12px] font-semibold text-ink">{label}</h2>
        <p className="mt-0.5 text-[10.5px] text-ink-faint">{note}</p>
      </div>
      {children}
    </section>
  )
}

function MetricSelect({
  label,
  value,
  metrics,
  onChange
}: {
  label: string
  value: MetricKey
  metrics: readonly MetricKey[]
  onChange: (metric: MetricKey) => void
}): React.JSX.Element {
  return (
    <label className="relative shrink-0">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as MetricKey)}
        className={cn(
          'h-7 max-w-44 appearance-none rounded-lg border border-hairline-strong bg-panel-2 py-0 pl-2.5 pr-7',
          'text-[10.5px] font-medium text-ink-dim outline-none transition-colors',
          'hover:border-white/20 hover:text-ink focus:border-accent/60 focus:ring-2 focus:ring-accent/15'
        )}
      >
        {metrics.map((metric) => (
          <option key={metric} value={metric}>{METRICS[metric].label}</option>
        ))}
      </select>
      <CaretDown
        aria-hidden
        size={10}
        weight="bold"
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint"
      />
    </label>
  )
}
