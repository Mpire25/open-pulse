import { motion } from 'framer-motion'
import { Footprints, Heartbeat, Moon, PersonSimpleRun } from '@phosphor-icons/react'
import { Panel, DrillHeader, SectionHeader } from '@/components/Panel'
import { ColumnChart, ProgressRing } from '@/components/charts'
import { MetricStat } from '@/components/MetricStat'
import { SleepStages } from '@/components/SleepStages'
import { Skeleton } from '@/components/Skeleton'
import { ErrorState } from '@/components/ErrorState'
import { WorkoutList } from '@/components/WorkoutList'
import type { View } from '@/components/Sidebar'
import { useIntraday, useSeries, useSleepNight, useWorkouts } from '@/hooks/useHealth'
import { METRICS } from '@/lib/metric-registry'
import { baseline, baselineDeltaPct, metricAbsent, pointValues, rangeEnding, seriesPoints } from '@/lib/metrics'
import { formatClock, formatHour, formatInt, formatMinutes, greeting, isoToday, longDate } from '@/lib/format'
import { fade } from '@/lib/motion'
import type { Goals, MetricKey } from '@shared/types'
import { cn } from '@/lib/utils'

const HOME_METRICS: MetricKey[] = [
  'steps',
  'caloriesOut',
  'activeZoneMinutes',
  'sleepMinutes',
  'restingHeartRate',
  'hrvMs',
  'spo2Pct',
  'breathingRate',
  'skinTempDeltaC'
]

const SIGNAL_KEYS: MetricKey[] = ['hrvMs', 'spo2Pct', 'breathingRate', 'skinTempDeltaC']

interface HomeViewProps {
  date: string
  goals: Goals
  onOpenMetric: (metric: MetricKey) => void
  onNavigate: (view: View) => void
}

