import { motion } from 'framer-motion'
import { Barbell, Footprints } from '@phosphor-icons/react'
import { Panel, DrillHeader, InteractivePanel, SectionHeader } from '@/components/Panel'
import { ColumnChart, ProgressRing } from '@/components/charts'
import { MetricStat } from '@/components/MetricStat'
import { CARD_HEIGHT, SkeletonChart, SkeletonMetricStat, SkeletonRing, SkeletonRows, SkeletonText } from '@/components/Skeleton'
import { ErrorState } from '@/components/ErrorState'
import { WorkoutList } from '@/components/WorkoutList'
import { useIntraday, useSeries, useWorkouts } from '@/hooks/useHealth'
import { METRICS } from '@/lib/metric-registry'
import { baseline, baselineDeltaPct, pointValues, rangeEnding, seriesPoints } from '@/lib/metrics'
import { formatHour, formatInt, longDate, weekdayShort } from '@/lib/format'
import type { OpenMetric } from '@/lib/metric-navigation'
import { fade } from '@/lib/motion'
import type { Goals, MetricKey, Workout } from '@shared/types'

const ACTIVITY_METRICS: MetricKey[] = [
  'steps',
  'distanceKm',
  'caloriesOut',
  'activeZoneMinutes',
  'floors',
  'sedentaryMinutes'
]

const ACTIVITY_SUMMARY_METRICS: MetricKey[] = [
  'distanceKm',
  'activeZoneMinutes',
  'floors',
  'sedentaryMinutes'
]

const SUMMARY_CELL_CLASSES = [
  'border-b border-hairline',
  'border-b border-l border-hairline',
  '',
  'border-l border-hairline'
] as const

interface ActivityViewProps {
  date: string
  goals: Goals
  onOpenMetric: OpenMetric
  onOpenWorkout: (workout: Workout) => void
}

function ActivityGoalRing({
  metricKey,
  value,
  goal,
  pending,
  onOpen
}: {
  metricKey: MetricKey
  value: number | null
  goal: number
  pending: boolean
  onOpen: OpenMetric
}): React.JSX.Element {
  const def = METRICS[metricKey]
  const pct = value != null && goal > 0 ? Math.round((value / goal) * 100) : null

  if (pending) {
    return (
      <div className="flex flex-col items-center gap-2" aria-hidden>
        <SkeletonRing size={172} stroke={18} className="activity-goal-ring" />
        <SkeletonText className="w-28" />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(metricKey, 'D')}
      className="group -m-2 flex min-w-0 flex-col items-center gap-2.5 rounded-2xl p-4 outline-none transition-[background-color,box-shadow,transform] duration-200 hover:bg-white/[0.05] hover:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)] focus-visible:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.98]"
      aria-label={`Open ${def.label} details`}
    >
      <ProgressRing value={value ?? 0} goal={goal} color={def.color} size={172} stroke={18} className="activity-goal-ring">
        <div className="text-center">
          <div className="text-[30px] font-semibold leading-none tracking-tight text-ink">
            {value != null ? def.format(value) : '—'}
          </div>
          <div className="mt-1.5 text-[11px] uppercase tracking-wide text-ink-faint">{def.label}</div>
        </div>
      </ProgressRing>
      <span className="font-mono text-[12px] text-ink-dim transition-colors group-hover:text-ink">
        {pct != null
          ? `${pct}% of ${formatInt(goal)}${def.unit ? ` ${def.unit}` : ''}`
          : `${formatInt(goal)}${def.unit ? ` ${def.unit}` : ''} goal`}
      </span>
    </button>
  )
}

