import { motion } from 'framer-motion'
import { Barbell, Footprints } from '@phosphor-icons/react'
import { Panel, DrillHeader, InteractivePanel, SectionHeader } from '@/components/Panel'
import { ColumnChart } from '@/components/charts'
import { MetricStat } from '@/components/MetricStat'
import { CARD_HEIGHT, SkeletonChart, SkeletonMetricStat, SkeletonRows, SkeletonText } from '@/components/Skeleton'
import { ErrorState } from '@/components/ErrorState'
import { WorkoutList } from '@/components/WorkoutList'
import { useIntraday, useSeries, useWorkouts } from '@/hooks/useHealth'
import { METRICS } from '@/lib/metric-registry'
import { baseline, baselineDeltaPct, pointValues, rangeEnding, seriesPoints } from '@/lib/metrics'
import { formatHour, formatInt, longDate, weekdayShort } from '@/lib/format'
import { fade } from '@/lib/motion'
import type { Goals, MetricKey } from '@shared/types'

const ACTIVITY_METRICS: MetricKey[] = [
  'steps',
  'distanceKm',
  'caloriesOut',
  'activeZoneMinutes',
  'floors',
  'sedentaryMinutes'
]

interface ActivityViewProps {
  date: string
  goals: Goals
  onOpenMetric: (metric: MetricKey) => void
}

export function ActivityView({ date, goals, onOpenMetric }: ActivityViewProps): React.JSX.Element {
  const { start, end } = rangeEnding(date, 7)
  const series = useSeries(ACTIVITY_METRICS, start, end)
  const intraday = useIntraday(date)
  const workouts = useWorkouts(date, date)

  if (series.isError) {
    return <ErrorState message={series.error instanceof Error ? series.error.message : undefined} onRetry={() => void series.refetch()} />
  }

  const days = series.data?.days
  const pointsFor = (key: MetricKey) => seriesPoints(days, key, start, end)
  const emphasis = 6 // the selected day is the last of the 7-day window

  const trendCard = (key: MetricKey, index: number, goal?: number): React.JSX.Element => {
    const def = METRICS[key]
    const points = pointsFor(key)
    return (
      <motion.div key={key} custom={index} variants={fade} initial="hidden" animate="show">
        <InteractivePanel
          className={`flex h-full flex-col gap-3 p-5 ${CARD_HEIGHT.chart}`}
          onOpen={() => onOpenMetric(key)}
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
    <div className="mx-auto flex max-w-[1320px] flex-col gap-5 px-8 pb-12">
      <motion.header custom={0} variants={fade} initial="hidden" animate="show" className="pt-2">
        <h1 className="display text-[27px] font-bold text-ink">Activity</h1>
        <p className="mt-1 text-[13px] text-ink-dim">{longDate(date)}</p>
      </motion.header>

      {/* Day totals */}
      <motion.div custom={1} variants={fade} initial="hidden" animate="show">
        <Panel className={`grid grid-cols-2 divide-x divide-y divide-hairline overflow-hidden sm:grid-cols-3 xl:grid-cols-6 xl:divide-y-0 ${CARD_HEIGHT.compact}`}>
          {ACTIVITY_METRICS.map((key) => {
            const def = METRICS[key]
            const points = pointsFor(key)
            const value = days?.[date]?.[key] ?? null
            return series.isMetricPending(key) ? (
              <SkeletonMetricStat key={key} sparkWidth={56} />
            ) : (
                <MetricStat
                  key={key}
                  icon={def.icon}
                  label={def.shortLabel ?? def.label}
                  value={value != null ? def.format(value) : '—'}
                  unit={def.unit}
                  accent={def.color}
                  deltaPct={baselineDeltaPct(value, baseline(points, date))}
                  upIsGood={def.upIsGood}
                  spark={pointValues(points)}
                  sparkWidth={56}
                  onOpen={() => onOpenMetric(key)}
                />
            )
          })}
        </Panel>
      </motion.div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* Hourly movement */}
        <motion.div custom={2} variants={fade} initial="hidden" animate="show" className="min-w-0">
          <InteractivePanel
            className={`flex h-full min-w-0 flex-col gap-3 p-5 ${CARD_HEIGHT.large}`}
            onOpen={() => onOpenMetric('steps')}
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
            {workouts.isPending ? (
              <SkeletonRows />
            ) : workouts.data && workouts.data.length > 0 ? (
              <WorkoutList workouts={workouts.data} />
            ) : (
              <div className="grid flex-1 place-items-center text-[13px] text-ink-faint">
                Tracked exercises appear here automatically.
              </div>
            )}
          </Panel>
        </motion.div>
      </div>

      {/* 7-day trends */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {trendCard('steps', 4, goals.steps)}
        {trendCard('activeZoneMinutes', 5, goals.activeZoneMinutes)}
        {trendCard('caloriesOut', 6, goals.caloriesOut)}
        {trendCard('distanceKm', 7)}
      </div>
    </div>
  )
}
