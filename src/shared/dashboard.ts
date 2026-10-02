import { ACTIVITY_INTRADAY_METRICS, METRIC_KEYS, type MetricKey } from './types'

export const GOAL_METRICS = [
  'steps',
  'activeZoneMinutes',
  'caloriesOut',
  'caloriesIn',
  'proteinG',
  'carbsG',
  'fatG',
  'sleepMinutes'
] as const satisfies readonly MetricKey[]
export type DashboardSurface = 'home' | 'menuBar'
export const DASHBOARD_TREND_PERIODS = [
  { days: 7, label: '7 days', hint: 'Last 7 days', range: 'W' },
  { days: 30, label: '30 days', hint: 'Last 30 days', range: 'M' },
  { days: 90, label: '3 months', hint: 'Last 3 months', range: '3M' },
  { days: 365, label: '1 year', hint: 'Last 1 year', range: 'Y' }
] as const
export type DashboardTrendDays = (typeof DASHBOARD_TREND_PERIODS)[number]['days']
export const DASHBOARD_INTRADAY_METRICS = [
  'steps', 'restingHeartRate', ...ACTIVITY_INTRADAY_METRICS
] as const satisfies readonly MetricKey[]
export type DashboardWidget =
  | { kind: 'goal'; metric: MetricKey }
  | { kind: 'summary'; metric: MetricKey }
  | { kind: 'trend'; metric: MetricKey; days: DashboardTrendDays }
  | { kind: 'intraday'; metric: MetricKey }
  | { kind: 'sleepStages' }
  | { kind: 'workouts' }
  | { kind: 'hidden' }
export type SlotKind = 'goal' | 'summary' | 'chart' | 'wide'
export interface DashboardSlot {
  id: string
  label: string
  kind: SlotKind
  defaultWidget: DashboardWidget
}
export type DashboardLayout = Record<string, DashboardWidget>
export interface DashboardLayouts {
  version: 1
  home: DashboardLayout
  menuBar: DashboardLayout
}

