import { Barbell, Moon } from '@phosphor-icons/react'
import { DASHBOARD_TREND_PERIODS, type DashboardTrendDays, type DashboardWidget } from '@shared/dashboard'
import type { Goals, MetricKey, Workout } from '@shared/types'
import { selectedSleepSession } from '@shared/sleep'
import {
  useActivityIntraday,
  useIntraday,
  useSeries,
  useSleepDay,
  useWorkouts
} from '@/hooks/useHealth'
import { METRICS } from '@/lib/metric-registry'
import { metricGoal, summaryReading } from '@/lib/dashboard-widgets'
import { pointValues, rangeEnding, seriesPoints, weeklyAverageBuckets } from '@/lib/metrics'
import { formatClock, formatHour, formatMinuteOfDay, formatMinutes, shortDate } from '@/lib/format'
import type { MetricRange } from '@/lib/metric-navigation'
import { ColumnChart, IntradayLine, ProgressRing, TrendLine } from './charts'
import { DrillHeader, DrillPanel, Panel } from './Panel'
import { MetricStat } from './MetricStat'
import { SleepStages, STAGE_COLOR, STAGE_LABEL } from './SleepStages'
import { CARD_HEIGHT, SkeletonChart, SkeletonRing, SkeletonRows, SkeletonText } from './Skeleton'
import { WorkoutList } from './WorkoutList'

export type DashboardOpenMetric = (metric: MetricKey, range: MetricRange, date?: string) => void
interface MetricProps {
  metric: MetricKey
  date: string
  goals: Goals
  enabled?: boolean
  onOpen: DashboardOpenMetric
}

function useReading(metric: MetricKey, date: string, goals: Goals, enabled: boolean) {
  const sleepMetric = metric === 'sleepMinutes' || metric === 'sleepEfficiency'
  const range = rangeEnding(date, METRICS[metric].aggregate === 'last' ? 30 : 7)
  const series = useSeries(sleepMetric ? [] : [metric], range.start, date, enabled && !sleepMetric)
  const sleep = useSleepDay(date, enabled && sleepMetric)
  const points = sleepMetric
    ? [
        {
          date,
          value: sleep.data
            ? metric === 'sleepMinutes'
              ? sleep.data.minutesAsleep
              : sleep.data.efficiency
            : null
        }
      ]
    : seriesPoints(series.data?.days, metric, range.start, date)
  return {
    ...summaryReading(metric, points, date, goals),
    points,
    pending: sleepMetric ? sleep.isPending : series.isMetricPending(metric),
    error: sleepMetric ? sleep.isError : series.isError,
    retry: () => {
      if (sleepMetric) void sleep.refetch()
      else void series.refetch()
    }
  }
}

function Retry({ onRetry }: { onRetry: () => void }): React.JSX.Element {
  return (
    <button type="button" className="dashboard-retry" onClick={onRetry}>
      Could not load data · Retry
    </button>
  )
}

