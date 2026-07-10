import { motion } from 'framer-motion'
import { Moon, Bed, Timer } from '@phosphor-icons/react'
import { Panel, DrillHeader, InteractivePanel } from '@/components/Panel'
import { ColumnChart, ProgressRing, TrendLine } from '@/components/charts'
import { SleepStages, STAGE_COLOR } from '@/components/SleepStages'
import { CARD_HEIGHT, SkeletonChart, SkeletonRing, SkeletonSleepStages, SkeletonText } from '@/components/Skeleton'
import { useSleepRange } from '@/hooks/useHealth'
import { listDates, rangeEnding } from '@/lib/metrics'
import { formatMinutes, longDate, shortDate, weekdayShort } from '@/lib/format'
import { fade } from '@/lib/motion'
import type { Goals, MetricKey, SleepNight } from '@shared/types'

interface SleepViewProps {
  date: string
  goals: Goals
  onOpenMetric: (metric: MetricKey) => void
}

export function SleepView({ date, goals, onOpenMetric }: SleepViewProps): React.JSX.Element {
  const { start, end } = rangeEnding(date, 7)
  const nights = useSleepRange(start, end)

  const byDate = new Map((nights.data ?? []).map((n) => [n.date, n]))
  const night = byDate.get(date) ?? null
  const recorded = nights.data?.filter((n) => n.minutesAsleep > 0) ?? []
  const avgAsleep = recorded.length
    ? recorded.reduce((s, n) => s + n.minutesAsleep, 0) / recorded.length
    : 0

  const dates = listDates(start, end)

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
            onOpen={() => onOpenMetric('sleepMinutes')}
          >
            <div className="flex flex-col items-center justify-center gap-3" aria-hidden>
              <SkeletonRing size={140} stroke={12} />
              <SkeletonText className="w-28" />
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
          </InteractivePanel>
        ) : night ? (
          <InteractivePanel
            className={`grid grid-cols-1 gap-8 p-7 lg:grid-cols-[auto_1fr] ${CARD_HEIGHT.detail}`}
            onOpen={() => onOpenMetric('sleepMinutes')}
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
              <span className="font-mono text-[11px] text-ink-dim">
                {Math.round((night.minutesAsleep / goals.sleepMinutes) * 100)}% of {formatMinutes(goals.sleepMinutes)} goal
              </span>
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
              onOpen={() => onOpenMetric('sleepMinutes')}
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
              onOpen={() => onOpenMetric('sleepEfficiency')}
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
                <NightRow key={n.date} night={n} />
              ))}
          </div>
        </motion.div>
      )}
    </div>
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
function NightRow({ night }: { night: SleepNight }): React.JSX.Element {
  const order = ['DEEP', 'LIGHT', 'REM', 'AWAKE'] as const
  const total = order.reduce((s, k) => s + (night.stageMinutes[k] ?? 0), 0) || 1

  return (
    <Panel className="flex items-center gap-4 px-5 py-3.5">
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
    </Panel>
  )
}
