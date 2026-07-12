import { motion } from 'framer-motion'
import { Barbell, Footprints, Heartbeat, Moon, PersonSimpleRun } from '@phosphor-icons/react'
import { Panel, DrillHeader, InteractivePanel, SectionHeader } from '@/components/Panel'
import { ColumnChart, ProgressRing } from '@/components/charts'
import { MetricStat } from '@/components/MetricStat'
import { SleepStages } from '@/components/SleepStages'
import {
  CARD_HEIGHT,
  SkeletonChart,
  SkeletonMetricStat,
  SkeletonRing,
  SkeletonRows,
  SkeletonSleepStages,
  SkeletonText
} from '@/components/Skeleton'
import { ErrorState } from '@/components/ErrorState'
import { WorkoutList } from '@/components/WorkoutList'
import type { View } from '@/components/Sidebar'
import { useIntraday, useSeries, useSleepNight, useWorkouts } from '@/hooks/useHealth'
import { METRICS } from '@/lib/metric-registry'
import { baseline, baselineDeltaPct, pointValues, rangeEnding, seriesPoints } from '@/lib/metrics'
import { formatClock, formatHour, formatInt, formatMinutes, greeting, isoToday, longDate } from '@/lib/format'
import type { OpenMetric } from '@/lib/metric-navigation'
import { fade } from '@/lib/motion'
import type { Goals, MetricKey, Workout } from '@shared/types'

const HOME_METRICS: MetricKey[] = [
  'steps',
  'caloriesOut',
  'caloriesIn',
  'restingHeartRate',
  'hrvMs',
  'spo2Pct',
  'breathingRate',
  'skinTempDeltaC'
]

const SIGNAL_KEYS: MetricKey[] = ['hrvMs', 'spo2Pct', 'breathingRate', 'skinTempDeltaC']
const HOME_RING_SIZE = 'lg:!h-[172px] lg:!w-[172px] xl:!h-[188px] xl:!w-[188px] 2xl:!h-[200px] 2xl:!w-[200px]'

interface HomeViewProps {
  date: string
  goals: Goals
  onOpenMetric: OpenMetric
  onOpenWorkout: (workout: Workout) => void
  onNavigate: (view: View) => void
}