export function DashboardRing({
  metric,
  date,
  goals,
  enabled = true,
  onOpen,
  compact = false
}: MetricProps & { compact?: boolean }): React.JSX.Element {
  const reading = useReading(metric, date, goals, enabled)
  const def = METRICS[metric]
  const goal = metricGoal(metric, goals) ?? 0
  const label = compact
    ? metric === 'caloriesOut'
      ? 'Burned'
      : metric === 'caloriesIn'
        ? 'Eaten'
        : (def.shortLabel ?? def.label)
    : metric === 'caloriesOut'
      ? 'Calories burned'
      : metric === 'caloriesIn'
        ? 'Calories eaten'
        : (def.shortLabel ?? def.label)
  const caption = reading.pending
    ? 'Loading…'
    : reading.error
      ? 'Unable to load'
      : reading.value === null
        ? 'No data'
        : goal > 0
          ? `${Math.round((reading.value / goal) * 100)}% of ${def.format(goal)}`
          : 'No goal set'
  return (
    <div className="dashboard-ring-slot">
      <button
        type="button"
        className={compact ? 'menu-ring' : 'dashboard-home-ring'}
        aria-label={`Open ${def.shortLabel ?? def.label} details`}
        aria-busy={reading.pending}
        disabled={reading.pending}
        onClick={() => onOpen(metric, 'D', date)}
      >
        {reading.pending && !compact ? (
          <SkeletonRing
            size={120}
            stroke={14}
            className="home-goal-ring"
            contentClassName="home-goal-skeleton-content"
          />
        ) : (
          <ProgressRing
            value={reading.value ?? 0}
            goal={goal}
            color={def.color}
            size={compact ? 116 : 120}
            stroke={compact ? 10 : 14}
            className={compact ? undefined : 'home-goal-ring'}
          >
            <div className="text-center">
              <strong
                className={
                  compact
                    ? undefined
                    : 'home-goal-value block font-semibold leading-none tracking-tight text-ink'
                }
              >
                {reading.value !== null ? def.format(reading.value) : '—'}
              </strong>
              <span
                className={
                  compact
                    ? undefined
                    : 'home-goal-label mt-1 block uppercase tracking-wide text-ink-faint'
                }
              >
                {label}
              </span>
            </div>
          </ProgressRing>
        )}
        {compact ? (
          <small>{caption}</small>
        ) : reading.pending ? (
          <SkeletonText className="home-goal-skeleton-label" />
        ) : (
          <span className="home-goal-caption font-mono text-ink-dim">{caption}</span>
        )}
      </button>
      {reading.error && <Retry onRetry={reading.retry} />}
    </div>
  )
}

export function DashboardSummary({
  metric,
  date,
  goals,
  enabled = true,
  onOpen,
  presentation
}: MetricProps & { presentation: 'hero' | 'tile' | 'compact' }): React.JSX.Element {
  const reading = useReading(metric, date, goals, enabled)
  const def = METRICS[metric]
  const Icon = def.icon
  const value =
    reading.value !== null
      ? def.format(reading.value)
      : reading.pending
        ? 'Loading…'
        : reading.error
          ? 'Unavailable'
          : 'No data'
  const open = (): void => onOpen(metric, 'D', reading.date)
  return (
    <div className={`dashboard-summary-slot dashboard-summary-slot--${presentation}`}>
      {presentation === 'tile' ? (
        <MetricStat
          icon={Icon}
          label={def.shortLabel ?? def.label}
          value={reading.value !== null ? value : '—'}
          unit={def.unit}
          accent={def.color}
          deltaPct={reading.delta}
          upIsGood={def.upIsGood}
          spark={pointValues(reading.points)}
          sub={reading.error ? 'Unable to load' : reading.sub}
          onOpen={open}
          loading={reading.pending}
        />
      ) : presentation === 'compact' ? (
        <button
          type="button"
          onClick={open}
          aria-label={`Open ${def.shortLabel ?? def.label} details`}
        >
          <span>
            <Icon size={14} color={def.color} />
            {def.shortLabel ?? def.label}
          </span>
          <strong>
            {value}
            {reading.value !== null && def.unit ? ` ${def.unit}` : ''}
          </strong>
          <small>{reading.detailSub}</small>
        </button>
      ) : (
        <button
          type="button"
          onClick={open}
          className="home-hero-stat -mx-2 flex min-h-[70px] items-start gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
          aria-label={`Open ${def.shortLabel ?? def.label} details`}
        >
          <span className="mt-0.5">
            <Icon size={15} weight="fill" color={def.color} />
          </span>
          <span className="grid min-w-0 grid-rows-[17px_22px_19px]">
            <span className="truncate text-[11px] font-medium leading-[17px] text-ink-faint">{def.shortLabel ?? def.label}</span>
            <strong className="flex min-w-0 items-center overflow-hidden text-[14.5px] font-semibold leading-[22px] text-ink">
              {reading.pending ? (
                <SkeletonText className="h-3.5 w-20" />
              ) : (
                `${value}${reading.value !== null && def.unit ? ` ${def.unit}` : ''}`
              )}
            </strong>
            <span className="flex min-w-0 items-center overflow-hidden pt-0.5 text-ellipsis whitespace-nowrap text-[11px] leading-[17px] text-ink-dim">
              {reading.pending ? <SkeletonText className="w-28" /> : reading.detailSub}
            </span>
          </span>
        </button>
      )}
      {reading.error && <Retry onRetry={reading.retry} />}
    </div>
  )
}

