import { memo } from 'react'
import { ArrowSquareOut, PersonSimpleRun } from '@phosphor-icons/react'
import { ColumnChart, TrendLine } from '@/components/charts'
import { DeltaChip } from '@/components/DeltaChip'
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
          return (
            <Panel key={part.id} className="overflow-hidden">
              <div className="border-b border-hairline px-5 pb-3 pt-4">
                <DrillHeader
                  icon={<Icon size={18} weight="fill" style={{ color: def.color }} />}
                  title={part.title}
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
                <ComparisonCell metric={part.metric} item={part.current} />
                <ComparisonCell metric={part.metric} item={part.previous} />
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-hairline px-5 py-3">
                <span className="text-[10.5px] text-ink-faint">Change from {part.previous.label.toLowerCase()}</span>
                <DeltaChip
                  delta={delta}
                  upIsGood={def.upIsGood}
                  minMagnitude={def.deltaMode === 'abs' ? 0.05 : 0.5}
                  format={def.deltaMode === 'abs' ? (value) => `${def.format(value)}${def.unit ? ` ${def.unit}` : ''}` : undefined}
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
                title={part.title}
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

function MetricValue({ metric, value }: { metric: MetricKey; value: number | null }): React.JSX.Element {
  const def = METRICS[metric]
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <span className="text-[22px] font-semibold leading-none tracking-tight text-ink">
        {value == null ? '—' : def.format(value)}
      </span>
      {value != null && def.unit && <span className="text-[11.5px] text-ink-dim">{def.unit}</span>}
    </div>
  )
}

function ComparisonCell({
  metric,
  item
}: {
  metric: MetricKey
  item: AssistantComparisonValue
}): React.JSX.Element {
  const missing = item.days - item.observations
  return (
    <div className="flex min-w-0 flex-col gap-1.5 px-5 py-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-medium text-ink-dim">{item.label}</span>
        {missing > 0 && <span className="text-[9.5px] text-ink-faint">{item.observations}/{item.days} days</span>}
      </div>
      <MetricValue metric={metric} value={item.value} />
      <div className="text-[9.5px] text-ink-faint">{periodLabel(item.startDate, item.endDate)}</div>
    </div>
  )
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
