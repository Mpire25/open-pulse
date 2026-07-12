import { memo } from 'react'
import { ArrowSquareOut, Minus, PersonSimpleRun, TrendDown, TrendUp } from '@phosphor-icons/react'
import { ColumnChart, TrendLine } from '@/components/charts'
import { MetricStat } from '@/components/MetricStat'
import { DrillHeader, Panel, SectionHeader } from '@/components/Panel'
import { METRICS } from '@/lib/metric-registry'
import { formatClock, formatInt, formatMinutes, shortDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type {
  AssistantAction,
  AssistantComparisonValue,
  AssistantVisualPart,
  MetricKey
} from '@shared/types'

interface AssistantResponsePartsProps {
  parts: AssistantVisualPart[]
  compact?: boolean
  onAction: (action: AssistantAction) => void
}

function AssistantResponsePartsBase({
  parts,
  compact,
  onAction
}: AssistantResponsePartsProps): React.JSX.Element | null {
  if (!parts.length) return null
  return (
    <div className="mt-3 flex flex-col gap-2.5" aria-label="Assistant visuals">
      {parts.map((part) => {
        if (part.type === 'metric-card') {
          const def = METRICS[part.metric]
          return (
            <Panel key={part.id} className="overflow-hidden">
              <MetricStat
                icon={def.icon}
                label={def.shortLabel ?? def.label}
                value={part.value == null ? '—' : def.format(part.value)}
                unit={part.value == null ? undefined : def.unit}
                accent={def.color}
                sub={`${shortDate(part.date)}${part.source === 'demo' ? ' · Sample data' : ''}`}
                onOpen={() => onAction(part.action)}
              />
            </Panel>
          )
        }

        if (part.type === 'comparison') {
          const def = METRICS[part.metric]
          const Icon = def.icon
          const delta = def.deltaMode === 'abs' ? part.absoluteChange : part.percentChange
          const direction = comparisonDirection(part.current.value, part.previous.value)
          const tone = comparisonTone(direction, def.upIsGood)
          return (
            <Panel key={part.id} className="overflow-hidden">
              <div className="border-b border-hairline px-5 pb-3 pt-4">
                <DrillHeader
                  icon={<Icon size={18} weight="fill" style={{ color: def.color }} />}
                  title={`${def.shortLabel ?? def.label} comparison`}
                  hint={def.label}
                  onOpen={() => onAction(part.action)}
                />
              </div>
              <div
                className={cn(
                  'grid',
                  compact ? 'grid-cols-1 divide-y divide-hairline' : 'grid-cols-2 divide-x divide-hairline'
                )}
              >
                <ComparisonCell
                  metric={part.metric}
                  item={part.current}
                  period="Current period"
                  direction={direction}
                  tone={tone}
                />
                <ComparisonCell metric={part.metric} item={part.previous} period="Previous period" />
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-hairline px-5 py-3">
                <span className="text-[10.5px] text-ink-faint">Compared with previous period</span>
                <ComparisonChange
                  delta={delta}
                  direction={direction}
                  tone={tone}
                  format={
                    def.deltaMode === 'abs'
                      ? (value) => `${def.format(value)}${def.unit ? ` ${def.unit}` : ''}`
                      : (value) => `${value.toFixed(0)}%`
                  }
                />
              </div>
            </Panel>
          )
        }

        if (part.type === 'trend-chart') {
          const def = METRICS[part.metric]
          const Icon = def.icon
          const chartData = part.points.map((point) => ({
            key: point.date,
            date: point.date,
            label: shortDate(point.date),
            value: point.value
          }))
          const openDate = (date: string): void => {
            if (part.action.type === 'open-metric') onAction({ ...part.action, date, range: 'D' })
          }
          return (
            <Panel key={part.id} className="flex flex-col gap-3 p-5">
              <DrillHeader
                icon={<Icon size={18} weight="fill" style={{ color: def.color }} />}
                title={`${def.shortLabel ?? def.label} trend`}
                hint={`${shortDate(part.startDate)}–${shortDate(part.endDate)} · ${part.observations} readings`}
                onOpen={() => onAction(part.action)}
              />
              <div className="mt-auto">
                {def.chart === 'bar' ? (
                  <ColumnChart
                    data={chartData}
                    color={def.color}
                    height={compact ? 150 : 180}
                    format={def.format}
                    unitLabel={def.unit}
                    onSelect={(point) => openDate(point.key)}
                  />
                ) : (
                  <TrendLine
                    data={chartData}
                    color={def.color}
                    height={compact ? 150 : 180}
                    format={def.format}
                    unitLabel={def.unit}
                    onSelect={(point) => openDate(point.date)}
                  />
                )}
              </div>
            </Panel>
          )
        }

        if (part.type === 'workout-card') {
          const workout = part.workout
          return (
            <Panel key={part.id} className="p-5">
              <DrillHeader
                icon={<PersonSimpleRun size={18} weight="fill" className="text-recovery" />}
                title={workout.name}
                hint={`${shortDate(part.date)} · ${formatClock(workout.startTime)} · ${formatMinutes(workout.durationMin)}`}
                onOpen={() => onAction(part.action)}
              />
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-hairline pt-3">
                <WorkoutFact label="Distance" value={workout.distanceKm == null ? null : `${workout.distanceKm.toFixed(2)} km`} />
                <WorkoutFact label="Calories" value={workout.calories == null ? null : `${formatInt(workout.calories)} kcal`} />
                <WorkoutFact label="Average heart rate" value={workout.avgHeartRate == null ? null : `${formatInt(workout.avgHeartRate)} bpm`} />
                <WorkoutFact label="Zone minutes" value={workout.activeZoneMinutes == null ? null : formatMinutes(workout.activeZoneMinutes)} />
              </div>
            </Panel>
          )
        }

        return (
          <Panel key={part.id} className="overflow-hidden">
            <div className="border-b border-hairline px-5 pb-3 pt-4">
              <SectionHeader title="Sources" hint={`${part.sources.length} reference${part.sources.length === 1 ? '' : 's'}`} />
            </div>
            <div className="divide-y divide-hairline">
              {part.sources.map((source, index) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50"
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft font-mono text-[10px] font-semibold text-accent">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 block text-[12px] font-medium leading-snug text-ink">{source.title}</span>
                    <span className="mt-0.5 block truncate text-[10.5px] text-ink-faint">{source.domain}</span>
                  </span>
                  <ArrowSquareOut size={13} className="shrink-0 text-ink-faint transition-colors group-hover:text-accent" />
                </a>
              ))}
            </div>
          </Panel>
        )
      })}
    </div>
  )
}

