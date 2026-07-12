import { memo } from 'react'
import { ArrowSquareOut, CaretRight, PersonSimpleRun } from '@phosphor-icons/react'
import { ColumnChart, TrendLine } from '@/components/charts'
import { DeltaChip } from '@/components/DeltaChip'
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
          const Icon = def.icon
          return (
            <ResponseCard key={part.id} accent={def.color} compact={compact}>
              <ActionHeader
                icon={<Icon size={15} weight="fill" style={{ color: def.color }} />}
                title={def.label}
                hint={shortDate(part.date)}
                onOpen={() => onAction(part.action)}
              />
              <div className="mt-4 flex items-end justify-between gap-4">
                <MetricValue metric={part.metric} value={part.value} size="large" />
                <Coverage source={part.source} />
              </div>
            </ResponseCard>
          )
        }

        if (part.type === 'comparison') {
          const def = METRICS[part.metric]
          const Icon = def.icon
          const delta = def.deltaMode === 'abs' ? part.absoluteChange : part.percentChange
          return (
            <ResponseCard key={part.id} accent={def.color} compact={compact}>
              <ActionHeader
                icon={<Icon size={15} weight="fill" style={{ color: def.color }} />}
                title={part.title}
                hint={def.label}
                onOpen={() => onAction(part.action)}
              />
              <div className={cn('mt-3 grid gap-2', compact ? 'grid-cols-1' : 'grid-cols-2')}>
                <ComparisonCell metric={part.metric} item={part.current} emphasized />
                <ComparisonCell metric={part.metric} item={part.previous} />
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-hairline pt-2.5">
                <span className="text-[10.5px] text-ink-faint">Change from {part.previous.label.toLowerCase()}</span>
                <DeltaChip
                  delta={delta}
                  upIsGood={def.upIsGood}
                  minMagnitude={def.deltaMode === 'abs' ? 0.05 : 0.5}
                  format={def.deltaMode === 'abs' ? (value) => `${def.format(value)}${def.unit ? ` ${def.unit}` : ''}` : undefined}
                />
              </div>
            </ResponseCard>
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
            <ResponseCard key={part.id} accent={def.color} compact={compact}>
              <ActionHeader
                icon={<Icon size={15} weight="fill" style={{ color: def.color }} />}
                title={part.title}
                hint={`${shortDate(part.startDate)}–${shortDate(part.endDate)} · ${part.observations} readings`}
                onOpen={() => onAction(part.action)}
              />
              <div className="mt-3">
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
            </ResponseCard>
          )
        }

        if (part.type === 'workout-card') {
          const workout = part.workout
          return (
            <ResponseCard key={part.id} accent="var(--color-recovery)" compact={compact}>
              <ActionHeader
                icon={<PersonSimpleRun size={15} weight="fill" className="text-recovery" />}
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
            </ResponseCard>
          )
        }

        return (
          <section key={part.id} className="overflow-hidden rounded-[16px] border border-hairline bg-white/[0.025]">
            <div className="border-b border-hairline px-3.5 py-2.5">
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Sources</h4>
            </div>
            <div className="divide-y divide-hairline">
              {part.sources.map((source, index) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50"
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
          </section>
        )
      })}
    </div>
  )
}

export const AssistantResponseParts = memo(AssistantResponsePartsBase)

function ResponseCard({
  accent,
  compact,
  children
}: {
  accent: string
  compact?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-[18px] border border-hairline bg-panel-2/55 shadow-[inset_0_1px_0_rgb(255_255_255/0.035)]',
        compact ? 'p-3.5' : 'p-4'
      )}
    >
      <span className="absolute inset-y-4 left-0 w-0.5 rounded-r-full" style={{ background: accent }} aria-hidden />
      {children}
    </section>
  )
}

function ActionHeader({
  icon,
  title,
  hint,
  onOpen
}: {
  icon: React.ReactNode
  title: string
  hint: string
  onOpen: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group -m-1 flex w-[calc(100%+0.5rem)] items-center gap-2.5 rounded-xl p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-[10px] bg-white/[0.055]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block truncate text-[10.5px] text-ink-faint">{hint}</span>
      </span>
      <CaretRight size={13} weight="bold" className="shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
    </button>
  )
}

function MetricValue({ metric, value, size }: { metric: MetricKey; value: number | null; size?: 'large' }): React.JSX.Element {
  const def = METRICS[metric]
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <span className={cn('font-mono font-medium tracking-[-0.03em] text-ink', size === 'large' ? 'text-[28px]' : 'text-[19px]')}>
        {value == null ? '—' : def.format(value)}
      </span>
      {value != null && def.unit && <span className="text-[11px] text-ink-faint">{def.unit}</span>}
    </div>
  )
}

function ComparisonCell({
  metric,
  item,
  emphasized
}: {
  metric: MetricKey
  item: AssistantComparisonValue
  emphasized?: boolean
}): React.JSX.Element {
  const missing = item.days - item.observations
  return (
    <div className={cn('rounded-[13px] border px-3 py-2.5', emphasized ? 'border-hairline-strong bg-white/[0.045]' : 'border-hairline bg-black/10')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-medium text-ink-dim">{item.label}</span>
        {missing > 0 && <span className="text-[9.5px] text-ink-faint">{item.observations}/{item.days} days</span>}
      </div>
      <div className="mt-1.5"><MetricValue metric={metric} value={item.value} /></div>
      <div className="mt-1 text-[9.5px] text-ink-faint">{periodLabel(item.startDate, item.endDate)}</div>
    </div>
  )
}

function Coverage({ source }: { source: 'demo' | 'live' }): React.JSX.Element | null {
  return source === 'demo' ? (
    <span className="rounded-full border border-hairline bg-white/[0.035] px-2 py-1 text-[9.5px] font-medium text-ink-faint">Sample data</span>
  ) : null
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
