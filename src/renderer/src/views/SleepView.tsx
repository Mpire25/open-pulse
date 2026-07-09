import { motion } from 'framer-motion'
import { Moon, Bed, Timer } from '@phosphor-icons/react'
import { Panel, SectionHeader } from '@/components/Panel'
import { ColumnChart, GaugeRing } from '@/components/charts'
import { SleepStages, STAGE_COLOR } from '@/components/SleepStages'
import { useSleepHistory } from '@/hooks/useHealth'
import { formatMinutes, longDate, shortDate, weekdayShort } from '@/lib/format'
import type { Goals, HealthDay, SleepNight } from '@shared/types'
import { cn } from '@/lib/utils'

const fade = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.04 * i, duration: 0.5, ease: [0.16, 1, 0.3, 1] as const }
  })
}

interface SleepViewProps {
  day: HealthDay
  goals: Goals
  loading: boolean
}

export function SleepView({ day, goals, loading }: SleepViewProps): React.JSX.Element {
  const nights = useSleepHistory(14, day.date)
  const night = day.sleep
  const emphasis = day.trend.findIndex((d) => d.date === day.date)
  const avgAsleep =
    day.trend.reduce((s, d) => s + (d.sleepMinutes ?? 0), 0) /
    Math.max(1, day.trend.filter((d) => d.sleepMinutes != null).length)

  return (
    <div className={cn('mx-auto flex max-w-[1180px] flex-col gap-5 px-8 pb-12 transition-opacity', loading && 'opacity-60')}>
      <motion.header custom={0} variants={fade} initial="hidden" animate="show" className="pt-2">
        <h1 className="display text-[27px] font-bold text-ink">Sleep</h1>
        <p className="mt-1 text-[13px] text-ink-dim">
          Night ending {longDate(day.date)}
          {avgAsleep > 0 && ` · ${formatMinutes(avgAsleep)} average over the window`}
        </p>
      </motion.header>

      {/* Selected night */}
      <motion.div custom={1} variants={fade} initial="hidden" animate="show">
        {night ? (
          <Panel className="grid grid-cols-1 gap-8 p-7 lg:grid-cols-[auto_1fr]">
            <div className="flex flex-col items-center justify-center gap-3">
              <GaugeRing
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
              </GaugeRing>
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
              <SectionHeader
                title="Stages"
                hint="Hover a block for its timing"
                icon={<Moon size={18} weight="fill" style={{ color: 'var(--color-sleep)' }} />}
              />
              <div className="mt-5">
                <SleepStages night={night} />
              </div>
            </div>
          </Panel>
        ) : (
          <Panel className="grid place-items-center p-12 text-[13px] text-ink-faint">
            No sleep recorded for this night.
          </Panel>
        )}
      </motion.div>

      {/* Duration trend */}
      <motion.div custom={2} variants={fade} initial="hidden" animate="show">
        <Panel className="flex flex-col gap-4 p-6">
          <SectionHeader
            title="Duration, last 14 nights"
            hint="Is your sleep consistent?"
            icon={<Moon size={18} weight="fill" style={{ color: 'var(--color-sleep)' }} />}
          />
          <ColumnChart
            data={day.trend.map((d) => ({
              key: d.date,
              label: `${weekdayShort(d.date)} · ${shortDate(d.date)}`,
              value: d.sleepMinutes,
              tick: weekdayShort(d.date).slice(0, 1)
            }))}
            color="var(--color-sleep)"
            goal={{ value: goals.sleepMinutes, label: 'goal' }}
            emphasisIndex={emphasis}
            format={(v) => formatMinutes(v)}
            unitLabel="asleep"
          />
        </Panel>
      </motion.div>

      {/* Night-by-night stage mix */}
      {nights && nights.length > 1 && (
        <div>
          <h2 className="mb-3 px-1 text-[13px] font-semibold text-ink-dim">Recent nights</h2>
          <div className="flex flex-col gap-2.5">
            {[...nights]
              .reverse()
              .filter((n) => n.date !== day.date)
              .map((n, i) => (
                <motion.div
                  key={n.date}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.03 * i, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                >
                  <NightRow night={n} />
                </motion.div>
              ))}
          </div>
        </div>
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