export const AssistantResponseParts = memo(AssistantResponsePartsBase)

type ComparisonDirection = 'higher' | 'lower' | 'same' | null
type ComparisonTone = 'good' | 'bad' | 'neutral'

function MetricValue({
  metric,
  value,
  tone = 'neutral'
}: {
  metric: MetricKey
  value: number | null
  tone?: ComparisonTone
}): React.JSX.Element {
  const def = METRICS[metric]
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <span
        className={cn(
          'text-[22px] font-semibold leading-none tracking-tight',
          tone === 'neutral' && 'text-ink',
          tone === 'good' && 'text-recovery',
          tone === 'bad' && 'text-heart'
        )}
      >
        {value == null ? '—' : def.format(value)}
      </span>
      {value != null && def.unit && <span className="text-[11.5px] text-ink-dim">{def.unit}</span>}
    </div>
  )
}

function ComparisonCell({
  metric,
  item,
  period,
  direction = null,
  tone = 'neutral'
}: {
  metric: MetricKey
  item: AssistantComparisonValue
  period: 'Current period' | 'Previous period'
  direction?: ComparisonDirection
  tone?: ComparisonTone
}): React.JSX.Element {
  const missing = item.days - item.observations
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-2 px-5 py-4',
        period === 'Current period' && tone === 'good' && 'bg-recovery-soft',
        period === 'Current period' && tone === 'bad' && 'bg-heart-soft',
        period === 'Current period' && tone === 'neutral' && 'bg-white/[0.025]'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className={cn('text-[11px] font-semibold', period === 'Current period' ? 'text-ink' : 'text-ink-dim')}>
            {period}
          </div>
          <div className="mt-0.5 text-[10px] text-ink-faint">{periodLabel(item.startDate, item.endDate)}</div>
        </div>
        {period === 'Current period' && direction && direction !== 'same' ? (
          <DirectionLabel direction={direction} tone={tone} />
        ) : missing > 0 ? (
          <span className="text-[9.5px] text-ink-faint">{item.observations}/{item.days} days</span>
        ) : null}
      </div>
      <MetricValue metric={metric} value={item.value} tone={period === 'Current period' ? tone : 'neutral'} />
      {missing > 0 && period === 'Current period' && (
        <div className="text-[9.5px] text-ink-faint">{item.observations} of {item.days} days recorded</div>
      )}
    </div>
  )
}

function DirectionLabel({
  direction,
  tone
}: {
  direction: Exclude<ComparisonDirection, 'same' | null>
  tone: ComparisonTone
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[10px] font-semibold capitalize',
        tone === 'neutral' && 'text-ink-dim',
        tone === 'good' && 'text-recovery',
        tone === 'bad' && 'text-heart'
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          tone === 'neutral' && 'bg-ink-faint',
          tone === 'good' && 'bg-recovery',
          tone === 'bad' && 'bg-heart'
        )}
      />
      {direction}
    </span>
  )
}

function ComparisonChange({
  delta,
  direction,
  tone,
  format
}: {
  delta: number | null
  direction: ComparisonDirection
  tone: ComparisonTone
  format: (value: number) => string
}): React.JSX.Element {
  if (delta == null || direction == null) return <span className="text-[10.5px] text-ink-faint">Not enough data</span>
  const Icon = direction === 'higher' ? TrendUp : direction === 'lower' ? TrendDown : Minus
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10.5px] font-semibold leading-none',
        tone === 'neutral' && 'bg-white/[0.06] text-ink-dim',
        tone === 'good' && 'bg-recovery-soft text-recovery',
        tone === 'bad' && 'bg-heart-soft text-heart'
      )}
    >
      <Icon size={11} weight="bold" />
      {direction === 'same' ? 'No change' : `${format(Math.abs(delta))} ${direction}`}
    </span>
  )
}

function comparisonDirection(current: number | null, previous: number | null): ComparisonDirection {
  if (current == null || previous == null) return null
  if (current > previous) return 'higher'
  if (current < previous) return 'lower'
  return 'same'
}

function comparisonTone(direction: ComparisonDirection, upIsGood: boolean | null): ComparisonTone {
  if (direction == null || direction === 'same' || upIsGood == null) return 'neutral'
  const improved = direction === 'higher' ? upIsGood : !upIsGood
  return improved ? 'good' : 'bad'
}

function WorkoutFact({ label, value }: { label: string; value: string | null }): React.JSX.Element | null {
  if (!value) return null
  return (
    <div>
      <div className="font-mono text-[12px] font-medium text-ink">{value}</div>
      <div className="mt-0.5 text-[9.5px] text-ink-faint">{label}</div>
    </div>
  )
}

function periodLabel(start: string, end: string): string {
  return start === end ? shortDate(start) : `${shortDate(start)}–${shortDate(end)}`
}