interface ChartProps {
  widget: DashboardWidget
  date: string
  goals: Goals
  enabled?: boolean
  compact?: boolean
  wide?: boolean
  onOpen: DashboardOpenMetric
  onSleep: () => void
  onWorkouts?: () => void
  onWorkout?: (workout: Workout) => void
}
export function DashboardChart(props: ChartProps): React.JSX.Element | null {
  const { widget } = props
  if (widget.kind === 'hidden') return null
  if (widget.kind === 'trend')
    return <TrendWidget {...props} metric={widget.metric} days={widget.days} />
  if (widget.kind === 'intraday')
    return widget.metric === 'restingHeartRate'
      ? <HeartRateWidget {...props} />
      : <IntradayWidget {...props} metric={widget.metric} />
  if (widget.kind === 'sleepStages') return <SleepWidget {...props} />
  return <WorkoutsWidget {...props} />
}

function ChartFrame({
  compact,
  wide,
  title,
  hint,
  icon,
  onOpen,
  children
}: {
  compact?: boolean
  wide?: boolean
  title: string
  hint: React.ReactNode
  icon: React.ReactNode
  onOpen: () => void
  children: React.ReactNode
}): React.JSX.Element {
  if (compact)
    return (
      <section className="menu-section dashboard-compact-chart">
        <button type="button" className="menu-section-title" onClick={onOpen}>
          <h2>{title}</h2>
          <span>{hint} ›</span>
        </button>
        {children}
      </section>
    )
  // The chart owns point selection; a separate header avoids nested click targets.
  return (
    <Panel
      className={`flex h-full min-w-0 flex-col gap-3 p-5 ${wide ? CARD_HEIGHT.chart : CARD_HEIGHT.large}`}
    >
      <DrillHeader title={title} hint={hint} icon={icon} onOpen={onOpen} />
      <div className="mt-auto">{children}</div>
    </Panel>
  )
}

function TrendWidget({
  metric,
  days,
  date,
  goals,
  enabled = true,
  compact,
  wide,
  onOpen
}: ChartProps & { metric: MetricKey; days: DashboardTrendDays }): React.JSX.Element {
  const range = rangeEnding(date, days)
  const series = useSeries([metric], range.start, date, enabled)
  const points = seriesPoints(series.data?.days, metric, range.start, date)
  const def = METRICS[metric]
  const period = DASHBOARD_TREND_PERIODS.find(period => period.days === days)!
  const weekly = days === 365 && def.chart === 'bar' ? weeklyAverageBuckets(points) : null
  const chartPoints = weekly ?? points
  const Icon = def.icon
  const height = compact ? 105 : 170
  const goal = metricGoal(metric, goals)
  const title = compact && metric === 'steps' && days === 7 ? 'Steps this week' : def.label
  const chart =
    def.chart === 'bar' ? (
      <ColumnChart
        data={chartPoints.map((p, index) => ({
          key: p.date,
          value: p.value,
          label: weekly ? `${shortDate(weekly[index].date)}–${shortDate(weekly[index].endDate)} · daily average` : shortDate(p.date),
          tick:
            days === 7
              ? new Date(`${p.date}T12:00:00`).toLocaleDateString([], { weekday: 'narrow' })
              : days >= 90 && (index === 0 || p.date.slice(0, 7) !== chartPoints[index - 1].date.slice(0, 7))
                ? new Date(`${p.date}T12:00:00`).toLocaleDateString([], { month: 'short' })
                : undefined
        }))}
        color={def.color}
        height={height}
        emphasisIndex={weekly ? undefined : points.length - 1}
        goal={goal !== null && goal > 0 ? { value: goal, label: 'Goal' } : null}
        format={def.format}
        unitLabel={def.unit || (metric === 'steps' ? 'steps' : '')}
        onSelect={weekly ? undefined : (p) => onOpen(metric, 'D', p.key)}
      />
    ) : (
      <TrendLine
        data={points.map((p) => ({ ...p, label: shortDate(p.date) }))}
        color={def.color}
        height={height}
        format={def.format}
        unitLabel={def.unit}
        onSelect={(p) => onOpen(metric, 'D', p.date)}
      />
    )
  return (
    <ChartFrame
      compact={compact}
      wide={wide}
      title={title}
      hint={`${period.hint}${weekly ? ' · weekly daily averages' : ''}`}
      icon={<Icon size={18} weight="fill" color={def.color} />}
      onOpen={() => onOpen(metric, period.range, date)}
    >
      {series.isError ? (
        <Retry onRetry={() => void series.refetch()} />
      ) : series.isMetricPending(metric) ? (
        <SkeletonChart
          height={height}
          columns={chartPoints.length}
          variant={def.chart === 'line' ? 'line' : undefined}
        />
      ) : points.every((p) => p.value === null) ? (
        <div className="dashboard-chart-empty" style={{ height }}>
          {compact && metric === 'steps' && days === 7
            ? 'No steps recorded this week'
            : `No ${def.label.toLowerCase()} recorded in this period`}
        </div>
      ) : (
        chart
      )}
    </ChartFrame>
  )
}