const goal = (metric: MetricKey): DashboardWidget => ({ kind: 'goal', metric })
const summary = (metric: MetricKey): DashboardWidget => ({ kind: 'summary', metric })
export const DASHBOARD_SLOTS: Record<DashboardSurface, readonly DashboardSlot[]> = {
  home: [
    { id: 'ring1', label: 'Goal ring 1', kind: 'goal', defaultWidget: goal('steps') },
    { id: 'ring2', label: 'Goal ring 2', kind: 'goal', defaultWidget: goal('caloriesOut') },
    { id: 'ring3', label: 'Goal ring 3', kind: 'goal', defaultWidget: goal('caloriesIn') },
    { id: 'summary1', label: 'Summary 1', kind: 'summary', defaultWidget: summary('sleepMinutes') },
    {
      id: 'summary2',
      label: 'Summary 2',
      kind: 'summary',
      defaultWidget: summary('restingHeartRate')
    },
    { id: 'summary3', label: 'Summary 3', kind: 'summary', defaultWidget: summary('weightKg') },
    {
      id: 'chart1',
      label: 'Left chart',
      kind: 'chart',
      defaultWidget: { kind: 'intraday', metric: 'steps' }
    },
    { id: 'chart2', label: 'Right chart', kind: 'chart', defaultWidget: { kind: 'sleepStages' } },
    ...(['hrvMs', 'spo2Pct', 'breathingRate', 'skinTempDeltaC'] as const).map(
      (metric, i): DashboardSlot => ({
        id: `signal${i + 1}`,
        label: `Highlight ${i + 1}`,
        kind: 'summary',
        defaultWidget: summary(metric)
      })
    ),
    { id: 'wide', label: 'Bottom card', kind: 'wide', defaultWidget: { kind: 'workouts' } }
  ],
  menuBar: [
    { id: 'ring1', label: 'Goal ring 1', kind: 'goal', defaultWidget: goal('steps') },
    { id: 'ring2', label: 'Goal ring 2', kind: 'goal', defaultWidget: goal('caloriesOut') },
    { id: 'ring3', label: 'Goal ring 3', kind: 'goal', defaultWidget: goal('caloriesIn') },
    ...(['sleepMinutes', 'restingHeartRate', 'weightKg', 'hrvMs'] as const).map(
      (metric, i): DashboardSlot => ({
        id: `summary${i + 1}`,
        label: `Summary ${i + 1}`,
        kind: 'summary',
        defaultWidget: summary(metric)
      })
    ),
    {
      id: 'chart1',
      label: 'Top chart',
      kind: 'chart',
      defaultWidget: { kind: 'trend', metric: 'steps', days: 7 }
    },
    { id: 'chart2', label: 'Bottom chart', kind: 'chart', defaultWidget: { kind: 'sleepStages' } }
  ]
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function isDashboardWidget(
  value: unknown,
  slot: SlotKind,
  surface: DashboardSurface
): value is DashboardWidget {
  const widget = object(value)
  const metric =
    typeof widget.metric === 'string' && (METRIC_KEYS as readonly string[]).includes(widget.metric)
  if (slot === 'goal')
    return (
      widget.kind === 'goal' &&
      metric &&
      (GOAL_METRICS as readonly string[]).includes(widget.metric as string)
    )
  if (slot === 'summary') return widget.kind === 'summary' && metric
  if (widget.kind === 'hidden') return slot === 'chart' && surface === 'menuBar'
  if (widget.kind === 'trend') return metric && DASHBOARD_TREND_PERIODS.some(period => period.days === widget.days)
  if (widget.kind === 'workouts') return slot === 'wide' && surface === 'home'
  if (widget.kind === 'sleepStages') return slot === 'chart'
  return (
    widget.kind === 'intraday' &&
    metric &&
    (DASHBOARD_INTRADAY_METRICS as readonly string[]).includes(widget.metric as string)
  )
}

/** Keep the valid slots when an old or damaged preference contains bad entries. */
export function normalizeDashboardLayout(surface: DashboardSurface, raw: unknown): DashboardLayout {
  const input = object(raw)
  return Object.fromEntries(
    DASHBOARD_SLOTS[surface].map((slot) => {
      const widget = isDashboardWidget(input[slot.id], slot.kind, surface)
        ? (input[slot.id] as DashboardWidget)
        : slot.defaultWidget
      // Copy only known fields, never retain unexpected persisted properties.
      const clean: DashboardWidget =
        widget.kind === 'trend'
          ? { kind: widget.kind, metric: widget.metric, days: widget.days }
          : 'metric' in widget
            ? { kind: widget.kind, metric: widget.metric }
            : { kind: widget.kind }
      return [slot.id, clean]
    })
  )
}

export function normalizeDashboardLayouts(raw?: unknown): DashboardLayouts {
  const input = object(raw)
  return {
    version: 1,
    home: normalizeDashboardLayout('home', input.version === 1 ? input.home : undefined),
    menuBar: normalizeDashboardLayout('menuBar', input.version === 1 ? input.menuBar : undefined)
  }
}

/** Saves reject incompatible selections; loading repairs older preferences. */
export function validateDashboardLayout(surface: DashboardSurface, raw: unknown): DashboardLayout {
  const input = object(raw)
  for (const slot of DASHBOARD_SLOTS[surface]) {
    if (!isDashboardWidget(input[slot.id], slot.kind, surface))
      throw new Error(`Invalid selection for ${slot.label}.`)
  }
  return normalizeDashboardLayout(surface, input)
}

export function widgetId(widget: DashboardWidget): string {
  return 'metric' in widget
    ? `${widget.kind}:${widget.metric}${widget.kind === 'trend' ? `:${widget.days}` : ''}`
    : widget.kind
}

export function widgetOptions(slot: SlotKind, surface: DashboardSurface): DashboardWidget[] {
  if (slot === 'goal') return GOAL_METRICS.map((metric) => ({ kind: 'goal', metric }))
  if (slot === 'summary') return METRIC_KEYS.map((metric) => ({ kind: 'summary', metric }))
  const trends = METRIC_KEYS.flatMap((metric): DashboardWidget[] =>
    DASHBOARD_TREND_PERIODS.map(({ days }) => ({ kind: 'trend', metric, days }))
  )
  const intraday = DASHBOARD_INTRADAY_METRICS.map((metric): DashboardWidget => ({ kind: 'intraday', metric }))
  if (slot === 'wide') return [...(surface === 'home' ? [{ kind: 'workouts' } as const] : []), ...intraday, ...trends]
  return [
    { kind: 'sleepStages' },
    ...intraday,
    ...trends
  ]
}
