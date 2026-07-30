import { motion } from 'framer-motion'
import { CaretRight, Moon, Timer } from '@phosphor-icons/react'
import { Panel, DrillHeader, InteractivePanel } from '@/components/Panel'
import { ColumnChart, ProgressRing, TrendLine } from '@/components/charts'
import { SleepStages, STAGE_COLOR } from '@/components/SleepStages'
import { CARD_HEIGHT, SkeletonChart, SkeletonRing, SkeletonText } from '@/components/Skeleton'
import { ErrorState } from '@/components/ErrorState'
import { useSleepRange } from '@/hooks/useHealth'
import { listDates, rangeEnding } from '@/lib/metrics'
import { formatMinutes, longDate, shortDate, weekdayShort } from '@/lib/format'
import type { OpenMetric } from '@/lib/metric-navigation'
import { fade } from '@/lib/motion'
import type { Goals, SleepNight } from '@shared/types'

interface SleepViewProps {
  date: string
  goals: Goals
  onOpenMetric: OpenMetric
  onOpenStages: () => void
  onSelectDate: (date: string) => void
}

export function SleepView({ date, goals, onOpenMetric, onOpenStages, onSelectDate }: SleepViewProps): React.JSX.Element {
  const week = rangeEnding(date, 7)
  const nights = useSleepRange(week.start, week.end)

  if (nights.isError) {
    return (
      <ErrorState
        message={nights.error instanceof Error ? nights.error.message : undefined}
        onRetry={() => void nights.refetch()}
      />
    )
  }

  const byDate = new Map((nights.data ?? []).map((n) => [n.date, n]))
  const night = byDate.get(date) ?? null
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
        <Panel className="sleep-hero" aria-busy={nights.isPending}>
          <button
            type="button"
            onClick={nights.isPending ? undefined : () => onOpenMetric('sleepMinutes', 'D')}
            disabled={nights.isPending}
            className="group/drill relative flex min-w-0 flex-col items-center justify-center gap-3 rounded-[18px] p-4 transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            aria-label="Open sleep duration details"
          >
            {!nights.isPending && (
              <CaretRight
                size={14}
                weight="bold"
                className="absolute right-4 top-4 text-ink-faint transition-all group-hover/drill:translate-x-0.5 group-hover/drill:text-ink"
              />
            )}
            {nights.isPending ? (
              <SkeletonRing size={172} stroke={16} />
            ) : (
              <ProgressRing
                value={night?.minutesAsleep ?? 0}
                goal={goals.sleepMinutes}
                color="var(--color-sleep)"
                size={172}
                stroke={16}
              >
                <div className="text-center">
                  <div className="text-[23px] font-semibold leading-none text-ink">
                    {night ? formatMinutes(night.minutesAsleep) : '—'}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-wide text-ink-faint">asleep</div>
                </div>
              </ProgressRing>
            )}
            {nights.isPending ? (
              <SkeletonText className="h-[13px] w-28" />
            ) : (
              <span className="font-mono text-[11px] text-ink-dim">
                {night
                  ? `${Math.round((night.minutesAsleep / goals.sleepMinutes) * 100)}% of ${formatMinutes(goals.sleepMinutes)} goal`
                  : `${formatMinutes(goals.sleepMinutes)} goal`}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={nights.isPending ? undefined : onOpenStages}
            disabled={nights.isPending}
            className="group/drill flex min-w-0 flex-col justify-center rounded-[18px] p-4 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            aria-label="Open sleep stages details"
          >
            <DrillHeader
              title="Stages"
              hint={
                nights.isPending ? (
                  <SkeletonText className="w-32" />
                ) : night ? (
                  'Hover a block for its timing'
                ) : (
                  'No stages recorded'
                )
              }
              icon={<Moon size={18} weight="fill" style={{ color: 'var(--color-sleep)' }} />}
            />
            <div className="mt-4">
              <SleepStages night={night} compact loading={nights.isPending} />
            </div>
          </button>
          <SleepNightSummary night={night} loading={nights.isPending} />
        </Panel>
      </motion.div>

      <div className="display-lg-pair-grid">
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

function SleepNightSummary({ night, loading = false }: { night: SleepNight | null; loading?: boolean }): React.JSX.Element {
  const interruptions = night && night.stages.length > 0
    ? `${night.interruptionCount} ${night.interruptionCount === 1 ? 'moment' : 'moments'} · ${formatMinutes(night.interruptionMinutes)}`
    : '—'
  const items = [
    { label: 'In bed', value: night ? formatMinutes(night.minutesInSleepPeriod) : '—' },
    { label: 'Efficiency', value: night?.efficiency != null ? `${night.efficiency}%` : '—' },
    { label: 'Interruptions', value: interruptions }
  ]

  return (
    <div
      className="sleep-summary mx-4 mb-2 flex flex-wrap items-center gap-x-8 gap-y-2 border-t border-hairline pt-4"
      aria-busy={loading}
    >
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline gap-2">
          {loading ? (
            <>
              <SkeletonText className="w-16" />
              <SkeletonText className="h-4 w-14" />
            </>
          ) : (
            <>
              <span className="text-[10.5px] font-medium text-ink-faint">{item.label}</span>
              <span className="font-mono text-[13px] font-medium text-ink">{item.value}</span>
            </>
          )}
        </div>
      ))}
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