export function ActivityView({ date, goals, onOpenMetric, onOpenWorkout }: ActivityViewProps): React.JSX.Element {
  const { start, end } = rangeEnding(date, 7)
  const series = useSeries(ACTIVITY_METRICS, start, end)
  const intraday = useIntraday(date, true, 'steps')
  const workouts = useWorkouts(date, date)

  if (series.isError) {
    return <ErrorState message={series.error instanceof Error ? series.error.message : undefined} onRetry={() => void series.refetch()} />
  }

  const days = series.data?.days
  const today = days?.[date] ?? {}
  const pointsFor = (key: MetricKey) => seriesPoints(days, key, start, end)
  const emphasis = 6 // the selected day is the last of the 7-day window

  const trendCard = (key: MetricKey, index: number, goal?: number): React.JSX.Element => {
    const def = METRICS[key]
    const points = pointsFor(key)
    return (
      <motion.div key={key} custom={index} variants={fade} initial="hidden" animate="show">
        <InteractivePanel
          className={`flex h-full flex-col gap-3 p-5 ${CARD_HEIGHT.chart}`}
          onOpen={() => onOpenMetric(key, 'W')}
        >
          <DrillHeader
            title={def.label}
            hint="Last 7 days"
            icon={<span className="h-2 w-2 rounded-full" style={{ background: def.color }} />}
          />
          <div className="mt-auto">
            {series.isMetricPending(key) ? (
              <SkeletonChart />
            ) : (
              <ColumnChart
                data={points.map((p) => ({
                  key: p.date,
                  label: `${weekdayShort(p.date)} · ${p.date.slice(5)}`,
                  value: p.value,
                  tick: weekdayShort(p.date).slice(0, 1)
                }))}
                color={def.color}
                goal={goal != null ? { value: goal, label: 'goal' } : null}
                emphasisIndex={emphasis}
                format={def.format}
                unitLabel={def.unit}
                axisLabel={key === 'steps' ? 'steps' : def.unit}
              />
            )}
          </div>
        </InteractivePanel>
      </motion.div>
    )
  }

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-8 pb-12">
      <motion.header custom={0} variants={fade} initial="hidden" animate="show" className="pt-2">
        <h1 className="display text-[27px] font-bold text-ink">Activity</h1>
        <p className="mt-1 text-[13px] text-ink-dim">{longDate(date)}</p>
      </motion.header>

      {/* Day totals: primary goals + supporting activity metrics */}
      <motion.div custom={1} variants={fade} initial="hidden" animate="show">
        <Panel className="activity-hero">
          <div className="activity-goals">
            <ActivityGoalRing
              metricKey="steps"
              value={today.steps ?? null}
              goal={goals.steps}
              pending={series.isMetricPending('steps')}
              onOpen={onOpenMetric}
            />
            <ActivityGoalRing
              metricKey="caloriesOut"
              value={today.caloriesOut ?? null}
              goal={goals.caloriesOut}
              pending={series.isMetricPending('caloriesOut')}
              onOpen={onOpenMetric}
            />
          </div>

          <div className="activity-summary">
            {ACTIVITY_SUMMARY_METRICS.map((key, index) => {
              const def = METRICS[key]
              const points = pointsFor(key)
              const value = today[key] ?? null
              return (
                <div key={key} className={SUMMARY_CELL_CLASSES[index]}>
                  {series.isMetricPending(key) ? (
                    <SkeletonMetricStat sparkWidth={180} />
                  ) : (
                    <MetricStat
                      icon={def.icon}
                      label={def.shortLabel ?? def.label}
                      value={value != null ? def.format(value) : '—'}
                      unit={def.unit}
                      accent={def.color}
                      deltaPct={baselineDeltaPct(value, baseline(points, date))}
                      upIsGood={def.upIsGood}
                      spark={pointValues(points)}
                      sparkWidth={180}
                      onOpen={() => onOpenMetric(key, 'D')}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </Panel>
      </motion.div>

      <div className="display-lg-pair-grid display-lg-pair-grid--weighted-135">
        {/* Hourly movement */}
        <motion.div custom={2} variants={fade} initial="hidden" animate="show" className="min-w-0">
          <InteractivePanel
            className={`flex h-full min-w-0 flex-col gap-3 p-5 ${CARD_HEIGHT.large}`}
            onOpen={() => onOpenMetric('steps', 'D')}
          >
            <DrillHeader
              title="Hourly steps"
              hint="When did you move?"
              icon={<Footprints size={18} weight="fill" style={{ color: 'var(--color-activity)' }} />}
            />
            {intraday.isPending ? (
              <SkeletonChart height={180} columns={12} />
            ) : intraday.data && intraday.data.stepsHourly.length > 0 ? (
                <ColumnChart
                  data={intraday.data.stepsHourly.map((h) => ({
                    key: String(h.hour),
                    label: formatHour(h.hour),
                    value: h.steps,
                    tick: h.hour % 6 === 0 ? formatHour(h.hour) : undefined
                  }))}
                  color="var(--color-activity)"
                  height={180}
                  format={formatInt}
                  unitLabel="steps"
                />
            ) : (
              <div className="grid flex-1 place-items-center text-[13px] text-ink-faint">
                No movement recorded yet for this day.
              </div>
            )}
          </InteractivePanel>
        </motion.div>

        {/* Workouts */}
        <motion.div custom={3} variants={fade} initial="hidden" animate="show" className="min-w-0">
          <Panel className={`flex h-full min-w-0 flex-col gap-2 px-3 py-5 ${CARD_HEIGHT.large}`}>
            <div className="px-2">
              <SectionHeader
                title="Workouts"
                hint={
                  workouts.isPending ? (
                    <SkeletonText className="w-20" />
                  ) : workouts.data && workouts.data.length > 0 ? (
                    `${workouts.data.length} session${workouts.data.length > 1 ? 's' : ''}`
                  ) : (
                    'No sessions logged'
                  )
                }
                icon={<Barbell size={18} weight="fill" style={{ color: 'var(--color-recovery)' }} />}
              />
            </div>
            {workouts.isPending ? (
              <SkeletonRows />
            ) : workouts.data && workouts.data.length > 0 ? (
              <WorkoutList workouts={workouts.data} onOpen={onOpenWorkout} />
            ) : (
              <div className="grid flex-1 place-items-center text-[13px] text-ink-faint">
                Tracked exercises appear here automatically.
              </div>
            )}
          </Panel>
        </motion.div>
      </div>

      {/* 7-day trends */}
      <div className="display-lg-pair-grid">
        {trendCard('steps', 4, goals.steps)}
        {trendCard('activeZoneMinutes', 5, goals.activeZoneMinutes)}
        {trendCard('caloriesOut', 6, goals.caloriesOut)}
        {trendCard('distanceKm', 7)}
      </div>
    </div>
  )
}