export function HomeView({ date, goals, onOpenMetric, onNavigate }: HomeViewProps): React.JSX.Element {
  const { start, end } = rangeEnding(date, 7)
  const series = useSeries(HOME_METRICS, start, end)
  const night = useSleepNight(date)
  const workouts = useWorkouts(date, date)
  const intraday = useIntraday(date)

  const isToday = date === isoToday()
  const dim = series.isPlaceholderData

  if (series.isError) {
    return <ErrorState message={series.error instanceof Error ? series.error.message : undefined} onRetry={() => void series.refetch()} />
  }

  const days = series.data?.days
  const today = days?.[date] ?? {}
  const pointsFor = (key: MetricKey) => seriesPoints(days, key, start, end)
  const rhrBase = baseline(pointsFor('restingHeartRate'), date)

  return (
    <div className={cn('mx-auto flex max-w-[1180px] flex-col gap-5 px-8 pb-12 transition-opacity duration-300', dim && 'opacity-60')}>
      <motion.header custom={0} variants={fade} initial="hidden" animate="show" className="pt-2">
        <p className="text-[13px] font-medium text-ink-dim">{isToday ? greeting() : 'Reviewing'}</p>
        <h1 className="display mt-1 text-[27px] font-bold text-ink">{longDate(date)}</h1>
      </motion.header>

      {/* Hero: goal rings + how the night set the day up */}
      <motion.div custom={1} variants={fade} initial="hidden" animate="show">
        {series.isPending ? (
          <Skeleton className="h-56" />
        ) : (
          <Panel className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[1fr_auto]">
            <div className="flex flex-wrap items-center justify-around gap-6">
              <GoalRing value={today.steps ?? null} goal={goals.steps} metricKey="steps" onOpen={onOpenMetric} />
              <GoalRing value={today.caloriesOut ?? null} goal={goals.caloriesOut} metricKey="caloriesOut" onOpen={onOpenMetric} />
              <GoalRing
                value={today.activeZoneMinutes ?? null}
                goal={goals.activeZoneMinutes}
                metricKey="activeZoneMinutes"
                onOpen={onOpenMetric}
              />
            </div>

            <div className="flex min-w-[230px] flex-col justify-center gap-3 lg:border-l lg:border-hairline lg:pl-6">
              <HeroRow
                icon={<Moon size={15} weight="fill" style={{ color: 'var(--color-sleep)' }} />}
                label="Sleep"
                value={today.sleepMinutes != null ? formatMinutes(today.sleepMinutes) : 'No data'}
                sub={
                  today.sleepMinutes != null
                    ? `${Math.round((today.sleepMinutes / goals.sleepMinutes) * 100)}% of ${formatMinutes(goals.sleepMinutes)} goal`
                    : undefined
                }
                onClick={() => onNavigate('sleep')}
              />
              <HeroRow
                icon={<Heartbeat size={15} weight="fill" style={{ color: 'var(--color-heart)' }} />}
                label="Resting HR"
                value={today.restingHeartRate != null ? `${today.restingHeartRate} bpm` : 'No data'}
                sub={
                  today.restingHeartRate != null && rhrBase != null
                    ? `${today.restingHeartRate > Math.round(rhrBase) ? '+' : ''}${today.restingHeartRate - Math.round(rhrBase)} vs your average`
                    : undefined
                }
                onClick={() => onNavigate('heart')}
              />
              <HeroRow
                icon={<PersonSimpleRun size={15} weight="fill" style={{ color: 'var(--color-activity)' }} />}
                label="Workouts"
                value={
                  workouts.data == null
                    ? '…'
                    : workouts.data.length > 0
                      ? `${workouts.data.length} logged`
                      : 'None yet'
                }
                sub={workouts.data?.length ? workouts.data.map((w) => w.name).slice(0, 2).join(', ') : undefined}
                onClick={() => onNavigate('activity')}
              />
            </div>
          </Panel>
        )}
      </motion.div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.35fr_1fr]">
        {/* Daily movement */}
        <motion.div custom={2} variants={fade} initial="hidden" animate="show">
          {intraday.isPending ? (
            <Skeleton className="h-56" />
          ) : (
            <Panel className="flex h-full flex-col gap-4 p-6">
              <DrillHeader
                title="Daily movement"
                hint="Steps per hour"
                icon={<Footprints size={18} weight="fill" style={{ color: 'var(--color-activity)' }} />}
                onOpen={() => onOpenMetric('steps')}
              />
              {intraday.data && intraday.data.stepsHourly.length > 0 ? (
                <div className="mt-auto">
                  <ColumnChart
                    data={intraday.data.stepsHourly.map((h) => ({
                      key: String(h.hour),
                      label: formatHour(h.hour),
                      value: h.steps,
                      tick: h.hour % 6 === 0 ? formatHour(h.hour) : undefined
                    }))}
                    color="var(--color-activity)"
                    format={formatInt}
                    unitLabel="steps"
                  />
                </div>
              ) : (
                <div className="grid flex-1 place-items-center text-[13px] text-ink-faint">
                  No movement recorded yet for this day.
                </div>
              )}
            </Panel>
          )}
        </motion.div>

        {/* Last night */}
        <motion.div custom={3} variants={fade} initial="hidden" animate="show">
          {night.isPending ? (
            <Skeleton className="h-56" />
          ) : (
            <Panel className="flex h-full flex-col gap-4 p-6">
              <DrillHeader
                title="Sleep"
                hint={
                  night.data
                    ? `${formatMinutes(night.data.minutesAsleep)} asleep · ${formatClock(night.data.startTime)}–${formatClock(night.data.endTime)}`
                    : 'No sleep recorded'
                }
                icon={<Moon size={18} weight="fill" style={{ color: 'var(--color-sleep)' }} />}
                onOpen={() => onOpenMetric('sleepMinutes')}
              />
              {night.data ? (
                <SleepStages night={night.data} />
              ) : (
                <div className="grid flex-1 place-items-center text-[13px] text-ink-faint">
                  Wear your Fitbit Air to bed to see sleep stages.
                </div>
              )}
            </Panel>
          )}
        </motion.div>
      </div>

      {/* Night signals vs personal baseline */}
      <motion.div custom={4} variants={fade} initial="hidden" animate="show">
        {series.isPending ? (
          <Skeleton className="h-36" />
        ) : (
          <SignalsPanel date={date} pointsFor={pointsFor} today={todayValue(days, date)} onOpenMetric={onOpenMetric} />
        )}
      </motion.div>

      {/* Workouts */}
      {workouts.data && workouts.data.length > 0 && (
        <motion.div custom={5} variants={fade} initial="hidden" animate="show">
          <Panel className="p-3">
            <WorkoutList workouts={workouts.data} />
          </Panel>
        </motion.div>
      )}
    </div>
  )
}

