import { motion } from 'framer-motion'
import { Moon, Bed, Timer, Wind } from '@phosphor-icons/react'
import { Panel, DrillHeader, InteractivePanel } from '@/components/Panel'
import { ColumnChart, ProgressRing, TrendLine } from '@/components/charts'
import { SleepStages, STAGE_COLOR } from '@/components/SleepStages'
import { CARD_HEIGHT, SkeletonChart, SkeletonRing, SkeletonSleepStages, SkeletonText } from '@/components/Skeleton'
import { useSleepRange } from '@/hooks/useHealth'
import { listDates, rangeEnding } from '@/lib/metrics'
import {
  interpretSleepNight,
  type SleepInterpretation,
  type SleepMetricInsight
} from '@/lib/sleep-insights'
import { formatClock, formatMinutes, longDate, shortDate, weekdayShort } from '@/lib/format'
import type { OpenMetric } from '@/lib/metric-navigation'
import { fade } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { Goals, SleepNight } from '@shared/types'

interface SleepViewProps {
  date: string
  goals: Goals
  onOpenMetric: OpenMetric
  onSelectDate: (date: string) => void
}

export function SleepView({ date, goals, onOpenMetric, onSelectDate }: SleepViewProps): React.JSX.Element {
  const week = rangeEnding(date, 7)
  const historyRange = rangeEnding(date, 30)
  const nights = useSleepRange(historyRange.start, historyRange.end)

  const byDate = new Map((nights.data ?? []).map((n) => [n.date, n]))
  const night = byDate.get(date) ?? null
  const interpretation = night ? interpretSleepNight(night, nights.data ?? [], goals.sleepMinutes) : null
  const recorded = nights.data?.filter((n) => n.date >= week.start && n.minutesAsleep > 0) ?? []
  const avgAsleep = recorded.length
    ? recorded.reduce((s, n) => s + n.minutesAsleep, 0) / recorded.length
    : 0

  const dates = listDates(week.start, week.end)

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-8 pb-12">
      <motion.header custom={0} variants={fade} initial="hidden" animate="show" className="pt-2">
        <h1 className="display text-[27px] font-bold text-ink">Sleep</h1>
        <p className="mt-1 text-[13px] text-ink-dim">
          Night ending {longDate(date)}
          {avgAsleep > 0 && ` · ${formatMinutes(avgAsleep)} average this week`}
        </p>
      </motion.header>

      {/* Selected night */}
      <motion.div custom={1} variants={fade} initial="hidden" animate="show">
        {nights.isPending ? (
          <InteractivePanel
            className={`grid grid-cols-1 gap-8 p-7 lg:grid-cols-[auto_1fr] ${CARD_HEIGHT.detail}`}
            onOpen={() => onOpenMetric('sleepMinutes', 'D')}
          >
            <div className="flex flex-col items-center justify-center gap-3" aria-hidden>
              <SkeletonRing size={140} stroke={12} />
              <div className="flex flex-col items-center gap-1.5">
                <SkeletonText className="w-28" />
                <SkeletonText className="h-2.5 w-16" />
              </div>
              <div className="flex gap-4">
                <div className="flex flex-col items-center gap-2">
                  <SkeletonText className="w-12" />
                  <SkeletonText className="w-10" />
                </div>
                <div className="flex flex-col items-center gap-2">
                  <SkeletonText className="w-14" />
                  <SkeletonText className="w-10" />
                </div>
              </div>
            </div>
            <div className="flex flex-col justify-center">
              <DrillHeader
                title="Stages"
                hint={<SkeletonText className="w-32" />}
                icon={<Moon size={18} weight="fill" style={{ color: 'var(--color-sleep)' }} />}
              />
              <div className="mt-5">
                <SkeletonSleepStages />
              </div>
            </div>
            <SleepNightDetailsSkeleton />
          </InteractivePanel>
        ) : night ? (
          <InteractivePanel
            className={`grid grid-cols-1 gap-8 p-7 lg:grid-cols-[auto_1fr] ${CARD_HEIGHT.detail}`}
            onOpen={() => onOpenMetric('sleepMinutes', 'D')}
          >
            <div className="flex flex-col items-center justify-center gap-3">
              <ProgressRing
                value={night.minutesAsleep}
                goal={goals.sleepMinutes}
                color="var(--color-sleep)"
                size={140}
                stroke={12}
              >
                <div className="text-center">
                  <div className="text-[19px] font-semibold leading-none text-ink">
                    {formatMinutes(night.minutesAsleep)}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-wide text-ink-faint">asleep</div>
                </div>
              </ProgressRing>
              <div className="flex flex-col items-center gap-1.5">
                <span className="font-mono text-[11px] text-ink-dim">
                  {Math.round((night.minutesAsleep / goals.sleepMinutes) * 100)}% of {formatMinutes(goals.sleepMinutes)} goal
                </span>
                <InsightPill
                  insight={{ label: interpretation!.headline, tone: interpretation!.tone, position: 'typical' }}
                />
              </div>
              <div className="flex gap-4">
                <MiniStat icon={<Bed size={13} weight="fill" />} label="In bed" value={formatMinutes(night.minutesInSleepPeriod)} />
                <MiniStat
                  icon={<Timer size={13} weight="fill" />}
                  label="Efficiency"
                  value={night.efficiency != null ? `${night.efficiency}%` : '—'}
                />
              </div>
            </div>
            <div className="flex flex-col justify-center">
              <DrillHeader
                title="Stages"
                hint="Hover a block for its timing"
                icon={<Moon size={18} weight="fill" style={{ color: 'var(--color-sleep)' }} />}
              />
              <div className="mt-5">
                <SleepStages night={night} />
              </div>
            </div>
            <SleepNightDetails night={night} interpretation={interpretation!} />
          </InteractivePanel>
        ) : (
          <Panel className="grid place-items-center p-12 text-[13px] text-ink-faint">
            No sleep recorded for this night.
          </Panel>
        )}
      </motion.div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Duration trend */}
          <motion.div custom={2} variants={fade} initial="hidden" animate="show">
            <InteractivePanel
              className={`flex h-full flex-col gap-3 p-5 ${CARD_HEIGHT.chart}`}
              onOpen={() => onOpenMetric('sleepMinutes', 'W')}
            >
              <DrillHeader
                title="Duration"
                hint="Last 7 nights"
                icon={<Moon size={18} weight="fill" style={{ color: 'var(--color-sleep)' }} />}
              />
              <div className="mt-auto">
                {nights.isPending ? (
                  <SkeletonChart />
                ) : (
                  <ColumnChart
                    data={dates.map((d) => ({
                      key: d,
                      label: `${weekdayShort(d)} · ${shortDate(d)}`,
                      value: byDate.get(d)?.minutesAsleep ?? null,
                      tick: weekdayShort(d).slice(0, 1)
                    }))}
                    color="var(--color-sleep)"
                    goal={{ value: goals.sleepMinutes, label: 'goal' }}
                    emphasisIndex={dates.indexOf(date)}
                    format={(v) => formatMinutes(v)}
                    unitLabel="asleep"
                    axisLabel="min"
                  />
                )}
              </div>
            </InteractivePanel>
          </motion.div>

          {/* Efficiency trend */}
          <motion.div custom={3} variants={fade} initial="hidden" animate="show">
            <InteractivePanel
              className={`flex h-full flex-col gap-3 p-5 ${CARD_HEIGHT.chart}`}
              onOpen={() => onOpenMetric('sleepEfficiency', 'W')}
            >
              <DrillHeader
                title="Efficiency"
                hint="Share of the night actually asleep"
                icon={<Timer size={18} weight="fill" style={{ color: 'var(--color-sleep)' }} />}
              />
              <div className="mt-auto">
                {nights.isPending ? (
                  <SkeletonChart />
                ) : (
                  <TrendLine
                    data={dates.map((d) => ({
                      date: d,
                      label: `${weekdayShort(d)} · ${shortDate(d)}`,
                      value: byDate.get(d)?.efficiency ?? null
                    }))}
                    color="var(--color-sleep)"
                    height={170}
                    format={(v) => String(Math.round(v))}
                    unitLabel="%"
                    axisLabel="%"
                    domain={{ max: 100 }}
                  />
                )}
              </div>
            </InteractivePanel>
          </motion.div>
      </div>

      {/* Night-by-night stage mix */}
      {recorded.length > 1 && (
        <motion.div custom={4} variants={fade} initial="hidden" animate="show">
          <h2 className="mb-3 px-1 text-[13px] font-semibold text-ink-dim">Recent nights</h2>
          <div className="flex flex-col gap-2.5">
            {[...recorded]
              .reverse()
              .filter((n) => n.date !== date)
              .map((n) => (
                <NightRow key={n.date} night={n} onSelect={onSelectDate} />
              ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}

function SleepNightDetailsSkeleton(): React.JSX.Element {
  return (
    <div className="border-t border-hairline pt-5 lg:col-span-2" aria-hidden>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex flex-col gap-2">
            <SkeletonText className="w-20" />
            <SkeletonText className="h-4 w-14" />
            <SkeletonText className="h-2.5 w-20" />
          </div>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-4 border-t border-hairline pt-4 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex flex-col gap-2">
            <SkeletonText className="w-16" />
            <SkeletonText className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}

function stageStatusLabel(status: string | null | undefined, processed: boolean | null | undefined): string | null {
  if (processed === false) return 'Sleep stages still processing'
  const labels: Record<string, string> = {
    REJECTED_COVERAGE: 'Stages unavailable · low signal coverage',
    REJECTED_MAX_GAP: 'Stages unavailable · large recording gap',
    REJECTED_START_GAP: 'Stages unavailable · start gap',
    REJECTED_END_GAP: 'Stages unavailable · end gap',
    REJECTED_NAP: 'Stages unavailable for this nap',
    REJECTED_SERVER: 'Stages unavailable · source data missing',
    TIMEOUT: 'Stage processing timed out',
    PROCESSING_INTERNAL_ERROR: 'Stage processing failed'
  }
  return status ? labels[status] ?? null : null
}

function SleepNightDetails({
  night,
  interpretation
}: {
  night: SleepNight
  interpretation: SleepInterpretation
}): React.JSX.Element {
  const outOfBedSegments = night.outOfBedSegments ?? []
  const outOfBedMinutes = outOfBedSegments.reduce(
    (sum, segment) => sum + Math.max(0, (Date.parse(segment.endTime) - Date.parse(segment.startTime)) / 60_000),
    0
  )
  const detailStats = [
    {
      label: 'To first deep/REM',
      value: night.minutesToFirstDeepOrRem != null ? formatMinutes(night.minutesToFirstDeepOrRem) : '—',
      insight: interpretation.firstDeepOrRem
    },
    {
      label: 'Deep + REM',
      value: night.stages.length > 0 ? formatMinutes(night.deepRemMinutes) : '—',
      insight: interpretation.deepRem
    },
    {
      label: 'Awake',
      value: night.minutesAwake != null ? formatMinutes(night.minutesAwake) : '—',
      insight: interpretation.awake
    },
    {
      label: 'Interruptions',
      value: night.stages.length > 0
        ? `${formatMinutes(night.interruptionMinutes)} · ${night.interruptionCount} ${night.interruptionCount === 1 ? 'moment' : 'moments'}`
        : '—',
      insight: interpretation.interruptions
    }
  ]
  const respiratory = night.respiratory
  const respiratoryRows = respiratory
    ? [
        { label: 'Full night', value: respiratory.full },
        { label: 'Light', value: respiratory.light },
        { label: 'Deep', value: respiratory.deep },
        { label: 'REM', value: respiratory.rem }
      ].filter((row) => row.value != null)
    : []
  const status = stageStatusLabel(night.stagesStatus, night.processed)

  return (
    <div className="border-t border-hairline pt-5 lg:col-span-2">
      <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
        {detailStats.map((stat) => (
          <div key={stat.label}>
            <div className="text-[10.5px] font-medium text-ink-faint">{stat.label}</div>
            <div className="mt-0.5 font-mono text-[14px] font-medium text-ink">{stat.value}</div>
            <InsightPill insight={stat.insight} className="mt-1.5" />
          </div>
        ))}
      </div>

      {outOfBedSegments.length > 0 && (
        <div className="mt-3 text-[10.5px] text-ink-faint">
          Out of bed {formatMinutes(outOfBedMinutes)} ·{' '}
          {outOfBedSegments
            .map((segment) => `${formatClock(segment.startTime)}–${formatClock(segment.endTime)}`)
            .join(' · ')}
        </div>
      )}

      {respiratoryRows.length > 0 && (
        <div className="mt-5 border-t border-hairline pt-4">
          <div className="mb-3 flex items-start gap-2">
            <Wind className="mt-px" size={14} weight="fill" style={{ color: 'var(--color-sleep)' }} />
            <div className="text-[11px] font-medium text-ink-dim">Breathing during sleep</div>
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
            {respiratoryRows.map((row) => (
              <div key={row.label}>
                <div className="text-[10.5px] text-ink-faint">{row.label}</div>
                <div className="mt-0.5 font-mono text-[14px] font-medium text-ink">
                  {row.value!.breathsPerMinute.toFixed(1)}{' '}
                  <span className="text-[9.5px] text-ink-dim">br/min</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(status || night.manuallyEdited) && (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-hairline pt-3 text-[10px] text-ink-faint">
          {status && <span>{status}</span>}
          {night.manuallyEdited && <span>Manually edited</span>}
        </div>
      )}
    </div>
  )
}

function InsightPill({
  insight,
  className
}: {
  insight: SleepMetricInsight | null
  className?: string
}): React.JSX.Element | null {
  if (!insight) return null
  return (
    <span
      className={cn(
        'inline-flex whitespace-nowrap rounded-full px-1.5 py-0.5 text-[9.5px] font-medium leading-none',
        insight.tone === 'positive' && 'bg-recovery-soft text-recovery',
        insight.tone === 'caution' && 'bg-activity-soft text-activity',
        insight.tone === 'neutral' && 'bg-white/[0.055] text-ink-dim',
        className
      )}
    >
      {insight.label}
    </span>
  )
}

function MiniStat({
  icon,
  label,
  value
}: {
  icon: React.ReactNode
  label: string
  value: string
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="flex items-center gap-1 text-[11px] text-ink-faint">
        <span className="text-ink-dim">{icon}</span>
        {label}
      </span>
      <span className="text-[13px] font-semibold text-ink">{value}</span>
    </div>
  )
}

// Compact stacked stage bar for the history list.
function NightRow({ night, onSelect }: { night: SleepNight; onSelect: (date: string) => void }): React.JSX.Element {
  const order = ['DEEP', 'LIGHT', 'REM', 'AWAKE'] as const
  const total = order.reduce((s, k) => s + (night.stageMinutes[k] ?? 0), 0) || 1

  return (
    <InteractivePanel className="flex items-center gap-4 px-5 py-3.5" onOpen={() => onSelect(night.date)}>
      <div className="w-28 shrink-0">
        <div className="text-[13px] font-medium text-ink">
          {new Date(`${night.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })}
        </div>
        <div className="text-[11px] text-ink-faint">{shortDate(night.date)}</div>
      </div>
      <div className="flex h-2.5 flex-1 gap-[2px] overflow-hidden rounded-full">
        {order.map((k) => {
          const w = ((night.stageMinutes[k] ?? 0) / total) * 100
          return w > 0 ? (
            <div key={k} className="rounded-full" style={{ width: `${w}%`, background: STAGE_COLOR[k] }} />
          ) : null
        })}
      </div>
      <div className="w-24 shrink-0 text-right">
        <span className="font-mono text-[13px] text-ink">{formatMinutes(night.minutesAsleep)}</span>
        {night.efficiency != null && (
          <span className="ml-2 font-mono text-[11px] text-ink-faint">{night.efficiency}%</span>
        )}
      </div>
    </InteractivePanel>
  )
}