export function HomeView({ date, goals, onOpenMetric, onOpenWorkout, onNavigate }: HomeViewProps): React.JSX.Element {
  const { start, end } = rangeEnding(date, 7)
  const series = useSeries(HOME_METRICS, start, end)
  const night = useSleepNight(date)
  const workouts = useWorkouts(date, date)
  const intraday = useIntraday(date, true, 'steps')

  const isToday = date === isoToday()

  if (series.isError) {
    return <ErrorState message={series.error instanceof Error ? series.error.message : undefined} onRetry={() => void series.refetch()} />
  }

  const days = series.data?.days
  const today = days?.[date] ?? {}
  const pointsFor = (key: MetricKey) => seriesPoints(days, key, start, end)
  const rhrBase = baseline(pointsFor('restingHeartRate'), date)

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-8 pb-12">
      <motion.header custom={0} variants={fade} initial="hidden" animate="show" className="pt-2">
        <p className="text-[13px] font-medium text-ink-dim">{isToday ? greeting() : 'Reviewing'}</p>
        <h1 className="display mt-1 text-[27px] font-bold text-ink">{longDate(date)}</h1>
      </motion.header>

      {/* Hero: goal rings + how the night set the day up */}
      <motion.div custom={1} variants={fade} initial="hidden" animate="show">
        <Panel className={`grid grid-cols-1 gap-6 p-6 lg:grid-cols-[1fr_auto] ${CARD_HEIGHT.hero}`}>
          <div className="flex flex-wrap items-center justify-around gap-6">
            {series.isMetricPending('steps') ? (
              <GoalRingSkeleton />
            ) : (
              <GoalRing value={today.steps ?? null} goal={goals.steps} metricKey="steps" onOpen={onOpenMetric} />
            )}
            {series.isMetricPending('caloriesOut') ? (
              <GoalRingSkeleton />
            ) : (
              <GoalRing
                value={today.caloriesOut ?? null}
                goal={goals.caloriesOut}
                metricKey="caloriesOut"
                label="Calories burned"
                onOpen={onOpenMetric}
              />
            )}
            {series.isMetricPending('caloriesIn') ? (
              <GoalRingSkeleton />
            ) : (
              <GoalRing
                value={today.caloriesIn ?? null}
                goal={goals.caloriesIn}
                metricKey="caloriesIn"
                label="Calories eaten"
                onOpen={onOpenMetric}
              />
            )}
          </div>

          <div className="flex min-w-[230px] flex-col justify-center gap-3 lg:border-l lg:border-hairline lg:pl-6">
            <HeroRow
              icon={<Moon size={15} weight="fill" style={{ color: 'var(--color-sleep)' }} />}
              label="Sleep"
              value={
                night.isPending ? (
                  <SkeletonText className="h-3.5 w-20" />
                ) : night.data ? (
                  formatMinutes(night.data.minutesAsleep)
                ) : (
                  'No data'
                )
              }
              sub={
                night.isPending ? (
                  <SkeletonText className="w-28" />
                ) : night.data ? (
                  `${Math.round((night.data.minutesAsleep / goals.sleepMinutes) * 100)}% of ${formatMinutes(goals.sleepMinutes)} goal`
                ) : undefined
              }
              onClick={() => onNavigate('sleep')}
            />
            <HeroRow
              icon={<Heartbeat size={15} weight="fill" style={{ color: 'var(--color-heart)' }} />}
              label="Resting HR"
              value={
                series.isMetricPending('restingHeartRate') ? (
                  <SkeletonText className="h-3.5 w-20" />
                ) : today.restingHeartRate != null ? (
                  `${today.restingHeartRate} bpm`
                ) : (
                  'No data'
                )
              }
              sub={
                series.isMetricPending('restingHeartRate') ? (
                  <SkeletonText className="w-28" />
                ) : today.restingHeartRate != null && rhrBase != null ? (
                  today.restingHeartRate === Math.round(rhrBase) ? (
                    'Same as your average'
                  ) : (
                    `${today.restingHeartRate > Math.round(rhrBase) ? '+' : ''}${today.restingHeartRate - Math.round(rhrBase)} vs your average`
                  )
                ) : undefined
              }
              onClick={() => onNavigate('heart')}
            />
            <HeroRow
              icon={<PersonSimpleRun size={15} weight="fill" style={{ color: 'var(--color-activity)' }} />}
              label="Workouts"
              value={
                workouts.isPending ? (
                  <SkeletonText className="h-3.5 w-20" />
                ) : workouts.data && workouts.data.length > 0 ? (
                  `${workouts.data.length} logged`
                ) : (
                  'None yet'
                )
              }
              sub={
                workouts.isPending ? (
                  <SkeletonText className="w-28" />
                ) : workouts.data?.length ? (
                  workouts.data.map((w) => w.name).slice(0, 2).join(', ')
                ) : undefined
              }
              onClick={() => onNavigate('activity')}
            />
          </div>
        </Panel>
      </motion.div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* Daily movement */}
        <motion.div custom={2} variants={fade} initial="hidden" animate="show" className="min-w-0">
          <InteractivePanel
            className={`flex h-full min-w-0 flex-col gap-3 p-5 ${CARD_HEIGHT.large}`}
            onOpen={() => onOpenMetric('steps', 'D')}
          >
            <DrillHeader
              title="Daily movement"
              hint="Steps per hour"
              icon={<Footprints size={18} weight="fill" style={{ color: 'var(--color-activity)' }} />}
            />
            {intraday.isPending ? (
              <div className="mt-auto">
                <SkeletonChart />
              </div>
            ) : intraday.data && intraday.data.stepsHourly.length > 0 ? (
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
          </InteractivePanel>
        </motion.div>

        {/* Last night */}
        <motion.div custom={3} variants={fade} initial="hidden" animate="show" className="min-w-0">
          <InteractivePanel
            className={`flex h-full min-w-0 flex-col gap-3 p-5 ${CARD_HEIGHT.large}`}
            onOpen={() => onNavigate('sleep')}
          >
            <DrillHeader
              title="Sleep"
              hint={
                night.isPending ? (
                  <SkeletonText className="w-36" />
                ) : night.data ? (
                  `${formatMinutes(night.data.minutesAsleep)} asleep · ${formatClock(night.data.startTime)}–${formatClock(night.data.endTime)}`
                ) : (
                  'No sleep recorded'
                )
              }
              icon={<Moon size={18} weight="fill" style={{ color: 'var(--color-sleep)' }} />}
            />
            {night.isPending ? (
              <SkeletonSleepStages />
            ) : night.data ? (
              <SleepStages night={night.data} />
            ) : (
              <div className="grid flex-1 place-items-center text-[13px] text-ink-faint">
                Wear your Fitbit Air to bed to see sleep stages.
              </div>
            )}
          </InteractivePanel>
        </motion.div>
      </div>

      {/* Night signals vs personal baseline */}
      <motion.div custom={4} variants={fade} initial="hidden" animate="show">
        <SignalsPanel
          date={date}
          pointsFor={pointsFor}
          today={todayValue(days, date)}
          isPending={series.isMetricPending}
          onOpenMetric={onOpenMetric}
        />
      </motion.div>

      {/* Workouts */}
      {(workouts.isPending || (workouts.data && workouts.data.length > 0)) && (
        <motion.div custom={5} variants={fade} initial="hidden" animate="show">
          <Panel className="flex min-h-[126px] flex-col gap-2 px-3 py-5">
            <div className="px-2">
              <SectionHeader
                title="Workouts"
                hint={
                  workouts.isPending ? (
                    <SkeletonText className="w-20" />
                  ) : (
                    `${workouts.data?.length ?? 0} session${workouts.data?.length === 1 ? '' : 's'}`
                  )
                }
                icon={<Barbell size={18} weight="fill" style={{ color: 'var(--color-recovery)' }} />}
              />
            </div>
            {workouts.isPending ? (
              <SkeletonRows />
            ) : (
              <WorkoutList workouts={workouts.data ?? []} onOpen={onOpenWorkout} />
            )}
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
  isPending,
  onOpenMetric
}: {
  date: string
  pointsFor: (key: MetricKey) => ReturnType<typeof seriesPoints>
  today: (key: MetricKey) => number | null
  isPending: (key: MetricKey) => boolean
  onOpenMetric: OpenMetric
}): React.JSX.Element {
  return (
    <Panel className={`overflow-hidden ${CARD_HEIGHT.summary}`}>
      <div className="border-b border-hairline px-5 pb-3 pt-4">
        <SectionHeader title="Night signals" hint="Compared with your own recent baseline" />
      </div>
      <div className="grid grid-cols-2 divide-x divide-hairline lg:grid-cols-4">
        {SIGNAL_KEYS.map((key) => {
          const def = METRICS[key]
          const points = pointsFor(key)
          const value = today(key)
          const base = baseline(points, date)
          return isPending(key) ? (
            <SkeletonMetricStat key={key} />
          ) : (
            <MetricStat
              key={key}
              icon={def.icon}
              label={def.shortLabel ?? def.label}
              value={value != null ? def.format(value) : '—'}
              unit={def.unit}
              accent={def.color}
              delta={def.deltaMode === 'abs' ? value : baselineDeltaPct(value, base)}
              deltaFormat={def.deltaMode === 'abs' ? (magnitude) => `${magnitude.toFixed(1)}°C` : undefined}
              deltaMinMagnitude={def.deltaMode === 'abs' ? 0.5 : undefined}
              showTypicalDelta
              upIsGood={def.upIsGood}
              spark={pointValues(points)}
              sub={def.deltaMode === 'abs' && value != null ? 'vs device baseline' : undefined}
              onOpen={() => onOpenMetric(key, 'D')}
            />
          )
        })}
      </div>
    </Panel>
  )
}

function GoalRingSkeleton(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-2" aria-hidden>
      <SkeletonRing
        size={148}
        stroke={17}
        className={HOME_RING_SIZE}
        contentClassName="lg:scale-110 xl:scale-125 2xl:scale-[1.35]"
      />
      <SkeletonText className="w-20 lg:h-3.5 lg:w-24 xl:w-28 2xl:h-4 2xl:w-32" />
    </div>
  )
}

function GoalRing({
  value,
  goal,
  metricKey,
  label,
  onOpen
}: {
  value: number | null
  goal: number
  metricKey: MetricKey
  label?: string
  onOpen: OpenMetric
}): React.JSX.Element {
  const def = METRICS[metricKey]
  const pct = value != null && goal > 0 ? Math.round((value / goal) * 100) : null
  return (
    <button
      type="button"
      onClick={() => onOpen(metricKey, 'D')}
      className="group -m-5 flex flex-col items-center gap-2 rounded-2xl p-5 outline-none transition-[background-color,box-shadow,transform] duration-200 hover:bg-white/[0.05] hover:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)] focus-visible:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.985]"
      aria-label={`Open ${def.label} details`}
    >
      <ProgressRing
        value={value ?? 0}
        goal={goal}
        color={def.color}
        size={148}
        stroke={17}
        className={HOME_RING_SIZE}
      >
        <div className="text-center">
          <div className="text-[22px] font-semibold leading-none tracking-tight text-ink lg:text-[25px] xl:text-[28px] 2xl:text-[30px]">
            {value != null ? def.format(value) : '—'}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-wide text-ink-faint lg:text-[11px] xl:text-[12px] 2xl:text-[12.5px]">
            {label ?? def.shortLabel ?? def.label}
          </div>
        </div>
      </ProgressRing>
      <span className="font-mono text-[11px] text-ink-dim transition-colors group-hover:text-ink lg:text-[12px] xl:text-[13px] 2xl:text-[13.5px]">
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
  value: React.ReactNode
  sub?: React.ReactNode
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