function IntradayWidget({
  metric,
  date,
  enabled = true,
  compact,
  wide,
  onOpen
}: ChartProps & { metric: MetricKey }): React.JSX.Element {
  const steps = useIntraday(date, enabled && metric === 'steps', 'steps')
  const activity = useActivityIntraday(
    date,
    metric === 'steps' ? 'activeMinutes' : (metric as Parameters<typeof useActivityIntraday>[1]),
    enabled && metric !== 'steps'
  )
  const query = metric === 'steps' ? steps : activity
  const def = METRICS[metric]
  const unitLabel = metric === 'steps' || metric === 'floors' ? metric : def.unit
  const Icon = def.icon
  const height = compact ? 105 : 170
  const data =
    metric === 'steps'
      ? (steps.data?.stepsHourly ?? []).map((h) => ({
          key: String(h.hour),
          label: formatHour(h.hour),
          value: h.steps,
          tick: h.hour % 6 === 0 ? formatHour(h.hour) : undefined
        }))
      : (activity.data?.points ?? []).map((p) => ({
          key: String(p.minute),
          label: formatMinuteOfDay(p.minute),
          value: p.value,
          tick: p.minute % 360 === 0 ? formatHour(p.minute / 60) : undefined
        }))
  return (
    <ChartFrame
      compact={compact}
      wide={wide}
      title={metric === 'steps' ? 'Daily movement' : def.label}
      hint={metric === 'steps' ? 'Steps per hour' : 'Throughout the day'}
      icon={<Icon size={18} weight="fill" color={def.color} />}
      onOpen={() => onOpen(metric, 'D', date)}
    >
      {query.isError ? (
        <Retry onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <SkeletonChart height={height} columns={metric === 'steps' ? 24 : 48} />
      ) : data.length && data.some((p) => p.value !== null) ? (
        <ColumnChart
          data={data}
          height={height}
          color={def.color}
          format={def.format}
          unitLabel={unitLabel}
          axisLabel={metric === 'sedentaryMinutes' ? 'min' : unitLabel}
        />
      ) : (
        <div className="dashboard-chart-empty" style={{ height }}>
          {metric === 'steps' ? 'No movement recorded yet for this day.' : `No ${def.label.toLowerCase()} recorded for this day.`}
        </div>
      )}
    </ChartFrame>
  )
}

function HeartRateWidget({ date, enabled = true, compact, wide, onOpen }: ChartProps): React.JSX.Element {
  const intraday = useIntraday(date, enabled, 'heart')
  const def = METRICS.restingHeartRate
  const Icon = def.icon
  const height = compact ? 105 : 170
  return (
    <ChartFrame
      compact={compact}
      wide={wide}
      title="Heart rate"
      hint="Across the day"
      icon={<Icon size={18} weight="fill" color={def.color} />}
      onOpen={() => onOpen('restingHeartRate', 'D', date)}
    >
      {intraday.isError ? (
        <Retry onRetry={() => void intraday.refetch()} />
      ) : intraday.isPending ? (
        <SkeletonChart height={height} variant="intraday-line" />
      ) : intraday.data && intraday.data.heartRate.length > 1 ? (
        <IntradayLine points={intraday.data.heartRate} height={height} color={def.color} />
      ) : (
        <div className="dashboard-chart-empty" style={{ height }}>No heart-rate samples recorded for this day.</div>
      )}
    </ChartFrame>
  )
}