function todayValue(days: Record<string, Partial<Record<MetricKey, number | null>>> | undefined, date: string) {
  return (key: MetricKey): number | null => days?.[date]?.[key] ?? null
}

function SignalsPanel({
  date,
  pointsFor,
  today,
  onOpenMetric
}: {
  date: string
  pointsFor: (key: MetricKey) => ReturnType<typeof seriesPoints>
  today: (key: MetricKey) => number | null
  onOpenMetric: (metric: MetricKey) => void
}): React.JSX.Element | null {
  const visible = SIGNAL_KEYS.filter((key) => !metricAbsent(pointsFor(key)))
  if (visible.length === 0) return null
  return (
    <Panel className="overflow-hidden">
      <div className="border-b border-hairline px-5 pb-3 pt-4">
        <SectionHeader title="Night signals" hint="Compared with your own recent baseline" />
      </div>
      <div className="grid grid-cols-2 divide-x divide-hairline lg:grid-cols-4">
        {visible.map((key) => {
          const def = METRICS[key]
          const points = pointsFor(key)
          const value = today(key)
          const base = baseline(points, date)
          return (
            <MetricStat
              key={key}
              icon={def.icon}
              label={def.shortLabel ?? def.label}
              value={value != null ? def.format(value) : '—'}
              unit={def.unit}
              accent={def.color}
              deltaPct={def.deltaMode === 'abs' ? null : baselineDeltaPct(value, base)}
              upIsGood={def.upIsGood}
              spark={pointValues(points)}
              sub={def.deltaMode === 'abs' ? 'vs device baseline' : undefined}
              onOpen={() => onOpenMetric(key)}
            />
          )
        })}
      </div>
    </Panel>
  )
}

function GoalRing({
  value,
  goal,
  metricKey,
  onOpen
}: {
  value: number | null
  goal: number
  metricKey: MetricKey
  onOpen: (metric: MetricKey) => void
}): React.JSX.Element {
  const def = METRICS[metricKey]
  const pct = value != null && goal > 0 ? Math.round((value / goal) * 100) : null
  return (
    <button onClick={() => onOpen(metricKey)} className="group flex flex-col items-center gap-2">
      <ProgressRing value={value ?? 0} goal={goal} color={def.color} size={128} stroke={11}>
        <div className="text-center">
          <div className="text-[22px] font-semibold leading-none tracking-tight text-ink">
            {value != null ? def.format(value) : '—'}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-wide text-ink-faint">{def.shortLabel ?? def.label}</div>
        </div>
      </ProgressRing>
      <span className="font-mono text-[11px] text-ink-dim transition-colors group-hover:text-ink">
        {pct != null ? `${pct}% of ${formatInt(goal)}` : 'no goal data'}
      </span>
    </button>
  )
}

function HeroRow({
  icon,
  label,
  value,
  sub,
  onClick
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className="-mx-2 flex items-start gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
    >
      <span className="mt-0.5">{icon}</span>
      <span className="flex flex-col">
        <span className="text-[11px] font-medium text-ink-faint">{label}</span>
        <span className="text-[14.5px] font-semibold text-ink">{value}</span>
        {sub && <span className="mt-0.5 text-[11px] text-ink-dim">{sub}</span>}
      </span>
    </button>
  )
}