const STAGES = ['AWAKE', 'REM', 'LIGHT', 'DEEP'] as const
function SleepWidget({ date, enabled = true, compact, onSleep }: ChartProps): React.JSX.Element {
  const sleep = useSleepDay(date, enabled)
  const night = selectedSleepSession(sleep.data)
  const stageTotal = STAGES.reduce((total, stage) => total + (night?.stageMinutes[stage] ?? 0), 0)
  if (compact)
    return (
      <section className="menu-section menu-sleep">
        <button
          type="button"
          className="menu-section-title"
          onClick={onSleep}
          aria-label="Open sleep stage details"
        >
          <h2>Sleep stages</h2>
          <span>Main sleep ›</span>
        </button>
        {sleep.isError ? (
          <Retry onRetry={() => void sleep.refetch()} />
        ) : stageTotal > 0 ? (
          <>
            <div className="menu-stage-bar" aria-hidden>
              {STAGES.map((stage) => (
                <span
                  key={stage}
                  style={{ background: STAGE_COLOR[stage], flex: night?.stageMinutes[stage] ?? 0 }}
                />
              ))}
            </div>
            <div className="menu-stage-legend">
              {STAGES.map((stage) => (
                <div key={stage}>
                  <span>
                    <i style={{ background: STAGE_COLOR[stage] }} />
                    {STAGE_LABEL[stage]}
                  </span>
                  <strong>{formatMinutes(night?.stageMinutes[stage] ?? 0)}</strong>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="menu-muted">
            {sleep.isPending ? 'Loading sleep stages…' : 'Sleep stages unavailable'}
          </p>
        )}
      </section>
    )
  const hint = sleep.isPending
    ? <SkeletonText className="w-36" />
    : sleep.data
      ? `${formatMinutes(sleep.data.minutesAsleep)} ${!sleep.data.complete ? 'cached' : sleep.data.sessions.length > 1 ? `total · ${sleep.data.sessions.length} sessions · Main sleep shown` : `asleep${night ? ` · ${formatClock(night.startTime)}–${formatClock(night.endTime)}` : ''}`}`
      : 'No sleep recorded'
  return (
    <ChartFrame
      title="Sleep"
      hint={hint}
      icon={<Moon size={18} weight="fill" color="var(--color-sleep)" />}
      onOpen={onSleep}
    >
      {sleep.isError ? (
        <Retry onRetry={() => void sleep.refetch()} />
      ) : sleep.isPending ? (
        <SleepStages night={null} loading />
      ) : night ? (
        <SleepStages night={night} />
      ) : (
        <div className="dashboard-chart-empty">
          Wear your Fitbit Air to bed to see sleep stages.
        </div>
      )}
    </ChartFrame>
  )
}

function WorkoutsWidget({ date, onWorkouts, onWorkout }: ChartProps): React.JSX.Element {
  const workouts = useWorkouts(date, date)
  return (
    <DrillPanel
      label="Open workout details"
      onOpen={() => onWorkouts?.()}
      className="min-h-[126px]"
      contentClassName="flex min-h-[124px] flex-col gap-2 px-3 py-5"
    >
      <div className="px-2">
        <DrillHeader
          title="Workouts"
          hint={workouts.isPending ? <SkeletonText className="w-20" /> : `${workouts.data?.length ?? 0} session${workouts.data?.length === 1 ? '' : 's'}`}
          icon={<Barbell size={18} weight="fill" color="var(--color-recovery)" />}
        />
      </div>
      {workouts.isError ? (
        <div className="pointer-events-auto"><Retry onRetry={() => void workouts.refetch()} /></div>
      ) : workouts.isPending ? (
        <SkeletonRows />
      ) : workouts.data?.length ? (
        <div className="pointer-events-auto">
          <WorkoutList workouts={workouts.data} onOpen={onWorkout ?? (() => {})} />
        </div>
      ) : (
        <div className="grid min-h-[58px] flex-1 place-items-center text-[13px] text-ink-faint">
          Tracked exercises appear here automatically.
        </div>
      )}
    </DrillPanel>
  )
}
